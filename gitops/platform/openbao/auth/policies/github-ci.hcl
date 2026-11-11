# github-ci — declared in gitops/platform/openbao/auth/policies/github-ci.hcl.
# Reconciled by the openbao-auth-reconcile CronJob: an edit made anywhere else is
# reverted on the next run and reported by doctor.sh as drift.
#
# CI runs whatever code is on a branch — the least trusted place anything executes —
# so it reads ONLY what pipelines need, never writes: harbor ci-robot, the github token,
# the Neon API key (changelog preview DBs), apps/*, the test-reports ingest bearer, and
# the Talk paths. platform/talk/webhook is a SEND-ONLY bearer for the translator; bot and
# channels remain only because scripts/talk-notify.sh still signs directly — drop both
# once nothing in CI signs its own messages (a leaked bot key forges any alert).
#
# GitHub Actions (jwt mount github-actions), role github-ci: the DEPLOY tier. Since
# 2026-11-11 that role is bound to refs/heads/dev and refs/heads/prod (push, dispatch,
# schedule); a pull request or any other branch logs in as github-ci-preview or
# github-ci-gate, whose policies sit beside this one. Read-only.
path "secret/data/platform/harbor/ci-robot" { capabilities=["read"] }
path "secret/data/platform/github/token" { capabilities=["read"] }
path "secret/data/platform/neon/api" { capabilities=["read"] }
path "secret/data/platform/talk/webhook" { capabilities=["read"] }
path "secret/data/platform/talk/bot" { capabilities=["read"] }
path "secret/data/platform/talk/channels" { capabilities=["read"] }
path "secret/data/platform/test-reports/ingest" { capabilities=["read"] }
# The Nx remote cache bearer (CI kit, SEB 1.7) — replaces the GitHub secret NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN.
path "secret/data/platform/nx-cache/token" { capabilities=["read"] }
path "secret/data/apps/*" { capabilities=["read"] }
# n8n holds what takes it over: `app.owner_password_hash`, which n8n applies at its next start, the
# `sso.api_key` and the `encryption.key`. Only eso, admin and root reach them (RUNBOOK 2026-11-05).
path "secret/data/apps/n8n*" { capabilities=["deny"] }
