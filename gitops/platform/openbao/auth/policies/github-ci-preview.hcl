# github-ci-preview — declared in gitops/platform/openbao/auth/policies/github-ci-preview.hcl.
# Reconciled by the openbao-auth-reconcile CronJob.
#
# A PULL REQUEST into dev building its preview image (rmx-brs.yml and rmx-sign.yml,
# job preview-build). The code that runs here is the pull request's own, so it gets
# exactly what that job reads and nothing else:
#   * the Harbor CI robot, because the preview image is PUSHED (harbor.recomex.eu/
#     recomex/<app>:<head sha>). This is the push robot of the shared project — the one
#     grant here a pull request should not need; a preview-only robot on its own
#     project removes it (owner call, PLATFORM-19);
#   * the build-time NEXT_PUBLIC_* values of the two apps with previews. Public by
#     design — they are baked into the browser bundle.
# Never the git push token, never another application path.
path "secret/data/platform/harbor/ci-robot" { capabilities=["read"] }
path "secret/data/apps/rmx-brs/build" { capabilities=["read"] }
path "secret/data/apps/rmx-sign/build" { capabilities=["read"] }
