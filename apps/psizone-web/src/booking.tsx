import { Button, GlassCard, TextField } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { z } from "zod";
import { type Schedule, ScheduleSection } from "./booking-schedule";
import { at, base, type Locale } from "./i18n";
import { m } from "./paraglide/messages.js";

/** A booking request carries logistics only: never health details, never free text. */
export const BookingRequest = z
	.object({
		name: z.string().trim().min(2).max(80),
		email: z.union([z.string().trim().email().max(120), z.literal("")]).default(""),
		phone: z
			.union([
				z
					.string()
					.trim()
					.regex(/^\+?[0-9 ()-]{9,20}$/),
				z.literal(""),
			])
			.default(""),
		forWhom: z.enum(["child", "teen", "adult"]),
		when: z.enum(["morning", "afternoon", "any"]).default("any"),
		/** A free slot's id when scheduling is on; empty (or absent) means "call me back". */
		slot: z.string().max(120).default(""),
		/** The service the slot is for; empty means the store's default. */
		service: z.union([z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/), z.literal("")]).default(""),
		/** "1" when the form is the booking page's (service cards), so every step re-renders it so. */
		cards: z.enum(["1", ""]).catch(""),
		consent: z.literal("yes"),
	})
	.refine((v) => v.email !== "" || v.phone !== "", { path: ["contact"] });

/** The confirm step's form: the hold it confirms and the contact typed in the first step. */
export const BookingConfirmation = z.object({
	reference: z.string().trim().min(8).max(12),
	holdToken: z.string().trim().min(16).max(64),
	name: z.string().trim().min(2).max(80),
	email: z.string().trim().max(120).default(""),
	phone: z.string().trim().max(20).default(""),
	forWhom: z.enum(["child", "teen", "adult"]),
	when: z.enum(["morning", "afternoon", "any"]).default("any"),
	/** The held slot's start (UTC ms), carried so a failed confirm still tells the team the time. */
	start: z.union([z.string().regex(/^[0-9]{10,15}$/), z.literal("")]).default(""),
	consent: z.literal("yes"),
});

/**
 * Which booking form a request belongs to: the contact page's, or the one inside the guide's
 * conversation (the compass can open it on /contact too). Every step answers with the same id, so
 * Datastar patches the form that was sent and never the other one.
 */
export const FormIdSchema = z
	.string()
	.regex(/^(?:booking|chat-booking(?:-[a-z0-9]{4,12})?)$/)
	.catch("booking");
export type FormId = z.infer<typeof FormIdSchema>;

/** The prefix of a form's field ids, so two forms in one page never share an id. */
function fieldPrefix(id: FormId): string {
	return id === "booking" ? "b" : id.replace("chat-booking", "cb");
}

export type BookingErrors = Partial<
	Record<"name" | "contact" | "forWhom" | "consent" | "slot", string>
>;
export type BookingValues = Partial<
	Record<"name" | "email" | "phone" | "forWhom" | "when" | "slot" | "service", string>
>;

const INTL_LOCALE: Readonly<Record<Locale, string>> = { ro: "ro-RO", en: "en-GB" };

/** "marți, 18 noiembrie" and "10:15", in the practice's zone (daylight saving included). */
export function wallClock(
	start: number,
	timeZone: string,
	locale: Locale,
): { day: string; time: string } {
	const tag = INTL_LOCALE[locale];
	const day = new Intl.DateTimeFormat(tag, {
		timeZone,
		weekday: "long",
		day: "numeric",
		month: "long",
	}).format(start);
	const time = new Intl.DateTimeFormat(tag, {
		timeZone,
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).format(start);
	return { day, time };
}

/** Maps the parser's issues to the field errors a person reads. */
export function errorsFor(
	issues: ReadonlyArray<z.ZodIssue>,
	locale: Locale,
	values: BookingValues,
): BookingErrors {
	const o = at(locale);
	const errors: BookingErrors = {};
	for (const issue of issues) {
		const field = issue.path[0];
		if (field === "name") errors.name = m.form_err_name({}, o);
		else if (field === "email" || field === "phone" || field === "contact")
			errors.contact = m.form_err_contact({}, o);
		else if (field === "forWhom") errors.forWhom = m.form_err_for({}, o);
		else if (field === "consent") errors.consent = m.form_err_consent({}, o);
	}
	// The either-or rule runs only once every field parses, so check it directly as well.
	if ((values.email ?? "").trim() === "" && (values.phone ?? "").trim() === "")
		errors.contact = m.form_err_contact({}, o);
	return errors;
}

function Choice({
	name,
	value,
	label,
	checked,
}: {
	name: string;
	value: string;
	label: string;
	checked: boolean;
}): JSX.Element {
	return (
		<label class="pz-chip cursor-pointer has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
			<input class="sr-only" type="radio" name={name} value={value} checked={checked} />
			{label}
		</label>
	);
}

/** The form region, re-rendered by the server after every submit (patched by id). */
export function BookingForm({
	locale,
	values = {},
	errors = {},
	schedule,
	id = "booking",
	account,
	compact = false,
}: {
	locale: Locale;
	values?: BookingValues;
	errors?: BookingErrors;
	/** The schedule picker (scheduling on); absent keeps the callback form alone. */
	schedule?: Schedule;
	/** Inside a conversation bubble: the picker draws in its compact variant. */
	compact?: boolean;
	id?: FormId;
	/**
	 * The estate account, when sign-in is available: a signed-in person is told the form was filled
	 * from their profile (and the request lands in their account); anyone else is invited to sign in.
	 */
	account?: { signedIn: true } | { signedIn: false; signInHref: string };
}): JSX.Element {
	const o = at(locale);
	const f = fieldPrefix(id);
	const view = schedule?.view;
	// A time is being chosen: the contact fields wait for one; a call, or a store that cannot be read, skips it.
	const picking = view?.kind === "ready" && schedule?.callback !== true;
	const showDetails = !picking || (view?.kind === "ready" && view.data.selected !== undefined);
	return (
		<form
			id={id}
			method="post"
			action={`${base(locale)}/programare`}
			class="space-y-7"
			novalidate
			data-on:submit__prevent={`@post('${base(locale)}/programare', {contentType: 'form'})`}
			data-indicator="sending"
		>
			<input type="hidden" name="form" value={id} />
			{account === undefined ? null : account.signedIn ? (
				<p class="text-body-sm text-ink-muted">{m.form_signed_in({}, o)}</p>
			) : (
				<p class="text-body-sm text-ink-muted">
					{`${m.form_sign_in_hint({}, o)} `}
					<a class="underline" href={account.signInHref}>
						{m.form_sign_in({}, o)}
					</a>
				</p>
			)}
			{schedule === undefined ? null : (
				<ScheduleSection locale={locale} id={id} schedule={schedule} compact={compact} />
			)}
			{errors.slot ? <p class="text-body-sm text-danger">{errors.slot}</p> : null}
			{showDetails ? (
				<div class="space-y-7">
					{schedule === undefined ? null : (
						<>
							<h3 class="pz-field__label">{m.pick_details({}, o)}</h3>
							{picking ? (
								<p class="-mt-4 text-body-sm text-ink-muted">{m.pick_details_hint({}, o)}</p>
							) : null}
						</>
					)}
					<TextField
						id={`${f}-name`}
						name="name"
						label={m.form_name({}, o)}
						value={values.name}
						error={errors.name}
					/>
					<div class="grid gap-5 sm:grid-cols-2">
						<TextField
							id={`${f}-email`}
							name="email"
							type="email"
							label={m.form_email({}, o)}
							value={values.email}
							error={errors.contact}
							hint={errors.contact ? undefined : m.form_contact_hint({}, o)}
						/>
						<TextField
							id={`${f}-phone`}
							name="phone"
							type="tel"
							label={m.form_phone({}, o)}
							value={values.phone}
						/>
					</div>
					<fieldset class="space-y-3">
						<legend class="pz-field__label">{m.form_for({}, o)}</legend>
						<div class="flex flex-wrap gap-2">
							<Choice
								name="forWhom"
								value="child"
								label={m.form_for_child({}, o)}
								checked={values.forWhom === "child"}
							/>
							<Choice
								name="forWhom"
								value="teen"
								label={m.form_for_teen({}, o)}
								checked={values.forWhom === "teen"}
							/>
							<Choice
								name="forWhom"
								value="adult"
								label={m.form_for_adult({}, o)}
								checked={values.forWhom === "adult"}
							/>
						</div>
						{errors.forWhom ? <p class="text-body-sm text-danger">{errors.forWhom}</p> : null}
					</fieldset>
					{picking ? (
						<input type="hidden" name="when" value="any" />
					) : (
						<fieldset class="space-y-3">
							<legend class="pz-field__label">{m.form_when({}, o)}</legend>
							<div class="flex flex-wrap gap-2">
								<Choice
									name="when"
									value="morning"
									label={m.form_when_morning({}, o)}
									checked={values.when === "morning"}
								/>
								<Choice
									name="when"
									value="afternoon"
									label={m.form_when_afternoon({}, o)}
									checked={values.when === "afternoon"}
								/>
								<Choice
									name="when"
									value="any"
									label={m.form_when_any({}, o)}
									checked={values.when === undefined || values.when === "any"}
								/>
							</div>
						</fieldset>
					)}
					<label class="flex items-start gap-3 text-body-sm text-ink">
						<input
							type="checkbox"
							name="consent"
							value="yes"
							class="mt-1 size-5 accent-[var(--accent)]"
						/>
						<span>{m.form_consent({}, o)}</span>
					</label>
					{errors.consent ? <p class="-mt-4 text-body-sm text-danger">{errors.consent}</p> : null}
					<Button type="submit" size="lg" arrow attrs={{ "data-attr:disabled": "$sending" }}>
						{m.form_submit({}, o)}
					</Button>
				</div>
			) : (
				// The details wait for a time: what was typed stays in the form, so a change of week or day loses nothing.
				(["name", "email", "phone", "forWhom"] as const).map((field) =>
					values[field] === undefined || values[field] === "" ? null : (
						<input type="hidden" name={field} value={values[field]} />
					),
				)
			)}
		</form>
	);
}

/** What replaces the form once the request has reached the team (stored or e-mailed). */
export function BookingDone({
	locale,
	name,
	id = "booking",
}: {
	locale: Locale;
	name: string;
	id?: FormId;
}): JSX.Element {
	const o = at(locale);
	return (
		<div id={id}>
			<GlassCard class="pz-edge space-y-4">
				<h2 class="display text-headline text-ink">{m.form_ok_title({ name }, o)}</h2>
				<p class="text-body text-ink-muted">{m.callback_ok_text({}, o)}</p>
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
	locale,
	held,
	id = "booking",
}: {
	locale: Locale;
	held: HeldBooking;
	id?: FormId;
}): JSX.Element {
	const o = at(locale);
	const { day, time } = wallClock(held.start, held.timeZone, locale);
	const minutes = Math.max(1, Math.round((held.expiresAt - Date.now()) / 60_000));
	const prefix = base(locale);
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
		<form
			id={id}
			method="post"
			action={`${prefix}/programare/confirma`}
			class="space-y-6"
			data-indicator="sending"
		>
			{carried.map(([name, value]) => (
				<input type="hidden" name={name} value={value} />
			))}
			<h2 class="display text-headline text-ink">{m.confirm_title({}, o)}</h2>
			<p class="text-body text-ink">{m.confirm_text({ time, day, minutes: String(minutes) }, o)}</p>
			<p class="text-body-sm text-ink-muted">
				{m.confirm_with({ practitioner: held.practitionerName }, o)}
			</p>
			<div class="flex flex-wrap gap-3">
				<Button
					type="submit"
					size="lg"
					arrow
					attrs={{
						"data-on:click__prevent": `@post('${prefix}/programare/confirma', {contentType: 'form'})`,
						"data-attr:disabled": "$sending",
					}}
				>
					{m.confirm_submit({}, o)}
				</Button>
				<Button
					type="submit"
					variant="ghost"
					attrs={{
						formaction: `${prefix}/programare/renunta`,
						"data-on:click__prevent": `@post('${prefix}/programare/renunta', {contentType: 'form'})`,
						"data-attr:disabled": "$sending",
					}}
				>
					{m.confirm_change({}, o)}
				</Button>
			</div>
		</form>
	);
}

/** The request is in: the reference, and the cancel code shown this once. */
export function BookingRequested({
	locale,
	name,
	reference,
	cancelCode,
	start,
	timeZone,
	id = "booking",
	inAccount,
	cancelInChat = false,
}: {
	locale: Locale;
	name: string;
	reference: string;
	cancelCode: string;
	start: number;
	timeZone: string;
	id?: FormId;
	/** The person's account bookings page, when the request was made signed in. */
	inAccount?: string;
	/** In the guide's chat: say that the code cancels there too. */
	cancelInChat?: boolean;
}): JSX.Element {
	const o = at(locale);
	const { day, time } = wallClock(start, timeZone, locale);
	return (
		<div id={id}>
			<GlassCard class="pz-edge space-y-4">
				<h2 class="display text-headline text-ink">{m.requested_title({ name }, o)}</h2>
				<p class="text-body text-ink-muted">{m.requested_text({ time, day }, o)}</p>
				<dl class="space-y-3">
					<div>
						<dt class="text-body-sm text-ink-muted">{m.requested_reference({}, o)}</dt>
						<dd class="font-mono text-title text-ink" data-reference>
							{reference}
						</dd>
					</div>
					<div>
						<dt class="text-body-sm text-ink-muted">{m.requested_cancel({}, o)}</dt>
						<dd class="font-mono text-body text-ink">{cancelCode}</dd>
					</div>
				</dl>
				{cancelInChat ? (
					<p class="text-body-sm text-ink-muted">{m.requested_cancel_how({}, o)}</p>
				) : null}
				{inAccount === undefined ? null : (
					<p class="text-body-sm text-ink-muted">
						{`${m.requested_in_account({}, o)} `}
						<a class="underline" href={inAccount}>
							{m.requested_in_account_link({}, o)}
						</a>
					</p>
				)}
			</GlassCard>
		</div>
	);
}
