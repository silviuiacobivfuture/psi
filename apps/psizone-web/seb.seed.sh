# shellcheck shell=bash
# psizone-web's secret seeding procedure, run by SEB's engine (lib-seed-apps.sh) from seed-secrets.sh;
# it may write only the paths apps/psizone-web/seb.app.yaml declares in secrets[]. Sourced twice:
# SEB_SEED_PHASE=load (definitions only), then =run.
#
#   apps/psizone-web/mail  the team's mail for callback requests, OPTIONAL: created as an EMPTY SLOT
#                    (all five keys "") only where the path is absent; an existing path gets any
#                    missing key added empty and keeps every value it holds (ensure_slot only adds).
#                    An absent path left the psizone-web-mail ExternalSecret SecretSyncedError and the
#                    Argo application Degraded (2026-11-13); empty, the site reads "not configured".
#   apps/psizone-web/env   OPENROUTER_API_KEY and CMS_API_KEY are the owner's (literal): never written
#                    here; an absent one is reported (OPENROUTER_API_KEY also stops the pod: assert-secrets).
[ "$SEB_SEED_PHASE" = run ] || return 0

_psizone_web_mail="secret/apps/psizone-web/mail"
if path_exists "$_psizone_web_mail"; then
  ensure_slot "$_psizone_web_mail" SMTP_HOST SMTP_USER SMTP_PASSWORD MAIL_FROM BOOKING_NOTIFY_TO
else
  put_kv "$_psizone_web_mail" SMTP_HOST= SMTP_USER= SMTP_PASSWORD= MAIL_FROM= BOOKING_NOTIFY_TO=
  ok "$_psizone_web_mail (empty slot: the site's mail is off until the owner fills it — estate/APP-SECRETS.md)"
fi
for _f in OPENROUTER_API_KEY CMS_API_KEY; do
  has_field "secret/apps/psizone-web/env" "$_f" \
    || warn "secret/apps/psizone-web/env $_f is absent or empty — the owner supplies it (estate/APP-SECRETS.md); never written here"
done
unset _psizone_web_mail _f
