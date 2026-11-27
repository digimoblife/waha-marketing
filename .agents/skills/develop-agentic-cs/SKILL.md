---
name: develop-agentic-cs
description: >-
  Guides the end-to-end development, modification, and debugging of the Lapaq Agentic Customer Service feature inside waha-marketing (PostgreSQL + pgvector schema, SQLite migration, Bot Master Switch, Webhook Debouncer, Gemini @google/genai Orchestrator, Security Guardrails, /issues tracker, and /inbox AI controls). Use this skill whenever building or modifying any backend, database, AI prompt, tool-calling, or UI component of the Agentic CS system.
---

# Develop Agentic Customer Service (`waha-marketing`)

Ikuti runbook ini secara berurutan setiap kali membangun atau memodifikasi komponen Agentic Customer Service agar selaras dengan spesifikasi arsitektur, portabilitas VPS, dan keamanan 5-lapis.

## 1. Baca Kontrak Spesifikasi yang Relevan
Sebelum menulis kode, baca hanya dokumen yang bersinggungan dengan komponen yang dikerjakan:
- Skema DB, migrasi SQLite -> PostgreSQL, memori `pgvector`, & kontrak API: [DATA_MODEL_AND_MEMORY.md](../../../docs/DATA_MODEL_AND_MEMORY.md)
- Aliran webhook, *debouncer*, *routing* model Gemini, & portabilitas VPS: [ARCHITECTURE.md](../../../docs/ARCHITECTURE.md)
- Gaya bahasa persona, langkah *step-by-step*, baca *screenshot*, & fakta uang baku: [PERSONA_AND_CONVERSATION_GUIDE.md](../../../docs/PERSONA_AND_CONVERSATION_GUIDE.md)
- Keamanan 5-lapis, redaksi provider, & pencegahan kecurangan: [SECURITY_AND_GUARDRAILS.md](../../../docs/SECURITY_AND_GUARDRAILS.md)

## 2. Urutan Invarian Pipeline Pesan Masuk (Wajib Dijaga)
Setiap perubahan pada `src/app/api/webhook/route.ts` atau `src/lib/agent/` wajib menjaga urutan gerbang berikut tanpa lompatan:
1. **Persistensi Dasar Dulu**: Simpan `Contact`, `Chat`, `Message`, dan unduh media ke `public/uploads/` terlebih dahulu sebelum mengecek logika AI.
2. **Gerbang Master Switch & Mode Chat**:
   - Segera hentikan jalur AI (0 pemanggilan Gemini, 0 *debounce* timer) bila `fromMe === true`, grup `@g.us`, `masterSwitch === "OFF"`, sedang di dalam jam kerja saat `masterSwitch === "ON_OUTSIDE_HOURS"`, atau `chat.agentMode === "HUMAN_TAKEOVER"`.
3. **Auto-Takeover Saat Admin Membalas Manual**:
   - Pada `src/app/api/messages/route.ts` (pengiriman pesan manual dari UI `/inbox`), pastikan pengiriman manual oleh operator otomatis memperbarui `chat.agentMode = "HUMAN_TAKEOVER"` dan membatalkan timer *debouncer* aktif pada `chatId` tersebut.
4. **Sliding-Window Debouncer (`5000 ms`)**:
   - Gabungkan rentetan pesan teks dan *screenshot* yang masuk berdekatan menjadi satu giliran eksekusi.
5. **Otorisasi Nomor di Server (Bukan di Prompt)**:
   - Tentukan `VERIFIED_OWNER` vs `UNVERIFIED_CALLER` menggunakan nomor JID WhatsApp pengirim di kode TypeScript sebelum memanggil tool diagnostik merchant.
6. **Eksekusi Gemini (`@google/genai`)**:
   - Bungkus seluruh input user di dalam `<untrusted_whatsapp_user_message>...</untrusted_whatsapp_user_message>`.
   - Gunakan model aktif terbaru kelas `Flash` (`gemini-3.8-flash` / `gemini-4-hydrogen` dengan `thinkingLevel: LOW`) untuk percakapan harian & pembacaan *screenshot* standar, kelas frontier (`gemini-4-argon` / `gemini-4-carbon` dengan `thinkingLevel: MEDIUM`) untuk fallback kasus ganjil, `gemini-3.5-flash-lite` untuk ringkasan `MerchantMemory`, dan `gemini-embedding-2` (`768` dimensi) untuk pencarian vektor (model lama `gemini-2.5-*` sudah didepresiasi Google per November 2026).
7. **Deterministic Output Guard**:
   - Wajib lewatkan teks hasil Gemini ke `validateAgentOutput()` sebelum memanggil WAHA. Blokir jika terdeteksi nama provider internal, URL di luar `*.lapaq.id`, atau janji *refund*.
8. **Human Presence Delivery**:
   - Jalankan `sendSeen` -> jeda singkat -> `startTyping` proporsional -> `stopTyping` -> `sendText`, lalu daftarkan ID pesan ke `markMessageProcessed()` agar tidak terjadi loop.

## 3. Aturan Portabilitas VPS (Pantangan Keras)
- **Dilarang keras** mengimpor atau membaca path lokal `/Users/cahyo/Developer/Web/lapaq` atau `lapaq-sandbox` di kode aplikasi `src/**`.
- Aplikasi runtime hanya boleh membaca bundel lokal `data/lapaq-knowledge-bundle.json`, tabel PostgreSQL, atau memanggil HTTP ke `cs.lapaq.id` / `LAPAQ_INTERNAL_API_URL` (dengan *graceful fallback* ke mode `STANDALONE` jika URL kosong atau gagal dihubungi).

## 4. Aturan Isolasi Memori & Eskalasi (`/issues`)
- Tool `create_escalation_issue` hanya boleh membuat baris `SupportIssue` berstatus `OPEN` dan mengubah `chat.agentMode = "WAITING_TECH"`.
- Tabel `CaseMemory` **hanya** boleh ditulis oleh endpoint Admin (`POST /api/issues/[id]/resolve` saat `isReusableCase === true` atau CRUD Admin), dan wajib melewati `sanitizeKnowledgeText()` sebelum dibuat vektor *embedding*-nya.

## 5. Langkah Validasi Setiap Selesai Mengedit
Jalankan verifikasi terpadu sebelum menyatakan pekerjaan selesai:
```bash
npx prisma validate && npx tsc --noEmit && npm run lint && npm test
```
Periksa juga `git diff --check` untuk memastikan tidak ada rahasia `.env` atau path mesin lokal yang ikut tertulis di kode produksi.
