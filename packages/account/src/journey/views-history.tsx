/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { Button, StatusBadge, TextField } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Conversation, ConversationTurn } from "../stores/types";
import type { JourneyKey, Say } from "./labels";
import type { OwnReservation } from "./ports";
import { JOURNEY_PAGES, Section, when } from "./views-shell";

const STATUS_KEY: Readonly<Record<OwnReservation["status"], JourneyKey>> = {
	requested: "account_status_requested",
	confirmed: "account_status_confirmed",
	cancelled: "account_status_cancelled",
	declined: "account_status_declined",
};

function ReservationRow({
	say,
	base,
	locale,
	r,
	cancellable,
}: {
	say: Say;
	base: string;
	locale: "ro" | "en";
	r: OwnReservation;
	cancellable: boolean;
}): JSX.Element {
	return (
		<li
			class="flex flex-wrap items-center justify-between gap-3 py-3"
			data-reference={r.reference}
		>
			<div class="min-w-[12rem] flex-1">
				<p class="text-body text-ink">{when(locale, r.start)}</p>
				<p class="text-body-sm text-ink-muted">
					{`${say(r.mode === "online" ? "account_mode_online" : "account_mode_onsite")} · ${r.practitionerName} · ${say("account_bookings_reference")} ${r.reference}`}
				</p>
			</div>
			<StatusBadge
				tone={
					r.status === "confirmed"
						? "success"
						: r.status === "requested"
							? "info"
							: "neutral"
				}
			>
				{say(STATUS_KEY[r.status])}
			</StatusBadge>
			{cancellable ? (
				<form
					method="post"
					action={`${base}${JOURNEY_PAGES.bookings}/anuleaza`}
				>
					<input type="hidden" name="reference" value={r.reference} />
					<Button type="submit" size="sm" variant="ghost">
						{say("account_bookings_cancel")}
					</Button>
				</form>
			) : null}
		</li>
	);
}

/**
 * /cont/programari: upcoming and past requests, each already allowed by OpenFGA for this person, and the
 * way to add an anonymous request with its proof. `rows` null: the scheduling store or OpenFGA is away.
 */
export function BookingsBody({
	say,
	base,
	locale,
	enabled,
	rows,
	now,
	linkFailed,
}: {
	say: Say;
	base: string;
	locale: "ro" | "en";
	enabled: boolean;
	rows: ReadonlyArray<OwnReservation> | null;
	now: number;
	linkFailed: boolean;
}): JSX.Element {
	if (!enabled) {
		return (
			<Section title={say("account_bookings_title")}>
				<p class="text-body text-ink-muted">{say("account_bookings_off")}</p>
			</Section>
		);
	}
	const upcoming = (rows ?? [])
		.filter(
			(r) =>
				r.end > now && (r.status === "requested" || r.status === "confirmed"),
		)
		.sort((a, b) => a.start - b.start);
	const past = (rows ?? []).filter((r) => !upcoming.includes(r));
	return (
		<>
			<Section title={say("account_bookings_title")}>
				<p class="text-body text-ink-muted">{say("account_bookings_lead")}</p>
				{rows === null ? (
					<StatusBadge tone="warning">
						{say("account_unavailable_lead")}
					</StatusBadge>
				) : null}
				{rows !== null && rows.length === 0 ? (
					<p class="text-body text-ink-muted">
						{say("account_bookings_empty")}
					</p>
				) : null}
				{upcoming.length > 0 ? (
					<div>
						<h3 class="text-body-lg text-ink">
							{say("account_bookings_upcoming")}
						</h3>
						<ul
							class="flex flex-col divide-y divide-line"
							data-bookings="upcoming"
						>
							{upcoming.map((r) => (
								<ReservationRow
									say={say}
									base={base}
									locale={locale}
									r={r}
									cancellable
								/>
							))}
						</ul>
					</div>
				) : null}
				{past.length > 0 ? (
					<div>
						<h3 class="text-body-lg text-ink">
							{say("account_bookings_past")}
						</h3>
						<ul class="flex flex-col divide-y divide-line" data-bookings="past">
							{past.map((r) => (
								<ReservationRow
									say={say}
									base={base}
									locale={locale}
									r={r}
									cancellable={false}
								/>
							))}
						</ul>
					</div>
				) : null}
			</Section>
			<Section title={say("account_bookings_link_title")}>
				<p class="text-body text-ink-muted">
					{say("account_bookings_link_lead")}
				</p>
				{linkFailed ? (
					<StatusBadge tone="danger">
						{say("account_bookings_link_failed")}
					</StatusBadge>
				) : null}
				<form
					method="post"
					action={`${base}${JOURNEY_PAGES.bookings}/leaga`}
					class="flex flex-col gap-4"
				>
					<TextField
						id="link-reference"
						name="reference"
						label={say("account_bookings_link_reference")}
					/>
					<TextField
						id="link-code"
						name="code"
						label={say("account_bookings_link_code")}
					/>
					<div>
						<Button type="submit" variant="outline">
							{say("account_bookings_link_button")}
						</Button>
					</div>
				</form>
			</Section>
		</>
	);
}

/** /cont/conversatii: remembered guide conversations (only with consent), each deletable, or all at once. */
export function ConversationsBody({
	say,
	base,
	locale,
	consented,
	conversations,
	siteNames,
}: {
	say: Say;
	base: string;
	locale: "ro" | "en";
	consented: boolean;
	conversations: ReadonlyArray<{
		conversation: Conversation;
		turns: ReadonlyArray<ConversationTurn>;
	}>;
	siteNames: Readonly<Record<string, string>>;
}): JSX.Element {
	return (
		<Section title={say("account_conversations_title")}>
			<p class="text-body text-ink-muted">
				{say("account_conversations_lead")}
			</p>
			{consented ? null : (
				<div class="flex flex-col gap-3">
					<p class="text-body text-ink-muted">
						{say("account_conversations_off")}
					</p>
					<form method="post" action={`${base}${JOURNEY_PAGES.consents}`}>
						<input type="hidden" name="purpose" value="guide_memory" />
						<input type="hidden" name="action" value="grant" />
						<input type="hidden" name="back" value="conversations" />
						<Button type="submit" size="sm">
							{say("account_consent_grant")}
						</Button>
					</form>
				</div>
			)}
			{consented && conversations.length === 0 ? (
				<p class="text-body text-ink-muted">
					{say("account_conversations_empty")}
				</p>
			) : null}
			{conversations.map(({ conversation, turns }) => (
				<article
					class="rounded-2xl border border-line p-4"
					data-conversation={conversation.id}
				>
					<header class="flex flex-wrap items-center justify-between gap-2">
						<p class="text-body-lg text-ink">
							{`${siteNames[conversation.site] ?? conversation.site} · ${when(locale, conversation.updatedAt)}`}
						</p>
						<form
							method="post"
							action={`${base}${JOURNEY_PAGES.conversations}/${conversation.id}/sterge`}
						>
							<Button type="submit" size="sm" variant="ghost">
								{say("account_conversations_delete")}
							</Button>
						</form>
					</header>
					<dl class="mt-3 flex flex-col gap-2">
						{turns.map((t) => (
							<>
								<dt class="text-body-sm text-ink-muted">
									{say("account_conversations_you")}
								</dt>
								<dd class="text-body text-ink">{t.question}</dd>
								<dt class="text-body-sm text-ink-muted">
									{say("account_conversations_guide")}
								</dt>
								<dd class="whitespace-pre-line text-body text-ink-muted">
									{t.answer}
								</dd>
							</>
						))}
					</dl>
				</article>
			))}
			{conversations.length > 1 ? (
				<form
					method="post"
					action={`${base}${JOURNEY_PAGES.conversations}/sterge-tot`}
				>
					<Button type="submit" size="sm" variant="outline">
						{say("account_conversations_delete_all")}
					</Button>
				</form>
			) : null}
		</Section>
	);
}
