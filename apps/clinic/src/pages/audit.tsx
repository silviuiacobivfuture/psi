import { Banner, EmptyState, PageHeader } from "@psi/ui/admin";
import type { JSX } from "hono/jsx/jsx-runtime";
import { Page } from "../chrome";
import type { Ctx } from "../lib/context";
import { at } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { AuditEvent } from "../port/schema";

export async function renderAudit(ctx: Ctx): Promise<JSX.Element> {
	const o = at(ctx.locale);
	let events: ReadonlyArray<AuditEvent> = [];
	let failed = false;
	try {
		events = await ctx.port.audit(ctx.app);
	} catch {
		failed = true;
	}
	const fmt = new Intl.DateTimeFormat(ctx.locale, { dateStyle: "medium", timeStyle: "short" });
	return Page({
		ctx,
		current: "audit",
		title: m.audit_title({}, o),
		children: (
			<div class="adm-page">
				<PageHeader title={m.nav_audit({}, o)} />
				{failed ? (
					<Banner tone="error" icon="alert">
						<strong>{m.error_title({}, o)}</strong>
						<p style="margin:2px 0 8px">{m.error_text({}, o)}</p>
						<a class="adm-btn" href="/audit">
							{m.retry({}, o)}
						</a>
					</Banner>
				) : events.length === 0 ? (
					<EmptyState
						icon="list"
						title={m.audit_empty_title({}, o)}
						text={m.audit_empty_text({}, o)}
					/>
				) : (
					<section class="adm-scroll" tabindex={0} aria-label={m.audit_title({}, o)}>
						<table class="adm-table">
							<thead>
								<tr>
									<th scope="col">{m.audit_when({}, o)}</th>
									<th scope="col">{m.audit_who({}, o)}</th>
									<th scope="col">{m.audit_what({}, o)}</th>
									<th scope="col">{m.audit_target({}, o)}</th>
								</tr>
							</thead>
							<tbody>
								{events.map((e) => (
									<tr key={e.id}>
										<td>{fmt.format(new Date(e.at))}</td>
										<td>{e.actor}</td>
										<td>
											<code>{e.action}</code>
										</td>
										<td>
											<code>{e.target}</code>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</section>
				)}
			</div>
		),
	});
}
