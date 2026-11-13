import type { z } from "zod";
import { StoreUnavailable } from "../types";

/**
 * Each catalogue row has one `extra` text column (apiCatalogExtra): JSON the service wrote, for the facts the API holds
 * that no column does. A schema per entity says what is in it. Text that is not that JSON is not ours to guess at: the
 * store is reported unavailable rather than answering with a row that silently lost a field.
 */
export function readExtra<S extends z.ZodType>(
	schema: S,
	text: string | undefined,
): z.output<S> | undefined {
	if (text === undefined) return undefined;
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		throw new StoreUnavailable("a catalogue row holds an unreadable extra");
	}
	const parsed = schema.safeParse(json);
	if (!parsed.success) throw new StoreUnavailable("a catalogue row holds an unexpected extra");
	return parsed.data;
}

export const writeExtra = (value: unknown): string => JSON.stringify(value);
