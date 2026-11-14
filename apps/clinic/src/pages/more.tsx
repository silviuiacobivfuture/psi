import { type AdminIcon, Icon } from "@psi/ui/admin";
import { Page } from "../chrome";
import { orgSettingsOpen, PLATFORM_KEY } from "../lib/areas";
import type { Ctx } from "../lib/context";
import { at } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import { wholeAppRecordViews } from "./records-without-client";

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
			open: orgSettingsOpen(can),
		},
		{ href: "/me/settings", label: m.nav_me({}, o), icon: "user", open: true },
		{
			href: "/platform",
			label: m.nav_platform({}, o),
			icon: "shield",
			open: can.has(PLATFORM_KEY),
		},
		{
			href: "/stats",
			label: m.nav_stats({}, o),
			icon: "chart",
			open: can.has("reports_view_core"),
		},
		{
			href: "/records",
			label: m.orphan_records_title({}, o),
			icon: "file",
			open: wholeAppRecordViews(can).size > 0,
		},
		{ href: "/me/profile", label: m.menu_profile({}, o), icon: "user", open: true },
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
						<a key={i.href} class="adm-card adm-row" href={i.href} data-more={i.href}>
							<Icon name={i.icon} />
							<strong>{i.label}</strong>
						</a>
					))}
				</div>
			</div>
		),
	});
}
