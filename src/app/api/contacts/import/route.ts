import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sanitizePhone, phoneToJid } from '@/lib/phone';
import { formatAccountDate } from '@/lib/date';
import { waha } from '@/lib/waha';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const defaultTag = (formData.get('tag') as string) || '';

    if (!file) {
      return NextResponse.json({ error: 'File tidak ditemukan' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'File Excel/CSV kosong' }, { status: 400 });
    }

    const results = {
      total: rows.length,
      success: 0,
      failed: 0,
      activeWA: 0,
      invalidNumber: 0,
      contacts: [] as any[],
    };

    for (const row of rows) {
      // 1. Phone / WhatsApp Number
      const rawPhone = String(
        row['Nomor Telepon/HP'] ||
        row['Nomor Telepon'] ||
        row['Nomor HP'] ||
        row['nomor_hp'] ||
        row['No HP'] ||
        row['no_hp'] ||
        row['Telepon'] ||
        row['telepon'] ||
        row['Phone'] ||
        row['phone'] ||
        row['WhatsApp'] ||
        row['whatsapp'] ||
        row['Nomor'] ||
        row['nomor'] ||
        ''
      ).trim();

      // 2. Owner Name (Nama Pemilik)
      const name = String(
        row['Nama Pemilik'] ||
        row['nama_pemilik'] ||
        row['Pemilik'] ||
        row['Owner'] ||
        row['Nama'] ||
        row['nama'] ||
        row['Name'] ||
        row['name'] ||
        ''
      ).trim();

      // 3. Store Name (Nama Toko)
      const storeName = String(
        row['Nama Toko'] ||
        row['nama_toko'] ||
        row['Toko'] ||
        row['toko'] ||
        row['Store Name'] ||
        row['Store'] ||
        row['Merchant'] ||
        ''
      ).trim();

      // 4. Business Category (Kategori Bisnis)
      const businessCategory = String(
        row['Kategori Bisnis'] ||
        row['kategori_bisnis'] ||
        row['Kategori'] ||
        row['kategori'] ||
        row['Category'] ||
        ''
      ).trim();

      // 5. Email
      const email = String(
        row['Email'] ||
        row['email'] ||
        row['E-mail'] ||
        ''
      ).trim();

      // 6. Account Creation Date (Tanggal Pembuatan Akun)
      const rawAccountCreatedAt =
        row['Tanggal pembuatan akun'] !== undefined
          ? row['Tanggal pembuatan akun']
          : row['Tanggal Pembuatan Akun'] !== undefined
          ? row['Tanggal Pembuatan Akun']
          : row['Tanggal Akun'] !== undefined
          ? row['Tanggal Akun']
          : row['tanggal_akun'] !== undefined
          ? row['tanggal_akun']
          : row['Tgl Akun'] !== undefined
          ? row['Tgl Akun']
          : row['Registered At'] !== undefined
          ? row['Registered At']
          : row['Created At'] !== undefined
          ? row['Created At']
          : '';

      const accountCreatedAt = formatAccountDate(rawAccountCreatedAt);

      // 7. Address (Alamat)
      const address = String(
        row['Alamat'] ||
        row['alamat'] ||
        row['Address'] ||
        row['address'] ||
        row['Kota'] ||
        row['City'] ||
        ''
      ).trim();

      const rowTag = String(
        row['Tag'] ||
        row['tag'] ||
        defaultTag ||
        (businessCategory ? `Merchant, ${businessCategory}` : 'Merchant Lapaq')
      ).trim();

      const notes = String(
        row['Catatan'] ||
        row['catatan'] ||
        row['Notes'] ||
        row['notes'] ||
        ''
      ).trim();

      const phone = sanitizePhone(rawPhone);

      if (!phone || phone.length < 8) {
        results.failed++;
        results.invalidNumber++;
        continue;
      }

      const jid = phoneToJid(phone);

      // Validate with WAHA (check-exists)
      let isWAUser = true;
      try {
        const check = await waha.checkNumberExists(phone);
        isWAUser = check.exists;
      } catch {
        isWAUser = true;
      }

      if (isWAUser) results.activeWA++;

      const saved = await prisma.contact.upsert({
        where: { jid },
        create: {
          phone,
          jid,
          name: name || storeName || phone,
          storeName: storeName || null,
          businessCategory: businessCategory || null,
          email: email || null,
          accountCreatedAt: accountCreatedAt || null,
          address: address || null,
          isWAUser,
          tags: rowTag || null,
          notes: notes || null,
        },
        update: {
          name: name || undefined,
          storeName: storeName || undefined,
          businessCategory: businessCategory || undefined,
          email: email || undefined,
          accountCreatedAt: accountCreatedAt || undefined,
          address: address || undefined,
          tags: rowTag || undefined,
          notes: notes || undefined,
          isWAUser,
        },
      });

      results.success++;
      results.contacts.push({
        name: saved.name,
        storeName: saved.storeName,
        businessCategory: saved.businessCategory,
        phone: saved.phone,
        isWAUser: saved.isWAUser,
      });
    }

    return NextResponse.json({
      message: `Berhasil mengimpor ${results.success} dari ${results.total} kontak`,
      summary: results,
    });
  } catch (err: any) {
    console.error('Import error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
