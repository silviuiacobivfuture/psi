# @psi/knowledge

The AI guide's knowledge base: reviewed content entries, chunked, embedded and retrieved per
brand and locale. Built on Mastra RAG (`MDocument` chunking from `@mastra/rag`; vectors in
**Chroma** through `ChromaVector` from `@mastra/chroma` when `CHROMA_URL` is set, else in
**LibSQL** through `LibSQLVector` from `@mastra/libsql`), with OpenRouter embeddings when a key
is present and a deterministic lexical fallback when it is not.

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

const kb = createKnowledge({ url: "file:.data/knowledge.db" }); // embedder, vector: optional
// with CHROMA_URL set, the same call uses Chroma; or name the store explicitly:
// createKnowledge({ vector: { kind: "chroma", url: "http://localhost:8000" } })
await kb.ingest(entries);   // → IngestReport
await kb.remove(["psizone-ro-contact-phones"]);
const passages = await kb.search({ query: "telefon", brand: "psizone", locale: "ro", topK: 5 });
await kb.close();
```

`createKnowledge` returns `Knowledge` plus:

- `ingest` and `remove`;
- `embedder`: which one is in use;
- `store`: which vector store, and where;
- `vector`: Mastra's `ChromaVector` or `LibSQLVector` underneath, which `@psi/guide` registers
  with its Mastra instance. Searching it directly skips the rule below; `search` is the way to
  read content;
- `close`. `score` is cosine similarity; only rows scoring above 0 are returned. Passages are
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

One index per **brand, locale and vector space**: `kb_<brand>_<locale>_<space>` (a LibSQL table, or
a Chroma collection). `search` derives the index from the query's brand and locale and reads
nothing else, so a Psizone query can never reach Hemi-Sync content (and the other way round).
This is isolation by construction, and the returned rows' brand and locale are re-checked anyway.
Indexes this package owns all start with `kb_`. Nothing else in a shared database is touched.

Re-ingesting an id replaces it everywhere: its old chunks are deleted from every `kb_` index
(another brand, locale or embedder included) before the new ones are written. Embedding and the index
dimension checks happen first, so a failed embedding call or a dimension mismatch never removes
live content.

## Vector store

| | When | Mastra store | Index |
|---|---|---|---|
| **Chroma** | `CHROMA_URL` is set, or `vector: { kind: "chroma", … }` | `ChromaVector` (`@mastra/chroma`) | one collection per index, cosine space |
| **LibSQL** | otherwise, at `url` (or `vector: { kind: "libsql", … }`) | `LibSQLVector` (`@mastra/libsql`) | one table per index |

The order is: an explicit `vector` option, then `CHROMA_URL`, then `url`. So the apps and the seed
script, which pass a libsql `url`, write to Chroma once `CHROMA_URL` is set in their environment.
The CMS does too, but only indexes at all when its `KNOWLEDGE_DB_URL` is set. A Chroma variable set without `CHROMA_URL` is refused (a half-configured Chroma never
quietly becomes LibSQL), and with no store at all `createKnowledge` throws. The choice is reported in
`IngestReport.store` and on `kb.store` (`kind`, `location`); the location never carries a token.

Everything above holds on both stores (the whole knowledge suite runs on each). What Chroma needs
on top:

- **URL**: `CHROMA_URL` is an origin, `http(s)://host[:port]` (443 or 80 when no port). A path,
  query, fragment or credentials in it are refused: the Chroma client has no path prefix, and the
  token belongs in `CHROMA_API_KEY`.
- **Token**: `CHROMA_API_KEY` is sent as `Authorization: Bearer <key>` (Chroma's default
  transport), or as `X-Chroma-Token` with `CHROMA_AUTH_HEADER=x-chroma-token`. It is not passed as
  `ChromaVector`'s own `apiKey`, which switches the client to Chroma Cloud.
- **Refusals**: the estate's Chroma sits behind an auth sidecar that answers 401 without the
  token. A 401 (or 403), and an unreachable server, become a `ChromaAccessError` naming the
  setting to fix ("requires a token (HTTP 401): set CHROMA_API_KEY", "refused the token (HTTP
  401): CHROMA_API_KEY is not the server's token", "is unreachable: check CHROMA_URL"). So a
  missing or wrong token reads as configuration, never as empty content (the guide reports a
  `retrieval` failure and answers `unavailable`, not `no_content`). The token never appears in
  the message. A test stands up a local stand-in for the sidecar.
- **Tenant and database**: `CHROMA_TENANT` and `CHROMA_DATABASE`, default `default_tenant` and
  `default_database`. The database must exist on the server. Give the knowledge base its own
  database on a shared server: `ChromaVector.listIndexes()` reads one page of 100 collections, so a
  database listing 100 or more is refused rather than risk missing a `kb_` index on a re-ingest.
- **Collection names**: Chroma wants 3–512 characters of `[a-zA-Z0-9._-]`, starting and ending with
  a letter or digit, no `..`, not an IPv4 address. Every name this package makes qualifies; an
  embedder space Chroma cannot name (ending in `_`, say) is refused before anything is removed.
- **Metadata**: Chroma drops `null` values and *merges* metadata on upsert. Each chunk's metadata is
  therefore stored as one JSON string, `record`, rewritten whole on every write and parsed back with
  zod (`reviewedBy: null` stays null; no stale review stamp survives). `entryId`, `brand` and
  `locale` are copied beside it for the delete filter and for Chroma's own tools; a row whose copies
  disagree with its record is never returned.
- **Scores**: Chroma returns `1 − cosine distance` and has no score floor, so rows scoring 0 or less
  are dropped, as LibSQL does. `close()` is a no-op: the client holds no connection.

### Chroma locally

```sh
docker run -d --name psi-chroma -p 127.0.0.1:8000:8000 -v <repo>/.data/chroma:/data \
  chromadb/chroma@sha256:1e0b73a187a28757c572acba508c46f48c9e8b0acaf5c20e6d95cdedce1acdf6
curl http://localhost:8000/api/v2/heartbeat
CHROMA_URL=http://localhost:8000 pnpm --filter @psi/knowledge ingest-seed
```

**Local development uses this local container only** (`CHROMA_URL=http://localhost:8000`, no
token). The deployed sites use Chroma's internal Service, `CHROMA_URL=http://chroma.chroma.svc:8000`,
with `CHROMA_API_KEY` from their own ExternalSecret. That ExternalSecret reads OpenBao
`secret/apps/chroma/env`, property `CHROMA_SERVER_TOKEN` (see `packages/engine/README.md`,
"Chroma"). The public `https://chroma.psizone.ro` is never used from a workstation. Nothing here
hard-codes either address.

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
embedder explicitly.

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
| `PSI_KNOWLEDGE_DB_URL` | the seed ingest script (LibSQL) | `file:.data/knowledge.db` |
| `CHROMA_URL` | vector store selection | unset → LibSQL at `url` |
| `CHROMA_API_KEY` | Chroma token | unset → no auth header |
| `CHROMA_AUTH_HEADER` | how the token travels: `authorization` or `x-chroma-token` | `authorization` (Bearer) |
| `CHROMA_TENANT` | Chroma tenant | `default_tenant` |
| `CHROMA_DATABASE` | Chroma database (must exist) | `default_database` |

`OPENROUTER_API_KEY` and `CHROMA_API_KEY` are secrets: they live in OpenBao and are never logged,
printed, reported or committed.

## Seed and ingest

`src/seed/` holds non-clinical entries for every brand (`status: "published"`, `reviewedBy:
null`), in ro and en, with ids `<brand>-<locale>-<slug>`. They are built only from text already in
this repo:

- **psizone** (`operational`, `editorial`): the two published phone numbers; what the appointment
  request asks for (logistics only); the six condition hubs and their one-line descriptions
  (`hub_*` messages); how articles are written and reviewed (content-strategy.md, "Editorial
  workflow").
- **eqsync** (`programme`, `operational`): the free 21-day programme, headphones, the binaural
  method in one line, the protocol categories and "a wellness tool, not a medical device"
  (apps/eqsync-web messages). The contraindication answer is left out until a clinician reviews it.
- **hemisync** (`programme`, `operational`): the Monroe programmes, the free exercises,
  headphones, the technology (without the efficacy sentence), the Focus levels as listeners'
  experience, and the Dolphin Energy Club (apps/hemisync-web messages).
- **blog** (`editorial`): the editorial-policy article and what the blog is (apps/blog-web).

The seed has no clinical facts, no health claims, no prices and no address (the address is
disputed). URLs are site-relative paths (`/contact`, `/en/contact`, hub paths, `/#anchor` on the
EQ-SYNC and Hemi-Sync home pages, the blog's article path), since the public origins are not
settled.

Run the seed ingest from `packages/knowledge`:

```sh
pnpm ingest-seed
# another database:
PSI_KNOWLEDGE_DB_URL=file:/tmp/kb.db pnpm ingest-seed
# into Chroma:
CHROMA_URL=http://localhost:8000 pnpm ingest-seed
```

With `CHROMA_URL` set the script writes to Chroma, though its first output line still prints the
LibSQL `database:` URL. Re-running the ingest replaces the same entries. The parent directory of a `file:`
database is created on first use, and `.data/` is gitignored.

## Tests

```sh
pnpm exec tsc --noEmit
pnpm exec vitest run --maxWorkers=2                                   # LibSQL; Chroma skipped
CHROMA_URL=http://localhost:8000 pnpm exec vitest run --maxWorkers=2  # LibSQL and Chroma
```

The knowledge suite runs once per store. On LibSQL each test gets its own temporary file; on
Chroma each test creates its own database on the server (`kbtest_<random>`) and deletes it after.
Without `CHROMA_URL`, or when the server does not answer its heartbeat, the Chroma cases are
skipped and the skip names the reason. The seed tests call `createKnowledge` with a libsql URL, so
with `CHROMA_URL` set they follow it and write the seed into the configured Chroma database: point
the tests at a local Chroma only, never at the estate's. Only the network is stubbed: the OpenRouter tests
pass a fake `fetch` to the provider, so the live endpoint is not exercised by the suite.
