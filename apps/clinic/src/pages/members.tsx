import { Banner, EmptyState, Sheet } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { ActionBar, EmptyActions } from "../actions/render";
import { roleLabel } from "../chrome";
import { areaText } from "../lib/area-labels";
import type { Ctx } from "../lib/context";
import { at } from "../lib/i18n";
import { moreHref, ShowMore } from "../lib/show-more";
import { m } from "../paraglide/messages.js";
import type { TeamMember } from "../port/port";
import type { Column, Role } from "../port/schema";
import type { InviteOutcome, MemberDetail } from "../port/schema-members";
import { SheetButtons } from "./client-sheets";
import { AddSheet, InvitedSheet, InviteSheet, NewLinkSheet } from "./member-add";
import { MemberEditor } from "./member-editor";
import { OrgFrame } from "./org-settings";

export interface MembersQuery {
	create: boolean;
	/** The "invite by e-mail" sheet is open. */
	invite: boolean;
	edit: string | null;
	confirm: string | null;
}

export interface MembersData {
	/** The first page of the team, by name. */
	members: ReadonlyArray<TeamMember>;
	/** Where the next page starts; null: the last is shown. */
	next: string | null;
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

/** The members' "show more": the next page of the team appended, nothing once the last is shown. */
export function MoreMembers({
	ctx,
	cursor,
	shown,
}: {
	ctx: Ctx;
	cursor: string | null;
	shown: number;
}): JSX.Element {
	return (
		<ShowMore
			id="member-more"
			href={moreHref("/settings/members/more", cursor, shown)}
			label={m.ls_more({}, at(ctx.locale))}
		/>
	);
}

/** One member of the list: their name, e-mail and roles, opening their editor. */
export function MemberRow({
	ctx,
	member,
	roles,
}: {
	ctx: Ctx;
	member: TeamMember;
	roles: ReadonlyArray<Role>;
}): JSX.Element {
	return (
		<li data-member={member.subject}>
			<a class="client-row" href={`/settings/members?edit=${encodeURIComponent(member.subject)}`}>
				<span class="client-row__main">
					<strong>{member.displayName}</strong>
					{member.email === undefined ? null : <span class="adm-muted">{member.email}</span>}
				</span>
				<RoleChips ctx={ctx} ids={member.roles} roles={roles} />
			</a>
		</li>
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
		<>
			<ul
				id="member-list"
				class="adm-card client-list"
				aria-label={m.mb_list_label({}, o)}
				style="list-style:none;margin:0;padding:0"
			>
				{d.members.map((p) => (
					<MemberRow key={p.subject} ctx={ctx} member={p} roles={d.roles} />
				))}
			</ul>
			<MoreMembers ctx={ctx} cursor={d.next} shown={d.members.length} />
		</>
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
	/** The invitation just made: shown once, in its own sheet (the one-time link with it). */
	invited?: InviteOutcome,
	/** A new set-password link just made for a member: shown once, in its own sheet. */
	newLink?: { name: string; link: string; expiresBy: number },
): Promise<JSX.Element> {
	const o = at(ctx.locale);
	let body: JSX.Element;
	let overlays: JSX.Element | undefined;
	try {
		// The member to edit or remove is asked by subject: they may be on a page not shown yet.
		const [page, roles, columns, open, confirming] = await Promise.all([
			ctx.port.memberPage(ctx.app, null),
			ctx.port.roles(ctx.app).catch(() => []),
			ctx.port.catalogColumns(ctx.app).catch(() => []),
			query.edit === null ? Promise.resolve(null) : ctx.port.member(ctx.app, query.edit),
			query.confirm === null ? Promise.resolve(null) : ctx.port.member(ctx.app, query.confirm),
		]);
		const d: MembersData = {
			members: page.items,
			next: page.nextCursor,
			roles,
			people: columns.filter((c) => c.kind === "person"),
			open,
		};
		const doomed = confirming ?? undefined;
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
					inviteMember: query.invite,
					invitedMember: invited !== undefined,
					newLink: newLink !== undefined,
					editMember: open !== null,
					askMemberRemove: doomed !== undefined,
				})}
			>
				{ctx.can.write("members_create") ? (
					<>
						<AddSheet ctx={ctx} roles={roles} />
						<InviteSheet ctx={ctx} roles={roles} />
					</>
				) : null}
				{invited === undefined ? null : <InvitedSheet ctx={ctx} outcome={invited} />}
				{newLink === undefined ? null : (
					<NewLinkSheet
						ctx={ctx}
						name={newLink.name}
						link={newLink.link}
						expiresBy={newLink.expiresBy}
					/>
				)}
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
