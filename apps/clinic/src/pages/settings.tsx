import {
	Banner,
	EmptyState,
	type FieldGroupToggle,
	type MatrixColumn,
	type MatrixRow,
	PermissionMatrix,
	Segmented,
	type Tab,
	Tabs,
} from "@psi/ui/admin";
import type { Hono } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Env } from "../app";
import { Page } from "../chrome";
import { formatMoney } from "../domain/money";
import type { Ctx } from "../lib/context";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { Column, Role, Service } from "../port/schema";
import { ACTIONS, FIELD_GROUPS, RESOURCE_ACTIONS, RESOURCES, SCOPES } from "../port/schema";
import { pwa } from "../pwa";
import { roleFromForm } from "./role-form";
import { actionLabel, fieldGroupLabel, groupLabel, resourceLabel, scopeLabel } from "./role-labels";

export const SETTINGS_TABS = [
	"people",
	"rooms",
	"devices",
	"services",
	"roles",
	"notifications",
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

const tabLabel = (t: SettingsTab, locale: Locale): string => {
	const o = at(locale);
	switch (t) {
		case "people":
			return m.tab_people({}, o);
		case "rooms":
			return m.tab_rooms({}, o);
		case "devices":
			return m.tab_devices({}, o);
		case "services":
			return m.tab_services({}, o);
		case "roles":
			return m.tab_roles({}, o);
		case "notifications":
			return m.tab_notifications({}, o);
		default: {
			const never: never = t;
			return never;
		}
	}
};

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
}: {
	items: ReadonlyArray<Service>;
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
		<div class="adm-scroll">
			<table class="adm-table">
				<tbody>
					{items.map((s) => (
						<tr key={s.id}>
							<th scope="row">{s.name}</th>
							<td>{m.service_duration({ n: s.durationMin }, o)}</td>
							<td>{formatMoney(s.priceBani, locale)}</td>
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
}: {
	roles: ReadonlyArray<Role>;
	role: Role;
	locale: Locale;
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
				<div>
					<button class="adm-btn adm-btn--primary" type="submit">
						{m.roles_save({}, o)}
					</button>
				</div>
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
	const tabs: Tab[] = SETTINGS_TABS.map((t) => ({
		key: t,
		label: tabLabel(t, ctx.locale),
		href: `/settings/${t}`,
	}));
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
			body = <ServiceList items={await ctx.port.services(ctx.app)} locale={ctx.locale} />;
		} else if (tab === "roles") {
			const roles = await ctx.port.roles(ctx.app);
			const role = roles.find((r) => r.id === roleId) ?? roles[0];
			body =
				role === undefined ? (
					<EmptyState icon="shield" title={m.settings_empty_title({}, o)} />
				) : (
					<RolesTab roles={roles} role={role} locale={ctx.locale} />
				);
		} else {
			const prefs = await ctx.port.pushPrefs(ctx.person.subject);
			body = (
				<div class="adm-stack" style="gap:var(--space-4)">
					<form method="post" action="/settings/notifications" class="adm-card adm-stack">
						<h3 class="adm-h2">{m.notif_title({}, o)}</h3>
						<label class="adm-check">
							<input type="checkbox" name="requests" checked={prefs.requests} />
							{m.notif_requests({}, o)}
						</label>
						<label class="adm-check">
							<input type="checkbox" name="reminders" checked={prefs.reminders} />
							{m.notif_reminders({}, o)}
						</label>
						<p class="adm-muted">{m.notif_sending_later({}, o)}</p>
						<div>
							<button class="adm-btn adm-btn--primary" type="submit">
								{m.notif_save({}, o)}
							</button>
						</div>
					</form>
					<div class="adm-card">
						{pwa.notifications({
							locale: ctx.locale,
							signedIn: true,
							signInHref: "/",
							devices: await pwa.devices(ctx.person.subject),
						})}
					</div>
				</div>
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
	return Page({
		ctx,
		current: "settings",
		title: m.settings_title({}, o),
		children: (
			<div class="adm-page">
				{flash === undefined ? null : (
					<Banner tone="info" icon="check">
						{flash}
					</Banner>
				)}
				<Tabs tabs={tabs} selected={tab} label={m.settings_tabs_label({}, o)} />
				{body}
			</div>
		),
	});
}

export function registerSettings(app: Hono<Env>): void {
	app.get("/settings", (c) => c.redirect("/settings/people", 302));
	for (const tab of SETTINGS_TABS) {
		app.get(`/settings/${tab}`, async (c) => {
			const flash =
				c.req.query("saved") === "1"
					? tab === "roles"
						? m.roles_saved({}, at(c.var.ctx.locale))
						: m.notif_saved({}, at(c.var.ctx.locale))
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
	app.post("/settings/notifications", async (c) => {
		const ctx = c.var.ctx;
		const form = await c.req.parseBody();
		await ctx.port.savePushPrefs(ctx.person.subject, {
			requests: form.requests !== undefined,
			reminders: form.reminders !== undefined,
		});
		return c.redirect("/settings/notifications?saved=1", 303);
	});
}
