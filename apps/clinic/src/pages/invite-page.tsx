import { Banner, Icon, Sheet } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { Page } from "../chrome";
import type { Ctx } from "../lib/context";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { PortError } from "../port/port";
import type { Client, Invite, InvitePick, InvitePreview, InviteStatus } from "../port/schema";

const statusLabel = (s: InviteStatus, locale: Locale): string => {
	const o = at(locale);
	switch (s) {
		case "invited":
			return m.invite_status_invited({}, o);
		case "active":
			return m.invite_status_active({}, o);
		case "expired":
			return m.invite_status_expired({}, o);
		case "revoked":
			return m.invite_status_revoked({}, o);
		default: {
			const never: never = s;
			return never;
		}
	}
};
/** The pill colours the admin kit already has: waiting is "requested", live is "confirmed", the rest are "cancelled". */
const PILL: Readonly<Record<InviteStatus, string>> = {
	invited: "requested",
	active: "confirmed",
	expired: "cancelled",
	revoked: "cancelled",
};

/** What a refusal says, in the person's words: the service's reason first, its code after. Never the message. */
export function inviteErrorText(error: PortError, locale: Locale): string {
	const o = at(locale);
	switch (error.reason) {
		case "no_email":
			return m.invite_err_no_email({}, o);
		case "already_invited":
			return m.invite_err_already_invited({}, o);
		case "already_active":
			return m.invite_err_already_active({}, o);
		case "account_disabled":
			return m.invite_err_account_disabled({}, o);
		case "client_not_active":
			return m.invite_err_client_not_active({}, o);
		case "too_soon":
			return m.invite_err_too_soon({}, o);
		case "contact_changed":
			return m.invite_err_contact_changed({}, o);
		case "revoked":
			return m.invite_err_revoked({}, o);
		default:
			if (error.code === "forbidden") return m.invite_err_forbidden({}, o);
			if (error.code === "unavailable") return m.invite_err_unavailable({}, o);
			return m.invite_err_other({}, o);
	}
}

const when = (ms: number, locale: Locale): string =>
	new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "en-GB", {
		day: "numeric",
		month: "long",
		hour: "2-digit",
		minute: "2-digit",
		timeZone: "Europe/Bucharest",
		hourCycle: "h23",
	}).format(ms);

/** The online-account card of a client's page: where they stand, and what the person may do about it. */
export function InviteCard({
	client,
	invite,
	locale,
	canWrite,
}: {
	client: Client;
	invite: Invite | null;
	locale: Locale;
	canWrite: boolean;
}): JSX.Element {
	const o = at(locale);
	return (
		<div class="adm-card adm-stack" data-testid="invite-card">
			<h3 class="adm-h2">{m.invite_title({}, o)}</h3>
			{invite === null ? <p class="adm-muted">{m.invite_card_text({}, o)}</p> : null}
			{invite === null ? null : (
				<>
					<div class="adm-row">
						<span class={`adm-pill adm-pill--${PILL[invite.status]}`} data-testid="invite-status">
							{statusLabel(invite.status, locale)}
						</span>
						<span class="adm-muted">{m.invite_sent_to({ address: invite.sentTo }, o)}</span>
					</div>
					<span class="adm-muted">{m.invite_sends({ n: invite.sends }, o)}</span>
					{invite.status === "invited" ? (
						<span class="adm-muted">
							{m.invite_expires({ date: when(invite.expiresAt, locale) }, o)}
						</span>
					) : null}
					{invite.existingAccount && invite.status !== "revoked" ? (
						<span class="adm-muted">{m.invite_existing({}, o)}</span>
					) : null}
				</>
			)}
			{canWrite && (invite === null || invite.status === "revoked") ? (
				<a class="adm-btn adm-btn--primary" href={`/clients/${client.id}/invite`}>
					<Icon name="mail" />
					{m.invite_action({}, o)}
				</a>
			) : null}
			{canWrite &&
			invite !== null &&
			(invite.status === "invited" || invite.status === "expired") ? (
				<div class="adm-row">
					<form method="post" action={`/clients/${client.id}/invite/resend`}>
						<button type="submit" class="adm-btn">
							{m.invite_resend({}, o)}
						</button>
					</form>
					<button type="button" class="adm-btn adm-btn--danger" data-on:click="$askRevoke = true">
						{m.invite_revoke({}, o)}
					</button>
				</div>
			) : null}
			{canWrite && invite !== null && invite.status === "active" ? (
				<button type="button" class="adm-btn adm-btn--danger" data-on:click="$askRevoke = true">
					{m.invite_revoke({}, o)}
				</button>
			) : null}
		</div>
	);
}

/** The sheet that confirms withdrawing: ONE confirmation, ONE write. */
export function RevokeSheet({ client, locale }: { client: Client; locale: Locale }): JSX.Element {
	const o = at(locale);
	return (
		<Sheet signal="askRevoke" title={m.invite_revoke_title({}, o)} closeLabel={m.close({}, o)}>
			<form method="post" action={`/clients/${client.id}/invite/revoke`} class="adm-stack">
				<p>{m.invite_revoke_text({}, o)}</p>
				<div class="adm-row">
					<button class="adm-btn adm-btn--danger" type="submit">
						{m.invite_revoke_go({}, o)}
					</button>
					<button class="adm-btn" type="button" data-on:click="$askRevoke = false">
						{m.cancel({}, o)}
					</button>
				</div>
			</form>
		</Sheet>
	);
}

export interface InvitePageView {
	client: Client;
	pick: InvitePick;
	preview: InvitePreview | null;
	error: PortError | null;
}

/** Pick who and in which language, read the e-mail as it would go, and send it. */
export async function renderInvitePage(ctx: Ctx, view: InvitePageView): Promise<JSX.Element> {
	const o = at(ctx.locale);
	const { client, pick, preview, error } = view;
	return Page({
		ctx,
		current: "clients",
		title: m.invite_page_title({ name: client.name }, o),
		children: (
			<div class="adm-page">
				<a
					class="adm-btn adm-btn--ghost"
					style="align-self:flex-start"
					href={`/clients/${client.id}`}
				>
					<Icon name="chevron-left" />
					{m.client_back({}, o)}
				</a>
				<h2 class="adm-h1">{m.invite_page_title({ name: client.name }, o)}</h2>
				{error === null ? null : (
					<Banner tone="error" icon="alert">
						{inviteErrorText(error, ctx.locale)}
					</Banner>
				)}
				<form
					method="post"
					action={`/clients/${client.id}/invite/preview`}
					class="adm-card adm-stack"
				>
					<fieldset class="adm-stack" style="border:0;padding:0;margin:0">
						<legend class="adm-h2">{m.invite_pick_label({}, o)}</legend>
						{ctx.can.group("contact") ? (
							<label class="adm-row">
								<input
									type="radio"
									name="contact"
									value="client"
									checked={pick.contact === "client"}
								/>
								<span>{m.invite_pick_client({}, o)}</span>
							</label>
						) : null}
						{ctx.can.group("guardian") ? (
							<label class="adm-row">
								<input
									type="radio"
									name="contact"
									value="guardian"
									checked={pick.contact === "guardian"}
								/>
								<span>{m.invite_pick_guardian({}, o)}</span>
							</label>
						) : null}
					</fieldset>
					<label class="adm-field">
						<span>{m.invite_lang_label({}, o)}</span>
						<select class="adm-input" name="locale">
							<option value="ro" selected={pick.locale === "ro"}>
								{m.invite_lang_ro({}, o)}
							</option>
							<option value="en" selected={pick.locale === "en"}>
								{m.invite_lang_en({}, o)}
							</option>
						</select>
					</label>
					<div class="adm-row">
						<button type="submit" class="adm-btn">
							{m.invite_preview_button({}, o)}
						</button>
					</div>
				</form>
				{preview === null ? null : (
					<div class="adm-card adm-stack" data-testid="invite-preview">
						<strong>{preview.subject}</strong>
						<span class="adm-muted">{m.invite_preview_to({ address: preview.to }, o)}</span>
						{preview.existingAccount ? (
							<Banner tone="info" icon="mail">
								{m.invite_preview_existing({}, o)}
							</Banner>
						) : null}
						<iframe
							sandbox=""
							title={m.invite_preview_frame({}, o)}
							srcdoc={preview.html}
							style="width:100%;min-height:420px;border:1px solid var(--adm-line, #ccc);border-radius:8px;background:#fff"
						/>
						<span class="adm-muted">{m.invite_preview_note({}, o)}</span>
						<form method="post" action={`/clients/${client.id}/invite/send`} class="adm-row">
							<input type="hidden" name="contact" value={pick.contact} />
							<input type="hidden" name="locale" value={pick.locale} />
							<button type="submit" class="adm-btn adm-btn--primary">
								<Icon name="mail" />
								{m.invite_send_button({}, o)}
							</button>
						</form>
					</div>
				)}
			</div>
		),
	});
}
