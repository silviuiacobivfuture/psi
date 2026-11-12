/**
 * DEV ONLY — a named, managed block in a gitignored .env file. Only the lines between the block's markers are ever
 * written; every other line is left as it is, the file is kept at mode 600, and no value is ever printed.
 */
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const begin = (name: string): string =>
	`# >>> @psi/account ${name} (managed by packages/account/dev; do not edit)`;
const end = (name: string): string => `# <<< @psi/account ${name}`;

function bounds(text: string, name: string): { start: number; stop: number } | null {
	// Matched on the marker's stable prefix, so a block written under an older wording is still found and replaced.
	const start = text.indexOf(`# >>> @psi/account ${name} (`);
	const close = text.indexOf(end(name));
	return start >= 0 && close > start ? { start, stop: close + end(name).length } : null;
}

/** Replaces the block (creating the file at mode 600). Returns false when the block already held exactly these lines. */
export function writeBlock(file: string, name: string, lines: ReadonlyArray<string>): boolean {
	const current = existsSync(file) ? readFileSync(file, "utf8") : "";
	const block = `${begin(name)}\n${lines.join("\n")}\n${end(name)}`;
	const at = bounds(current, name);
	if (at !== null && current.slice(at.start, at.stop) === block) return false;
	const kept =
		at === null
			? current
			: `${current.slice(0, at.start)}${current.slice(at.stop).replace(/^\n/, "")}`;
	const prefix = kept === "" || kept.endsWith("\n") ? kept : `${kept}\n`;
	writeFileSync(file, `${prefix}${block}\n`, { mode: 0o600 });
	chmodSync(file, 0o600);
	return true;
}

/** The block's values, parsed; empty when the file or the block is absent. */
export function readBlock(file: string, name: string): Record<string, string> {
	const text = existsSync(file) ? readFileSync(file, "utf8") : "";
	const at = bounds(text, name);
	const out: Record<string, string> = {};
	if (at === null) return out;
	for (const line of text.slice(at.start, at.stop).split("\n")) {
		const eq = line.indexOf("=");
		if (eq > 0 && !line.startsWith("#")) out[line.slice(0, eq)] = line.slice(eq + 1);
	}
	return out;
}
