# authentik-plunk-sso-token — declared in gitops/platform/openbao/auth/policies/authentik-plunk-sso-token.hcl.
# Reconciled by the openbao-auth-reconcile CronJob: an edit made anywhere else is
# reverted on the next run and reported by doctor.sh as drift.
#
# plunk-sso's read-only Authentik token slot (apps/plunk-sso).
path "secret/data/platform/authentik/plunk-sso-api-token" { capabilities = ["read","create","update"] }
