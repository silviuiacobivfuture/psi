# Identity, SSO & Onboarding — northwind platform (Authentik)

How login, roles, and permissions work across the platform, and how to onboard
employees. One identity, one login, every app trusts it.

---

## 1. The mental model

```
Employee ──login (GitHub/Google/password)──► AUTHENTIK ──signed OIDC token──► Argo / Harbor / OpenBao / Headlamp
            UPSTREAM SOURCE (federation)        (IdP / SSO)     token says: user + groups[]      (apps map groups → roles)
```

Two layers — never conflate them:

| Layer | What it does | Where it lives |
|-------|--------------|----------------|
| **Source (federation)** | *How* you prove identity to Authentik ("Sign in with GitHub/Google", or username+password). | Authentik **Sources** |
| **IdP (Authentik)** | Stores users + **groups**, authenticates, issues signed tokens to apps. | Authentik core |
| **App RBAC** | Maps a **group** → a role (`platform-admins` → admin). | Each app's config (e.g. Argo `rbac-cm.yaml`) |

**Authentik is the SSO system.** Apps never see passwords — they redirect to
Authentik, Authentik vouches via a signed OIDC token carrying the user's email +
group list. Each app turns groups into roles.

## 2. What "GitHub federation" is (and is NOT)

GitHub federation = Authentik delegates the **password check** to GitHub
("Sign in with GitHub"). GitHub answers "yes, this is user X"; Authentik then
**matches that to its own user by email** (`user_matching_mode: email_link`) and
issues tokens.

- GitHub is **only the doorbell**. It carries **no roles, no permissions**.
- Roles live 100% in **Authentik groups**. Swapping GitHub for Google or
  passwords changes nothing about roles.
- Requirement: the GitHub account's email must match an existing Authentik
  user's email, else enrollment kicks in.

## 3. Roles & permissions — single source of truth

**Authentik groups are the only thing that grants access.** Nothing else.

| Group | Meaning | Example mapping |
|-------|---------|-----------------|
| `platform-admins` | Full admin everywhere | Argo `role:admin`, Harbor admin, OpenBao admin policy |
| `platform-members` | Read-only / standard | Argo `role:readonly` |

- Add a person to a group in Authentik → they get that role in **every** app at
  once. Remove → access gone everywhere. That is the entire point of SSO.
- App mappings (examples in this repo):
  - Argo CD: `gitops/platform/argocd/rbac-cm.yaml` →
    `g, platform-admins, role:admin`
  - The `groups` claim is emitted by the `northwind-groups-scope` scope mapping in
    `blueprints-providers.yaml` (attached to every OIDC provider). Without it,
    tokens carry no groups and RBAC can't match.

Create finer groups as needed (`harbor-pushers`, `signers`, `read-only-audit`)
and map them per-app — but keep the rule: **roles = Authentik groups, nothing else.**

## 4. The GitHub OAuth app — callback URL (the "Invalid Redirect" fix)

GitHub redirects back to Authentik's **public** host (GitHub's servers can't
reach the tailnet host). In the GitHub OAuth app
(Settings → Developer settings → OAuth Apps):

**Authorization callback URL:**
```
https://auth.northwind.example/source/oauth/callback/github/
```
(`github` = the Authentik source slug.) Client id/secret go into OpenBao
`secret/platform/authentik/github-oauth` — never in git.

## 5. Logging in with your domain email, everywhere

Pick **one canonical domain** for identities (`@northwind.example` or `@ivfuture.ro`).
That email is the Authentik username/email → it's how every app identifies you.

Two onboarding options:

### Option A — Authentik-native users (simplest, full control)
1. Create the employee in Authentik with their **domain email** + password,
   enforce MFA.
2. Add them to a group (`platform-admins` for devs/ops, `platform-members`
   for the rest).
3. They log in everywhere with that one domain email. No GitHub/Google needed.

### Option B — Federate Google Workspace (best UX if mail is on Google)
The Google source is now **wired as-code** (blueprints-sources.yaml +
authentik-google-oauth ESO), INERT until you supply creds — exactly like GitHub.
To ACTIVATE (GitHub stays enabled too — both work):
1. Google Cloud Console → APIs & Services → Credentials → **OAuth client ID** → Web
   application. Authorized redirect URI:
   `https://auth.northwind.example/source/oauth/callback/google/`
2. Store the creds: `bao kv put secret/platform/authentik/google-oauth client_id=<id> client_secret=<secret>`
   and set `TF_VAR`/env so `AUTHENTIK_SOURCES__GOOGLE__KEY/__SECRET` are populated.
3. The blueprint condition gate then materialises the source automatically. Employees
   click "Sign in with Google" with their existing `@domain` mail — no new password.
4. Roles unchanged: assign **groups** in Authentik (or a `bundle-*`). Matched to
   existing users by email; new users self-enrol → `pending`.

**Recommendation:** if company mail is Google Workspace → **Option B** (zero new
passwords, best Mac experience). Otherwise → **Option A**.

> Either way roles are pure Authentik groups. The source is just the doorbell.

## 6. "Logged in on their Mac = access to everything" — the realistic target

SSO is **one login per browser session**, then seamless across all apps via the
Authentik cookie (that's the "single" in single-sign-on). It is **not** auto-login
just because it's their Mac — that requires device-certificate SSO (out of scope
for now, overkill).

Also note the **network gate**: every dashboard is **tailnet-only**. An employee
must be on **Tailscale** (joined the northwind tailnet, ACL grants `tag:k8s:443`)
*before* SSO even applies. See the Tailscale section in the infra runbook.

Realistic, achievable target: **one Authentik login → access to every dashboard
their group permits, for the session.**

## 7. Onboard a new employee — checklist

1. **Tailscale**: invite `name@domain`; they install the client and **switch to
   the northwind tailnet** on their Mac (a device joins ONE tailnet at a time).
   Ensure the ACL grants their user/group `tag:k8s:443`.
2. **Authentik identity**: create the user (Option A) or let Google federation
   enroll them (Option B), with their **domain email**.
3. **Group**: add to `platform-admins` (devs/ops) or `platform-members` (rest).
4. Done — they log into any dashboard via "Log in via Authentik" and get the
   role their group maps to, everywhere.

To offboard: remove from groups (kills app access) + Tailscale (kills network).

## 8. Current state (as configured)

- **Sources**: GitHub (federation, enabled), authentik Built-in (password).
- **Groups**: `platform-admins` (1), `platform-members` (0), `authentik Admins`.
- **OIDC providers** (all carry `northwind-groups-scope`, `signing_key`,
  `grant_types=[authorization_code, refresh_token]`): argocd, harbor, headlamp,
  openbao — defined in `blueprints-providers.yaml`.
- **Public IdP host**: `auth.northwind.example` (LE cert) — the OIDC issuer +
  GitHub callback host. Apps stay tailnet-only; only the IdP is public.
