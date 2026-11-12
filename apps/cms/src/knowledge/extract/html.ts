import { HTMLElement, type Node, NodeType, parse } from "node-html-parser";
import { markdownSections } from "./markdown";
import type { Section } from "./types";

/** Elements whose content is never text for the guide: code, chrome, forms, embedded media. */
const DROP = new Set([
	"script",
	"style",
	"noscript",
	"template",
	"iframe",
	"object",
	"embed",
	"svg",
	"canvas",
	"video",
	"audio",
	"form",
	"button",
	"select",
	"input",
	"textarea",
	"nav",
	"header",
	"footer",
	"aside",
	"head",
]);
const BLOCK = new Set([
	"p",
	"div",
	"section",
	"article",
	"main",
	"blockquote",
	"pre",
	"table",
	"tr",
	"ul",
	"ol",
	"dl",
	"dt",
	"dd",
	"figure",
	"figcaption",
	"address",
]);
const HEADING = /^h([1-6])$/;

/** Text only: markup is dropped, entities decoded, so nothing executable survives. */
function walk(node: Node, out: string[]): void {
	if (node.nodeType === NodeType.TEXT_NODE) {
		out.push(node.text.replace(/\s+/g, " "));
		return;
	}
	if (!(node instanceof HTMLElement)) return;
	const tag = node.rawTagName?.toLowerCase() ?? "";
	if (DROP.has(tag) || node.getAttribute("aria-hidden") === "true" || node.hasAttribute("hidden")) {
		return;
	}
	const h = HEADING.exec(tag);
	if (h !== null) {
		const level = Math.min(Number(h[1]), 6);
		out.push(`\n\n${"#".repeat(level)} ${node.text.replace(/\s+/g, " ").trim()}\n\n`);
		return;
	}
	if (tag === "br") {
		out.push("\n");
		return;
	}
	if (tag === "li") out.push("\n- ");
	if (tag === "td" || tag === "th") out.push(" | ");
	if (BLOCK.has(tag)) out.push("\n\n");
	for (const child of node.childNodes) walk(child, out);
	if (BLOCK.has(tag)) out.push("\n\n");
}

/**
 * HTML as markdown-ish text (headings, paragraphs, lists, table rows), then as sections. A full
 * page keeps only its `<main>` (or `<article>`) when it has one, so navigation and footers never
 * reach the guide.
 */
export function htmlToMarkdown(html: string): string {
	const root = parse(html, { comment: false, blockTextElements: { script: false, style: false } });
	const scope = root.querySelector("main") ?? root.querySelector("article") ?? root;
	const out: string[] = [];
	walk(scope, out);
	return out
		.join("")
		.split("\n")
		.map((l) => l.replace(/^\s*\|\s*/, "").trim())
		.join("\n");
}

export function htmlSections(html: string): Section[] {
	return markdownSections(htmlToMarkdown(html));
}

/** The page's `<title>` (or first `<h1>`), for a fetched source without a title of its own. */
export function htmlTitle(html: string): string | null {
	const root = parse(html);
	const t = (root.querySelector("title") ?? root.querySelector("h1"))?.text.replace(/\s+/g, " ");
	return t === undefined || t.trim() === "" ? null : t.trim().slice(0, 200);
}
