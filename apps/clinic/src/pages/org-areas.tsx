import { Banner, EmptyState } from "@psi/ui/admin";
import type { Hono } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Env } from "../app";
import { areaText } from "../lib/area-labels";
import { ORG_AREAS } from "../lib/areas";
import type { Ctx } from "../lib/context";
import { at } from "../lib/i18n";
import { inPlace, ListHistory, ListPager, listHref, pageRequested, patchList } from "../lib/paging";
import { m } from "../paraglide/messages.js";
import type { Numbered, PageAt } from "../port/numbered";
import type { ListedClient } from "../port/port";
import { registerMembers } from "./members-routes";
import { registerOrgProfile } from "./org-profile";
import { OrgFrame, renderSoonArea } from "./org-settings";

const NOCACHE = { "cache-control": "private, no-store" } as const;

/** One client on the blacklist, linking to their page. */
function ListedRow({ row }: { row: ListedClient }): JSX.Element {
	return (
		<a class="client-row" href={`/clients/${row.clientId}`} data-listed={row.clientId}>
			<span class="client-row__main">
				<strong>{row.clientName === "" ? row.clientId : row.clientName}</strong>
				<span class="adm-muted">{row.entry.reason}</span>
			</span>
			<span class="adm-pill adm-pill--cancelled">{row.entry.severity}</span>
		</a>
	);
}

/** The canonical address of a page of the blacklist. */
export const blacklistHref = (pos: PageAt): string =>
	listHref("/settings/blacklist", [
		["page", pos.page],
		["size", pos.size],
	]);

const BLACKLIST_ID = "blacklist-region";

type Listed = { ok: true; page: Numbered<ListedClient> } | { ok: false };

async function readListed(ctx: Ctx, pos: PageAt): Promise<Listed> {
	try {
		return { ok: true, page: await ctx.port.blacklistPage(ctx.app, pos) };
	} catch {
		return { ok: false };
	}
}

const shownOf = (got: Listed, pos: PageAt): PageAt =>
	got.ok ? { page: got.page.page, size: pos.size } : pos;

/** The clients on the blacklist now, one numbered page (the service's page, their names in one batched read). */
function BlacklistRegion({ ctx, got, pos }: { ctx: Ctx; got: Listed; pos: PageAt }): JSX.Element {
	const o = at(ctx.locale);
	return (
		<section
			id={BLACKLIST_ID}
			class="adm-stack list-region"
			tabindex={-1}
			aria-label={areaText("blacklist", ctx.locale).title}
		>
			{!got.ok ? (
				<Banner tone="error" icon="alert">
					<strong>{m.error_title({}, o)}</strong>
				</Banner>
			) : got.page.total === 0 ? (
				<EmptyState icon="check" title={m.st_blacklist_empty({}, o)} />
			) : (
				<>
					<div class="adm-card client-list" id="blacklist-list">
						{got.page.items.map((row) => (
							<ListedRow key={row.entry.id} row={row} />
						))}
					</div>
					<ListPager
						ctx={ctx}
						id="blacklist-pager"
						nav={m.bl_pager_nav({}, o)}
						page={got.page.page}
						size={pos.size}
						total={got.page.total}
						href={(page, size) => blacklistHref({ page, size })}
						action="/settings/blacklist"
						params={{}}
					/>
				</>
			)}
		</section>
	);
}

async function renderBlacklist(ctx: Ctx, pos: PageAt): Promise<JSX.Element> {
	const got = await readListed(ctx, pos);
	const shown = shownOf(got, pos);
	return OrgFrame({
		ctx,
		area: "blacklist",
		title: areaText("blacklist", ctx.locale).title,
		children: (
			<>
				<ListHistory url={blacklistHref(shown)} />
				<BlacklistRegion ctx={ctx} got={got} pos={shown} />
			</>
		),
	});
}

export function registerOrgAreas(app: Hono<Env>): void {
	registerOrgProfile(app);
	registerMembers(app);
	app.get("/settings/blacklist", async (c) => {
		const ctx = c.var.ctx;
		const { at: pos, paging } = await pageRequested(ctx, c.req.query());
		if (!inPlace(c)) return c.html(await renderBlacklist(ctx, pos), 200, NOCACHE);
		const got = await readListed(ctx, pos);
		const shown = shownOf(got, pos);
		return patchList({
			c,
			elements: [<BlacklistRegion key="region" ctx={ctx} got={got} pos={shown} />],
			regionId: BLACKLIST_ID,
			url: blacklistHref(shown),
			asked: paging,
		});
	});
	for (const area of ORG_AREAS.filter((a) => !a.built))
		app.get(area.href, async (c) => c.html(await renderSoonArea(c.var.ctx, area), 200, NOCACHE));
	// The old addresses keep working.
	app.get("/audit", (c) => c.redirect("/settings/audit", 302));
	app.get("/admin", (c) => c.redirect("/settings", 302));
}
