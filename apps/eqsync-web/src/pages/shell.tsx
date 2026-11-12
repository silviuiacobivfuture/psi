import { Button, StatusBadge } from "@psi/ui";
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { at, type Locale } from "../i18n";
import { Layout } from "../layout";
import { m } from "../paraglide/messages.js";
import { href, type PageId } from "../routes";
import { Footer } from "../sections/closing";
import { Header } from "../sections/header";
import type { Theme } from "../theme";

/** What every page beyond the home receives from its route. */
export interface PageProps {
	locale: Locale;
	theme: Theme;
	origin: string;
}

/** The frame of an inner page: the same corner logo, compass and footer as the home. */
export function PageShell({
	locale,
	theme,
	origin,
	page,
	title,
	description,
	children,
}: PageProps & {
	page: PageId;
	title: string;
	description: string;
	children: Child;
}): JSX.Element {
	const other: Locale = locale === "ro" ? "en" : "ro";
	const otherHref = href(other, page);
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

/** The page's one H1 over the sound bands; new copy carries a visible draft badge until signed off. */
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
	return (
		<section class="relative overflow-hidden border-b border-line">
			<div class="eq-bands" aria-hidden="true" />
			<div class="relative mx-auto max-w-6xl px-5 pb-20 pt-32 md:pb-24 md:pt-44">
				<p class="eq-overline">{overline}</p>
				<h1 class="display eq-h2 eq-h2--xl mt-6 max-w-4xl text-ink">{title}</h1>
				{lead ? <p class="mt-8 max-w-2xl text-body text-ink-muted">{lead}</p> : null}
				{draft ? (
					<StatusBadge tone="warning" class="mt-8">
						{m.draft_badge({}, at(locale))}
					</StatusBadge>
				) : null}
				{children}
			</div>
		</section>
	);
}

/** Content only the owner can supply: said plainly where it will go, never invented. */
export function Pending({ locale, children }: { locale: Locale; children: Child }): JSX.Element {
	return (
		<div class="rounded-lg border border-dashed border-line p-6">
			<StatusBadge tone="info">{m.pending_badge({}, at(locale))}</StatusBadge>
			<p class="mt-4 max-w-2xl text-body text-ink-muted">{children}</p>
		</div>
	);
}

/** A titled band of the page: overline and heading on the left, content on the right. */
export function Band({
	id,
	overline,
	title,
	children,
	tinted = false,
}: {
	id?: string;
	overline: string;
	title: string;
	children: Child;
	tinted?: boolean;
}): JSX.Element {
	return (
		<section
			id={id}
			class={tinted ? "scroll-mt-28 border-y border-line bg-surface-1" : "scroll-mt-28"}
		>
			<div class="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-5 py-20 md:py-28 lg:grid-cols-12">
				<div class="lg:col-span-4">
					<p class="eq-overline">{overline}</p>
					<h2 class="display eq-h2 mt-5 text-ink">{title}</h2>
				</div>
				<div class="space-y-6 lg:col-span-8">{children}</div>
			</div>
		</section>
	);
}

/** One plain paragraph in the brand's mono body. */
export function Para({ children }: { children: Child }): JSX.Element {
	return <p class="max-w-2xl text-body text-ink-muted">{children}</p>;
}

/** The quiet foot of an inner page: where to go next, and the one primary action. */
export function NextSteps({
	locale,
	links,
}: {
	locale: Locale;
	links: ReadonlyArray<{ label: string; href: string }>;
}): JSX.Element {
	const o = at(locale);
	return (
		<section class="mx-auto max-w-6xl px-5 pb-40 pt-8">
			<div class="flex flex-wrap items-center gap-4 border-t border-line pt-10">
				<Button arrow href={href(locale, "signup")}>
					{m.cta_free({}, o)}
				</Button>
				{links.map((l) => (
					<Button variant="ghost" href={l.href}>
						{l.label}
					</Button>
				))}
			</div>
		</section>
	);
}
