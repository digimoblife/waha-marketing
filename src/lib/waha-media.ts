import fs from 'fs/promises';
import path from 'path';

const WAHA_URL =
  process.env.WAHA_API_URL ||
  process.env.WAHA_BASE_URL ||
  process.env.WAHA_URL ||
  'http://localhost:3008';
const WAHA_KEY = process.env.WAHA_API_KEY || 'waha_marketing_secret_key';

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.avi', '.mkv']);
const AUDIO_EXTS = new Set(['.mp3', '.ogg', '.opus', '.wav', '.m4a']);

export function detectMediaType(
  data: any,
  mediaUrl?: string | null,
  fileName?: string | null
): string {
  const explicitType = data?.type;
  if (
    explicitType === 'image' ||
    explicitType === 'video' ||
    explicitType === 'audio' ||
    explicitType === 'document'
  ) {
    return explicitType;
  }

  const msgObj = data?._data?.message || {};
  if (msgObj.imageMessage) return 'image';
  if (msgObj.videoMessage) return 'video';
  if (msgObj.audioMessage) return 'audio';

  const mime = (
    data?.media?.mimetype ||
    data?._data?.mimetype ||
    msgObj.documentMessage?.mimetype ||
    ''
  ).toLowerCase();

  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';

  const target = (fileName || mediaUrl || '').split('?')[0];
  const ext = path.extname(target).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (AUDIO_EXTS.has(ext)) return 'audio';

  if (data?.hasMedia || mediaUrl) {
    return 'document';
  }
  return 'text';
}

export function isWahaInternalMediaUrl(url?: string | null): boolean {
  if (!url) return false;
  return (
    url.includes('localhost:3000/api/files/') ||
    url.includes('127.0.0.1:3000/api/files/') ||
    url.includes('/api/files/')
  );
}

/**
 * Downloads a media file from WAHA's internal /api/files endpoint
 * and persists it into local public/uploads so browsers can render it directly.
 */
export async function downloadWahaMedia(rawUrl: string): Promise<string | null> {
  if (!rawUrl) return null;
  if (rawUrl.startsWith('/uploads/')) return rawUrl;

  try {
    let fetchUrl = rawUrl.trim();
    if (fetchUrl.startsWith('/api/files/')) {
      fetchUrl = `${WAHA_URL.replace(/\/$/, '')}${fetchUrl}`;
    } else {
      fetchUrl = fetchUrl.replace(
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i,
        WAHA_URL.replace(/\/$/, '')
      );
    }

    const urlObj = new URL(fetchUrl);
    const rawBase = path.basename(urlObj.pathname) || `media_${Date.now()}`;
    const safeName = `waha_${rawBase.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    await fs.mkdir(uploadsDir, { recursive: true });
    const destPath = path.join(uploadsDir, safeName);

    // Return cached file if already downloaded
    try {
      await fs.access(destPath);
      return `/uploads/${safeName}`;
    } catch {
      // File doesn't exist yet, proceed to download
    }

    const headers: Record<string, string> = {};
    if (WAHA_KEY) {
      headers['x-api-key'] = WAHA_KEY;
    }

    const res = await fetch(fetchUrl, { headers });
    if (!res.ok) {
      console.warn(`[WAHA Media] Failed to download ${fetchUrl}: HTTP ${res.status}`);
      return null;
    }

    const arrayBuf = await res.arrayBuffer();
    await fs.writeFile(destPath, Buffer.from(arrayBuf));
    return `/uploads/${safeName}`;
  } catch (err) {
    console.error('[WAHA Media] Error downloading media:', err);
    return null;
  }
}
