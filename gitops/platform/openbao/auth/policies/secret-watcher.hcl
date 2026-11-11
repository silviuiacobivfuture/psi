# secret-watcher — declared in gitops/platform/openbao/auth/policies/secret-watcher.hcl.
# Reconciled by the openbao-auth-reconcile CronJob: an edit made anywhere else is
# reverted on the next run and reported by doctor.sh as drift.
#
# Versions only (metadata) plus its own state and the PAT it dispatches CI with.
# Must never read a secret VALUE (infrastructure/hetzner/CLAUDE.md).
path "secret/metadata/*" { capabilities = ["read","list"] }
path "secret/data/platform/automation/watcher-state" { capabilities = ["read","create","update","patch"] }
path "secret/data/platform/github/token" { capabilities = ["read"] }
