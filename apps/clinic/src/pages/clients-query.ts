import { CLIENT_SORTS } from "@psi/scheduling/clinic";
import { z } from "zod";
import type { Ctx } from "../lib/context";
import {
	listHref,
	type PageParams,
	PageParams as PageParamsSchema,
	pageAsked,
	sizeOf,
} from "../lib/paging";
import type { ClientListAsk } from "../port/port";

/**
 * The client list's address, parsed at the boundary: `?filter=&q=&sort=&practitioner=&flag=&package=&page=&size=`. A
 * value that is not one of the list's own falls back to its default (a hand-edited link still opens the list), and the
 * canonical address is built back from the parsed values, so back, refresh and a shared link land on the same page.
 */
export const ClientsAddress = z.object({
	filter: z.enum(["current", "archived"]).catch("current"),
	q: z
		.string()
		.transform((s) => s.trim().slice(0, 120))
		.catch(""),
	sort: z.enum(CLIENT_SORTS).catch("name"),
	practitioner: z
		.string()
		.regex(/^[A-Za-z0-9_-]{1,64}$/)
		.nullable()
		.catch(null),
	flag: z.enum(["listed", "unassigned"]).nullable().catch(null),
	package: z.enum(["with", "without"]).nullable().catch(null),
});
export type ClientsAddress = z.infer<typeof ClientsAddress>;

/** The parsed address and paging of one request. */
export interface ClientsRequest {
	readonly address: ClientsAddress;
	readonly paging: PageParams;
}

export function parseClients(query: Readonly<Record<string, string>>): ClientsRequest {
	const raw = {
		filter: query.filter,
		q: query.q ?? "",
		sort: query.sort,
		practitioner: query.practitioner === "" ? null : (query.practitioner ?? null),
		flag: query.flag === "" ? null : (query.flag ?? null),
		package: query.package === "" ? null : (query.package ?? null),
	};
	return {
		address: ClientsAddress.parse(raw),
		paging: PageParamsSchema.parse(query),
	};
}

/** What the port is asked, the size resolved (the address's, else the person's own) and the page after a size change. */
export async function askOf(ctx: Ctx, r: ClientsRequest): Promise<ClientListAsk> {
	const size = await sizeOf(ctx, r.paging);
	return {
		filter: r.address.filter,
		q: r.address.q,
		sort: r.address.sort,
		practitioner: r.address.practitioner,
		among: null,
		flag: r.address.flag,
		pkg: r.address.package,
		page: pageAsked(r.paging, size),
		size,
	};
}

/** The list's search, filters and order as address parameters (the default ones left out). */
export function addressParams(
	a: Pick<ClientListAsk, "filter" | "q" | "sort" | "practitioner" | "flag" | "pkg">,
): ReadonlyArray<readonly [string, string | null]> {
	return [
		["filter", a.filter === "current" ? null : a.filter],
		["q", a.q],
		["sort", a.sort === "name" ? null : a.sort],
		["practitioner", a.practitioner],
		["flag", a.flag],
		["package", a.pkg],
	];
}

/** The canonical address of a page of the list. */
export const clientsHref = (
	a: Pick<ClientListAsk, "filter" | "q" | "sort" | "practitioner" | "flag" | "pkg">,
	page: number,
	size: number,
): string =>
	listHref("/clients", [...addressParams(a), ["page", String(page)], ["size", String(size)]]);

/** Whether anything narrows the list beyond its standing (an empty answer then says "nothing matches", not "no clients"). */
export const narrowed = (a: Pick<ClientListAsk, "q" | "practitioner" | "flag" | "pkg">): boolean =>
	a.q !== "" || a.practitioner !== null || a.flag !== null || a.pkg !== null;
