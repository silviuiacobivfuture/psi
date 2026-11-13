import { AdminShell, type NavItem, type ShellApp, type ShellLabels } from "@psi/ui/admin";
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { Layout } from "./layout";
import type { Ctx } from "./lib/context";
import { at, type Locale } from "./lib/i18n";
import { m } from "./paraglide/messages.js";
import type { AppSlug } from "./port/schema";
import { pwa } from "./pwa";

export type NavKey =
	| "calendar"
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
		signOut: m.sign_out({}, o),
		offline: m.offline_banner({}, o),
	};
}

export const appName = (app: AppSlug, locale: Locale): string =>
	app === "psizone" ? m.app_psizone({}, at(locale)) : m.app_hemisync({}, at(locale));

export interface PageProps {
	ctx: Ctx;
	current: NavKey;
	title: string;
	children?: Child;
	overlays?: Child;
}

/** One signed-in page: the document and the responsive shell around the screen. */
export async function Page({
	ctx,
	current,
	title,
	children,
	overlays,
}: PageProps): Promise<JSX.Element> {
	const { locale } = ctx;
	const o = at(locale);
	let open = 0;
	try {
		open = (await ctx.port.requests(ctx.app)).filter((r) => !r.handled).length;
	} catch {
		open = 0;
	}
	const item = (key: NavKey, label: string, icon: NavItem["icon"], badge?: number): NavItem => ({
		key,
		label,
		href: `/${key === "more" ? "more" : key}`,
		icon,
		...(badge === undefined ? {} : { badge }),
	});
	const nav: NavItem[] = [
		item("calendar", m.nav_calendar({}, o), "calendar"),
		item("clients", m.nav_clients({}, o), "users"),
		item("requests", m.nav_requests({}, o), "inbox", open),
		item("roster", m.nav_roster({}, o), "briefcase"),
		item("reminders", m.nav_reminders({}, o), "chat"),
		item("settings", m.nav_settings({}, o), "settings"),
		item("audit", m.nav_audit({}, o), "list"),
	];
	const tabs: NavItem[] = [nav[0], nav[1], nav[2], item("more", m.nav_more({}, o), "more")].filter(
		(n): n is NavItem => n !== undefined,
	);
	const apps: ShellApp[] = ctx.memberships.map((mb) => ({
		slug: mb.app,
		name: appName(mb.app, locale),
		href: `/switch/${mb.app}`,
	}));
	const moreKeys: NavKey[] = ["roster", "reminders", "settings", "audit"];
	const effective: NavKey = moreKeys.includes(current) ? "more" : current;
	return (
		<Layout
			locale={locale}
			theme={ctx.theme}
			title={`${title} · ${m.brand({}, o)}`}
			head={pwa.head(locale)}
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
				newAppointmentHref="/calendar?new=1"
				prefsAction="/prefs"
				signOutAction="/sign-out"
				locale={locale}
				themePref={ctx.pref}
				searchAction="/search"
				overlays={overlays}
			>
				{children}
			</AdminShell>
		</Layout>
	);
}
