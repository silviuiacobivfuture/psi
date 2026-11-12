/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { Button, GlassCard, StatusBadge } from "@psi/ui";
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { SignedIn } from "../guard";
import { AccountIcon, type AccountIconName } from "./icons";
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

/** Sidebar order (desktop) and segmented order (mobile). */
const NAV: ReadonlyArray<readonly [JourneyPage, JourneyKey, AccountIconName]> =
	[
		["home", "account_nav_home", "overview"],
		["profile", "account_nav_profile", "profile"],
		["bookings", "account_nav_bookings", "bookings"],
		["conversations", "account_nav_conversations", "conversations"],
		["consents", "account_nav_consents", "consents"],
		["data", "account_nav_data", "data"],
	];

/**
 * Type in the account area. Headings: the brand's display face. Labels, nav and data: the brand's label face (IBM
 * Plex Mono on EQ-SYNC, as its brand book prescribes). Paragraphs: the brand's body face, except on EQ-SYNC, where
 * running text uses its display face (Fraunces) so no paragraph is set in mono and no third typeface appears.
 */
export const TYPE = {
	heading: "display font-display text-ink",
	label: "font-(family-name:--pz-label)",
	text: "font-(family-name:--pz-body) in-[[data-theme^=eqsync]]:font-display",
} as const;

/** A date and time a person reads, in the clinic's zone. */
export function when(locale: "ro" | "en", ms: number): string {
	return new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "en-GB", {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: "Europe/Bucharest",
	}).format(new Date(ms));
}

/** Up to two initials from a name, or the first letter of the e-mail. */
export function initialsOf(person: Pick<SignedIn, "name" | "email">): string {
	const words = (person.name ?? "")
		.replace(/\(.*?\)/g, "")
		.split(/\s+/)
		.filter((w) => /\p{L}/u.test(w));
	const letters =
		words.length > 0
			? words.slice(0, 2).map((w) => w[0] ?? "")
			: [person.email?.[0] ?? "?"];
	return letters.join("").toLocaleUpperCase();
}

/** The compact page header every account page starts with: an overline and the title, nothing more. */
export function AccountHeader({
	say,
	children,
}: {
	say: Say;
	children?: Child;
}): JSX.Element {
	return (
		<div class="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-8">
			<div>
				<p
					class={`text-overline uppercase tracking-[0.14em] text-ink-muted ${TYPE.label}`}
				>
					{say("account_group")}
				</p>
				<h1 class={`mt-2 text-display-md ${TYPE.heading}`}>
					{say("account_title")}
				</h1>
			</div>
			{children}
		</div>
	);
}

function Identity({
	say,
	person,
	signOutAction,
}: {
	say: Say;
	person: SignedIn;
	signOutAction: string;
}): JSX.Element {
	return (
		<div class="flex min-w-0 items-center gap-4" data-identity>
			<span
				class={`grid size-12 shrink-0 place-items-center rounded-full bg-accent-soft text-title text-accent ${TYPE.label}`}
				aria-hidden="true"
			>
				{initialsOf(person)}
			</span>
			<div class="min-w-0">
				<p class={`truncate text-title text-ink ${TYPE.text}`}>
					{person.name ?? person.email ?? ""}
				</p>
				{person.email !== null && person.name !== null ? (
					<p class={`truncate text-body-sm text-ink-muted ${TYPE.label}`}>
						{person.email}
					</p>
				) : null}
			</div>
			<form method="post" action={signOutAction} class="ml-2 shrink-0">
				<button
					type="submit"
					class={`pz-tap text-body-sm text-ink-muted underline-offset-4 hover:text-ink hover:underline ${TYPE.label}`}
				>
					{say("account_sign_out_short")}
				</button>
			</form>
		</div>
	);
}

function SectionNav({
	say,
	base,
	active,
}: {
	say: Say;
	base: string;
	active: JourneyPage;
}): JSX.Element {
	return (
		<nav
			aria-label={say("account_title")}
			class="lg:sticky lg:top-28 lg:self-start"
		>
			<ul class="-mx-1 flex overflow-x-auto border-b border-line [scrollbar-width:none] lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:border-b-0">
				{NAV.map(([page, key, icon]) => {
					const on = page === active;
					return (
						<li class="shrink-0">
							<a
								href={`${base}${JOURNEY_PAGES[page]}`}
								class={`pz-tap flex items-center gap-2.5 whitespace-nowrap border-b-2 px-3 py-3 text-label lg:rounded-md lg:border-b-0 lg:py-2.5 ${TYPE.label} ${
									on
										? "border-accent text-accent lg:bg-accent-soft"
										: "border-transparent text-ink-muted hover:text-ink lg:hover:bg-surface-2"
								}`}
								{...(on ? { "aria-current": "page" } : {})}
							>
								<AccountIcon name={icon} class="hidden shrink-0 lg:block" />
								{say(key)}
							</a>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}

/**
 * Every signed-in page: the compact header with who is signed in, the sections (a sidebar from 1024 px, a scrollable
 * segmented row below), then the page. It sits in the site's own container, so it shares the header's grid.
 */
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
		<div data-account="signed-in">
			<AccountHeader say={say}>
				<Identity say={say} person={person} signOutAction={signOutAction} />
			</AccountHeader>
			<div class="mt-6 lg:mt-10 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
				<SectionNav say={say} base={base} active={active} />
				<div class="mt-8 flex min-w-0 flex-col gap-6 lg:mt-0">
					{notice === undefined ? null : (
						<div role="status">
							<StatusBadge tone="success">{notice}</StatusBadge>
						</div>
					)}
					{children}
					<p class={`text-body-sm text-ink-muted ${TYPE.text}`}>
						{say("account_privacy_note")}
					</p>
				</div>
			</div>
		</div>
	);
}

/** A titled card inside a page. */
export function Section({
	title,
	id,
	children,
}: {
	title: string;
	id?: string;
	children?: Child;
}): JSX.Element {
	return (
		<GlassCard class="p-6 md:p-8" {...(id === undefined ? {} : { id })}>
			<h2 class={`text-headline ${TYPE.heading}`}>{title}</h2>
			<div class={`mt-4 flex flex-col gap-4 ${TYPE.text}`}>{children}</div>
		</GlassCard>
	);
}

/** A message page (signed out, unavailable, coming soon): the compact header, then one card. */
function Notice({
	say,
	marker,
	title,
	text,
	children,
}: {
	say: Say;
	marker: string;
	title: string;
	text: string;
	children?: Child;
}): JSX.Element {
	return (
		<div data-account={marker}>
			<AccountHeader say={say} />
			<GlassCard class="mt-8 max-w-2xl p-6 md:p-8">
				<h2 class={`text-headline ${TYPE.heading}`}>{title}</h2>
				<p class={`mt-3 text-body text-ink-muted ${TYPE.text}`}>{text}</p>
				{children}
			</GlassCard>
		</div>
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
		<Notice
			say={say}
			marker="signed-out"
			title={say("account_signed_out_title")}
			text={say("account_signed_out_lead")}
		>
			<div class="mt-6">
				{signInReady ? (
					<Button href={signInHref} arrow>
						{say("account_sign_in")}
					</Button>
				) : (
					<StatusBadge tone="warning">{say("account_unavailable")}</StatusBadge>
				)}
			</div>
			<p class={`mt-6 text-body-sm text-ink-muted ${TYPE.text}`}>
				{say("account_privacy_note")}
			</p>
		</Notice>
	);
}

/** 503: OpenFGA (or the store) could not be asked; nothing is decided and nothing is shown unchecked. */
export function Unavailable({ say }: { say: Say }): JSX.Element {
	return (
		<Notice
			say={say}
			marker="unavailable"
			title={say("account_unavailable_title")}
			text={say("account_unavailable_lead")}
		/>
	);
}

/** Accounts are off (not configured in production yet): a warm "coming soon", never an error. */
export function ComingSoon({ say }: { say: Say }): JSX.Element {
	return (
		<Notice
			say={say}
			marker="coming-soon"
			title={say("account_soon_title")}
			text={say("account_soon_text")}
		/>
	);
}
