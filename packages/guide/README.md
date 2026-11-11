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
import { createGuide, type GuideEvent } from "@psi/guide";

const guide = createGuide({
  brand: "psizone",            // "psizone" | "eqsync" | "hemisync" | "blog"
  knowledge,                   // a Knowledge from @psi/knowledge
  apiKey: undefined,           // defaults to OPENROUTER_API_KEY
  model: undefined,            // defaults to PSI_GUIDE_MODEL, then DEFAULT_MODEL
  memory: { url: "file:.data/guide.db" }, // optional; used only for asks with a threadId
  onFailure: (f) => log.warn("guide unavailable", f), // optional; { stage, error }, no visitor content
});

for await (const event of guide.ask({ question, locale: "ro", history, threadId }, { signal })) {
  // GuideEvent
}
```

```ts
type GuideEvent =
  | { type: "thinking" }
  | { type: "text"; delta: string }
  | { type: "sources"; sources: ReadonlyArray<Source> }
  | { type: "refusal"; reason: "crisis" | "out_of_scope" | "no_content" | "unavailable" }
  | { type: "done" };
```

- **A successful answer** is `thinking`, then `text`, then `sources`, then `done`. There can be any
  number of `text` events. Text arrives a sentence at a time, because each sentence is checked
  before it goes out.
- **Citations.** `[k]` in the text points to `sources[k-1]`. `sources` lists only the passages the
  answer cited, in the order it cited them. An answer that cites no passage is refused with
  `no_content`. So is an answer the model did not finish (cut off at the length limit, filtered or
  failed); that one is refused with `unavailable`.
- **A refusal** is `refusal` followed by `done`. It comes after `thinking` once retrieval has
  started. A refusal can also follow `text`, when a check fails partway through the answer. The app
  then replaces the partial answer with the refusal.
- **Every stream ends with exactly one `done`.** `ask` never throws and never hangs. Every failure
  becomes a refusal, and every wait has a deadline (`timeouts`: `retrievalMs` 8 s, `idleMs` 20 s,
  `totalMs` 60 s).
- **Stopping.** Breaking out of the loop, or aborting `signal`, stops the model call.

| Reason | When | Model called? |
| --- | --- | --- |
| `crisis` | Self-harm, suicide, abuse or emergency language, in Romanian or English, with or without diacritics. The app shows its fixed message with 112 and the clinic phone. | Never |
| `out_of_scope` | The question asks for a diagnosis, medication or individual treatment advice. Also: invalid input (empty, more than 1000 characters, malformed). Also: the answer broke a brand rule, such as Psizone naming Hemi-Sync or EQ-SYNC on a clinical question. | No (the brand-rule check runs on the answer) |
| `no_content` | Retrieval found nothing. Or the model judged that the passages do not answer the question. Or the answer cited no passage. Or it stated a percentage the passages do not contain. | No for empty retrieval |
| `unavailable` | No API key, a provider or knowledge failure, a timeout, the caller aborted, or the model did not finish its answer. | — |

Apps can validate input before streaming with `AskInputSchema`. The limits are exported as
`MAX_QUESTION_LENGTH`, `MAX_HISTORY_TURNS` and `MAX_HISTORY_TURN_LENGTH`.

### Memory and consent

Nothing is stored unless the app passes a `threadId`. The app passes one only after the visitor has
consented. The `threadId` must be unguessable (16 to 128 characters from `A-Z a-z 0-9 _ -`, for
example a UUID from the session), because it is the only key to the stored thread. When a thread is
in use, its earlier messages come from memory and `history` is ignored. Without a thread, `history`
is used and nothing is written. Memory keeps the last 10 messages. Semantic recall, working memory
and title generation are all off. A crisis question is never stored, because it never reaches the
model. An answer that did not reach the visitor complete (refused, failed or abandoned) is removed
from the thread in the background once the run settles, within about 5 seconds. The visitor's
question stays.

## Guardrails

1. **Crisis detection** runs on the raw question before validation. A long message from someone in
   crisis therefore gets the crisis message, not a length refusal.
2. **Scope detection** keys on the shape of the request, not on topic words. "Ce tratamente oferiți
   pentru ADHD?" passes. "Copilul meu are ADHD?" and "Should I stop the sertraline?" do not.
3. **Retrieval comes first.** The question is searched with `Knowledge.search`, scoped to the brand
   and locale. If nothing comes back, the guide refuses with `no_content` and no model is called.
4. **The agent.** It gets the brand's voice and grounding rules in the visitor's locale, from the
   brand books in `packages/design/brand-books`. It also gets the passages, numbered by source, and
   the `searchKnowledge` tool for one more search. It is told to answer only from the passages, to
   cite them, and to reply with `NO_CONTENT` when they do not answer the question.
5. **Post-checks** run on each sentence before it is streamed: the `NO_CONTENT` sentinel, Psizone
   naming a sister brand on a clinical question, and percentages that are not in the passages. At
   the end, the answer must cite at least one passage, and the model must have finished with
   `stop`.
6. **Privacy.** OpenRouter routing uses `data_collection: "deny"`. Mastra's logger is silenced,
   because it would log request bodies. `onFailure` reports only the stage and the error.

## Environment

| Variable | Meaning |
| --- | --- |
| `OPENROUTER_API_KEY` | OpenRouter key. Read once, in `createGuide`. If it is missing, every answer is `unavailable`. Never log it. In the estate it comes from OpenBao. |
| `PSI_GUIDE_MODEL` | OpenRouter model slug. A malformed value is ignored. |

**Default model:** `anthropic/claude-sonnet-5.5` (`DEFAULT_MODEL`). This is the latest Claude Sonnet
in OpenRouter's model list (checked 2026-11-11). It supports tools and a 1M-token context. For
short grounded answers it is the best current balance of quality, latency and price.
`anthropic/claude-opus-5.5` and `anthropic/claude-fable-5.2` are listed as more capable and can be
set through `PSI_GUIDE_MODEL`.

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
    for await (const event of guide.ask({ question, locale }, { signal: control.signal })) {
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

The tests use a local HTTP server that stands in for OpenRouter's `/chat/completions` SSE API, so
the real provider, Mastra and this module all run. They also use an in-memory `Knowledge` that
follows the `@psi/knowledge` contract.
