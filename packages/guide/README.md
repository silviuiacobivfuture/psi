# @psi/guide

The guide for the psi brand sites (Psizone, EQ-SYNC, Hemi-Sync România, the Blog). It answers a
visitor's question only from reviewed, published content, cites the pages it used, holds a short
conversation, offers booking times on Psizone, and streams everything as events that an app renders
through Datastar (`@psi/ui`'s `streamGuideAnswer`).

It is psi's four brands as **profiles on `@psi/engine`**, the reusable core (see
`packages/engine/README.md` for the tools, the retrieval tiers, the settings and the screening
levels). The engine owns the Mastra agent per profile and its hydrated tools, the OpenRouter model,
the screening chain, the exchange limit, the conversation turn and its claims post-check, the
scorer, the event stream and
memory. This package owns what is psi's:

- `src/profiles/`: the brand names and brand-book voices, psi's policy rules, the crisis, scope
  and clinical word lists, the guardrail context, the sister-brand rule (Psizone only), each
  brand's fallback lines (welcome, follow-up, thank-you, "not on our site": `welcome.ts`), and
  which brands schedule (Psizone);
- `retrieval.ts`, `knowledge.ts`, `catalog.ts`: `@psi/knowledge`'s store behind the engine, with the
  tiered search, the catalog (seed, demo when on, every ingest) and psi's lookups
  (`contactDetails`, `servicesList`); demo passages are dropped unless `PSI_DEMO_KNOWLEDGE=true`;
- `ingest.ts`: the `ingest-knowledge` workflow's port (sets `seed`, and `demo` with the flag);
- `conversation.ts`: the client-held conversation (parse, bound, history, append);
- `model.ts`, `settings.ts`: the environment and the development settings provider.

`createGuide` builds a one-profile engine (each site). `createPsiEngine` builds all four on one
Mastra instance (Studio's entry, and scripts).

The module ships **no user-facing strings** beyond the brands' fallback lines. Refusals
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

- **A reply** is `thinking`, `text`*, `sources` (when it cites), `done`, streamed as the model
  writes it. A `replace` (`{ type: "replace", text }`) resets the message's text: `""` before a
  regenerated reply streams in, or the corrected full text. Every turn goes to the
  brand's agent, conversation first: small talk, a test, gibberish, a feeling, thanks or a meta
  question gets a short warm reply (no search); a factual question is looked up with the tools and
  cited. The finished reply is checked (language, figures and clinical terms against the tool
  results, Romanian grammar slips, a repeat, a closing question asked before), with one
  regeneration at most. Follow-up questions are rare and fit the brand (`FOLLOW_UP_TOPICS`).
- **The fallback lines** (welcome, follow-up, thank-you) go out only when the model cannot reply
  (no key, the provider failing twice, a reply still in another language after its retry).
- **An aborted turn** (a newer question replaced it) is `thinking`, `done`: it renders nothing.
- **Booking** (Psizone, with `scheduling`) is `booking`, `done`: free times from @psi/scheduling
  (Convex) only, never from the CMS. Nothing is held or booked by the guide.
- **Citations.** `[k]` points to `sources[k-1]`: only passages a tool returned in this answer.
- **A refusal** is `refusal`, `done`.
- **Every stream ends with exactly one `done`**; `ask` never throws or hangs (`timeouts`:
  `retrievalMs` 8 s, `screeningMs` 8 s, `idleMs` 20 s, `totalMs` 60 s).
- **`clientId`** feeds the burst limit; **`visitorKeys`** (session cookie, browser cookie, daily
  fingerprint; `@psi/ui` sets them) feed the exchange limit, each key counted on its own.

## Refusal reasons, for the apps

Each app renders every reason from its own i18n, in the locale it passed to `ask`.

| Reason | When | Model called? |
| --- | --- | --- |
| `crisis` | Self-harm, suicide, abuse or emergency language (ro, en, diacritics or not, hidden characters). Wins over everything, the limits included. The app shows 112 and the clinic phone. | Never |
| `out_of_scope` | Invalid input only (empty, over-long, malformed). A diagnosis or medication question is steered to a specialist in conversation; a sentence breaking a brand rule (Psizone naming Hemi-Sync or EQ-SYNC on a clinical question) is regenerated, then left out. | No |
| `injection` | The question or a history turn tries to change or reveal the instructions. | No by the rules; one call at the strict level |
| `abuse` | Insults, threats, slurs aimed at the guide or the team (never health, therapy or a child). | No by the rules; one call at the strict level |
| `rate_limited` | Too many questions in a short time (the burst limit, per `clientId`). | Never |
| `exchange_limit` | The visitor used up the admin's `exchangeLimit` per `exchangeWindowHours` (default 20 a day) on any of its keys. | Never |
| `no_content` | Not for psi's brands: a question nothing covers gets an honest reply in conversation, an all-invented reply the brand's "not on our site" line. | — |
| `unavailable` | A real question with no key or the provider failing twice (network, 5xx, a timeout, an unfinished reply), a limiter failure, or `guideEnabled: false` (stage `disabled`). Never a language mismatch, never an aborted turn. | — |

## The chain, in order

Cheapest and most certain first; a step that refuses stops the chain.

| # | Step | Refuses with | Cost |
| --- | --- | --- | --- |
| 1 | Crisis rules, on the raw and the cleaned question | `crisis` | Free |
| 2 | Runtime settings (`guideEnabled`) | `unavailable` | One provider read (cached by the app) |
| 3 | Burst limit (`clientId`), then the exchange limit (`visitorKeys`) | `rate_limited`, `exchange_limit` | One store call each; fail closed |
| 4 | Validation (zod) | `out_of_scope` | Free |
| 5 | Unicode, look-alikes, injection and abuse rules, PII redaction (Mastra processors and the engine's own) | `injection`, `abuse` | Free |
| 6 | Scope rules: marked, never refused (the agent steers to a specialist) | — | Free |
| 7 | Booking intent (Psizone): free times as a `booking` event | — | One scheduling read |
| 8 | Strict level only: Mastra's injection and moderation detectors, both failing open | `injection`, `abuse` | Two small model calls |
| 9 | The agent, conversation first, with its tools (`searchKnowledge`, `listTopics`, `getEntry`, `findPage`, `contactDetails`, `servicesList`), at most 4 tool calls, temperature 0.5, the last 10 turns | — | The reply call |
| 10 | The post-check: language, figures and clinical terms against the tool results, the sister-brand rule, a repeat; one regeneration, then the sentences left out | — | At most one more call |
| 11 | The `psi-faithfulness` scorer on a cited reply, reported through `onScore` | — | Free |

The screening level is the admin's (`screeningLevel`, default `standard`: no model detectors).

## Accuracy

A reply's factual claims are checked, not its conversation: a sentence carrying a figure
(number, phone, price, date, time) or a clinical, "free" or effect term that no tool result, topic
list or brand text carries is flagged. A flagged reply is regenerated once with "only facts from
the tool results"; still flagged, those sentences are left out; nothing left, the brand's "not on
our site" line. Citations to a passage no tool returned are dropped. The check is lexical.

## Conversation, memory and consent

**Conversation mode** (no consent needed, nothing stored): the page keeps its turns in a Datastar
signal; the last 10 answered turns go to `ask` as `history`; refused turns stay visible but are never
sent (`conversation.ts`). **Memory** (stored) only with a `threadId`, passed after consent: the
last 10 messages, nothing semantic; a retried, trimmed or failed reply is removed from the thread.

## The team's settings (store) and the CMS's `ai-settings`

A brand with a scheduling tenant (Psizone, Hemi-Sync) is governed by its organisation's visitor-assistant settings in the
scheduling store (the clinic's Setări → Asistent, the site's surface, over the estate's defaults and within its
ceilings), read per turn through `schedulingFromEnv(...).scheduling.assistant` (pass it as `visitorAssistant`; reads
are kept `VISITOR_CONFIG_TTL_MS`, 10 s, and a turn's own use empties the cache).

| Decided by the **store** (it wins) | Kept by the **CMS** (`ai-settings`) |
|---|---|
| whether the guide runs (`enabled`; the CMS's `guideEnabled` no longer switches it) | the conversation style, the team's notes, the topics, the copy |
| the model and its fallbacks, the temperature (the CMS's `behaviour.model` and `creativity` are superseded) | retrieval: `embeddings`, `embedModel`, `deepSearch` |
| the longest answer (`maxOutputTokens`, capped by `tokens.perRequest`), the tokens of one turn, the tool calls, the time limits | the screening level |
| messages per minute (per client), per day (per visitor key, in place of `exchangeLimit`/`exchangeWindowHours`) and per conversation | |
| the organisation's tokens per day and month and its monthly budget (with the hard stop) | |
| booking in the chat (`booking.horizonDays`, `booking.offerCallback`), the hand-over to a person (`handoff.*`) | |
| the history read back, the conversation memory's retention and its folding into a summary past `memory.compactAfter` (by `model.summary`, on a kept conversation only), what is logged (`logging.*`) | |

A stop by the organisation's limits (switched off, the budget, the month's or day's tokens) is checked before any model
call: the guide says the profile's warm `fallback.paused` line with the booking form's button (Romanian and English),
and the turn counts as a limit met. Each turn's use (tokens, cached tokens, cost; every model call, a retry too) goes to
the organisation's visitor meters. When the store cannot be read, the last good read holds; before any, the built-in
visitor settings. The booking's details are not settings: the guide asks for the name, the age, what is going on, a
phone and an e-mail, shows the summary only when all five are in, and holds and submits only on the visitor's explicit
yes; no configuration skips one (`packages/engine/src/test/booking-limits.test.ts`). A brand without a scheduling
tenant (EQ-SYNC, the blog) runs on the CMS's settings and the engine's own limits.

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
