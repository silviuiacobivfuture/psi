# authentik-plane-sso-token — declared in gitops/platform/openbao/auth/policies/authentik-plane-sso-token.hcl.
# Reconciled by the openbao-auth-reconcile CronJob: an edit made anywhere else is
# reverted on the next run and reported by doctor.sh as drift.
#
# The Plane SSO reconcile's read-only Authentik token slot (apps/plane-sso).
path "secret/data/platform/authentik/plane-sso-api-token" { capabilities = ["read","create","update"] }
