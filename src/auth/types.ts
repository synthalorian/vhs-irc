export interface OAuthClient {
  clientId: string;
  clientSecret?: string;
  redirectUris: string[];
  allowedGrants: GrantType[];
  name: string;
}

export type GrantType = 'authorization_code' | 'refresh_token' | 'password';

export interface AuthorizationCode {
  code: string;
  clientId: string;
  redirectUri: string;
  userId: string;
  scope: string;
  codeChallenge?: string;
  codeChallengeMethod?: 'S256';
  expiresAt: number;
  used: boolean;
}

export interface AccessToken {
  token: string;
  type: 'access_token';
  clientId: string;
  userId: string;
  scope: string;
  expiresAt: number;
  revoked: boolean;
}

export interface RefreshToken {
  token: string;
  type: 'refresh_token';
  clientId: string;
  userId: string;
  scope: string;
  expiresAt: number;
  revoked: boolean;
}

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

export interface TokenPayload {
  sub: string;
  clientId: string;
  scope: string;
  iat: number;
  exp: number;
  jti: string;
  type: 'access' | 'refresh';
}

export interface AuthUser {
  userId: string;
  nick?: string;
  scope: string;
}
