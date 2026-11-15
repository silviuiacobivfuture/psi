# shellcheck shell=bash
# scheduling-api's secret seeding procedure, run by SEB's engine (lib-seed-apps.sh) from
# seed-secrets.sh; it may write only the paths apps/scheduling-api/seb.app.yaml declares in
# secrets[]. Sourced twice: SEB_SEED_PHASE=load (definitions only), then =run.
#
# It WRITES NOTHING: every key scheduling-api declares is a literal (keys, hashes, the pinned
# model, mail), written by hand, and nothing here regenerates one. The engine refuses a
# declaration without its procedure, so this one says which declared key is missing, by name,
# and leaves the store as it is.
[ "$SEB_SEED_PHASE" = run ] || return 0

for _sched_f in CLINIC_MASTER_KEY OIDC_ISSUERS OPENFGA_MODEL_ID SERVICE_KEY_HASH_PSIZONE_WEB \
    SERVICE_KEY_HASH_HEMISYNC_WEB SERVICE_KEY_HASH_GUIDE_PSIZONE SERVICE_KEY_HASH_GUIDE_HEMISYNC SERVICE_KEY_HASH_CMS; do
  has_field "secret/apps/scheduling-api/env" "$_sched_f" \
    || warn "secret/apps/scheduling-api/env $_sched_f is absent or empty — scheduling-api does not start without it"
done
has_field "secret/apps/scheduling-api/mail" MAIL_API_KEY \
  || warn "secret/apps/scheduling-api/mail MAIL_API_KEY is absent or empty — scheduling-api does not start without it"
has_field "secret/apps/notify/reminder-links" REMINDER_LINK_SECRET \
  || warn "secret/apps/notify/reminder-links REMINDER_LINK_SECRET is absent or empty — scheduling-api does not start without it"
unset _sched_f
