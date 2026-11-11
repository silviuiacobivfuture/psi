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
| OpenRouter model (sanitised errors, `data_collection: deny`) | `@psi/engine` | `model.ts` |
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

1. `screen` (`ask-screen.ts`): the profile's crisis rules on the raw and the cleaned text, the
   rate limit, validation against the profile's locales, then the deterministic chain:
   - Mastra's `UnicodeNormalizer`;
   - `LookalikeFolder`;
   - the injection rules: chat-template markers plus the packs' patterns, on the question and
     the history;
   - the abuse rules: the packs' patterns minus the profile's exemptions, on the question only;
   - Mastra's `RegexFilterProcessor`: the `pii` preset plus the packs' rules.

   Then the profile's scope rules.
2. Retrieval (`EngineKnowledge.search` in the profile's scope and the configured locale).
   Nothing found is `no_content`, with no model call.
3. Mastra's `PromptInjectionDetector`, which fails closed, and `ModerationProcessor`, which fails
   open, in parallel. Each is wrapped so its provider error is reported, not the bare tripwire.
4. The profile's agent: per-call instructions in the locale, the passages, and a
   `searchKnowledge` toolset bound to this answer's ledger.
5. The per-sentence gate, for each sentence: the sentinel, the profile's cross-reference rules,
   the language, and faithfulness.
6. The scorer on the whole answer: at least one claim, and every claim supported.

The flow stays a stream, because the gate decides sentence by sentence what may go out.
`grounded-answer` (`workflow.ts`) is the same flow as a one-step Mastra workflow. Its input is
`{ profile, question, locale }` and its output is
`{ answer, sources, refusal, events }`, so Studio and any Mastra client can run it.

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
- the local Chroma (`CHROMA_URL`, default `http://localhost:8000`), searched with the lexical
  embedder;
- Studio's runs and traces in `packages/engine/.data/studio.db`.

Port 4360 comes from `PORT`, because the CLI reads `server.port` only from a literal
`new Mastra({...})` in the entry file.

Studio lists the four agents (`psi-guide-psizone` …), the `searchKnowledge` tool, the
`groundedAnswer` workflow and the `psi-faithfulness` scorer. The tool and the workflow are the
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
