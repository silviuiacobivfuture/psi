#!/usr/bin/env node
// From audit/audit.csv, writes audit/redirects.csv: old URL → new URL (301) or 410 for dropped pages.
import fs from 'node:fs/promises';
import { parseCSV, toCSV } from './lib-csv.mjs';
const { rows } = parseCSV(await fs.readFile('audit/audit.csv', 'utf8'));
const out = rows.filter((r) => r.site === 'psizone' || r.target_url).map((r) => {
  const oldPath = new URL(r.url).pathname; const t = r.target_url.trim();
  if (['DROP', 'ARCHIVE'].includes(r.verdict) && !t) return { from: oldPath, to: '', code: '410', verdict: r.verdict, site: r.site };
  if (!t || t === oldPath) return null;
  return { from: oldPath, to: t, code: '301', verdict: r.verdict, site: r.site };
}).filter(Boolean);
await fs.writeFile('audit/redirects.csv', toCSV(['site', 'from', 'to', 'code', 'verdict'], out));
console.log(`audit/redirects.csv: ${out.length} rules`);
