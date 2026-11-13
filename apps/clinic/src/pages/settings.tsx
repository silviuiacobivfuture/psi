import {
	Banner,
	EmptyState,
	type FieldGroupToggle,
	type MatrixColumn,
	type MatrixRow,
	PermissionMatrix,
	Segmented,
} from "@psi/ui/admin";
import type { Hono } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Env } from "../app";
import { formatMoney } from "../domain/money";
import { drawBody } from "../floor/mount";
import { areaText } from "../lib/area-labels";
import type { Ctx } from "../lib/context";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { Column, Role, Service } from "../port/schema";
import { ACTIONS, FIELD_GROUPS, RESOURCE_ACTIONS, RESOURCES, SCOPES } from "../port/schema";
import { OrgFrame } from "./org-settings";
import { roleFromForm } from "./role-form";
import { actionLabel, fieldGroupLabel, groupLabel, resourceLabel, scopeLabel } from "./role-labels";

export const SETTINGS_TABS = ["people", "rooms", "devices", "services", "roles", "plan"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

function ColumnList({
	items,
	locale,
}: {
	items: ReadonlyArray<Column>;
	locale: Locale;
}): JSX.Element {
	const o = at(locale);
	if (items.length === 0)
		return (
			<EmptyState
				icon="settings"
				title={m.settings_empty_title({}, o)}
				text={m.settings_empty_text({}, o)}
			/>
		);
	return (
		<div class="adm-card client-list">
			{items.map((c) => (
				<div key={c.id} class="client-row">
					<span class="adm-dot" style={`background:var(--cal-${c.colour})`} />
					<strong>{c.name}</strong>
				</div>
			))}
		</div>
	);
}

function ServiceList({
	items,
	locale,
	showPrice,
}: {
	items: ReadonlyArray<Service>;
	locale: Locale;
	/** Prices are a money field: shown only to someone who may see money. */
	showPrice: boolean;
}): JSX.Element {
	const o = at(locale);
	if (items.length === 0)
		return (
			<EmptyState
				icon="settings"
				title={m.settings_empty_title({}, o)}
				text={m.settings_empty_text({}, o)}
			/>
		);
	return (
		<div class="adm-scroll">
			<table class="adm-table">
				<tbody>
					{items.map((s) => (
						<tr key={s.id}>
							<th scope="row">{s.name}</th>
							<td>{m.service_duration({ n: s.durationMin }, o)}</td>
							{showPrice ? (
								<td>{s.priceBani === null ? "—" : formatMoney(s.priceBani, locale)}</td>
							) : null}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function RolesTab({
	roles,
	role,
	locale,
	canEdit,
}: {
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
			<Segmented
				label={m.roles_pick({}, o)}
				current={role.id}
				items={roles.map((r) => ({
					key: r.id,
					label: r.name,
					href: `/settings/roles?role=${r.id}`,
				}))}
			/>
			<p class="adm-muted">
				<strong>{role.name}</strong> · {m.roles_members({ n: role.members }, o)} —{" "}
				{role.description}
			</p>
			<p class="adm-muted">{m.roles_hint({}, o)}</p>
			<form method="post" action={`/settings/roles/${role.id}`} class="adm-stack">
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

export async function renderSettings(
	ctx: Ctx,
	tab: SettingsTab,
	roleId: string | undefined,
	flash?: string,
): Promise<JSX.Element> {
	const o = at(ctx.locale);
	let body: JSX.Element;
	try {
		if (tab === "people" || tab === "rooms" || tab === "devices") {
			const cols = await ctx.port.columns(ctx.app);
			const kind = tab === "people" ? "person" : tab === "rooms" ? "room" : "device";
			body = (
				<ColumnList
					items={cols.filter((c) => c.kind === kind || (tab === "rooms" && c.kind === "group"))}
					locale={ctx.locale}
				/>
			);
		} else if (tab === "services") {
			body = (
				<ServiceList
					items={await ctx.port.services(ctx.app)}
					locale={ctx.locale}
					showPrice={ctx.can.group("money")}
				/>
			);
		} else if (tab === "plan") {
			body = await drawBody(ctx);
		} else {
			const roles = await ctx.port.roles(ctx.app);
			const role = roles.find((r) => r.id === roleId) ?? roles[0];
			body =
				role === undefined ? (
					<EmptyState icon="shield" title={m.settings_empty_title({}, o)} />
				) : (
					<RolesTab
						roles={roles}
						role={role}
						locale={ctx.locale}
						canEdit={ctx.can.write("roles_edit")}
					/>
				);
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
		children: [
			...(flash === undefined
				? []
				: [
						<Banner key="flash" tone="info" icon="check">
							{flash}
						</Banner>,
					]),
			body,
		],
	});
}

export function registerSettings(app: Hono<Env>): void {
	for (const tab of SETTINGS_TABS) {
		app.get(`/settings/${tab}`, async (c) => {
			const flash =
				c.req.query("saved") === "1" && tab === "roles"
					? m.roles_saved({}, at(c.var.ctx.locale))
					: undefined;
			return c.html(await renderSettings(c.var.ctx, tab, c.req.query("role"), flash), 200, {
				"cache-control": "private, no-store",
			});
		});
	}
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
