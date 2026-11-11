# estate/

What makes this repository THIS estate, and how it consumes SEB.

| File                             | What                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `identity.yaml`                  | the estate's settings (domain, registry, git, platform apps). Read only through SEB's `tools/identity/load.mjs`; never a secret in it |
| `authz.json`                     | inputs to SEB's permissions generator: the platform's manifest plus every `apps/*/authz.manifest.json`                                |
| `platform.lock`                  | the SEB release this estate runs, and the digest of its bundle in the estate's Harbor                                                 |
| `seb-pieces.<env>`               | which SEB pieces each environment runs                                                                                                |
| `seb-components/`                | the estate's own components for the pieces that read one                                                                              |
| `seb-bundle-install.mjs`, `lib/` | installs the locked bundle into `.seb-bundle/` (run by `pnpm install` and by CI)                                                      |

After install, `.seb-bundle/` holds SEB's tools (`tools/`, `doctor/`, `schema/`), its built
libraries (`libs/npm/*.tgz`, `libs/go/…`) and its CI kit (`ci/actions/`), checked against the
sums `bundle.json` records.
