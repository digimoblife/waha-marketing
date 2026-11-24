import bcrypt from 'bcryptjs';
import { prisma } from './prisma';
export * from './auth-token';

export async function hashPassword(plain: string): Promise<string> {
  return await bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  return await bcrypt.compare(plain, hashed);
}

/**
 * Ensure at least 1 Admin user exists on start
 * Default user: admin / admin123
 */
export async function ensureDefaultAdmin() {
  try {
    const count = await prisma.user.count();
    if (count === 0) {
      const defaultPassword = await hashPassword('admin123');
      await prisma.user.create({
        data: {
          username: 'admin',
          password: defaultPassword,
          name: 'Super Admin',
          role: 'ADMIN',
          isActive: true,
        },
      });
      console.log('✅ Default admin created: username="admin", password="admin123"');
    }
  } catch (err) {
    console.error('Error ensuring default admin:', err);
  }
}
