import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { OAuth2Provider, OAuthError, createToken, verifyToken, generateCodeChallenge, generateId, getSigningSecret } from '../src/auth';
import type { TokenPayload } from '../src/auth';

describe('Auth Crypto', () => {
  it('generates unique ids', () => {
    const a = generateId();
    const b = generateId();
    assert.notStrictEqual(a, b);
    assert.strictEqual(a.length > 0, true);
  });

  it('creates and verifies tokens', () => {
    const payload: TokenPayload = {
      sub: 'user-1',
      clientId: 'client-1',
      scope: 'default',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      jti: generateId(),
      type: 'access',
    };
    const token = createToken(payload);
    const verified = verifyToken(token);
    assert.ok(verified);
    assert.strictEqual(verified!.sub, 'user-1');
    assert.strictEqual(verified!.clientId, 'client-1');
    assert.strictEqual(verified!.type, 'access');
  });

  it('rejects tampered tokens', () => {
    const payload: TokenPayload = {
      sub: 'user-1',
      clientId: 'client-1',
      scope: 'default',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      jti: generateId(),
      type: 'access',
    };
    const token = createToken(payload);
    const tampered = token.slice(0, -4) + 'XXXX';
    assert.strictEqual(verifyToken(tampered), null);
  });

  it('rejects expired tokens', () => {
    const payload: TokenPayload = {
      sub: 'user-1',
      clientId: 'client-1',
      scope: 'default',
      iat: Math.floor(Date.now() / 1000) - 7200,
      exp: Math.floor(Date.now() / 1000) - 3600,
      jti: generateId(),
      type: 'access',
    };
    const token = createToken(payload);
    assert.strictEqual(verifyToken(token), null);
  });

  it('verifies tokens with custom secret', () => {
    const payload: TokenPayload = {
      sub: 'user-1',
      clientId: 'client-1',
      scope: 'default',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      jti: generateId(),
      type: 'access',
    };
    const token = createToken(payload, 'custom-secret');
    assert.ok(verifyToken(token, 'custom-secret'));
    assert.strictEqual(verifyToken(token, 'wrong-secret'), null);
  });

  it('generates deterministic code challenges', () => {
    const v = generateId();
    assert.strictEqual(generateCodeChallenge(v), generateCodeChallenge(v));
    assert.notStrictEqual(generateCodeChallenge(v), generateCodeChallenge(v + 'x'));
  });

  it('reads secret from env or fallback', () => {
    const original = process.env.VHS_IRC_AUTH_SECRET;
    delete process.env.VHS_IRC_AUTH_SECRET;
    assert.ok(getSigningSecret().includes('vhs-irc-dev-secret'));
    process.env.VHS_IRC_AUTH_SECRET = 'test-secret';
    assert.strictEqual(getSigningSecret(), 'test-secret');
    if (original !== undefined) {
      process.env.VHS_IRC_AUTH_SECRET = original;
    } else {
      delete process.env.VHS_IRC_AUTH_SECRET;
    }
  });
});

describe('OAuth2Provider', () => {
  let provider: OAuth2Provider;

  beforeEach(() => {
    provider = new OAuth2Provider({
      accessTokenTtlSeconds: 60,
      refreshTokenTtlSeconds: 120,
      authCodeTtlSeconds: 30,
    });

    provider.setCredentialVerifier({
      async verify(username: string, password: string) {
        if (username === 'alice' && password === 'secret') {
          return { userId: '42', nick: 'alice' };
        }
        return null;
      },
    });

    provider.registerClient({
      clientId: 'web',
      name: 'Web Client',
      redirectUris: ['http://localhost:3000/callback'],
      allowedGrants: ['authorization_code', 'refresh_token', 'password'],
      clientSecret: 'web-secret',
    });
  });

  describe('client registration', () => {
    it('returns registered client', () => {
      const client = provider.getClient('web');
      assert.ok(client);
      assert.strictEqual(client!.name, 'Web Client');
    });

    it('returns undefined for unknown client', () => {
      assert.strictEqual(provider.getClient('nope'), undefined);
    });
  });

  describe('password grant', () => {
    it('issues tokens for valid credentials', async () => {
      const response = await provider.token({
        grant_type: 'password',
        client_id: 'web',
        client_secret: 'web-secret',
        username: 'alice',
        password: 'secret',
      });

      assert.ok(response.access_token);
      assert.strictEqual(response.token_type, 'Bearer');
      assert.strictEqual(response.expires_in, 60);
      assert.ok(response.refresh_token);
      assert.strictEqual(response.scope, 'default');
    });

    it('rejects invalid credentials', async () => {
      await assert.rejects(
        provider.token({
          grant_type: 'password',
          client_id: 'web',
          client_secret: 'web-secret',
          username: 'alice',
          password: 'wrong',
        }),
        (err: Error) => err instanceof OAuthError && err.code === 'invalid_grant'
      );
    });

    it('rejects missing verifier', async () => {
      const p = new OAuth2Provider();
      p.registerClient({
        clientId: 'web',
        name: 'Web Client',
        redirectUris: ['http://localhost:3000/callback'],
        allowedGrants: ['password'],
      });

      await assert.rejects(
        p.token({
          grant_type: 'password',
          client_id: 'web',
          username: 'alice',
          password: 'secret',
        }),
        (err: Error) => err instanceof OAuthError && err.code === 'unsupported_grant_type'
      );
    });
  });

  describe('authorization code grant with PKCE', () => {
    it('exchanges code for tokens', async () => {
      const verifier = generateId();
      const challenge = generateCodeChallenge(verifier);

      const authorizeResult = provider.authorize(
        {
          response_type: 'code',
          client_id: 'web',
          redirect_uri: 'http://localhost:3000/callback',
          code_challenge: challenge,
          code_challenge_method: 'S256',
          state: 'xyz',
        },
        '42'
      );

      assert.strictEqual(authorizeResult.redirectUri, 'http://localhost:3000/callback');
      assert.strictEqual(authorizeResult.state, 'xyz');
      assert.ok(authorizeResult.code);

      const response = await provider.token({
        grant_type: 'authorization_code',
        client_id: 'web',
        client_secret: 'web-secret',
        code: authorizeResult.code,
        redirect_uri: 'http://localhost:3000/callback',
        code_verifier: verifier,
      });

      assert.ok(response.access_token);
      assert.ok(response.refresh_token);
    });

    it('rejects reused codes', async () => {
      const authorizeResult = provider.authorize(
        {
          response_type: 'code',
          client_id: 'web',
          redirect_uri: 'http://localhost:3000/callback',
        },
        '42'
      );

      await provider.token({
        grant_type: 'authorization_code',
        client_id: 'web',
        client_secret: 'web-secret',
        code: authorizeResult.code,
        redirect_uri: 'http://localhost:3000/callback',
      });

      await assert.rejects(
        provider.token({
          grant_type: 'authorization_code',
          client_id: 'web',
          client_secret: 'web-secret',
          code: authorizeResult.code,
          redirect_uri: 'http://localhost:3000/callback',
        }),
        (err: Error) => err instanceof OAuthError && err.code === 'invalid_grant'
      );
    });

    it('rejects mismatched PKCE verifier', async () => {
      const challenge = generateCodeChallenge(generateId());

      const authorizeResult = provider.authorize(
        {
          response_type: 'code',
          client_id: 'web',
          redirect_uri: 'http://localhost:3000/callback',
          code_challenge: challenge,
          code_challenge_method: 'S256',
        },
        '42'
      );

      await assert.rejects(
        provider.token({
          grant_type: 'authorization_code',
          client_id: 'web',
          client_secret: 'web-secret',
          code: authorizeResult.code,
          redirect_uri: 'http://localhost:3000/callback',
          code_verifier: generateId(),
        }),
        (err: Error) => err instanceof OAuthError && err.code === 'invalid_grant'
      );
    });

    it('rejects unknown clients at authorize', () => {
      assert.throws(
        () =>
          provider.authorize(
            {
              response_type: 'code',
              client_id: 'unknown',
              redirect_uri: 'http://localhost:3000/callback',
            },
            '42'
          ),
        (err: Error) => err instanceof OAuthError && err.code === 'invalid_client'
      );
    });

    it('rejects unsupported response types', () => {
      assert.throws(
        () =>
          provider.authorize(
            {
              response_type: 'token',
              client_id: 'web',
              redirect_uri: 'http://localhost:3000/callback',
            },
            '42'
          ),
        (err: Error) => err instanceof OAuthError && err.code === 'unsupported_response_type'
      );
    });

    it('rejects mismatched redirect_uri', () => {
      assert.throws(
        () =>
          provider.authorize(
            {
              response_type: 'code',
              client_id: 'web',
              redirect_uri: 'http://evil.com/callback',
            },
            '42'
          ),
        (err: Error) => err instanceof OAuthError && err.code === 'invalid_request'
      );
    });
  });

  describe('refresh token grant', () => {
    it('issues new access token from refresh token', async () => {
      const first = await provider.token({
        grant_type: 'password',
        client_id: 'web',
        client_secret: 'web-secret',
        username: 'alice',
        password: 'secret',
      });

      const refreshed = await provider.token({
        grant_type: 'refresh_token',
        client_id: 'web',
        client_secret: 'web-secret',
        refresh_token: first.refresh_token,
      });

      assert.ok(refreshed.access_token);
      assert.notStrictEqual(refreshed.access_token, first.access_token);
    });

    it('rejects invalid refresh tokens', async () => {
      await assert.rejects(
        provider.token({
          grant_type: 'refresh_token',
          client_id: 'web',
          client_secret: 'web-secret',
          refresh_token: 'not-a-token',
        }),
        (err: Error) => err instanceof OAuthError && err.code === 'invalid_grant'
      );
    });

    it('rejects refresh token from different client', async () => {
      provider.registerClient({
        clientId: 'other',
        name: 'Other Client',
        redirectUris: ['http://localhost:3000/callback'],
        allowedGrants: ['password'],
        clientSecret: 'other-secret',
      });

      const first = await provider.token({
        grant_type: 'password',
        client_id: 'web',
        client_secret: 'web-secret',
        username: 'alice',
        password: 'secret',
      });

      await assert.rejects(
        provider.token({
          grant_type: 'refresh_token',
          client_id: 'other',
          client_secret: 'other-secret',
          refresh_token: first.refresh_token,
        }),
        (err: Error) => err instanceof OAuthError && err.code === 'invalid_grant'
      );
    });
  });

  describe('revocation and introspection', () => {
    it('revokes access tokens', async () => {
      const response = await provider.token({
        grant_type: 'password',
        client_id: 'web',
        client_secret: 'web-secret',
        username: 'alice',
        password: 'secret',
      });

      let info = provider.introspect(response.access_token);
      assert.strictEqual(info.active, true);

      provider.revoke(response.access_token);
      info = provider.introspect(response.access_token);
      assert.strictEqual(info.active, false);
    });

    it('revokes refresh tokens', async () => {
      const response = await provider.token({
        grant_type: 'password',
        client_id: 'web',
        client_secret: 'web-secret',
        username: 'alice',
        password: 'secret',
      });

      provider.revoke(response.refresh_token!);

      await assert.rejects(
        provider.token({
          grant_type: 'refresh_token',
          client_id: 'web',
          client_secret: 'web-secret',
          refresh_token: response.refresh_token,
        }),
        (err: Error) => err instanceof OAuthError && err.code === 'invalid_grant'
      );
    });

    it('returns inactive for malformed tokens', () => {
      const info = provider.introspect('nope');
      assert.strictEqual(info.active, false);
    });
  });

  describe('lookupAccessToken', () => {
    it('returns stored token metadata', async () => {
      const response = await provider.token({
        grant_type: 'password',
        client_id: 'web',
        client_secret: 'web-secret',
        username: 'alice',
        password: 'secret',
      });

      const record = provider.lookupAccessToken(response.access_token);
      assert.ok(record);
      assert.strictEqual(record!.userId, '42');
      assert.strictEqual(record!.clientId, 'web');

      provider.revoke(response.access_token);
      assert.strictEqual(provider.lookupAccessToken(response.access_token), undefined);
    });
  });
});

describe('OAuth Error', () => {
  it('exposes code and status', () => {
    const err = new OAuthError('invalid_request', 'Bad request', 400);
    assert.strictEqual(err.code, 'invalid_request');
    assert.strictEqual(err.statusCode, 400);
    assert.strictEqual(err.message, 'Bad request');
  });
});
