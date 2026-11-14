import {
	Banner,
	EmptyState,
	type FieldGroupToggle,
	type MatrixColumn,
	type MatrixRow,
	OverflowMenu,
	PermissionMatrix,
	Segmented,
	Sheet,
} from "@psi/ui/admin";
import type { Context, Hono } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import { actionCtx } from "../actions/context";
import { runAction } from "../actions/engine";
import { ActionBar, EmptyActions, menuItems } from "../actions/render";
import type { Env } from "../app";
import { drawBody } from "../floor/mount";
import { areaText } from "../lib/area-labels";
import { deviceFrom, personFrom, roleFrom, roomFrom, serviceFrom } from "../lib/catalog-form";
import type { Ctx } from "../lib/context";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { Role } from "../port/schema";
import { ACTIONS, FIELD_GROUPS, RESOURCE_ACTIONS, RESOURCES, SCOPES } from "../port/schema";
import { ROLES_MATRIX_PATH } from "../roles-matrix/path";
import { CatalogSheets, CatalogTab } from "./catalog";
import { SheetButtons } from "./client-sheets";
import { OrgFrame } from "./org-settings";
import { roleFromForm } from "./role-form";
import { actionLabel, fieldGroupLabel, groupLabel, resourceLabel, scopeLabel } from "./role-labels";

export const SETTINGS_TABS = ["people", "rooms", "devices", "services", "roles", "plan"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

function RolesTab({
	ctx,
	roles,
	role,
	locale,
	canEdit,
}: {
	ctx: Ctx;
	roles: ReadonlyArray<Role>;
	role: Role;
	locale: Locale;
	/** Holds roles_edit (and is not only viewing): otherwise the matrix is shown, not editable. */
	canEdit: boolean;
}): JSX.Element {
	const o = at(locale);
	const rows: MatrixRow[] = RESOURCES.map((r) => ({
		key: r.key,
		label: resourceLabel(r.key, locale),
		group: groupLabel(r.group, locale),
	}));
	const columns: MatrixColumn[] = ACTIONS.map((a) => ({ key: a, label: actionLabel(a, locale) }));
	const fieldGroups: FieldGroupToggle[] = FIELD_GROUPS.map((f) => ({
		key: f,
		label: fieldGroupLabel(f, locale),
		on: role.fieldGroups.includes(f),
	}));
	return (
		<div class="adm-stack" style="gap:var(--space-3)">
			<ActionBar ctx={ctx} screen="settings.roles" />
			<Segmented
				label={m.roles_pick({}, o)}
				current={role.id}
				items={roles.map((r) => ({
					key: r.id,
					label: r.name,
					href: `/settings/roles?role=${r.id}`,
				}))}
			/>
			<div class="adm-row">
				<p class="adm-muted">
					<strong>{role.name}</strong> · {m.roles_members({ n: role.members }, o)} —{" "}
					{role.description}
				</p>
				{menuItems(ctx, "settings.roles", { id: role.id }).length === 0 ? null : (
					<OverflowMenu
						id={`role-${role.id}`}
						label={m.client_more({}, o)}
						items={menuItems(ctx, "settings.roles", { id: role.id })}
					/>
				)}
			</div>
			<p class="adm-muted">{m.roles_hint({}, o)}</p>
			<p>
				<a href={ROLES_MATRIX_PATH} data-roles-matrix-link>
					{m.rm_settings_link({}, o)}
				</a>
			</p>
			<form
				method="post"
				action={`/settings/roles/${role.id}`}
				class="adm-stack"
				data-action="role.save"
			>
				<fieldset disabled={!canEdit} style="border:0;padding:0;margin:0;min-width:0">
					<PermissionMatrix
						rows={rows}
						columns={columns}
						scopes={SCOPES.map((s) => ({ key: s, label: scopeLabel(s, locale) }))}
						noneLabel={m.roles_none({}, o)}
						notApplicableLabel={m.roles_na({}, o)}
						grants={role.grants}
						applicable={Object.fromEntries(
							Object.entries(RESOURCE_ACTIONS).map(([k, v]) => [k, [...v]]),
						)}
						fieldGroupsLabel={m.roles_field_groups({}, o)}
						fieldGroups={fieldGroups}
						resourceLabel={m.roles_resource({}, o)}
						tableLabel={m.roles_matrix_label({}, o)}
					/>
				</fieldset>
				{canEdit ? (
					<div>
						<button class="adm-btn adm-btn--primary" type="submit">
							{m.roles_save({}, o)}
						</button>
					</div>
				) : null}
			</form>
		</div>
	);
}

export interface SettingsQuery {
	role: string | undefined;
	create: boolean;
	edit: string | null;
	confirm: string | null;
}

function RoleSheets({
	ctx,
	roles,
	query,
}: {
	ctx: Ctx;
	roles: ReadonlyArray<Role>;
	query: SettingsQuery;
}): JSX.Element {
	const o = at(ctx.locale);
	const doomed =
		query.confirm === null ? null : (roles.find((r) => r.id === query.confirm) ?? null);
	return (
		<div data-signals={JSON.stringify({ newRole: query.create, askRoleDelete: doomed !== null })}>
			<Sheet signal="newRole" title={m.ac_role_add({}, o)} closeLabel={m.close({}, o)}>
				<form method="post" action="/settings/roles" class="cl-form" data-form="role-new">
					<label class="adm-field">
						<span>{m.ap_c_name({}, o)}</span>
						<input class="adm-input" name="name" required maxlength={120} />
					</label>
					<label class="adm-field">
						<span>{m.cat_role_description({}, o)}</span>
						<input class="adm-input" name="description" maxlength={500} />
					</label>
					<label class="adm-field">
						<span>{m.cat_role_copy({}, o)}</span>
						<select class="adm-input" name="copyFrom">
							<option value="">{m.cl_rec_none({}, o)}</option>
							{roles.map((r) => (
								<option key={r.id} value={r.id}>
									{r.name}
								</option>
							))}
						</select>
					</label>
					<SheetButtons go={m.cl_save({}, o)} signal="newRole" cancel={m.cancel({}, o)} />
				</form>
			</Sheet>
			{doomed === null ? null : (
				<Sheet signal="askRoleDelete" title={m.cat_remove_title({}, o)} closeLabel={m.close({}, o)}>
					<form
						method="post"
						action={`/settings/roles/${doomed.id}/delete`}
						class="cl-form"
						data-form="role-delete"
					>
						<p>{m.cat_remove_text({ name: doomed.name }, o)}</p>
						<SheetButtons
							go={m.cat_remove_go({}, o)}
							signal="askRoleDelete"
							danger
							cancel={m.cancel({}, o)}
						/>
					</form>
				</Sheet>
			)}
		</div>
	);
}

export async function renderSettings(
	ctx: Ctx,
	tab: SettingsTab,
	query: SettingsQuery,
	flash?: string,
	problem?: string,
): Promise<JSX.Element> {
	const o = at(ctx.locale);
	let body: JSX.Element;
	let overlays: JSX.Element | undefined;
	try {
		if (tab === "people" || tab === "rooms" || tab === "devices" || tab === "services") {
			const [columns, services, roles] = await Promise.all([
				ctx.port.catalogColumns(ctx.app),
				ctx.port.services(ctx.app),
				ctx.can.has("roles_view") ? ctx.port.roles(ctx.app) : [],
			]);
			const data = { columns, services, roles };
			body = <CatalogTab ctx={ctx} segment={tab} data={data} />;
			overlays = (
				<CatalogSheets
					ctx={ctx}
					segment={tab}
					data={data}
					open={{ create: query.create, editId: query.edit, confirmId: query.confirm }}
				/>
			);
		} else if (tab === "plan") {
			body = await drawBody(ctx);
		} else {
			const roles = await ctx.port.roles(ctx.app);
			const role = roles.find((r) => r.id === query.role) ?? roles[0];
			body =
				role === undefined ? (
					<EmptyState icon="shield" title={m.settings_empty_title({}, o)}>
						<EmptyActions ctx={ctx} screen="settings.roles" />
					</EmptyState>
				) : (
					<RolesTab
						ctx={ctx}
						roles={roles}
						role={role}
						locale={ctx.locale}
						canEdit={ctx.can.write("roles_edit")}
					/>
				);
			overlays = <RoleSheets ctx={ctx} roles={roles} query={query} />;
		}
	} catch {
		body = (
			<Banner tone="error" icon="alert">
				<strong>{m.error_title({}, o)}</strong>
				<p style="margin:2px 0 8px">{m.error_text({}, o)}</p>
				<a class="adm-btn" href={`/settings/${tab}`}>
					{m.retry({}, o)}
				</a>
			</Banner>
		);
	}
	return OrgFrame({
		ctx,
		area: tab,
		title: areaText(tab, ctx.locale).title,
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

const queryOf = (c: Context<Env>): SettingsQuery => ({
	role: c.req.query("role"),
	create: c.req.query("new") === "1",
	edit: c.req.query("edit") ?? null,
	confirm: c.req.query("confirm") ?? null,
});

const FORMS = {
	people: { kind: "person", read: personFrom },
	rooms: { kind: "room", read: roomFrom },
	devices: { kind: "device", read: deviceFrom },
	services: { kind: "service", read: serviceFrom },
} as const;
const STATUS = {
	forbidden: 403,
	"not-found": 404,
	invalid: 422,
	conflict: 409,
	unknown: 404,
	unavailable: 503,
} as const;

export function registerSettings(app: Hono<Env>): void {
	for (const tab of SETTINGS_TABS) {
		app.get(`/settings/${tab}`, async (c) => {
			const q = c.req.query.bind(c.req);
			const locale = at(c.var.ctx.locale);
			const flash =
				q("saved") !== undefined
					? tab === "roles"
						? m.roles_saved({}, locale)
						: m.cat_saved({}, locale)
					: q("deleted") === "1"
						? m.cat_deleted({}, locale)
						: q("deactivated") === "1"
							? m.cat_deactivated({}, locale)
							: undefined;
			const problem = q("problem") === undefined ? undefined : m.cat_problem({}, locale);
			return c.html(await renderSettings(c.var.ctx, tab, queryOf(c), flash, problem), 200, {
				"cache-control": "private, no-store",
			});
		});
	}

	const run = async (
		c: Context<Env>,
		id: string,
		params: unknown,
		back: string,
	): Promise<Response> => {
		const result = await runAction(actionCtx(c.var.ctx), id, params, { confirmed: true });
		if (result.status === "ok") return c.redirect(result.to ?? back, 303);
		if (result.status === "refused" && (result.code === "invalid" || result.code === "conflict"))
			return c.redirect(`${back}?problem=${result.code}`, 303);
		return c.text(
			result.status === "refused" ? result.code : "confirmation",
			result.status === "refused" ? STATUS[result.code] : 400,
		);
	};
	for (const [segment, f] of Object.entries(FORMS)) {
		app.post(`/settings/${segment}/save`, async (c) =>
			run(
				c,
				`${f.kind}.new`,
				{ id: null, input: f.read(await c.req.parseBody({ all: true })) },
				`/settings/${segment}`,
			),
		);
		app.post(`/settings/${segment}/:id/save`, async (c) =>
			run(
				c,
				`${f.kind}.edit`,
				{ id: c.req.param("id"), input: f.read(await c.req.parseBody({ all: true })) },
				`/settings/${segment}`,
			),
		);
		app.post(`/settings/${segment}/:id/remove`, async (c) =>
			run(c, `${f.kind}.remove`, { id: c.req.param("id") }, `/settings/${segment}`),
		);
	}
	app.post("/settings/roles", async (c) =>
		run(c, "role.new", roleFrom(await c.req.parseBody({ all: true })), "/settings/roles"),
	);
	app.post("/settings/roles/:id/delete", async (c) =>
		run(c, "role.delete", { id: c.req.param("id") }, "/settings/roles"),
	);
	app.post("/settings/roles/:id", async (c) => {
		const ctx = c.var.ctx;
		const roles = await ctx.port.roles(ctx.app);
		const current = roles.find((r) => r.id === c.req.param("id"));
		if (current === undefined) return c.notFound();
		const form = await c.req.parseBody();
		await ctx.port.saveRole(ctx.app, roleFromForm(current, form));
		return c.redirect(`/settings/roles?role=${current.id}&saved=1`, 303);
	});
}
