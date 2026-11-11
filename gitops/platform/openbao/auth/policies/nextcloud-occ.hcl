# nextcloud-occ — declared in gitops/platform/openbao/auth/policies/nextcloud-occ.hcl.
# Reconciled by the openbao-auth-reconcile CronJob: an edit made anywhere else is
# reverted on the next run and reported by doctor.sh as drift.
#
# The occ reconcile mirrors the Talk room-token map here for callers outside the cluster.
# Write on exactly that path; no patch (the job always writes the complete map).
path "secret/data/platform/talk/channels" { capabilities = ["read","create","update"] }
