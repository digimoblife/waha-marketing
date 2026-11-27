---
name: manage-lapaq-sandbox
description: >-
  Creates, updates, and develops the isolated local clone /Users/cahyo/Developer/Web/lapaq-sandbox from /Users/cahyo/Developer/Web/lapaq, and implements or maintains the read-only internal CS bridge endpoints (/api/internal/cs/*) with strict Zero-Secret DB Projection and Caller Identity Verification. Use this skill whenever setting up the Lapaq sandbox clone, pulling updates from the main Lapaq repo, or working on merchant diagnostic/passive-merchant bridge APIs.
---

# Manage Isolated Lapaq Sandbox & Internal CS Bridge

Ikuti prosedur ini agar pengembangan jembatan data aktivitas merchant berjalan 100% aman di sandbox lokal tanpa pernah menyentuh atau mengotori repositori utama `/Users/cahyo/Developer/Web/lapaq` maupun database produksi Lapaq.

## 1. Aturan Isolasi Sandbox Mutlak
1. **Jangan pernah mengedit file atau menjalankan migrasi di dalam `/Users/cahyo/Developer/Web/lapaq`**.
2. Seluruh eksperimen endpoint internal CS (`/api/internal/cs/*`) dikerjakan di dalam `/Users/cahyo/Developer/Web/lapaq-sandbox`.
3. Sebelum menjalankan migrasi atau server di `lapaq-sandbox`, periksa `.env.local` agar `DATABASE_URL` menunjuk ke **database PostgreSQL lokal khusus sandbox** (mis. `lapaq_sandbox`), **bukan** database staging atau produksi. Jangan pernah mencetak nilai rahasia/credential isi `.env` ke layar.

## 2. Prosedur Membuat atau Memperbarui `lapaq-sandbox`
- **Saat Inisialisasi Pertama**:
  - Clone lokal menggunakan `git clone /Users/cahyo/Developer/Web/lapaq /Users/cahyo/Developer/Web/lapaq-sandbox`.
  - Buat branch kerja terpisah `feat/internal-cs-bridge` di dalam `lapaq-sandbox`.
- **Saat Pengguna Mengabarkan Ada Update Terbaru di Repo `lapaq`**:
  1. Simpan perubahan endpoint bridge di branch `feat/internal-cs-bridge` (commit lokal di sandbox).
  2. Jalankan `git -C /Users/cahyo/Developer/Web/lapaq-sandbox fetch origin && git -C /Users/cahyo/Developer/Web/lapaq-sandbox rebase origin/main` untuk menarik kode Lapaq terbaru tanpa kehilangan route `/api/internal/cs/*`.
  3. Setelah rebase bersih, aktifkan skill `sync-lapaq-knowledge` untuk memperbarui `data/lapaq-knowledge-bundle.json` di `waha-marketing`.

## 3. Aturan Kontrak Keamanan pada `/api/internal/cs/*`
Ketiga route di `lapaq-sandbox/src/app/api/internal/cs/` wajib mematuhi aturan keamanan [SECURITY_AND_GUARDRAILS.md](../../../docs/SECURITY_AND_GUARDRAILS.md):

1. **Autentikasi Antar-Layanan**:
   - Wajib memeriksa header `x-internal-cs-key` terhadap `process.env.INTERNAL_CS_API_KEY` menggunakan `crypto.timingSafeEqual`. Tolak dengan `401` bila kosong atau tidak cocok.
2. **Hanya `GET` Read-Only**:
   - Dilarang menyediakan method `POST`, `PUT`, `PATCH`, atau `DELETE` yang memodifikasi data merchant, produk, pesanan, atau saldo.
3. **Daftar Kolom Terlarang Keras di Query Drizzle (`Zero-Secret Projection`)**:
   - **Dilarang keras** memasukkan kolom berikut ke dalam `select({...})`:
     - `passwordHash`, `emailOtpHash`, `passwordResetTokenHash`, `googleSub`, `encryptedSellerData`
     - Nominal saldo dompet, riwayat mutasi uang, nilai omzet pesanan, nomor rekening bank
     - Data pribadi pembeli toko (`members`, alamat pengiriman pembeli)
     - `paymentProviderOverride` atau rahasia gateway
4. **Pemisahan Ketat `VERIFIED_OWNER` vs `UNVERIFIED_CALLER`**:
   - Bandingkan parameter `senderPhone` (yang dikirim oleh backend `waha-marketing` dari JID asli WhatsApp) dengan nomor telepon/WhatsApp toko terdaftar setelah keduanya dinormalisasi ke format `628xxx`.
   - Jika tidak sama persis (`UNVERIFIED_CALLER`), kembalikan **hanya** indikator kesiapan publik (`storeExists`, `isStorePubliclyAccessible`, `hasPublishedProducts`, `isShippingConfigured`, `isPaymentConfigured`) dan sembunyikan detail jumlah draft, daftar add-on internal, maupun status langganan detail.

## 4. Validasi Kompatibilitas VPS di `waha-marketing`
Setiap kali menambah atau mengubah kontrak respons `/api/internal/cs/*`, pastikan klien pemanggil di `waha-marketing` (`src/lib/agent/lapaq-bridge.ts`) memiliki pengujian ketika `LAPAQ_INTERNAL_API_URL` kosong atau mengembalikan `503`/timeout, sehingga saat `waha-marketing` di-deploy ke VPS dalam mode `STANDALONE`, sistem tetap berjalan normal tanpa error.
