# github-ci-gate — declared in gitops/platform/openbao/auth/policies/github-ci-gate.hcl.
# Reconciled by the openbao-auth-reconcile CronJob.
#
# ANY run of this repository: a pull request, a scratch branch, a test job, a
# notification. So nothing here publishes, deploys or opens an application:
#   * platform/harbor/pull      — the pull-only robot (the cluster's own image-pull
#                                 credential): test jobs pull pinned images and build caches;
#   * platform/talk/webhook     — the SEND-ONLY Talk bearer (notify-talk);
#   * platform/test-reports/ingest, apps/reportportal/ci — the write-only bearers a
#                                 test run reports through;
#   * platform/nx-cache/token   — the Nx remote cache bearer (in-cluster only, no
#                                 ingress). It reads AND writes the cache: the same
#                                 reach the GitHub secret it replaces had, since every
#                                 non-fork pull request already received that secret.
path "secret/data/platform/harbor/pull" { capabilities=["read"] }
path "secret/data/platform/talk/webhook" { capabilities=["read"] }
path "secret/data/platform/test-reports/ingest" { capabilities=["read"] }
path "secret/data/apps/reportportal/ci" { capabilities=["read"] }
path "secret/data/platform/nx-cache/token" { capabilities=["read"] }
