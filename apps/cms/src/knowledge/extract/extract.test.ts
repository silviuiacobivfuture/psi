import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { csvText, parseCsv } from "./csv";
import { htmlSections, htmlTitle } from "./html";
import { ExtractError, extract, formatOf, MAX_BYTES, MAX_CHARS } from "./index";
import { markdownSections } from "./markdown";
import { normalizeText, slug } from "./normalize";

const fixture = (name: string): Uint8Array =>
	new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const bytes = (s: string): Uint8Array => new TextEncoder().encode(s);

describe("extraction", () => {
	it("reads a PDF page by page: one section per page with text, anchored page=N", async () => {
		const out = await extract({ format: "pdf", bytes: fixture("fixture.pdf") });
		expect(out.sections.map((s) => [s.title, s.anchor, s.page])).toEqual([
			["p. 1", "page=1", 1],
			["p. 3", "page=3", 3],
		]);
		expect(out.sections[1]?.text).toContain("The spoon is green.");
		expect(out.chars).toBe(out.sections.reduce((n, s) => n + s.text.length, 0));
	});

	it("reads a Word document's heading styles as section titles, repeated anchors made unique", async () => {
		const out = await extract({ format: "docx", bytes: fixture("fixture.docx") });
		expect(out.sections.map((s) => [s.title, s.anchor])).toEqual([
			["Fixture title", "fixture-title"],
			["Second part", "second-part"],
			["Second part", "second-part-2"],
		]);
		expect(out.sections[1]?.text).toBe("The cup is red.");
	});

	it("splits markdown at headings 1–3, keeps deeper ones inside, never splits fenced code", () => {
		const md =
			"Intro.\n\n# Program\n\nLuni: 9–17.\n\n#### Detail\nx\n\n```\n# not a heading\n```\n\n## Pași\n\n1. Sunați.";
		const s = markdownSections(md);
		expect(s.map((x) => x.title)).toEqual(["", "Program", "Pași"]);
		expect(s[0]?.anchor).toBe("start");
		expect(s[1]?.text).toContain("#### Detail");
		expect(s[1]?.text).toContain("# not a heading");
		expect(s[2]?.anchor).toBe("pasi");
	});

	it("sanitises HTML: no script, style, nav or footer text; main content only; headings kept", () => {
		const html = `<html><head><title>Program | Psizone</title><style>.x{}</style></head><body>
			<nav>Meniu</nav><main><h1>Program</h1><p>Luni&nbsp;–&nbsp;vineri, <b>9–17</b>.</p>
			<script>alert(1)</script><ul><li>Sâmbătă: închis</li></ul><h2>Evaluare</h2><p>Durează o oră.</p>
			<div hidden>secret</div></main><footer>© 2026</footer></body></html>`;
		const s = htmlSections(html);
		const all = s.map((x) => `${x.title}\n${x.text}`).join("\n");
		expect(s.map((x) => x.title)).toEqual(["Program", "Evaluare"]);
		expect(all).toContain("Luni – vineri, 9–17.");
		expect(all).toContain("- Sâmbătă: închis");
		for (const banned of ["alert", "Meniu", "© 2026", "secret", ".x{}"]) {
			expect(all).not.toContain(banned);
		}
		expect(htmlTitle(html)).toBe("Program | Psizone");
	});

	it("turns CSV rows into named cells, with quotes, semicolons and a BOM", () => {
		expect(parseCsv('﻿a;b\n"x;1";"say ""hi"""\n')).toEqual([
			["a", "b"],
			["x;1", 'say "hi"'],
		]);
		expect(csvText("Zi,Program\nluni,9-17\nsâmbătă,\n")).toBe(
			"Zi: luni; Program: 9-17\nZi: sâmbătă",
		);
	});

	it("normalises whitespace and folds anchors", () => {
		expect(normalizeText("a\t\t b​\r\n\r\n\r\n\r\nc  ")).toBe("a b\n\nc");
		expect(slug("Ședința de evaluare: pașii!")).toBe("sedinta-de-evaluare-pasii");
		expect(slug("!!!")).toBe("section");
	});

	it("knows formats by MIME type, then by extension", () => {
		expect(formatOf("application/pdf", "x.bin")).toBe("pdf");
		expect(formatOf("application/octet-stream", "Notes.MD")).toBe("markdown");
		expect(formatOf("text/csv; charset=utf-8", null)).toBe("csv");
		expect(formatOf("image/png", "x.png")).toBeNull();
	});

	it("refuses with clear errors: too large, too long, empty, not UTF-8, an unreadable PDF", async () => {
		const fail = async (p: Promise<unknown>): Promise<ExtractError> => {
			const e = await p.then(
				() => null,
				(x: unknown) => x,
			);
			if (!(e instanceof ExtractError)) throw new Error("expected an ExtractError");
			return e;
		};
		const big = await fail(extract({ format: "text", bytes: new Uint8Array(MAX_BYTES + 1) }));
		expect([big.problem, big.message]).toEqual([
			"too_large",
			"the file is 20.0 MB; the limit is 20 MB",
		]);
		const long = await fail(extract({ format: "text", bytes: bytes("a".repeat(MAX_CHARS + 1)) }));
		expect(long.problem).toBe("too_long");
		expect((await fail(extract({ format: "markdown", bytes: bytes("# Only\n\n") }))).problem).toBe(
			"empty",
		);
		expect(
			(await fail(extract({ format: "text", bytes: new Uint8Array([0xff, 0xfe, 0xfd]) }))).problem,
		).toBe("unreadable");
		expect((await fail(extract({ format: "pdf", bytes: bytes("%PDF-1.4 broken") }))).problem).toBe(
			"unreadable",
		);
	});
});
