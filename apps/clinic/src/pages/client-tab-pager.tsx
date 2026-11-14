import type { JSX } from "hono/jsx/jsx-runtime";
import type { Ctx } from "../lib/context";
import { at } from "../lib/i18n";
import { ListPager, listHref } from "../lib/paging";
import { m } from "../paraglide/messages.js";
import type { Numbered, PageAt } from "../port/numbered";
import { numberedOf } from "../port/numbered";

export type { Numbered };
/** Which page of a tab is asked, and at what size. */
export type TabPaging = PageAt;

/**
 * The client page's long lists as numbered pages (the console's shared pager): each tab has its own address,
 * `/clients/:id/<tab>?page=&size=`, so back, refresh and a shared link land on the same page. A client's lists are
 * one client's (read by the client's index), so the console holds the whole list and cuts the page; the files come a
 * page at a time from the service, which counts them.
 */

/** The client page's tabs that show a long list a page at a time. */
export const PAGED_TABS = ["appointments", "notes", "records", "files", "packages"] as const;
export type PagedTab = (typeof PAGED_TABS)[number];
export const isPagedTab = (tab: string): tab is PagedTab =>
	(PAGED_TABS as ReadonlyArray<string>).includes(tab);

/** The element a page change replaces (and focuses): the tab's whole body. */
export const tabRegionId = (tab: PagedTab): string => `cl-tab-${tab}`;

/** The canonical address of a page of a client's tab. */
export const tabHref = (clientId: string, tab: PagedTab, page: number, size: number): string =>
	listHref(`/clients/${encodeURIComponent(clientId)}/${tab}`, [
		["page", page],
		["size", size],
	]);

/** The tab's pager; nothing for an empty list (the tab says it is empty). */
export function TabPager({
	ctx,
	clientId,
	tab,
	shown,
	size,
}: {
	ctx: Ctx;
	clientId: string;
	tab: PagedTab;
	shown: Numbered<unknown>;
	size: number;
}): JSX.Element | null {
	if (shown.total === 0) return null;
	return (
		<ListPager
			ctx={ctx}
			id={`cl-pager-${tab}`}
			nav={m.cl_tab_pager_nav({}, at(ctx.locale))}
			page={shown.page}
			size={size}
			total={shown.total}
			href={(p, s) => tabHref(clientId, tab, p, s)}
			action={`/clients/${encodeURIComponent(clientId)}/${tab}`}
			params={{}}
		/>
	);
}

/**
 * Back and Forward land on an address the tab pushed: the tab follows it in place. The address the page opened at is
 * made the canonical one first, so following it never pushes over the forward history.
 */
export function TabHistory({ href }: { href: string }): JSX.Element {
	return (
		<div
			hidden
			data-init={`history.replaceState(null, "", ${JSON.stringify(href)})`}
			data-on:popstate__window="@get(location.pathname + location.search)"
		/>
	);
}

/** One page of a list the console holds whole. */
export const cutTab = numberedOf;
