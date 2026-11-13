import { EmptyState, Icon, PageHeader, SubNav, type SubNavGroup } from "@psi/ui/admin";
import type { Hono } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Env } from "../app";
import { Page } from "../chrome";
import { areaText, groupText } from "../lib/area-labels";
import { AREA_GROUPS, type OrgAreaDef, openAreas } from "../lib/areas";
import type { Ctx } from "../lib/context";
import { at } from "../lib/i18n";
import { m } from "../paraglide/messages.js";

export const orgGroups = (ctx: Ctx): ReadonlyArray<SubNavGroup> =>
	AREA_GROUPS.map((g) => ({
		key: g,
		label: groupText(g, ctx.locale),
		items: openAreas(ctx.can)
			.filter((a) => a.group === g)
			.map((a) => ({
				key: a.id,
				label: areaText(a.id, ctx.locale).title,
				hint: areaText(a.id, ctx.locale).hint,
				href: a.href,
				icon: a.icon,
			})),
	})).filter((g) => g.items.length > 0);

/** One organisation-settings screen: the grouped list beside it on a wide display, a way back to the list on a phone. */
export async function OrgFrame({
	ctx,
	area,
	title,
	children,
	overlays,
}: {
	ctx: Ctx;
	area: string;
	title: string;
	children: JSX.Element | JSX.Element[];
	overlays?: JSX.Element;
}): Promise<JSX.Element> {
	const o = at(ctx.locale);
	return Page({
		ctx,
		current: "settings",
		title,
		...(overlays === undefined ? {} : { overlays }),
		children: (
			<div class="adm-page">
				<div class="adm-settings">
					<div class="adm-settings__nav">
						<SubNav label={m.st_nav({}, o)} groups={orgGroups(ctx)} current={area} />
					</div>
					<div class="adm-stack" style="gap:var(--adm-section-gap)">
						<a class="adm-btn adm-btn--ghost adm-settings__back" href="/settings">
							<Icon name="chevron-left" />
							{m.st_back({}, o)}
						</a>
						<PageHeader title={title} />
						{children}
					</div>
				</div>
			</div>
		),
	});
}

export async function renderSettingsLanding(ctx: Ctx): Promise<JSX.Element> {
	const o = at(ctx.locale);
	const groups = orgGroups(ctx);
	return Page({
		ctx,
		current: "settings",
		title: m.st_title({}, o),
		children: (
			<div class="adm-page">
				<PageHeader title={m.st_title({}, o)} />
				<p class="adm-muted">{m.st_lead({}, o)}</p>
				{groups.length === 0 ? (
					<EmptyState icon="shield" title={m.st_empty({}, o)} />
				) : (
					<SubNav label={m.st_nav({}, o)} groups={groups} />
				)}
			</div>
		),
	});
}

/** An area the service cannot serve yet. */
export async function renderSoonArea(ctx: Ctx, area: OrgAreaDef): Promise<JSX.Element> {
	const o = at(ctx.locale);
	const t = areaText(area.id, ctx.locale);
	return OrgFrame({
		ctx,
		area: area.id,
		title: t.title,
		children: (
			<div class="adm-card">
				<EmptyState icon="clock" title={m.soon_title({}, o)} text={t.hint} />
			</div>
		),
	});
}

export function registerOrgSettings(app: Hono<Env>): void {
	app.get("/settings", async (c) =>
		c.html(await renderSettingsLanding(c.var.ctx), 200, { "cache-control": "private, no-store" }),
	);
}
