# @psi/guide

The guide for the psi brand sites (Psizone, EQ-SYNC, Hemi-Sync România, the Blog). It answers a
visitor's question only from reviewed, published content, cites the pages it used, and streams the
answer as events that an app renders through Datastar. It is a Mastra agent per brand
(`@mastra/core`), with models served through OpenRouter (`@openrouter/ai-sdk-provider`) and optional
conversation memory on LibSQL (`@mastra/memory`, `@mastra/libsql`).

The module ships **no user-facing strings**. Refusals arrive as reasons, and the app renders them
from its own i18n.

## Contract

```ts
import { createGuide, createMemoryRateLimiter, type GuideEvent } from "@psi/guide";

const guide = createGuide({
  brand: "psizone",            // "psizone" | "eqsync" | "hemisync" | "blog"
  knowledge,                   // a Knowledge from @psi/knowledge
  apiKey: undefined,           // defaults to OPENROUTER_API_KEY
  model: undefined,            // defaults to PSI_GUIDE_MODEL, then DEFAULT_MODEL
  memory: { url: "file:.data/guide.db" }, // optional; used only for asks with a threadId
  rateLimiter: undefined,      // defaults to createMemoryRateLimiter() (10 a minute per client)
  modelScreening: true,        // Mastra's model guardrails; on by default
  screeningModel: undefined,   // OpenRouter slug for the guardrails; defaults to `model`
  onFailure: (f) => log.warn("guide stage failed", f), // { stage, error }, no visitor content
  onScore: (s) => metrics.faithfulness(s),            // { scorer, score, claims, supported, passed }
});

for await (const event of guide.ask(
  { question, locale: "ro", history, threadId },
  { signal, clientId: sha256(sessionId) },
)) {
  // GuideEvent
}
```

```ts
type GuideEvent =
  | { type: "thinking" }
  | { type: "text"; delta: string }
  | { type: "sources"; sources: ReadonlyArray<Source> }
  | { type: "refusal"; reason: RefusalReason }
  | { type: "done" };

type RefusalReason =
  | "crisis" | "out_of_scope" | "injection" | "abuse" | "rate_limited" | "no_content" | "unavailable";
```

- **A successful answer** is `thinking`, then `text`, then `sources`, then `done`. There can be any
  number of `text` events. Text arrives a sentence at a time, because each sentence is checked
  before it goes out.
- **Citations.** `[k]` in the text points to `sources[k-1]`. `sources` lists only the passages the
  answer cited, in the order it cited them.
- **A refusal** is `refusal` followed by `done`. It comes after `thinking` once retrieval has
  started. A refusal can also follow `text`, when a sentence fails a check partway through the
  answer. The sentence that failed is never sent; the app replaces the partial answer with the
  refusal.
- **Every stream ends with exactly one `done`.** `ask` never throws and never hangs. Every failure
  becomes a refusal, and every wait has a deadline (`timeouts`: `retrievalMs` 8 s, `screeningMs`
  8 s, `idleMs` 20 s, `totalMs` 60 s).
- **Stopping.** Breaking out of the loop, or aborting `signal`, stops the model call.
- **`clientId`** (in the second argument, not in the input) is what the rate limit counts: a hash
  of the session or the IP, never a name or an e-mail. Without it the guide does not rate-limit.

## Refusal reasons, for the apps

The module ships no copy. Each app renders every reason from its own i18n, **in the locale it
passed to `ask`** (the configured language), never in the language the visitor wrote in. An app
that keeps a `Record<RefusalReason, …>` of messages needs a key for each reason below.

| Reason | When | What the app shows | Model called? |
| --- | --- | --- | --- |
| `crisis` | Self-harm, suicide, abuse or emergency language, in Romanian or English, with or without diacritics, even hidden with invisible characters. Wins over every other reason, the rate limit included. | Its fixed message with 112 and the clinic phone. | Never |
| `out_of_scope` | A diagnosis, medication or individual treatment request. Invalid input (empty, even once cleaned, over 1000 characters, malformed). An answer that broke a brand rule (Psizone naming Hemi-Sync or EQ-SYNC on a clinical question). | That the guide cannot answer this here, and how to book an evaluation. | No (the brand rule runs on the answer) |
| `injection` | The question (or a history turn) tries to change, reveal or replace the guide's instructions, or make it play another role. | A neutral "the guide can only answer questions about our services". | No, when the rules catch it; one call when the detector does |
| `abuse` | Insults, threats, slurs, obscenities or explicit content aimed at the guide or the team, with nothing about health or a child around it. | A short, calm boundary ("we answer respectful questions"), with the contact details. | No, when the rules catch it; one call when moderation does |
| `rate_limited` | The `clientId` asked more questions than the limiter allows. | "Too many questions in a short time; try again in a minute." | Never |
| `no_content` | Retrieval found nothing. The model judged the passages do not answer. The answer was not faithful: a claim without a citation, a figure the cited passages do not hold, a claim they do not support, or no grounded claim at all. | That there is no reviewed answer yet, with the contact details. | No for empty retrieval |
| `unavailable` | No API key, a provider or knowledge failure, a timeout, an abort, the model not finishing, the answer written in the other language, the rate limiter failing, the injection detector failing (it fails closed). | "The guide is unavailable right now; try again." | — |

## The guardrail chain, in order

Cheapest and most certain first. A step that refuses stops the chain, so later (costlier) steps
never run.

| # | Step | What it does | Refuses with | Cost | If it fails |
| --- | --- | --- | --- | --- | --- |
| 1 | Crisis rules | On the raw question and on the cleaned one (step 4), before validation. | `crisis` | Free | Cannot fail |
| 2 | Rate limit | The app's `RateLimiter` (default: in-memory fixed window), keyed by `clientId`, with the `screeningMs` deadline. | `rate_limited` | One store call | Fails **closed** to `unavailable` (`onFailure` stage `rate_limit`): an outage must not open the model bill to a flood |
| 3 | Validation | `AskInputSchema` (zod): length and shape limits. | `out_of_scope` | Free | — |
| 4 | Mastra `UnicodeNormalizer` | NFKC, control characters, whitespace. | — | Free | Any error in steps 4 to 8 is `unavailable` |
| 5 | `LookalikeFolder` (own processor) | Removes zero-width and bidirectional characters, folds Cyrillic and Greek look-alikes in mixed-script words. Mastra has no processor for this. | — | Free | |
| 6 | Injection rules (own processor) | Romanian and English override, reveal and role-play requests, chat-template tokens; on the question and every history turn. | `injection` | Free | |
| 7 | Abuse rules (own processor) | Obscenities, slurs, insults addressed to "you", threats; only on the question, and never when it is about health, therapy or a child (tics, Tourette, bullying). | `abuse` | Free | |
| 8 | Mastra `RegexFilterProcessor` | Redacts e-mail, phone, card (Mastra's `pii` preset) and Romanian phone, CNP and IBAN before search, the model and memory. Never refuses. Input only: the passages may hold the clinic's phone. | — | Free | |
| 9 | Scope rules | Diagnosis, medication, individual treatment. | `out_of_scope` | Free | — |
| 10 | Language | Detects Romanian, English or a mix, deterministically (function words and diacritics, so stripped diacritics work). The site's `locale` is fixed here: retrieval and the answer use it whatever the visitor wrote. | — | Free | — |
| 11 | Retrieval | `Knowledge.search` in the configured locale. | `no_content` when empty | One search | `unavailable` |
| 12 | Mastra `PromptInjectionDetector` | Strategy `block`, threshold 0.7, on the cleaned, redacted question only. | `injection` | One small model call (in parallel with 13) | Fails **closed** to `unavailable` (`onFailure` stage `screening`): it exists for what the rules miss, failing closed only costs a retry, and crisis was handled at step 1 |
| 13 | Mastra `ModerationProcessor` | Strategy `block`, threshold 0.7, categories harassment, hate, sexual-explicit, threat. Self-harm is left out (crisis owns it); its instructions say harm described as a concern is never abuse. | `abuse` | One small model call | Fails **open**: the answer is still grounded, gated and scored |
| 14 | Mastra `TokenLimiterProcessor` (on the agent) | Keeps the prompt within 12 000 tokens by dropping the oldest history. | — | Free | `unavailable` |
| 15 | The answer | Temperature 0.1, from the passages only, citations required. | — | The answer call | `unavailable` |
| 16 | Per-sentence gate | Before each sentence goes out: the `NO_CONTENT` sentinel, the sister-brand rule, the language (a sentence clearly in the other language), and faithfulness (below). | `no_content`, `out_of_scope`, `unavailable` | Free | — |
| 17 | Mastra scorer `psi-faithfulness` | The whole answer, after it is complete (`createScorer`), reported through `onScore`. | `no_content` | Free | `unavailable` |

Steps 12 and 13 run only when retrieval found passages, so a question nothing answers costs no
model call. They run before the agent, so a blocked question never reaches the answer model or a
consented thread. With `modelScreening: false` they are skipped (two model calls fewer per
answered question). Running them on a small, cheap model through `screeningModel` is the usual
production set-up.

Not used, and why: Mastra's `LanguageDetector` is a model call whose answer could not change
anything (the answer language is the configured locale); `PIIDetector` is a model call, and the
names it would redact include practitioners', which are legitimate questions;
`SystemPromptScrubber` is a model call on the output, and the guide's instructions are not secret
data (the answer gate already stops anything not grounded in the passages); `ClassifierProcessor`
needs an AI SDK decision model, which OpenRouter does not provide.

## Language

The site's `locale` is the conversation's language and is settled before retrieval. The system
prompt states it first ("Limba conversației este româna…"), including for refusals and referrals.
When the visitor writes in the other language, or mixes both, the per-call system message says so
and repeats that the answer stays in the configured language. The search, and the `searchKnowledge`
tool's query, use the configured locale. A sentence of the answer clearly in the other language
stops the answer as `unavailable`.

## Accuracy

Each claim-bearing sentence must cite a passage the model was shown, use only figures those
passages hold, and share at least half of its content words (by four-letter stem, so Romanian
inflections match) with them. Questions, courtesies and short next steps (booking, an article or a
hub to read next, "Folosește căști"; at most four content words, so one cannot carry a claim) are
not claims. A sentence that fails is never sent; the answer becomes `no_content`. Sentences end at
`.`, `!`, `?`, `…` and newlines, but not after an abbreviation ("dr.", "str.", "nr.") or an initial.
The gate therefore releases text a whole sentence at a time (no longer at `:` or `;`), and a run-on
is released at a word boundary after 1000 characters.

The complete answer is then scored by the `psi-faithfulness` Mastra scorer (supported claims over
claims); it passes only with at least one claim and every claim supported. An answer with no claim
at all ("Da [1].") has already streamed when the scorer refuses it, so the app replaces it, as with
any refusal after `text`. `onScore` receives the score of every answer that reached an accuracy
check, never the question or the answer.

The check is lexical, not semantic: a paraphrase that keeps the passage's words but changes its
meaning, or a figure written in words ("o oră" for "50 de minute"), can pass. `@mastra/evals`
(`@mastra/evals/scorers/prebuilt`: `createFaithfulnessScorer`, `createHallucinationScorer`,
model-judged) is not installed; adding it would be one more model call per answer.

## Memory and consent

Nothing is stored unless the app passes a `threadId`. The app passes one only after the visitor has
consented. The `threadId` must be unguessable (16 to 128 characters from `A-Z a-z 0-9 _ -`, for
example a UUID from the session), because it is the only key to the stored thread. When a thread is
in use, its earlier messages come from memory and `history` is ignored. Without a thread, `history`
is used and nothing is written. Memory keeps the last 10 messages. Semantic recall, working memory
and title generation are all off. A crisis, injection or abuse question is never stored, because it
never reaches the agent; what is stored is the cleaned, redacted question. An answer that did not
reach the visitor complete (refused, failed or abandoned) is removed from the thread in the
background once the run settles, within about 5 seconds. The visitor's question stays. Apps should
pass only answered turns as `history`.

## Privacy

OpenRouter routing uses `data_collection: "deny"`. Mastra's logger is silenced on the guide's
agents. Mastra's guardrail processors run internal agents whose console output the guide cannot
silence, so every error leaving the model is replaced by one that names only its kind and HTTP
status (`ProviderError`): no request or response body is ever printed. `onFailure` and `onScore`
carry no visitor content.

## Environment

| Variable | Meaning |
| --- | --- |
| `OPENROUTER_API_KEY` | OpenRouter key. Read once, in `createGuide`. If it is missing, every answer is `unavailable`. Never log it. In the estate it comes from OpenBao. |
| `PSI_GUIDE_MODEL` | OpenRouter model slug. A malformed value is ignored. |

**Default model:** `xiaomi/mimo-v2.6-flash` (`DEFAULT_MODEL`), the owner's choice (2026-11-11).
OpenRouter lists it with tool calling and a 1M-token context, at $0.14 / $0.28 per million input /
output tokens (checked 2026-11-11). Any other OpenRouter model can be set through
`PSI_GUIDE_MODEL` or the `model` option.

## Streaming to Datastar

Each event becomes a `datastar-patch-elements` SSE event that replaces the answer region by id.
Refusal copy comes from the app's messages.

```tsx
import { streamSSE } from "hono/streaming";
import type { GuideEvent, Source } from "@psi/guide";

export function streamGuide(c: Context, locale: Locale, question: string): Response {
  return streamSSE(c, async (stream) => {
    const control = new AbortController();
    stream.onAbort(() => control.abort());
    const patch = async (node: JSX.Element): Promise<void> => {
      const html = (await node.toString()).replace(/\n/g, " ");
      await stream.writeSSE({ event: "datastar-patch-elements", data: `elements ${html}` });
    };
    let text = "";
    let sources: ReadonlyArray<Source> = [];
    const clientId = hashOf(c); // the app's own hash of the session or IP
    for await (const event of guide.ask({ question, locale }, { signal: control.signal, clientId })) {
      if (event.type === "thinking") await patch(<Answer state="thinking" />);
      else if (event.type === "text") await patch(<Answer state="writing" text={(text += event.delta)} />);
      else if (event.type === "sources") sources = event.sources;
      else if (event.type === "refusal") await patch(<Refusal reason={event.reason} locale={locale} />);
      else if (sources.length > 0) await patch(<Answer state="done" text={text} sources={sources} />);
    }
  });
}
```

Each source card shows `title`, `url`, and "revizuit de {reviewedBy}, {reviewedAt}" when those are
set. The answer is never rendered without at least one source.

## Development

```sh
pnpm exec tsc --noEmit
pnpm exec vitest run --maxWorkers=2
```

The tests use a local HTTP server that stands in for OpenRouter's `/chat/completions` API, so the
real provider, Mastra (its processors and scorer included) and this module all run. Streaming
requests are the answer; non-streaming ones are Mastra's guardrail processors, answered from a
separate script (clean by default, or flagged, failing or hanging) and recorded apart. They also use
an in-memory `Knowledge` that follows the `@psi/knowledge` contract. Every refusal reason has its
own test, and ordinary clinical questions ("Cum arată o evaluare pentru autism?", a child swearing
at school, tics) are tested to pass every guardrail.
