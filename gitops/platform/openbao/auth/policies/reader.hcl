# reader — declared in gitops/platform/openbao/auth/policies/reader.hcl.
# Reconciled by the openbao-auth-reconcile CronJob: an edit made anywhere else is
# reverted on the next run and reported by doctor.sh as drift.
#
# APP secrets only (2026-10-22). Platform secrets are each a way back to full admin.
# Held through the identity groups that carry it and the bound `reader` OIDC role;
# never by default — until 2026-10-29 every directory account got it (RUNBOOK).
path "secret/data/apps/*" { capabilities = ["read"] }
# n8n holds what takes it over: `app.owner_password_hash`, which n8n applies at its next start, the
# `sso.api_key` and the `encryption.key`. Only eso, admin and root reach them (RUNBOOK 2026-11-05).
path "secret/data/apps/n8n*" { capabilities = ["deny"] }
path "secret/metadata/apps/*" { capabilities = ["read","list"] }
path "secret/metadata/" { capabilities = ["list"] }
path "sys/mounts" { capabilities = ["read"] }
