/**
 * Utility to format dates, especially handling Excel date serial numbers
 * (e.g. 46349.68010416667) and converting them into clean 'YYYY-MM-DD HH:mm:ss' format.
 */
export function formatAccountDate(val: any): string {
  if (val === null || val === undefined || val === '') return '';

  // 1. If it's already a Date object
  if (val instanceof Date && !isNaN(val.getTime())) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    const h = String(val.getHours()).padStart(2, '0');
    const min = String(val.getMinutes()).padStart(2, '0');
    const s = String(val.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${d} ${h}:${min}:${s}`;
  }

  // 2. If it's an Excel serial date number (e.g. 46349.68010416667 or '46349.68010416667')
  const strVal = String(val).trim();
  const num = typeof val === 'number' ? val : (/^\d+(\.\d+)?$/.test(strVal) ? Number(strVal) : NaN);
  if (!isNaN(num) && num > 10000 && num < 100000) {
    try {
      // Excel epoch 1899-12-30 -> ms = (num - 25569) * 86400 * 1000
      const ms = Math.round((num - 25569) * 86400 * 1000);
      const d = new Date(ms);
      if (!isNaN(d.getTime())) {
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        const h = String(d.getUTCHours()).padStart(2, '0');
        const min = String(d.getUTCMinutes()).padStart(2, '0');
        const s = String(d.getUTCSeconds()).padStart(2, '0');
        if (h === '00' && min === '00' && s === '00' && !strVal.includes('.')) {
          return `${y}-${m}-${day}`;
        }
        return `${y}-${m}-${day} ${h}:${min}:${s}`;
      }
    } catch {
      // fallback
    }
  }

  // 3. If it's an ISO string e.g. "2026-11-23T16:19:21.000Z"
  if (strVal.includes('T') && !isNaN(Date.parse(strVal))) {
    const d = new Date(strVal);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}:${s}`;
  }

  return strVal;
}
