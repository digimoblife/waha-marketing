import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

// Matches nginx client_max_body_size.
const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;

// Allowlist of attachment types that WhatsApp can deliver. Script-capable formats
// (SVG, HTML, XML, JS) are rejected because uploads are served from this origin.
const ALLOWED_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic',
  '.mp4', '.m4v', '.mov', '.webm',
  '.mp3', '.m4a', '.aac', '.ogg', '.opus', '.wav',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv', '.txt', '.zip',
]);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Tidak ada file yang diunggah' }, { status: 400 });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'Ukuran file maksimal 64 MB' }, { status: 413 });
    }

    const originalExt = path.extname(file.name).toLowerCase();
    const isBlockedMime = /svg|html|xml|javascript/i.test(file.type || '');
    if ((originalExt && !ALLOWED_EXTENSIONS.has(originalExt)) || isBlockedMime) {
      return NextResponse.json(
        { error: 'Tipe file tidak didukung. Gunakan gambar, video, audio, PDF, atau dokumen Office.' },
        { status: 415 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Determine media type
    const mime = file.type || '';
    let mediaType: 'image' | 'video' | 'audio' | 'document' = 'document';
    if (mime.startsWith('image/')) {
      mediaType = 'image';
    } else if (mime.startsWith('video/')) {
      mediaType = 'video';
    } else if (mime.startsWith('audio/')) {
      mediaType = 'audio';
    }

    // Generate safe filename with timestamp
    const ext = originalExt || (mediaType === 'image' ? '.jpg' : mediaType === 'video' ? '.mp4' : '');
    const safeBase = path.basename(file.name, path.extname(file.name)).replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueFilename = `${Date.now()}_${safeBase}${ext}`;

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    await fs.mkdir(uploadsDir, { recursive: true });

    const filePath = path.join(uploadsDir, uniqueFilename);
    await fs.writeFile(filePath, buffer);

    const relativeUrl = `/uploads/${uniqueFilename}`;
    // Docker container can reach web container via APP_DOCKER_URL or public URL or host.docker.internal
    const port = process.env.PORT || '3050';
    const baseUrl =
      process.env.APP_DOCKER_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      `http://host.docker.internal:${port}`;
    const dockerUrl = `${baseUrl.replace(/\/$/, '')}${relativeUrl}`;

    return NextResponse.json({
      url: relativeUrl,
      dockerUrl,
      fileName: file.name,
      mediaType,
      mimeType: mime,
      size: file.size,
    });
  } catch (err: any) {
    console.error('Upload error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
