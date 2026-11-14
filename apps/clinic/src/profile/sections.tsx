import { EmptyState, Icon, StatusPill } from "@psi/ui/admin";
import type { Child } from "hono/jsx";
import type { JSX } from "hono/jsx/jsx-runtime";
import { ASSISTANT_BASE } from "../assistant/mount";
import type { SessionInfo } from "../auth";
import { appName, roleName } from "../chrome";
import { deviceLabel } from "../device";
import type { Ctx } from "../lib/context";
import { at } from "../lib/i18n";
import { relative } from "../lib/when";
import { m } from "../paraglide/messages.js";
import {
	defaultOn,
	type MyFeedback,
	NOTIFY_CHANNELS,
	NOTIFY_KINDS,
	type NotificationPrefs,
	type NotifyChannel,
	type NotifyKind,
	type Profile,
} from "../port/profile-port";
import type { Column } from "../port/schema";

export interface ProfileData {
	profile: Profile | null;
	prefs: NotificationPrefs | null;
	feedback: ReadonlyArray<MyFeedback> | null;
	sessions: ReadonlyArray<SessionInfo>;
	column: Column | null;
	hours: string | null;
	ssoUrl: string | null;
	flash: "phone" | "notif" | "phone-invalid" | null;
}

const initials = (name: string): string =>
	name
		.split(/\s+/)
		.filter((w) => w !== "")
		.slice(0, 2)
		.map((w) => Array.from(w)[0] ?? "")
		.join("")
		.toUpperCase();

export function Card({
	title,
	id,
	children,
}: {
	title: string;
	id: string;
	children: Child;
}): JSX.Element {
	return (
		<section class="adm-card pf-card" aria-labelledby={`pf-${id}`} data-pf={id}>
			<h2 class="adm-h2" id={`pf-${id}`}>
				{title}
			</h2>
			{children}
		</section>
	);
}

function Soon({ ctx }: { ctx: Ctx }): JSX.Element {
	const o = at(ctx.locale);
	return <EmptyState icon="clock" title={m.pf_soon_title({}, o)} text={m.pf_soon_text({}, o)} />;
}

/** Who this is: a monogram (the sign-in keeps no photo), the name, and the role they hold in each app. */
export function Identity({ ctx, data }: { ctx: Ctx; data: ProfileData }): JSX.Element {
	const o = at(ctx.locale);
	return (
		<section class="adm-card pf-head" aria-label={m.pf_title({}, o)}>
			<span class="pf-avatar" aria-hidden="true">
				{initials(ctx.person.name)}
			</span>
			<div class="pf-head__text">
				<h2 class="adm-h1">{ctx.person.name}</h2>
				{ctx.person.email === null ? null : <span class="adm-muted">{ctx.person.email}</span>}
				<ul class="pf-roles" aria-label={m.pf_apps_roles({}, o)}>
					{ctx.platformAdmin ? (
						<li>
							<StatusPill status="attended" label={m.pf_platform_admin({}, o)} />
						</li>
					) : null}
					{ctx.memberships.map((mb) => (
						<li key={mb.app}>
							{m.pf_role_in(
								{
									app: appName(mb.app, ctx.locale),
									roles: mb.roles
										.map((r) =>
											roleName(r, ctx.locale, mb.app === ctx.app ? ctx.caps.roleNames : undefined),
										)
										.join(", "),
								},
								o,
							)}
						</li>
					))}
				</ul>
				{data.column === null ? null : (
					<p class="pf-cal" style={`--c:var(--cal-${data.column.colour})`}>
						<span class="pf-cal__dot" aria-hidden="true" />
						<strong>{data.column.name}</strong>
						<span class="adm-muted">
							{data.hours === null || data.hours === "" ? m.pf_hours_none({}, o) : data.hours}
						</span>
					</p>
				)}
			</div>
		</section>
	);
}

/** Name and e-mail are the sign-in's and read-only; the phone is the person's own to keep. */
export function Account({ ctx, data }: { ctx: Ctx; data: ProfileData }): JSX.Element {
	const o = at(ctx.locale);
	return (
		<Card title={m.pf_account({}, o)} id="account">
			<dl class="pf-kv">
				<div>
					<dt>{m.pf_name({}, o)}</dt>
					<dd>{ctx.person.name}</dd>
				</div>
				<div>
					<dt>{m.pf_email({}, o)}</dt>
					<dd>{ctx.person.email ?? m.pf_email_none({}, o)}</dd>
				</div>
			</dl>
			<p class="adm-muted">{m.pf_sso_note({}, o)}</p>
			{data.ssoUrl === null ? null : (
				<a class="adm-btn" href={data.ssoUrl} rel="noreferrer noopener" target="_blank">
					<Icon name="user" />
					{m.pf_sso_change({}, o)}
				</a>
			)}
			{data.profile === null ? (
				<Soon ctx={ctx} />
			) : (
				<form method="post" action="/me/profile/phone" class="adm-stack">
					<label class="adm-field">
						<span>{m.pf_phone({}, o)}</span>
						<input
							class="adm-input"
							type="tel"
							name="phone"
							value={data.profile.phone ?? ""}
							autocomplete="tel"
							maxlength={40}
							aria-describedby="pf-phone-hint"
						/>
					</label>
					<p class="adm-muted" id="pf-phone-hint">
						{m.pf_phone_hint({}, o)}
					</p>
					{data.flash === "phone" ? <p role="status">{m.pf_phone_saved({}, o)}</p> : null}
					{data.flash === "phone-invalid" ? <p role="alert">{m.pf_phone_invalid({}, o)}</p> : null}
					<div>
						<button class="adm-btn adm-btn--primary" type="submit">
							{m.pf_phone_save({}, o)}
						</button>
					</div>
				</form>
			)}
		</Card>
	);
}

function Choice({
	label,
	action,
	name,
	value,
	options,
}: {
	label: string;
	action: string;
	name: string;
	value: string;
	options: ReadonlyArray<{ value: string; label: string }>;
}): JSX.Element {
	const id = `pf-choice-${name}`;
	return (
		<form method="post" action={action} class="adm-stack">
			<span class="adm-muted" id={id}>
				{label}
			</span>
			<fieldset class="adm-seg" aria-labelledby={id}>
				{options.map((opt) => (
					<button
						key={opt.value}
						class="adm-seg__item"
						type="submit"
						name={name}
						value={opt.value}
						aria-pressed={opt.value === value ? "true" : "false"}
					>
						{opt.label}
					</button>
				))}
			</fieldset>
		</form>
	);
}

/** Language, theme and the assistant's presentation: the same saved choices as the account menu, with room to read. */
export function Preferences({ ctx }: { ctx: Ctx }): JSX.Element {
	const o = at(ctx.locale);
	return (
		<Card title={m.pf_prefs({}, o)} id="prefs">
			<Choice
				label={m.language_label({}, o)}
				action="/prefs"
				name="lang"
				value={ctx.locale}
				options={[
					{ value: "ro", label: "RO" },
					{ value: "en", label: "EN" },
				]}
			/>
			<Choice
				label={m.theme_label({}, o)}
				action="/prefs"
				name="theme"
				value={ctx.pref}
				options={[
					{ value: "light", label: m.theme_light({}, o) },
					{ value: "dark", label: m.theme_dark({}, o) },
					{ value: "system", label: m.theme_system({}, o) },
				]}
			/>
			{ctx.assistant === undefined ? null : (
				<Choice
					label={m.pf_prefs_assistant({}, o)}
					action={`${ASSISTANT_BASE}/mode`}
					name="mode"
					value={ctx.assistantMode}
					options={[
						{ value: "bar", label: m.assistant_mode_bar({}, o) },
						{ value: "panel", label: m.assistant_mode_panel({}, o) },
					]}
				/>
			)}
		</Card>
	);
}

const KIND_LABEL: Readonly<Record<NotifyKind, (l: Ctx["locale"]) => string>> = {
	requests: (l) => m.pf_k_requests({}, at(l)),
	appointments: (l) => m.pf_k_appointments({}, at(l)),
	reminders: (l) => m.pf_k_reminders({}, at(l)),
	feedback: (l) => m.pf_k_feedback({}, at(l)),
};
const CHANNEL_LABEL: Readonly<Record<NotifyChannel, (l: Ctx["locale"]) => string>> = {
	inbox: (l) => m.pf_c_inbox({}, at(l)),
	push: (l) => m.pf_c_push({}, at(l)),
	email: (l) => m.pf_c_email({}, at(l)),
};

/** Per channel per kind: one checkbox per cell, named `n.<kind>.<channel>`, in a real table. */
export function Notifications({ ctx, data }: { ctx: Ctx; data: ProfileData }): JSX.Element {
	const o = at(ctx.locale);
	const on = (kind: NotifyKind, channel: NotifyChannel): boolean =>
		data.prefs?.prefs.find((p) => p.kind === kind && p.channel === channel)?.on ??
		defaultOn(channel);
	return (
		<Card title={m.pf_notif({}, o)} id="notif">
			{data.prefs === null ? (
				<Soon ctx={ctx} />
			) : (
				<form method="post" action="/me/profile/notifications" class="adm-stack">
					<p class="adm-muted">{m.pf_notif_lead({}, o)}</p>
					<section class="adm-scroll" tabindex={0} aria-label={m.pf_notif({}, o)}>
						<table class="adm-table pf-matrix">
							<thead>
								<tr>
									<th scope="col">{m.pf_notif_kind({}, o)}</th>
									{NOTIFY_CHANNELS.map((c) => (
										<th key={c} scope="col">
											{CHANNEL_LABEL[c](ctx.locale)}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{NOTIFY_KINDS.map((k) => (
									<tr key={k}>
										<th scope="row">{KIND_LABEL[k](ctx.locale)}</th>
										{NOTIFY_CHANNELS.map((c) => (
											<td key={c}>
												<label class="adm-check">
													<input
														type="checkbox"
														name={`n.${k}.${c}`}
														checked={on(k, c)}
														aria-label={`${KIND_LABEL[k](ctx.locale)}: ${CHANNEL_LABEL[c](ctx.locale)}`}
													/>
												</label>
											</td>
										))}
									</tr>
								))}
							</tbody>
						</table>
					</section>
					{data.flash === "notif" ? <p role="status">{m.pf_notif_saved({}, o)}</p> : null}
					<div>
						<button class="adm-btn adm-btn--primary" type="submit">
							{m.pf_notif_save({}, o)}
						</button>
					</div>
				</form>
			)}
		</Card>
	);
}

/** The browsers the person is signed in on, and the one button that ends them all. */
export function Sessions({ ctx, data }: { ctx: Ctx; data: ProfileData }): JSX.Element {
	const o = at(ctx.locale);
	return (
		<Card title={m.pf_sessions({}, o)} id="sessions">
			<p class="adm-muted">{m.pf_sessions_lead({}, o)}</p>
			<ul class="pf-list">
				{data.sessions.map((s) => (
					<li key={`${s.userAgent ?? ""}-${s.lastSeen ?? "now"}`} class="pf-list__row">
						<Icon name="shield" />
						<span>
							<strong>
								{deviceLabel(s.userAgent, m.pf_on({}, o)) || m.pf_session_unknown({}, o)}
							</strong>
							{s.current ? (
								<span class="adm-muted"> · {m.pf_session_current({}, o)}</span>
							) : s.lastSeen === null ? null : (
								<span class="adm-muted">
									{" · "}
									{m.pf_session_seen({ when: relative(s.lastSeen, ctx.locale) }, o)}
								</span>
							)}
						</span>
					</li>
				))}
			</ul>
			<form method="post" action={ctx.signOut}>
				<button class="adm-btn" type="submit">
					<Icon name="logout" />
					{m.pf_signout_all({}, o)}
				</button>
			</form>
		</Card>
	);
}

/** What the person told the team, and what came back. */
export function MyFeedbackList({ ctx, data }: { ctx: Ctx; data: ProfileData }): JSX.Element {
	const o = at(ctx.locale);
	return (
		<Card title={m.pf_feedback({}, o)} id="feedback">
			{data.feedback === null ? (
				<Soon ctx={ctx} />
			) : data.feedback.length === 0 ? (
				<p class="adm-muted">{m.pf_feedback_none({}, o)}</p>
			) : (
				<ul class="pf-list">
					{data.feedback.map((f) => (
						<li key={f.id} class="pf-list__row pf-list__row--stack">
							<span class="adm-muted">
								{relative(f.at, ctx.locale)} ·{" "}
								{f.status === "answered"
									? m.pf_feedback_answered({}, o)
									: m.pf_feedback_open({}, o)}
							</span>
							<span>{f.text}</span>
							{f.reply === null ? null : (
								<span class="adm-muted">{m.pf_feedback_reply({ reply: f.reply }, o)}</span>
							)}
						</li>
					))}
				</ul>
			)}
		</Card>
	);
}
