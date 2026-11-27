---
name: sync-lapaq-knowledge
description: >-
  Extracts, sanitizes, and updates the Agentic CS knowledge base from the Lapaq ecosystem: updates data/lapaq-knowledge-bundle.json from the local lapaq-sandbox repository, syncs the 36+ live tutorials from cs.lapaq.id and interactive UI demos from bantuan.lapaq.id, enforces the menu whitelist vs Coming Soon/Orphan routes, strips forbidden internal provider names, and refreshes pgvector embeddings. Use this skill when the user says Lapaq has a new repo update, asks to refresh/sync agent knowledge, or builds the knowledge indexer.
---

# Sync & Sanitize Lapaq Knowledge Base

Gunakan runbook ini saat membangun indexer pengetahuan atau setiap kali pengguna memberi tahu adanya pembaruan fitur/tutorial di Lapaq.

## 1. Periksa Referensi Whitelist & Redaksi Wajib
Baca terlebih dahulu daftar putih fitur, daftar rute *orphan* yang dilarang diekspos, serta daftar kata rahasia penyedia internal di:
- [redaction-and-whitelist.md](./references/redaction-and-whitelist.md)

## 2. Perbarui Sandbox Repo Lapaq (Khusus Lingkungan Lokal)
Jika pengguna meminta pembaruan dari repo Lapaq terbaru:
1. Pastikan kita **tidak mengubah** `/Users/cahyo/Developer/Web/lapaq` asli.
2. Perbarui `/Users/cahyo/Developer/Web/lapaq-sandbox` dari repo utama (gunakan skill `manage-lapaq-sandbox` bila sandbox belum dibuat atau memiliki perubahan endpoint CS lokal).

## 3. Ekstrak Bundel Pengetahuan Portabel (`data/lapaq-knowledge-bundle.json`)
Saat memindai `/Users/cahyo/Developer/Web/lapaq-sandbox` (melalui script `npm run kb:extract-lapaq`):
1. **Sumber yang Diambil**:
   - Peta menu & inventaris fitur seller (`docs/audit/merchant-feature-inventory.md` bila tersedia + rute aktif di `src/app/[storeSlug]/admin/`).
   - Definisi add-on, tempat pengaturannya, batas angka, dan catatan rilis terbaru (`src/services/add-ons/definitions.ts`, `src/services/add-ons/releases.ts`, `src/app/[storeSlug]/admin/add-ons/[code]/page.tsx`).
   - Aturan validasi sisi seller (format & ukuran foto `2 MB`, syarat buat kategori sebelum tambah produk, aturan produk *Draft* hasil impor, aturan ganti nama toko 3 bulan, OTP perubahan pembayaran & penarikan, serta 7 syarat kesiapan toko).
2. **Sumber yang Wajib Dibuang**:
   - Jangan pernah menyalin potongan kode TypeScript/SQL mentah, nama tabel database, atau isi file keamanan/rate-limit internal.
   - Buang seluruh rute *orphan* dan tandai secara eksplisit fitur berstatus **Segera hadir** sesuai [redaction-and-whitelist.md](./references/redaction-and-whitelist.md).
3. **Sanitasi Kata Terlarang**:
   - Jalankan fungsi redaksi atas seluruh teks hasil ekstraksi sebelum menulis ke `data/lapaq-knowledge-bundle.json`.

## 4. Sinkronisasi Tutorial & Peta Demo UI Online
1. Tarik daftar katalog tutorial aktif dari `https://cs.lapaq.id/v1/help/catalog` dan detail tiap tutorial dari `https://cs.lapaq.id/v1/help/tutorials/<slug>` (gunakan cadangan lokal bila luring).
2. Tarik peta layar demo interaktif dari `https://bantuan.lapaq.id/demos/<slug>.json` (atau `/Users/cahyo/Developer/Web/lapaq-bantuan/dist/demos/*.json` saat di lokal) untuk mengekstrak label navigasi, tombol, dan dialog pengunci di layar.
3. Hitung `contentHash` (SHA-256) tiap `sourceKey` pada tabel `KnowledgeChunk` dan hanya panggil `gemini-embedding-2` (`768` dimensi) untuk entri baru atau yang isinya berubah.

## 5. Verifikasi Kebersihan Bundel (Wajib Lulus 0 Temuan)
Setelah `data/lapaq-knowledge-bundle.json` diperbarui, wajib jalankan pemeriksaan kebocoran kata rahasia berikut:
```bash
grep -E -i "(midtrans|pakasir|pakkasir|ipaymu|xendit|faspay|biteship|cloudflare r2|password_hash|encrypted_seller_data)" data/lapaq-knowledge-bundle.json
```
- Jika `grep` menemukan **1 baris saja** (exit code `0`), **GAGAL** — bersihkan dan ekstrak ulang sampai perintah tersebut mengembalikan kosong (exit code `1`).
- Ingatkan pengguna bahwa untuk memperbarui server VPS, mereka cukup mengunggah `data/lapaq-knowledge-bundle.json` melalui halaman Admin `waha-marketing` di VPS atau melakukan `git push` + klik **Sync Online**.
