/**
 * Pure client- & server-safe template interpolation helper.
 */
export function interpolateTemplate(
  text: string,
  vars: { name?: string | null; storeName?: string | null; category?: string | null }
): string {
  const firstName = (vars.name || 'Kak').trim().split(/\s+/)[0] || 'Kak';
  const storeName = (vars.storeName || vars.name || 'Toko Anda').trim();
  const category = (vars.category || 'Merchant').trim();

  return text
    .replace(/\{nama\}/gi, firstName)
    .replace(/\{nama_toko\}/gi, storeName)
    .replace(/\{kategori\}/gi, category);
}
