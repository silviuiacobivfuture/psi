# Agents everywhere

Status of every psi app and its agent, and the proposal for the CMS's editor assistant.
Owner request (2026-11-12): "enable use of the agents within all apps". The engine is
`@psi/engine`, psi's profiles are `@psi/guide`, and the knowledge is `@psi/knowledge`
(see `packages/engine/README.md`).

## App × agent

| App | Agent (Mastra id) | Where it answers | Status |
| --- | --- | --- | --- |
| psizone-web | `psi-guide-psizone` | `/ghid`: the home hero's ask bar, each hub's compact ask bar, the Compass on every page | Live. It has conversation mode, its tools (`searchKnowledge`, `listTopics`, `getEntry`, `findPage`, `contactDetails`, `servicesList`), and booking in the chat (free times from @psi/scheduling, then the booking form's hold, confirm and reference) |
| psizone-web | `psi-guide-psizone-scheduling` | the scheduling tools (find, propose, cancel) | Registered. In-chat booking calls the same `findAvailability` directly; the separate agent stays for Studio and for future model-driven booking |
| eqsync-web | `psi-guide-eqsync` | `/ghid`: the home page's guide section, the Compass | Live, with conversation mode and tools. The plan's AskBar on `/protocoale` ("Search arrives in phase D") is not added yet: the protocol pages are a later phase |
| hemisync-web | `psi-guide-hemisync` | `/ghid`: the home page's club and guide section, the Compass | Live, with conversation mode and tools (the plan's P3 guide) |
| blog-web | `psi-guide-blog` | `/ghid`: the guide panel on the index and on each article, the Compass | Live, with conversation mode and tools |
| design-gallery | none | an AskBar specimen (`action="#"`) | Not an agent surface; it shows the component |
| cms | proposed: `psi-editor` | the Payload admin | Proposal below. The blog agent owns `apps/cms`; nothing is built here |

Every surface shares the same behaviour:

- **Guardrails**: crisis first, the burst and exchange limits (`exchange_limit`, default 20 a day
  per session, browser and fingerprint key), the deterministic chain, scope and the accuracy
  gate. The model detectors run only at `screeningLevel: "strict"`.
- **Small talk**: a greeting, "what can you do?" and thanks get the brand's welcome or thank-you
  line, with no model call.
- **Demo content**: with `PSI_DEMO_KNOWLEDGE=true` (development only), answers can cite demo
  entries, whose source titles start with "[DEMO]".

## Proposal: the CMS editor assistant (`psi-editor`)

**What it is.** It is a fifth profile, for editors in the Payload admin, not for visitors. It
helps draft and check a KnowledgeEntry or an article. It never publishes, never changes
`status`, and never sets `reviewedBy` or `reviewedAt`.

**What it does** (Payload admin UI, on a draft):

- **Draft help.** It suggests a standfirst within 60 words, a title, and a plain-language rewrite
  of a paragraph. Suggestions are shown beside the field and the editor accepts them by hand.
  Nothing is written to the document without a click.
- **Checks.**
  - It runs the guide's own faithfulness and claim checks on the draft: claim markers such as
    "cures" or "guaranteed", figures without a source, and clinical wording on a non-clinical
    kind.
  - It looks for missing pieces: no sources on a health article, no next step, a body outside
    80–250 words for a KnowledgeEntry.
  - It flags the brand rules, for example a sister brand named on a Psizone clinical page.
- **Related content.** It searches the brand's published content through the same tiered
  search, to link related entries or spot duplicates.

**How it fits.**

- It is a profile in `@psi/guide` (`psi-editor`), with its own voice and policy rules: "you
  draft for an editor; you never publish; you never write medical advice; you mark every
  suggestion as a suggestion".
- Its tools are read-only: `searchKnowledge`, `getEntry`, and a `checkDraft` tool that wraps
  `createFaithfulness` and the scope rules.
- Its tools have no write path into Payload. The CMS calls the agent through a server route
  guarded by Polaris (`apps/cms/authz.manifest.json`, the editor role), never from the browser
  with a key.
- Audit: each suggestion is logged with the editor, the document id and the time, never the
  draft text.
- Data policy: `deny` routing, as for the guides. Drafts can hold unpublished health content.

**What it does not do.** It does not auto-publish. It does not run on save and change fields.
It does not review clinically: a clinician's review stays the human gate that the
retrievability rule checks.

**Open questions for the owner.** Should it be available to every editor, or only to
clinicians? Is the per-editor daily limit the same `exchangeLimit`? Should suggestions be kept
in the document's history or dropped?
