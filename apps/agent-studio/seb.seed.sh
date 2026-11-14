# shellcheck shell=bash
# agent-studio's secret seeding procedure, run by SEB's engine (lib-seed-apps.sh) from seed-secrets.sh;
# it may write only the paths apps/agent-studio/seb.app.yaml declares in secrets[]. Sourced twice:
# SEB_SEED_PHASE=load (definitions only), then =run.
#
# It WRITES NOTHING: agent-studio's paths were written once by hand (estate/APP-SECRETS.md) and nothing
# here regenerates them. The engine refuses a declaration without its procedure, so this one says
# which declared path is missing, by name, and leaves the store as it is.
[ "$SEB_SEED_PHASE" = run ] || return 0

for _agent_studio_p in secret/apps/agent-studio/env; do
  if path_exists "$_agent_studio_p"; then skip "$_agent_studio_p"
  else warn "$_agent_studio_p is absent — written by hand (estate/APP-SECRETS.md); agent-studio does not start without it"; fi
done
unset _agent_studio_p
