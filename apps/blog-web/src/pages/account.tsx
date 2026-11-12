import { AccountSection } from "@psi/account";
import { Button, StatusBadge } from "@psi/ui";
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { accountPaths } from "../account";
import { at, type Locale } from "../i18n";
import { Layout } from "../layout";
import { m } from "../paraglide/messages.js";
import { routes } from "../routes";
import { Footer } from "../sections/footer";
import { Header } from "../sections/header";
import type { Theme } from "../theme";

/** One saved article, already allowed by OpenFGA for the person viewing the page. */
export interface ShownSaved {
	id: string;
	title: string;
	href: string;
}

export interface Frame {
	locale: Locale;
	theme: Theme;
	origin: string;
}

/** The blog's paper, masthead and Compass around every account page; never indexed. */
export function AccountFrame({
	locale,
	theme,
	origin,
	title,
	children,
}: Frame & { title: string; children: Child }): JSX.Element {
	const o = at(locale);
	const other: Locale = locale === "ro" ? "en" : "ro";
	return (
		<Layout
			locale={locale}
			theme={theme}
			title={`${title} — ${m.masthead_title({}, o)}`}
			description={m.account_lead({}, o)}
			canonical={`${origin}${accountPaths.home(locale)}`}
			alternate={{
				locale: other,
				href: `${origin}${accountPaths.home(other)}`,
			}}
			feed={{
				title: m.rss_title({}, o),
				href: `${origin}${routes.rss(locale)}`,
			}}
			noindex
		>
			<Header locale={locale} otherHref={accountPaths.home(other)} />
			<main id="continut" class="mx-auto max-w-[1200px] px-4 pb-28 sm:px-6">
				<div class="max-w-[680px] pb-12 pt-20 md:pt-28">
					<h1 class="bl-hero-title">{title}</h1>
					<p class="bl-standfirst mt-6">{m.account_lead({}, o)}</p>
				</div>
				{children}
			</main>
			<Footer locale={locale} />
		</Layout>
	);
}

/**
 * The reading list on /cont, above the timeline. `saved` is null when OpenFGA could not be asked: the list is then
 * withheld, never shown unchecked (cache wall: fail closed).
 */
export function ReadingList({
	locale,
	saved,
	partial,
}: {
	locale: Locale;
	saved: ReadonlyArray<ShownSaved> | null;
	/** Some rows could not be checked and are hidden. */
	partial: boolean;
}): JSX.Element {
	const o = at(locale);
	return (
		<AccountSection title={m.account_saved_title({}, o)}>
			{saved === null || partial ? (
				<StatusBadge tone="warning">
					{m.account_saved_unavailable({}, o)}
				</StatusBadge>
			) : null}
			{saved !== null && saved.length === 0 && !partial ? (
				<p class="text-body text-ink-muted">{m.account_saved_empty({}, o)}</p>
			) : null}
			{saved !== null && saved.length > 0 ? (
				<ul class="mt-2 flex flex-col divide-y divide-line" data-saved-list>
					{saved.map((s) => (
						<li class="flex flex-wrap items-center justify-between gap-3 py-3">
							<a
								class="min-w-0 flex-1 text-body text-ink hover:underline"
								href={s.href}
							>
								{s.title}
							</a>
							<form method="post" action={accountPaths.remove(locale, s.id)}>
								<Button type="submit" variant="ghost" size="sm">
									{m.account_saved_remove({}, o)}
								</Button>
							</form>
						</li>
					))}
				</ul>
			) : null}
		</AccountSection>
	);
}

/** /cont/salvate/nou — a GET that only asks; the save itself is a same-origin POST. */
export function SaveConfirmPage({
	slug,
	title,
	...frame
}: Frame & { slug: string; title: string }): JSX.Element {
	const { locale } = frame;
	const o = at(locale);
	return (
		<AccountFrame {...frame} title={m.account_save_title({}, o)}>
			<AccountSection title={title}>
				<p class="text-body text-ink-muted">
					{m.account_save_lead({ title }, o)}
				</p>
				<form class="mt-6" method="post" action={accountPaths.save(locale)}>
					<input type="hidden" name="articol" value={slug} />
					<Button type="submit" arrow>
						{m.account_save_button({}, o)}
					</Button>
				</form>
			</AccountSection>
		</AccountFrame>
	);
}

/** 503: OpenFGA could not be asked. Nothing is decided, nothing is shown unchecked. */
export function AccountUnavailablePage(frame: Frame): JSX.Element {
	const o = at(frame.locale);
	return (
		<AccountFrame {...frame} title={m.account_unavailable_title({}, o)}>
			<p class="text-body text-ink-muted">
				{m.account_unavailable_lead({}, o)}
			</p>
		</AccountFrame>
	);
}
