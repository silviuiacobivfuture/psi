import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { type Browser, chromium } from "playwright-core";
import { z } from "zod";

const CANDIDATES = [
	process.env.CLINIC_CHROME,
	"/usr/bin/google-chrome",
	"/usr/bin/chromium",
	"/usr/bin/chromium-browser",
	"/snap/bin/chromium",
];

/** A real Chromium: contrast, viewports and motion media queries are only true in one. No fallback: no browser, no pass. */
export async function launch(): Promise<Browser> {
	const executablePath = CANDIDATES.find(
		(p): p is string => typeof p === "string" && existsSync(p),
	);
	if (executablePath === undefined)
		throw new Error("no Chromium found: install one or set CLINIC_CHROME to its path");
	return chromium.launch({ executablePath, args: ["--no-sandbox"] });
}

export const AXE_SOURCE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");

export const ViolationsSchema = z.array(
	z.object({ id: z.string(), impact: z.string().nullable(), nodes: z.array(z.string()) }),
);

/** axe-core with the WCAG 2.2 A and AA rule sets. */
export const AXE_RUN = `axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } }).then((r) => r.violations.map((v) => ({ id: v.id, impact: v.impact ?? null, nodes: v.nodes.map((n) => n.target.join(" ")) })))`;
