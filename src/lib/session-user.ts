import type { NextRequest } from 'next/server';
import { verifyAuthToken, AUTH_COOKIE_NAME, type AuthUserPayload } from './auth-token';

export async function getRequestUser(req: NextRequest): Promise<AuthUserPayload | null> {
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  return await verifyAuthToken(token);
}
