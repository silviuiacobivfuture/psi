# openbao-auth-reconcile — declared in gitops/platform/openbao/auth/policies/openbao-auth-reconcile.hcl.
# Reconciled by the openbao-auth-reconcile CronJob: an edit made anywhere else is
# reverted on the next run and reported by doctor.sh as drift.
#
# The reconciler's own token: a 10-minute login of ServiceAccount
# openbao/openbao-auth-reconcile, never stored anywhere. It can rewrite policies,
# so it is root-EQUIVALENT for authorization — that is the job, and why it is a
# short-lived exchange of a projected token instead of a token at rest. What it
# CANNOT do: read or write any secret except the OIDC client credentials it
# re-asserts, enable or disable an auth method (an undeclared method is reported,
# never removed — break-glass, gitops/platform/authentik/CLAUDE.md rule 4).
path "sys/auth" { capabilities = ["read"] }
path "sys/policies/acl" { capabilities = ["list"] }
path "sys/policies/acl/*" { capabilities = ["create","read","update","delete","list"] }
path "auth/oidc/config" { capabilities = ["create","read","update"] }
path "auth/github-actions/config" { capabilities = ["create","read","update"] }
path "auth/+/role" { capabilities = ["list"] }
path "auth/+/role/*" { capabilities = ["create","read","update","delete","list"] }
path "auth/token/roles" { capabilities = ["list"] }
path "auth/token/roles/*" { capabilities = ["read","delete","list"] }
path "identity/group" { capabilities = ["create","update"] }
path "identity/group/*" { capabilities = ["create","read","update","delete","list"] }
path "identity/group-alias" { capabilities = ["create","update"] }
path "identity/group-alias/*" { capabilities = ["create","read","update","delete","list"] }
path "identity/entity/id" { capabilities = ["list"] }
path "identity/entity/id/*" { capabilities = ["read","update","list"] }
path "secret/data/platform/authentik/openbao-oidc" { capabilities = ["read"] }
