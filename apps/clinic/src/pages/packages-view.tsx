import type { JSX } from "hono/jsx/jsx-runtime";
import { z } from "zod";
import { ledger } from "../domain/ledger";
import { formatMoney, moneyInput } from "../domain/money";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { Package } from "../port/schema";

/** What the package form sends: every field as the person typed it. */
export const PackageSignalsSchema = z.object({
	pk: z.record(
		z.object({
			name: z.string().max(120),
			sessions: z.coerce.number().int().min(0).max(999),
			bonus: z.coerce.number().int().min(0).max(999),
			used: z.coerce.number().int().min(0).max(999),
			total: z.string().max(24),
			paid: z.string().max(24),
			note: z.string().max(1000),
		}),
	),
});

/** Total, paid and remaining, as the page shows them and as the live update patches them in. */
export function PackageSummary({
	id,
	totalBani,
	paidBani,
	left,
	locale,
}: {
	id: string;
	totalBani: number;
	paidBani: number;
	left: number;
	locale: Locale;
}): JSX.Element {
	const o = at(locale);
	const l = ledger(totalBani, paidBani);
	const state =
		l.state === "unpaid"
			? m.pkg_state_unpaid({}, o)
			: l.state === "partial"
				? m.pkg_state_partial({}, o)
				: l.state === "paid"
					? m.pkg_state_paid({}, o)
					: m.pkg_state_overpaid({ amount: formatMoney(-l.remainingBani, locale) }, o);
	const tone =
		l.state === "paid"
			? "confirmed"
			: l.state === "unpaid"
				? "cancelled"
				: l.state === "partial"
					? "requested"
					: "attended";
	return (
		<div id={`pk-${id}-summary`} class="pk__summary" aria-live="polite">
			<div class="adm-stat">
				<span class="adm-stat__value" data-testid="remaining">
					{formatMoney(Math.max(0, l.remainingBani), locale)}
				</span>
				<span class="adm-stat__label">{m.pkg_remaining({}, o)}</span>
			</div>
			<span class={`adm-pill adm-pill--${tone}`} data-state={l.state}>
				{state}
			</span>
			<div class="adm-stat">
				<span class="adm-stat__value">{left}</span>
				<span class="adm-stat__label">{m.pkg_sessions_left({}, o)}</span>
			</div>
		</div>
	);
}

export function PackageCard({
	clientId,
	pkg,
	locale,
	left,
	canEdit = true,
}: {
	clientId: string;
	pkg: Package;
	locale: Locale;
	left: number;
	/** Without edit rights (or while only viewing as someone else) the fields are shown, not editable. */
	canEdit?: boolean;
}): JSX.Element {
	const o = at(locale);
	const base = `/clients/${clientId}/packages/${pkg.id}`;
	const signals = JSON.stringify({
		pk: {
			[pkg.id]: {
				name: pkg.name,
				sessions: pkg.sessions,
				bonus: pkg.bonus,
				used: pkg.used,
				total: moneyInput(pkg.totalBani, locale),
				paid: moneyInput(pkg.paidBani, locale),
				note: pkg.note,
			},
		},
	});
	const bind = (field: string): Record<string, string> => ({
		[`data-bind:pk.${pkg.id}.${field}`]: "",
	});
	const live = { "data-on:input__debounce.250ms": `@post('${base}/calc')` };
	return (
		<form
			class="adm-card pk"
			data-signals={signals}
			data-on:submit__prevent={`@post('${base}/save')`}
			id={`pk-${pkg.id}`}
			{...live}
		>
			<PackageSummary
				id={pkg.id}
				totalBani={pkg.totalBani}
				paidBani={pkg.paidBani}
				left={left}
				locale={locale}
			/>
			<fieldset
				class="pk__fields"
				disabled={!canEdit}
				style="border:0;padding:0;margin:0;min-width:0"
			>
				<label class="adm-field pk__wide">
					<span>{m.pkg_name({}, o)}</span>
					<input class="adm-input" type="text" {...bind("name")} />
				</label>
				<label class="adm-field">
					<span>{m.pkg_sessions({}, o)}</span>
					<input
						class="adm-input"
						type="number"
						min="0"
						inputmode="numeric"
						{...bind("sessions")}
					/>
				</label>
				<label class="adm-field">
					<span>{m.pkg_bonus({}, o)}</span>
					<input class="adm-input" type="number" min="0" inputmode="numeric" {...bind("bonus")} />
				</label>
				<label class="adm-field">
					<span>{m.pkg_used({}, o)}</span>
					<input class="adm-input" type="number" min="0" inputmode="numeric" {...bind("used")} />
				</label>
				<label class="adm-field">
					<span>{m.pkg_total({}, o)}</span>
					<input
						class="adm-input"
						type="text"
						inputmode="decimal"
						autocomplete="off"
						{...bind("total")}
					/>
				</label>
				<label class="adm-field">
					<span>{m.pkg_paid({}, o)}</span>
					<input
						class="adm-input"
						type="text"
						inputmode="decimal"
						autocomplete="off"
						{...bind("paid")}
					/>
				</label>
				<label class="adm-field pk__wide">
					<span>{m.pkg_note({}, o)}</span>
					<textarea class="adm-input" {...bind("note")} />
				</label>
			</fieldset>
			{canEdit ? (
				<button class="adm-btn adm-btn--primary" type="submit">
					{m.pkg_save({}, o)}
				</button>
			) : null}
		</form>
	);
}
