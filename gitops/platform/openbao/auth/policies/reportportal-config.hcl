# reportportal-config — declared in gitops/platform/openbao/auth/policies/reportportal-config.hcl.
# Reconciled by the openbao-auth-reconcile CronJob: an edit made anywhere else is
# reverted on the next run and reported by doctor.sh as drift.
#
# ReportPortal stores API keys hashed, so the reconcile writes a freshly minted CI key
# back here. Read is needed to MERGE (a KV v2 write replaces the whole map); no patch.
path "secret/data/apps/reportportal/ci" { capabilities = ["read","create","update"] }
