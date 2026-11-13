/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";
import { Button } from "../components/button";
import { TextField } from "../components/text-field";
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
	const showDetails = !picking || (view?.kind === "ready" && view.data.selected !== undefined);
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
					/>
					<div class="grid gap-5 sm:grid-cols-2">
						<TextField
							id={`${f}-email`}
							name="email"
							type="email"
							label={copy.fields.email}
							value={values.email}
							error={errors.contact}
							hint={errors.contact ? undefined : copy.fields.contactHint}
						/>
						<TextField
							id={`${f}-phone`}
							name="phone"
							type="tel"
							label={copy.fields.phone}
							value={values.phone}
						/>
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
				(["name", "email", "phone", "forWhom"] as const).map((field) =>
					values[field] === undefined || values[field] === "" ? null : (
						<input type="hidden" name={field} value={values[field]} />
					),
				)
			)}
		</form>
	);
}
