const MAP: Readonly<Record<string, string>> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

/** Escapes text for HTML text and attribute positions. */
export function escapeHtml(text: string): string {
	return text.replace(/[&<>"']/g, (ch) => MAP[ch] ?? ch);
}
