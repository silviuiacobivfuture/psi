import { normalizeText, slug, uniqueAnchors } from "./normalize";
import type { Section } from "./types";

const HEADING = /^(#{1,3})\s+(.+?)\s*#*\s*$/;

/**
 * Markdown (and plain text) as sections: a new section at every heading of level 1–3, the
 * heading kept as the section's title; deeper headings stay inside their section's text. Text
 * before the first heading is a section without a title. Fenced code is not split.
 */
export function markdownSections(markdown: string): Section[] {
	const lines = normalizeText(markdown).split("\n");
	const raw: Array<{ title: string; lines: string[] }> = [{ title: "", lines: [] }];
	let fenced = false;
	for (const line of lines) {
		if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
		const h = fenced ? null : HEADING.exec(line);
		const current = raw[raw.length - 1];
		if (h !== null && h[2] !== undefined) {
			raw.push({ title: h[2].replace(/[*_`]/g, "").trim(), lines: [] });
		} else if (current !== undefined) {
			current.lines.push(line);
		}
	}
	const kept = raw
		.map((r) => ({ title: r.title, text: normalizeText(r.lines.join("\n")) }))
		// A heading with no text of its own (a part title over sub-sections) adds nothing to cite.
		.filter((r) => r.text !== "");
	const anchors = uniqueAnchors(kept.map((k) => (k.title === "" ? "start" : slug(k.title))));
	return kept.map((k, i) => ({ title: k.title, anchor: anchors[i] ?? "section", text: k.text }));
}
