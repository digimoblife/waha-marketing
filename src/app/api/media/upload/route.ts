import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Tidak ada file yang diunggah' }, { status: 400 });
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
    const ext = path.extname(file.name) || (mediaType === 'image' ? '.jpg' : mediaType === 'video' ? '.mp4' : '');
    const safeBase = path.basename(file.name, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
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
