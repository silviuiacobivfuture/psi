# admin — declared in gitops/platform/openbao/auth/policies/admin.hcl.
# Reconciled by the openbao-auth-reconcile CronJob: an edit made anywhere else is
# reverted on the next run and reported by doctor.sh as drift.
#
# Full rights. Repeats reader's/developer's secret paths ON PURPOSE: per request
# OpenBao takes the MOST SPECIFIC matching path across all of a token's policies and
# merges capabilities only between identical patterns, so without the repeats an admin
# who is also a reader is read-only on every secret (measured 2026-10-18).
path "*" { capabilities = ["create","read","update","delete","list","sudo"] }
path "secret/data/*" { capabilities = ["create","read","update","patch","delete","list"] }
path "secret/metadata/*" { capabilities = ["create","read","update","delete","list"] }
path "secret/data/apps/*" { capabilities = ["create","read","update","patch","delete","list"] }
path "secret/metadata/apps/*" { capabilities = ["create","read","update","delete","list"] }
# Longer than reader's and developer's `apps/n8n*`, and it must be: a deny merges with an identical
# pattern and wins, so repeating that pattern here would lock out any admin who is also in
# platform-members, whose identity group brings reader.
path "secret/data/apps/n8n/*" { capabilities = ["create","read","update","patch","delete","list"] }
path "secret/data/apps/n8n-*" { capabilities = ["create","read","update","patch","delete","list"] }
path "secret/metadata/apps/n8n/*" { capabilities = ["create","read","update","delete","list"] }
path "secret/metadata/apps/n8n-*" { capabilities = ["create","read","update","delete","list"] }
