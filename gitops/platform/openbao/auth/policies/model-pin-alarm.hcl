# model-pin-alarm — declared here, reconciled by openbao-auth-reconcile.
# gitops/platform/openbao/model-pin-alarm.yaml says why each path.
#
# NO secret value: the pin paths (secret/apps/<app>/autorizare) also hold machine
# credentials and KV v2 grants per path, so the alarm reads only their METADATA
# (current_version) and the non-secret pin record repin-model.sh writes.
path "secret/metadata/apps/+/autorizare" { capabilities = ["read"] }
path "secret/data/platform/automation/model-pins" { capabilities = ["read"] }
path "secret/data/platform/automation/model-pin-alarm" { capabilities = ["read","create","update","patch"] }
