import { type AdminIcon, EmptyState, Icon, PageHeader } from "@psi/ui/admin";
import type { Hono } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Env } from "../app";
import { Page } from "../chrome";
import type { Ctx } from "../lib/context";
import { ADMIN_AREAS } from "../lib/gates";
import { at } from "../lib/i18n";
import { m } from "../paraglide/messages.js";

type AreaId = (typeof ADMIN_AREAS)[number]["id"];

const ICONS: Readonly<Record<AreaId, AdminIcon>> = {
	roles: "shield",
	members: "users",
	plan: "sidebar",
	services: "list",
	rooms: "sidebar",
	devices: "settings",
	floor: "sidebar",
	audit: "list",
};

/** The administration zone's landing: a card per area this person may open, a single column on a phone. */
export async function renderAdmin(ctx: Ctx): Promise<JSX.Element> {
	const o = at(ctx.locale);
	const label = (id: AreaId): { title: string; hint: string } => {
		switch (id) {
			case "roles":
				return { title: m.admin_roles({}, o), hint: m.admin_roles_hint({}, o) };
			case "members":
				return { title: m.admin_members({}, o), hint: m.admin_members_hint({}, o) };
			case "plan":
				return { title: m.admin_plan({}, o), hint: m.admin_plan_hint({}, o) };
			case "services":
				return { title: m.admin_services({}, o), hint: m.admin_services_hint({}, o) };
			case "rooms":
				return { title: m.admin_rooms({}, o), hint: m.admin_rooms_hint({}, o) };
			case "devices":
				return { title: m.admin_devices({}, o), hint: m.admin_devices_hint({}, o) };
			case "floor":
				return { title: m.admin_floor({}, o), hint: m.admin_floor_hint({}, o) };
			case "audit":
				return { title: m.admin_audit({}, o), hint: m.admin_audit_hint({}, o) };
			default: {
				const never: never = id;
				return { title: String(never), hint: "" };
			}
		}
	};
	const open = ADMIN_AREAS.filter((a) => ctx.can.has(a.key));
	return Page({
		ctx,
		current: "admin",
		title: m.admin_title({}, o),
		children: (
			<div class="adm-page">
				<PageHeader title={m.admin_title({}, o)} />
				<p class="adm-muted">{m.admin_lead({}, o)}</p>
				{open.length === 0 ? (
					<EmptyState icon="shield" title={m.admin_empty({}, o)} />
				) : (
					<div class="adm-admin-grid">
						{open.map((a) => {
							const text = label(a.id);
							return (
								<a key={a.id} class="adm-card adm-admin-card" href={a.href} data-admin-area={a.id}>
									<Icon name={ICONS[a.id]} />
									<span class="adm-admin-card__text">
										<strong>{text.title}</strong>
										<span class="adm-muted">{text.hint}</span>
									</span>
								</a>
							);
						})}
					</div>
				)}
			</div>
		),
	});
}

export function registerAdmin(app: Hono<Env>): void {
	app.get("/admin", async (c) =>
		c.html(await renderAdmin(c.var.ctx), 200, { "cache-control": "private, no-store" }),
	);
}
