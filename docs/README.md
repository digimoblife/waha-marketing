# Indeks Dokumentasi Agentic Customer Service (`waha-marketing`)

Direktori `docs/` berisi spesifikasi produk, arsitektur sistem, desain memori, standar persona percakapan, pengamanan anti-kecurangan, dan prosedur pengujian untuk pengembangan fitur **Agentic Customer Service Lapaq** di dalam aplikasi `waha-marketing`.

Aturan kerja ringkas yang selalu aktif untuk agen pengembang berada di [../AGENTS.md](../AGENTS.md), sedangkan prosedur langkah-demi-langkah (*runbook*) berada di `.agents/skills/`.

---

## Daftar Dokumen Acuan

| Dokumen | Cakupan & Kegunaan |
| :--- | :--- |
| [PRD.md](./PRD.md) | **Product Requirements Document**: Latar belakang masalah, profil pengguna (3 audiens WA + Admin/Teknis), cerita pengguna (*User Stories*), skenario Kasus 1–3, saklar operasional bot, batasan produk (*non-goals*), dan metrik keberhasilan. |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | **Arsitektur Teknis & Portabilitas VPS**: Aliran webhook WAHA, *sliding-window debouncer*, simulasi indikator ketik manusia, orkestrasi multi-model Gemini (`@google/genai`), mekanisme 3 jalur sinkronisasi pengetahuan, serta desain portabel Lokal vs VPS. |
| [DATA_MODEL_AND_MEMORY.md](./DATA_MODEL_AND_MEMORY.md) | **Skema PostgreSQL + `pgvector` & Sistem Memori 3-Tier**: Desain tabel baru di Prisma, prosedur migrasi data dari SQLite (`dev.db`), pemisahan *Working Memory*, *Merchant Memory*, dan *Case Memory*, serta kontrak API internal. |
| [PERSONA_AND_CONVERSATION_GUIDE.md](./PERSONA_AND_CONVERSATION_GUIDE.md) | **Standar Persona Empatik & Aturan Fakta Lapaq**: Karakter suara Agent, larangan gaya bahasa robot, protokol *Empathize -> Clarify -> Step-by-Step Guide*, panduan baca *screenshot* & *voice note*, kamus singkatan UMKM, serta daftar fakta keuangan terkunci. |
| [SECURITY_AND_GUARDRAILS.md](./SECURITY_AND_GUARDRAILS.md) | **Model Ancaman & Pengamanan 5-Lapis Anti-Kecurangan**: Pencegahan intip data toko lain, isolasi *prompt injection*, daftar hitam redaksi penyedia internal, pembatasan topik khusus Lapaq, kuota anti-spam per nomor, dan *deterministic output guard*. |
| [TESTING_AND_EVALUATION.md](./TESTING_AND_EVALUATION.md) | **Strategi Pengujian, Golden Benchmark & Red-Teaming**: Daftar pengujian unit/integrasi, verifikasi skenario Kasus 1–3, evaluasi akurasi menggunakan soal nyata seller Lapaq, dan skenario uji penetrasi keamanan percakapan. |

---

## Daftar Workspace Skills (`.agents/skills/`)

| Nama Skill | Lokasi Berkas | Kapan Digunakan |
| :--- | :--- | :--- |
| `develop-agentic-cs` | [../.agents/skills/develop-agentic-cs/SKILL.md](../.agents/skills/develop-agentic-cs/SKILL.md) | Saat membangun atau mengubah fitur inti Agentic CS (Orchestrator Gemini, Tool Calling, Debouncer, Saklar ON/OFF, halaman `/issues`, kontrol `/inbox`). |
| `sync-lapaq-knowledge` | [../.agents/skills/sync-lapaq-knowledge/SKILL.md](../.agents/skills/sync-lapaq-knowledge/SKILL.md) | Saat memperbarui pengetahuan Agent dari repo Lapaq/sandbox, menarik 36+ tutorial dari `cs.lapaq.id`, memproses demo UI, dan men-generate `data/lapaq-knowledge-bundle.json` yang bersih dari rahasia internal. |
| `manage-lapaq-sandbox` | [../.agents/skills/manage-lapaq-sandbox/SKILL.md](../.agents/skills/manage-lapaq-sandbox/SKILL.md) | Saat menyiapkan/memperbarui clone lokal `/Users/cahyo/Developer/Web/lapaq-sandbox` dan mengembangkan endpoint internal read-only berprinsip *Zero-Secret Projection*. |
| `eval-and-redteam-agent` | [../.agents/skills/eval-and-redteam-agent/SKILL.md](../.agents/skills/eval-and-redteam-agent/SKILL.md) | Saat menguji kualitas empati bahasa, ketepatan panduan Lapaq, serta menjalankan uji serangan kecurangan (*Red-Team*) sebelum rilis. |

---

## Urutan Otoritas Dokumen

Apabila terdapat keraguan saat implementasi:
1. Aturan keamanan dan batasan rahasia di [SECURITY_AND_GUARDRAILS.md](./SECURITY_AND_GUARDRAILS.md) dan [../AGENTS.md](../AGENTS.md) bersifat mutlak dan tidak boleh dilanggar.
2. Kontrak tabel dan mode operasi di [DATA_MODEL_AND_MEMORY.md](./DATA_MODEL_AND_MEMORY.md) serta [ARCHITECTURE.md](./ARCHITECTURE.md) menjadi acuan struktur kode.
3. Perilaku fitur dan kriteria penerimaan mengacu pada [PRD.md](./PRD.md) dan [PERSONA_AND_CONVERSATION_GUIDE.md](./PERSONA_AND_CONVERSATION_GUIDE.md).
