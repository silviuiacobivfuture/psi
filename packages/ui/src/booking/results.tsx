/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import type { z } from "zod";
import { Button } from "../components/button";
import { GlassCard } from "../components/glass-card";
import type { BookingRequest } from "./schemas";
import { wallClock } from "./schemas";
import type { BookingEnv } from "./types";

/** What replaces the form once the request has reached the team (stored or e-mailed). */
export function BookingDone({
	env,
	name,
	id = "booking",
}: {
	env: BookingEnv;
	name: string;
	id?: string;
}): JSX.Element {
	return (
		<div id={id}>
			<GlassCard class="pz-edge space-y-4">
				<h2 class="display text-headline text-ink">{env.copy.done.title(name)}</h2>
				<p class="text-body text-ink-muted">{env.copy.done.text}</p>
			</GlassCard>
		</div>
	);
}

/**
 * What replaces the form when the request reached nobody: the store and the e-mail both failed.
 * Never "thank you": it says so plainly and gives the site's phones, when it has any.
 */
export function BookingFailed({
	env,
	id = "booking",
}: {
	env: BookingEnv;
	id?: string;
}): JSX.Element {
	const { failed } = env.copy;
	return (
		<div id={id} role="alert">
			<GlassCard class="pz-edge space-y-4">
				<h2 class="display text-headline text-ink">{failed.title}</h2>
				<p class="text-body text-ink-muted">{failed.text}</p>
				{env.phones.length === 0 ? null : (
					<p class="text-body text-ink">
						{`${failed.phones} `}
						{env.phones.map((phone, i) => (
							<>
								{i === 0 ? null : " · "}
								<a class="underline" href={`tel:${phone.tel}`}>
									{phone.display}
								</a>
							</>
						))}
					</p>
				)}
				<p class="text-body-sm">
					<a class="underline" href={env.routes.contact}>
						{failed.retry}
					</a>
				</p>
			</GlassCard>
		</div>
	);
}

/** What the confirm step shows and carries: the hold, and what the person typed in step one. */
export interface HeldBooking {
	reference: string;
	holdToken: string;
	start: number;
	expiresAt: number;
	practitionerName: string;
	timeZone: string;
	values: z.infer<typeof BookingRequest>;
}

/**
 * The confirm step: the slot is held (no personal data stored yet), and nothing is requested
 * until the person presses confirm. "Pick another time" releases the hold.
 */
export function BookingConfirm({
	env,
	held,
	id = "booking",
}: {
	env: BookingEnv;
	held: HeldBooking;
	id?: string;
}): JSX.Element {
	const { copy, routes } = env;
	const { day, time } = wallClock(held.start, held.timeZone, env.locale);
	const minutes = Math.max(1, Math.round((held.expiresAt - Date.now()) / 60_000));
	const carried: ReadonlyArray<readonly [string, string]> = [
		["reference", held.reference],
		["holdToken", held.holdToken],
		["name", held.values.name],
		["email", held.values.email],
		["phone", held.values.phone],
		["forWhom", held.values.forWhom],
		["when", held.values.when],
		["start", String(held.start)],
		["service", held.values.service],
		["cards", held.values.cards],
		["consent", "yes"],
		["form", id],
	];
	return (
		<form id={id} method="post" action={routes.confirm} class="space-y-6" data-indicator="sending">
			{carried.map(([name, value]) => (
				<input type="hidden" name={name} value={value} />
			))}
			<h2 class="display text-headline text-ink">{copy.confirm.title}</h2>
			<p class="text-body text-ink">{copy.confirm.text(time, day, String(minutes))}</p>
			<p class="text-body-sm text-ink-muted">{copy.confirm.with(held.practitionerName)}</p>
			<div class="flex flex-wrap gap-3">
				<Button
					type="submit"
					size="lg"
					arrow
					attrs={{
						"data-on:click__prevent": `@post('${routes.confirm}', {contentType: 'form'})`,
						"data-attr:disabled": "$sending",
					}}
				>
					{copy.confirm.submit}
				</Button>
				<Button
					type="submit"
					variant="ghost"
					attrs={{
						formaction: routes.release,
						"data-on:click__prevent": `@post('${routes.release}', {contentType: 'form'})`,
						"data-attr:disabled": "$sending",
					}}
				>
					{copy.confirm.change}
				</Button>
			</div>
		</form>
	);
}

/** The request is in: the reference, and the cancel code shown this once. */
export function BookingRequested({
	env,
	name,
	reference,
	cancelCode,
	start,
	timeZone,
	id = "booking",
	inAccount,
	cancelInChat = false,
}: {
	env: BookingEnv;
	name: string;
	reference: string;
	cancelCode: string;
	start: number;
	timeZone: string;
	id?: string;
	/** The person's account bookings page, when the request was made signed in. */
	inAccount?: string;
	/** In the guide's chat: say that the code cancels there too. */
	cancelInChat?: boolean;
}): JSX.Element {
	const { requested } = env.copy;
	const { day, time } = wallClock(start, timeZone, env.locale);
	return (
		<div id={id}>
			<GlassCard class="pz-edge space-y-4">
				<h2 class="display text-headline text-ink">{requested.title(name)}</h2>
				<p class="text-body text-ink-muted">{requested.text(time, day)}</p>
				<dl class="space-y-3">
					<div>
						<dt class="text-body-sm text-ink-muted">{requested.reference}</dt>
						<dd class="font-mono text-title text-ink" data-reference>
							{reference}
						</dd>
					</div>
					<div>
						<dt class="text-body-sm text-ink-muted">{requested.cancel}</dt>
						<dd class="font-mono text-body text-ink">{cancelCode}</dd>
					</div>
				</dl>
				{cancelInChat ? <p class="text-body-sm text-ink-muted">{requested.cancelHow}</p> : null}
				{inAccount === undefined || requested.inAccount === undefined ? null : (
					<p class="text-body-sm text-ink-muted">
						{`${requested.inAccount.text} `}
						<a class="underline" href={inAccount}>
							{requested.inAccount.link}
						</a>
					</p>
				)}
			</GlassCard>
		</div>
	);
}
