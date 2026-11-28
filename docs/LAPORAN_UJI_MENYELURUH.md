# Laporan uji menyeluruh WAHA Marketing

**Tanggal** 28 November 2026 · **Commit** `9a015ed` (`main`, tanpa perubahan kode)
**Keputusan** **Belum siap produksi.** Ada 5 bug berdampak tinggi (2 menyebabkan pesan hilang permanen, 2 celah keamanan yang bisa dieksploitasi dari luar, 1 sesi akun nonaktif tetap hidup).

> **Pembaruan 28 Nov 2026:** T-01 s.d. T-05 **sudah diperbaiki** (belum di-commit) dan diverifikasi ulang di build produksi dengan WAHA tiruan. Tes regresi ada di `tests/high-bug-fixes.test.ts` (48/48 tes lulus). Temuan sedang/minor dan QA-01 s.d. QA-06 di laporan sebelumnya **belum** diperbaiki.

Laporan ini melengkapi [LAPORAN_AUDIT_QA.md](./LAPORAN_AUDIT_QA.md). Temuan QA-01 s.d. QA-06 dan SEC-01 s.d. SEC-03 di laporan itu **masih berlaku** karena kodenya belum berubah, dan tidak diulang di sini.

## Cara pengujian

- Lint, `tsc --noEmit`, 41 tes bawaan, dan `next build` produksi: **semua lulus**.
- Salinan repo dijalankan sebagai server produksi di PostgreSQL 16 + pgvector terisolasi (container Docker sementara) dan **WAHA tiruan** yang mencatat setiap request.
- 19 skenario webhook/API disimulasikan (teks, link, retry, media, stiker, voice note, lokasi, LID, `@s.whatsapp.net`, grup, ACK, gagal kirim, broadcast, restart server).
- UI diuji di browser: inbox, 11 halaman workspace/admin, link, media, ID HTML ganda.
- Gemini live, Lapaq live, dan nomor WhatsApp asli **tidak** diuji.

## Yang sudah berfungsi baik

- Semua halaman dimuat tanpa error JS; **tidak ada atribut `id` HTML ganda** di 11 halaman.
- Link di bubble chat **bisa diklik**: `https://…`, `www.…` (diberi `https://`), tanda baca/kurung penutup dipisah dengan benar, buka di tab baru dengan `rel="noopener"`. Kartu preview OG muncul.
- Retry webhook dengan ID yang sama diabaikan; nomor `@s.whatsapp.net` dan LID dengan `remoteJidAlt` masuk ke chat yang sama (tidak ada chat ganda).
- Gambar dari WAHA diunduh ke `/uploads` dan tampil; video streaming (HTTP 206) berfungsi.
- Broadcast menghapus nomor ganda (`0812…`, `62812…`, `+62 812-…` → 1 penerima).
- Path traversal di `/uploads/..` ditolak.

## Bug berdampak tinggi

### T-01 · Pesan asli terhapus permanen dari database saat isinya sama dalam 15 detik
**Status: diperbaiki.** Dedupe hanya berdasarkan ID stanza, endpoint baca tidak lagi menghapus baris. Dedupe echo di webhook hanya mencocokkan isi untuk baris ber-ID sementara (`out_`, `ai_`, `bc_`).

Merchant mengirim "ok" dua kali (dua pesan WhatsApp berbeda) → **hanya 1 tersisa, yang lain di-`DELETE` dari DB** saat inbox dibuka. Sama untuk operator yang sengaja mengirim "Terima kasih" dua kali. Terkonfirmasi (S3, S17).
Penyebab: `GET /api/messages` menganggap isi + arah + ember 15 detik sebagai duplikat, lalu menghapusnya. [messages/route.ts:65](../src/app/api/messages/route.ts#L65)
Saran: dedupe hanya berdasarkan ID stanza; jangan pernah menghapus baris di endpoint baca.

### T-02 · Pesan grup dari peserta yang sama dibuang
**Status: diperbaiki.** `extractStanzaId` mengenali format grup dan membuang JID peserta di akhir; pencarian ACK/duplikat juga mencocokkan ID grup.

Tiga pesan grup berturut-turut dari 1 peserta → **ketiganya diabaikan** (`duplicate_in_memory`). Terkonfirmasi.
Penyebab: ID grup berformat `false_<grup>_<STANZA>_<peserta>`; `extractStanzaId` mengambil bagian terakhir (= JID peserta), sehingga semua pesan peserta itu dianggap stanza yang sama. Hal yang sama memicu penghapusan di T-01. [msg-cache.ts:13](../src/lib/msg-cache.ts#L13)

### T-03 · Stored XSS lewat file SVG
**Status: diperbaiki.** Upload memakai daftar tipe yang diizinkan (SVG/HTML/XML/JS ditolak, 415) dan batas 64 MB. `/uploads` mengirim `nosniff`; tipe di luar gambar/video/audio/PDF disajikan sebagai unduhan dengan `CSP: sandbox`.

Upload `x.svg` berisi `<script>` → disajikan dari origin aplikasi sebagai `image/svg+xml`, **tanpa login** dan tanpa CSP. Membuka file (tombol Unduh/lightbox/link dokumen) menjalankan skrip dengan sesi Admin. Merchant dari luar juga bisa mengirim SVG sebagai dokumen WhatsApp yang lalu diunduh ke `/uploads`.
[uploads route:15](../src/app/uploads/[...path]/route.ts#L15) · [media/upload](../src/app/api/media/upload/route.ts)
Saran: whitelist tipe file, sajikan SVG/HTML sebagai `attachment` + `Content-Security-Policy: sandbox`, batasi ukuran.

### T-04 · SSRF di link preview
**Status: diperbaiki.** `src/lib/safe-fetch.ts` memeriksa setiap alamat hasil DNS saat koneksi dibuat (menutup DNS rebinding), memblokir IP privat/loopback/link-local v4 dan v6 (termasuk IPv4-mapped), nama host satu label (`waha`, `postgres`), dan mengecek ulang setiap redirect (maks. 3).

`/api/link-preview` berhasil memanggil layanan internal lewat `localtest.me`, `[::1]`, dan `[::ffff:127.0.0.1]` (tercatat di log WAHA tiruan). Redirect juga diikuti tanpa cek ulang. Karena preview dipicu otomatis untuk link di pesan masuk, **merchant mana pun bisa memicunya**.
Penyebab: cek host hanya berbasis string (`hostname` IPv6 berbentuk `[::1]`, DNS tidak di-resolve), `redirect: 'follow'`. [link-preview/route.ts:24](../src/app/api/link-preview/route.ts#L24) · [:114](../src/app/api/link-preview/route.ts#L114)
Saran: resolve DNS lalu tolak IP privat/loopback/link-local (v4 & v6), `redirect: 'manual'` dengan cek ulang tiap hop.

### T-05 · Operator yang dinonaktifkan tetap bisa membaca & mengirim pesan
**Status: diperbaiki.** Middleware menanyakan status akun dan role ke database lewat rute internal `/api/auth/session-status` (dilindungi secret server), dengan cache 15 detik. Akun nonaktif kehilangan akses dalam ±15 detik dan cookie-nya dihapus; role di database menggantikan role di token. Jika pengecekan gagal (DB down), middleware kembali memakai token agar operator tidak terkunci semua.

Setelah Admin menonaktifkan `op1`, cookie lamanya masih mendapat `200` untuk `GET /api/chats` dan `POST /api/messages` (pesan terkirim). Berlaku sampai JWT kedaluwarsa (7 hari); perubahan role juga tidak berlaku.
Penyebab: middleware hanya memverifikasi tanda tangan JWT, tanpa cek `isActive`/role ke DB. [middleware.ts:53](../src/middleware.ts#L53)

## Bug berdampak sedang

| ID | Temuan | Bukti / lokasi |
| --- | --- | --- |
| S-01 | **Preview media rusak saat file WAHA kedaluwarsa.** URL tetap `http://localhost:3000/api/files/…`, jadi link dokumen mengarah ke localhost di browser operator. Video/audio tidak punya fallback. Endpoint baca juga mencoba mengunduh ulang setiap polling 3 detik tanpa timeout. | Terkonfirmasi di UI. [messages/route.ts:86](../src/app/api/messages/route.ts#L86), [waha-media.ts:111](../src/lib/waha-media.ts#L111) |
| S-02 | **Bubble kosong.** Media yang gagal diunduh WAHA (`mediaUrl: null`) dan pesan lokasi/kontak/polling tampil sebagai bubble kosong tanpa keterangan. | 2 bubble kosong di UI. [waha-media.ts:52](../src/lib/waha-media.ts#L52) |
| S-03 | **Voice note tidak dikenali tipenya.** File `.oga`/`.opus` disajikan sebagai `application/octet-stream`; Safari gagal memutar. | `curl -I` → octet-stream. [uploads route:24](../src/app/uploads/[...path]/route.ts#L24) |
| S-04 | **Status centang mundur & pesan gagal tak terlihat.** ACK "dibaca" (3) yang disusul ACK "terkirim" (2) menurunkan status ke 2. ACK error (-1) ditampilkan sama dengan "terkirim" (satu centang). | S15 → 2. [webhook/route.ts:517](../src/app/api/webhook/route.ts#L517), [InboxChatPanel.tsx:748](../src/components/inbox/InboxChatPanel.tsx#L748) |
| S-05 | **Broadcast macet setelah restart server.** Kampanye tetap `RUNNING` dengan penerima `QUEUED` dan tidak ada worker yang melanjutkan. | Terkonfirmasi (1/3 terkirim, macet). Tidak ada resume saat startup. |
| S-06 | **Broadcast dengan AI follow-up menimpa takeover manual.** Chat yang sedang `HUMAN_TAKEOVER` dipaksa kembali ke `AI_ACTIVE`, bertentangan dengan aturan takeover di AGENTS.md. | [broadcast-worker.ts:156](../src/lib/broadcast-worker.ts#L156) |
| S-07 | **Key/ID React ganda di daftar "merchant pasif".** Dua merchant dengan nomor sama menghasilkan dua entri `manual_<nomor>` karena dedupe hanya terhadap daftar lama. | [broadcast/page.tsx:232](../src/app/(workspace)/broadcast/page.tsx#L232) |
| S-08 | **Deep link `/inbox?phone=0812…` membuka chat hantu** `0812…@c.us` (bukan `62812…`); pesan dari sana gagal. | Terkonfirmasi di UI. [inbox/page.tsx:215](../src/app/(workspace)/inbox/page.tsx#L215) |
| S-09 | **Kirim media ≤ 5 MB memakai `data:` URL di field `file.url`.** WAHA mendokumentasikan `file.data` untuk base64; perlu diverifikasi dengan WAHA asli sebelum produksi. | [messages/route.ts:229](../src/app/api/messages/route.ts#L229) |

## Temuan minor

- Riwayat chat dibatasi 200 pesan terbaru tanpa "muat lebih lama". [messages/route.ts:48](../src/app/api/messages/route.ts#L48)
- Filter `?tag=VIP` ikut mengembalikan tag `NONVIP` (pencocokan substring); tag ganda (`VIP,VIP`) menghasilkan key React ganda. [contacts/route.ts:31](../src/app/api/contacts/route.ts#L31)
- Nama grup tampil sebagai ID mentah (`120363…`), bukan nama grup.
- Upload tanpa batas ukuran/tipe; file `/uploads` bisa diakses tanpa login (nama mudah ditebak).
- Tidak ada pembatasan percobaan login (12 percobaan salah berturut-turut diterima).
- `nginx-waha.conf` hanya `listen 80`, sedangkan cookie memakai `Secure` di produksi. Pastikan TLS aktif (misalnya lewat Cloudflare) atau login akan gagal.

## Urutan perbaikan yang disarankan

1. T-01 dan T-02 (kehilangan data), lalu T-03, T-04, T-05 (keamanan).
2. QA-01/QA-02 dari laporan sebelumnya (bot tetap membalas setelah takeover/saklar OFF).
3. S-01 s.d. S-05, kemudian sisanya.
