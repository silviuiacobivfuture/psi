/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { ArrowIcon, GlassCard, StatusBadge } from "@psi/ui";
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Purpose } from "../stores/types";
import { AccountIcon, type AccountIconName } from "./icons";
import type { JourneyKey, Say } from "./labels";
import type { OwnReservation, TimelineEvent, TimelineKind } from "./ports";
import { JOURNEY_PAGES, TYPE, when } from "./views-shell";

/** What /cont shows above the fold: one card per thing a person keeps here, each with one action. */
export interface Overview {
	/** undefined: this site keeps no reservations (they are on Psizone); null: none upcoming; "unavailable": store away. */
	next: OwnReservation | null | "unavailable" | undefined;
	/** Where "book" leads: Psizone's booking page. */
	bookHref?: string;
	saved: ReadonlyArray<{ title: string; href?: string }>;
	savedTotal: number;
	/** The full reading list, and where to find articles when it is empty. */
	savedListHref?: string;
	readingHref?: string;
	memory: { consented: boolean; conversations: number };
	consents: ReadonlyArray<{ purpose: Purpose; on: boolean }>;
}

const EVENT_KEY: Readonly<Record<TimelineKind, JourneyKey>> = {
	booking: "account_event_booking",
	consent_granted: "account_event_consent_granted",
	consent_withdrawn: "account_event_consent_withdrawn",
	saved: "account_event_saved",
	conversation: "account_event_conversation",
};

const PURPOSE_TITLE: Readonly<Record<Purpose, JourneyKey>> = {
	guide_memory: "account_purpose_guide_memory_title",
	booking_contact: "account_purpose_booking_contact_title",
	programme_progress: "account_purpose_programme_progress_title",
};

const STATUS_KEY: Readonly<Record<OwnReservation["status"], JourneyKey>> = {
	requested: "account_status_requested",
	confirmed: "account_status_confirmed",
	cancelled: "account_status_cancelled",
	declined: "account_status_declined",
};

function Action({ href, label }: { href: string; label: string }): JSX.Element {
	return (
		<a
			href={href}
			class={`pz-tap mt-auto inline-flex items-center gap-1.5 pt-5 text-label text-accent hover:underline ${TYPE.label}`}
		>
			{label}
			<ArrowIcon size={16} />
		</a>
	);
}

function OverviewCard({
	icon,
	title,
	action,
	children,
}: {
	icon: AccountIconName;
	title: string;
	action?: { href: string; label: string };
	children?: Child;
}): JSX.Element {
	return (
		<GlassCard class="flex flex-col p-6">
			<div class="flex items-center gap-2.5 text-ink-muted">
				<AccountIcon name={icon} />
				<h2 class={`text-overline uppercase tracking-[0.14em] ${TYPE.label}`}>{title}</h2>
			</div>
			<div class={`mt-4 flex flex-col gap-2 ${TYPE.text}`}>{children}</div>
			{action === undefined ? null : <Action {...action} />}
		</GlassCard>
	);
}

function NextAppointment({
	say,
	base,
	locale,
	o,
}: {
	say: Say;
	base: string;
	locale: "ro" | "en";
	o: Overview;
}): JSX.Element {
	const title = say("account_card_next_title");
	if (o.next === undefined) {
		return (
			<OverviewCard
				icon="bookings"
				title={title}
				{...(o.bookHref === undefined
					? {}
					: {
							action: {
								href: o.bookHref,
								label: say("account_card_book_elsewhere_action"),
							},
						})}
			>
				<p class="text-body text-ink-muted">{say("account_card_book_elsewhere")}</p>
			</OverviewCard>
		);
	}
	const list = {
		href: `${base}${JOURNEY_PAGES.bookings}`,
		label: say("account_card_next_action"),
	};
	if (o.next === "unavailable") {
		return (
			<OverviewCard icon="bookings" title={title} action={list}>
				<p class="text-body text-ink-muted">{say("account_unavailable_lead")}</p>
			</OverviewCard>
		);
	}
	if (o.next === null) {
		return (
			<OverviewCard
				icon="bookings"
				title={title}
				action={
					o.bookHref === undefined
						? list
						: { href: o.bookHref, label: say("account_card_book_action") }
				}
			>
				<p class="text-body text-ink-muted">{say("account_card_next_empty")}</p>
			</OverviewCard>
		);
	}
	const r = o.next;
	return (
		<OverviewCard icon="bookings" title={title} action={list}>
			<p class={`text-title text-ink ${TYPE.label}`}>{when(locale, r.start)}</p>
			<p class="text-body-sm text-ink-muted">
				{`${say(r.mode === "online" ? "account_mode_online" : "account_mode_onsite")} · ${r.practitionerName}`}
			</p>
			<div>
				<StatusBadge tone={r.status === "confirmed" ? "success" : "info"}>
					{say(STATUS_KEY[r.status])}
				</StatusBadge>
			</div>
		</OverviewCard>
	);
}

/** /cont: the overview cards, whatever the site adds (the blog's reading list), then recent activity. */
export function HomeBody({
	say,
	base,
	locale,
	overview,
	timeline,
	extra,
}: {
	say: Say;
	base: string;
	locale: "ro" | "en";
	overview: Overview;
	timeline: ReadonlyArray<TimelineEvent>;
	extra?: Child;
}): JSX.Element {
	const o = overview;
	const active = o.consents.filter((c) => c.on).length;
	return (
		<>
			<div class="grid gap-6 md:grid-cols-2" data-overview>
				<NextAppointment say={say} base={base} locale={locale} o={o} />
				<OverviewCard
					icon="saved"
					title={say("account_card_saved_title")}
					{...(o.savedTotal === 0
						? o.readingHref === undefined
							? {}
							: {
									action: {
										href: o.readingHref,
										label: say("account_card_saved_empty_action"),
									},
								}
						: o.savedListHref === undefined
							? {}
							: {
									action: {
										href: o.savedListHref,
										label: say("account_card_saved_action"),
									},
								})}
				>
					{o.savedTotal === 0 ? (
						<p class="text-body text-ink-muted">{say("account_card_saved_empty")}</p>
					) : (
						<ul class="flex flex-col gap-1.5">
							{o.saved.map((s) => (
								<li class="truncate text-body text-ink">
									{s.href === undefined ? (
										s.title
									) : (
										<a class="hover:underline" href={s.href}>
											{s.title}
										</a>
									)}
								</li>
							))}
						</ul>
					)}
				</OverviewCard>
				<OverviewCard
					icon="conversations"
					title={say("account_card_memory_title")}
					action={
						o.memory.consented
							? {
									href: `${base}${JOURNEY_PAGES.conversations}`,
									label: say("account_card_memory_action"),
								}
							: {
									href: `${base}${JOURNEY_PAGES.consents}`,
									label: say("account_card_memory_off_action"),
								}
					}
				>
					<p class="text-body text-ink-muted">
						{say(o.memory.consented ? "account_card_memory_on" : "account_card_memory_off")}
					</p>
					{o.memory.consented ? (
						<p class={`text-body-sm text-ink ${TYPE.label}`}>
							{`${say("account_card_memory_count")} · ${o.memory.conversations}`}
						</p>
					) : null}
				</OverviewCard>
				<OverviewCard
					icon="consents"
					title={say("account_card_consents_title")}
					action={{
						href: `${base}${JOURNEY_PAGES.consents}`,
						label: say("account_card_consents_action"),
					}}
				>
					<p class={`text-body-sm text-ink ${TYPE.label}`}>{`${active} / ${o.consents.length}`}</p>
					<ul class="flex flex-col gap-1.5">
						{o.consents.map((c) => (
							<li class="flex items-center justify-between gap-3 text-body-sm text-ink-muted">
								<span>{say(PURPOSE_TITLE[c.purpose])}</span>
								<StatusBadge tone={c.on ? "success" : "neutral"}>
									{say(c.on ? "account_consent_on" : "account_consent_off")}
								</StatusBadge>
							</li>
						))}
					</ul>
				</OverviewCard>
			</div>
			{extra}
			<GlassCard class="p-6 md:p-8">
				<h2 class={`text-headline ${TYPE.heading}`}>{say("account_timeline_title")}</h2>
				{timeline.length === 0 ? (
					<p class={`mt-4 text-body text-ink-muted ${TYPE.text}`}>
						{say("account_timeline_empty")}
					</p>
				) : (
					<ol class={`mt-4 flex flex-col divide-y divide-line ${TYPE.text}`} data-timeline>
						{timeline.map((e) => (
							<li class="flex flex-wrap items-baseline justify-between gap-2 py-3">
								<span class="text-body text-ink">
									{say(EVENT_KEY[e.kind])}
									{e.detail === "" ? null : (
										<>
											{" · "}
											{e.href === undefined ? (
												<span class="text-ink-muted">{e.detail}</span>
											) : (
												<a class="text-ink-muted underline-offset-4 hover:underline" href={e.href}>
													{e.detail}
												</a>
											)}
										</>
									)}
								</span>
								<time
									class={`text-body-sm text-ink-muted ${TYPE.label}`}
									datetime={new Date(e.at).toISOString()}
								>
									{when(locale, e.at)}
								</time>
							</li>
						))}
					</ol>
				)}
			</GlassCard>
		</>
	);
}
