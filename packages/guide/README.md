# @psi/guide

The guide for the psi brand sites (Psizone, EQ-SYNC, Hemi-Sync România, the Blog). It answers a
visitor's question only from reviewed, published content, cites the pages it used, holds a short
conversation, offers booking times on Psizone, and streams everything as events that an app renders
through Datastar (`@psi/ui`'s `streamGuideAnswer`).

It is psi's four brands as **profiles on `@psi/engine`**, the reusable core (see
`packages/engine/README.md` for the tools, the retrieval tiers, the settings and the screening
levels). The engine owns the Mastra agent per profile and its hydrated tools, the OpenRouter model,
the screening chain, the exchange limit, the per-sentence gate, the scorer, the event stream and
memory. This package owns what is psi's:

- `src/profiles/`: the brand names and brand-book voices, psi's policy rules, the crisis, scope
  and clinical word lists, the guardrail context, the sister-brand rule (Psizone only), each
  brand's welcome and thank-you lines (`welcome.ts`), and which brands schedule (Psizone);
- `retrieval.ts`, `knowledge.ts`, `catalog.ts`: `@psi/knowledge`'s store behind the engine, with the
  tiered search, the catalog (seed, demo when on, every ingest) and psi's lookups
  (`contactDetails`, `servicesList`); demo passages are dropped unless `PSI_DEMO_KNOWLEDGE=true`;
- `ingest.ts`: the `ingest-knowledge` workflow's port (sets `seed`, and `demo` with the flag);
- `conversation.ts`: the client-held conversation (parse, bound, history, append);
- `model.ts`, `settings.ts`: the environment and the development settings provider.

`createGuide` builds a one-profile engine (each site). `createPsiEngine` builds all four on one
Mastra instance (Studio's entry, and scripts).

The module ships **no user-facing strings** beyond the brands' welcome and thank-you lines. Refusals
arrive as reasons, and the app renders them from its own i18n.

## Contract

```ts
import { createGuide, type GuideEvent } from "@psi/guide";

const guide = createGuide({
  brand: "psizone",            // "psizone" | "eqsync" | "hemisync" | "blog"
  knowledge,                   // a Knowledge (or KnowledgeStore) from @psi/knowledge
  settings: aiSettings.get,    // the CMS's ai-settings (RetrievalSettings); default PSI_GUIDE_SETTINGS
  scheduling: port,            // Psizone: the scheduling store's engine port (find, cancel)
  memory: { url: "file:.data/guide.db" }, // optional; used only for asks with a threadId
  rateLimiter, exchangeLimiter, // burst (10 a minute) and exchange limits; in memory by default
  apiKey, model, screeningModel, modelScreening, baseURL, timeouts, // env defaults below
  onFailure: (f) => log.warn("guide stage failed", f), // { stage, error }, no visitor content
  onScore: (s) => metrics.faithfulness(s),            // { scorer, score, claims, supported, passed, dropped }
});

for await (const event of guide.ask(
  { question, locale: "ro", history, threadId },
  { signal, clientId, visitorKeys },
)) {
  // GuideEvent
}
```

```ts
type GuideEvent =
  | { type: "thinking" }
  | { type: "text"; delta: string }
  | { type: "sources"; sources: ReadonlyArray<Source> }
  | { type: "booking"; offer: BookingOffer }   // Psizone: free times; the app renders its confirm step
  | { type: "refusal"; reason: RefusalReason }
  | { type: "done" };
```

- **An answer** is `thinking`, `text`*, `sources`, `done`. Text arrives a sentence at a time, each
  checked before it goes out, with the separators (spaces, paragraph breaks) exactly as written.
- **Small talk** ("bună", "what can you do?", "mulțumesc") is `text`, `done`: the brand's welcome
  or thank-you line, with no retrieval and no model call, and no sources.
- **Booking** (Psizone, with `scheduling`) is `booking`, `done`: free times from @psi/scheduling
  (Convex) only, never from the CMS. Nothing is held or booked by the guide.
- **Citations.** `[k]` points to `sources[k-1]`: only passages a tool returned in this answer.
- **A refusal** is `refusal`, `done`, possibly after `text` (the app replaces the partial answer).
- **Every stream ends with exactly one `done`**; `ask` never throws or hangs (`timeouts`:
  `retrievalMs` 8 s, `screeningMs` 8 s, `idleMs` 20 s, `totalMs` 60 s).
- **`clientId`** feeds the burst limit; **`visitorKeys`** (session cookie, browser cookie, daily
  fingerprint; `@psi/ui` sets them) feed the exchange limit, each key counted on its own.

## Refusal reasons, for the apps

Each app renders every reason from its own i18n, in the locale it passed to `ask`.

| Reason | When | Model called? |
| --- | --- | --- |
| `crisis` | Self-harm, suicide, abuse or emergency language (ro, en, diacritics or not, hidden characters). Wins over everything, the limits included. The app shows 112 and the clinic phone. | Never |
| `out_of_scope` | A diagnosis, medication or individual treatment request; invalid input; an answer that broke a brand rule (Psizone naming Hemi-Sync or EQ-SYNC on a clinical question). | No (the brand rule runs on the answer) |
| `injection` | The question or a history turn tries to change or reveal the instructions. | No by the rules; one call at the strict level |
| `abuse` | Insults, threats, slurs aimed at the guide or the team (never health, therapy or a child). | No by the rules; one call at the strict level |
| `rate_limited` | Too many questions in a short time (the burst limit, per `clientId`). | Never |
| `exchange_limit` | The visitor used up the admin's `exchangeLimit` per `exchangeWindowHours` (default 20 a day) on any of its keys. | Never |
| `no_content` | Nothing reviewed answers it (and it names a topic: otherwise the welcome), the model said so, or the answer invented a fact (a figure, a name, a citation to a passage no tool returned, an unsupported promise), or no supported claim went out. | No for empty retrieval |
| `unavailable` | No key, a provider or knowledge failure, a timeout, an abort, an unfinished answer, the other language, a limiter failure, or `guideEnabled: false` (stage `disabled`). | — |

## The chain, in order

Cheapest and most certain first; a step that refuses stops the chain.

| # | Step | Refuses with | Cost |
| --- | --- | --- | --- |
| 1 | Crisis rules, on the raw and the cleaned question | `crisis` | Free |
| 2 | Runtime settings (`guideEnabled`) | `unavailable` | One provider read (cached by the app) |
| 3 | Burst limit (`clientId`), then the exchange limit (`visitorKeys`) | `rate_limited`, `exchange_limit` | One store call each; fail closed |
| 4 | Validation (zod) | `out_of_scope` | Free |
| 5 | Unicode, look-alikes, injection and abuse rules, PII redaction (Mastra processors and the engine's own) | `injection`, `abuse` | Free |
| 6 | Scope rules | `out_of_scope` | Free |
| 7 | Booking intent (Psizone): free times as a `booking` event | — | One scheduling read |
| 8 | Small talk: the welcome or thank-you line | — | Free |
| 9 | The probe: one search; nothing found is `no_content` (or the welcome when no topic is named) | `no_content` | One search |
| 10 | Strict level only: Mastra's injection and moderation detectors, both failing open | `injection`, `abuse` | Two small model calls |
| 11 | The agent, with its tools (`searchKnowledge`, `listTopics`, `getEntry`, `findPage`, `contactDetails`, `servicesList`), at most 4 calls, temperature 0.1 | — | The answer call(s) |
| 12 | The per-sentence gate: the sentinel, the sister-brand rule, the language, faithfulness | `no_content`, `out_of_scope`, `unavailable` | Free |
| 13 | The `psi-faithfulness` scorer on what went out, reported through `onScore` | — | Free |

The screening level is the admin's (`screeningLevel`, default `standard`: no model detectors). The
probe's passages are never shown to the model: it reads content only through its tools.

## Accuracy

Each claim is checked against every passage the tools returned in this answer (folded, four-letter
stems, function words ignored). Figures (numbers, phones, prices) and names (capitalised words
mid-sentence, also after "dr.", domains, e-mails) must appear in a passage, a source title or the
brand's name. A sentence that only paraphrases without support is left out and the rest streams
(`dropped` in `onScore`); a sentence that invents a fact, cites a passage no tool returned, or makes
an unsupported promise ("vindecă", "guarantees") stops the answer. Warm openers and closing
questions without a fact are kept. Nothing goes out before the first sentence that cites a source.
The check is lexical, not semantic.

## Conversation, memory and consent

**Conversation mode** (no consent needed, nothing stored): the page keeps its turns in a Datastar
signal; the last 6 answered turns go to `ask` as `history`; refused turns stay visible but are never
sent (`conversation.ts`). **Memory** (stored) only with a `threadId`, passed after consent: the
last 10 messages, nothing semantic; a refused or abandoned answer is removed from the thread.

## Privacy

OpenRouter routing uses `data_collection: "deny"` unless `PSI_OPENROUTER_DATA_COLLECTION=allow`
(development with dummy data only; refused in production). Mastra's logger is silenced on the
agents; provider errors are replaced by `ProviderError` (kind and HTTP status only). At the strict
level, Mastra's detectors print their own parse errors with the detector model's raw reply, which
the guide cannot silence. `onFailure` and `onScore` carry no visitor content. The exchange-limit
cookies (`psi_guide_session`, `psi_guide_browser`) and the daily fingerprint hash are for abuse
prevention only.

## Environment

| Variable | Meaning |
| --- | --- |
| `OPENROUTER_API_KEY` | The key; without it every answer is `unavailable` (small talk and booking still work). |
| `PSI_GUIDE_MODEL`, `PSI_SCREENING_MODEL` | The answering and the guardrail model slugs (default `xiaomi/mimo-v2.6-flash`). |
| `PSI_MODEL_SCREENING=off` | No model detectors even at the strict level (development only). |
| `PSI_OPENROUTER_DATA_COLLECTION` | `deny` (default) or `allow` (development only). |
| `PSI_DEMO_KNOWLEDGE=true` | Serve the demo entries (development only). |
| `PSI_GUIDE_SETTINGS` | Development settings as JSON (`{"exchangeLimit":3}`) when the app has no CMS settings. |
| `CMS_URL`, `CMS_API_KEY` | (the apps) the CMS's `ai-settings` for this brand: 60 s cache, refreshed at once by the CMS's signed webhook, last known on failure, then the defaults. |

## Streaming to Datastar

Apps use `@psi/ui`'s `streamGuideAnswer(c, { guide, locale, question, target, signals, labels })`:
it empties the asking field first, patches the answer region (earlier turns, thinking, text, the
sources, a refusal or the booking step), appends the turn to the page's signal, sets the
exchange-limit keys, and always ends with an answer or a refusal. The region shows the unavailable
copy if the stream breaks (the request finishes without its last patch, or 75 s pass).

## Development

```sh
pnpm exec tsc --noEmit
pnpm exec vitest run --maxWorkers=2
```

The tests run the real provider, Mastra and the engine against a local stand-in for OpenRouter
(`@psi/engine/testing`), which searches before it answers, as a real model does. Every refusal
reason has its own test; the live answers that were once refused (booking, warm openers) are
fixtures.
