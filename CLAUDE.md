# psi — estate monorepo

The psi estate's own code: its apps, packages and tools. The PLATFORM (provisioning, cluster,
Argo, sign-in, Polaris authorization, OpenBao, Harbor, e-mail, notifications, observability)
comes from SEB (github.com/silviuiacobivfuture/seb) as a versioned bundle pinned in
`estate/platform.lock` and installed into `.seb-bundle/`. SEB is the platform only: psi's user
interface and its translations are psi's own code, here, and are expected to diverge from any
other estate's. **Platform code is never copied here; a platform change is made in SEB and
arrives with a release.**

psi and RMX (the first estate) are the two business repositories on SEB. They follow the same
structure and the same rules; where this file is silent, RMX's `CLAUDE.md` is the reference.

## Asking the person (HARD RULE)

Every question goes through the interactive question tool, never as prose at the end of a reply.
**Verify before you ask**: read the file, run the query, check the thing exists. Every option
carries its pros AND its cons; offer every real option, including the expensive thorough one;
recommend the option that compromises nothing and follows this repository's patterns, and state
its cost. Batch related questions in one call. Never ask and then answer yourself. Do not ask
what you may simply do (a conventional default, a reversible edit, a fact in the repository).
Applies to main agents AND subagents; restate it in every delegation prompt.

## Layout

| Path | What lives there |
|------|------------------|
| `apps/<name>/` | one application each (landing pages, services, consoles) — `pnpm new-app <name>`; convention in `apps/README.md` |
| `packages/<name>/` | psi's own shared code (`@psi/design`, `@psi/ui`, …) |
| `tools/<name>/` | psi's own CLIs and scripts |
| `estate/` | identity, permissions inputs, SEB lock, piece lists, bundle installer, `APP-SECRETS.md` |
| `gitops/` | genesis's render of the platform + each app's `gitops/services/<app>/{base,overlays/dev}` and its registration in `gitops/apps/overlays/dev/apps/` |
| `docs/` | how psi works with SEB; `docs/brands/` holds the brands' business context and decisions |
| `.seb-bundle/` | the installed SEB release (gitignored): its tools, doctor, built libraries, CI kit |

Genesis owns `gitops/` (except an app's own folders), `pieces/` and `components/`. Do not
hand-edit what it writes; re-run it. OpenBao's platform layer (the secret store, the auth
reconcile) runs from the SEB bundle (piece `openbao-store`); the estate adds to it only through
`estate/seb-components/openbao-store/`.

## EQ-SYNC is retired (HARD RULE)

`apps/eqsync-web` (and `gitops/services/eqsync-web`) is retired as of 2026-11-12, on the owner's
order. Do not read, edit, test, search, plan for or mention it, and do not re-enable it without the
owner. It is excluded from tools: `.claude/settings.json` denies Read/Edit on both folders, the
root `.ignore` hides them from search, and the pnpm workspace no longer contains the app. The one
switch is `RETIRED_SITES` in `packages/content/src/retired.ts`; every consumer reads it.

## Commands

```bash
pnpm lint                     # Biome (config: .mono/biome.json)
pnpm lint:fix
pnpm affected                 # lint, type-check, test, build for what the change affects
pnpm nx run @psi/<app>:<target>
pnpm --filter @psi/<app> test -- --maxWorkers=2
pnpm new-app <name> --service # a new service with its package, Dockerfile, declaration and gitops
```

## Worktrees install their own dependencies (HARD RULE)

A new worktree runs `pnpm install --frozen-lockfile` before anything else. Never link, copy or
write into the main checkout's `node_modules` (or anything else in it) from a worktree: a
workspace package resolved through such a link is the main checkout's source, not yours.
Gitignored files (`.env`, credentials) exist only in the checkout that made them — a search in a
worktree that finds none proves nothing.

## Tests (HARD RULE — workstation safety)

Tests run on a workstation, not a CI box. **Never the whole suite at once.** `pnpm test` runs
every project and is for CI only.

```bash
.claude/hooks/test-slot.sh -- pnpm --filter <project> test -- --maxWorkers=4  # one project
.claude/hooks/test-slot.sh -- pnpm exec vitest run path/to/file.test.ts --maxWorkers=2
.claude/hooks/test-slot.sh -- pnpm exec nx run <project>:test --parallel=1
```

- **Every suite runs through the slot wrapper** `.claude/hooks/test-slot.sh -- <command>` (from
  a worktree, the main checkout's absolute path): its own cgroup with a hard memory ceiling
  (5 GB, 4 cores, no swap), admitted when one of the slots — sized from free RAM — is free. A
  PreToolUse hook (`.claude/hooks/test-concurrency-guard.sh`) denies whole-suite runs and an
  unwrapped run while another is in flight. The hook is a backstop, not the rule.
- **Cap workers explicitly** (`--maxWorkers=4` or lower); Vitest otherwise takes every CPU.
- **Narrow before you widen**: the file, then the project.
- `NX_DAEMON=false` (set in `.claude/settings.json`).

## Quality gates (HARD RULE — green before you commit)

Build, lint, type-check and tests green for everything the change affects AND what depends on
it, seen green, before the commit: `pnpm affected` (capped, through the slot wrapper). A
pre-existing failure you keep stepping over is a defect you have adopted. No dead code, no
secrets. Report honestly: a failed or skipped step is said, with its output. **A gate counts
only once it has been seen refusing**, for every failure mode it guards. Never wrap or route
around a guard that refuses you; fix the cause or report it.

CI starts from `git clone`: anything generated but gitignored exists for you and not for CI. A
package produces its own generated code through its own nx target, and a consumer never depends
on an out-of-band step.

## Platform conventions (HARD RULES — every app, every agent)

1. **i18n first.** Every user-facing string goes through the i18n library (Paraglide, per-app
   `messages/` and `project.inlang/`), in per-namespace bundles; no bare strings in JSX/TSX.
   Never translated: authorization type and relation names, catalog keys, error codes, code
   samples — those are contracts.
2. **Shared UI first — one design language: psi's.** `packages/design/` (`@psi/design`) is the
   language: tokens for eight themes (Psizone, EQ-SYNC, Hemi-Sync, Blog; each dark and light),
   brand books, component guides. `packages/ui/` (`@psi/ui`) is the library built on it. Every
   psi app uses them; a component two apps need is never written into an app — port it up, and
   if two implementations exist, consolidate them rather than add a third. Colour only from the
   token roles, never a raw hex. Motion honours `prefers-reduced-motion`.
3. **Authorization through Polaris** (SEB's `autorizare`). No hand-rolled roles or permissions
   file. An app with permissions declares `apps/<name>/authz.manifest.json`; the model and
   catalog are generated (`estate/authz.json`). Polaris is the CONTROL plane, OpenFGA the DATA
   plane: applications call OpenFGA directly and keep authorizing when Polaris is down; they pin
   a model id, never "latest"; type names are prefixed per app. **Never write `now` into a
   tuple's persisted condition context**: store `granted_at` and `valid_for`, supply `now` at
   Check time.
4. **Exhaustive testing.** Presence (registered, reachable, renders), functionality (every branch
   and boundary: empty, one, many, max, max+1, nil, duplicate, out-of-order, unicode) and side
   effects (what changed AND what did not). Unit, integration against the real seam, end-to-end
   as a named case list. Every refusal reason its own case, asserting nothing was written. UI:
   every state, every prop, mouse and keyboard, callbacks fire once and not when disabled, axe
   WCAG 2.2 AA per theme, reduced motion actually suppresses motion. Banned: tests of private
   functions, mocks of our own code, markup snapshots, assertions a behaviour-free refactor
   breaks.

## The stack

Server-rendered TypeScript with Datastar and Tailwind. **No React** in the sites. Apps are
Node 24 + Hono, rendering typed TSX to HTML on the server; interactivity is Datastar (client
bundle self-hosted; `@starfederation/datastar-sdk` for SSE patches); styling is Tailwind 4.
`apps/cms` (Payload on Next.js) is the one exception, because Payload is. `pnpm new-app`'s
web template is SEB's Vite + React: a new psi site starts from an existing site instead.

## Type safety and files

No `any` (explicit, `as any`, implicit), no `@ts-ignore`/`@ts-nocheck` (`@ts-expect-error` only
for a genuine upstream bug, with its reason), no `as unknown as`, no non-null `!`, no
`object`/`Function`/`{}` types. Parse every boundary (request bodies, env, `searchParams`,
`JSON.parse`, third-party responses) with a schema (zod) and derive the type from it — never a
hand-written interface beside it. Exported functions state their types. Discriminated unions,
exhaustive `switch` with a `never` default. Files ≤ 500 lines, one responsibility each, no
`utils.ts`/`helpers.ts` dumps, named exports (except framework entry files). Three strikes →
extract. No TODOs in code. No fallback logic without approval.

## No `rmx` naming

Package names, imports, paths and identifiers are `@psi/…`/psi's own. Any `rmx` (or
`recomex`) left here is a leftover to remove, never a pattern to copy.

## Consumables move with the thing they consume (HARD RULE)

A change to anything a consumer can observe (an SDK, a CLI, a generated client, a webhook payload,
a field, an error code, a refusal reason, a default) reaches every consumer in the same change:
derive clients from the contract rather than maintain them (and where that is impossible, add
the guard that fails when they disagree), test at the consumer's level, update examples and docs
that show a call, and say plainly when a change is breaking, which consumers it hits, and what
each must do.

## Secrets and environments

- Secrets never enter git. `.env*` are gitignored; secrets live in the estate's OpenBao.
- **A deployed app that needs secrets fails loud**: every required key declared per key in its
  ExternalSecret `data[]` (missing ⇒ `SecretSyncedError`) and in its `seb.app.yaml`, an
  `assert-secrets` initContainer that exits `MISSING REQUIRED SECRET: <key>`, and a row in
  `estate/APP-SECRETS.md` (the estate's half of `gitops/services/APP-SECRETS.md`). SEB's doctor
  derives its checks from the declaration.
- Deployed workloads are Kyverno-compliant: requests AND limits, non-root, no privilege
  escalation, capabilities dropped, mirror images pinned by digest, `harbor-pull` for psi's own
  images.
- **The branch is the environment** (`dev` → psi dev). A merge is the deploy. Never hardcode an
  environment's resource; derive it from the branch.
- **Everything as code**: no console clicks, no lasting `kubectl apply` by hand, no secrets
  pasted. Anything that changes the running estate is stated before it is pushed.

## Changelog (HARD RULE — enforced at commit, for people and agents alike)

**A business-facing commit to an app carries its changelog entry, recorded as a trailer.**
Business-facing = `feat`, `fix`, `perf`, any `!`, or a `BREAKING CHANGE:` footer, staging files
under `apps/<app>/`. `.husky/commit-msg` (`scripts/changelog-trailer.mjs`) refuses it otherwise
and prints exactly what to run. Merge, `fixup!`/`squash!`, reverts and the CI deploy commits
(`[skip ci]`, author `estate-ci`) are exempt; docs, refactor, test, ci, chore need nothing.

- **Where an app's entries go: `changelog.json`** at the root. Each app is either
  `{"tenant": "<slug>", "language": "<ro|en|…>"}` (its tenant in the estate's changelog
  service, the language its entries are written in) or `{"none": "<why it has no changelog>"}`.
  An app not declared is held to the full rule. A new tenant is provisioned from the hub
  registry (its `estate.changelog` clients), not here.
- **The command** (one for everybody; agents always pass every flag, it never prompts without a
  terminal):
  `pnpm changelog --app <app> --category <feature|improvement|bugfix|breaking|security|note>
  --title "…" --body "…" [--version x.y.z] [--json]`. It publishes through the service's own
  command in its pod — no key on this machine — over **this estate's** kubeconfig only
  (`~/.estates/<slug>/infrastructure/hetzner/kubeconfig-<env>.yaml`), verified by the
  cluster's own ingress hosts; it refuses, publishing nothing, when it cannot reach it.
- **The trailer**, the message's LAST paragraph, one per app the commit touches:
  `Changelog: <app> <entry id>` (the line the command prints), or
  `Changelog: <app> none — <why its users see nothing to announce>`. With one app the `<app>`
  may be dropped; `Changelog: none — <reason>` covers every app. A reason is 8+ characters.
- **Tone:** written for the app's users, in its declared language: what they can now do or what
  stopped going wrong. Never agents, AI, tooling, refactors or internal churn; it reads as if one
  competent developer made the change on purpose. Infra, gitops, CI, tests, dependency bumps:
  no entry (and no business-facing type either).
- **Never `--no-verify` past it.** "none" is a statement that users see nothing; it is not a
  way to skip writing the entry.
- **Delegating:** restate this rule — the command, the trailer, the tone — in every delegation
  prompt that may commit to an app. Subagents see the refusal, not this file.
- **psi today:** no app under `apps/` has a changelog tenant yet (the hub registry declares only
  Polaris's), so `changelog.json` declares none and every business-facing app commit states
  `Changelog: <app> none — <reason>` until its tenant is provisioned and declared. Entries are in
  English (`ESTATE_LOCALE: en`).


## Commits and versions

Conventional commits (`feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert`) with a
version tag: `[PATCH]` fix, `[UPDATE]` feature, `[RELEASE]` breaking. `.husky/commit-msg`
refuses anything else, and WIP/temp/"updates"/"changes". No `Co-Authored-By` or AI attribution.

The same hook **bumps every package that owns a staged file** (nearest `package.json` with a
version; the root is skipped) into the SAME commit; `.husky/post-commit` folds the bump in with
a guarded amend (`scripts/version-bump.mjs`). Never edit a `version` by hand. Stage files by
name, never `git add -A`. Never `--no-verify`. `prepare` points `core.hooksPath` at the tracked
`.husky/` so the hooks also run in worktrees.

## Every reply

Ends with a `Progress` line (against the active plan's own units, `done / total (percent)`,
partials and blocked items named; or "no active plan; single task") and a `Next steps` list.
Applies to main agents AND subagents; restate it in every delegation prompt.

## Reference checkouts (read-only)

- **SEB** at `../seb/platform`: the estate's platform. Read it, never modify it from here.
  Refresh it before relying on it: `git -C ../seb/platform pull --ff-only`.
- **RMX** at `../rmx/platform` (the first estate): how an estate consumes SEB, and a source of
  pieces to take over. Read it, never modify it. Compare against `origin/dev`, not a stale
  local branch.
