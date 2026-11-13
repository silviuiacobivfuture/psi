import { Icon } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Ctx } from "./lib/context";
import { at } from "./lib/i18n";
import { m } from "./paraglide/messages.js";
import type { TeamMember, ViewAsTarget } from "./port/port";
import type { Role } from "./port/schema";

export const ROLE_MENU_BODY = "role-menu-body";

function Option({
	as,
	label,
	hint,
}: {
	as: ViewAsTarget;
	label: string;
	hint: string;
}): JSX.Element {
	return (
		<form method="post" action="/view-as" data-view-as-choice={as}>
			<input type="hidden" name="as" value={as} />
			<input type="hidden" name="label" value={label} />
			<button class="adm-menu__item role-switch__option" type="submit">
				<span class="role-switch__name">{label}</span>
				{hint === "" ? null : <span class="adm-muted role-switch__hint">{hint}</span>}
			</button>
		</form>
	);
}

/** The picker inside the pill's menu: every role, then every person, each one a one-click "view as". */
export function RoleMenuBody({
	ctx,
	roles,
	members,
	roleLabel,
}: {
	ctx: Ctx;
	roleLabel: (role: Role) => string;
	roles: ReadonlyArray<Role>;
	members: ReadonlyArray<TeamMember>;
}): JSX.Element {
	const o = at(ctx.locale);
	const names = new Map(roles.map((r) => [r.id, roleLabel(r)]));
	return (
		<div id={ROLE_MENU_BODY} class="role-switch__body">
			<div class="role-switch__group" id="role-menu-roles">
				{m.view_as_roles({}, o)}
			</div>
			{roles.map((r) => (
				<Option key={r.id} as={`role:${r.id}`} label={roleLabel(r)} hint="" />
			))}
			<div class="adm-menu__sep" />
			<div class="role-switch__group" id="role-menu-members">
				{m.view_as_members({}, o)}
			</div>
			{members.map((p) => (
				<Option
					key={p.subject}
					as={`member:${p.subject}`}
					label={p.displayName}
					hint={p.roles.map((r) => names.get(r) ?? r).join(", ")}
				/>
			))}
		</div>
	);
}

/**
 * The role switcher in the top bar, always in sight for whoever administers roles: "Rol: Proprietar" opens
 * the view-as picker; while viewing, it turns amber ("Vezi ca Recepție · Ieși") and one press leaves.
 */
export function RoleSwitcher({ ctx, mine }: { ctx: Ctx; mine: string }): JSX.Element | null {
	const o = at(ctx.locale);
	if (ctx.viewAs !== null) {
		return (
			<form method="post" action="/view-as/stop" class="role-switch" data-view-as-pill>
				<button class="role-switch__btn role-switch__btn--viewing" type="submit">
					<Icon name="shield" />
					<span class="role-switch__label">
						{m.view_as_pill({ name: ctx.viewAs.label }, o)} · {m.view_as_exit({}, o)}
					</span>
				</button>
			</form>
		);
	}
	if (!ctx.mayViewAs) return null;
	return (
		<div
			class="adm-menu role-switch"
			data-role-switch
			data-signals="{roleMenu:false, roleLoaded:false}"
			data-on:keydown="evt.key === 'Escape' && ($roleMenu = false)"
		>
			<button
				type="button"
				class="role-switch__btn"
				aria-haspopup="true"
				data-attr:aria-expanded="$roleMenu"
				data-on:click="$roleMenu = !$roleMenu; if ($roleMenu && !$roleLoaded) { $roleLoaded = true; @get('/view-as/menu') }"
			>
				<Icon name="shield" />
				<span class="role-switch__label">{m.role_switch_label({ name: mine }, o)}</span>
				<Icon name="chevron-down" />
			</button>
			<div class="adm-menu__panel role-switch__panel" data-show="$roleMenu" style="display:none">
				<div id={ROLE_MENU_BODY} class="role-switch__body">
					<a class="adm-menu__item" href="/view-as">
						{m.view_as_menu({}, o)}
					</a>
				</div>
			</div>
		</div>
	);
}
