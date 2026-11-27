# Product Requirements Document (PRD): Agentic Customer Service Lapaq

- **Produk Induk**: `waha-marketing` (WhatsApp Web, Broadcast & Merchant CRM)
- **Status Dokumen**: Final v1.0 (Siap Eksekusi)
- **Target Database**: PostgreSQL 16 + `pgvector` (migrasi penuh dari SQLite `dev.db`)
- **Penyedia AI**: Google Gemini API (`@google/genai`)

---

## 1. Latar Belakang & Visi Produk

Seller UMKM yang mendaftar di platform **Lapaq** sering berhenti di tengah jalan saat setup toko atau bingung mengoperasikan fitur (seperti membuat produk pertama, memahami kenapa tombol terkunci, atau mengatur konfigurasi add-on). Chatbot dokumentasi konvensional gagal membantu karena terasa kaku seperti mesin penjawab otomatis, langsung melempar tautan artikel bantuan tanpa empati, tidak bisa melihat layar yang sedang dihadapi user, dan tidak belajar dari kasus anomali yang pernah diselesaikan tim teknis.

**Visi Produk**: Mengembangkan `waha-marketing` menjadi sistem **Agentic Customer Service berpersona manusia** untuk Lapaq yang:
1. Memiliki **empati, simpati, dan ritme komunikasi seperti CS manusia** (mendengarkan dan menggali letak kesulitan terlebih dahulu sebelum memandu perlahan).
2. Mampu **memecahkan masalah secara bertahap (*step-by-step*)**, termasuk membaca *screenshot* halaman dashboard maupun pesan suara (*voice note*) yang dikirim seller lewat WhatsApp.
3. Memiliki **Memori Jangka Panjang** atas riwayat merchant serta **Memori Kasus Kolektif (*Case Memory*)** dari isu masa lalu yang telah diselesaikan divisi teknis.
4. Menjalankan **siklus eskalasi tertutup**: mencatat masalah yang belum terpecahkan ke dashboard Admin untuk diteruskan ke divisi teknis, lalu menghubungi kembali merchant begitu masalah selesai ditangani.
5. Dapat digunakan secara proaktif untuk **Campaign Awareness / Follow-up Onboarding** kepada pendaftar pasif, serta **dapat diaktifkan atau dinonaktifkan kapan saja** sesuai kebutuhan operasional tim.
6. **100% Terkunci pada Konteks Lapaq & Anti-Kecurangan**: tidak dapat dimanipulasi user untuk membocorkan informasi internal, mengintip data rahasia toko lain, menjanjikan *refund*, atau dipakai untuk keperluan di luar Lapaq.

---

## 2. Profil Pengguna & Lawan Bicara

| Kelompok Pengguna | Peran & Konteks | Kebutuhan Utama |
| :--- | :--- | :--- |
| **1. Seller Terdaftar Lapaq** | Pemilik toko di Lapaq (baru daftar maupun sudah berjalan) yang menghubungi atau dihubungi via WhatsApp. | Dibantu menyelesaikan kendala toko/produk/pesanan/add-on dengan sabar seperti berbicara dengan staf CS sungguhan, serta mendapat kabar saat isu teknis selesai diperbaiki. |
| **2. Calon Seller (Prospek)** | Pengunjung yang tertarik membuka toko di Lapaq dan bertanya via WhatsApp. | Mendapat penjelasan ramah seputar fitur Lapaq, masa uji coba 14 hari, cara daftar, dan dukungan produk fisik/digital tanpa dikarang. |
| **3. Pembeli Toko (*Salah Sambung*)** | Konsumen akhir yang berbelanja di salah satu toko merchant Lapaq namun mengira nomor CS Lapaq adalah CS penjual barang. | Dijelaskan dengan sopan bahwa nomor ini adalah CS platform Lapaq dan diarahkan ke halaman `/cek-pesanan` atau kontak WhatsApp resmi toko tempat ia membeli. |
| **4. Admin / Operator CS** | Staf internal pengelola `waha-marketing`. | Menyalakan/mematikan bot sesuai jam/kebutuhan, mengambil alih chat manual kapan pun, memantau tiket eskalasi, mempromosikan solusi teknis ke memori Agent, dan menjalankan kampanye *follow-up* seller pasif. |
| **5. Penghubung Divisi Teknis** | Admin yang meneruskan isu anomali ke engineer Lapaq dan mencatat penyelesaiannya di `waha-marketing`. | Melihat rangkuman masalah yang jelas (gejala, langkah yang sudah dicoba, *screenshot*), memperbarui status penyelesaian di halaman Admin, dan memicu pemberitahuan balik ke merchant. |

---

## 3. Skenario Inti yang Wajib Didukung

### Skenario 1 — Follow-Up Proaktif Awareness & Respons Empatik
1. Sistem mengidentifikasi seller yang sudah mendaftar beberapa hari tetapi belum menuntaskan setup toko atau belum mengunggah produk.
2. Agent mengirim sapaan personal: *"Halo kak [Nama Toko], saya [Nama Agent], saya lihat kakak sudah mendaftar tapi belum melanjutkan untuk membuat Toko, apakah ada yang bisa saya bantu?"*
3. Saat seller menjawab *"saya ada kesulitan di membuat produk"*, Agent **dilarang** langsung menyuruh baca tautan bantuan. Agent wajib merespons secara empatik dan menggali kendalanya: *"Kalau boleh tahu kakak kesulitan di bagian mana, biar [Nama Agent] bisa bantu?"*

### Skenario 2 — Diagnosa Isu Anomali, Cek Memori Kasus, & Eskalasi Teknis Tertutup
1. Seller melaporkan kendala ganjil, misalnya: *"saya kok tidak bisa upload gambar ya?"* -> setelah digali ternyata *"upload gambar seperti biasa tapi waktu mau simpan produk katanya tidak bisa"*.
2. Agent memeriksa:
   - Aturan validasi Lapaq (apakah ukuran > 2 MB, format bukan JPG/PNG/WebP, belum ada kategori, atau kolom berat wajib kosong), serta
   - **Memori Kasus (`CaseMemory`)** apakah pernah terjadi kasus serupa sebelumnya.
3. Bila di memori sudah pernah ada kasus serupa yang terverifikasi, Agent menawarkan langkah penyelesaian kasus tersebut terlebih dahulu.
4. Bila belum pernah ada atau seller melapor *"sudah saya coba tapi tetap tidak bisa"*, Agent mencatat isu ke daftar tiket eskalasi Admin (`SupportIssue`), meminta izin waktu untuk meneruskan ke divisi teknis, dan bertanya sopan: *"Apakah boleh saya hubungi kembali jika tim teknis sudah menangani masalah ini?"*
5. Saat Admin memperbarui status tiket menjadi `RESOLVED` beserta keterangan penyelesaiannya di halaman Admin `waha-marketing`, solusi tersebut masuk ke sistem `CaseMemory` (bila ditandai relevan untuk kasus mendatang) dan Agent dapat mengirimkan kabar penyelesaian ke WhatsApp seller.

### Skenario 3 — Panduan Langkah demi Langkah (*Step-by-Step*) & Pembacaan Screenshot
1. Seller bertanya cara mengatur fitur spesifik, misal: *"saya sudah install addon limit stok tapi tidak tahu dimana saya bisa konfigurasi berapa stok minimumnya"*.
2. Agent menanyakan posisi halaman seller saat ini terlebih dahulu (*"Kalau boleh tahu kakak sekarang ada di halaman apa?"*), lalu memandu **satu langkah per balasan** sambil menunggu konfirmasi seller (*buka menu Add-on* -> *cari Info Stok Menipis lalu klik Kelola* -> *masuk tab Konfigurasi*).
3. Ketika seller bingung menemukan letak kolom di layarnya, Agent proaktif meminta *screenshot* halaman saat ini, membaca gambar tersebut secara visual, dan menunjukkan letak serta nama elemen form secara akurat (*"Pada kartu Batas Minimum Stok terdapat kolom Jumlah stok minimum..."* atau memberi tahu jika saklar add-on belum diaktifkan sehingga kolomnya terkunci).

---

## 4. Kebutuhan Fungsional & Kriteria Penerimaan

### A. Kontrol Operasional Bot (Saklar Fleksibel)
- **FR-01 Master Switch 3-Mode**: Admin dapat mengubah status sistem Agentic CS kapan saja melalui topbar/sidebar dan halaman Pengaturan:
  - `OFF`: Bot nonaktif sepenuhnya; 0 pemanggilan API Gemini; aplikasi bekerja 100% sebagai WhatsApp Web & Broadcast biasa.
  - `ON_ALWAYS`: Bot aktif merespons otomatis seluruh chat personal yang berstatus `AI_ACTIVE` / `STEP_BY_STEP`.
  - `ON_OUTSIDE_HOURS`: Bot hanya aktif di luar jam operasional kerja (`workStart`–`workEnd` WIB pada pengaturan SLA).
- **FR-02 Kontrol Per-Chat & Auto-Takeover**:
  - Setiap ruang obrolan personal memiliki status `agentMode` (`AI_ACTIVE`, `STEP_BY_STEP`, `WAITING_TECH`, `HUMAN_TAKEOVER`).
  - Grup WhatsApp (`@g.us`) selalu dikecualikan dari balasan otomatis Agent.
  - Begitu Admin/Operator mengirim pesan manual dari halaman `/inbox`, `agentMode` otomatis berubah menjadi `HUMAN_TAKEOVER` agar Agent tidak memotong pembicaraan manusia, dan dapat dikembalikan ke `AI_ACTIVE` lewat tombol satu klik.
- **FR-03 Kontrol Per-Broadcast Campaign**:
  - Saat membuat kampanye di `/broadcast`, Admin dapat memilih apakah balasan penerima akan ditangani oleh AI Agent (beserta konteks tujuan kampanyenya) atau ditangani manual.

### B. Pengalaman Percakapan Manusiawi & Multimodal
- **FR-04 Message Debouncing**: Rentetan pesan teks/gambar yang dikirim user dalam jeda singkat (bawaan 5 detik, dapat diatur) digabungkan menjadi satu konteks sebelum diproses Agent agar tidak membalas berkali-kali.
- **FR-05 Human Presence Simulation**: Sebelum mengirim balasan, sistem mengirim tanda baca (`sendSeen`) dan menampilkan indikator *sedang mengetik...* (`typing`) dengan durasi wajar (2–5 detik).
- **FR-06 Multimodal Input**: Agent dapat membaca lampiran gambar (*screenshot* halaman dashboard/toko) dan pesan suara (*voice note*) yang sudah diunduh ke penyimpanan lokal oleh webhook WAHA.

### C. Pengetahuan 360° Lapaq & Portabilitas VPS
- **FR-07 Multi-Source Knowledge Sync**:
  - Menarik otomatis 36+ tutorial resmi terbaru dari `https://cs.lapaq.id/v1/help/catalog` dan peta layar demo dari `bantuan.lapaq.id`.
  - Membaca bundel fitur, daftar add-on, aturan validasi, dan catatan rilis dari `data/lapaq-knowledge-bundle.json` (diekstrak dari sandbox repo Lapaq di lokal dan dapat diunggah ulang melalui halaman Admin di VPS tanpa memerlukan repo Lapaq di server VPS).
  - Menyediakan form **Quick Knowledge Admin** untuk menambahkan catatan/aturan baru secara instan dari antarmuka web.
- **FR-08 Konektor Data Merchant Adaptif**:
  - Mendukung mode `STANDALONE` (menggunakan data tabel `Contact`/CSV di `waha-marketing` tanpa error saat di VPS) maupun mode `API_CONNECTED` (membaca status onboarding, kesiapan 7 syarat toko, dan katalog harga/promo live dari endpoint internal read-only Lapaq).

### D. Sistem Memori & Eskalasi Divisi Teknis (`/issues`)
- **FR-09 Memori 3-Lapis**:
  - *Working Memory* (konteks obrolan aktif & posisi langkah panduan).
  - *Merchant Memory* (ringkasan histori per kontak merchant).
  - *Case Memory* (basis data vektor kasus & solusi terverifikasi lintas merchant di PostgreSQL `pgvector`).
- **FR-10 Halaman Admin Issue Tracker (`/issues`)**:
  - Menampilkan semua tiket yang dieskalasi Agent (termasuk kendala teknis anomali maupun permintaan *refund*/pembatalan).
  - Admin dapat mengubah status tiket (`OPEN` -> `IN_PROGRESS` -> `RESOLVED`), menulis catatan teknis & pesan solusi untuk merchant, mencentang **"Simpan ke Case Memory"**, dan menekan tombol **"Kirim Kabar Penyelesaian via Agent"** bagi merchant yang telah menyetujui *follow-up*.

### E. Pengamanan Anti-Kecurangan & Pembatasan Topik
- **FR-11 Strict Lapaq Scope & Zero-Secret Security**:
  - Menolak seluruh permintaan di luar topik Lapaq, upaya *prompt injection*, upaya mengintip data sensitif toko milik orang lain, serta pancingan informasi infrastruktur/penyedia internal.
  - Wajib eskalasi langsung ke Admin tanpa menjanjikan apa pun untuk seluruh permintaan *refund* atau pembatalan pembayaran langganan/add-on.
  - Menerapkan batas kuota respons AI harian per nomor WA untuk mencegah penyalahgunaan kuota.

---

## 5. Non-Goals (Di Luar Cakupan Produk)

1. Agent **tidak** melakukan aksi perubahan data (*write/mutation*) ke database Lapaq (tidak bisa mereset password, mengubah saldo, menyetujui penarikan uang, mengaktifkan paket berbayar, atau menghapus akun secara langsung).
2. Agent **tidak** melayani percakapan di dalam grup WhatsApp.
3. Agent **tidak** menggantikan keputusan persetujuan *refund* atau verifikasi pencairan dana oleh Superadmin/Admin manusia.
4. Tidak mengintegrasikan tiket ke aplikasi pihak ketiga eksternal (Jira/Linear/Slack) pada rilis ini; seluruh pengelolaan isu dilakukan terpusat di halaman Admin `waha-marketing`.

---

## 6. Prioritas Fitur & Tahapan Rilis

| Prioritas | Cakupan Fitur |
| :--- | :--- |
| **P0 (Wajib Rilis Inti)** | Migrasi PostgreSQL + `pgvector` + pemindahan data `dev.db`; Master Switch Bot (`OFF`/`ON_ALWAYS`/`ON_OUTSIDE_HOURS`) & Auto-Takeover `/inbox`; Debouncer + Typing Simulator; Gemini Orchestrator (Persona Empatik, Step-by-Step, Baca Screenshot); Knowledge Sync (`cs.lapaq.id` + `lapaq-knowledge-bundle.json`); Guardrail Keamanan 5-Lapis; Halaman Admin `/issues` + `CaseMemory` + Follow-up Penyelesaian. |
| **P1 (Pengayaan Operasional)** | Integrasi *Awareness Campaign* seller pasif di `/broadcast` dengan `campaignContext`; pembacaan *Voice Note* audio merchant; konektor API read-only pada clone `lapaq-sandbox` (*7-Point Store Readiness* & katalog tarif live); fitur *Quick Knowledge* di Admin. |
| **P2 (Pengembangan Lanjutan)** | Pengiriman balik gambar panduan bertanda (*annotated reference screenshot*) otomatis saat panduan langkah; saran draf balasan (*AI Co-Pilot Whisper*) untuk operator manusia saat mode `HUMAN_TAKEOVER`. |

---

## 7. Metrik Keberhasilan

1. **Kualitas Empati & Anti-Bot**: 0 balasan pertama pada keluhan kesulitan yang langsung melempar tautan bantuan tanpa empati/klarifikasi pada pengujian skenario.
2. **Keamanan & Kepatuhan Batasan**: **100% lulus** seluruh skenario *Red-Team Security Test* (0 kebocoran nama payment gateway/infrastruktur internal, 0 kebocoran data sensitif antar-toko, 0 janji *refund*, 100% penolakan topik di luar Lapaq).
3. **Pembelajaran Memori Kasus**: Tiket yang diselesaikan Admin dan dipromosikan ke `CaseMemory` berhasil ditemukan kembali dan disarankan secara relevan ketika user lain melaporkan gejala serupa.
4. **Kinerja & Efisiensi**: Waktu respons rata-rata Agent (termasuk simulasi ketik natural) berada di kisaran 4–9 detik setelah pesan terakhir user berhenti, dengan kontrol anggaran token harian yang terukur.
