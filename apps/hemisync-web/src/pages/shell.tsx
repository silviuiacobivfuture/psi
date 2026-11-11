import { AmbientField, Button, Logo, StatusBadge } from "@psi/ui";
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, base, type Locale } from "../i18n";
import { Layout } from "../layout";
import { m } from "../paraglide/messages.js";
import { Footer } from "../sections/closing";
import { Header } from "../sections/header";
import type { Theme } from "../theme";

/** What every page beyond the home receives from its route. */
export interface PageProps {
	locale: Locale;
	theme: Theme;
	origin: string;
}

/** The frame of an inner page: compass and footer as on the home; `otherHref` is the same page in the other language. */
export function PageShell({
	locale,
	theme,
	origin,
	otherHref,
	title,
	description,
	children,
}: PageProps & {
	otherHref: string;
	title: string;
	description: string;
	children: Child;
}): JSX.Element {
	const other: Locale = locale === "ro" ? "en" : "ro";
	return (
		<Layout
			locale={locale}
			theme={theme}
			title={m.page_title({ title }, at(locale))}
			description={description}
			alternate={{ locale: other, href: `${origin}${otherHref}` }}
		>
			<Header locale={locale} otherHref={otherHref} />
			<main id="continut">{children}</main>
			<Footer locale={locale} />
		</Layout>
	);
}

/**
 * The page's one H1 in the dawn mist, with the logo (on the home it sits in the hero's sky).
 * New copy carries a visible draft badge until the owner signs it off.
 */
export function PageHero({
	locale,
	overline,
	title,
	lead,
	draft = true,
	children,
}: {
	locale: Locale;
	overline: string;
	title: string;
	lead?: string;
	draft?: boolean;
	children?: Child;
}): JSX.Element {
	const o = at(locale);
	return (
		<AmbientField intensity="low" class="rounded-b-[48px]">
			<div class="mx-auto max-w-7xl px-6 pb-20 pt-8 md:px-14 md:pb-28 md:pt-10">
				<Logo size={30} href={`${base(locale)}/`} />
				<p class="hs-overline mt-16 md:mt-24">{overline}</p>
				<h1 class="display mt-5 max-w-4xl text-display-lg text-ink">{title}</h1>
				{lead ? <p class="mt-6 max-w-2xl text-pretty text-body-lg text-ink-muted">{lead}</p> : null}
				{draft ? (
					<StatusBadge tone="warning" class="mt-8">
						{m.draft_badge({}, o)}
					</StatusBadge>
				) : null}
				{children}
			</div>
		</AmbientField>
	);
}

/** Content only the owner can supply: said plainly where it will go, never invented. */
export function Pending({ locale, children }: { locale: Locale; children: Child }): JSX.Element {
	return (
		<div class="rounded-[20px] border border-dashed border-line p-6">
			<StatusBadge tone="info">{m.pending_badge({}, at(locale))}</StatusBadge>
			<p class="mt-4 max-w-2xl text-body-sm text-ink-muted">{children}</p>
		</div>
	);
}

/** A titled band of the page: overline and heading on the left, content on the right. */
export function Band({
	id,
	overline,
	title,
	children,
	wash = false,
}: {
	id?: string;
	overline: string;
	title: string;
	children: Child;
	wash?: boolean;
}): JSX.Element {
	return (
		<section id={id} class={wash ? "hs-wash scroll-mt-8" : "scroll-mt-8"}>
			<div class="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-6 py-20 md:px-14 md:py-28 lg:grid-cols-[5fr_7fr]">
				<div>
					<p class="hs-overline">{overline}</p>
					<h2 class="display mt-4 text-display-md text-ink">{title}</h2>
				</div>
				<div class="space-y-6">{children}</div>
			</div>
		</section>
	);
}

/** One plain paragraph of body text. */
export function Para({ children }: { children: Child }): JSX.Element {
	return <p class="max-w-2xl text-body-lg text-ink-muted">{children}</p>;
}

/** The quiet foot of an inner page: where to go next. */
export function NextSteps({
	links,
}: {
	links: ReadonlyArray<{ label: string; href: string; primary?: boolean }>;
}): JSX.Element {
	return (
		<section class="mx-auto max-w-7xl px-6 pb-40 pt-8 md:px-14">
			<div class="flex flex-wrap items-center gap-4 border-t border-line pt-10">
				{links.map((l) => (
					<Button variant={l.primary ? "primary" : "glass"} arrow={l.primary} href={l.href}>
						{l.label}
					</Button>
				))}
			</div>
		</section>
	);
}
