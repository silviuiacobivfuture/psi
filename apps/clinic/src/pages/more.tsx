import { type AdminIcon, Icon } from "@psi/ui/admin";
import { Page } from "../chrome";
import type { Ctx } from "../lib/context";
import { at } from "../lib/i18n";
import { m } from "../paraglide/messages.js";

/** The phone's fourth tab: everything the bottom bar has no room for. */
export async function MorePage(ctx: Ctx) {
	const o = at(ctx.locale);
	const items: ReadonlyArray<{ href: string; label: string; icon: AdminIcon }> = [
		{ href: "/roster", label: m.nav_roster({}, o), icon: "briefcase" },
		{ href: "/reminders", label: m.nav_reminders({}, o), icon: "chat" },
		{ href: "/settings", label: m.nav_settings({}, o), icon: "settings" },
		{ href: "/audit", label: m.nav_audit({}, o), icon: "list" },
	];
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
