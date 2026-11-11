# authentik-n8n-sso-token — declared in gitops/platform/openbao/auth/policies/authentik-n8n-sso-token.hcl.
# Reconciled by the openbao-auth-reconcile CronJob: an edit made anywhere else is
# reverted on the next run and reported by doctor.sh as drift.
#
# The n8n-sso reconcile's read-only Authentik token slot (apps/n8n-sso).
path "secret/data/platform/authentik/n8n-sso-api-token" { capabilities = ["read","create","update"] }
