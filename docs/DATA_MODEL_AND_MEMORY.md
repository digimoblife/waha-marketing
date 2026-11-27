# Model Data PostgreSQL + `pgvector`, Sistem Memori 3-Tier & Kontrak API

Dokumen ini menetapkan rancangan skema database PostgreSQL, prosedur migrasi utuh dari SQLite (`dev.db`), pemisahan tiga lapisan memori Agent, serta kontrak endpoint API internal.

---

## 1. Migrasi Database dari SQLite ke PostgreSQL 16 + `pgvector`

### Konfigurasi Infrastruktur
- Image Docker resmi: `pgvector/pgvector:pg16` pada `docker-compose.yml` dan `docker-compose.prod.yml`.
- Ekstensi wajib diaktifkan saat inisialisasi: `CREATE EXTENSION IF NOT EXISTS vector;`.
- Konfigurasi datasource di `prisma/schema.prisma`:

```prisma
datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [vector]
}

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}
```

### Prosedur Pemindahan Data Eksisting (`scripts/migrate-sqlite-to-pg.ts`)
Seluruh data yang sudah ada di `prisma/dev.db` wajib dipindahkan secara berurutan menjaga keutuhan relasi (*foreign key*):
1. `User` -> `AppSetting` -> `MessageTemplate`
2. `Contact` -> `ContactNote`
3. `Chat` -> `Message`
4. `BroadcastCampaign` -> `BroadcastRecipient`
5. `Log`

Script harus bersifat *idempotent* (`upsert` berdasarkan `id`) dan menampilkan laporan jumlah baris asal vs jumlah baris tujuan di akhir eksekusi.

---

## 2. Perluasan Tabel Eksisting & Tabel Baru Agentic CS

### A. Perluasan Tabel `Contact`, `Chat`, dan `BroadcastCampaign`

| Model | Field Baru | Tipe | Keterangan |
| :--- | :--- | :--- | :--- |
| `Contact` | `lapaqStoreSlug` | `String?` | Slug toko di Lapaq (mis. `warung-kopi-mantap`). |
| `Contact` | `onboardingStage` | `String?` | `DRAFT` \| `NO_CATEGORY` \| `NO_PRODUCT` \| `ACTIVE` \| `UNKNOWN`. |
| `Contact` | `productCount` | `Int?` | Cache jumlah produk terakhir yang diketahui. |
| `Contact` | `lastLapaqSyncAt` | `DateTime?` | Waktu terakhir sinkronisasi status toko. |
| `Chat` | `agentMode` | `String` | Default `"AI_ACTIVE"`. Nilai: `AI_ACTIVE` \| `STEP_BY_STEP` \| `WAITING_TECH` \| `HUMAN_TAKEOVER`. |
| `Chat` | `activeGuideState` | `String?` | JSON posisi panduan bertahap: `{ slug, title, currentStep, totalSteps, updatedAt }`. |
| `Chat` | `campaignContext` | `String?` | JSON konteks sapaan proaktif: `{ campaignId, goal, initialIssueHint, sentAt }`. |
| `Chat` | `aiTurnCountToday` | `Int` | Penghitung respons AI hari ini (WIB) untuk pembatasan anti-penyalahgunaan. |
| `Chat` | `aiTurnResetDate` | `String?` | Tanggal WIB `YYYY-MM-DD` terakhir penghitung di-reset. |
| `BroadcastCampaign` | `enableAiFollowup` | `Boolean` | Default `false`. Jika `true`, balasan penerima ditangani Agent lengkap dengan `campaignGoal`. |
| `BroadcastCampaign` | `campaignGoal` | `String?` | Tujuan kampanye (mis. `"onboarding_belum_setup_toko"` atau `"belum_upload_produk"`). |

### B. Tabel `KnowledgeChunk` (Basis Pengetahuan 360° Lapaq)

Menyimpan potongan pengetahuan terkurasi yang telah melewati filter sanitasi kata rahasia.

- `id`: `String @id @default(cuid())`
- `sourceType`: `String` — `"TUTORIAL"` | `"DEMO_UI"` | `"REPO_BUNDLE"` | `"RELEASE_NOTE"` | `"PUBLIC_FAQ"` | `"LOCKED_POLICY"` | `"QUICK_NOTE"`
- `sourceKey`: `String @unique` — Kunci unik deterministik (mis. `tutorial:tambah-produk-pertama:overview`, `addon:low_stock_alerts:config`) untuk mencegah duplikasi saat sinkron ulang.
- `title`: `String`
- `category`: `String`
- `content`: `String` — Teks panduan bersih berorientasi seller.
- `structuredMeta`: `String?` — JSON (mis. daftar `steps[]`, `requires[]`, URL bantuan `https://bantuan.lapaq.id/tutorial/...`, atau status fitur `ACTIVE | ADDON | COMING_SOON`).
- `contentHash`: `String` — SHA-256 isi konten agar hanya memanggil `gemini-embedding-2` jika isi berubah.
- `isActive`: `Boolean @default(true)`
- `embedding`: `Unsupported("vector(768)")?`
- `updatedAt`: `DateTime @updatedAt`

Indeks SQL tambahan: `CREATE INDEX knowledge_chunk_embedding_idx ON "KnowledgeChunk" USING hnsw (embedding vector_cosine_ops);`

### C. Tabel `MerchantMemory` (Memori Jangka Panjang Terisolasi per Merchant)

- `id`: `String @id @default(cuid())`
- `contactId`: `String @unique` (Relasi `1:1` ke `Contact`, `onDelete: Cascade`)
- `summary`: `String` — Ringkasan naratif singkat (maks 800 karakter) mengenai profil komunikasi merchant, perangkat yang biasa dipakai (HP/Laptop), dan riwayat kendala masa lalu.
- `factsJson`: `String?` — JSON fakta terstruktur non-sensitif (mis. kategori produk jualan, add-on yang pernah ditanyakan).
- `lastSummarizedMsgId`: `String?`
- `updatedAt`: `DateTime @updatedAt`

> **Aturan Isolasi**: `MerchantMemory` hanya boleh dimuat untuk `contactId` pemilik ruang chat yang sedang aktif, tidak pernah dicari lintas merchant.

### D. Tabel `SupportIssue` (Tiket Eskalasi Teknis & Kebijakan di Admin)

Mencatat seluruh masalah yang tidak dapat diselesaikan langsung oleh Agent (Kasus 2) maupun permintaan wajib eskalasi seperti *refund*.

- `id`: `String @id @default(cuid())`
- `code`: `String @unique` — Nomor tiket mudah dibaca, mis. `ISS-0001`.
- `chatId`: `String` (Relasi ke `Chat`)
- `contactId`: `String?` (Relasi ke `Contact`)
- `category`: `String` — `"TECHNICAL_BUG"` | `"UPLOAD_SAVE_ERROR"` | `"PAYMENT_WALLET"` | `"REFUND_REQUEST"` | `"OTHER"`
- `title`: `String`
- `symptomSummary`: `String` — Gejala masalah menurut keterangan user & observasi Agent.
- `stepsTried`: `String?` — Langkah pemeriksaan yang sudah dicoba bersama Agent sebelum eskalasi.
- `screenshotUrls`: `String?` — JSON array path gambar terkait di `/uploads/...`.
- `status`: `String @default("OPEN")` — `"OPEN"` | `"IN_PROGRESS"` | `"RESOLVED"`
- `techResolutionNote`: `String?` — Catatan internal penyelesaian dari divisi teknis/Admin.
- `publicUserSolution`: `String?` — Penjelasan ramah & aman yang boleh disampaikan Agent ke merchant serta dipakai untuk kasus serupa berikutnya.
- `isReusableCase`: `Boolean @default(false)` — Dicentang Admin bila penyelesaian ini berlaku umum untuk kasus serupa di masa depan.
- `followupConsent`: `Boolean @default(false)` — `true` bila merchant setuju dihubungi kembali setelah selesai ditangani.
- `followupSentAt`: `DateTime?` — Waktu Agent mengirimkan kabar penyelesaian ke WA merchant.
- `resolvedById`: `String?`
- `resolvedAt`: `DateTime?`
- `createdAt`: `DateTime @default(now())`
- `updatedAt`: `DateTime @updatedAt`

### E. Tabel `CaseMemory` (Memori Kolektif Penyelesaian Kasus Masa Lalu)

Hanya dapat dibuat atau diperbarui oleh aksi Admin terautentikasi (ketika menyelesaikan `SupportIssue` dengan `isReusableCase = true` atau input manual Admin).

- `id`: `String @id @default(cuid())`
- `issueId`: `String? @unique` (Relasi opsional ke `SupportIssue`)
- `title`: `String`
- `symptomPattern`: `String` — Deskripsi pola gejala & kondisi pemicu.
- `rootCause`: `String` — Penyebab masalah (sudah disanitasi tanpa istilah rahasia internal).
- `verifiedSolution`: `String` — Langkah solusi yang terbukti berhasil dan aman ditawarkan ke merchant lain.
- `applicability`: `String @default("PERMANENT")` — `"PERMANENT"` (aturan/solusi tetap) | `"TEMPORARY_INCIDENT"` (gangguan sesaat, tidak otomatis disarankan setelah diarsipkan).
- `isActive`: `Boolean @default(true)`
- `hitCount`: `Int @default(0)` — Berapa kali memori kasus ini membantu percakapan berikutnya.
- `embedding`: `Unsupported("vector(768)")?`
- `createdAt`: `DateTime @default(now())`
- `updatedAt`: `DateTime @updatedAt`

Indeks SQL tambahan: `CREATE INDEX case_memory_embedding_idx ON "CaseMemory" USING hnsw (embedding vector_cosine_ops);`

### F. Konfigurasi `agent_config` pada `AppSetting`

Disimpan pada tabel `AppSetting` dengan `key = "agent_config"`:
```json
{
  "masterSwitch": "OFF",
  "agentName": "Rani",
  "debounceMs": 5000,
  "maxDailyAiTurnsPerChat": 40,
  "primaryModel": "gemini-3.8-flash",
  "fallbackProModel": "gemini-4-argon",
  "liteModel": "gemini-3.5-flash-lite",
  "embeddingModel": "gemini-embedding-2",
  "lapaqConnectorMode": "STANDALONE",
  "lapaqInternalApiUrl": "",
  "autoFollowupOnIssueResolved": false
}
```

---

## 3. Kontrak API Internal

### A. Endpoint di `waha-marketing`
- `GET / PATCH /api/admin/agent/settings` — Membaca & mengubah konfigurasi saklar master bot, nama persona, model, dan batas kuota.
- `POST /api/admin/agent/knowledge/sync` — Memicu sinkronisasi online (`cs.lapaq.id` & `bantuan.lapaq.id`) dan mengindeks ulang `data/lapaq-knowledge-bundle.json`.
- `POST /api/admin/agent/knowledge/upload-bundle` — Mengunggah pembaruan `lapaq-knowledge-bundle.json` langsung di VPS tanpa rebuild Docker.
- `GET / POST / DELETE /api/admin/agent/knowledge/quick-notes` — CRUD catatan pengetahuan cepat Admin.
- `GET / POST / PATCH /api/issues` & `POST /api/issues/[id]/resolve` — Mengelola tiket eskalasi, mempromosikan ke `CaseMemory` (beserta pembuatan vektor `pgvector`), dan memicu pengiriman pesan *follow-up* penyelesaian oleh Agent.
- `PATCH /api/chats/[id]/agent-mode` — Mengubah mode chat (`AI_ACTIVE` <-> `HUMAN_TAKEOVER`) dari header `/inbox`.

### B. Endpoint Read-Only pada Clone Sandbox Lapaq (`/api/internal/cs/*`)
Wajib memvalidasi header `x-internal-cs-key` menggunakan perbandingan waktu konstan (`timingSafeEqual`):
1. `GET /api/internal/cs/merchant-diagnostic?senderPhone=628...&storeSlug=...`
   - Server Lapaq sendiri yang mencocokkan `senderPhone` dengan nomor pemilik toko untuk menentukan `callerAccessLevel: "VERIFIED_OWNER" | "UNVERIFIED_CALLER"`.
   - Mengembalikan hasil *7-Point Store Readiness* yang sudah dipangkas sesuai `callerAccessLevel` (0 data rahasia/PII/saldo).
2. `GET /api/internal/cs/platform-catalog`
   - Mengembalikan daftar paket langganan publik yang aktif, daftar add-on publik beserta harga/model tagihan/status promo aktif, serta ketentuan umum minimum dan biaya penarikan.
3. `GET /api/internal/cs/passive-merchants?minDays=3&limit=100`
   - Mengembalikan daftar pendaftar yang berhenti di tahap onboarding atau sudah membuat toko tetapi masih memiliki `0` produk aktif selama `>= minDays` hari untuk bahan *Campaign Awareness*.
