# Pedoman Pengembangan & Aturan Kerja Agen (`waha-marketing`)

Repositori ini adalah aplikasi **WhatsApp Web, Broadcast Marketing, & Agentic Customer Service Lapaq** berbasis **Next.js 14 (App Router)**, **TypeScript**, **Tailwind CSS**, **Prisma ORM (PostgreSQL + `pgvector`)**, **WAHA (WhatsApp HTTP API)**, dan **Google Gemini API (`@google/genai`)**.

Dokumen ini menjadi aturan aktif (*always-on rules*) bagi setiap agen AI maupun pengembang yang memodifikasi kode di repositori ini.

---

## 1. Peta Direktori & Dokumentasi Acuan

- `src/app/` — Halaman workspace (`/inbox`, `/merchants`, `/broadcast`, `/templates`, `/issues`, `/overview`, `/logs`, `/users`, `/settings`) dan endpoint API (`src/app/api/`).
- `src/lib/` — Klien WAHA (`waha.ts`, `waha-media.ts`), Prisma (`prisma.ts`), Broadcast Worker (`broadcast-worker.ts`), dan modul Agentic CS (`src/lib/agent/`).
- `prisma/schema.prisma` — Skema database utama (target migrasi: PostgreSQL 16 + `pgvector`).
- `data/` — Bundel pengetahuan ter-sanitasi hasil ekstraksi repo Lapaq (`lapaq-knowledge-bundle.json`) agar server VPS tidak bergantung pada repo Lapaq lokal.
- `docs/` — Dokumentasi spesifikasi produk, arsitektur, model data, persona, keamanan, dan pengujian (lihat [docs/README.md](./docs/README.md)).
- `.agents/skills/` — Runbook prosedur kerja khusus (*Skills*) untuk pengembangan Agent, sinkronisasi pengetahuan Lapaq, manajemen sandbox Lapaq, dan uji keamanan (*Red-Teaming*).

Selalu baca dokumen terkait di `docs/` dan aktifkan *Skill* yang relevan di `.agents/skills/` sebelum mengubah logika Agentic CS.

---

## 2. Perintah Pengembangan & Verifikasi

```bash
npm install
npm run lint
npx tsc --noEmit
npm test
npm run build
```

Database & Prisma:
```bash
npx prisma generate
npx prisma db push
```

Jangan pernah meng-commit `.env`, file sesi WhatsApp (`waha_sessions/`), database lokal (`*.db`), atau media unggahan user (`public/uploads/*`).

---

## 3. Aturan Keamanan & Batasan Domain Mutlak (Wajib Dipatuhi)

1. **Penguncian Domain Khusus Lapaq**:
   - Agentic CS **hanya** boleh menjawab hal yang berkaitan dengan ekosistem platform toko online **Lapaq** (panduan fitur seller, kendala akun/toko, informasi pendaftaran calon seller, dan pengalihan sopan pembeli toko yang salah sambung).
   - Segala permintaan di luar Lapaq (membuat kode pemrograman, artikel umum, tugas sekolah, roleplay, mengorek instruksi sistem/prompt, atau mencari celah kecurangan kuota/kupon) **wajib ditolak di lapisan server & orchestrator**.

2. **Kerahasiaan Penyedia Infrastruktur Internal**:
   - **Dilarang keras** menyebut nama penyedia pembayaran, logistik agregator, atau penyimpanan internal di balik layar Lapaq kepada user maupun menyimpannya ke dalam `KnowledgeChunk` / `CaseMemory`.
   - Daftar istilah terlarang di output publik: `Midtrans`, `Pakasir`, `Pakkasir`, `iPaymu`, `Xendit`, `Faspay`, `Biteship`, `Cloudflare R2`, nama tabel SQL, path file kode sumber, dan rahasia `.env`. Gunakan istilah resmi merchant seperti *Pembayaran Online QRIS Lapaq*, *Virtual Account*, *Dompet*, dan *Pengiriman Kurir*.

3. **Zero-Secret DB Projection & Verifikasi Nomor Pengirim**:
   - Endpoint jembatan data Lapaq dilarang melakukan `SELECT` pada kolom sensitif (`password_hash`, `encrypted_seller_data` / NIK / KTP / NPWP / NIB, hash/kode OTP, token reset sandi, nomor rekening penuh, nominal saldo/omzet toko, atau data pribadi pembeli).
   - Verifikasi kecocokan nomor WA pengirim (`VERIFIED_OWNER` vs `UNVERIFIED_CALLER`) **wajib dieksekusi oleh kode backend TypeScript** berdasarkan JID pengirim asli dari WAHA, bukan klaim teks di dalam chat.

4. **Kebijakan Keuangan & Refund (Nol Janji)**:
   - Untuk topik uang, gunakan **Locked Financial Rules** (lihat `docs/PERSONA_AND_CONVERSATION_GUIDE.md`).
   - Setiap permintaan *refund*, pembatalan pembayaran langganan/add-on, atau sengketa dana **wajib langsung dieskalasi ke Admin/Tim Teknis** tanpa pernah menjanjikan persetujuan pengembalian dana.

5. **Isolasi Memori Kasus (`CaseMemory`)**:
   - Percakapan dari WhatsApp user **tidak boleh pernah menulis langsung** ke tabel lintas-user `CaseMemory`. Promosi solusi ke `CaseMemory` hanya boleh dilakukan oleh Admin terautentikasi melalui halaman `/issues`.

---

## 4. Aturan Portabilitas VPS & Saklar Operasional Bot

1. **Portabilitas VPS Tanpa Repo Lokal**:
   - Kode aplikasi runtime (`src/**`) **dilarang keras** membaca path absolut laptop lokal seperti `/Users/cahyo/Developer/Web/lapaq` atau `lapaq-sandbox`.
   - Ekstraksi kode sumber repo Lapaq hanya dijalankan melalui script CLI lokal yang menghasilkan file `data/lapaq-knowledge-bundle.json` (atau diunggah lewat UI Admin di VPS).
   - Jika koneksi API live ke Lapaq tidak aktif/belum diatur di VPS, sistem wajib berjalan mulus dalam mode `STANDALONE` tanpa melempar error.

2. **Saklar Master Bot (`OFF | ON_ALWAYS | ON_OUTSIDE_HOURS`) & Human Takeover**:
   - Hormati status saklar bot sebelum memanggil API Gemini. Saat `OFF`, tidak boleh ada pemanggilan LLM atau penundaan pesan masuk.
   - Saat operator manusia mengirim pesan manual ke suatu chat di `/inbox`, status `agentMode` chat tersebut wajib otomatis berpindah ke `HUMAN_TAKEOVER` sehingga bot tidak memotong percakapan.
