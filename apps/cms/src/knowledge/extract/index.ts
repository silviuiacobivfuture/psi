import { csvText } from "./csv";
import { docxSections } from "./docx";
import { htmlSections } from "./html";
import { markdownSections } from "./markdown";
import { pdfSections } from "./pdf";
import {
	ExtractError,
	type Extracted,
	type Format,
	MAX_BYTES,
	MAX_CHARS,
	type Section,
} from "./types";

export {
	ExtractError,
	type Extracted,
	type Format,
	MAX_BYTES,
	MAX_CHARS,
	type Section,
} from "./types";

const BY_MIME: Readonly<Record<string, Format>> = {
	"application/pdf": "pdf",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
	"text/markdown": "markdown",
	"text/x-markdown": "markdown",
	"text/plain": "text",
	"text/html": "html",
	"application/xhtml+xml": "html",
	"text/csv": "csv",
};
const BY_EXTENSION: Readonly<Record<string, Format>> = {
	pdf: "pdf",
	docx: "docx",
	md: "markdown",
	markdown: "markdown",
	txt: "text",
	html: "html",
	htm: "html",
	csv: "csv",
};

/** The upload MIME types the collection accepts (Payload checks them, by content or extension). */
export const SOURCE_MIME_TYPES = Object.keys(BY_MIME);

/** The format of a file, from its MIME type, else its extension; null when it is not one we read. */
export function formatOf(
	mimeType: string | null | undefined,
	filename: string | null | undefined,
): Format | null {
	const essence = (mimeType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
	const byMime = BY_MIME[essence];
	if (byMime !== undefined) return byMime;
	const ext = (filename ?? "").toLowerCase().split(".").pop() ?? "";
	return BY_EXTENSION[ext] ?? null;
}

function utf8(bytes: Uint8Array): string {
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		throw new ExtractError("unreadable", "the file is not UTF-8 text");
	}
}

export interface ExtractInput {
	format: Format;
	bytes: Uint8Array;
	/** How a PDF page is titled, in the admin's language ("p. 3"). */
	pageLabel?: (n: number) => string;
}

/**
 * Extracts a source's text as sections, locally (no external service). Refuses a file over
 * MAX_BYTES, text over MAX_CHARS, and a document with no text, each with a clear message.
 */
export async function extract(input: ExtractInput): Promise<Extracted> {
	if (input.bytes.byteLength > MAX_BYTES) {
		throw new ExtractError(
			"too_large",
			`the file is ${(input.bytes.byteLength / 1048576).toFixed(1)} MB; the limit is ${MAX_BYTES / 1048576} MB`,
		);
	}
	const sections = await sectionsOf(input);
	const chars = sections.reduce((n, s) => n + s.text.length, 0);
	if (chars === 0) throw new ExtractError("empty", "no text was found (a scanned PDF has none)");
	if (chars > MAX_CHARS) {
		throw new ExtractError(
			"too_long",
			`the text is ${chars} characters; the limit is ${MAX_CHARS}: split the document`,
		);
	}
	return { sections, chars };
}

async function sectionsOf(input: ExtractInput): Promise<Section[]> {
	switch (input.format) {
		case "pdf":
			return pdfSections(input.bytes, input.pageLabel ?? ((n) => `p. ${n}`));
		case "docx":
			return docxSections(input.bytes);
		case "html":
			return htmlSections(utf8(input.bytes));
		case "markdown":
		case "text":
			return markdownSections(utf8(input.bytes));
		case "csv":
			return markdownSections(csvText(utf8(input.bytes)));
	}
}
