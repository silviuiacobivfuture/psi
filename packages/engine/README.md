# @psi/engine

A reusable grounded-answer engine on Mastra (`@mastra/core` 1.82). It answers questions only
from reviewed content, cites the passages it used, checks every sentence before it goes out, and
streams the answer as events. Nothing in it belongs to one brand. A consumer describes its
personas as **profiles** (data), hands in a **knowledge** port (search by scope and locale) and an
OpenRouter model, and gets one Mastra instance back, holding:

- an **agent per profile**;
- the **vector stores** it was given (`vectors: { chroma }`, so `mastra.getVector("chroma")`);
- the **faithfulness scorer** (`createScorer`);
- a **`searchKnowledge` tool**;
- the **`grounded-answer` workflow**.

psi's four brand guides are one consumer (`@psi/guide`). The tests build a second one from
made-up profiles (`src/test/consumer-profiles.ts`): a bicycle-rental helper in English and a
harbour guide in German, a language the engine does not bundle.

The engine ships **no user-facing strings**. Refusals arrive as reasons, and the app renders
them from its own i18n.

## Architecture: what lives where

| Concern | Package | Files |
| --- | --- | --- |
| Mastra instance, agents, registry | `@psi/engine` | `engine.ts`, `engine-options.ts`, `agent.ts` |
| OpenRouter model (sanitised errors, `data_collection` deny by default) | `@psi/engine` | `model.ts` |
| Hydrated agent tools, the catalog contract | `@psi/engine` | `grounding/agent-tools.ts`, `catalog.ts` |
| Runtime settings, booking in chat, small talk, ingest workflow | `@psi/engine` | `settings.ts`, `booking.ts`, `small-talk.ts`, `ingest-workflow.ts` |
| The grounded-answer flow | `@psi/engine` | `ask.ts`, `ask-screen.ts`, `ask-context.ts`, `workflow.ts` |
| Screening: unicode, injection, abuse, PII, rate limit, Mastra detectors | `@psi/engine` | `screening/*` |
| Language detection and per-language data (ro, en) | `@psi/engine` | `language/*` |
| Retrieval tool, ledger and citations, per-sentence gate, faithfulness | `@psi/engine` | `grounding/*` |
| Prompt assembly (language, voice, numbered rules) | `@psi/engine` | `prompt.ts` |
| Memory (LibSQL threads, forgetting refused answers) | `@psi/engine` | `memory.ts` |
| Event stream and input schema | `@psi/engine` | `events.ts`, `contract.ts` |
| psi's brands as profiles: names, brand-book voices, policy | `@psi/guide` | `profiles/*` |
| psi's crisis, scope and clinical rules, and the sister-brand rule | `@psi/guide` | `profiles/crisis.ts`, `profiles/scope.ts` |
| psi's guardrail context (a clinic's guide) | `@psi/guide` | `profiles/screening.ts` |
| `createGuide` (unchanged API), `createPsiEngine`, `DEFAULT_MODEL` | `@psi/guide` | `guide.ts`, `psi-engine.ts`, `model.ts` |
| Retrieval over Chroma or LibSQL, embedders | `@psi/knowledge` | unchanged, plus `kb.vector` and `ChromaAccessError` |

`@psi/guide`'s public API is the same as before (`createGuide`, `Guide`, `GuideEvent`,
`RefusalReason`, `AskInputSchema`, `GuideFailure`, `GuideScore`, `DEFAULT_MODEL`, the rate
limiter and the rest). The apps and `@psi/ui` compile unchanged.

## Contract

```ts
import { createEngine, type Profile } from "@psi/engine";

const engine = createEngine({
  profiles: [bikes, tours],            // Profile[], one Mastra agent each
  knowledge,                           // { search({ query, scope, locale, topK }) }
  vectors: { chroma: kb.vector },      // optional: registered with Mastra
  model: { id: "vendor/model", apiKey, baseURL, screeningId }, // apiKey defaults to OPENROUTER_API_KEY
  screening: { model: true, rateLimiter },  // Mastra's model guardrails on by default
  memory: { url: "file:.data/memory.db" },  // optional; only asks with a threadId use it
  observability, storage, logger, server,   // passed to Mastra (logger defaults to silent)
  languages: [GERMAN],                      // packs beyond the bundled ro and en
  timeouts: { retrievalMs, screeningMs, idleMs, totalMs },
  idPrefix: "acme", scorerId: "faithfulness",
  onFailure: (f) => log.warn(f),       // { profile, stage, error }, no visitor content
  onScore: (s) => metrics.score(s),    // { scorer, score, claims, supported, passed }
});

for await (const event of engine.guide("harbour-bikes").ask(
  { question, locale: "en", history, threadId },
  { signal, clientId },
)) { /* EngineEvent: thinking | text | sources | refusal | done */ }

engine.mastra; // the Mastra instance (agents, vectors, scorers, tools, workflows)
```

`ask` never throws and never hangs, and every stream ends with exactly one `done`. Every failure
becomes a refusal, and every wait has a deadline. The events, the refusal reasons, the deadlines,
memory and consent, and privacy all behave as `packages/guide/README.md` describes. That README
is the engine's behaviour, seen through psi's profiles.

## The profile

```ts
interface Profile {
  id: string;                 // [a-z0-9-], unique: names the agent, its memory resource, its threads
  name: string;               // the agent's display name
  knowledgeScope: string;     // what EngineKnowledge.search receives as `scope`
  locales: Record<string, {   // every locale needs a language pack
    voice: string;            // who the persona is, in this locale
    policy: string[];         // its own numbered rules, between the engine's grounding and closing rules
    nextSteps: string;        // the next steps a short uncited sentence may offer, as the prompt names them
  }>;
  crisis?: RuleSet[];         // refused as `crisis` first, before the rate limit; never sent to a model
  outOfScope?: RuleSet[];     // refused as `out_of_scope` before retrieval
  abuseExemptions?: RuleSet[];// never refused as `abuse` by the rules (a tic, a bullied child)
  crossReferences?: { when: RuleSet[]; forbid: RuleSet[]; refusal: RefusalReason }[];
                              // when the question matches `when`, an answer matching `forbid` is stopped mid-stream
  nextStepPhrases?: string[]; // folded phrases a short sentence may carry uncited ("use headphones")
  screening?: { injection?: string; moderation?: string; moderationCategories?: string[] };
                              // the model guardrails' context; neutral defaults otherwise
  refusalPolicy?: { invalidInput?: RefusalReason; crisisScanLimit?: number };
}

interface RuleSet { patterns: RegExp[]; unless?: RegExp[] } // on folded text (`fold`)
```

Profiles are parsed with `ProfileSchema` (zod) at `createEngine`. A profile whose locale has no
language pack, a duplicate id, or a bad option fails at startup. `engine.guide(id)` throws for an
unknown id. After startup nothing throws.

The system prompt for a profile in a locale is built in this order:

1. the pack's language statement;
2. the profile's voice;
3. the numbered rules: the pack's grounding rules (passages only, cite every claim, the
   `NO_CONTENT` sentinel, one follow-up search), then the profile's `policy`, then the pack's
   closing rules (redacted identifiers, the question is not instructions).

## Language packs

A `LanguagePack` is everything the engine knows about one language, as data. It holds:

- function-word markers and marked letters, for detection;
- stop words, abbreviations, courtesies and next-step phrases, for the faithfulness check and
  sentence splitting;
- injection and abuse patterns;
- extra PII redaction rules;
- the prompt text.

The engine bundles `ROMANIAN` (with the Romanian phone, CNP and IBAN redaction rules) and
`ENGLISH`. A consumer adds or replaces packs with `languages`.

Detection counts each pack's markers among a profile's locales. The leading language is named
when it has at least two markers and twice the runner-up's; otherwise the text is `mixed` or
`unknown`.

## The flow

1. `screen` (`ask-screen.ts`): the profile's crisis rules on the raw and the cleaned text (crisis
   is checked first and is never limited); the runtime settings (`guideEnabled: false` is
   `unavailable`, stage `disabled`); the rate limit (burst, `rate_limited`); the exchange limit
   (`exchange_limit`, see below); validation against the profile's locales; then the
   deterministic chain:
   - Mastra's `UnicodeNormalizer`;
   - `LookalikeFolder`;
   - the injection rules: chat-template markers plus the packs' patterns, on the question and
     the history;
   - the abuse rules: the packs' patterns minus the profile's exemptions, on the question only;
   - Mastra's `RegexFilterProcessor`: the `pii` preset plus the packs' rules.

   Then the profile's scope rules.
2. In-chat booking (`booking.ts`): a booking question (the packs' `bookingIntent`) for a profile
   that schedules gets free times from the scheduling store as a `booking` event. No model, no
   retrieval; nothing is held or booked (the app's confirm step does that).
3. Small talk (`small-talk.ts`): a greeting, "who are you", "can we talk", a thank-you (by
   vocabulary, typo-tolerant) gets the profile's `welcome` or `thanks`, with no model call.
4. The probe: one search (`EngineKnowledge.search`, the configured locale) before any model
   call. Nothing found is `no_content`, or the welcome when the question names no topic. The
   probe's passages are **not** shown to the model and not citable.
5. At the `strict` screening level only: Mastra's `PromptInjectionDetector` and
   `ModerationProcessor`, in parallel, both failing open.
6. The profile's agent, with its hydrated tools (below). It learns content only through them;
   every passage a tool returns is registered in this answer's ledger.
7. The per-sentence gate, for each sentence: the sentinel, the profile's cross-reference rules,
   the language, and faithfulness against every passage shown this turn (exact figures and
   names; an unsupported sentence that invents nothing is left out, an invented fact or promise
   stops the answer). Nothing goes out before the first citing sentence; the separators between
   sentences (spaces, paragraph breaks) go out exactly as the model wrote them.
8. The scorer on what went out (reported through `onScore`, with `dropped`); the gate decides.

The flow stays a stream, because the gate decides sentence by sentence what may go out.
`grounded-answer` (`workflow.ts`) is the same flow as a one-step Mastra workflow. Its input is
`{ profile, question, locale }` and its output is
`{ answer, sources, refusal, events }`, so Studio and any Mastra client can run it.

## The agent's tools (hydrated)

Each profile's agent holds Mastra `createTool`s (zod schemas), hydrated on every call from the
knowledge's catalog, so an ingest shows at once and Studio lists them (`/api/agents`):

| Tool | What it returns |
| --- | --- |
| `searchKnowledge(query, topic?)` | the tiered search (below); `topic` is an enum of the catalog's topics |
| `listTopics()` | the topics with counts and a few titles; no content |
| `getEntry(id)` | one entry's full reviewed text; `id` is an enum of the catalog's entry ids |
| `findPage(titleOrUrl)` | the best-matching pages' text |
| consumer lookups | psi: `contactDetails` (the `/contact` entries), `servicesList` (programmes and topic pages) |

Descriptions and enums carry the catalog's shape (topics, ids, titles, counts), never its
content. Every result is capped at `RESULT_BUDGET_CHARS` (about 1 200 tokens) and numbered into
the answer's ledger; an answer makes at most `MAX_TOOL_CALLS` (4) calls, later ones return a note
and nothing else. The tools find the answer's ledger in Mastra's request context
(`TURN_KEY`); called from Studio's own chat they use a fresh one. The catalog is
`EngineKnowledge.catalog` (`catalog.ts`); a knowledge without one gets `searchKnowledge` only.

## Retrieval tiers (`@psi/knowledge`, `catalog/tiered.ts`)

- **Semantic** (embeddings healthy): the vector store. In **deep** mode (`deepSearch`): the
  query and its diacritic-folded variant at three times the topK, fused with the lexical hits by
  reciprocal rank fusion, at most two passages per source.
- **Lexical**: BM25 over the catalog's chunks (folded, light ro/en stemming), under the same
  retrievability rule. Used when `embeddings: "lexical"`, when the embedder fails, when the
  breaker is open, or when the configured `embedModel` has no index yet (`index_missing`, once
  per brand and locale, until a re-ingest builds it).
- **Circuit breaker**: 3 consecutive failures or timeouts (4 s each) open it for 30 s; then one
  probe goes through (half-open) and a success closes it. Each fall-back is reported through
  `onFailure` (`embeddings_degraded`), never with the question.

The catalog holds the seed, the demo when it is on, and every entry ingested through this process
(the `ingest-knowledge` workflow). Entries written into the vector store by another process are
searchable semantically but are not in the lexical tier until this process ingests them.

## Runtime settings (`settings.ts`)

`createEngine({ settings: () => Promise<unknown> })`: the admin's `RetrievalSettings`, parsed
(zod) on every answer; the provider caches. On failure: the last good value, then the defaults
(stage `settings`). psi's sites pass the CMS's per-brand `ai-settings` global
(`@psi/cms-client`'s `aiSettingsFromEnv`, with `CMS_URL` and the site's read-only `CMS_API_KEY`;
60 s cache, invalidated at once by the CMS's signed `ai-settings` webhook). Without a CMS key,
`PSI_GUIDE_SETTINGS` (JSON, development), else the defaults. An unset `embedModel` means the
store's own model (`PSI_EMBED_MODEL`).

| Setting | Default | Effect |
| --- | --- | --- |
| `embeddings` | `openrouter` | `lexical` forces the lexical tier |
| `embedModel` | unset (the store's model) | the embedding model searched with (own indexes) |
| `deepSearch` | `false` | deep semantic mode |
| `guideEnabled` | `true` | `false` answers `unavailable` (stage `disabled`) |
| `exchangeLimit` | `20` | exchanges per visitor key per window |
| `exchangeWindowHours` | `24` | the window |
| `screeningLevel` | `standard` | see below |

### Screening levels

| Guardrail | `standard` (default) | `strict` | Configurable |
| --- | --- | --- | --- |
| Crisis rules (fixed copy, before everything) | yes | yes | no |
| Rate limit and exchange limit | yes | yes | limits only |
| Unicode cleaning, look-alike folding | yes | yes | no |
| Injection and abuse rules | yes | yes | no |
| PII redaction | yes | yes | no |
| Scope rules (diagnosis, medication, treatment) | yes | yes | no |
| Accuracy gate and faithfulness | yes | yes | no |
| Mastra `PromptInjectionDetector` (model) | no | yes, fails open | level |
| Mastra `ModerationProcessor` (model) | no | yes, fails open | level |

### Exchange limits

An exchange is one answered or refused question. `AskControl.visitorKeys` are counted
independently by `exchangeLimiter` (any `RateLimiter` honouring the per-call `RatePolicy`;
in-memory by default, one process; pass a shared store for several instances). Over the limit on
any key: `exchange_limit`. `@psi/ui` sets the keys (strictly for abuse prevention; list them on the
privacy page): `psi_guide_session` (random id, httpOnly, SameSite=Lax, browser session),
`psi_guide_browser` (random id, httpOnly, SameSite=Lax, one year), and a fingerprint, an HMAC of
the client address, user agent and `accept-language` under a salt rotated daily (UTC), never
stored raw (`PSI_GUIDE_FINGERPRINT_SECRET` derives the salt when instances share a store).

### Conversation mode (`@psi/ui`, `@psi/guide`)

The page keeps the turns in a Datastar signal (`guideTurns`, `compassTurns`): earlier turns show
above the question, the last 6 answered turns go to `ask` as `history`, refused turns stay
visible but are never sent. Nothing is stored on the server; memory (`threadId`) stays
consent-only.

## OpenRouter data policy and the owner's choice

`PSI_OPENROUTER_DATA_COLLECTION=deny|allow` (default `deny`) sets `provider.data_collection` on the
chat model, the screening models and the embedder alike. `allow` (what `:free` models need) is
refused at startup when `NODE_ENV` or `SITE_ENV` is `production`; so are `PSI_DEMO_KNOWLEDGE=true`
and `PSI_MODEL_SCREENING=off`.

(A) Credits on the key (the owner's choice, 2026-11-12): no new lines.

(B) Free models, local development with dummy data only:

```sh
PSI_OPENROUTER_DATA_COLLECTION=allow
PSI_EMBED_MODEL=nvidia/nemotron-3.5-embed-1b:free
PSI_GUIDE_MODEL=nvidia/nemotron-3.5-lightning:free
PSI_SCREENING_MODEL=nvidia/nemotron-3.5-lightning:free   # used only at the strict level
PSI_MODEL_SCREENING=off                                  # or: no model screening in dev at all
PSI_DEMO_KNOWLEDGE=true                                  # dummy data
```

After switching the embedder, re-run the ingest (each model has its own indexes).

## Demo knowledge and the ingest workflow

`PSI_DEMO_KNOWLEDGE=true` (development only) loads `@psi/knowledge`'s demo entries
(`src/demo`, 128 entries: per brand and locale 15 retrievable, 2 of them clinical with
"DEMO Reviewer", and 1 unreviewed clinical entry the rule skips), marked `demo-…`, "[DEMO] …",
`/demo/…` and `demo: true`. With it off, the guide drops `demo-` passages when serving, so a store
that still holds them never shows them.

- `pnpm --filter @psi/knowledge ingest-demo [--key-from ../../apps/<site>/.env]`: the seed plus
  the demo, every brand and locale, into the configured store (`CHROMA_URL`).
- Studio: the `ingestKnowledge` workflow (id `ingest-knowledge`, `ingest-workflow.ts`), input
  `{ sets: ["seed", "demo"], entries: [] }`; the `demo` set exists only with the flag. It runs
  `@psi/knowledge`'s ingest: the rule, `MDocument` chunking, the embedder, the registered store.

## Failing cleanly

| Situation | Answer | `onFailure` |
| --- | --- | --- |
| No OpenRouter key | `unavailable`, before retrieval | `model`: `ConfigurationError: no OpenRouter API key (OPENROUTER_API_KEY)` |
| A key without credits, model screening on | `unavailable`, after retrieval, before the answer model | `screening`: `ProviderError: AI_APICallError (HTTP 402): the OpenRouter key has no credits for this model` |
| The same, model screening off | `unavailable` | `model`: the same 402 text |
| OpenRouter embeddings without credits (`@psi/knowledge` picks them when a key is set) | `unavailable` | `retrieval`: `AI_APICallError: Insufficient credits…` |
| Chroma without a token, or with a wrong one | `unavailable` (never `no_content`) | `retrieval`: `ChromaAccessError: Chroma at <origin> requires a token (HTTP 401): set CHROMA_API_KEY`, or `… refused the token (HTTP 401): CHROMA_API_KEY is not the server's token` |
| Chroma unreachable | `unavailable` | `retrieval`: `ChromaAccessError: Chroma at <origin> is unreachable: check CHROMA_URL` |

Statuses 401, 403 and 429 from OpenRouter are named the same way. No message carries a key or a
token.

## Chroma

Retrieval comes from `@psi/knowledge`. It uses Chroma (`ChromaVector`) when `CHROMA_URL` is set,
else LibSQL, and `createPsiEngine` registers its Mastra vector store under its kind
(`mastra.getVector("chroma")`).

**Locally, Chroma is the local container only:** `psi-chroma` at `http://localhost:8000`, no
token. The token for the estate's Chroma is never used on a workstation. The local `.env` lines, in
`apps/<site>/.env` or in `packages/engine/.env` for Studio:

```sh
CHROMA_URL=http://localhost:8000
# no CHROMA_API_KEY locally: the local container has no auth
OPENROUTER_API_KEY=…            # optional; without it every answer is `unavailable`
```

Seed it once: `CHROMA_URL=http://localhost:8000 pnpm --filter @psi/knowledge ingest-seed`.
Without a key the seed is written with the lexical embedder; Studio and `pnpm ask` search with
that one.

**In the cluster** the deployed sites use Chroma's internal Service (namespace `chroma`, Service
`chroma`, port 8000, which is the auth sidecar's port 8080). They send the token from OpenBao,
through each site's own ExternalSecret:

```yaml
# the site's Deployment environment
- { name: CHROMA_URL, value: "http://chroma.chroma.svc:8000" }
- name: CHROMA_API_KEY
  valueFrom: { secretKeyRef: { name: chroma-token, key: CHROMA_API_KEY } }
---
# the site's ExternalSecret, in its own namespace (estate/APP-SECRETS.md)
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata: { name: chroma-token }
spec:
  refreshInterval: 1m
  secretStoreRef: { name: openbao, kind: ClusterSecretStore }
  target: { name: chroma-token, creationPolicy: Owner }
  data:
    - secretKey: CHROMA_API_KEY
      remoteRef: { key: apps/chroma/env, property: CHROMA_SERVER_TOKEN }
```

`CHROMA_API_KEY` travels as `Authorization: Bearer <token>`, or as `X-Chroma-Token` with
`CHROMA_AUTH_HEADER=x-chroma-token`. The sidecar accepts either. `CHROMA_TENANT` and
`CHROMA_DATABASE` default to `default_tenant` and `default_database`. The public address
`https://chroma.psizone.ro` serves the same API through the Ingress. It answers 401 to any
request without the token; it is not used locally.

None of this is in gitops yet. The sites' Deployments and ExternalSecrets are owned elsewhere.

## Mastra Studio

```sh
pnpm --filter @psi/engine studio                       # http://localhost:4360
pnpm --filter @psi/engine studio --env ../../apps/psizone-web/.env   # with a site's key
```

The script runs `PORT=4360 MASTRA_TELEMETRY_DISABLED=1 mastra dev --dir studio`, with the
`mastra` CLI 1.38.0, which peers `@mastra/core >=1.81`. `studio/index.ts` is psi's engine:

- psi's four profiles (`createPsiEngine`);
- the local Chroma (`CHROMA_URL`, default `http://localhost:8000`), searched with the embedder
  the environment selects (OpenRouter with a key, else lexical), as the sites do;
- Studio's runs and traces in `packages/engine/.data/studio.db`.

Port 4360 comes from `PORT`, because the CLI reads `server.port` only from a literal
`new Mastra({...})` in the entry file.

Studio lists the four agents (`psi-guide-psizone` …) with their hydrated tools and instructions,
the `searchKnowledge` tool, the `groundedAnswer` and `ingestKnowledge` workflows and the
`psi-faithfulness` scorer. The screening chain runs before the agent, outside Mastra's processor
list; its configuration is the table above. The tool and the workflow are the
useful views without a key:

```sh
curl -s localhost:4360/api/agents
curl -s -X POST localhost:4360/api/tools/searchKnowledge/execute -H 'content-type: application/json' \
  -d '{"data":{"profile":"psizone","locale":"ro","query":"telefon programare"}}'
curl -s -X POST localhost:4360/api/workflows/groundedAnswer/start-async -H 'content-type: application/json' \
  -d '{"inputData":{"profile":"psizone","question":"Cum vă pot suna?","locale":"ro"}}'
```

Chatting with an agent directly in Studio skips the engine's flow (no screening, no passages, no
gate). The workflow is the flow.

## One question end to end

```sh
CHROMA_URL=http://localhost:8000 pnpm --filter @psi/engine ask --question "Cum vă pot suna?"
CHROMA_URL=http://localhost:8000 pnpm --filter @psi/engine ask --key-from ../../apps/psizone-web/.env [--no-screening]
```

`scripts/ask-local.ts` prints the store, what retrieval found, the events and the failures. It
reads the key only from `--key-from` (never from the shell) and never prints it.

## Development

```sh
pnpm exec tsc --noEmit
pnpm exec vitest run --maxWorkers=2
```

The tests use `@psi/engine/testing`, which the guide's tests use too:

- a local HTTP server standing in for OpenRouter's `/chat/completions`, so the real provider,
  Mastra and the engine all run;
- an in-memory `EngineKnowledge`;
- event helpers.

`src/test/consumer.test.ts` is the second consumer. It covers:

- its own personas, scopes, crisis, scope and cross-reference rules;
- a German pack;
- the Mastra registry (agents, a LibSQL vector, scorer, tool, workflow);
- the workflow run;
- the tool without a model;
- no key, and a key without credits.
