/** Round display values as decimal strings; saved evidence and CSV stay unchanged. */
export function financialNumber(value: unknown, decimals?: number): string {
  if (value == null || value === '') return '—';
  const text = String(value);
  if (!/^-?\d+(\.\d+)?$/.test(text)) return text;
  const negative = text.startsWith('-');
  const [whole = '', fraction = ''] = text.replace(/^-/, '').split('.');
  const places = decimals ?? (fraction ? 2 : 0);
  const digits = fraction.padEnd(places + 1, '0');
  const rounded = BigInt(whole + digits.slice(0, places)) + (Number(digits[places]) >= 5 ? 1n : 0n);
  const output = rounded.toString().padStart(places + 1, '0');
  const integer = places ? output.slice(0, -places) : output;
  return (negative && rounded !== 0n ? '-' : '') + integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (places ? '.' + output.slice(-places) : '');
}

export function sourceName(value: string): string {
  if (/^hithink$/i.test(value)) return '同花顺';
  return value.replaceAll('同花顺扶摇', '同花顺').replace(/^扶摇$/, '同花顺');
}

export function downloadFile(name: string, content: Blob) {
  const url = URL.createObjectURL(content);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function dataCsv(columns: { key: string; label: string; unit: string }[], rows: Record<string, string | null>[]) {
  const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"';
  return '\uFEFF' + [columns.map(c => c.label + (c.unit ? `（${c.unit}）` : '')),
    ...rows.map(row => columns.map(c => row[c.key] ?? ''))].map(row => row.map(quote).join(',')).join('\r\n');
}
