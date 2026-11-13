/**
 * Text that comes from a record (a name, a note, a website request) is written by other people
 * and may try to give the assistant orders. It reaches the model only inside this fence, with the
 * fence's own characters removed, and the agent's rules say a fenced block is data.
 */
export const FENCE_OPEN = "<record-data>";
export const FENCE_CLOSE = "</record-data>";

/** The longest fenced field the model reads, in characters. */
export const FENCE_LIMIT = 800;

export function fence(text: string, limit: number = FENCE_LIMIT): string {
	const clean = text
		.replace(/[<>]/g, (c) => (c === "<" ? "‹" : "›"))
		.replace(/\p{Cc}/gu, (c) => (c === "\n" || c === "\t" ? c : " "))
		.trim();
	const cut = clean.length > limit ? `${clean.slice(0, limit)}…` : clean;
	return `${FENCE_OPEN}${cut}${FENCE_CLOSE}`;
}

/** A nullable record field, fenced when present. */
export function fenceOrNull(text: string | null | undefined): string | null {
	return text === null || text === undefined ? null : fence(text);
}

const TAGS = [FENCE_OPEN, FENCE_CLOSE];

/**
 * Text for the person: the data fence is for the model, so its tags are removed, and a tag still
 * arriving (a stream cut mid-tag) is held back until it is whole.
 */
/** The text with the fence tags taken out. */
export function stripTags(raw: string): string {
	return raw.split(FENCE_OPEN).join("").split(FENCE_CLOSE).join("");
}

export function withoutFence(raw: string): string {
	let out = stripTags(raw);
	const open = out.lastIndexOf("<");
	if (open >= 0) {
		const tail = out.slice(open);
		if (TAGS.some((tag) => tag.startsWith(tail))) out = out.slice(0, open);
	}
	return out;
}
