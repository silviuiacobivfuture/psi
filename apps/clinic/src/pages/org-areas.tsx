import { Banner, EmptyState } from "@psi/ui/admin";
import type { Hono } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Env } from "../app";
import { areaText } from "../lib/area-labels";
import { ORG_AREAS } from "../lib/areas";
import type { Ctx } from "../lib/context";
import { at } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import { renderAudit } from "./audit";
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

async function renderBlacklist(ctx: Ctx): Promise<JSX.Element> {
	const o = at(ctx.locale);
	let body: JSX.Element;
	try {
		const [rows, clients] = await Promise.all([
			ctx.port.clientSummaries(ctx.app, "current", ""),
			ctx.port.clients(ctx.app, "current", ""),
		]);
		const listed = rows.flatMap((r) =>
			r.blacklist === null ? [] : [{ entry: r.blacklist, id: r.clientId }],
		);
		body =
			listed.length === 0 ? (
				<EmptyState icon="check" title={m.st_blacklist_empty({}, o)} />
			) : (
				<div class="adm-card client-list">
					{listed.map(({ entry, id }) => (
						<a key={entry.id} class="client-row" href={`/clients/${id}`}>
							<span class="client-row__main">
								<strong>{clients.find((c) => c.id === id)?.name ?? id}</strong>
								<span class="adm-muted">{entry.reason}</span>
							</span>
							<span class="adm-pill adm-pill--cancelled">{entry.severity}</span>
						</a>
					))}
				</div>
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
	app.get("/settings/blacklist", async (c) =>
		c.html(await renderBlacklist(c.var.ctx), 200, NOCACHE),
	);
	app.get("/settings/audit", async (c) => c.html(await renderAudit(c.var.ctx), 200, NOCACHE));
	for (const area of ORG_AREAS.filter((a) => !a.built))
		app.get(area.href, async (c) => c.html(await renderSoonArea(c.var.ctx, area), 200, NOCACHE));
	// The old addresses keep working.
	app.get("/audit", (c) => c.redirect("/settings/audit", 302));
	app.get("/admin", (c) => c.redirect("/settings", 302));
}
