import { OverflowMenu, Sheet } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { menuItems } from "../actions/render";
import { roleLabel, roleName } from "../chrome";
import type { Ctx } from "../lib/context";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import { type MemberDetail, relationOf } from "../port/schema-members";
import { Pick } from "./form-choices";
import { NewLinkForm } from "./member-add";
import { type OverrideChoice, overrideChoices, summaryOf } from "./member-summary";
import type { MembersData } from "./members";
import { actionLabel, groupLabel, resourceLabel, scopeLabel } from "./role-labels";
import { RolePick } from "./role-pick";

/**
 * The choices of a list, plus what the member already holds that the list could not show (a list this person may not
 * read, or that failed): a save sends the whole set, so what is held is always sent back, never dropped.
 */
const withHeld = (
	items: ReadonlyArray<{ id: string; name: string }>,
	held: ReadonlyArray<string>,
	name: (id: string) => string,
): ReadonlyArray<{ id: string; name: string }> => [
	...items,
	...held.filter((id) => !items.some((i) => i.id === id)).map((id) => ({ id, name: name(id) })),
];

const path = (member: MemberDetail, tail: string): string =>
	`/settings/members/${encodeURIComponent(member.subject)}/${tail}`;

/** What the member may do in the end, grouped as the role editor groups it, in words. */
function Effective({ ctx, member }: { ctx: Ctx; member: MemberDetail }): JSX.Element {
	const o = at(ctx.locale);
	const s = summaryOf(member.matrix, ctx.locale);
	return (
		<section class="adm-stack" data-effective style="gap:var(--space-2)">
			<h3 class="adm-h2">{m.mb_effective({}, o)}</h3>
			<p class="adm-muted">{m.mb_effective_hint({}, o)}</p>
			{s.groups.length === 0 && s.fields.length === 0 ? <p>{m.mb_effective_none({}, o)}</p> : null}
			{s.groups.map((g) => (
				<div key={g.label} class="adm-stack" style="gap:var(--space-1)">
					<strong>{g.label}</strong>
					<ul style="margin:0;padding-left:var(--space-4)">
						{g.lines.map((l) => (
							<li key={l.resource}>
								{l.resource}: {l.actions.join(", ")}
							</li>
						))}
					</ul>
				</div>
			))}
			{s.fields.length === 0 ? null : <p>{m.mb_fields({ fields: s.fields.join(", ") }, o)}</p>}
			{s.more === 0 ? null : <p class="adm-muted">{m.mb_more({ n: s.more }, o)}</p>}
		</section>
	);
}

/** The picker's choices by group and resource, each group folded so a phone shows a short list. */
function byGroup(choices: ReadonlyArray<OverrideChoice>, locale: Locale) {
	const out = new Map<string, OverrideChoice[]>();
	for (const c of choices) {
		const g = groupLabel(c.entry.resource.group, locale);
		out.set(g, [...(out.get(g) ?? []), c]);
	}
	return [...out];
}

function choiceLabel(c: OverrideChoice, locale: Locale): string {
	return `${resourceLabel(c.entry.resource.key, locale)} · ${actionLabel(c.entry.action, locale)}`;
}

/** "Permisiuni în plus" (a scope to add) and "Permisiuni retrase" (withdrawn at every scope), per permission. */
function Overrides({
	ctx,
	member,
	disabled,
}: {
	ctx: Ctx;
	member: MemberDetail;
	disabled: boolean;
}): JSX.Element {
	const o = at(ctx.locale);
	const groups = byGroup(overrideChoices(member.matrix), ctx.locale);
	const granted = new Set(member.grant);
	const denied = new Set(member.deny);
	return (
		<form
			method="post"
			action={path(member, "overrides")}
			class="cl-form"
			data-form="member-overrides"
			data-action="member.overrides"
		>
			<fieldset
				disabled={disabled}
				style="border:0;padding:0;margin:0;min-width:0"
				class="adm-stack"
			>
				<h3 class="adm-h2">{m.mb_extra({}, o)}</h3>
				<p class="adm-muted">{m.mb_extra_hint({}, o)}</p>
				{groups.map(([label, list]) => (
					<details
						key={`g-${label}`}
						open={list.some((c) => c.row.scopes.some((s) => granted.has(relationOf(c.row, s))))}
					>
						<summary>{label}</summary>
						{list.map((c) => (
							<label key={c.row.key} class="adm-field">
								<span>{choiceLabel(c, ctx.locale)}</span>
								<select class="adm-input" name="grant" data-grant={c.row.key}>
									<option value="">{m.mb_scope_none({}, o)}</option>
									{c.row.scopes.map((s) => (
										<option
											key={s}
											value={relationOf(c.row, s)}
											selected={granted.has(relationOf(c.row, s))}
										>
											{scopeLabel(s, ctx.locale)}
										</option>
									))}
								</select>
							</label>
						))}
					</details>
				))}
				<h3 class="adm-h2">{m.mb_withdrawn({}, o)}</h3>
				<p class="adm-muted">{m.mb_withdrawn_hint({}, o)}</p>
				{groups.map(([label, list]) => (
					<details
						key={`d-${label}`}
						open={list.some((c) => c.row.scopes.some((s) => denied.has(relationOf(c.row, s))))}
					>
						<summary>{label}</summary>
						{list.map((c) => (
							<label key={c.row.key} class="adm-check">
								<input
									type="checkbox"
									name="deny"
									value={c.row.key}
									data-deny={c.row.key}
									checked={c.row.scopes.some((s) => denied.has(relationOf(c.row, s)))}
								/>
								{choiceLabel(c, ctx.locale)}
							</label>
						))}
					</details>
				))}
				{disabled ? null : (
					<div>
						<button class="adm-btn adm-btn--primary" type="submit">
							{m.ac_member_overrides({}, o)}
						</button>
					</div>
				)}
			</fieldset>
		</form>
	);
}

function Calendar({
	ctx,
	d,
	member,
}: {
	ctx: Ctx;
	d: MembersData;
	member: MemberDetail;
}): JSX.Element {
	const o = at(ctx.locale);
	const names = member.calendars.map((id) => d.people.find((p) => p.id === id)?.name ?? id);
	const free = d.people.filter(
		(p) => !member.calendars.includes(p.id) && !member.taken.includes(p.id),
	);
	return (
		<section class="adm-stack" style="gap:var(--space-2)" data-calendar>
			<h3 class="adm-h2">{m.mb_calendar({}, o)}</h3>
			<p>
				{names.length === 0
					? m.mb_calendar_none({}, o)
					: m.mb_calendar_linked({ names: names.join(", ") }, o)}
			</p>
			{ctx.can.write("people_edit") && free.length > 0 ? (
				<form
					method="post"
					action={path(member, "calendar")}
					class="adm-row"
					data-form="member-calendar"
					data-action="member.calendar"
				>
					<select class="adm-input" name="personId" aria-label={m.mb_calendar({}, o)}>
						{free.map((p) => (
							<option key={p.id} value={p.id}>
								{p.name}
							</option>
						))}
					</select>
					<button class="adm-btn" type="submit">
						{m.ac_member_calendar({}, o)}
					</button>
				</form>
			) : null}
		</section>
	);
}

/** The member's sheet: their roles (several at once), what that adds up to, the per-person permissions, the calendar. */
export function MemberEditor({
	ctx,
	d,
	member,
}: {
	ctx: Ctx;
	d: MembersData;
	member: MemberDetail;
}): JSX.Element {
	const o = at(ctx.locale);
	const self = member.subject === ctx.caps.subject;
	const locked = self || !ctx.can.write("members_edit");
	const menu = menuItems(ctx, "settings.members", { id: member.subject });
	return (
		<Sheet signal="editMember" title={member.displayName} closeLabel={m.close({}, o)}>
			<div class="adm-stack" style="gap:var(--space-4)" data-member-editor={member.subject}>
				{self ? <p class="adm-muted">{m.mb_self({}, o)}</p> : null}
				{menu.length === 0 ? null : (
					<OverflowMenu id={`member-${member.subject}`} label={m.client_more({}, o)} items={menu} />
				)}
				<form
					method="post"
					action={path(member, "save")}
					class="cl-form"
					data-form="member-save"
					data-action="member.edit"
				>
					<fieldset
						disabled={locked}
						style="border:0;padding:0;margin:0;min-width:0"
						class="adm-stack"
					>
						<label class="adm-field">
							<span>{m.mb_name({}, o)}</span>
							<input
								class="adm-input"
								name="displayName"
								required
								maxlength={200}
								value={member.displayName}
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
								value={member.email ?? ""}
							/>
						</label>
						<p class="adm-muted">{m.mb_roles_hint({}, o)}</p>
						<RolePick
							legend={m.mb_roles({}, o)}
							items={withHeld(
								d.roles.map((r) => ({ id: r.id, name: roleLabel(r, ctx.locale) })),
								member.roles,
								(id) => roleName(id, ctx.locale),
							)}
							roles={d.roles}
							on={member.roles}
							locale={ctx.locale}
						/>
						<Pick
							legend={m.mb_coordinates({}, o)}
							name="coordinates"
							items={withHeld(
								d.people.map((p) => ({ id: p.id, name: p.name })),
								member.coordinates,
								(id) => id,
							)}
							on={member.coordinates}
						/>
						{locked ? null : (
							<div>
								<button class="adm-btn adm-btn--primary" type="submit">
									{m.ac_member_edit({}, o)}
								</button>
							</div>
						)}
					</fieldset>
				</form>
				<Effective ctx={ctx} member={member} />
				<Overrides ctx={ctx} member={member} disabled={locked} />
				<Calendar ctx={ctx} d={d} member={member} />
				{self || !ctx.can.write("members_create") || member.email === undefined ? null : (
					<NewLinkForm ctx={ctx} subject={member.subject} />
				)}
			</div>
		</Sheet>
	);
}
