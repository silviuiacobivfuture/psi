import { z as z4 } from "zod/v4";
import { fence } from "../fence";
import type { RouteLike } from "./routes";

const MAX_ITEMS = 40;
const MAX_CHARS = 12_000;

/** Values that are structure, not prose: ids, dates, short enum words and numbers stay as they are. */
const PLAIN = /^([A-Za-z0-9][A-Za-z0-9_.:-]{0,63}|\d{4}-\d{2}-\d{2}([T ][\d:.+Z-]+)?)$/;

/**
 * An answer from the service as the model reads it: every string that is not an id, a date or a
 * short code is free text from a record and goes inside the data fence; long lists are cut.
 */
export function fenceDeep(value: unknown, depth = 0): unknown {
	if (typeof value === "string") return PLAIN.test(value) ? value : fence(value);
	if (Array.isArray(value)) return value.slice(0, MAX_ITEMS).map((v) => fenceDeep(v, depth + 1));
	if (typeof value === "object" && value !== null && depth < 8) {
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fenceDeep(v, depth + 1)]));
	}
	return value;
}

export function bounded(value: unknown): { data: unknown; truncated: boolean } {
	const fenced = fenceDeep(value);
	const text = JSON.stringify(fenced) ?? "null";
	const cut = Array.isArray(value) && value.length > MAX_ITEMS;
	return text.length <= MAX_CHARS
		? { data: fenced, truncated: cut }
		: { data: text.slice(0, MAX_CHARS), truncated: true };
}

/** One input object for a call: the route's path, query and body fields flattened, `app` left to the session. */
export function inputSchemaOf(route: RouteLike): z4.ZodObject {
	const shape: Record<string, z4.ZodType> = {};
	for (const part of [route.params, route.query, route.body]) {
		if (part === undefined) continue;
		for (const [key, schema] of Object.entries(part.shape))
			if (key !== "app") shape[key] = schema as z4.ZodType;
	}
	return z4.object(shape).strict();
}
