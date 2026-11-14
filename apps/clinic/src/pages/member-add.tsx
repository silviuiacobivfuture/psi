import { Sheet } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { roleLabel } from "../chrome";
import type { Ctx } from "../lib/context";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { Role } from "../port/schema";
import type { InviteOutcome, StaffMatch } from "../port/schema-members";
import { SheetButtons } from "./client-sheets";

export const STAFF_RESULTS = "mb-staff-results";
export const STAFF_SEARCH = "/settings/members/staff";
const quote = (s: string): string => JSON.stringify(s);

function RoleChoices({ ctx, roles }: { ctx: Ctx; roles: ReadonlyArray<Role> }): JSX.Element {
	const o = at(ctx.locale);
	return (
		<fieldset class="cl-choices">
			<legend>{m.mb_roles({}, o)}</legend>
			<span class="adm-muted">{m.mb_roles_hint({}, o)}</span>
			{roles.map((r) => (
				<label key={r.id} class="adm-check">
					<input type="checkbox" name="roles" value={r.id} />
					{roleLabel(r, ctx.locale)}
				</label>
			))}
		</fieldset>
	);
}

/** What the search found: a person of the team's sign-in group fills the form; one already in the team cannot be picked. */
export function StaffResults({
	query,
	found,
	failed,
	locale,
}: {
	query: string;
	found: ReadonlyArray<StaffMatch>;
	failed: boolean;
	locale: Locale;
}): JSX.Element {
	const o = at(locale);
	return (
		<div id={STAFF_RESULTS} class="ed-results" role="status" aria-live="polite">
			{failed ? (
				<p class="adm-muted">{m.mb_search_unavailable({}, o)}</p>
			) : query.trim().length < 2 ? null : found.length === 0 ? (
				<p class="adm-muted">{m.mb_search_none({ q: query }, o)}</p>
			) : (
				<ul class="ed-results__list" aria-label={m.mb_search_results({}, o)}>
					{found.map((p) => {
						const blocked = p.member || !p.active;
						return (
							<li key={p.subject}>
								<button
									type="button"
									class="ed-client mb-staff"
									data-staff={p.subject}
									disabled={blocked}
									{...(blocked
										? {}
										: {
												"data-on:click": `$nm.subject = ${quote(p.subject)}; $nm.name = ${quote(p.displayName)}; $nm.email = ${quote(p.email)}; $nm.q = ''`,
											})}
								>
									<span class="ed-client__text">
										<strong>{p.displayName}</strong>
										<span class="adm-muted">
											{p.email}
											{p.member
												? ` · ${m.mb_search_member({}, o)}`
												: p.active
													? ""
													: ` · ${m.mb_search_off({}, o)}`}
										</span>
									</span>
								</button>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}

/** "Adaugă membru": find the person by name or e-mail in the team's sign-in group, then choose their roles. */
export function AddSheet({ ctx, roles }: { ctx: Ctx; roles: ReadonlyArray<Role> }): JSX.Element {
	const o = at(ctx.locale);
	return (
		<Sheet signal="newMember" title={m.ac_member_add({}, o)} closeLabel={m.close({}, o)}>
			<form
				method="post"
				action="/settings/members/save"
				class="cl-form"
				data-form="member-new"
				data-action="member.new"
				data-signals={JSON.stringify({ nm: { q: "", subject: "", name: "", email: "" } })}
			>
				<label class="adm-field">
					<span>{m.mb_search({}, o)}</span>
					<input
						class="adm-input"
						type="search"
						autocomplete="off"
						maxlength={80}
						data-staff-search
						{...{ "data-bind:nm.q": "" }}
						{...{ "data-on:input__debounce.250ms": `@post('${STAFF_SEARCH}')` }}
					/>
					<span class="adm-muted">{m.mb_search_hint({}, o)}</span>
				</label>
				<StaffResults query="" found={[]} failed={false} locale={ctx.locale} />
				<label class="adm-field">
					<span>{m.mb_subject({}, o)}</span>
					<input
						class="adm-input"
						name="subject"
						required
						maxlength={200}
						autocomplete="off"
						{...{ "data-bind:nm.subject": "" }}
					/>
					<span class="adm-muted">{m.mb_subject_hint({}, o)}</span>
				</label>
				<label class="adm-field">
					<span>{m.mb_name({}, o)}</span>
					<input
						class="adm-input"
						name="displayName"
						required
						maxlength={200}
						{...{ "data-bind:nm.name": "" }}
					/>
				</label>
				<label class="adm-field">
					<span>{m.mb_email({}, o)}</span>
					<input
						class="adm-input"
						name="email"
						type="email"
						inputmode="email"
						maxlength={200}
						{...{ "data-bind:nm.email": "" }}
					/>
				</label>
				<RoleChoices ctx={ctx} roles={roles} />
				<SheetButtons go={m.ac_member_add({}, o)} signal="newMember" cancel={m.cancel({}, o)} />
			</form>
		</Sheet>
	);
}

/** "Invită prin e-mail": someone with no account yet, or whose sign-in id nobody knows. */
export function InviteSheet({ ctx, roles }: { ctx: Ctx; roles: ReadonlyArray<Role> }): JSX.Element {
	const o = at(ctx.locale);
	return (
		<Sheet signal="inviteMember" title={m.mb_invite_title({}, o)} closeLabel={m.close({}, o)}>
			<form
				method="post"
				action="/settings/members/invite"
				class="cl-form"
				data-form="member-invite"
				data-action="member.invite"
			>
				<p class="adm-muted">{m.mb_invite_text({}, o)}</p>
				<label class="adm-field">
					<span>{m.mb_invite_email({}, o)}</span>
					<input
						class="adm-input"
						name="email"
						type="email"
						inputmode="email"
						required
						maxlength={200}
						autocomplete="off"
					/>
				</label>
				<label class="adm-field">
					<span>{m.mb_name({}, o)}</span>
					<input class="adm-input" name="displayName" required maxlength={200} />
				</label>
				<RoleChoices ctx={ctx} roles={roles} />
				<SheetButtons
					go={m.ac_member_invite({}, o)}
					signal="inviteMember"
					cancel={m.cancel({}, o)}
				/>
			</form>
		</Sheet>
	);
}

/** A one-time set-password link to pass on: read-only, selected on focus, one press copies it. Shown once, kept nowhere. */
function OneTimeLink({ ctx, link }: { ctx: Ctx; link: string }): JSX.Element {
	const o = at(ctx.locale);
	return (
		<>
			<label class="adm-field">
				<span>{m.mb_invited_link({}, o)}</span>
				<input
					id="mb-invite-link"
					class="adm-input"
					readonly
					value={link}
					data-on:focus="el.select()"
				/>
				<span class="adm-muted">{m.mb_invited_once({}, o)}</span>
			</label>
			<button
				type="button"
				class="adm-btn"
				data-copy-link
				data-on:click="navigator.clipboard.writeText(document.getElementById('mb-invite-link').value)"
			>
				{m.mb_invited_copy({}, o)}
			</button>
		</>
	);
}

/** In a member's editor, for whoever may add members: a new set-password link (the service refuses one who signed in). */
export function NewLinkForm({ ctx, subject }: { ctx: Ctx; subject: string }): JSX.Element {
	const o = at(ctx.locale);
	return (
		<form
			method="post"
			action={`/settings/members/${encodeURIComponent(subject)}/link`}
			class="cl-form"
			data-form="member-link"
			data-action="member.link"
		>
			<p class="adm-muted">{m.mb_link_hint({}, o)}</p>
			<div>
				<button class="adm-btn" type="submit">
					{m.ac_member_link({}, o)}
				</button>
			</div>
		</form>
	);
}

/** The new link, once. */
export function NewLinkSheet({
	ctx,
	name,
	link,
}: {
	ctx: Ctx;
	name: string;
	link: string;
}): JSX.Element {
	const o = at(ctx.locale);
	return (
		<Sheet signal="newLink" title={m.mb_link_title({}, o)} closeLabel={m.close({}, o)}>
			<div class="cl-form" data-new-link>
				<p>{m.mb_link_text({ name }, o)}</p>
				<OneTimeLink ctx={ctx} link={link} />
			</div>
		</Sheet>
	);
}

/** After an invitation: who was added and, for a new account, the one-time link to pass on. Shown once. */
export function InvitedSheet({ ctx, outcome }: { ctx: Ctx; outcome: InviteOutcome }): JSX.Element {
	const o = at(ctx.locale);
	const name = outcome.displayName;
	const text =
		outcome.account === "existing"
			? m.mb_invited_existing({ name }, o)
			: outcome.signInLink === null
				? m.mb_invited_nolink({ name }, o)
				: m.mb_invited_created({ name }, o);
	return (
		<Sheet signal="invitedMember" title={m.mb_invited_title({}, o)} closeLabel={m.close({}, o)}>
			<div class="cl-form" data-invited={outcome.subject}>
				<p>{text}</p>
				{outcome.signInLink === null ? null : <OneTimeLink ctx={ctx} link={outcome.signInLink} />}
				<a
					class="adm-btn adm-btn--primary"
					href={`/settings/members?edit=${encodeURIComponent(outcome.subject)}`}
				>
					{m.mb_invited_open({}, o)}
				</a>
			</div>
		</Sheet>
	);
}
