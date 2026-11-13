# psi's authorization model: psi's own modules only, one per psi application, generated from
# apps/<app>/authz.manifest.json. The platform's two (core, autorizare) are NOT listed or copied here:
# they are the installed bundle's (.seb-bundle/authz, the config's platform_dir) and are prepended
# wherever the model is composed (SEB authz/tools/gen/estate.py, estate mode).
#   Regenerate: AUTHZ_ESTATE_ROOT=$PWD python3 .seb-bundle/authz/tools/generate.py --estate estate/authz.json
#   Test:       AUTHZ_ESTATE_ROOT=$PWD python3 .seb-bundle/authz/tools/compose-root.py --estate estate/authz.json --out <dir>
#               fga model test --tests '<dir>/tests/*.fga.yaml'
schema: '1.2'
contents:
  - modules/psizone.fga
  - modules/eqsync.fga
  - modules/hemisync.fga
  - modules/blog.fga
  - modules/cms.fga
  - modules/agent.fga
