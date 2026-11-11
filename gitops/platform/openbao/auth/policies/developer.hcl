# developer — declared in gitops/platform/openbao/auth/policies/developer.hcl.
# Reconciled by the openbao-auth-reconcile CronJob: an edit made anywhere else is
# reverted on the next run and reported by doctor.sh as drift.
#
# Reader plus write on APP secrets only. No metadata delete: that destroys every
# version of a secret, unrecoverably.
path "secret/data/apps/*" { capabilities = ["create","read","update","patch","delete","list"] }
path "secret/metadata/apps/*" { capabilities = ["read","update","list"] }
# n8n holds what takes it over: `app.owner_password_hash`, which n8n applies at its next start, the
# `sso.api_key` and the `encryption.key`. Only eso, admin and root reach them (RUNBOOK 2026-11-05).
path "secret/data/apps/n8n*" { capabilities = ["deny"] }
# Metadata too: `update` there sets delete_version_after, which would delete the encryption key.
path "secret/metadata/apps/n8n*" { capabilities = ["read","list"] }
