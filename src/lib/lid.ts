import fs from 'fs';
import path from 'path';

/**
 * Resolves a WhatsApp LID (e.g. "252381002506321@lid" or "252381002506321")
 * to its canonical phone number using Baileys reverse mapping files stored in waha_sessions.
 */
export function resolveLidToPhone(lid: string): string | null {
  try {
    if (!lid) return null;
    const cleanLid = lid.replace('@lid', '').replace(/[^0-9]/g, '');
    if (!cleanLid) return null;

    const baseDirs = [
      '/app/waha_sessions/noweb',
      path.join(process.cwd(), 'waha_sessions', 'noweb'),
      '/app/.sessions/noweb',
      path.join(process.cwd(), '.sessions', 'noweb'),
    ];

    const targetFile = `lid-mapping-${cleanLid}_reverse.json`;

    for (const base of baseDirs) {
      if (!fs.existsSync(base)) continue;

      // First check default session
      const direct = path.join(base, 'default', targetFile);
      if (fs.existsSync(direct)) {
        const raw = fs.readFileSync(direct, 'utf8').trim();
        const phone = JSON.parse(raw);
        if (phone && typeof phone === 'string') return phone;
      }

      // Check all session subdirectories
      try {
        const sessions = fs.readdirSync(base, { withFileTypes: true });
        for (const s of sessions) {
          if (s.isDirectory()) {
            const p = path.join(base, s.name, targetFile);
            if (fs.existsSync(p)) {
              const raw = fs.readFileSync(p, 'utf8').trim();
              const phone = JSON.parse(raw);
              if (phone && typeof phone === 'string') return phone;
            }
          }
        }
      } catch {}
    }
  } catch (err) {
    console.error('[LID Resolver] Error resolving LID to phone:', err);
  }
  return null;
}

/**
 * Resolves a phone number to its WhatsApp LID if known.
 */
export function resolvePhoneToLid(phone: string): string | null {
  try {
    if (!phone) return null;
    const cleanPhone = phone.replace('@c.us', '').replace(/[^0-9]/g, '');
    if (!cleanPhone) return null;

    const baseDirs = [
      '/app/waha_sessions/noweb',
      path.join(process.cwd(), 'waha_sessions', 'noweb'),
      '/app/.sessions/noweb',
      path.join(process.cwd(), '.sessions', 'noweb'),
    ];

    const targetFile = `lid-mapping-${cleanPhone}.json`;

    for (const base of baseDirs) {
      if (!fs.existsSync(base)) continue;

      // Check default session
      const direct = path.join(base, 'default', targetFile);
      if (fs.existsSync(direct)) {
        const raw = fs.readFileSync(direct, 'utf8').trim();
        const lid = JSON.parse(raw);
        if (lid && typeof lid === 'string') return `${lid}@lid`;
      }

      // Check all session subdirectories
      try {
        const sessions = fs.readdirSync(base, { withFileTypes: true });
        for (const s of sessions) {
          if (s.isDirectory()) {
            const p = path.join(base, s.name, targetFile);
            if (fs.existsSync(p)) {
              const raw = fs.readFileSync(p, 'utf8').trim();
              const lid = JSON.parse(raw);
              if (lid && typeof lid === 'string') return `${lid}@lid`;
            }
          }
        }
      } catch {}
    }
  } catch (err) {
    console.error('[LID Resolver] Error resolving phone to LID:', err);
  }
  return null;
}
