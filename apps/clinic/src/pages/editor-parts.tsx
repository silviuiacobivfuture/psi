import {
	AUTHORITY_NEEDED,
	OVERRIDE_AUTHORITIES,
	type OverrideAuthority,
} from "@psi/scheduling/clinic";
import { Icon } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Conflict, Suggestions } from "../domain/conflicts";
import { ledger } from "../domain/ledger";
import { formatAmount } from "../domain/money";
import { packageUsage, paidBani } from "../domain/usage";
import { hhmm } from "../lib/dates";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { Appointment, Client, Column, Package } from "../port/schema";
import type { BlacklistEntry } from "../port/schema-clinical";
import { initials } from "./appt-tile";
import { BlacklistBadge } from "./client-flags";

const bind = (k: string): Record<string, string> => ({ [`data-bind:ed.${k}`]: "" });
const quote = (s: string): string => JSON.stringify(s);

/** Who matches what was typed: a monogram, the name, the phone. One tap chooses. */
export function ClientResults({
	clients,
	query,
	locale,
}: {
	clients: ReadonlyArray<Client>;
	query: string;
	locale: Locale;
}): JSX.Element {
	const o = at(locale);
	return (
		<div id="ed-clients" class="ed-results" role="status">
			{query.trim() === "" ? null : clients.length === 0 ? (
				<p class="adm-muted">{m.ap_no_client({ q: query }, o)}</p>
			) : (
				<ul class="ed-results__list">
					{clients.map((c) => (
						<li key={c.id}>
							<button
								type="button"
								class="ed-client"
								data-on:click={`$ed.client = ${quote(c.id)}; $ed.clientName = ${quote(c.name)}; $ed.q = ''; $ed.newc = false; @post('/calendar/editor/check')`}
							>
								<span class="cal__mono" aria-hidden="true">
									{initials(c.name)}
								</span>
								<span class="ed-client__text">
									<strong>{c.name}</strong>
									<span class="adm-muted">{c.phone ?? ""}</span>
								</span>
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

/**
 * The chosen client is on the blacklist: a warning, or a block, with the reason staff may read and a field for why they
 * book anyway. Empty when the client is not listed. Saving is refused until the reason is typed (and, for a block, the
 * person holds the override it asks for).
 */
export function BlacklistPanel({
	entry,
	locale,
	authority,
}: {
	entry: BlacklistEntry | null;
	locale: Locale;
	authority: OverrideAuthority;
}): JSX.Element {
	const o = at(locale);
	if (entry === null) return <div id="ed-blacklist" role="status" aria-live="polite" />;
	const needs = AUTHORITY_NEEDED[entry.severity];
	const rank = (a: OverrideAuthority): number => OVERRIDE_AUTHORITIES.indexOf(a);
	const may = rank(authority) >= rank(needs);
	const blocks = entry.severity !== "warn";
	return (
		<section
			id="ed-blacklist"
			class={`ed-section cl-flagpanel ${blocks ? "cl-flagpanel--block" : "cl-flagpanel--warn"}`}
			role="alert"
			data-blacklist-panel={entry.severity}
		>
			<BlacklistBadge entry={entry} locale={locale} />
			<p>
				{blocks
					? may
						? m.cl_gate_blocked_may({}, o)
						: needs === "admin"
							? m.cl_gate_blocked_admin({}, o)
							: m.cl_gate_blocked_staff({}, o)
					: m.cl_gate_warn({}, o)}
			</p>
			{may ? (
				<label class="adm-field">
					<span>{m.cl_gate_reason({}, o)}</span>
					<textarea class="adm-input" rows={2} maxlength={500} {...bind("override")} />
				</label>
			) : null}
		</section>
	);
}

const names = (ids: ReadonlyArray<string>, columns: ReadonlyArray<Column>): string =>
	ids.map((id) => columns.find((c) => c.id === id)?.name ?? id).join(", ");

/** What the chosen time collides with, in words, and a way out: a later time, or a free colleague. */
export function ConflictPanel({
	conflicts,
	suggestions,
	columns,
	locale,
}: {
	conflicts: ReadonlyArray<Conflict>;
	suggestions: Suggestions | null;
	columns: ReadonlyArray<Column>;
	locale: Locale;
}): JSX.Element {
	const o = at(locale);
	if (conflicts.length === 0)
		return <div id="ed-conflicts" class="ed-conflicts" role="status" aria-live="polite" />;
	return (
		<div id="ed-conflicts" class="ed-conflicts ed-conflicts--busy" role="alert">
			<Icon name="alert" />
			<div>
				<ul>
					{conflicts.map((c) => (
						<li key={`${c.columnId}-${c.appointmentId}`}>
							{m.ap_busy(
								{ who: names([c.columnId], columns), from: hhmm(c.startMin), to: hhmm(c.endMin) },
								o,
							)}
						</li>
					))}
				</ul>
				{suggestions === null ? null : (
					<div class="ed-conflicts__fix">
						<span>{m.ap_free_at({}, o)}</span>
						{suggestions.laterStart === null ? null : (
							<button
								type="button"
								class="adm-btn"
								data-on:click={`$ed.time = '${hhmm(suggestions.laterStart)}'; @post('/calendar/editor/check')`}
							>
								{hhmm(suggestions.laterStart)}
							</button>
						)}
						{suggestions.otherColumns.slice(0, 3).map((c) => (
							<button
								key={c.id}
								type="button"
								class="adm-btn"
								data-on:click={`$ed.col = ${quote(c.id)}; @post('/calendar/editor/check')`}
							>
								{c.name}
							</button>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

/** The client's packages with sessions left: the session can be drawn from one instead of being charged. */
export function PackageChoice({
	packages,
	appointments,
	today,
	clientChosen,
	locale,
}: {
	packages: ReadonlyArray<Package>;
	appointments: ReadonlyArray<Appointment>;
	today: string;
	clientChosen: boolean;
	locale: Locale;
}): JSX.Element {
	const o = at(locale);
	const usable = packages
		.map((p) => ({ p, u: packageUsage(p, appointments, today) }))
		.filter((x) => x.u.left > 0);
	return (
		<div id="ed-packages" class="ed-packages">
			{!clientChosen || usable.length === 0 ? null : (
				<fieldset class="ed-fieldset">
					<legend>{m.ap_package({}, o)}</legend>
					<label class="ed-choice">
						<input type="radio" name="pkg" value="" {...bind("pkg")} />
						<span>{m.ap_no_package({}, o)}</span>
					</label>
					{usable.map(({ p, u }) => {
						const l = ledger(p.totalBani, paidBani(p));
						return (
							<label key={p.id} class="ed-choice">
								<input type="radio" name="pkg" value={p.id} {...bind("pkg")} />
								<span>
									<strong>{p.name}</strong>
									<span class="adm-muted">
										{m.ap_left({ n: u.left }, o)}
										{l.remainingBani > 0
											? ` · ${m.pkg_remaining({}, o)} ${formatAmount(l.remainingBani, locale)}`
											: ""}
									</span>
								</span>
							</label>
						);
					})}
				</fieldset>
			)}
		</div>
	);
}
