import test from 'node:test';
import assert from 'node:assert/strict';
import {
  containsForbiddenInternalTerm,
  containsOrphanRoute,
  resolveCallerVerification,
  sanitizeKnowledgeText,
} from '../src/lib/agent/knowledge-sanitizer.ts';
import { normalizeAndValidateBundle } from '../src/lib/agent/knowledge-indexer.ts';

test('knowledge-sanitizer: strips all forbidden internal providers and DB identifiers', () => {
  const dirty =
    '<p>Pembayaran QRIS memakai Midtrans, Pakasir, iPaymu, Xendit, atau Faspay, pengiriman via Biteship, dan media disimpan di Cloudflare R2 pada schema.pg.ts password_hash encrypted_seller_data.</p>';
  const cleaned = sanitizeKnowledgeText(dirty);

  assert.equal(containsForbiddenInternalTerm(cleaned), false);
  assert.doesNotMatch(cleaned, /midtrans|pakasir|ipaymu|xendit|faspay|biteship|cloudflare|password_hash|encrypted_seller_data/i);
  assert.match(cleaned, /Pembayaran Online QRIS Lapaq/);
  assert.match(cleaned, /Sistem Pengiriman Kurir Lapaq/);
});

test('knowledge-sanitizer: detects hidden orphan routes accurately', () => {
  assert.equal(containsOrphanRoute('/toko-kopi/admin/vouchers'), true);
  assert.equal(containsOrphanRoute('/toko-kopi/admin/affiliates'), true);
  assert.equal(containsOrphanRoute('/toko-kopi/admin/spotlight'), true);
  assert.equal(containsOrphanRoute('/toko-kopi/admin/config?tab=notifications'), true);
  assert.equal(containsOrphanRoute('/toko-kopi/admin/add-ons/low_stock_alerts?tab=configuration'), false);
  assert.equal(containsOrphanRoute('/toko-kopi/admin/products'), false);
});

test('knowledge-sanitizer: resolveCallerVerification enforces strict WhatsApp JID phone match', () => {
  assert.equal(
    resolveCallerVerification('6281234567890@c.us', ['0812-3456-7890']),
    'VERIFIED_OWNER'
  );
  assert.equal(
    resolveCallerVerification('+62 857 1111 2222', ['6281234567890', '085711112222']),
    'VERIFIED_OWNER'
  );
  assert.equal(
    resolveCallerVerification('6289900001111@c.us', ['0812-3456-7890']),
    'UNVERIFIED_CALLER'
  );
  assert.equal(resolveCallerVerification('', ['081234567890']), 'UNVERIFIED_CALLER');
});

test('knowledge-indexer: normalizeAndValidateBundle drops orphan chunks and sanitizes provider names', () => {
  const validated = normalizeAndValidateBundle({
    version: 1,
    chunks: [
      {
        sourceType: 'REPO_BUNDLE',
        sourceKey: 'orphan:/admin/vouchers',
        title: 'Menu /admin/vouchers',
        content: 'Unggah kode voucher',
      },
      {
        sourceType: 'REPO_BUNDLE',
        sourceKey: 'addon:low_stock_alerts',
        title: 'Info Stok Menipis',
        category: 'addon',
        content: 'Pembayaran add-on via Midtrans dan kurir Biteship.',
      },
    ],
  });

  assert.equal(validated.chunks.length, 1);
  assert.equal(validated.chunks[0].sourceKey, 'addon:low_stock_alerts');
  assert.equal(containsForbiddenInternalTerm(validated.chunks[0].content), false);
});
