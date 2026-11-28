import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'waha_marketing_super_secure_jwt_secret_key_2026'
);

export const AUTH_COOKIE_NAME = 'waha_auth_token';

// Middleware (Edge runtime, no database access) asks a Node route whether the user behind a
// valid JWT is still active. The route only answers callers that present this server secret.
export const SESSION_CHECK_PATH = '/api/auth/session-status';
export const SESSION_CHECK_HEADER = 'x-internal-session-check';

export function getSessionCheckKey(): string {
  return process.env.JWT_SECRET || 'waha_marketing_super_secure_jwt_secret_key_2026';
}

export interface AuthUserPayload {
  id: string;
  username: string;
  name: string;
  role: 'ADMIN' | 'OPERATOR';
}

export async function signAuthToken(payload: AuthUserPayload): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
}

export async function verifyAuthToken(token: string): Promise<AuthUserPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as AuthUserPayload;
  } catch {
    return null;
  }
}
