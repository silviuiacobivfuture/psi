# @psi/knowledge

The AI guide's knowledge base: reviewed content entries, chunked, embedded and retrieved per
brand and locale. Built on Mastra RAG (`MDocument` chunking from `@mastra/rag`, `LibSQLVector`
from `@mastra/libsql`), with OpenRouter embeddings when a key is present and a deterministic
lexical fallback when it is not.

## The contract (`@psi/guide` consumes this)

```ts
export type Brand = "psizone" | "eqsync" | "hemisync" | "blog";
export type Locale = "ro" | "en";
export interface Source { id: string; title: string; url: string; reviewedBy: string | null; reviewedAt: string | null }
export interface Passage { source: Source; text: string; score: number }
export interface Knowledge { search(q: { query: string; brand: Brand; locale: Locale; topK?: number }): Promise<ReadonlyArray<Passage>> }
```

```ts
import { createKnowledge } from "@psi/knowledge";

const kb = createKnowledge({ url: "file:.data/knowledge.db" }); // embedder: optional
await kb.ingest(entries);   // → IngestReport
await kb.remove(["psizone-ro-contact-phones"]);
const passages = await kb.search({ query: "telefon", brand: "psizone", locale: "ro", topK: 5 });
await kb.close();
```

`createKnowledge` returns `Knowledge` plus `ingest`, `remove`, `embedder` (which one is in use)
and `close`. `score` is cosine similarity; only rows scoring above 0 are returned. Passages are
chunks: one entry can return several.

Queries come from a model's tool call, so `search` degrades instead of throwing:

- the query is trimmed and cut to 2000 characters, and a blank query returns `[]`;
- `topK` defaults to 5 and is clamped to 50.

A non-integer or non-positive `topK`, or an unknown brand or locale, is still an error.

## The rule

An entry is **retrievable** only if `status === "published"` **and**, when `kind === "clinical"`,
both `reviewedBy` and `reviewedAt` are set. A blank reviewer counts as none. The rule is applied
twice:

- **at ingest**: non-retrievable entries are not indexed, and any earlier copy of them is removed
  (re-ingesting an entry as a draft unpublishes it). `IngestReport.skipped` lists them with the
  reason (`draft` or `clinical-unreviewed`);
- **at search**: every stored row is re-parsed (zod) and re-checked before it becomes a `Passage`.

Drafts are never retrievable. A test writes draft, unreviewed-clinical, wrong-brand, wrong-locale
and malformed rows straight into an index, bypassing ingest, and checks that `search` returns none
of them.

## Entries

`KnowledgeEntrySchema` (zod): `id`, `brand`, `locale`, `kind` (`clinical | programme |
operational | editorial`), `title`, `url` (the source page: a site-relative path like `/contact`
or an http(s) URL), `body` (markdown), `audience?`, `hub?`, `method?`, `status` (`draft |
published`), `reviewedBy` (string | null), `reviewedAt` (ISO date or date-time | null). Field names
follow `docs/plans/blog-and-content.md`. The 80–250-word length of a KnowledgeEntry is the CMS's
validation, not enforced here, because hubs, methods and pages are indexed too.

## Isolation

One index per **brand, locale and vector space**: `kb_<brand>_<locale>_<space>`. `search` derives
the index from the query's brand and locale and reads nothing else, so a Psizone query can never
reach Hemi-Sync content (and the other way round). This is isolation by construction, and the
returned rows' brand and locale are re-checked anyway. Tables this package owns all start with
`kb_`. Nothing else in a shared database is touched.

Re-ingesting an id replaces it everywhere: its old chunks are deleted from every `kb_` index
(another brand, locale or embedder included) before the new ones are written. Embedding and the index
dimension checks happen first, so a failed embedding call or a dimension mismatch never removes
live content.

## Chunking

`chunkMarkdown`: Mastra's markdown-aware splitter (`strategy: "markdown"`: headings, then
paragraphs, lines and words), with chunks of **at most ~450 approximate tokens** and about 60
tokens of overlap. Token counts are approximate (4 characters per token), because `js-tiktoken` is
not a direct dependency. When the splitter falls back to words or characters, chunks come out
smaller than the limit, because the length function rounds up for each piece. The
body is NFC-normalised first. Blank chunks are dropped, and a split never leaves half of a surrogate
pair. Each chunk is embedded together with its entry's title, and the passage text is the chunk
alone.

## Embeddings

| | When | Model | Notes |
|---|---|---|---|
| **OpenRouter** | `OPENROUTER_API_KEY` is set | `PSI_EMBED_MODEL`, default `openai/text-embedding-3-small` | `POST /embeddings` via `@openrouter/ai-sdk-provider` (`textEmbeddingModel(...).doEmbed`), batched 64 at a time. Routed with `provider.data_collection: "deny"`, because queries can carry health details |
| **Lexical fallback** (dev) | no key | `lexical-hash-v1-1024` | Deterministic and dependency-free (details below) |

The choice is reported in `IngestReport.embedder` (`kind`, `model`, `space`, `dimension`) and on
`kb.embedder`. Pass `embedder` to `createKnowledge` to override it. Tests always pass the lexical
embedder explicitly and never read the environment.

**The lexical fallback is for development and tests, not production.** It hashes words and
character trigrams (FNV-1a, signed, 1024 dimensions) with sublinear term frequency and
L2-normalises the result. Diacritics are folded first, so `ședință` = `sedinta` and `telefonul`
overlaps `telefon`. Its limits:

- It has no semantics: `phone` never finds `telefon`, and paraphrases do not match.
- It has no IDF, so frequent words weigh as much as rare ones once a small stop-word list is removed.
- Hash collisions add a little noise.

**Switching embedders**: each embedder has its own vector space, so its own indexes. After
setting a key, re-run the ingest. Until then, search with the new embedder finds nothing; it never
mixes vectors from different models.

## Environment

| Variable | Used by | Default |
|---|---|---|
| `OPENROUTER_API_KEY` | embedder selection | unset → lexical fallback |
| `PSI_EMBED_MODEL` | OpenRouter model id | `openai/text-embedding-3-small` |
| `PSI_KNOWLEDGE_DB_URL` | the seed ingest script | `file:.data/knowledge.db` |

The key is a secret: it lives in OpenBao and is never logged, printed or committed.

## Seed and ingest

`src/seed/` holds non-clinical Psizone entries only (`operational` and `editorial`, published,
`reviewedBy: null`), in ro and en. They are built from facts already in this repo:

- the two published phone numbers;
- what the appointment request asks for (logistics only);
- the six condition hubs and their one-line descriptions (`hub_*` messages);
- how articles are written and reviewed (content-strategy.md, "Editorial workflow").

The seed has no clinical facts, no prices and no address (the address is disputed). URLs are
site-relative paths (`/contact`, `/en/contact`, hub paths), since the public origin is not settled.

Run the seed ingest from `packages/knowledge`:

```sh
pnpm dlx tsx src/seed/ingest.ts
# another database:
PSI_KNOWLEDGE_DB_URL=file:/tmp/kb.db pnpm dlx tsx src/seed/ingest.ts
```

`node --import tsx src/seed/ingest.ts` works once `tsx` is a devDependency of this package; it is
not one yet. Re-running the ingest replaces the same entries. The parent directory of a `file:`
database is created on first use, and `.data/` is gitignored.

## Tests

```sh
pnpm exec tsc --noEmit
pnpm exec vitest run --maxWorkers=2
```

Each test gets its own temporary libsql file. Only the network is stubbed: the OpenRouter tests
pass a fake `fetch` to the provider, so the live endpoint is not exercised by the suite.
