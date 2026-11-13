import { writeFileSync } from "node:fs";
import { buildManifest } from "../src/authz/manifest";

/** Writes authz.manifest.json from the catalogue and the model. The drift test fails when the committed file differs. */
const target = new URL("../authz.manifest.json", import.meta.url);
writeFileSync(target, `${JSON.stringify(buildManifest(), null, "\t")}\n`);
process.stdout.write("authz.manifest.json written\n");
