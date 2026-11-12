import { normalizeText } from "./normalize";
import { ExtractError, type Section } from "./types";

/**
 * A PDF as one section per page with text (`p. 3`, anchor `page=3`), through unpdf (PDF.js,
 * serverless build, no native code, no network). A scanned PDF with no text layer is refused as
 * empty: there is no OCR here.
 */
export async function pdfSections(
	bytes: Uint8Array,
	pageLabel: (n: number) => string,
): Promise<Section[]> {
	const { extractText, getDocumentProxy } = await import("unpdf");
	let pages: string[];
	try {
		const doc = await getDocumentProxy(new Uint8Array(bytes));
		pages = (await extractText(doc, { mergePages: false })).text;
	} catch (error) {
		throw new ExtractError(
			"unreadable",
			`the PDF could not be read (${error instanceof Error ? error.name : "error"})`,
		);
	}
	return pages
		.map((text, i) => ({
			title: pageLabel(i + 1),
			anchor: `page=${i + 1}`,
			page: i + 1,
			text: normalizeText(text),
		}))
		.filter((s) => s.text !== "");
}
