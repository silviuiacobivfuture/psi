import { EmptyState, Icon, PageHeader } from "@psi/ui/admin";
import type { Hono } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Env } from "../app";
import { appName, Page } from "../chrome";
import type { Ctx } from "../lib/context";
import { at } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import { AppSlugSchema } from "../port/schema";

/** ADMINISTRARE PLATFORMĂ: the estate owner's own zone; only a platform administrator reaches it. */
export async function renderPlatform(ctx: Ctx): Promise<JSX.Element> {
	const o = at(ctx.locale);
	return Page({
		ctx,
		current: "platform",
		title: m.pl_title({}, o),
		children: (
			<div class="adm-page">
				<PageHeader title={m.pl_title({}, o)} />
				<p class="adm-muted">{m.pl_lead({}, o)}</p>
				<section class="adm-stack">
					<h2 class="adm-h2">{m.pl_orgs({}, o)}</h2>
					<div class="adm-grid">
						{AppSlugSchema.options.map((slug) => (
							<a key={slug} class="adm-card adm-row" href={`/switch/${slug}`} data-org={slug}>
								<Icon name="briefcase" />
								<strong>{appName(slug, ctx.locale)}</strong>
								<span class="adm-muted">{m.pl_org_open({}, o)}</span>
							</a>
						))}
					</div>
				</section>
				<section class="adm-card">
					<h2 class="adm-h2">{m.pl_integrations({}, o)}</h2>
					<EmptyState icon="clock" title={m.pl_soon({}, o)} text={m.pl_integrations_soon({}, o)} />
				</section>
			</div>
		),
	});
}

export function registerPlatform(app: Hono<Env>): void {
	app.get("/platform", async (c) =>
		c.html(await renderPlatform(c.var.ctx), 200, { "cache-control": "private, no-store" }),
	);
}
