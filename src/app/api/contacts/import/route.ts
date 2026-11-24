import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sanitizePhone, phoneToJid } from '@/lib/phone';
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
      // Look for phone column with multiple common headers
      const rawPhone = String(
        row['Nomor HP'] ||
        row['nomor_hp'] ||
        row['Nomor'] ||
        row['nomor'] ||
        row['Phone'] ||
        row['phone'] ||
        row['WhatsApp'] ||
        row['whatsapp'] ||
        row['No HP'] ||
        row['no_hp'] ||
        row['Telepon'] ||
        row['telepon'] ||
        ''
      ).trim();

      const name = String(
        row['Nama'] ||
        row['nama'] ||
        row['Name'] ||
        row['name'] ||
        row['Contact Name'] ||
        ''
      ).trim();

      const rowTag = String(
        row['Tag'] ||
        row['tag'] ||
        row['Kategori'] ||
        row['kategori'] ||
        defaultTag ||
        ''
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
        // If WAHA is not reachable, assume true so data is not lost
        isWAUser = true;
      }

      if (isWAUser) results.activeWA++;

      const saved = await prisma.contact.upsert({
        where: { jid },
        create: {
          phone,
          jid,
          name: name || phone,
          isWAUser,
          tags: rowTag || null,
          notes: notes || null,
        },
        update: {
          name: name || undefined,
          tags: rowTag || undefined,
          notes: notes || undefined,
          isWAUser,
        },
      });

      results.success++;
      results.contacts.push({
        name: saved.name,
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
