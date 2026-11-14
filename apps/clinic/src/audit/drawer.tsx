import { Icon } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Ctx } from "../lib/context";
import { at } from "../lib/i18n";
import { joinRoles } from "../lib/roles-joined";
import { absolute, relative } from "../lib/when";
import { m } from "../paraglide/messages.js";
import { changeRows, visibleChanges } from "./changes";
import type { AuditLookup } from "./lookup";
import type { Row } from "./rows";

export const DRAWER_BODY = "audit-drawer-body";

function Item({ label, children }: { label: string; children: JSX.Element | string }): JSX.Element {
	return (
		<div class="audit-kv__row">
			<dt>{label}</dt>
			<dd>{children}</dd>
		</div>
	);
}

/** An empty drawer, the one the page holds until a row is opened. */
export function DrawerShell({ ctx }: { ctx: Ctx }): JSX.Element {
	return (
		<div id={DRAWER_BODY} class="audit-drawer">
			<p class="adm-muted" role="status">
				{m.jr_d_loading({}, at(ctx.locale))}
			</p>
		</div>
	);
}

/** One event in full: who, when, what in words, the object, the field-level change, where it came from. */
export function DrawerBody({
	ctx,
	row,
	lookup,
}: {
	ctx: Ctx;
	row: Row;
	lookup: AuditLookup;
}): JSX.Element {
	const o = at(ctx.locale);
	const e = row.event;
	const tz = ctx.caps.timeZone;
	const changes = changeRows(visibleChanges(e, ctx.can), lookup, ctx.locale);
	const missing = m.jr_d_notrec({}, o);
	return (
		<div id={DRAWER_BODY} class="audit-drawer" data-audit-event={e.id}>
			<p class="audit-drawer__sentence">{row.sentence}</p>
			<dl class="audit-kv">
				<Item label={m.jr_d_who({}, o)}>{row.who}</Item>
				{row.roles.length === 0 ? null : (
					<Item label={m.jr_d_role({}, o)}>{joinRoles(row.roles)}</Item>
				)}
				{e.asWhom === undefined ? null : <Item label={m.jr_d_as({}, o)}>{e.asWhom}</Item>}
				<Item label={m.jr_d_when({}, o)}>
					{`${absolute(e.at, ctx.locale, tz)} · ${relative(e.at, ctx.locale)}`}
				</Item>
				<Item label={m.jr_d_what({}, o)}>{row.action}</Item>
				<Item label={m.jr_d_object({}, o)}>
					{row.href === null ? (
						`${row.typeText} · ${row.objectText}`
					) : (
						<a href={row.href} class="audit-link">
							<Icon name="chevron-right" />
							{`${row.typeText} · ${row.objectText}`}
						</a>
					)}
				</Item>
				{e.reason === undefined ? null : <Item label={m.jr_d_reason({}, o)}>{e.reason}</Item>}
				<Item label={m.jr_d_source({}, o)}>{row.source}</Item>
			</dl>
			<h3 class="adm-h2">{m.jr_d_changes({}, o)}</h3>
			{changes.length === 0 ? (
				<p class="adm-muted">{m.jr_d_nochanges({}, o)}</p>
			) : (
				<section class="adm-scroll" tabindex={0} aria-label={m.jr_d_changes({}, o)}>
					<table class="adm-table audit-diff">
						<thead>
							<tr>
								<th scope="col">{m.jr_d_field({}, o)}</th>
								<th scope="col">{m.jr_d_before({}, o)}</th>
								<th scope="col">{m.jr_d_after({}, o)}</th>
							</tr>
						</thead>
						<tbody>
							{changes.map((c) => (
								<tr key={c.label}>
									<th scope="row">{c.label}</th>
									<td class="audit-diff__before">{c.before}</td>
									<td class="audit-diff__after">{c.after}</td>
								</tr>
							))}
						</tbody>
					</table>
				</section>
			)}
			<h3 class="adm-h2">{m.jr_d_tech({}, o)}</h3>
			<dl class="audit-kv">
				<Item label={m.jr_d_code({}, o)}>
					<code>{e.action}</code>
				</Item>
				<Item label={m.jr_d_request({}, o)}>
					{e.requestId === undefined ? missing : <code>{e.requestId}</code>}
				</Item>
				<Item label={m.jr_d_ip({}, o)}>{e.ip ?? missing}</Item>
				<Item label={m.jr_d_device({}, o)}>{e.device ?? missing}</Item>
			</dl>
		</div>
	);
}
