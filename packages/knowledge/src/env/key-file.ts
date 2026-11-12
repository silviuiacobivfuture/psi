import { readFileSync } from "node:fs";

const KeyLine = /^\s*OPENROUTER_API_KEY\s*=\s*["']?([^"'\n]*)["']?\s*$/m;

/**
 * `OPENROUTER_API_KEY` from an env file (an app's `.env`), or undefined. The key stays in memory:
 * never print, log or report what this returns.
 */
export function openRouterKeyFrom(path: string): string | undefined {
	const key = KeyLine.exec(readFileSync(path, "utf8"))?.[1]?.trim();
	return key === undefined || key === "" ? undefined : key;
}
