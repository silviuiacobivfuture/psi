import {
	AdminShell,
	Banner,
	Icon,
	type NavItem,
	type ShellApp,
	type ShellLabels,
} from "@psi/ui/admin";
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { AssistantPanel, AssistantTrigger } from "./assistant/slot";
import { Layout } from "./layout";
import type { Ctx } from "./lib/context";
import { worstFailure } from "./lib/failures";
import { settingsOpen } from "./lib/gates";
import { at, type Locale } from "./lib/i18n";
import { FailureState } from "./pages/failure";
import { m } from "./paraglide/messages.js";
import type { AppSlug } from "./port/schema";
import { RoleSwitcher } from "./role-switcher";

export type NavKey =
	| "calendar"
	| "floor"
	| "clients"
	| "requests"
	| "more"
	| "roster"
	| "reminders"
	| "settings"
	| "audit";

export function labels(locale: Locale): ShellLabels {
	const o = at(locale);
	return {
		skip: m.skip({}, o),
		brand: m.brand({}, o),
		mainNav: m.nav_main({}, o),
		tabs: m.nav_tabs({}, o),
		collapse: m.nav_collapse({}, o),
		search: m.search_label({}, o),
		searchPlaceholder: m.search_placeholder({}, o),
		openSearch: m.search_open({}, o),
		closeSearch: m.search_close({}, o),
		newAppointment: m.new_appointment({}, o),
		apps: m.apps_switch({}, o),
		account: m.account_menu({}, o),
		theme: m.theme_label({}, o),
		themeLight: m.theme_light({}, o),
		themeDark: m.theme_dark({}, o),
		themeSystem: m.theme_system({}, o),
		language: m.language_label({}, o),
		decoLabel: m.deco_label({}, o),
		decoOn: m.deco_on({}, o),
		decoOff: m.deco_off({}, o),
		signOut: m.sign_out({}, o),
		offline: m.offline_banner({}, o),
	};
}

/** A role's name for people: the seed roles are translated, a custom role shows its own id. */
export function roleName(id: string, locale: Locale): string {
	const o = at(locale);
	switch (
		id.replace(
			/^[a-z][a-z0-9-]*?-(?=owner$|admin$|reception$|therapist$|coordinator$|volunteer$|accountant$)/,
			"",
		)
	) {
		case "owner":
			return m.role_owner({}, o);
		case "admin":
			return m.role_admin({}, o);
		case "reception":
			return m.role_reception({}, o);
		case "therapist":
			return m.role_therapist({}, o);
		case "coordinator":
			return m.role_coordinator({}, o);
		case "volunteer":
			return m.role_volunteer({}, o);
		case "accountant":
			return m.role_accountant({}, o);
		default:
			return id;
	}
}

export const appName = (app: AppSlug, locale: Locale): string =>
	app === "psizone" ? m.app_psizone({}, at(locale)) : m.app_hemisync({}, at(locale));

export interface PageProps {
	ctx: Ctx;
	current: NavKey;
	title: string;
	children?: Child;
	overlays?: Child;
	/** The calendar: the navigation starts as a rail so the columns fill the screen. */
	wide?: boolean;
}

/** One signed-in page: the document and the responsive shell around the screen. */
export async function Page({
	ctx,
	current,
	title,
	children,
	overlays,
	wide,
}: PageProps): Promise<JSX.Element> {
	const { locale } = ctx;
	const o = at(locale);
	const { can } = ctx;
	let open = 0;
	if (can.has("web_requests_view")) {
		try {
			open = (await ctx.port.requests(ctx.app)).filter((r) => !r.handled).length;
		} catch {
			open = 0;
		}
	}
	// The service refused this screen for a reason a retry does not cure: say so instead of the empty or broken page.
	const refused = worstFailure(ctx.c);
	const shown =
		refused !== null && refused.code !== "unauthenticated" ? (
			<div class="adm-page">
				<FailureState error={refused} locale={locale} />
			</div>
		) : (
			children
		);
	const item = (key: NavKey, label: string, icon: NavItem["icon"], badge?: number): NavItem => ({
		key,
		label,
		href: `/${key === "more" ? "more" : key}`,
		icon,
		...(badge === undefined ? {} : { badge }),
	});
	// Only what this person may open: a menu entry for a screen the service would refuse is never offered.
	const settingsAllowed = settingsOpen(can);
	const offered: ReadonlyArray<NavItem | null> = [
		can.has("calendars_view") ? item("calendar", m.nav_calendar({}, o), "calendar") : null,
		can.has("calendars_view") ? item("floor", m.nav_floor({}, o), "sidebar") : null,
		can.has("clients_view") ? item("clients", m.nav_clients({}, o), "users") : null,
		can.has("web_requests_view") ? item("requests", m.nav_requests({}, o), "inbox", open) : null,
		can.has("roster_view") ? item("roster", m.nav_roster({}, o), "briefcase") : null,
		can.has("reminders_view") ? item("reminders", m.nav_reminders({}, o), "chat") : null,
		settingsAllowed ? item("settings", m.nav_settings({}, o), "settings") : null,
		can.has("audit_log_view") ? item("audit", m.nav_audit({}, o), "list") : null,
	];
	const nav = offered.filter((n): n is NavItem => n !== null);
	const moreKeys: NavKey[] = ["floor", "roster", "reminders", "settings", "audit"];
	const hasMore = nav.some((n) => moreKeys.includes(n.key as NavKey));
	const tabs: NavItem[] = [
		...nav.filter((n) => ["calendar", "clients", "requests"].includes(n.key)),
		...(hasMore ? [item("more", m.nav_more({}, o), "more")] : []),
	];
	const bell = ctx.notifications === undefined ? null : await ctx.notifications.bell(ctx);
	const apps: ShellApp[] = ctx.memberships.map((mb) => ({
		slug: mb.app,
		name: appName(mb.app, locale),
		href: `/switch/${mb.app}`,
	}));
	const effective: NavKey = moreKeys.includes(current) ? "more" : current;
	return (
		<Layout
			locale={locale}
			theme={ctx.theme}
			title={`${title} · ${m.brand({}, o)}`}
			head={ctx.pwa.head(locale)}
		>
			<AdminShell
				app={ctx.app}
				apps={apps}
				nav={nav}
				tabs={tabs}
				current={current}
				tabCurrent={effective}
				title={title}
				user={{ name: ctx.person.name, email: ctx.person.email }}
				labels={labels(locale)}
				newAppointmentHref={can.write("appointments_create") ? "/calendar?new=1" : undefined}
				rail={wide === true}
				prefsAction="/prefs"
				signOutAction={ctx.signOut}
				extras={
					<>
						<div class="adm-menu__item adm-muted" data-who>
							{ctx.caps.roles.map((r) => roleName(r, locale)).join(", ")} ·{" "}
							{appName(ctx.app, locale)}
						</div>
						{ctx.mayViewAs || ctx.viewAs !== null ? (
							<a class="adm-menu__item" href="/view-as">
								<Icon name="shield" />
								{m.view_as_menu({}, o)}
							</a>
						) : null}
						{ctx.pwa.tools(locale)}
					</>
				}
				topStatus={
					<>
						<AssistantTrigger ctx={ctx} />
						<RoleSwitcher
							ctx={ctx}
							mine={ctx.caps.roles.map((r) => roleName(r, locale)).join(", ")}
						/>
						{bell}
					</>
				}
				locale={locale}
				themePref={ctx.pref}
				deco={ctx.deco}
				searchAction="/search"
				overlays={
					<>
						{overlays}
						<AssistantPanel ctx={ctx} />
					</>
				}
			>
				{ctx.viewAs === null ? null : (
					<form method="post" action="/view-as/stop" data-view-as-banner>
						<Banner tone="info" icon="shield">
							<span>{m.view_as_banner({ name: ctx.viewAs.label }, o)}</span>{" "}
							<button class="adm-btn" type="submit">
								{m.view_as_exit({}, o)}
							</button>
						</Banner>
					</form>
				)}
				{shown}
			</AdminShell>
		</Layout>
	);
}
