import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, verifyAuthToken, AUTH_COOKIE_NAME } from '@/lib/auth';
import { createLog } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await req.json();
    const { name, role, isActive, password } = body;

    const data: any = {};
    if (name) data.name = name.trim();
    if (role && (role === 'ADMIN' || role === 'OPERATOR')) data.role = role;
    if (typeof isActive === 'boolean') data.isActive = isActive;
    if (password) {
      data.password = await hashPassword(password);
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        isActive: true,
        updatedAt: true,
      },
    });

    await createLog('AUTH', 'SUCCESS', `User "${updatedUser.username}" berhasil diperbarui`);

    return NextResponse.json({ user: updatedUser });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // Check currently logged in user to prevent self-deletion
    const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
    if (token) {
      const current = await verifyAuthToken(token);
      if (current && current.id === id) {
        return NextResponse.json(
          { error: 'Anda tidak dapat menghapus akun Anda sendiri saat sedang login' },
          { status: 400 }
        );
      }
    }

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 });
    }

    // Prevent deleting the last admin
    if (targetUser.role === 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: 'Tidak dapat menghapus satu-satunya administrator' },
          { status: 400 }
        );
      }
    }

    await prisma.user.delete({ where: { id } });
    await createLog('AUTH', 'SUCCESS', `User "${targetUser.username}" berhasil dihapus`);

    return NextResponse.json({ ok: true, message: 'User berhasil dihapus' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
