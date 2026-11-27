import fs from 'node:fs';
import path from 'node:path';

/**
 * Local CLI Extractor: Builds portable data/lapaq-knowledge-bundle.json
 * from local lapaq-sandbox & lapaq-bantuan repos so production VPS Docker
 * never needs access to local Lapaq repositories.
 */
const LAPAQ_REPO_DIR =
  process.env.LAPAQ_SANDBOX_DIR || '/Users/cahyo/Developer/Web/lapaq-sandbox';
const BANTUAN_DIR =
  process.env.LAPAQ_BANTUAN_DIR || '/Users/cahyo/Developer/Web/lapaq-bantuan';
const OUT_FILE = path.join(process.cwd(), 'data', 'lapaq-knowledge-bundle.json');

const FORBIDDEN_REPLACEMENTS = [
  [/\b(midtrans|pakkasir|pakasir|ipaymu|xendit|faspay|amazon\s+payment(\s+services)?)\b/gi, 'Pembayaran Online QRIS Lapaq'],
  [/\bbiteship(_api_key|_workspace)?\b/gi, 'Sistem Pengiriman Kurir Lapaq'],
  [/\b(cloudflare\s*r2|r2\s*bucket|wrangler|d1\s+database)\b/gi, 'Sistem Penyimpanan Lapaq'],
  [/\b(drizzle-orm|pgvector|schema\.pg\.ts|seller-publication\.pg\.ts|password_hash|encrypted_seller_data|email_otp_hash|superadmin_accounts)\b/gi, ''],
];

const ORPHAN_LINE_PATTERNS = [
  /\/vouchers\b/i,
  /\/affiliates\b/i,
  /\/spotlight\b/i,
  /\/seller-profile\b/i,
  /\?tab=notifications/i,
  /Notifikasi \(Telegram\)/i,
  /bot Telegram Lapaq/i,
];

function sanitize(text) {
  if (!text) return '';
  let out = String(text)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  for (const [re, rep] of FORBIDDEN_REPLACEMENTS) {
    out = out.replace(re, rep);
  }
  out = out.replace(/(Pembayaran Online QRIS Lapaq)(\s*[,/]\s*\1)+/gi, '$1');
  return out
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseInventorySections(markdown) {
  const chunks = [];
  const sections = markdown.split(/\n(?=##\s+\d+\.\s+|###\s+\d+\.\d+\s+)/g);

  for (const rawSec of sections) {
    const firstLine = rawSec.split('\n')[0] || '';
    if (/^##\s+12\.\s+Temuan audit/i.test(firstLine) || /^##\s+14\.\s+Batas audit/i.test(firstLine)) {
      continue;
    }
    if (/7\.7\s+Notifikasi\s*\(Telegram\)/i.test(firstLine)) {
      continue;
    }

    const filteredLines = rawSec
      .split('\n')
      .filter((line) => !ORPHAN_LINE_PATTERNS.some((re) => re.test(line)))
      .filter((line) => !/\(perlu konfirmasi\)/i.test(line));

    const cleanBody = sanitize(filteredLines.join('\n'));
    if (cleanBody.length < 60) continue;

    const headingMatch = cleanBody.match(/^#{2,3}\s+([^\n]+)/);
    const title = headingMatch ? headingMatch[1].trim() : 'Panduan Fitur Dashboard Lapaq';
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64);

    chunks.push({
      sourceType: 'REPO_BUNDLE',
      sourceKey: `inventory:${slug}`,
      title: `Fitur Lapaq: ${title}`,
      category: 'fitur-dashboard',
      content: cleanBody,
      structuredMeta: { origin: 'merchant-feature-inventory', featureStatus: cleanBody.includes('Segera hadir') ? 'MIXED_WITH_COMING_SOON' : 'ACTIVE' },
    });
  }
  return chunks;
}

function parseAddOnReleases(tsContent) {
  const chunks = [];
  const ADDON_META = {
    coupon_system: {
      name: 'Kupon Diskon',
      managePath: 'Menu Kupon (/coupons) untuk kupon diskon biasa, atau detail Pesanan terbayar untuk menerbitkan Kupon Retensi.',
    },
    featured_products: {
      name: 'Produk Unggulan',
      managePath: 'Klik ikon bintang pada daftar Produk Fisik atau Produk Digital (maksimal 5 produk gabungan) lalu klik Simpan perubahan.',
    },
    whatsapp_floating: {
      name: 'WhatsApp Mengambang',
      managePath: 'Menu Pengaturan > tab Umum > isi Nomor WhatsApp tanpa angka 0 di depan.',
    },
    social_media: {
      name: 'Media Sosial & Marketplace',
      managePath: 'Menu Pengaturan > tab Umum > bagian Media sosial dan marketplace.',
    },
    ticker_bar: {
      name: 'Ticker Bar (Teks Berjalan)',
      managePath: 'Klik tombol Kelola pada detail Add-on atau buka Pengaturan > Informasi Toko untuk mengisi teks berjalan, dan Pengaturan > Tampilan toko untuk memilih gaya ticker.',
    },
    store_schedule: {
      name: 'Jadwal Operasional Toko',
      managePath: 'Menu Pengaturan > Informasi Toko (jam buka 7 hari).',
    },
    product_import: {
      name: 'Impor Produk Massal',
      managePath: 'Buka Produk Fisik/Digital > klik tombol Impor (mendukung CSV/XLSX Shopee, TikTok Shop, template CSV, atau ekstensi Chrome Lapaq Migrator). 1 produk berhasil = 1 kuota impor; sisa kuota tidak hangus.',
    },
    xtra_product: {
      name: 'Xtra Product (+200 Slot Produk)',
      managePath: 'Menu Add-on > Xtra Product. Menambah kapasitas produk toko sebanyak 200 slot permanen per paket (mencakup fisik, digital, draft, nonaktif; varian tidak dihitung produk terpisah).',
    },
    stock_lock: {
      name: 'Stock Lock (Batas Min/Maks Pembelian)',
      managePath: 'Diatur langsung pada formulir Tambah Produk atau Edit Produk (per produk atau per varian, minimal pembelian >= 1).',
    },
    low_stock_alerts: {
      name: 'Info Stok Menipis (Limit Stok)',
      managePath: 'Buka menu Add-on di sidebar kiri > pilih Info Stok Menipis > pastikan add-on sudah Aktif > klik tombol Kelola (membuka tab Konfigurasi) > pada kartu "Batas Minimum Stok" isi angka pada kolom "Jumlah stok minimum" (0 sampai 99.999, bawaan 5) > klik tombol "Simpan Pengaturan". Jika add-on belum diaktifkan, kolom akan terkunci dengan pesan "Aktifkan add-on untuk mengubah pengaturan."',
    },
    store_reviews: {
      name: 'Ulasan dan Rating Toko',
      managePath: 'Menu Ulasan dan rating (/reviews) untuk menampilkan/menyembunyikan ulasan pembeli.',
    },
    merchant_analytics: {
      name: 'Analitik dan Pixel (GA4, GTM, Meta Pixel)',
      managePath: 'Aktifkan add-on di menu Add-on lalu hubungkan ID GA4, Google Tag Manager, atau Meta Pixel melalui menu Pengaturan.',
    },
    remove_footer_branding: {
      name: 'Hapus Branding Footer',
      managePath: 'Otomatis menyembunyikan tulisan Powered By Lapaq di footer toko begitu add-on berstatus Aktif.',
    },
    abandoned_cart: {
      name: 'Keranjang Ditinggalkan',
      managePath: 'Klik tombol Kelola pada detail Add-on (membuka tab Konfigurasi) untuk mengaktifkan Status pengingat email otomatis 3 hari, dan pantau daftarnya di menu Keranjang Ditinggalkan.',
    },
  };

  for (const [code, meta] of Object.entries(ADDON_META)) {
    // Extract latest 3 release notes for this add-on code from releases.ts
    const codeRegex = new RegExp(`\\b${code}\\s*:\\s*\\[([\\s\\S]*?)\\n\\s*\\]`, 'm');
    const match = tsContent.match(codeRegex);
    const notesList = [];
    if (match) {
      const noteMatches = [...match[1].matchAll(/'([^']{15,})'/g)];
      for (const m of noteMatches.slice(0, 5)) {
        const cleaned = sanitize(m[1]);
        if (cleaned && !ORPHAN_LINE_PATTERNS.some((re) => re.test(cleaned))) {
          notesList.push(`- ${cleaned}`);
        }
      }
    }

    const content = sanitize(
      `Add-on Lapaq: ${meta.name} (kode: ${code})\n` +
        `Cara & Lokasi Konfigurasi: ${meta.managePath}\n` +
        (notesList.length > 0 ? `Perilaku & Pembaruan Terbaru:\n${notesList.join('\n')}` : '')
    );

    chunks.push({
      sourceType: 'REPO_BUNDLE',
      sourceKey: `addon:${code}`,
      title: `Panduan & Lokasi Pengaturan Add-on ${meta.name}`,
      category: 'addon',
      content,
      structuredMeta: { addOnCode: code, featureStatus: 'ADDON' },
    });
  }

  return chunks;
}

function parseDemoFiles(demosDir) {
  if (!fs.existsSync(demosDir)) return [];
  const files = fs.readdirSync(demosDir).filter((f) => f.endsWith('.json')).sort();
  const chunks = [];

  for (const file of files) {
    const slug = file.replace(/\.json$/, '');
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(demosDir, file), 'utf8'));
      const pageUrl = raw.url || '';
      const actionHints = [];
      if (Array.isArray(raw.steps)) {
        raw.steps.forEach((st, idx) => {
          const stepLabels = (st.actions || [])
            .filter((a) => Array.isArray(a) && typeof a[2] === 'string' && a[2].length > 2)
            .map((a) => sanitize(a[2]));
          if (stepLabels.length > 0) {
            actionHints.push(`Langkah layar ${idx + 1}: ${stepLabels.join(' -> ')}`);
          }
        });
      }

      // Extract visible headings, labels, and gate dialogs from HTML views
      const uiLabels = new Set();
      if (raw.views && typeof raw.views === 'object') {
        for (const html of Object.values(raw.views)) {
          if (typeof html !== 'string') continue;
          for (const m of html.matchAll(/<(?:h4|h5|label|b)[^>]*>([^<]{2,80})<\/(?:h4|h5|label|b)>/gi)) {
            const cleaned = sanitize(m[1]);
            if (cleaned) uiLabels.add(cleaned);
          }
          for (const m of html.matchAll(/class="pill[^"]*"[^>]*>([^<]{4,100})<\//gi)) {
            const cleaned = sanitize(m[1]);
            if (cleaned) uiLabels.add(cleaned);
          }
        }
      }

      const content = sanitize(
        `Peta Tampilan Layar UI Lapaq (${slug})\n` +
          (pageUrl ? `Alamat Halaman: ${pageUrl}\n` : '') +
          (uiLabels.size > 0 ? `Elemen, Tombol & Petunjuk di Layar: ${[...uiLabels].slice(0, 25).join(' | ')}\n` : '') +
          (actionHints.length > 0 ? `Alur Interaksi di Layar:\n${actionHints.join('\n')}` : '')
      );

      if (content.length > 50 && !ORPHAN_LINE_PATTERNS.some((re) => re.test(content))) {
        chunks.push({
          sourceType: 'DEMO_UI',
          sourceKey: `demo:${slug}`,
          title: `Peta Layar UI: ${slug.replace(/-/g, ' ')}`,
          category: 'peta-ui',
          content,
          structuredMeta: { demoSlug: slug, pageUrl },
        });
      }
    } catch {
      // skip malformed demo json
    }
  }
  return chunks;
}

function buildCuratedLockedPolicies() {
  return [
    {
      sourceType: 'LOCKED_POLICY',
      sourceKey: 'policy:keuangan-qris-vs-manual',
      title: 'Aturan Baku Pencairan Dana QRIS Lapaq vs Transfer Manual & Penarikan Dompet',
      category: 'uang',
      content: sanitize(
        `1. Pembayaran Online (QRIS Lapaq): terkonfirmasi otomatis oleh sistem (tidak bisa dikonfirmasi/dibatalkan manual). Dana masuk ke menu Dompet pada status "Menunggu cair", lalu berpindah ke "Saldo tersedia" keesokan harinya (H+1) pukul 12.00 WIB.\n` +
          `2. Transfer Bank Manual & QRIS Statis: uang pembayaran dari pembeli masuk langsung ke rekening pribadi/toko milik seller (TIDAK masuk ke menu Dompet Lapaq). Seller wajib memeriksa bukti bayar dan menekan Konfirmasi pembayaran secara manual di detail pesanan.\n` +
          `3. Penarikan Saldo Dompet: wajib mengisi Rekening Pencairan di menu Dompet dan memverifikasi kode OTP ke email pemilik (berlaku 10 menit). Diproses maksimal 1x24 jam kerja. Hanya boleh ada 1 penarikan berjalan (pending) pada satu waktu.`
      ),
      structuredMeta: { locked: true },
    },
    {
      sourceType: 'LOCKED_POLICY',
      sourceKey: 'policy:refund-wajib-eskalasi',
      title: 'Kebijakan Mutlak Refund, Pembatalan Langganan, dan Pembelian Add-on',
      category: 'uang',
      content: sanitize(
        `Setiap permintaan pengembalian dana (refund), pembatalan pembayaran paket langganan, add-on, atau kuota impor WAJIB langsung dicatat dan dieskalasi ke Admin/Tim Terkait tanpa pernah menjanjikan bahwa dana pasti dikembalikan.`
      ),
      structuredMeta: { locked: true, escalateImmediately: true },
    },
    {
      sourceType: 'LOCKED_POLICY',
      sourceKey: 'policy:aturan-validasi-tersembunyi-produk-dan-toko',
      title: 'Daftar Kendala Validasi Umum Produk, Kategori, Draft Impor, dan Pengaturan Toko',
      category: 'troubleshooting',
      content: sanitize(
        `1. Tombol Tambah Produk Terkunci: setiap produk di Lapaq wajib memiliki kategori. Jika belum ada kategori, muncul pesan "Buat kategori terlebih dahulu". Buat kategori dulu di menu Produk > Kategori Produk.\n` +
          `2. Gagal Upload Foto atau Gagal Simpan Produk: foto produk wajib format JPG, PNG, atau WebP (format HEIC iPhone atau SVG ditolak), ukuran maksimal 2 MB per foto, maksimal 5 foto per produk, rasio disarankan persegi 1:1 (800x800 px). Untuk produk fisik, pastikan kolom Harga jual, Stok, dan Berat (gram) sudah diisi sebelum klik Simpan produk.\n` +
          `3. Produk Hasil Migrasi/Impor Shopee Tidak Tampil di Toko: produk hasil impor otomatis berstatus Draft. Produk Draft TIDAK BISA diaktifkan lewat tombol saklar di tabel daftar produk; seller harus klik Edit pada produk tersebut, melengkapi Berat (gram) jika masih kosong, memilih status Publikasi = Aktif, lalu klik Simpan produk.\n` +
          `4. Nama Toko & Link Toko: alamat link (slug) toko bersifat permanen sejak pendaftaran dan tidak dapat diubah, sedangkan Nama Toko hanya dapat diubah setiap 3 bulan sekali di Pengaturan > Umum.\n` +
          `5. Perubahan Pengaturan Pembayaran meminta verifikasi kode OTP ke email pemilik toko.`
      ),
      structuredMeta: { locked: true },
    },
    {
      sourceType: 'LOCKED_POLICY',
      sourceKey: 'policy:fitur-segera-hadir',
      title: 'Daftar Fitur Lapaq yang Masih Berstatus Segera Hadir (Belum Aktif)',
      category: 'fitur-status',
      content: sanitize(
        `Fitur berikut tampil sebagai "Segera hadir" dan belum dapat digunakan saat ini: Pengaturan Domain Kustom sendiri, Pengaturan Notifikasi WhatsApp otomatis, Pengaturan Staf dan Akses (multi-admin), Gateway Pembayaran milik sendiri, serta Laporan Retur & Refund, Laporan Trafik & Sumber Trafik, dan Estimasi Pajak. Sampaikan jujur bahwa fitur sedang dikembangkan tanpa menjanjikan tanggal rilis.`
      ),
      structuredMeta: { featureStatus: 'COMING_SOON', locked: true },
    },
    {
      sourceType: 'PUBLIC_FAQ',
      sourceKey: 'faq:tiga-audiens-calon-seller-dan-pembeli',
      title: 'Panduan Melayani Calon Seller Baru dan Pembeli Toko yang Salah Sambung',
      category: 'umum',
      content: sanitize(
        `1. Untuk Calon Seller Baru: pendaftaran akun dan pembuatan toko dilakukan di halaman pendaftaran seller Lapaq. Setiap toko baru langsung mendapatkan masa uji coba gratis selama 14 hari, mendukung penjualan produk fisik maupun produk digital, mendukung pengaturan kurir reguler & instan, serta pembayaran QRIS maupun transfer manual.\n` +
          `2. Untuk Pembeli Akhir Toko Merchant (Salah Sambung): WhatsApp ini adalah layanan bantuan resmi platform pembuat website toko online Lapaq, bukan admin penjual barang dari toko tempat pembeli berbelanja. Arahkan pembeli secara sopan untuk mengecek status pesanan di menu "Cek Pesanan" pada website toko tempat ia berbelanja atau menghubungi tombol WhatsApp penjual yang tertera di halaman toko tersebut.`
      ),
      structuredMeta: { audience: 'ALL' },
    },
  ];
}

function main() {
  const chunks = [];

  const invPath = path.join(LAPAQ_REPO_DIR, 'docs', 'audit', 'merchant-feature-inventory.md');
  if (fs.existsSync(invPath)) {
    chunks.push(...parseInventorySections(fs.readFileSync(invPath, 'utf8')));
  }

  const relPath = path.join(LAPAQ_REPO_DIR, 'src', 'services', 'add-ons', 'releases.ts');
  if (fs.existsSync(relPath)) {
    chunks.push(...parseAddOnReleases(fs.readFileSync(relPath, 'utf8')));
  }

  const demosDir = path.join(BANTUAN_DIR, 'dist', 'demos');
  chunks.push(...parseDemoFiles(demosDir));

  chunks.push(...buildCuratedLockedPolicies());

  const bundle = {
    version: 1,
    generatedAt: new Date().toISOString(),
    totalChunks: chunks.length,
    chunks,
  };

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(bundle, null, 2), 'utf8');
  console.log(`[kb:extract-lapaq] Wrote ${chunks.length} sanitized chunks to ${OUT_FILE}`);
}

main();
