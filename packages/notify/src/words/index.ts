import { CLIENT_WORDS } from "./client";
import { OWNER_WORDS } from "./owner";
import { STAFF_WORDS } from "./staff";
import type { Words } from "./types";

export type { Fn, Locale, Params, Words } from "./types";

/** The message functions of every catalogue entry, by stem; a missing key fails the type-check. */
export const WORDS = {
	...CLIENT_WORDS,
	...STAFF_WORDS,
	...OWNER_WORDS,
} as const satisfies Record<string, Words>;

export type Stem = keyof typeof WORDS;
