#!/usr/bin/env node
// After `pnpm install`: the locked SEB bundle is in .seb-bundle/ (the .pnpmfile.cjs hook already
// installed it before resolution; this re-check is free when the stamp matches and catches a
// checkout whose hook was skipped, e.g. `pnpm install --ignore-pnpmfile`).
// An image build context without the installer carries the bundle it was given (the same rule
// as .pnpmfile.cjs): nothing to check there.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(fileURLToPath(import.meta.url), "../..");
const installer = join(repo, "estate", "seb-bundle-install.mjs");
if (!existsSync(installer)) process.exit(0);
const { install } = await import(installer);
const r = await install(repo);
(r.code === 0 ? process.stdout : process.stderr).write(`${r.message}\n`);
process.exit(r.code);
