import { Banner, EmptyState, Sheet } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { ActionBar, EmptyActions } from "../actions/render";
import { roleLabel } from "../chrome";
import { areaText } from "../lib/area-labels";
import type { Ctx } from "../lib/context";
import { at } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { TeamMember } from "../port/port";
import type { Column, Role } from "../port/schema";
import type { MemberDetail } from "../port/schema-members";
import { SheetButtons } from "./client-sheets";
import { MemberEditor } from "./member-editor";
import { OrgFrame } from "./org-settings";

export interface MembersQuery {
	create: boolean;
	edit: string | null;
	confirm: string | null;
}

export interface MembersData {
	members: ReadonlyArray<TeamMember>;
	roles: ReadonlyArray<Role>;
	people: ReadonlyArray<Column>;
	/** The member whose editor is open, as the service answers them. */
	open: MemberDetail | null;
}

/** Every role a member holds, each its own chip: "Recepție" "Coordonator". */
export function RoleChips({
	ctx,
	ids,
	roles,
}: {
	ctx: Ctx;
	ids: ReadonlyArray<string>;
	roles: ReadonlyArray<Role>;
}): JSX.Element {
	const o = at(ctx.locale);
	if (ids.length === 0) return <span class="adm-muted">{m.mb_no_roles({}, o)}</span>;
	return (
		<span class="mb-chips" data-roles={ids.join(" ")}>
			{ids.map((id) => {
				const role = roles.find((r) => r.id === id);
				return (
					<span key={id} class="adm-pill adm-pill--compact" data-role={id}>
						{role === undefined ? id : roleLabel(role, ctx.locale)}
					</span>
				);
			})}
		</span>
	);
}

function MembersList({ ctx, d }: { ctx: Ctx; d: MembersData }): JSX.Element {
	const o = at(ctx.locale);
	if (d.members.length === 0)
		return (
			<EmptyState icon="users" title={m.mb_empty({}, o)}>
				<EmptyActions ctx={ctx} screen="settings.members" />
			</EmptyState>
		);
	return (
		<ul
			class="adm-card client-list"
			aria-label={m.mb_list_label({}, o)}
			style="list-style:none;margin:0;padding:0"
		>
			{d.members.map((p) => (
				<li key={p.subject} data-member={p.subject}>
					<a class="client-row" href={`/settings/members?edit=${encodeURIComponent(p.subject)}`}>
						<span class="client-row__main">
							<strong>{p.displayName}</strong>
							{p.email === undefined ? null : <span class="adm-muted">{p.email}</span>}
						</span>
						<RoleChips ctx={ctx} ids={p.roles} roles={d.roles} />
					</a>
				</li>
			))}
		</ul>
	);
}

function AddSheet({ ctx, roles }: { ctx: Ctx; roles: ReadonlyArray<Role> }): JSX.Element {
	const o = at(ctx.locale);
	return (
		<Sheet signal="newMember" title={m.ac_member_add({}, o)} closeLabel={m.close({}, o)}>
			<form
				method="post"
				action="/settings/members/save"
				class="cl-form"
				data-form="member-new"
				data-action="member.new"
			>
				<label class="adm-field">
					<span>{m.mb_subject({}, o)}</span>
					<input class="adm-input" name="subject" required maxlength={200} autocomplete="off" />
					<span class="adm-muted">{m.mb_subject_hint({}, o)}</span>
				</label>
				<label class="adm-field">
					<span>{m.mb_name({}, o)}</span>
					<input class="adm-input" name="displayName" required maxlength={200} />
				</label>
				<label class="adm-field">
					<span>{m.mb_email({}, o)}</span>
					<input class="adm-input" name="email" type="email" inputmode="email" maxlength={200} />
				</label>
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
				<SheetButtons go={m.ac_member_add({}, o)} signal="newMember" cancel={m.cancel({}, o)} />
			</form>
		</Sheet>
	);
}

function RemoveSheet({ ctx, member }: { ctx: Ctx; member: TeamMember }): JSX.Element {
	const o = at(ctx.locale);
	return (
		<Sheet signal="askMemberRemove" title={m.mb_remove_title({}, o)} closeLabel={m.close({}, o)}>
			<form
				method="post"
				action={`/settings/members/${encodeURIComponent(member.subject)}/remove`}
				class="cl-form"
				data-form="member-remove"
				data-action="member.remove"
			>
				<p>{m.mb_remove_text({ name: member.displayName }, o)}</p>
				<SheetButtons
					go={m.ac_member_remove({}, o)}
					signal="askMemberRemove"
					danger
					cancel={m.cancel({}, o)}
				/>
			</form>
		</Sheet>
	);
}

/** Setări → Membri: the team with every role each one holds, and the sheets that change it. */
export async function renderMembers(
	ctx: Ctx,
	query: MembersQuery,
	flash?: string,
	problem?: string,
): Promise<JSX.Element> {
	const o = at(ctx.locale);
	let body: JSX.Element;
	let overlays: JSX.Element | undefined;
	try {
		const [members, roles, columns, open] = await Promise.all([
			ctx.port.members(ctx.app),
			ctx.port.roles(ctx.app).catch(() => []),
			ctx.port.catalogColumns(ctx.app).catch(() => []),
			query.edit === null ? Promise.resolve(null) : ctx.port.member(ctx.app, query.edit),
		]);
		const d: MembersData = {
			members: [...members].sort((a, b) => a.displayName.localeCompare(b.displayName)),
			roles,
			people: columns.filter((c) => c.kind === "person"),
			open,
		};
		const doomed =
			query.confirm === null ? undefined : d.members.find((x) => x.subject === query.confirm);
		body = (
			<div class="adm-stack" style="gap:var(--space-3)">
				<ActionBar ctx={ctx} screen="settings.members" />
				{ctx.can.write("members_edit") ? null : <p class="adm-muted">{m.mb_readonly({}, o)}</p>}
				<MembersList ctx={ctx} d={d} />
			</div>
		);
		overlays = (
			<div
				data-signals={JSON.stringify({
					newMember: query.create,
					editMember: open !== null,
					askMemberRemove: doomed !== undefined,
				})}
			>
				{ctx.can.write("members_create") ? <AddSheet ctx={ctx} roles={roles} /> : null}
				{open === null ? null : <MemberEditor ctx={ctx} d={d} member={open} />}
				{doomed === undefined ? null : <RemoveSheet ctx={ctx} member={doomed} />}
			</div>
		);
	} catch {
		body = (
			<Banner tone="error" icon="alert">
				<strong>{m.error_title({}, o)}</strong>
				<p style="margin:2px 0 8px">{m.error_text({}, o)}</p>
				<a class="adm-btn" href="/settings/members">
					{m.retry({}, o)}
				</a>
			</Banner>
		);
	}
	return OrgFrame({
		ctx,
		area: "members",
		title: areaText("members", ctx.locale).title,
		...(overlays === undefined ? {} : { overlays }),
		children: [
			...(flash === undefined
				? []
				: [
						<Banner key="flash" tone="info" icon="check">
							{flash}
						</Banner>,
					]),
			...(problem === undefined
				? []
				: [
						<Banner key="problem" tone="error" icon="alert">
							{problem}
						</Banner>,
					]),
			body,
		],
	});
}
