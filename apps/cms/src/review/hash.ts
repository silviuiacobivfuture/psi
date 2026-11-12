import { createHash } from "node:crypto";

/** Keys Payload adds to rows and blocks that are not content (ids differ between reads). */
const NOT_CONTENT = new Set(["id", "blockName"]);

/** JSON with object keys sorted at every level, so equal content always hashes equal. */
export function stableStringify(value: unknown): string {
	if (value === undefined) return "null";
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
	const entries = Object.entries(value)
		.filter(([k, v]) => v !== undefined && !NOT_CONTENT.has(k))
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
	return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

/** sha256 (hex) of one locale's reviewed content: exactly the fields a reviewer approves. */
export function contentHash(content: Record<string, unknown>): string {
	return createHash("sha256").update(stableStringify(content)).digest("hex");
}
