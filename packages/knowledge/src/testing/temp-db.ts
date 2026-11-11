import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TempDb {
	url: string;
	cleanup(): void;
}

/** A fresh libsql file in its own temp directory (one per test). */
export function tempDb(): TempDb {
	const dir = mkdtempSync(join(tmpdir(), "psi-knowledge-"));
	return {
		url: `file:${join(dir, "nested", "knowledge.db")}`,
		cleanup: () => rmSync(dir, { recursive: true, force: true }),
	};
}
