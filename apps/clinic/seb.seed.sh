# shellcheck shell=bash
# clinic's secret seeding procedure, run by SEB's engine (lib-seed-apps.sh) from seed-secrets.sh;
# it may write only the paths apps/clinic/seb.app.yaml declares in secrets[]. Sourced twice:
# SEB_SEED_PHASE=load (definitions only), then =run.
#
# It WRITES NOTHING: clinic's paths were written when the clinic was set up and nothing here
# regenerates them (a new OIDC client or session secret would sign everybody out). The engine
# refuses a declaration without its procedure, so this one says which declared path or key is
# missing, by name, and leaves the store as it is.
[ "$SEB_SEED_PHASE" = run ] || return 0

for _clinic_f in client_id client_secret; do
  has_field "secret/apps/clinic/oidc" "$_clinic_f" \
    || warn "secret/apps/clinic/oidc $_clinic_f is absent or empty — clinic and Authentik's clinic client do not start without it"
done
for _clinic_f in SESSION_SECRET OPENFGA_TOKEN; do
  has_field "secret/apps/clinic/env" "$_clinic_f" \
    || warn "secret/apps/clinic/env $_clinic_f is absent or empty — clinic does not start without it"
done
unset _clinic_f
