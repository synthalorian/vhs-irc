import {
  OAuthClient,
  GrantType,
  AuthorizationCode,
  AccessToken,
  RefreshToken,
  TokenResponse,
} from './types';
import { OAuthClientStore, AuthorizationCodeStore, TokenStore } from './store';
import { createToken, verifyToken, generateId, generateCodeChallenge } from './crypto';

export interface OAuthProviderOptions {
  accessTokenTtlSeconds?: number;
  refreshTokenTtlSeconds?: number;
  authCodeTtlSeconds?: number;
}

export interface AuthorizeRequest {
  response_type: string;
  client_id: string;
  redirect_uri: string;
  scope?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
}

export interface TokenRequest {
  grant_type: string;
  code?: string;
  redirect_uri?: string;
  client_id?: string;
  client_secret?: string;
  refresh_token?: string;
  username?: string;
  password?: string;
  code_verifier?: string;
  scope?: string;
}

export interface UserCredentialVerifier {
  verify(username: string, password: string): Promise<{ userId: string; nick?: string } | null>;
}

export class OAuth2Provider {
  private clients = new OAuthClientStore();
  private codes = new AuthorizationCodeStore();
  private tokens = new TokenStore();

  private accessTtl: number;
  private refreshTtl: number;
  private codeTtl: number;
  private verifier?: UserCredentialVerifier;

  constructor(options: OAuthProviderOptions = {}) {
    this.accessTtl = options.accessTokenTtlSeconds || 900;
    this.refreshTtl = options.refreshTokenTtlSeconds || 604800;
    this.codeTtl = options.authCodeTtlSeconds || 600;
  }

  setCredentialVerifier(verifier: UserCredentialVerifier): void {
    this.verifier = verifier;
  }

  registerClient(client: OAuthClient): OAuthClient {
    return this.clients.register(client);
  }

  getClient(clientId: string): OAuthClient | undefined {
    return this.clients.findById(clientId);
  }

  authorize(input: AuthorizeRequest, userId: string): { code: string; redirectUri: string; state?: string } {
    if (input.response_type !== 'code') {
      throw new OAuthError('unsupported_response_type', 'Only response_type=code is supported');
    }

    const client = this.clients.findById(input.client_id);
    if (!client) {
      throw new OAuthError('invalid_client', 'Unknown client_id');
    }

    if (!client.redirectUris.includes(input.redirect_uri)) {
      throw new OAuthError('invalid_request', 'redirect_uri not registered for client');
    }

    const code = generateId(24);
    const authCode: AuthorizationCode = {
      code,
      clientId: client.clientId,
      redirectUri: input.redirect_uri,
      userId,
      scope: input.scope || 'default',
      codeChallenge: input.code_challenge,
      codeChallengeMethod: input.code_challenge_method === 'S256' ? 'S256' : undefined,
      expiresAt: Date.now() + this.codeTtl * 1000,
      used: false,
    };

    this.codes.save(authCode);
    return { code, redirectUri: input.redirect_uri, state: input.state };
  }

  async token(input: TokenRequest): Promise<TokenResponse> {
    const client = this.authenticateClient(input);

    switch (input.grant_type) {
      case 'authorization_code':
        return this.exchangeAuthorizationCode(client, input);
      case 'refresh_token':
        return this.exchangeRefreshToken(client, input);
      case 'password':
        return this.exchangePassword(client, input);
      default:
        throw new OAuthError('unsupported_grant_type', `Grant type ${input.grant_type} is not supported`);
    }
  }

  revoke(token: string): void {
    const payload = verifyToken(token);
    if (!payload) return;

    if (payload.type === 'access') {
      this.tokens.revokeAccess(token);
    } else if (payload.type === 'refresh') {
      this.tokens.revokeRefresh(token);
    }
  }

  introspect(token: string): { active: boolean; sub?: string; client_id?: string; scope?: string; exp?: number } {
    const payload = verifyToken(token);
    if (!payload) return { active: false };

    if (payload.type === 'access') {
      const record = this.tokens.findAccess(token);
      if (!record || record.revoked) return { active: false };
    } else if (payload.type === 'refresh') {
      const record = this.tokens.findRefresh(token);
      if (!record || record.revoked) return { active: false };
    } else {
      return { active: false };
    }

    return {
      active: true,
      sub: payload.sub,
      client_id: payload.clientId,
      scope: payload.scope,
      exp: payload.exp,
    };
  }

  lookupAccessToken(token: string): AccessToken | undefined {
    return this.tokens.findAccess(token);
  }

  private authenticateClient(input: TokenRequest): OAuthClient {
    const clientId = input.client_id;
    if (!clientId) {
      throw new OAuthError('invalid_client', 'client_id is required');
    }

    const client = this.clients.findById(clientId);
    if (!client) {
      throw new OAuthError('invalid_client', 'Unknown client');
    }

    if (client.clientSecret && client.clientSecret !== (input.client_secret || '')) {
      throw new OAuthError('invalid_client', 'Invalid client_secret');
    }

    return client;
  }

  private exchangeAuthorizationCode(client: OAuthClient, input: TokenRequest): TokenResponse {
    if (!input.code || !input.redirect_uri) {
      throw new OAuthError('invalid_request', 'code and redirect_uri are required');
    }

    const authCode = this.codes.findAndConsume(input.code);
    if (!authCode) {
      throw new OAuthError('invalid_grant', 'Invalid or expired authorization code');
    }

    if (authCode.clientId !== client.clientId || authCode.redirectUri !== input.redirect_uri) {
      throw new OAuthError('invalid_grant', 'Authorization code mismatch');
    }

    if (authCode.codeChallenge && authCode.codeChallengeMethod === 'S256') {
      if (!input.code_verifier) {
        throw new OAuthError('invalid_request', 'code_verifier is required');
      }
      const challenge = generateCodeChallenge(input.code_verifier);
      if (challenge !== authCode.codeChallenge) {
        throw new OAuthError('invalid_grant', 'PKCE verification failed');
      }
    }

    return this.issueTokenPair(client.clientId, authCode.userId, authCode.scope);
  }

  private exchangeRefreshToken(client: OAuthClient, input: TokenRequest): TokenResponse {
    if (!input.refresh_token) {
      throw new OAuthError('invalid_request', 'refresh_token is required');
    }

    const payload = verifyToken(input.refresh_token);
    if (!payload || payload.type !== 'refresh' || payload.clientId !== client.clientId) {
      throw new OAuthError('invalid_grant', 'Invalid refresh token');
    }

    const record = this.tokens.findRefresh(input.refresh_token);
    if (!record) {
      throw new OAuthError('invalid_grant', 'Refresh token revoked or expired');
    }

    this.tokens.revokeRefresh(input.refresh_token);
    return this.issueTokenPair(client.clientId, record.userId, input.scope || record.scope);
  }

  private async exchangePassword(client: OAuthClient, input: TokenRequest): Promise<TokenResponse> {
    if (!input.username || !input.password) {
      throw new OAuthError('invalid_request', 'username and password are required');
    }

    if (!this.verifier) {
      throw new OAuthError('unsupported_grant_type', 'Password grant is not configured');
    }

    const user = await this.verifier.verify(input.username, input.password);
    if (!user) {
      throw new OAuthError('invalid_grant', 'Invalid credentials');
    }

    return this.issueTokenPair(client.clientId, user.userId, input.scope || 'default');
  }

  private issueTokenPair(clientId: string, userId: string, scope: string): TokenResponse {
    const now = Math.floor(Date.now() / 1000);
    const accessJti = generateId(16);
    const refreshJti = generateId(16);

    const accessPayload = {
      sub: userId,
      clientId,
      scope,
      iat: now,
      exp: now + this.accessTtl,
      jti: accessJti,
      type: 'access' as const,
    };

    const refreshPayload = {
      sub: userId,
      clientId,
      scope,
      iat: now,
      exp: now + this.refreshTtl,
      jti: refreshJti,
      type: 'refresh' as const,
    };

    const accessToken = createToken(accessPayload);
    const refreshToken = createToken(refreshPayload);

    this.tokens.saveAccess({
      token: accessToken,
      type: 'access_token',
      clientId,
      userId,
      scope,
      expiresAt: (now + this.accessTtl) * 1000,
      revoked: false,
    });

    this.tokens.saveRefresh({
      token: refreshToken,
      type: 'refresh_token',
      clientId,
      userId,
      scope,
      expiresAt: (now + this.refreshTtl) * 1000,
      revoked: false,
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: this.accessTtl,
      refresh_token: refreshToken,
      scope,
    };
  }
}

export class OAuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'OAuthError';
  }
}
