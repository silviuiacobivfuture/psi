# psi's authorization model: the platform's two modules first, exactly as SEB's
# authz/platform.fga.mod lists them (vendored beside psi's own, never edited here),
# then one module per psi application, generated from apps/<app>/authz.manifest.json.
#   Regenerate: from a SEB checkout, python3 authz/tools/generate.py --estate <psi>/estate/authz.json
#   Test:       fga model test --tests 'estate/authz/tests/*.fga.yaml'
schema: '1.2'
contents:
  - modules/core.fga
  - modules/autorizare.fga
  - modules/psizone.fga
  - modules/eqsync.fga
  - modules/hemisync.fga
  - modules/blog.fga
  - modules/cms.fga
  - modules/sched.fga
