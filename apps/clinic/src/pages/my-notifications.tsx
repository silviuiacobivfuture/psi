import type { JSX } from "hono/jsx/jsx-runtime";
import { cellName } from "../actions/registry-me";
import type { Ctx } from "../lib/context";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { MyNotificationsView, NotifyChannel, NotifyKind } from "../port/schema-settings";

const KIND_LABEL: Readonly<Record<NotifyKind, (l: Locale) => string>> = {
	requests: (l) => m.pf_k_requests({}, at(l)),
	appointments: (l) => m.pf_k_appointments({}, at(l)),
	reminders: (l) => m.pf_k_reminders({}, at(l)),
	packages: (l) => m.pf_k_packages({}, at(l)),
	payments: (l) => m.pf_k_payments({}, at(l)),
	feedback: (l) => m.pf_k_feedback({}, at(l)),
	account: (l) => m.pf_k_account({}, at(l)),
	digests: (l) => m.pf_k_digests({}, at(l)),
	alerts: (l) => m.pf_k_alerts({}, at(l)),
	security: (l) => m.pf_k_security({}, at(l)),
	assignments: (l) => m.pf_k_assignments({}, at(l)),
	leave: (l) => m.pf_k_leave({}, at(l)),
};
const CHANNEL_LABEL: Readonly<Record<NotifyChannel, (l: Locale) => string>> = {
	in_app: (l) => m.pf_c_in_app({}, at(l)),
	email: (l) => m.pf_c_email({}, at(l)),
	push: (l) => m.pf_c_push({}, at(l)),
};
const COLUMNS: ReadonlyArray<NotifyChannel> = ["in_app", "push", "email"];

/**
 * What reaches the person and how: per kind the service offers the team, each of its channels (one it keeps on is shown
 * ticked and cannot be changed), and quiet hours during which nothing is pushed. One checkbox per cell, named
 * `n.<kind>.<channel>`, in a real table that scrolls on its own on a narrow phone.
 */
export function NotificationsForm({
	ctx,
	view,
}: {
	ctx: Ctx;
	view: MyNotificationsView;
}): JSX.Element {
	const o = at(ctx.locale);
	const quiet = view.prefs.quietHours;
	return (
		<form
			method="post"
			action="/me/settings/notifications"
			class="adm-card me-form"
			data-action="me.notifications"
		>
			<p class="adm-muted">{m.pf_notif_lead({}, o)}</p>
			<section class="adm-scroll" tabindex={0} aria-label={m.me_notifications({}, o)}>
				<table class="adm-table pf-matrix">
					<thead>
						<tr>
							<th scope="col">{m.pf_notif_kind({}, o)}</th>
							{COLUMNS.map((c) => (
								<th key={c} scope="col">
									{CHANNEL_LABEL[c](ctx.locale)}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{view.kinds.map((k) => (
							<tr key={k.kind}>
								<th scope="row">{KIND_LABEL[k.kind](ctx.locale)}</th>
								{COLUMNS.map((c) => {
									if (!k.offered.includes(c))
										return (
											<td key={c} class="adm-muted">
												<span aria-hidden="true">—</span>
												<span class="adm-sr">{m.pf_c_none({}, o)}</span>
											</td>
										);
									const locked = k.locked.includes(c);
									const chosen = view.prefs.channels[k.kind]?.[c];
									return (
										<td key={c}>
											<label class="adm-check me-cell">
												<input
													type="checkbox"
													name={cellName(k.kind, c)}
													checked={locked || (chosen ?? k.defaults.includes(c))}
													disabled={locked}
													aria-label={`${KIND_LABEL[k.kind](ctx.locale)}: ${CHANNEL_LABEL[c](ctx.locale)}`}
												/>
											</label>
										</td>
									);
								})}
							</tr>
						))}
					</tbody>
				</table>
			</section>
			<p class="adm-muted">{m.me_locked_hint({}, o)}</p>
			<fieldset class="me-quiet">
				<legend>{m.me_quiet({}, o)}</legend>
				<label class="adm-check">
					<input type="checkbox" name="quiet" checked={quiet !== null} />
					{m.me_quiet_on({}, o)}
				</label>
				<div class="me-quiet__times">
					<label class="adm-field">
						<span>{m.me_quiet_from({}, o)}</span>
						<input
							class="adm-input"
							type="time"
							name="quietStart"
							value={quiet?.start ?? "21:00"}
						/>
					</label>
					<label class="adm-field">
						<span>{m.me_quiet_to({}, o)}</span>
						<input class="adm-input" type="time" name="quietEnd" value={quiet?.end ?? "08:00"} />
					</label>
				</div>
				<p class="adm-muted">{m.me_quiet_hint({}, o)}</p>
			</fieldset>
			<div class="me-actions">
				<button class="adm-btn adm-btn--primary" type="submit">
					{m.notif_save({}, o)}
				</button>
			</div>
		</form>
	);
}
