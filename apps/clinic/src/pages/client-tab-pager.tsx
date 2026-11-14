import type { JSX } from "hono/jsx/jsx-runtime";
import type { Ctx } from "../lib/context";
import { at } from "../lib/i18n";
import { moreHref, ShowMore } from "../lib/show-more";
import { m } from "../paraglide/messages.js";

/** The client page's tabs that show a long list a page at a time. */
export const PAGED_TABS = ["appointments", "notes", "records", "files"] as const;
export type PagedTab = (typeof PAGED_TABS)[number];

/** The list element of a paged tab: where its next page is appended. */
export const tabListId = (tab: PagedTab): string => `cl-list-${tab}`;

/** The tab's "show more": the next page of the client's list appended, nothing once the last is shown. */
export function TabMore({
	ctx,
	clientId,
	tab,
	cursor,
	shown,
}: {
	ctx: Ctx;
	clientId: string;
	tab: PagedTab;
	cursor: string | null;
	shown: number;
}): JSX.Element {
	return (
		<ShowMore
			id={`cl-more-${tab}`}
			href={moreHref(`/clients/${encodeURIComponent(clientId)}/more/${tab}`, cursor, shown)}
			label={m.ls_more({}, at(ctx.locale))}
		/>
	);
}
