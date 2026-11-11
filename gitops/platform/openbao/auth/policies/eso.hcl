# eso — declared in gitops/platform/openbao/auth/policies/eso.hcl.
# Reconciled by the openbao-auth-reconcile CronJob: an edit made anywhere else is
# reverted on the next run and reported by doctor.sh as drift.
#
# External Secrets Operator: reads every secret to deliver it. Bootstrap-protected.
path "secret/data/*" { capabilities = ["read"] }
path "secret/metadata/*" { capabilities = ["read","list"] }
