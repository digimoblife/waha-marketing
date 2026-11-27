# Referensi Whitelist Fitur, Rute Orphan, & Redaksi Kata Rahasia Lapaq

Dokumen ini menjadi acuan penyaringan wajib saat mengekstrak pengetahuan dari repositori Lapaq ke `data/lapaq-knowledge-bundle.json` maupun saat memvalidasi isi `KnowledgeChunk` dan `CaseMemory`.

---

## 1. Daftar Kata Penyedia & Infrastruktur Internal (Wajib Diredaksi / Diblokir)

Seluruh kata berikut **tidak boleh muncul** di dalam `data/lapaq-knowledge-bundle.json`, `KnowledgeChunk`, `CaseMemory`, maupun balasan WhatsApp Agent:

| Kategori | Kata Terlarang (Case-Insensitive) | Pengganti Resmi untuk Seller |
| :--- | :--- | :--- |
| **Payment Gateway** | `midtrans`, `pakasir`, `pakkasir`, `ipaymu`, `xendit`, `faspay`, `amazon payment` | *Pembayaran Online QRIS Lapaq* atau *Virtual Account* |
| **Agregator Kurir** | `biteship`, `biteship_api_key`, `biteship_workspace` | *Sistem Pengiriman Lapaq* / *Kurir Pengiriman* |
| **Penyimpanan & Cloud** | `cloudflare r2`, `r2 bucket`, `wrangler`, `d1 database`, `redis` | *Penyimpanan Lapaq* / *Sistem Lapaq* |
| **Kode & Skema DB** | `drizzle-orm`, `pgvector`, `schema.pg.ts`, `password_hash`, `encrypted_seller_data`, `email_otp_hash`, `superadmin_accounts` | *(Jangan pernah disebut sama sekali)* |

---

## 2. Daftar Rute Orphan / Tersembunyi (Dilarang Masuk ke Pengetahuan Seller)

Rute berikut ada di kode sumber `lapaq`, tetapi tidak ditautkan pada navigasi resmi seller. **Jangan buat panduan untuk rute ini:**
- `/{storeSlug}/admin/vouchers` (impor kode voucher digital lama)
- `/{storeSlug}/admin/affiliates` (modul afiliasi orphan)
- `/{storeSlug}/admin/spotlight` (digantikan oleh ikon bintang *Atur produk unggulan* di daftar produk)
- `/{storeSlug}/admin/retention` (dialihkan ke menu *Kupon > tab Kupon retensi*)
- `/{storeSlug}/admin/seller-profile`
- `/{storeSlug}/admin/config?tab=notifications` (tab integrasi bot Telegram tersembunyi)

---

## 3. Klasifikasi Status Fitur & Add-on (Cegah Halusinasi Menu)

Pastikan setiap entri pengetahuan menandai status ketersediaan fitur dengan akurat:

### A. Fitur Inti Aktif
- **Dashboard** (`/{toko}/admin`)
- **Pesanan** (`/orders`) — termasuk proses pesanan, input resi wajib, konfirmasi transfer manual, cetak invoice & label massal, ekspor CSV.
- **Katalog Produk** (`/physical-product`, `/digital-product`, `/collections`) — kategori wajib dibuat lebih dulu sebelum tombol *Tambah produk* aktif; varian maks 20; pre-order; foto `JPG/PNG/WebP` maks `2 MB` hingga 5 foto.
- **Pelanggan** (`/members`) — member & tamu.
- **Laporan Aktif** (`/reports`) — Penjualan, Pesanan, Waktu tersibuk, Produk terlaris, Penjualan per kategori, Stok produk, Unduhan produk digital, Pelanggan baru & berulang, Penjualan per kota, Cohort, Metode pembayaran, Kurir & ongkir, Ringkasan keuangan.
- **Dompet** (`/wallet`) — Saldo tersedia, Menunggu cair (settlement QRIS H+1 pukul 12.00 WIB), Rekening pencairan, Tarik saldo (dengan OTP email), Aktivitas dompet.
- **Pengaturan Aktif** (`/config`) — Umum, Tampilan toko, Informasi Toko, SEO, Pengiriman (termasuk kurir instan + pin peta & buffer ongkir), Pembayaran (simpan perubahan butuh OTP email), Billing/Langganan, Akun (ganti sandi, unduh data, hapus akun terjadwal 14 hari).

### B. Fitur Berbasis Add-on (`/{toko}/admin/add-ons/[code]`)
Wajib mencantumkan kode add-on dan lokasi pengaturannya yang tepat:
1. `coupon_system` (**Kupon Diskon**) -> dikelola di menu **Kupon** (`/coupons`) & detail **Pesanan** (kupon retensi).
2. `featured_products` (**Produk Unggulan**) -> dikelola lewat **ikon bintang** pada daftar Produk Fisik/Digital (maks 5 slot gabungan).
3. `whatsapp_floating` (**WhatsApp Mengambang**) -> nomor diatur di **Pengaturan > Umum**.
4. `social_media` (**Media Sosial**) -> tautan diatur di **Pengaturan > Umum**.
5. `ticker_bar` (**Ticker Bar**) -> teks diatur di **Pengaturan > Informasi Toko**, gaya di **Pengaturan > Tampilan toko**.
6. `store_schedule` (**Jadwal Toko**) -> jam operasional diatur di **Pengaturan > Informasi Toko**.
7. `product_import` (**Impor Produk**) -> sistem kuota per produk berhasil; diakses dari tombol **Impor** di daftar produk atau ekstensi Chrome **Lapaq Migrator**.
8. `xtra_product` (**Xtra Product**) -> penambah kapasitas +200 slot produk toko.
9. `stock_lock` (**Stock Lock**) -> batas minimal & maksimal pembelian pada form tambah/edit produk.
10. `low_stock_alerts` (**Info Stok Menipis**) -> tombol **Kelola** membuka tab **Konfigurasi** (`?tab=configuration`) berisi kartu **Batas Minimum Stok** -> kolom **Jumlah stok minimum** (`0`–`99999`); membutuhkan status add-on **Aktif** agar kolom tidak terkunci.
11. `store_reviews` (**Ulasan dan Rating**) -> dikelola di menu **Ulasan dan rating** (`/reviews`).
12. `merchant_analytics` (**Analitik & Pixel**) -> cek status katalog/rilis terbaru (mendukung GA4, GTM, dan Meta Pixel sesuai izin cookie pengunjung).
13. `remove_footer_branding` (**Hapus Branding Footer**) -> bekerja otomatis setelah diaktifkan.
14. `abandoned_cart` (**Keranjang Ditinggalkan**) -> tombol **Kelola** membuka tab **Konfigurasi** (`?tab=configuration`) untuk status pengingat email 3 hari, daftar di menu **Keranjang Ditinggalkan**.

### C. Fitur Berstatus "Segera Hadir" (Jangan Pernah Dipandu Seolah Sudah Aktif!)
Jika ditanyakan seller, sampaikan sedang dalam pengembangan tanpa janji tanggal rilis:
- Pengaturan **Domain Kustom** sendiri
- Pengaturan **Notifikasi WhatsApp** otomatis
- Pengaturan **Staf dan akses** (multi-admin toko)
- **Gateway pembayaran milik sendiri**
- Laporan **Retur dan refund**, **Trafik dan konversi**, **Sumber trafik**, serta **Estimasi pajak**
