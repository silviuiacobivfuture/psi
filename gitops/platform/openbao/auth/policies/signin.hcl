# signin — declared in gitops/platform/openbao/auth/policies/signin.hcl.
# Reconciled by the openbao-auth-reconcile CronJob: an edit made anywhere else is
# reverted on the next run and reported by doctor.sh as drift.
#
# A login and NOTHING else: no secret path. The OIDC default role's only policy, and
# the tools robot's (identitate gate 9). doctor fails if it ever names a secret path.
path "auth/token/lookup-self" { capabilities = ["read"] }
path "auth/token/renew-self" { capabilities = ["update"] }
path "auth/token/revoke-self" { capabilities = ["update"] }
path "sys/capabilities-self" { capabilities = ["update"] }
path "sys/internal/ui/resultant-acl" { capabilities = ["read"] }
