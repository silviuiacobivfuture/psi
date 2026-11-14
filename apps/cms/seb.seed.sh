# shellcheck shell=bash
# cms's secret seeding procedure, run by SEB's engine (lib-seed-apps.sh) from seed-secrets.sh;
# it may write only the paths apps/cms/seb.app.yaml declares in secrets[]. Sourced twice:
# SEB_SEED_PHASE=load (definitions only), then =run.
#
# It WRITES NOTHING: cms's paths were written once by hand (estate/APP-SECRETS.md) and nothing
# here regenerates them. The engine refuses a declaration without its procedure, so this one says
# which declared path is missing, by name, and leaves the store as it is.
[ "$SEB_SEED_PHASE" = run ] || return 0

for _cms_p in secret/apps/cms/db secret/apps/cms/env secret/apps/cms/oidc; do
  if path_exists "$_cms_p"; then skip "$_cms_p"
  else warn "$_cms_p is absent — written by hand (estate/APP-SECRETS.md); cms does not start without it"; fi
done
unset _cms_p
