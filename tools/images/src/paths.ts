import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The monorepo root. */
export const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/** Originals live here, gitignored (/.data/): only the outputs and the credits are committed. */
export const ORIGINALS = join(ROOT, ".data/imagery/originals");

/** Served by every app's `/assets/*` static route; the pipeline owns this folder outright. */
export const PUBLIC_PREFIX = "/assets/images";

export function appImagesDir(app: string): string {
	return join(ROOT, "apps", app, "public/assets/images");
}

export function appManifest(app: string): string {
	return join(ROOT, "apps", app, "src/images.generated.ts");
}

/** The covers every site shows (the blog's own and its topic pool): one manifest in @psi/content. */
export const COVERS_MANIFEST = join(ROOT, "packages/content/src/covers/covers.generated.ts");
