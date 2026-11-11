# authentik-autorizare-token — declared in gitops/platform/openbao/auth/policies/authentik-autorizare-token.hcl.
# Reconciled by the openbao-auth-reconcile CronJob: an edit made anywhere else is
# reverted on the next run and reported by doctor.sh as drift.
#
# Polaris's dedicated Authentik token slot (doc 18 step 2), written by its reconcile.
path "secret/data/platform/authentik/autorizare-api-token" { capabilities = ["read","create","update"] }
