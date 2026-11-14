import { Banner, EmptyState } from "@psi/ui/admin";
import type { Hono } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Env } from "../app";
import { areaText } from "../lib/area-labels";
import { ORG_AREAS } from "../lib/areas";
import type { Ctx } from "../lib/context";
import { at } from "../lib/i18n";
import { appendPage, MoreQuery, moreHref, ShowMore } from "../lib/show-more";
import { m } from "../paraglide/messages.js";
import type { ListedClient } from "../port/port";
import { registerMembers } from "./members-routes";
import { OrgFrame, renderSoonArea } from "./org-settings";

const NOCACHE = { "cache-control": "private, no-store" } as const;

function Fact({ label, value }: { label: string; value: string }): JSX.Element {
	return (
		<div class="adm-stack">
			<span class="adm-muted">{label}</span>
			<strong>{value}</strong>
		</div>
	);
}

async function renderProfile(ctx: Ctx): Promise<JSX.Element> {
	const o = at(ctx.locale);
	return OrgFrame({
		ctx,
		area: "profile",
		title: areaText("profile", ctx.locale).title,
		children: (
			<div class="adm-card adm-stack" style="gap:var(--space-4)">
				<Fact label={m.st_profile_name({}, o)} value={ctx.caps.appName} />
				<Fact label={m.st_profile_zone({}, o)} value={ctx.caps.timeZone} />
				<Fact label={m.st_profile_slug({}, o)} value={ctx.app} />
			</div>
		),
	});
}

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

function MoreListed({
	ctx,
	cursor,
	shown,
}: {
	ctx: Ctx;
	cursor: string | null;
	shown: number;
}): JSX.Element {
	return (
		<ShowMore
			id="blacklist-more"
			href={moreHref("/settings/blacklist/more", cursor, shown)}
			label={m.ls_more({}, at(ctx.locale))}
		/>
	);
}

/** The clients on the blacklist now, a page at a time (the service's page, their names in one batched read). */
async function renderBlacklist(ctx: Ctx): Promise<JSX.Element> {
	const o = at(ctx.locale);
	let body: JSX.Element;
	try {
		const page = await ctx.port.blacklistPage(ctx.app, null);
		body =
			page.items.length === 0 ? (
				<EmptyState icon="check" title={m.st_blacklist_empty({}, o)} />
			) : (
				<>
					<div class="adm-card client-list" id="blacklist-list">
						{page.items.map((row) => (
							<ListedRow key={row.entry.id} row={row} />
						))}
					</div>
					<MoreListed ctx={ctx} cursor={page.nextCursor} shown={page.items.length} />
				</>
			);
	} catch {
		body = (
			<Banner tone="error" icon="alert">
				<strong>{m.error_title({}, o)}</strong>
			</Banner>
		);
	}
	return OrgFrame({
		ctx,
		area: "blacklist",
		title: areaText("blacklist", ctx.locale).title,
		children: body,
	});
}

export function registerOrgAreas(app: Hono<Env>): void {
	app.get("/settings/profile", async (c) => c.html(await renderProfile(c.var.ctx), 200, NOCACHE));
	registerMembers(app);
	app.get("/settings/blacklist", async (c) =>
		c.html(await renderBlacklist(c.var.ctx), 200, NOCACHE),
	);
	// The next page of the blacklist, appended to the open list.
	app.get("/settings/blacklist/more", async (c) => {
		const ctx = c.var.ctx;
		const asked = MoreQuery.parse(c.req.query());
		const page = await ctx.port.blacklistPage(ctx.app, asked.cursor === "" ? null : asked.cursor);
		return appendPage({
			list: "#blacklist-list",
			rows: page.items.map((row) => <ListedRow key={row.entry.id} row={row} />),
			more: (
				<MoreListed ctx={ctx} cursor={page.nextCursor} shown={asked.shown + page.items.length} />
			),
		});
	});
	for (const area of ORG_AREAS.filter((a) => !a.built))
		app.get(area.href, async (c) => c.html(await renderSoonArea(c.var.ctx, area), 200, NOCACHE));
	// The old addresses keep working.
	app.get("/audit", (c) => c.redirect("/settings/audit", 302));
	app.get("/admin", (c) => c.redirect("/settings", 302));
}
