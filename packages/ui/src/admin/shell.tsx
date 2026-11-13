/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { cx } from "../cx";
import { type AdminIcon, Icon } from "./icons";

export interface NavItem {
	key: string;
	label: string;
	href: string;
	icon: AdminIcon;
	/** A count shown on the tab (open requests). */
	badge?: number;
}

export interface ShellApp {
	slug: "psizone" | "hemisync";
	name: string;
	href: string;
}

export interface ShellUser {
	name: string;
	email: string | null;
}

export interface ShellLabels {
	skip: string;
	brand: string;
	mainNav: string;
	tabs: string;
	collapse: string;
	search: string;
	searchPlaceholder: string;
	openSearch: string;
	closeSearch: string;
	newAppointment: string;
	apps: string;
	account: string;
	theme: string;
	themeLight: string;
	themeDark: string;
	themeSystem: string;
	language: string;
	decoLabel: string;
	decoOn: string;
	decoOff: string;
	signOut: string;
	offline: string;
}

export interface ShellProps {
	/** The active app tints the console. */
	app: ShellApp["slug"];
	apps: ReadonlyArray<ShellApp>;
	nav: ReadonlyArray<NavItem>;
	/** The phone's bottom tabs: Calendar, Clients, Requests, More. */
	tabs: ReadonlyArray<NavItem>;
	current: string;
	/** The tab to mark when it differs from `current` (a page under More). */
	tabCurrent?: string;
	title: string;
	user: ShellUser;
	labels: ShellLabels;
	newAppointmentHref: string;
	/** Where the preference form posts (theme, language) and the sign-out form. */
	/** Start with the navigation as an icon rail (the calendar wants the width). */
	rail?: boolean;
	prefsAction: string;
	signOutAction: string;
	locale: "ro" | "en";
	themePref: "light" | "dark" | "system";
	/** Decorative background (the emblem's linework) behind the pages; off by default. */
	deco: boolean;
	searchAction: string;
	/** Cross-site-request guard value is not needed: the server checks Origin. */
	children?: Child;
	/** Overlays rendered beside the page: sheets. */
	overlays?: Child;
}

const initials = (name: string): string =>
	name
		.split(/\s+/)
		.filter((w) => w !== "")
		.slice(0, 2)
		.map((w) => Array.from(w)[0] ?? "")
		.join("")
		.toUpperCase();

function NavLink({ item, current }: { item: NavItem; current: string }): JSX.Element {
	return (
		<li>
			<a
				class="adm-nav__link"
				href={item.href}
				aria-current={item.key === current ? "page" : undefined}
				title={item.label}
				data-tip={item.label}
			>
				<Icon name={item.icon} />
				<span class="adm-label">{item.label}</span>
			</a>
		</li>
	);
}

function AppSwitcher({
	apps,
	active,
	label,
}: {
	apps: ReadonlyArray<ShellApp>;
	active: ShellApp["slug"];
	label: string;
}): JSX.Element {
	const here = apps.find((a) => a.slug === active);
	return (
		<div
			class="adm-menu"
			data-signals="{appMenu:false}"
			data-on:keydown="evt.key === 'Escape' && ($appMenu = false)"
		>
			<button
				type="button"
				class={`adm-menu__item adm-switch adm-switch--${active}`}
				aria-haspopup="true"
				aria-label={label}
				data-attr:aria-expanded="$appMenu"
				data-on:click="$appMenu = !$appMenu"
			>
				<span class={`adm-dot adm-dot--${active}`} />
				<span class="adm-app-mono" aria-hidden="true">
					{Array.from(here?.name ?? label)[0]}
				</span>
				<span class="adm-label">{here?.name ?? label}</span>
				<Icon name="chevron-down" />
			</button>
			<div
				class="adm-menu__panel adm-menu__panel--left"
				data-show="$appMenu"
				style="display:none"
				role="menu"
				aria-label={label}
			>
				{apps.map((a) => (
					<a
						key={a.slug}
						class="adm-menu__item"
						role="menuitem"
						href={a.href}
						aria-current={a.slug === active ? "true" : undefined}
					>
						<span class={`adm-dot adm-dot--${a.slug}`} />
						{a.name}
					</a>
				))}
			</div>
		</div>
	);
}

function PrefButton({
	name,
	value,
	active,
	children,
}: {
	name: string;
	value: string;
	active: boolean;
	children: Child;
}): JSX.Element {
	return (
		<button
			class="adm-seg__item"
			type="submit"
			name={name}
			value={value}
			aria-pressed={active ? "true" : "false"}
		>
			{children}
		</button>
	);
}

function UserMenu(
	p: Pick<
		ShellProps,
		"user" | "labels" | "prefsAction" | "signOutAction" | "locale" | "themePref" | "deco"
	>,
): JSX.Element {
	const { user, labels: l } = p;
	return (
		<div
			class="adm-menu"
			data-signals="{userMenu:false}"
			data-on:keydown="evt.key === 'Escape' && ($userMenu = false)"
		>
			<button
				type="button"
				class="adm-iconbtn"
				aria-haspopup="true"
				aria-label={l.account}
				data-attr:aria-expanded="$userMenu"
				data-on:click="$userMenu = !$userMenu"
			>
				<span class="adm-avatar">{initials(user.name)}</span>
			</button>
			<div class="adm-menu__panel" data-show="$userMenu" style="display:none">
				<div class="adm-stack" style="padding:var(--space-2) var(--space-3)">
					<strong>{user.name}</strong>
					{user.email === null ? null : <span class="adm-muted">{user.email}</span>}
				</div>
				<div class="adm-menu__sep" />
				<form
					method="post"
					action={p.prefsAction}
					class="adm-stack"
					style="padding:0 var(--space-2)"
				>
					<span class="adm-muted" id="adm-theme-label">
						{l.theme}
					</span>
					<fieldset class="adm-seg" aria-labelledby="adm-theme-label">
						<PrefButton name="theme" value="light" active={p.themePref === "light"}>
							{l.themeLight}
						</PrefButton>
						<PrefButton name="theme" value="dark" active={p.themePref === "dark"}>
							{l.themeDark}
						</PrefButton>
						<PrefButton name="theme" value="system" active={p.themePref === "system"}>
							{l.themeSystem}
						</PrefButton>
					</fieldset>
					<span class="adm-muted" id="adm-lang-label">
						{l.language}
					</span>
					<fieldset class="adm-seg" aria-labelledby="adm-lang-label">
						<PrefButton name="lang" value="ro" active={p.locale === "ro"}>
							RO
						</PrefButton>
						<PrefButton name="lang" value="en" active={p.locale === "en"}>
							EN
						</PrefButton>
					</fieldset>
					<span class="adm-muted" id="adm-deco-label">
						{l.decoLabel}
					</span>
					<fieldset class="adm-seg" aria-labelledby="adm-deco-label">
						<PrefButton name="deco" value="off" active={!p.deco}>
							{l.decoOff}
						</PrefButton>
						<PrefButton name="deco" value="on" active={p.deco}>
							{l.decoOn}
						</PrefButton>
					</fieldset>
				</form>
				<div class="adm-menu__sep" />
				<form method="post" action={p.signOutAction}>
					<button class="adm-menu__item" type="submit">
						<Icon name="logout" />
						{l.signOut}
					</button>
				</form>
			</div>
		</div>
	);
}

/** The console's frame: side navigation, top bar, bottom tabs and the floating action. */
export function AdminShell(p: ShellProps): JSX.Element {
	const { labels: l } = p;
	return (
		<div
			class={cx("adm", p.rail === true && "is-collapsed")}
			data-app={p.app}
			data-deco={p.deco ? "on" : "off"}
			data-signals={`{navCollapsed:${p.rail === true},searchOpen:false,q:'',offline:false,fabSmall:false}`}
			{...{ "data-on:scroll__window__throttle.100ms": "$fabSmall = window.scrollY > 24" }}
			data-class:is-collapsed="$navCollapsed"
			data-init="try { const r = localStorage.getItem('adm-rail'); if (r !== null) $navCollapsed = r === 'true' } catch (e) {}"
			data-effect="try { localStorage.setItem('adm-rail', String($navCollapsed)) } catch (e) {}"
			data-class:is-offline="$offline"
			data-on:online__window="$offline = false"
			data-on:offline__window="$offline = true"
		>
			<a class="adm-skip" href="#adm-content">
				{l.skip}
			</a>
			<aside class="adm-nav adm-noprint" aria-label={l.mainNav}>
				<a class="adm-brand" href="/" aria-label={l.brand}>
					<span class="adm-brand__mark" aria-hidden="true" />
					<span class="adm-brand__name">{l.brand}</span>
				</a>
				<AppSwitcher apps={p.apps} active={p.app} label={l.apps} />
				<nav aria-label={l.mainNav}>
					<ul class="adm-nav__list">
						{p.nav.map((item) => (
							<NavLink key={item.key} item={item} current={p.current} />
						))}
					</ul>
				</nav>

				<div class="adm-nav__foot">
					<button
						type="button"
						class="adm-rail-toggle"
						aria-label={l.collapse}
						data-attr:aria-pressed="$navCollapsed"
						data-on:click="$navCollapsed = !$navCollapsed"
					>
						<span data-show="!$navCollapsed">
							<Icon name="chevron-left" />
						</span>
						<span data-show="$navCollapsed" style="display:none">
							<Icon name="chevron-right" />
						</span>
						<span class="adm-label">{l.collapse}</span>
					</button>
				</div>
			</aside>
			<div class="adm-main">
				<header class="adm-top adm-noprint">
					<div class="adm-top__phone">
						<AppSwitcher apps={p.apps} active={p.app} label={l.apps} />
					</div>
					<h1 class="adm-top__title">{p.title}</h1>
					<button
						type="button"
						class="adm-iconbtn adm-search-toggle"
						aria-label={l.openSearch}
						data-on:click="$searchOpen = true"
					>
						<Icon name="search" />
					</button>
					<form
						class="adm-search"
						action={p.searchAction}
						method="get"
						data-class:adm-search--open="$searchOpen"
						data-on:keydown="evt.key === 'Escape' && ($searchOpen = false)"
					>
						<Icon name="search" />
						<label class="adm-sr" for="adm-q">
							{l.search}
						</label>
						<input
							id="adm-q"
							class="adm-input"
							type="search"
							name="q"
							autocomplete="off"
							placeholder={l.searchPlaceholder}
							data-bind:q
							{...{ "data-on:input__debounce.250ms": `@get('${p.searchAction}/live')` }}
						/>
						<div id="adm-search-results" class="adm-search__results" aria-live="polite" />
					</form>
					<UserMenu
						user={p.user}
						labels={l}
						prefsAction={p.prefsAction}
						signOutAction={p.signOutAction}
						locale={p.locale}
						themePref={p.themePref}
						deco={p.deco}
					/>
				</header>
				<div class="adm-banner adm-banner--offline adm-offline-flag adm-noprint" role="status">
					<Icon name="wifi-off" />
					<span>{l.offline}</span>
				</div>
				<main id="adm-content" class="adm-content" tabindex={-1}>
					{p.children}
				</main>
			</div>
			<nav class="adm-tabs adm-noprint" aria-label={l.tabs}>
				{p.tabs.map((t) => (
					<a
						key={t.key}
						class="adm-tab"
						href={t.href}
						aria-current={t.key === (p.tabCurrent ?? p.current) ? "page" : undefined}
					>
						<Icon name={t.icon} />
						<span>{t.label}</span>
						{t.badge === undefined || t.badge === 0 ? null : (
							<span class="adm-badge">{t.badge}</span>
						)}
					</a>
				))}
			</nav>
			<a
				class={cx("adm-fab", "adm-noprint")}
				href={p.newAppointmentHref}
				aria-label={l.newAppointment}
				data-class:adm-fab--small="$fabSmall"
			>
				<Icon name="plus" />
				<span class="adm-fab__label">{l.newAppointment}</span>
			</a>
			<div id="adm-toasts" class="adm-toasts" role="status" aria-live="polite" />
			{p.overlays}
		</div>
	);
}
