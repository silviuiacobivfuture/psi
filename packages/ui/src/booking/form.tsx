/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { FIELD_LIMITS } from "@psi/scheduling";
import type { JSX } from "hono/jsx/jsx-runtime";
import { Button } from "../components/button";
import { ChoiceGroup } from "../components/choice-group";
import { TAKE_FOCUS } from "../components/take-focus";
import { TextArea } from "../components/text-area";
import { TextField } from "../components/text-field";
import { type Schedule, ScheduleSection } from "./schedule";
import { fieldPrefix, PERIODS, periodsOf } from "./schemas";
import type { AccountLine, BookingEnv, BookingErrors, BookingValues } from "./types";

/** The "when" boxes ticked: what was sent, or "any time" when nothing was. */
function whenChecked(raw: string | undefined): ReadonlyArray<string> {
	const chosen = periodsOf(raw);
	return chosen.length === 0 ? ["any"] : chosen;
}

/** The first field with an error, in the order the form shows them: it takes the focus. */
const ORDER = ["name", "age", "phone", "email", "details", "forWhom", "when", "consent"] as const;
function firstError(errors: BookingErrors): (typeof ORDER)[number] | undefined {
	return ORDER.find((field) => errors[field] !== undefined);
}

/** A field's input attributes: its own, plus focus when it is the first with an error. */
function attrs(
	field: (typeof ORDER)[number],
	errors: BookingErrors,
	own: Record<string, string>,
): Record<string, string> {
	return firstError(errors) === field ? { ...own, ...TAKE_FOCUS } : own;
}

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
			// One request at a time: Enter in a field submits even while the button is disabled.
			data-on:submit__prevent={`$sending || @post('${routes.booking}', {contentType: 'form'})`}
			data-indicator="sending"
			data-attr:aria-busy="$sending ? 'true' : 'false'"
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
					<TextArea
						id={`${f}-details`}
						name="details"
						label={copy.fields.details}
						value={values.details ?? ""}
						hint={copy.fields.detailsHint}
						minLength={FIELD_LIMITS.detailsMin}
						maxLength={FIELD_LIMITS.detailsMax}
						minHint={copy.fields.detailsMin}
						invalid={copy.errors.details}
						{...(errors.details === undefined ? {} : { error: errors.details })}
						required
						attrs={attrs("details", errors, {})}
					/>
					{onlyAudience !== undefined && env.audiences.length === 1 ? (
						<input type="hidden" name="forWhom" value={onlyAudience} />
					) : (
						<ChoiceGroup
							id={`${f}-for`}
							name="forWhom"
							type="radio"
							legend={copy.audience.legend}
							options={env.audiences.map((audience) => ({
								value: audience,
								label: copy.audience.labels[audience] ?? audience,
							}))}
							checked={values.forWhom === undefined ? [] : [values.forWhom]}
							required
							autofocus={firstError(errors) === "forWhom"}
							{...(errors.forWhom === undefined ? {} : { error: errors.forWhom })}
						/>
					)}
					{picking ? (
						<input type="hidden" name="when" value="any" />
					) : (
						<ChoiceGroup
							id={`${f}-when`}
							name="when"
							type="checkbox"
							legend={copy.when.legend}
							options={PERIODS.map((period) => ({
								value: period,
								label: copy.when.labels[period],
							}))}
							checked={whenChecked(values.when)}
							exclusive="any"
							autofocus={firstError(errors) === "when"}
							{...(errors.when === undefined ? {} : { error: errors.when })}
						/>
					)}
					<div class="space-y-2">
						<label class="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-body-sm text-ink">
							<input
								type="checkbox"
								name="consent"
								value="yes"
								checked={values.consent === "yes"}
								required
								aria-invalid={errors.consent !== undefined ? "true" : undefined}
								aria-describedby={errors.consent !== undefined ? `${f}-consent-error` : undefined}
								class="mt-0.5 size-5 flex-none cursor-pointer accent-[var(--accent)]"
								{...(firstError(errors) === "consent" ? TAKE_FOCUS : {})}
							/>
							<span>{copy.fields.consent}</span>
						</label>
						{errors.consent ? (
							<p class="pz-field__error" id={`${f}-consent-error`}>
								{errors.consent}
							</p>
						) : null}
					</div>
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
