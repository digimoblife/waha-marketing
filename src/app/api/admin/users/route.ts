import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';
import { createLog } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// GET: List all users
export async function GET() {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ users });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: Create a new user (Admin or Operator)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password, name, role = 'OPERATOR' } = body;

    if (!username || !password || !name) {
      return NextResponse.json(
        { error: 'Username, password, dan nama lengkap wajib diisi' },
        { status: 400 }
      );
    }

    const cleanUsername = username.trim().toLowerCase();
    const existing = await prisma.user.findUnique({
      where: { username: cleanUsername },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Username "${cleanUsername}" sudah digunakan` },
        { status: 400 }
      );
    }

    const hashedPassword = await hashPassword(password);
    const userRole = role === 'ADMIN' ? 'ADMIN' : 'OPERATOR';

    const newUser = await prisma.user.create({
      data: {
        username: cleanUsername,
        password: hashedPassword,
        name: name.trim(),
        role: userRole,
        isActive: true,
      },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    await createLog(
      'AUTH',
      'SUCCESS',
      `User baru "${newUser.name}" (${newUser.username}) dengan role ${newUser.role} berhasil dibuat`
    );

    return NextResponse.json({ user: newUser });
  } catch (err: any) {
    console.error('Create user error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
