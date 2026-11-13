# authentik-stalwart-admins-token — declared in gitops/platform/openbao/auth/policies/authentik-stalwart-admins-token.hcl.
# Reconciled by the openbao-auth-reconcile CronJob: an edit made anywhere else is
# reverted on the next run and reported by doctor.sh as drift.
#
# The mail server's administrators reconcile's read-only Authentik token slot (pieces/stalwart).
path "secret/data/platform/authentik/stalwart-admins-api-token" { capabilities = ["read","create","update"] }
