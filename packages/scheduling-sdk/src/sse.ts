/** Splits a server-sent event stream into the JSON `data:` payloads of its events. Comments (heartbeats) are skipped. */
export async function* sseData(
	body: ReadableStream<Uint8Array>,
	signal?: AbortSignal,
): AsyncGenerator<unknown> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	try {
		while (signal?.aborted !== true) {
			const { done, value } = await reader.read();
			if (done) return;
			buffer += decoder.decode(value, { stream: true });
			let at = buffer.indexOf("\n\n");
			while (at >= 0) {
				const block = buffer.slice(0, at);
				buffer = buffer.slice(at + 2);
				const data = block
					.split("\n")
					.filter((line) => line.startsWith("data:"))
					.map((line) => line.slice(5).trimStart())
					.join("\n");
				if (data !== "") yield JSON.parse(data);
				at = buffer.indexOf("\n\n");
			}
		}
	} finally {
		await reader.cancel().catch(() => undefined);
	}
}
