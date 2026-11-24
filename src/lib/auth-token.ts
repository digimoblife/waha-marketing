import { SignJWT, jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'waha_marketing_super_secure_jwt_secret_key_2026'
);

export const AUTH_COOKIE_NAME = 'waha_auth_token';

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
