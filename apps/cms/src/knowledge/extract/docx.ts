import { htmlSections } from "./html";
import { ExtractError, type Section } from "./types";

/**
 * A Word document through mammoth (pure JS): converted to HTML, so its heading styles become
 * section titles, then read by the same sanitising HTML extractor as a fetched page.
 */
export async function docxSections(bytes: Uint8Array): Promise<Section[]> {
	const mammoth = await import("mammoth");
	let html: string;
	try {
		html = (await mammoth.convertToHtml({ buffer: Buffer.from(bytes) })).value;
	} catch (error) {
		throw new ExtractError(
			"unreadable",
			`the Word document could not be read (${error instanceof Error ? error.name : "error"})`,
		);
	}
	return htmlSections(html);
}
