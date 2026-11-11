#!/usr/bin/env node
// After `pnpm install`: the locked SEB bundle is in .seb-bundle/ (the .pnpmfile.cjs hook already
// installed it before resolution; this re-check is free when the stamp matches and catches a
// checkout whose hook was skipped, e.g. `pnpm install --ignore-pnpmfile`).
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { install } from "../estate/seb-bundle-install.mjs";

const repo = join(fileURLToPath(import.meta.url), "../..");
const r = await install(repo);
(r.code === 0 ? process.stdout : process.stderr).write(`${r.message}\n`);
process.exit(r.code);
