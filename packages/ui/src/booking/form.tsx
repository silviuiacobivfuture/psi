/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { Button } from "../components/button";
import { TextField } from "../components/text-field";
import { cx } from "../cx";
import { type Schedule, ScheduleSection } from "./schedule";
import { fieldPrefix } from "./schemas";
import type { AccountLine, BookingEnv, BookingErrors, BookingValues } from "./types";

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

/** The first field with an error, in the order the form shows them: it takes the focus. */
const ORDER = ["name", "age", "phone", "email", "details", "forWhom", "consent"] as const;
function firstError(errors: BookingErrors): (typeof ORDER)[number] | undefined {
	return ORDER.find((field) => errors[field] !== undefined);
}

/** A field's input attributes: its own, plus focus when it is the first with an error. */
function attrs(
	field: (typeof ORDER)[number],
	errors: BookingErrors,
	own: Record<string, string>,
): Record<string, string> {
	return firstError(errors) === field ? { ...own, autofocus: "autofocus" } : own;
}

const PERIODS = ["morning", "afternoon", "any"] as const;

/** The form region, re-rendered by the server after every submit (patched by id). */
export function BookingForm({
	env,
	values = {},
	errors = {},
	schedule,
	id = "booking",
	account,
	compact = false,
}: {
	env: BookingEnv;
	values?: BookingValues;
	errors?: BookingErrors;
	/** The schedule picker (scheduling on); absent keeps the callback form alone. */
	schedule?: Schedule;
	/** Inside a conversation bubble: the picker draws in its compact variant. */
	compact?: boolean;
	id?: string;
	/**
	 * The estate account, when sign-in is available: a signed-in person is told the form was filled
	 * from their profile; anyone else is invited to sign in.
	 */
	account?: AccountLine;
}): JSX.Element {
	const { copy, routes } = env;
	const f = fieldPrefix(id);
	const view = schedule?.view;
	const [onlyAudience] = env.audiences;
	// A time is being chosen: the contact fields wait for one; a call, or a store that cannot be read, skips it.
	const picking = view?.kind === "ready" && schedule?.callback !== true;
	// A pause that closes callbacks too leaves the phones alone: no form to send.
	const closed = view?.kind === "paused" && !view.pause.callbacksOpen;
	const showDetails =
		!closed && (!picking || (view?.kind === "ready" && view.data.selected !== undefined));
	return (
		<form
			id={id}
			method="post"
			action={routes.booking}
			class="space-y-7"
			novalidate
			data-on:submit__prevent={`@post('${routes.booking}', {contentType: 'form'})`}
			data-indicator="sending"
		>
			<input type="hidden" name="form" value={id} />
			{account === undefined ? null : account.signedIn ? (
				<p class="text-body-sm text-ink-muted">{copy.account.signedIn}</p>
			) : (
				<p class="text-body-sm text-ink-muted">
					{`${copy.account.signInHint} `}
					<a class="underline" href={account.signInHref}>
						{copy.account.signIn}
					</a>
				</p>
			)}
			{schedule === undefined ? null : (
				<ScheduleSection env={env} id={id} schedule={schedule} compact={compact} />
			)}
			{errors.slot ? <p class="text-body-sm text-danger">{errors.slot}</p> : null}
			{showDetails ? (
				<div class="space-y-7">
					{schedule === undefined ? null : (
						<>
							<h3 class="pz-field__label">{copy.details.title}</h3>
							{picking ? (
								<p class="-mt-4 text-body-sm text-ink-muted">{copy.details.hint}</p>
							) : null}
						</>
					)}
					<TextField
						id={`${f}-name`}
						name="name"
						label={copy.fields.name}
						value={values.name}
						error={errors.name}
						hint={copy.fields.nameHint}
						autocomplete="name"
						required
						attrs={attrs("name", errors, { minlength: "2", maxlength: "100" })}
					/>
					<div class="grid gap-5 sm:grid-cols-2">
						<TextField
							id={`${f}-age`}
							name="age"
							label={copy.fields.age}
							value={values.age}
							error={errors.age}
							hint={copy.fields.ageHint}
							autocomplete="off"
							required
							attrs={attrs("age", errors, {
								inputmode: "numeric",
								pattern: "[0-9]{1,3}",
								maxlength: "3",
							})}
						/>
						<TextField
							id={`${f}-phone`}
							name="phone"
							type="tel"
							label={copy.fields.phone}
							value={values.phone}
							error={errors.phone}
							required
							attrs={attrs("phone", errors, { inputmode: "tel" })}
						/>
					</div>
					<TextField
						id={`${f}-email`}
						name="email"
						type="email"
						label={copy.fields.email}
						value={values.email}
						error={errors.email}
						required
						attrs={attrs("email", errors, { inputmode: "email", maxlength: "120" })}
					/>
					<div class={cx("pz-field", errors.details !== undefined && "pz-field--error")}>
						<label class="pz-field__label" for={`${f}-details`}>
							{copy.fields.details}
						</label>
						<textarea
							class="pz-input"
							id={`${f}-details`}
							name="details"
							rows={5}
							required
							minlength={10}
							maxlength={2000}
							aria-invalid={errors.details !== undefined ? "true" : undefined}
							aria-describedby={`${f}-details-hint`}
							{...(firstError(errors) === "details" ? { autofocus: true } : {})}
						>
							{values.details ?? ""}
						</textarea>
						<span class="pz-field__hint" id={`${f}-details-hint`}>
							{errors.details ?? copy.fields.detailsHint}
						</span>
					</div>
					{onlyAudience !== undefined && env.audiences.length === 1 ? (
						<input type="hidden" name="forWhom" value={onlyAudience} />
					) : (
						<fieldset class="space-y-3">
							<legend class="pz-field__label">{copy.audience.legend}</legend>
							<div class="flex flex-wrap gap-2">
								{env.audiences.map((audience) => (
									<Choice
										name="forWhom"
										value={audience}
										label={copy.audience.labels[audience] ?? audience}
										checked={values.forWhom === audience}
									/>
								))}
							</div>
							{errors.forWhom ? <p class="text-body-sm text-danger">{errors.forWhom}</p> : null}
						</fieldset>
					)}
					{picking ? (
						<input type="hidden" name="when" value="any" />
					) : (
						<fieldset class="space-y-3">
							<legend class="pz-field__label">{copy.when.legend}</legend>
							<div class="flex flex-wrap gap-2">
								{PERIODS.map((period) => (
									<Choice
										name="when"
										value={period}
										label={copy.when.labels[period]}
										checked={
											period === "any"
												? values.when === undefined || values.when === "any"
												: values.when === period
										}
									/>
								))}
							</div>
						</fieldset>
					)}
					<label class="flex items-start gap-3 text-body-sm text-ink">
						<input
							type="checkbox"
							name="consent"
							value="yes"
							checked={values.consent === "yes"}
							class="mt-1 size-5 accent-[var(--accent)]"
						/>
						<span>{copy.fields.consent}</span>
					</label>
					{errors.consent ? <p class="-mt-4 text-body-sm text-danger">{errors.consent}</p> : null}
					<Button type="submit" size="lg" arrow attrs={{ "data-attr:disabled": "$sending" }}>
						{copy.fields.submit}
					</Button>
				</div>
			) : (
				// The details wait for a time: what was typed stays in the form, so a change of week or day loses nothing.
				(["name", "age", "details", "email", "phone", "forWhom"] as const).map((field) =>
					values[field] === undefined || values[field] === "" ? null : (
						<input type="hidden" name={field} value={values[field]} />
					),
				)
			)}
		</form>
	);
}
