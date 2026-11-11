// Minimal RFC 4180 CSV read/write (quotes, commas and newlines inside fields).
export function parseCSV(text) {
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.length > 1 || r[0] !== '');
  return { head: head || [], rows: body.map((r) => Object.fromEntries((head || []).map((h, i) => [h, r[i] ?? '']))) };
}
export const toCSV = (head, rows) => [head, ...rows.map((r) => head.map((h) => r[h]))].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n') + '\n';
export const normUrl = (u) => { try { const x = new URL(u); x.hash = ''; x.host = x.host.replace(/^www\./, ''); let s = x.toString(); if (!x.search && !s.endsWith('/') && !/\.[a-z0-9]{2,5}$/i.test(x.pathname)) s += '/'; return s; } catch { return u; } };
