import test from 'node:test';
import assert from 'node:assert/strict';

import {
  sanitizePhone,
  normalizeJid,
  phoneToJid,
  jidToPhone,
  isLid,
  formatDisplayPhone,
} from '../src/lib/phone.ts';
import { formatAccountDate } from '../src/lib/date.ts';
import {
  extractStanzaId,
  markMessageProcessed,
  isMessageProcessed,
} from '../src/lib/msg-cache.ts';
import { detectMediaType, isWahaInternalMediaUrl } from '../src/lib/waha-media.ts';
import { interpolateTemplate } from '../src/lib/template-utils.ts';
import { isOutsideWorkingHours } from '../src/lib/settings.ts';

test('phone.ts: sanitizePhone normalizes Indonesian numbers', () => {
  assert.equal(sanitizePhone('0812-3456-7890'), '6281234567890');
  assert.equal(sanitizePhone('+62 812 3456 7890'), '6281234567890');
  assert.equal(sanitizePhone('8123456789'), '628123456789');
  assert.equal(sanitizePhone('6281227130966'), '6281227130966');
  assert.equal(sanitizePhone(''), '');
});

test('phone.ts: normalizeJid converts @s.whatsapp.net to @c.us and preserves @g.us / @lid', () => {
  assert.equal(normalizeJid('6281227130966@s.whatsapp.net'), '6281227130966@c.us');
  assert.equal(normalizeJid('6281227130966@c.us'), '6281227130966@c.us');
  assert.equal(normalizeJid('1203630123456@g.us'), '1203630123456@g.us');
  assert.equal(normalizeJid('252381002506321@lid'), '252381002506321@lid');
  assert.equal(normalizeJid(''), '');
});

test('phone.ts: phoneToJid, jidToPhone, isLid, and formatDisplayPhone', () => {
  assert.equal(phoneToJid('08123456789'), '628123456789@c.us');
  assert.equal(jidToPhone('628123456789@s.whatsapp.net'), '628123456789');
  assert.equal(jidToPhone('628123456789@c.us'), '628123456789');
  assert.equal(isLid('252381002506321@lid'), true);
  assert.equal(isLid('628123456789@c.us'), false);
  assert.equal(formatDisplayPhone('6281234567890'), '+62 812-3456-7890');
});

test('date.ts: formatAccountDate converts Excel serial dates and strings cleanly', () => {
  assert.equal(formatAccountDate(''), '');
  assert.equal(formatAccountDate(null), '');
  assert.equal(formatAccountDate('2026-10-19 13:43:58'), '2026-10-19 13:43:58');
  const formattedSerial = formatAccountDate(46349.68010416667);
  assert.match(formattedSerial, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.equal(formatAccountDate(46349), '2026-11-23');
});

test('msg-cache.ts: extractStanzaId and deduplication across serialized vs short IDs', () => {
  assert.equal(
    extractStanzaId('true_6281322692616@c.us_3EB05011638971685AE60B'),
    '3EB05011638971685AE60B'
  );
  assert.equal(
    extractStanzaId('false_41571022057572@lid_ACC63FED229C8C4D4A04FA0A37C67A62'),
    'ACC63FED229C8C4D4A04FA0A37C67A62'
  );
  assert.equal(extractStanzaId('3EB05011638971685AE60B'), '3EB05011638971685AE60B');

  const uniqueStanza = `3EB0TEST${Date.now()}`;
  markMessageProcessed(uniqueStanza);
  assert.equal(isMessageProcessed(uniqueStanza), true);
  assert.equal(isMessageProcessed(`true_628123456@c.us_${uniqueStanza}`), true);
  assert.equal(isMessageProcessed('3EB0NEVER_SEEN'), false);
});

test('waha-media.ts: detectMediaType and isWahaInternalMediaUrl', () => {
  assert.equal(
    detectMediaType({ hasMedia: true, _data: { message: { imageMessage: {} } } }, null, null),
    'image'
  );
  assert.equal(
    detectMediaType({ hasMedia: true, media: { mimetype: 'video/mp4' } }, null, null),
    'video'
  );
  assert.equal(
    detectMediaType({ hasMedia: true }, 'http://localhost:3000/api/files/default/ABC.jpeg', null),
    'image'
  );
  assert.equal(detectMediaType({ hasMedia: true }, null, 'katalog.pdf'), 'document');
  assert.equal(detectMediaType({ hasMedia: false }, null, null), 'text');

  assert.equal(
    isWahaInternalMediaUrl('http://localhost:3000/api/files/default/AC8E294.jpeg'),
    true
  );
  assert.equal(isWahaInternalMediaUrl('/uploads/waha_AC8E294.jpeg'), false);
});

test('template-utils.ts: interpolateTemplate fills placeholders with sensible fallbacks', () => {
  const result = interpolateTemplate('Halo Kak {nama} dari {nama_toko} ({kategori})!', {
    name: 'Rizky Pratama',
    storeName: 'Kopi Senja',
    category: 'Kuliner',
  });
  assert.equal(result, 'Halo Kak Rizky dari Kopi Senja (Kuliner)!');

  const fallback = interpolateTemplate('Halo {nama} - {nama_toko} - {kategori}', {});
  assert.equal(fallback, 'Halo Kak - Toko Anda - Merchant');
});

test('settings.ts: isOutsideWorkingHours checks WIB (UTC+7) window accurately', () => {
  // 10:00 WIB = 03:00 UTC -> inside 08:00-17:00
  const inside = new Date('2026-11-26T03:00:00Z');
  assert.equal(isOutsideWorkingHours(inside, '08:00', '17:00'), false);

  // 19:30 WIB = 12:30 UTC -> outside 08:00-17:00
  const outsideEvening = new Date('2026-11-26T12:30:00Z');
  assert.equal(isOutsideWorkingHours(outsideEvening, '08:00', '17:00'), true);

  // 06:15 WIB = 23:15 UTC prev day -> outside 08:00-17:00
  const outsideMorning = new Date('2026-11-25T23:15:00Z');
  assert.equal(isOutsideWorkingHours(outsideMorning, '08:00', '17:00'), true);
});
