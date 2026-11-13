import { type AdminIcon, Icon } from "@psi/ui/admin";
import { Page } from "../chrome";
import type { Ctx } from "../lib/context";
import { settingsOpen } from "../lib/gates";
import { at } from "../lib/i18n";
import { m } from "../paraglide/messages.js";

/** The phone's fourth tab: everything the bottom bar has no room for. */
export async function MorePage(ctx: Ctx) {
	const o = at(ctx.locale);
	const { can } = ctx;
	const all: ReadonlyArray<{ href: string; label: string; icon: AdminIcon; open: boolean }> = [
		{
			href: "/floor",
			label: m.nav_floor({}, o),
			icon: "sidebar",
			open: can.has("calendars_view"),
		},
		{
			href: "/roster",
			label: m.nav_roster({}, o),
			icon: "briefcase",
			open: can.has("roster_view"),
		},
		{
			href: "/reminders",
			label: m.nav_reminders({}, o),
			icon: "chat",
			open: can.has("reminders_view"),
		},
		{
			href: "/settings",
			label: m.nav_settings({}, o),
			icon: "settings",
			open: settingsOpen(can),
		},
		{ href: "/audit", label: m.nav_audit({}, o), icon: "list", open: can.has("audit_log_view") },
	];
	const items = all.filter((i) => i.open);
	return Page({
		ctx,
		current: "more",
		title: m.more_title({}, o),
		children: (
			<div class="adm-page">
				<p class="adm-muted">{m.more_lead({}, o)}</p>
				<div class="adm-grid">
					{items.map((i) => (
						<a
							key={i.href}
							class="adm-card adm-row"
							href={i.href}
							style="min-height:var(--adm-touch);text-decoration:none"
						>
							<Icon name={i.icon} />
							<strong>{i.label}</strong>
						</a>
					))}
				</div>
			</div>
		),
	});
}
