# authentik-invoice-token — declared in gitops/platform/openbao/auth/policies/authentik-invoice-token.hcl.
# Reconciled by the openbao-auth-reconcile CronJob: an edit made anywhere else is
# reverted on the next run and reported by doctor.sh as drift.
#
# The invoicing service's dedicated, narrowly-permissioned Authentik token slot (@rule MACH-1), written
# by its token-reconcile CronJob. Never the service's own .../app path.
path "secret/data/platform/authentik/invoice-api-token" { capabilities = ["read","create","update"] }
