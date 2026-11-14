import type { ClientSort } from "@psi/scheduling/clinic";
import type { Client } from "./schema";
import type { ClientSummary } from "./schema-clinical";

/** The current clients or the archive. */
export type ClientFilter = "current" | "archived";
/** `listed`: on the blacklist now; `unassigned`: nobody treats them. */
export type ClientFlagFilter = "listed" | "unassigned";
/** `with`: holds a package; `without`: none. */
export type ClientPackageFilter = "with" | "without";

/** The page size a list opens with while the person never picked one. */
export const DEFAULT_PAGE_SIZE = 50;

/** What the client list asks for: ONE numbered page (1-based) of the search, the filters and the order. */
export interface ClientListAsk {
	readonly filter: ClientFilter;
	readonly q: string;
	readonly sort: ClientSort;
	readonly practitioner: string | null;
	/** Only the clients of these practitioners (looking at the app as a role or member who reaches only some); null: all. */
	readonly among: ReadonlyArray<string> | null;
	readonly flag: ClientFlagFilter | null;
	readonly pkg: ClientPackageFilter | null;
	readonly page: number;
	readonly size: number;
}

/**
 * The practitioners a list is narrowed to: the one picked, kept only within `among`; null when nothing narrows it, and
 * empty when the pick lies outside `among` (the list is then empty).
 */
export function narrowedTo(ask: ClientListAsk): ReadonlyArray<string> | null {
	if (ask.among === null) return ask.practitioner === null ? null : [ask.practitioner];
	if (ask.practitioner === null) return ask.among;
	return ask.among.includes(ask.practitioner) ? [ask.practitioner] : [];
}

/** The empty page: nothing matches. */
export const NO_CLIENTS: ClientPage = {
	clients: [],
	summaries: [],
	total: 0,
	page: 1,
};

/**
 * One page of the client list and its rich rows: `total` is how many match in all (within what the person may see),
 * `page` the page really shown (a page past the end shows the last one).
 */
export interface ClientPage {
	clients: ReadonlyArray<Client>;
	summaries: ReadonlyArray<ClientSummary>;
	total: number;
	page: number;
}
