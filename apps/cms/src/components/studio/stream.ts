import { TestAnswerLine } from "@psi/cms-client/control-contract";

/** One line of the preview's NDJSON stream (the control plane's contract; unknown lines skipped). */
export type PreviewLine = TestAnswerLine;

function parse(raw: string): PreviewLine | null {
	try {
		const r = TestAnswerLine.safeParse(JSON.parse(raw));
		return r.success ? r.data : null;
	} catch {
		return null;
	}
}

/** Reads a fetch body as preview lines, one at a time, as they arrive. */
export async function* previewLines(body: ReadableStream<Uint8Array>): AsyncGenerator<PreviewLine> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		const parts = buffer.split("\n");
		buffer = parts.pop() ?? "";
		for (const raw of parts) {
			const line = raw.trim() === "" ? null : parse(raw);
			if (line !== null) yield line;
		}
	}
	const last = buffer.trim() === "" ? null : parse(buffer);
	if (last !== null) yield last;
}
