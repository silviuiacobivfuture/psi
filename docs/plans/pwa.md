# PWA and notifications

The four sites (Psizone :4310, EQ-SYNC :4320, Hemi-Sync :4330, Blog :4340) install as apps, work
offline, and send opt-in Web Push notifications. Code: `packages/pwa` (`@psi/pwa`) plus a small
`src/pwa/` per app and `messages/pwa/{ro,en}.json` per app. Status: built and verified locally;
production push is **off until the keys are seeded** (section 8).

## 1. What each site serves

| Path | What | Headers |
| --- | --- | --- |
| `/manifest.webmanifest`, `/en/manifest.webmanifest` | one manifest per locale, same `id: "/"` (one installed app), `start_url` `/` or `/en`, `scope: "/"`, `display: standalone`, colours = the default theme's `bg` token | `application/manifest+json`, 1 h |
| `/sw.js` | the service worker, root scope; the server prepends `self.__PSI_PWA__` (site, version, words) | `no-cache`, `Service-Worker-Allowed: /` |
| `/assets/pwa/client.<hash>.js` | the page client (install prompt, subscribe) | immutable, 1 year |
| `/offline`, `/en/offline` | the offline page (precached, noindex, no script but "Try again") | `no-cache` |
| `/cont/notificari`, `/en/cont/notificari` | the notifications page: per-purpose controls; signed in, the person's devices | `private, no-store`, noindex |
| `POST /pwa/push/*` | subscribe, status, unsubscribe, test, remove a device | `private, no-store`, same-origin only |
| `POST /__pwa/notify` | the signed hook (`x-psi-signature: sha256=<HMAC of raw body>`, ≤ 5 min old) | |

Head tags (`PwaHead`): manifest link, apple-touch-icon, `apple-mobile-web-app-*`, the VAPID
public key, the client. `theme-color` stays with `SeoHead` (never printed twice).

## 2. Decisions

- **One package, no words.** `@psi/pwa` knows the message *keys* (`PwaMessages`); each app passes
  its own Paraglide `m`, so every notification and label is in that brand's voice, ro/en.
  `messages/pwa/` is added through the inlang `pathPattern` array: the shared message files are
  untouched.
- **Service worker rules are a pure module** (`src/sw-rules.ts`), unit-tested and bundled as is.
  - Never touched (no `respondWith`): every non-GET, other origins, `text/event-stream`, and
    `/auth`, `/cont`, `/ghid`, `/programare`, `/pwa`, `/__pwa`, `/__cms`, `/_preview`, `/_a`,
    `/sw.js`, the manifests, `/healthz` (with or without `/en`; whole segments only, `/contact` is a page).
  - Pages: network first; a fresh copy is kept (max 40) unless `no-store`/`private`; offline →
    kept copy → offline page in the URL's locale. Every HTML page rendered for a signed-in person is
    sent `private, no-store` (`pwa.mount` adds it when the route set no `cache-control`), so no
    personal page is ever kept on the device.
  - `/assets/` with a content hash in the name: cache first. Other `/assets/` (app.css,
    datastar.js, icons): network first, the kept copy only offline (a deploy's CSS never lags).
  - A push always shows a notification (browsers revoke silent ones): one the worker cannot
    word shows only the site's name and leads home.
  - Caches are `psi-pwa-<site>-<kind>-<version>`; activation deletes the site's other versions.
- **Bundles as strings.** `scripts/build-bundles.ts` (esbuild) writes `src/bundles.generated.ts`;
  a test fails when it is stale. Nothing is read from disk at run time.
- **Icons** (`pnpm --filter @psi/pwa icons`, sharp 0.35.5): any + maskable at 192/512, Apple 180
  (opaque), badge 96 (white silhouette), flat finish, into `apps/*/public/assets/pwa/`. Psizone uses
  its emblem mask on gold; EQ-SYNC ("EQ."), Hemi-Sync ("HS") and the blog (a solid disc) are
  **placeholders**, like their `Logo` (brand book: real marks pending).
- **Install UX**: in the Compass tools only. "Install app" appears after `beforeinstallprompt`;
  on iPhone/iPad a collapsed "Add to Home Screen" note. No pop-ups, nothing on page load.

## 3. Push architecture — Web Push with VAPID, Novu later

`notify(event)` → recipients from the store → one encrypted message per browser (RFC 8291
aes128gcm, VAPID RFC 8292) through `PushTransport` (`webPushTransport`, the `web-push` package) →
the browser's push service → the subscriber's own site's worker renders the words.

**Why not Novu now.** The estate's Novu (3.19.0, `gitops/seb-pieces/novu`) has no Web Push/VAPID
provider. Its push providers are FCM, APNS, Expo, OneSignal, Pushpad, Pusher Beams and Push Webhook
(docs.novu.co, read 2026-11-12). FCM web push needs a Firebase project and sends through Google;
Pushpad/OneSignal are paid third parties holding our subscribers — both wrong for a clinic. SEB's
`docs/notificari/01-design.md` §6 also lists web push as "needs Firebase project".
**The Novu path, when wanted:** a Novu *Push Webhook* integration posting to a new
`/__pwa/novu` route (verify `x-novu-signature`, HMAC-SHA256 of the raw body), whose `target` device
tokens are our subscription ids → the same `PushTransport`. Novu then owns preferences, digests and
quiet hours; delivery and encryption stay here. Nothing else changes.

**The payload carries no sentence**: `{v, kind, locale, url, tag, brand?, headline?}`. The
receiving site's worker holds the words (from its messages) — so a blog-triggered push to a
Psizone subscriber speaks Psizone.

## 4. Privacy (a clinic)

- Opt-in per purpose, from a button press; the permission prompt follows that press, never a load.
- Booking pushes say only "Your appointment request was confirmed" / "…was cancelled" / "A reminder
  for tomorrow", and lead to `/cont`. No reference, time, practitioner or reason ever enters a payload
  (tested). Article pushes carry the public headline and link.
- Booking updates need an account; anonymous subscriptions hold article news only.
- Endpoints must be a browser push service (FCM, Mozilla, Apple, WNS): no SSRF.
- Status, unsubscribe and test require the endpoint **and** its auth secret (only that browser knows both).
- Subscriptions hang off `account(subject)` ON DELETE CASCADE: erasing an account erases its devices.

## 5. Hook points

- `pwa.notifier().notify(event)` in process; `POST /__pwa/notify` across processes (signed).
- Booking events address the account by **`accountHash`** (`accountHashOf(subject)`, what Convex
  already stores on signed-in requests), or `subject`, or a linked `reference`.
- `booking.confirmed` with `start` plans the day-before reminder; `booking.cancelled` drops it;
  `notifier.reminders` implements scheduling's `ReminderPort` (24 h lead only); a one-minute clock
  sends due reminders (optional `stillConfirmed` check at send time).
- Articles: the blog observes the CMS's signed webhook (`/__cms/revalidate`): after a 204 for
  `articles/publish` of an article that is now `published`, it notifies that brand's subscribers on
  every site, once per CMS id (claimed in the store).

**Needed from others (not done here):**
1. Scheduling/Convex: on confirm, cancel and decline, POST `/__pwa/notify`
   `{event: {kind, accountHash, start?}, sentAt}` signed with `PWA_NOTIFY_SECRET` (task S6), and wire
   `ReminderPort` to `notifier.reminders` (or send `start` with the confirm).
2. Accounts owner: a link from `/cont` to `/cont/notificari` (the Compass already links it).
3. Polaris: if staff ever manage subscriptions, a `pwa_push_subscription` type; today a person sees
   and removes only rows with their own `sub`.

## 6. Store

Postgres, the account database (`PWA_DATABASE_URL`, else `ACCOUNT_DATABASE_URL`): `pwa_subscription`,
`pwa_booking`, `pwa_reminder`, `pwa_claim`, created idempotently under an advisory lock, cascades
added when `account` exists. **Owner decision:** keep it in the account database (as built) or give
it its own. Locally without a database: `/.data/pwa/push.json` (mode 600, shared by the dev servers).

## 7. iOS and browser caveats

- iOS/iPadOS push works **only for an installed web app** (Home Screen), iOS **16.4+**, Safari's
  push service (`web.push.apple.com`); the panel says so. No `beforeinstallprompt` on iOS: the note
  explains Share → Add to Home Screen. Badges are ignored on iOS.
- Chrome revokes a subscription when a push arrives and no notification is shown; the worker always
  shows one for a known kind. Firefox and Safari need no Firebase.
- Lighthouse ≥ 12 has no PWA category; 11.7.1 was used (section 10). Lighthouse clears the origin's
  storage, including push subscriptions.

## 8. Secrets and gitops (prepared, NOT applied)

| OpenBao path | Properties | Env |
| --- | --- | --- |
| `secret/apps/pwa/vapid` | `public_key`, `private_key`, `subject` (`mailto:ops@psizone.ro`) | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| `secret/apps/pwa/notify` | `secret` (≥ 32 chars, `openssl rand -hex 32`) | `PWA_NOTIFY_SECRET` |

One estate pair for all four sites (a subscription made on any site can be sent by any site).
Generate with `npx web-push generate-vapid-keys --json` into OpenBao directly. Each site's
`gitops/services/<site>/base/externalsecret.yaml` gains the four `remoteRef`s
(`key: apps/pwa/vapid`, `key: apps/pwa/notify`); the store reuses `ACCOUNT_DATABASE_URL`.
**Deployment rule (owner, 2026-11-12):** these keys are not seeded yet, so they are **not** added to
the ExternalSecrets or `assert-secrets` in this change. Production behaviour:

- no push key at all → boots, install and offline work, no "Notify me" or notifications link,
  push API 503, one log line `[pwa:<site>] push notifications off: no VAPID keys configured`;
- a complete set (both VAPID keys + a database) → push on;
- a partial or malformed set → `PushConfigError` at boot (names keys, never values).

When seeded: add the ExternalSecret entries, then the `assert-secrets` checks, in one separate change.
VAPID rotation invalidates every subscription (people press "Notify me" again).

## 9. Local development

```sh
pnpm --filter @psi/pwa vapid      # /.data/pwa/vapid.json, mode 600, gitignored; prints the public key only
pnpm --filter @psi/pwa build      # re-bundle the worker and client after editing them
pnpm --filter @psi/pwa icons      # re-render every site's icons
cd packages/pwa && pnpm exec tsx --env-file=../../apps/psizone-web/.env scripts/notify.ts \
  --account-of <subject> booking.confirmed     # a real push through the dev store
```

Headless Chrome (including the chrome-devtools MCP one) denies notification permission and never
receives pushes. A real push needs a headed Chrome (Xvfb is fine) whose profile allows the origin;
a CDP `Browser.grantPermissions` override lasts only as long as that DevTools session.

## 10. Verification (2026-11-12)

- `@psi/pwa` vitest: 90 tests (manifest builder, every never-cached route, caching strategies,
  storable responses, cache cleanup, endpoint allowlist, privacy of booking payloads, reminders,
  API boundary, config off/on/partial, words, no-store for signed-in pages). tsc clean: the package (node, worker, client) and the
  four apps. biome: 0 errors on the PWA files.
- Lighthouse 11.7.1 PWA category: 1.0 on all four sites (installable manifest, maskable icon,
  themed omnibox, splash screen, viewport).
- Offline, with the server stopped: a visited page from cache, an unvisited one → the offline page.
- Real pushes received through FCM in Chrome 150: a test push, a booking confirmation addressed
  by account hash (signed in), and an article announced from a signed CMS publish webhook.
- `NODE_ENV=production` without push keys: all four 200, manifest and worker served, no push UI,
  subscribe 503, one log line; a partial set refuses to boot.

## 11. Live-blocked

1. VAPID pair and notify secret in OpenBao (section 8), then the ExternalSecret and assert-secrets change.
2. Scheduling's events (section 5.1) — until then no booking push fires in the estate.
3. The CMS must POST its webhook to the blog (`SITE_WEBHOOK_URLS`) in the cluster.
4. Real EQ-SYNC / Hemi-Sync / blog marks to replace the placeholder icons.
5. Owner decisions: the store's database (section 6); Novu as orchestrator later (section 3);
   whether signing out should unlink a browser's booking updates (today a browser that proves it
   holds the subscription keeps the link it got while signed in, so toggling article news signed out
   does not silently drop booking updates; "Stop" or removing the device ends it).
