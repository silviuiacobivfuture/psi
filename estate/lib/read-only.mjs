// .seb-bundle/ is SEB's, installed by digest: nothing in the estate may write into it. After an
// install every file is made read-only (0444, executables 0555) and every directory 0555, so an
// edit, a formatter or a code generator run over the tree fails loudly instead of changing SEB's
// code in place. The installer itself lifts this on the old tree just before it removes it.
import { chmodSync, existsSync, lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** @param {string} dir */
export function sealTree(dir) {
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, e.name);
		if (e.isDirectory()) sealTree(p);
		else if (e.isFile()) chmodSync(p, lstatSync(p).mode & 0o111 ? 0o555 : 0o444);
	}
	chmodSync(dir, 0o555);
}

/** Directories writable again, so the tree can be removed. @param {string} dir */
export function unsealTree(dir) {
	if (!existsSync(dir)) return;
	chmodSync(dir, 0o755);
	for (const e of readdirSync(dir, { withFileTypes: true }))
		if (e.isDirectory()) unsealTree(join(dir, e.name));
}
