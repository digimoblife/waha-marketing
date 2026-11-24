/**
 * Phone number sanitization and helper utility.
 * Handles Indonesian numbers (08... -> 628...) and standardizes to JID.
 */
export function sanitizePhone(rawPhone: string): string {
  if (!rawPhone) return '';

  // Remove all non-digit characters except leading plus if any
  let clean = rawPhone.replace(/[^\d+]/g, '');

  if (clean.startsWith('+')) {
    clean = clean.substring(1);
  }

  // Handle Indonesian local format (08... -> 628...)
  if (clean.startsWith('08')) {
    clean = '62' + clean.substring(1);
  } else if (clean.startsWith('8') && clean.length >= 9 && clean.length <= 13) {
    clean = '62' + clean;
  }

  return clean;
}

export function phoneToJid(phone: string): string {
  const clean = sanitizePhone(phone);
  if (clean.endsWith('@c.us') || clean.endsWith('@g.us') || clean.endsWith('@lid')) {
    return clean;
  }
  return `${clean}@c.us`;
}

export function jidToPhone(jid: string): string {
  return jid.replace(/@c\.us$/, '').replace(/@g\.us$/, '').replace(/@lid$/, '');
}

export function isLid(jidOrPhone: string): boolean {
  if (!jidOrPhone) return false;
  return jidOrPhone.endsWith('@lid') || (jidOrPhone.length === 15 && jidOrPhone.startsWith('2544'));
}

export function formatDisplayPhone(phone: string): string {
  if (!phone) return '';

  // If this is a WhatsApp LID (15-digit internal privacy identifier)
  if (isLid(phone)) {
    return `WhatsApp User ID (${jidToPhone(phone).slice(-6)})`;
  }

  const clean = sanitizePhone(phone);
  if (clean.startsWith('62') && clean.length >= 10) {
    // Format: +62 812-3456-7890
    return `+${clean.slice(0, 2)} ${clean.slice(2, 5)}-${clean.slice(5, 9)}-${clean.slice(9)}`;
  }
  return `+${clean}`;
}
