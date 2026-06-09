import { OAuthClient, AuthorizationCode, AccessToken, RefreshToken } from './types';

export class OAuthClientStore {
  private clients = new Map<string, OAuthClient>();

  register(client: OAuthClient): OAuthClient {
    this.clients.set(client.clientId, client);
    return client;
  }

  findById(clientId: string): OAuthClient | undefined {
    return this.clients.get(clientId);
  }

  validateSecret(clientId: string, secret: string): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;
    if (!client.clientSecret) return true;
    return client.clientSecret === secret;
  }
}

export class AuthorizationCodeStore {
  private codes = new Map<string, AuthorizationCode>();

  save(code: AuthorizationCode): AuthorizationCode {
    this.codes.set(code.code, code);
    return code;
  }

  findAndConsume(code: string): AuthorizationCode | undefined {
    const record = this.codes.get(code);
    if (!record) return undefined;
    if (record.used) return undefined;
    if (Date.now() > record.expiresAt) return undefined;
    record.used = true;
    return record;
  }

  revoke(code: string): void {
    this.codes.delete(code);
  }
}

export class TokenStore {
  private accessTokens = new Map<string, AccessToken>();
  private refreshTokens = new Map<string, RefreshToken>();

  saveAccess(token: AccessToken): AccessToken {
    this.accessTokens.set(token.token, token);
    return token;
  }

  findAccess(token: string): AccessToken | undefined {
    const record = this.accessTokens.get(token);
    if (!record) return undefined;
    if (record.revoked) return undefined;
    if (Date.now() > record.expiresAt) return undefined;
    return record;
  }

  revokeAccess(token: string): void {
    const record = this.accessTokens.get(token);
    if (record) record.revoked = true;
  }

  saveRefresh(token: RefreshToken): RefreshToken {
    this.refreshTokens.set(token.token, token);
    return token;
  }

  findRefresh(token: string): RefreshToken | undefined {
    const record = this.refreshTokens.get(token);
    if (!record) return undefined;
    if (record.revoked) return undefined;
    if (Date.now() > record.expiresAt) return undefined;
    return record;
  }

  revokeRefresh(token: string): void {
    const record = this.refreshTokens.get(token);
    if (record) record.revoked = true;
  }

  revokeAllForUser(userId: string): void {
    for (const t of this.accessTokens.values()) {
      if (t.userId === userId) t.revoked = true;
    }
    for (const t of this.refreshTokens.values()) {
      if (t.userId === userId) t.revoked = true;
    }
  }
}
