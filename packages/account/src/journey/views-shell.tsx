/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { Button, GlassCard, StatusBadge } from "@psi/ui";
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { SignedIn } from "../guard";
import type { JourneyKey, Say } from "./labels";

/** The journey's pages, by their Romanian slug (both locales, like the sites' other pages). */
export const JOURNEY_PAGES = {
	home: "/cont",
	profile: "/cont/profil",
	consents: "/cont/consimtaminte",
	bookings: "/cont/programari",
	conversations: "/cont/conversatii",
	data: "/cont/date",
} as const;
export type JourneyPage = keyof typeof JOURNEY_PAGES;

const NAV: ReadonlyArray<readonly [JourneyPage, JourneyKey]> = [
	["home", "account_nav_home"],
	["profile", "account_nav_profile"],
	["consents", "account_nav_consents"],
	["bookings", "account_nav_bookings"],
	["conversations", "account_nav_conversations"],
	["data", "account_nav_data"],
];

/** A date and time a person reads, in the clinic's zone. */
export function when(locale: "ro" | "en", ms: number): string {
	return new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "en-GB", {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: "Europe/Bucharest",
	}).format(new Date(ms));
}

/** Every signed-in page: who, the account's sections, sign-out everywhere, then the page itself. */
export function JourneyShell({
	say,
	base,
	active,
	person,
	signOutAction,
	notice,
	children,
}: {
	say: Say;
	base: string;
	active: JourneyPage;
	person: SignedIn;
	signOutAction: string;
	notice?: string;
	children?: Child;
}): JSX.Element {
	return (
		<div class="mx-auto flex max-w-3xl flex-col gap-6" data-account="signed-in">
			<GlassCard class="flex flex-wrap items-center gap-4 p-6">
				<div class="min-w-[14rem] flex-1">
					<p class="text-overline uppercase tracking-[0.14em] text-ink-muted">
						{say("account_signed_in_as")}
					</p>
					<p class="mt-1 truncate text-body-lg text-ink">{person.name ?? person.email ?? ""}</p>
					{person.email !== null && person.name !== null ? (
						<p class="truncate text-body-sm text-ink-muted">{person.email}</p>
					) : null}
				</div>
				<form method="post" action={signOutAction}>
					<Button type="submit" variant="outline" size="sm">
						{say("account_sign_out")}
					</Button>
				</form>
			</GlassCard>
			<nav aria-label={say("account_title")} class="flex flex-wrap gap-2">
				{NAV.map(([page, key]) => (
					<a
						href={`${base}${JOURNEY_PAGES[page]}`}
						class={`pz-btn pz-btn--sm ${page === active ? "pz-btn--primary" : "pz-btn--glass"}`}
						{...(page === active ? { "aria-current": "page" } : {})}
					>
						{say(key)}
					</a>
				))}
			</nav>
			{notice === undefined ? null : (
				<div role="status">
					<StatusBadge tone="success">{notice}</StatusBadge>
				</div>
			)}
			{children}
			<p class="text-body-sm text-ink-muted">{say("account_privacy_note")}</p>
		</div>
	);
}

/** A titled card inside a page. */
export function Section({ title, children }: { title: string; children?: Child }): JSX.Element {
	return (
		<GlassCard class="p-6">
			<h2 class="text-headline text-ink">{title}</h2>
			<div class="mt-4 flex flex-col gap-4">{children}</div>
		</GlassCard>
	);
}

/** Never a dead end: a signed-out visitor is invited in, and comes back to the page they asked for. */
export function SignInInvite({
	say,
	signInHref,
	signInReady,
}: {
	say: Say;
	signInHref: string;
	signInReady: boolean;
}): JSX.Element {
	return (
		<div class="mx-auto max-w-xl" data-account="signed-out">
			<GlassCard class="p-8">
				<h2 class="display text-display-md text-ink">{say("account_signed_out_title")}</h2>
				<p class="mt-3 text-body text-ink-muted">{say("account_signed_out_lead")}</p>
				<div class="mt-6">
					{signInReady ? (
						<Button href={signInHref} arrow>
							{say("account_sign_in")}
						</Button>
					) : (
						<StatusBadge tone="warning">{say("account_unavailable")}</StatusBadge>
					)}
				</div>
				<p class="mt-6 text-body-sm text-ink-muted">{say("account_privacy_note")}</p>
			</GlassCard>
		</div>
	);
}

/** 503: OpenFGA (or the store) could not be asked; nothing is decided and nothing is shown unchecked. */
export function Unavailable({ say }: { say: Say }): JSX.Element {
	return (
		<div class="mx-auto max-w-xl">
			<GlassCard class="p-8">
				<h2 class="text-headline text-ink">{say("account_unavailable_title")}</h2>
				<p class="mt-3 text-body text-ink-muted">{say("account_unavailable_lead")}</p>
			</GlassCard>
		</div>
	);
}

/** Accounts are off (not configured in production yet): a warm "coming soon", never an error. */
export function ComingSoon({ say }: { say: Say }): JSX.Element {
	return (
		<div class="mx-auto max-w-xl" data-account="coming-soon">
			<GlassCard class="p-8">
				<h2 class="display text-display-md text-ink">{say("account_soon_title")}</h2>
				<p class="mt-3 text-body text-ink-muted">{say("account_soon_text")}</p>
			</GlassCard>
		</div>
	);
}
