# psi's authorization model: psi's own modules, one per psi application, and the shared invoicing
# application's (Mu: .seb-bundle/apps/invoice-svc) and the shared flows application's (Rho:
# .seb-bundle/apps/flows), each generated from
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
  - modules/sched.fga
  - modules/agent.fga
  - modules/invoice.fga
  - modules/flow.fga
