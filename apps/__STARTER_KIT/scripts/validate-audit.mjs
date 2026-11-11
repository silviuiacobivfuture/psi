#!/usr/bin/env node
// Strict checker for audit/audit.csv and audit/facts.jsonl against audit/AUDIT.md. Exit code 1 on any error.
import fs from 'node:fs/promises';
import { parseCSV, normUrl } from './lib-csv.mjs';

const E = []; const W = [];
const read = (p) => fs.readFile(p, 'utf8').catch(() => null);
const urlsTxt = await read('audit/urls.csv'); const auditTxt = await read('audit/audit.csv'); const tmpl = await read('audit/audit-template.csv');
if (!urlsTxt) { console.error('audit/urls.csv missing: run npm run audit:urls'); process.exit(1); }
if (!auditTxt) { console.error('audit/audit.csv missing: copy audit/audit-template.csv to audit/audit.csv and start'); process.exit(1); }
const urls = parseCSV(urlsTxt).rows; const { head, rows } = parseCSV(auditTxt); const want = parseCSV(tmpl).head;
if (head.join() !== want.join()) E.push(`audit.csv columns differ from the template.\n  expected: ${want.join(',')}\n  found:    ${head.join(',')}`);

const ENUM = {
  site: ['psizone', 'eqsync', 'hemisync'],
  page_type: 'home service condition method programme team testimonials about contact pricing faq blog_post blog_index event workshop product product_category course audio legal system landing other'.split(' '),
  verdict: 'KEEP REWRITE MERGE MOVE REDIRECT ARCHIVE DROP REVIEW'.split(' '),
  target_brand: 'psizone eqsync hemisync blog none'.split(' '),
  becomes: 'hub method programme article faq kb_entry product event team_profile testimonial legal landing audio_track none'.split(' '),
  priority: ['P1', 'P2', 'P3'],
};
const MULTI = { audience: 'parents children teens adults families patients athletes professionals explorers general'.split(' '),
  claim_flags: 'CLAIM_EFFICACY CLAIM_SUPERLATIVE CLAIM_NUMBER CLAIM_SAFETY CLAIM_MEDICAL CLAIM_PARANORMAL TESTIMONIAL_OUTCOME TESTIMONIAL_SENSITIVE'.split(' '),
  issue_flags: 'THIN DUPLICATE NEAR_DUPLICATE PLACEHOLDER TYPO OUTDATED CONTRADICTION WRONG_BRAND BROKEN_LINK ORPHAN MISSING_META NO_H1 BAD_SLUG MACHINE_TRANSLATED NO_NEXT_STEP EMPTY'.split(' ') };
const KINDS = 'service method condition programme price duration session_count person credential role address phone email hours room_or_equipment partner trademark statistic claim testimonial event_date age_range legal_entity other'.split(' ');

const scope = new Map(urls.map((u) => [normUrl(u.url), u]));
const seen = new Map(); const auditUrls = new Set();
rows.forEach((r, i) => {
  const at = `row ${i + 2} (${r.url})`; const k = normUrl(r.url); auditUrls.add(k);
  if (seen.has(k)) E.push(`${at}: duplicate row (also row ${seen.get(k)})`); seen.set(k, i + 2);
  if (!scope.has(k)) E.push(`${at}: URL not in audit/urls.csv`);
  for (const [col, vals] of Object.entries(ENUM)) if (!vals.includes(r[col])) E.push(`${at}: ${col}="${r[col]}" is not one of ${vals.join('|')}`);
  for (const [col, vals] of Object.entries(MULTI)) for (const v of r[col].split(';').map((s) => s.trim()).filter(Boolean)) if (!vals.includes(v)) E.push(`${at}: ${col} has unknown code "${v}"`);
  const light = ['product', 'audio', 'system'].includes(r.page_type);
  for (const col of ['title', 'quality', 'facts_count', 'testimonials_count', ...(light ? [] : ['summary', 'audience', 'primary_topic'])]) if (!String(r[col]).trim()) E.push(`${at}: ${col} is empty`);
  if (!/^[1-5]$/.test(r.quality)) E.push(`${at}: quality must be 1–5`);
  if (!/^\d+$/.test(r.facts_count) || !/^\d+$/.test(r.testimonials_count)) E.push(`${at}: facts_count and testimonials_count must be integers`);
  if (r.summary && r.summary.split(/\s+/).length > 30) E.push(`${at}: summary over 30 words`);
  if (r.verdict !== 'KEEP' && !r.verdict_reason.trim()) E.push(`${at}: verdict_reason required for ${r.verdict}`);
  if (['KEEP', 'REWRITE', 'MERGE', 'MOVE', 'REDIRECT'].includes(r.verdict) && !r.target_url.trim()) E.push(`${at}: target_url required for ${r.verdict}`);
  if (r.verdict === 'KEEP' && r.claim_flags.trim()) E.push(`${at}: KEEP is not allowed with claim flags (rule 6)`);
  if (r.claim_flags.trim() && !r.verdict.match(/REWRITE|MERGE|MOVE|REVIEW|DROP|ARCHIVE|REDIRECT/)) E.push(`${at}: flagged claims need REWRITE or stronger`);
  if (r.duplicate_of && !scope.has(normUrl(r.duplicate_of))) W.push(`${at}: duplicate_of points outside the scope: ${r.duplicate_of}`);
  if (/DUPLICATE/.test(r.issue_flags) && !r.duplicate_of) E.push(`${at}: DUPLICATE flag needs duplicate_of`);
  if (r.verdict === 'REVIEW' && !r.notes.trim()) E.push(`${at}: REVIEW needs the open question in notes`);
});

const factsTxt = (await read('audit/facts.jsonl')) || '';
const factCount = new Map();
factsTxt.split('\n').forEach((l, i) => {
  if (!l.trim()) return; let f; try { f = JSON.parse(l); } catch { E.push(`facts.jsonl line ${i + 1}: not valid JSON`); return; }
  if (!f.url || !auditUrls.has(normUrl(f.url))) E.push(`facts.jsonl line ${i + 1}: url not in audit.csv (${f.url})`);
  if (!KINDS.includes(f.kind)) E.push(`facts.jsonl line ${i + 1}: unknown kind "${f.kind}"`);
  if (!f.value) E.push(`facts.jsonl line ${i + 1}: empty value`);
  if (f.quote && f.quote.split(/\s+/).length > 25) W.push(`facts.jsonl line ${i + 1}: quote over 25 words`);
  if (!['high', 'medium', 'low'].includes(f.confidence)) E.push(`facts.jsonl line ${i + 1}: confidence must be high|medium|low`);
  const k = normUrl(f.url); factCount.set(k, (factCount.get(k) || 0) + 1);
});
rows.forEach((r) => { const n = factCount.get(normUrl(r.url)) || 0; if (String(n) !== String(r.facts_count)) E.push(`${r.url}: facts_count says ${r.facts_count}, facts.jsonl has ${n}`); });

const missing = [...scope.keys()].filter((k) => !auditUrls.has(k));
const pct = Math.round((auditUrls.size / scope.size) * 100);
console.log(`Progress: ${auditUrls.size}/${scope.size} URLs (${pct}%), ${[...factCount.values()].reduce((a, b) => a + b, 0)} facts.`);
if (missing.length) console.log(`Not audited yet: ${missing.length} (next: ${missing[0]})`);
W.forEach((w) => console.log('warning: ' + w));
if (E.length) { E.slice(0, 80).forEach((e) => console.log('ERROR: ' + e)); if (E.length > 80) console.log(`…and ${E.length - 80} more`); process.exit(1); }
console.log(missing.length ? 'OK so far (no errors). Continue with the next batch.' : 'OK: audit complete. Now write audit/REPORT.md.');
