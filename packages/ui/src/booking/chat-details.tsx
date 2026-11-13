/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { BookingOffer } from "@psi/guide";
import type { JSX } from "hono/jsx/jsx-runtime";
import { askExpression } from "../components/guide-exchange";
import { BookingFailed, BookingRequested } from "./results";
import type { BookingEnv } from "./types";

type Details = NonNullable<BookingOffer["details"]>;

/** How long the problem description is shown on the card (the full text is what is sent). */
const DETAILS_PREVIEW = 160;

/** "marți, 17 noiembrie, 10:00" for a time the engine named (its local date and clock). */
function whenOf(date: string, time: string, locale: BookingEnv["locale"]): string {
	const day = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "ro-RO", {
		timeZone: "UTC",
		weekday: "long",
		day: "numeric",
		month: "long",
	}).format(Date.parse(`${date}T12:00:00Z`));
	return `${day}, ${time}`;
}

/** The expression a button runs: both buttons are switched off, then the text is asked as the visitor's own. */
function pressing(text: string): string {
	return `el.closest('.pz-msg__actions')?.querySelectorAll('button').forEach((b) => { b.disabled = true }); ${askExpression(text)}`;
}

function Button({ label, text, primary }: { label: string; text: string; primary: boolean }) {
	return (
		<button
			type="button"
			class={primary ? "pz-btn pz-btn--primary pz-msg__action" : "pz-btn pz-msg__action"}
			data-on:click={pressing(text)}
		>
			{label}
		</button>
	);
}

/** The one line the guide says in the details step: the problem, or a thanks and the next question. */
export function detailsLine(
	details: Details,
	env: BookingEnv,
	when: string,
	first: boolean,
): string {
	const d = env.copy.chat.details;
	const { problem, ask } = details;
	if (problem !== undefined) {
		return problem.code === "typo" ? d.emailTypo(problem.suggestion) : d.invalid[problem.field];
	}
	const question = ask === undefined ? "" : d.ask[ask];
	if (details.nudge) return `${d.nudge} ${question}`.trim();
	if (first) return `${d.lead(when)} ${question}`.trim();
	if (details.heard.length === 0) return question;
	const name = details.values.name?.split(" ")[0];
	const thanks =
		name !== undefined && details.heard.includes("name") ? d.thanksName(name) : d.thanks;
	return `${thanks} ${question}`.trim();
}

/** One question, in the conversation; the form stays one button away. */
export function DetailsQuestion({
	env,
	offer,
	details,
}: {
	env: BookingEnv;
	offer: BookingOffer;
	details: Details;
}): JSX.Element {
	const { chat } = env.copy;
	const slot = offer.chosen;
	const when = slot === undefined ? "" : whenOf(slot.date, slot.time, env.locale);
	const first = Object.keys(details.values).length === 0 && details.heard.length === 0;
	return (
		<div class="space-y-4">
			<p>{detailsLine(details, env, when, first)}</p>
			<div class="pz-msg__actions">
				<Button label={chat.details.useForm} text={chat.card.edit} primary={false} />
			</div>
		</div>
	);
}

/** The summary of the request, with the two buttons: nothing is sent before the visitor confirms. */
export function SummaryCard({
	env,
	offer,
	details,
	serviceLabel,
}: {
	env: BookingEnv;
	offer: BookingOffer;
	details: Details;
	serviceLabel: string;
}): JSX.Element {
	const { chat } = env.copy;
	const { card } = chat;
	const { values } = details;
	const slot = offer.chosen;
	const text = values.details ?? "";
	const preview =
		text.length > DETAILS_PREVIEW ? `${text.slice(0, DETAILS_PREVIEW).trimEnd()}…` : text;
	const rows: ReadonlyArray<readonly [string, string]> = [
		[card.labels.service, serviceLabel],
		...(slot === undefined
			? []
			: ([[card.labels.when, whenOf(slot.date, slot.time, env.locale)]] as const)),
		...(slot === undefined || slot.practitioner === ""
			? []
			: ([[card.labels.practitioner, slot.practitioner]] as const)),
		[card.labels.name, values.name ?? ""],
		[card.labels.age, String(values.age ?? "")],
		...(env.audiences.length > 1 && values.forWhom !== undefined
			? ([
					[card.labels.forWhom, env.copy.audience.labels[values.forWhom] ?? values.forWhom],
				] as const)
			: []),
		[card.labels.phone, values.phone ?? ""],
		[card.labels.email, values.email ?? ""],
		[card.labels.details, preview],
	];
	return (
		<div class="space-y-4" data-summary-card>
			<p>{details.nudge ? card.nudge : card.lead}</p>
			<dl class="space-y-2">
				{rows.map(([label, value]) => (
					<div>
						<dt class="text-body-sm text-ink-muted">{label}</dt>
						<dd class="text-body text-ink">{value}</dd>
					</div>
				))}
			</dl>
			<p class="text-body-sm text-ink-muted">{card.consent}</p>
			<div class="pz-msg__actions">
				<Button label={card.confirm} text={card.confirm} primary />
				<Button label={card.edit} text={card.edit} primary={false} />
			</div>
		</div>
	);
}

/** The request the guide submitted: the reference and cancel code (shown here once), then what happens next. */
export function BookedCard({
	env,
	offer,
	id,
}: {
	env: BookingEnv;
	offer: BookingOffer;
	id: string;
}): JSX.Element | null {
	const { booked } = offer;
	if (booked === undefined) return null;
	return (
		<div class="space-y-3">
			<BookingRequested
				id={id}
				env={env}
				name={booked.name}
				reference={booked.reference}
				cancelCode={booked.cancelCode}
				start={booked.start}
				timeZone={booked.timeZone}
				cancelInChat
			/>
			<p>{env.copy.chat.booked.next}</p>
		</div>
	);
}

/** The request reached nobody: said plainly, with the site's phones when it has any. */
export function SubmitFailed({ env, id }: { env: BookingEnv; id: string }): JSX.Element {
	return (
		<div class="space-y-3">
			<BookingFailed id={id} env={env} />
			<p>{env.copy.chat.submitRetry}</p>
		</div>
	);
}
