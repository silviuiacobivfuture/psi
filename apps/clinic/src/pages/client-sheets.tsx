import { BLACKLIST_CATEGORIES, BLACKLIST_SEVERITIES } from "@psi/scheduling/clinic";
import { Banner, Icon, Sheet } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Ctx } from "../lib/context";
import { at } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { Client } from "../port/schema";
import type { BlacklistEntry, ClearableField } from "../port/schema-clinical";
import { blacklistCategoryText, severityText } from "./client-flags";

/** The buttons every sheet ends with: do it, or close. Full width stacked on a phone. */
export function SheetButtons({
	go,
	signal,
	danger = false,
	cancel,
}: {
	go: string;
	signal: string;
	danger?: boolean;
	cancel: string;
}): JSX.Element {
	return (
		<div class="cl-buttons">
			<button class={danger ? "adm-btn adm-btn--danger" : "adm-btn adm-btn--primary"} type="submit">
				{go}
			</button>
			<button class="adm-btn" type="button" data-on:click={`$${signal} = false`}>
				{cancel}
			</button>
		</div>
	);
}

/** A yes/no sheet; with `reasonLabel` it also asks for a written reason the action requires. */
export function ConfirmSheet({
	ctx,
	signal,
	title,
	text,
	go,
	action,
	danger,
	reasonLabel,
	hidden = {},
}: {
	ctx: Ctx;
	signal: string;
	title: string;
	text: string;
	go: string;
	action: string;
	danger: boolean;
	reasonLabel?: string;
	hidden?: Readonly<Record<string, string>>;
}): JSX.Element {
	const o = at(ctx.locale);
	return (
		<Sheet signal={signal} title={title} closeLabel={m.close({}, o)}>
			<form method="post" action={action} class="cl-form">
				{Object.entries(hidden).map(([k, v]) => (
					<input key={k} type="hidden" name={k} value={v} />
				))}
				<p>{text}</p>
				{reasonLabel === undefined ? null : (
					<label class="adm-field">
						<span>{reasonLabel}</span>
						<textarea class="adm-input" name="reason" required maxlength={500} rows={3} />
					</label>
				)}
				<SheetButtons go={go} signal={signal} danger={danger} cancel={m.cancel({}, o)} />
			</form>
		</Sheet>
	);
}

/**
 * Empties one contact field on the spot: shown only beside a field that holds something, for who may change the
 * contact. The button belongs to its own small form (`form=`), so Enter in the edit form still saves the edit.
 */
const clearFormId = (clientId: string, field: ClearableField): string =>
	`clear-${field}-${clientId}`;

function ClearButton({
	clientId,
	field,
	label,
}: {
	clientId: string;
	field: ClearableField;
	label: string;
}): JSX.Element {
	return (
		<button
			class="adm-btn adm-btn--ghost cl-clear"
			type="submit"
			form={clearFormId(clientId, field)}
			data-action="client.clearContact"
		>
			<Icon name="trash" />
			{label}
		</button>
	);
}

function ClearForm({ clientId, field }: { clientId: string; field: ClearableField }): JSX.Element {
	return (
		<form
			id={clearFormId(clientId, field)}
			method="post"
			action={`/clients/${clientId}/contact/clear`}
			hidden
		>
			<input type="hidden" name="field" value={field} />
		</form>
	);
}

/** "Prezentare": the client's own details; the clinical note only for who may see it. */
export function EditClientSheet({
	ctx,
	client,
	notice = null,
}: {
	ctx: Ctx;
	client: Client;
	/** Emptying the last phone or e-mail was refused, or this field was just emptied. */
	notice?: "required" | ClearableField | null;
}): JSX.Element {
	const o = at(ctx.locale);
	return (
		<Sheet signal="editClient" title={m.cl_edit_title({}, o)} closeLabel={m.close({}, o)}>
			<form
				method="post"
				action={`/clients/${client.id}/edit`}
				class="cl-form"
				data-form="client-edit"
			>
				{notice === "required" ? (
					<Banner tone="error" icon="alert">
						{m.cl_contact_required({}, o)}
					</Banner>
				) : notice === null ? null : (
					<Banner tone="info" icon="check">
						{notice === "phone" ? m.cl_phone_cleared({}, o) : m.cl_email_cleared({}, o)}
					</Banner>
				)}
				<input type="hidden" name="id" value={client.id} />
				<label class="adm-field">
					<span>{m.ap_c_name({}, o)}</span>
					<input class="adm-input" name="name" required maxlength={120} value={client.name} />
				</label>
				{ctx.can.group("guardian") ? (
					<label class="adm-field">
						<span>{m.guardian_label({}, o)}</span>
						<input
							class="adm-input"
							name="guardian"
							maxlength={120}
							value={client.guardian ?? ""}
						/>
					</label>
				) : null}
				{ctx.can.group("contact") ? (
					<>
						<label class="adm-field">
							<span>{m.phone_label({}, o)}</span>
							<input
								class="adm-input"
								name="phone"
								type="tel"
								inputmode="tel"
								autocomplete="tel"
								maxlength={40}
								value={client.phone ?? ""}
							/>
						</label>
						{client.phone === null ? null : (
							<ClearButton clientId={client.id} field="phone" label={m.cl_clear_phone({}, o)} />
						)}
						<label class="adm-field">
							<span>{m.email_label({}, o)}</span>
							<input
								class="adm-input"
								name="email"
								type="email"
								inputmode="email"
								autocomplete="email"
								maxlength={200}
								value={client.email ?? ""}
							/>
						</label>
						{client.email === null ? null : (
							<ClearButton clientId={client.id} field="email" label={m.cl_clear_email({}, o)} />
						)}
						<p class="adm-muted">{m.cl_contact_hint({}, o)}</p>
					</>
				) : null}
				{ctx.can.group("clinical") ? (
					<label class="adm-field">
						<span>{m.note_label({}, o)}</span>
						<textarea class="adm-input" name="note" rows={4} maxlength={20000}>
							{client.note}
						</textarea>
					</label>
				) : null}
				<SheetButtons go={m.cl_save({}, o)} signal="editClient" cancel={m.cancel({}, o)} />
			</form>
			{ctx.can.group("contact") && client.phone !== null ? (
				<ClearForm clientId={client.id} field="phone" />
			) : null}
			{ctx.can.group("contact") && client.email !== null ? (
				<ClearForm clientId={client.id} field="email" />
			) : null}
		</Sheet>
	);
}

/** Which severities this person may set: `create_warn` alone reaches only a warning. */
export const severitiesFor = (ctx: Ctx): ReadonlyArray<(typeof BLACKLIST_SEVERITIES)[number]> =>
	ctx.can.write("blacklist_create")
		? BLACKLIST_SEVERITIES
		: ctx.can.write("blacklist_create_warn")
			? ["warn"]
			: [];

export function BlacklistSheet({ ctx, client }: { ctx: Ctx; client: Client }): JSX.Element {
	const o = at(ctx.locale);
	const allowed = severitiesFor(ctx);
	return (
		<Sheet signal="askBlacklist" title={m.cl_bl_title({}, o)} closeLabel={m.close({}, o)}>
			<form
				method="post"
				action={`/clients/${client.id}/blacklist`}
				class="cl-form"
				data-form="blacklist-add"
			>
				<input type="hidden" name="clientId" value={client.id} />
				<p class="adm-muted">{m.cl_bl_lead({ name: client.name }, o)}</p>
				<label class="adm-field">
					<span>{m.cl_bl_reason({}, o)}</span>
					<textarea class="adm-input" name="reason" required maxlength={2000} rows={3} />
				</label>
				<label class="adm-field">
					<span>{m.cl_bl_category({}, o)}</span>
					<select class="adm-input" name="category">
						{BLACKLIST_CATEGORIES.map((c) => (
							<option key={c} value={c}>
								{blacklistCategoryText(c, ctx.locale)}
							</option>
						))}
					</select>
				</label>
				<fieldset class="cl-choices">
					<legend>{m.cl_bl_severity({}, o)}</legend>
					{allowed.map((s, i) => (
						<label key={s} class="cl-choice">
							<input type="radio" name="severity" value={s} checked={i === 0} />
							<span>
								<strong>{severityText(s, ctx.locale)}</strong>
								<span class="adm-muted">{m[`cl_sev_${s}_hint` as const]({}, o)}</span>
							</span>
						</label>
					))}
				</fieldset>
				<label class="adm-field">
					<span>{m.cl_bl_expires({}, o)}</span>
					<input class="adm-input" type="date" name="expiresOn" />
				</label>
				<SheetButtons
					go={m.cl_bl_go({}, o)}
					signal="askBlacklist"
					danger
					cancel={m.cancel({}, o)}
				/>
			</form>
		</Sheet>
	);
}

export function UnlistSheet({
	ctx,
	client,
	entry,
}: {
	ctx: Ctx;
	client: Client;
	entry: BlacklistEntry;
}): JSX.Element {
	const o = at(ctx.locale);
	return (
		<ConfirmSheet
			ctx={ctx}
			signal="askUnlist"
			title={m.cl_unlist_title({}, o)}
			text={m.cl_unlist_text({ name: client.name }, o)}
			go={m.cl_unlist_go({}, o)}
			action={`/clients/${client.id}/blacklist/${entry.id}/end`}
			danger={false}
			reasonLabel={m.cl_unlist_reason({}, o)}
			hidden={{ clientId: client.id, id: entry.id }}
		/>
	);
}
