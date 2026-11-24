import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  verifyPassword,
  signAuthToken,
  ensureDefaultAdmin,
  AUTH_COOKIE_NAME,
} from '@/lib/auth';
import { createLog } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    await ensureDefaultAdmin();

    const body = await req.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username dan password wajib diisi' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { username: username.trim().toLowerCase() },
    });

    if (!user) {
      await createLog('AUTH', 'ERROR', `Gagal login: User "${username}" tidak ditemukan`);
      return NextResponse.json(
        { error: 'Username atau password salah' },
        { status: 401 }
      );
    }

    if (!user.isActive) {
      await createLog('AUTH', 'ERROR', `Gagal login: Akun "${username}" dinonaktifkan`);
      return NextResponse.json(
        { error: 'Akun Anda telah dinonaktifkan oleh administrator' },
        { status: 403 }
      );
    }

    const isMatch = await verifyPassword(password, user.password);
    if (!isMatch) {
      await createLog('AUTH', 'ERROR', `Gagal login: Password salah untuk user "${username}"`);
      return NextResponse.json(
        { error: 'Username atau password salah' },
        { status: 401 }
      );
    }

    const token = await signAuthToken({
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role as 'ADMIN' | 'OPERATOR',
    });

    await createLog('AUTH', 'SUCCESS', `User "${user.name}" (${user.username}) berhasil login`);

    const res = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
      },
    });

    // Set secure HTTP-only cookie
    res.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return res;
  } catch (err: any) {
    console.error('Login error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
