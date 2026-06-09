import { Request, Response, NextFunction } from 'express';
import { IncomingHttpHeaders } from 'http';
import { OAuth2Provider, OAuthError } from './provider';
import { AuthUser } from './types';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthUser;
    }
  }
}

export function parseBearerToken(headers: IncomingHttpHeaders): string | undefined {
  const auth = headers.authorization;
  if (!auth) return undefined;
  const parts = auth.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return undefined;
  return parts[1];
}

export function parseBearerTokenFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url, 'http://localhost');
    return parsed.searchParams.get('access_token') || undefined;
  } catch {
    return undefined;
  }
}

export function createAuthMiddleware(provider: OAuth2Provider, options: { optional?: boolean } = {}) {
  return async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    const token = parseBearerToken(req.headers) || parseBearerTokenFromUrl(req.url);

    if (!token) {
      if (options.optional) {
        next();
        return;
      }
      res.status(401).json({ error: 'invalid_token', error_description: 'Missing Bearer token' });
      return;
    }

    const record = provider.lookupAccessToken(token);
    if (!record) {
      if (options.optional) {
        next();
        return;
      }
      res.status(401).json({ error: 'invalid_token', error_description: 'Invalid or expired token' });
      return;
    }

    req.auth = {
      userId: record.userId,
      scope: record.scope,
    };

    next();
  };
}

export function handleOAuthError(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof OAuthError) {
    res.status(err.statusCode).json({ error: err.code, error_description: err.message });
    return;
  }
  res.status(500).json({ error: 'server_error', error_description: err.message || 'Internal server error' });
}
