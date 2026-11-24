# WhatsApp Marketing & Web Tools (WAHA)

Aplikasi Web WhatsApp Clone & Marketing Tools yang dibangun menggunakan **Next.js (App Router)**, **Tailwind CSS**, **Prisma ORM (SQLite)**, dan ditenagai oleh **WAHA (WhatsApp HTTP API)**.

---

## 🚀 Panduan Memulai Cepat

### 1. Jalankan Engine WhatsApp (WAHA)
Jalankan service WAHA melalui Docker:

```bash
docker compose up -d
```

* Dashboard Swagger WAHA dapat diakses di: [http://localhost:3008](http://localhost:3008)
* WAHA akan otomatis menyimpan file sesi WhatsApp Anda di folder `./waha_sessions`.

### 2. Jalankan Aplikasi Web

```bash
npm run dev
```

Buka browser di: [http://localhost:3000](http://localhost:3000)

---

## ✨ Fitur-Fitur Utama

1. **Tampilan Mirip WhatsApp Web (Desktop)**
   - Balon obrolan masuk (*Incoming*) & keluar (*Outgoing*).
   - Indikator status centang WhatsApp (🕒 Menunggu, ✓ Terkirim, ✓✓ Tersampaikan, ✓✓ Biru Dibaca).
   - Pengiriman cepat dengan tombol `Enter` (dan `Shift + Enter` untuk baris baru).

2. **Manajemen Kontak & Validasi Otomatis**
   - **Import Excel (.xlsx) / CSV**: Unggah file kontak massal (contoh template tersedia di file `sample_contacts.csv`).
   - **Phone Number Sanitizer**: Otomatis mengubah nomor lokal `08xx` atau `+628xx` menjadi format standar WhatsApp `628xx`.
   - **Validasi WhatsApp Aktif**: Otomatis mengecek nomor yang terdaftar di WhatsApp sebelum pesan dikirim.

3. **Mulai Chat Baru Tanpa Simpan Nomor**
   - Cukup masukkan nomor HP pada modal **Chat Baru**, sistem langsung memverifikasi dan membuka ruang percakapan.

4. **Sinkronisasi Kontak dari WhatsApp**
   - Tombol sinkronisasi langsung menarik semua kontak yang tersimpan di akun WhatsApp Anda ke database lokal.

5. **Scan QR Code Interaktif**
   - Tombol status di sidebar membuka QR Code langsung dari WAHA untuk dipindai melalui aplikasi WhatsApp di HP Anda.

---

## 📁 Struktur Proyek

```
waha-marketing/
├── docker-compose.yml          # Konfigurasi container WAHA (Port 3008)
├── sample_contacts.csv         # Contoh file CSV untuk pengujian import kontak
├── prisma/
│   └── schema.prisma           # Skema SQLite (Contacts, Chats, Messages)
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── session/        # Status & QR Code API
│   │   │   ├── webhook/        # Webhook receiver dari WAHA
│   │   │   ├── contacts/       # CRUD kontak & sinkronisasi
│   │   │   ├── contacts/import # Parser Excel/CSV & validator
│   │   │   ├── chats/          # Daftar obrolan
│   │   │   └── messages/       # Pengiriman & riwayat pesan
│   │   ├── layout.tsx
│   │   └── page.tsx            # Halaman utama antarmuka WhatsApp Web
│   ├── components/
│   │   ├── Sidebar.tsx         # Sidebar chat & buku kontak
│   │   ├── ChatRoom.tsx        # Area percakapan & balon pesan
│   │   ├── QRModal.tsx         # Modal pemindai QR Code WAHA
│   │   ├── NewChatModal.tsx    # Modal chat langsung ke nomor baru
│   │   └── ImportContactModal.tsx # Modal import file Excel/CSV
│   └── lib/
│       ├── prisma.ts           # Prisma client singleton
│       ├── phone.ts            # Sanitasi & formatting nomor HP
│       └── waha.ts             # WAHA REST API client
```
