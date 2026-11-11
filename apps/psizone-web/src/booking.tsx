import { Button, GlassCard, StatusBadge, TextField } from "@psi/ui";
import type { JSX } from "hono/jsx/jsx-runtime";
import { z } from "zod";
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
		consent: z.literal("yes"),
	})
	.refine((v) => v.email !== "" || v.phone !== "", { path: ["contact"] });

export type BookingErrors = Partial<Record<"name" | "contact" | "forWhom" | "consent", string>>;
export type BookingValues = Partial<
	Record<"name" | "email" | "phone" | "forWhom" | "when", string>
>;

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
}: {
	locale: Locale;
	values?: BookingValues;
	errors?: BookingErrors;
}): JSX.Element {
	const o = at(locale);
	return (
		<form
			id="booking"
			method="post"
			action={`${base(locale)}/programare`}
			class="space-y-7"
			novalidate
			data-on:submit__prevent={`@post('${base(locale)}/programare', {contentType: 'form'})`}
			data-indicator="sending"
		>
			<TextField
				id="b-name"
				name="name"
				label={m.form_name({}, o)}
				value={values.name}
				error={errors.name}
			/>
			<div class="grid gap-5 sm:grid-cols-2">
				<TextField
					id="b-email"
					name="email"
					type="email"
					label={m.form_email({}, o)}
					value={values.email}
					error={errors.contact}
					hint={errors.contact ? undefined : m.form_contact_hint({}, o)}
				/>
				<TextField
					id="b-phone"
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
		</form>
	);
}

/** What replaces the form once the request is valid. Honest about not being connected yet. */
export function BookingDone({ locale, name }: { locale: Locale; name: string }): JSX.Element {
	const o = at(locale);
	return (
		<div id="booking">
			<GlassCard class="pz-edge space-y-4">
				<h2 class="display text-headline text-ink">{m.form_ok_title({ name }, o)}</h2>
				<p class="text-body text-ink-muted">{m.form_ok_text({}, o)}</p>
				<StatusBadge tone="warning">{m.form_not_connected({}, o)}</StatusBadge>
			</GlassCard>
		</div>
	);
}
