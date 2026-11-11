# packages/

PSI's own shared libraries: code two of this estate's apps use. One folder each,
`@psi/<name>`.

The PLATFORM's libraries are not here and are never copied here: SEB ships them built, in the
bundle `estate/platform.lock` pins. After `pnpm install` they are in `.seb-bundle/libs/npm/*.tgz`
(`.seb-bundle/bundle.json` lists them); an app depends on one by path:

```json
"dependencies": { "<package name>": "file:../../.seb-bundle/libs/npm/<file>.tgz" }
```

The lock records each tarball's integrity, so a bundle upgrade shows up as a lock change. A
library the bundle does not carry yet is asked of SEB (its `tools/bundle/libs.json`), never forked
here.
