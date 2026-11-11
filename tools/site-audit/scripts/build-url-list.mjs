#!/usr/bin/env node
// Builds audit/urls.csv: every URL from the WordPress export(s) and the crawls, de-duplicated, with where its text lives.
import fs from 'node:fs/promises';
import path from 'node:path';
import { toCSV, normUrl } from './lib-csv.mjs';

const SITES = { 'psizone.ro': 'psizone', 'eq-sync.ro': 'eqsync', 'hemi-sync.ro': 'hemisync' };
const siteOf = (u) => { try { return SITES[new URL(u).host.replace(/^www\./, '')] || 'other'; } catch { return 'other'; } };
const map = new Map();
const add = (url, data) => { const k = normUrl(url); const cur = map.get(k) || { site: siteOf(url), url: k, wp_file: '', crawl_file: '', wp_type: '', words: '', title: '', in_sitemap: '' }; map.set(k, { ...cur, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== '' && v != null)) }); };

async function exists(p) { return fs.stat(p).then(() => true).catch(() => false); }
const fm = (txt) => Object.fromEntries((/^---\n([\s\S]*?)\n---/.exec(txt)?.[1] || '').split('\n').map((l) => { const i = l.indexOf(':'); let v = l.slice(i + 1).trim(); try { v = JSON.parse(v); } catch {} return [l.slice(0, i), v]; }));

for (const base of ['data/wordpress']) {
  if (!(await exists(base))) continue;
  for (const site of await fs.readdir(base)) for (const kind of ['pages', 'posts', 'products', 'courses']) {
    const dir = path.join(base, site, kind); if (!(await exists(dir))) continue;
    for (const f of await fs.readdir(dir)) { const meta = fm(await fs.readFile(path.join(dir, f), 'utf8')); if (meta.url) add(meta.url, { wp_file: path.join(dir, f), wp_type: kind.replace(/s$/, ''), words: meta.words, title: meta.title }); }
  }
}
if (await exists('data/crawl')) for (const site of await fs.readdir('data/crawl')) {
  const jl = path.join('data/crawl', site, 'pages.jsonl'); if (!(await exists(jl))) continue;
  for (const line of (await fs.readFile(jl, 'utf8')).split('\n').filter(Boolean)) {
    const r = JSON.parse(line); const cur = map.get(normUrl(r.url));
    add(r.url, { crawl_file: path.join('data/crawl', site, 'pages', r.slug + '.md'), words: cur?.words || r.words, title: cur?.title || r.title, in_sitemap: r.in_sitemap ? 'yes' : 'no' });
  }
}
const order = { psizone: 0, eqsync: 1, hemisync: 2, other: 3 };
const rows = [...map.values()].sort((a, b) => order[a.site] - order[b.site] || (a.wp_type === 'product') - (b.wp_type === 'product') || a.url.localeCompare(b.url));
await fs.mkdir('audit', { recursive: true });
await fs.writeFile('audit/urls.csv', toCSV(['site', 'url', 'title', 'words', 'wp_type', 'in_sitemap', 'wp_file', 'crawl_file'], rows));
const by = rows.reduce((a, r) => ((a[r.site] = (a[r.site] || 0) + 1), a), {});
console.log(`audit/urls.csv: ${rows.length} URLs`, by);
if (!rows.length) console.log('No data yet: run the exports and crawls first (see START-HERE.md).');
