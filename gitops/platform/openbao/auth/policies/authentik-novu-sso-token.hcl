# authentik-novu-sso-token — declared in gitops/platform/openbao/auth/policies/authentik-novu-sso-token.hcl.
# Reconciled by the openbao-auth-reconcile CronJob: an edit made anywhere else is
# reverted on the next run and reported by doctor.sh as drift.
#
# novu-sso's read-only Authentik token slot (apps/novu-sso).
path "secret/data/platform/authentik/novu-sso-api-token" { capabilities = ["read","create","update"] }
