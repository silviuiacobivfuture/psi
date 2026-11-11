# openbao-auth-audit — declared in gitops/platform/openbao/auth/policies/openbao-auth-audit.hcl.
# Reconciled by the openbao-auth-reconcile CronJob: an edit made anywhere else is
# reverted on the next run and reported by doctor.sh as drift.
#
# doctor.sh's read-only view of the auth configuration: a 10-minute login of
# ServiceAccount openbao/openbao-auth-audit (no Kubernetes RBAC). Reads and lists
# only — no write, no secret path at all. The doctor compares, it never holds root.
path "sys/auth" { capabilities = ["read"] }
path "sys/policies/acl" { capabilities = ["list"] }
path "sys/policies/acl/*" { capabilities = ["read","list"] }
path "auth/oidc/config" { capabilities = ["read"] }
path "auth/github-actions/config" { capabilities = ["read"] }
path "auth/+/role" { capabilities = ["list"] }
path "auth/+/role/*" { capabilities = ["read","list"] }
path "auth/token/roles" { capabilities = ["list"] }
path "auth/token/roles/*" { capabilities = ["read","list"] }
path "identity/group/*" { capabilities = ["read","list"] }
path "identity/group-alias/*" { capabilities = ["read","list"] }
path "identity/entity/id" { capabilities = ["list"] }
path "identity/entity/id/*" { capabilities = ["read","list"] }
