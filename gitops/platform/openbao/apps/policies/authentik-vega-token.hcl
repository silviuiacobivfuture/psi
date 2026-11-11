# authentik-vega-token — declared in gitops/platform/openbao/auth/policies/authentik-vega-token.hcl.
# Reconciled by the openbao-auth-reconcile CronJob: an edit made anywhere else is
# reverted on the next run and reported by doctor.sh as drift.
#
# Vega's read-only Authentik token slot, written by its reconcile.
path "secret/data/platform/authentik/vega-api-token" { capabilities = ["read","create","update"] }
