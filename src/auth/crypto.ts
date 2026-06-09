import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { TokenPayload } from './types';

export function getSigningSecret(): string {
  return process.env.VHS_IRC_AUTH_SECRET || 'vhs-irc-dev-secret-change-in-production';
}

export function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64url').replace(/=+$/, '');
}

export function base64UrlDecode(str: string): Buffer {
  const padding = '='.repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(str + padding, 'base64url');
}

export function generateId(length = 32): string {
  return base64UrlEncode(randomBytes(length));
}

export function signPayload(payload: string, secret = getSigningSecret()): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createToken(payload: TokenPayload, secret = getSigningSecret()): string {
  const header = JSON.stringify({ alg: 'HS256', typ: 'VHS' });
  const body = JSON.stringify(payload);
  const encodedHeader = base64UrlEncode(Buffer.from(header));
  const encodedBody = base64UrlEncode(Buffer.from(body));
  const signature = signPayload(`${encodedHeader}.${encodedBody}`, secret);
  return `${encodedHeader}.${encodedBody}.${signature}`;
}

export function verifyToken(token: string, secret = getSigningSecret()): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedBody, signature] = parts;
  const expected = signPayload(`${encodedHeader}.${encodedBody}`, secret);

  try {
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const bodyJson = base64UrlDecode(encodedBody).toString('utf8');
    const payload = JSON.parse(bodyJson) as TokenPayload;
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function generateCodeChallenge(verifier: string): string {
  return createHmac('sha256', verifier).digest('base64url').replace(/=+$/, '');
}
