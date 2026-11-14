import { Banner } from "@psi/ui/admin";
import type { Context, Hono } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import { actionCtx } from "../actions/context";
import { runAction } from "../actions/engine";
import type { Env } from "../app";
import { areaText } from "../lib/area-labels";
import type { Ctx } from "../lib/context";
import { at, type Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import { type OrgProfileView, WEEKDAYS, type Weekday } from "../port/org-port";
import {
	type FormValues,
	formValues,
	hourField,
	PHONE_ROWS,
	PostedForm,
	phoneField,
	SPANS,
} from "./org-profile-form";
import { OrgFrame } from "./org-settings";

const NOCACHE = { "cache-control": "private, no-store" } as const;
type Notice = "saved" | "invalid" | "stale" | null;
type O = ReturnType<typeof at>;

const DAY: Readonly<Record<Weekday, (o: O) => string>> = {
	mon: (o) => m.st_org_day_mon({}, o),
	tue: (o) => m.st_org_day_tue({}, o),
	wed: (o) => m.st_org_day_wed({}, o),
	thu: (o) => m.st_org_day_thu({}, o),
	fri: (o) => m.st_org_day_fri({}, o),
	sat: (o) => m.st_org_day_sat({}, o),
	sun: (o) => m.st_org_day_sun({}, o),
};

function Fact({ label, value }: { label: string; value: string }): JSX.Element {
	return (
		<div class="adm-stack">
			<span class="adm-muted">{label}</span>
			<strong>{value}</strong>
		</div>
	);
}

function Field(p: {
	name: string;
	label: string;
	values: FormValues;
	type?: "text" | "email" | "url" | "tel";
	max?: number;
	hint?: string;
	autocomplete?: string;
	edit: boolean;
}): JSX.Element {
	const id = `org-${p.name}`;
	return (
		<label class="adm-field" for={id}>
			<span>{p.label}</span>
			<input
				id={id}
				class="adm-input"
				name={p.name}
				type={p.type ?? "text"}
				value={p.values[p.name] ?? ""}
				maxlength={p.max ?? 200}
				readonly={!p.edit}
				{...(p.autocomplete === undefined ? {} : { autocomplete: p.autocomplete })}
				{...(p.hint === undefined ? {} : { "aria-describedby": `${id}-hint` })}
			/>
			{p.hint === undefined ? null : (
				<small class="adm-muted" id={`${id}-hint`}>
					{p.hint}
				</small>
			)}
		</label>
	);
}

function Section({
	id,
	title,
	children,
}: {
	id: string;
	title: string;
	children: JSX.Element | ReadonlyArray<JSX.Element | ReadonlyArray<JSX.Element>>;
}): JSX.Element {
	return (
		<fieldset class="adm-card adm-stack me-card org-section" aria-labelledby={id}>
			<h2 class="adm-h2" id={id}>
				{title}
			</h2>
			<div class="me-form">{children}</div>
		</fieldset>
	);
}

/** One weekday: up to two stretches (a break at noon), each a pair of times; a day with no times is closed. */
function DayRow({
	day,
	values,
	o,
	edit,
}: {
	day: Weekday;
	values: FormValues;
	o: O;
	edit: boolean;
}): JSX.Element {
	const name = DAY[day](o);
	return (
		<fieldset class="org-day" data-day={day} aria-label={name}>
			<strong class="org-day__name">{name}</strong>
			{Array.from({ length: SPANS }, (_, i) => i + 1).map((span) => (
				<div class="org-day__span" key={String(span)}>
					{(["open", "close"] as const).map((edge) => {
						const field = hourField(day, span, edge);
						const text =
							edge === "open"
								? m.st_org_open({ day: name, n: String(span) }, o)
								: m.st_org_close({ day: name, n: String(span) }, o);
						return (
							<input
								key={edge}
								class="adm-input"
								type="time"
								step={60}
								name={field}
								value={values[field] ?? ""}
								aria-label={text}
								title={text}
								readonly={!edit}
							/>
						);
					})}
				</div>
			))}
		</fieldset>
	);
}

function ProfileForm({
	ctx,
	view,
	values,
	edit,
}: {
	ctx: Ctx;
	view: OrgProfileView;
	values: FormValues;
	edit: boolean;
}): JSX.Element {
	const o = at(ctx.locale);
	const f = (name: string, label: string, extra: Partial<Parameters<typeof Field>[0]> = {}) => (
		<Field name={name} label={label} values={values} edit={edit} {...extra} />
	);
	return (
		<form method="post" action="/settings/profile" class="adm-stack" data-action="org.profile">
			<input type="hidden" name="revision" value={String(view.revision)} />
			<Section id="org-identity" title={m.st_org_identity({}, o)}>
				{f("legalName", m.st_org_legal_name({}, o), { autocomplete: "organization" })}
				{f("cui", m.st_org_cui({}, o), { max: 12, hint: m.st_org_cui_hint({}, o) })}
				{f("logoUrl", m.st_org_logo({}, o), {
					type: "url",
					max: 500,
					hint: m.st_org_https_hint({}, o),
				})}
			</Section>
			<Section id="org-address" title={m.st_org_address({}, o)}>
				{f("street", m.st_org_street({}, o), { autocomplete: "street-address" })}
				{f("city", m.st_org_city({}, o), { max: 100, autocomplete: "address-level2" })}
				{f("county", m.st_org_county({}, o), { max: 100, autocomplete: "address-level1" })}
				{f("postalCode", m.st_org_postal({}, o), { max: 6, autocomplete: "postal-code" })}
				{f("mapUrl", m.st_org_map({}, o), {
					type: "url",
					max: 500,
					hint: m.st_org_https_hint({}, o),
				})}
			</Section>
			<Section id="org-contact" title={m.st_org_contact({}, o)}>
				{Array.from({ length: PHONE_ROWS }, (_, i) => i + 1).flatMap((row) => [
					f(phoneField(row, "number"), m.st_org_phone({ n: String(row) }, o), {
						type: "tel",
						max: 25,
						...(row === 1 ? { hint: m.st_org_phone_main({}, o) } : {}),
					}),
					f(phoneField(row, "label"), m.st_org_phone_label({ n: String(row) }, o), { max: 60 }),
				])}
				{f("email", m.st_org_email({}, o), { type: "email", autocomplete: "email" })}
				{f("website", m.st_org_website({}, o), { type: "url", max: 500, autocomplete: "url" })}
			</Section>
			<fieldset class="adm-card adm-stack me-card org-section" aria-labelledby="org-hours">
				<h2 class="adm-h2" id="org-hours">
					{m.st_org_hours({}, o)}
				</h2>
				<p class="adm-muted">{m.st_org_hours_lead({}, o)}</p>
				<div class="org-hours">
					{WEEKDAYS.map((day) => (
						<DayRow key={day} day={day} values={values} o={o} edit={edit} />
					))}
				</div>
				{f("hoursNote", m.st_org_hours_note({}, o), { max: 300 })}
			</fieldset>
			{edit ? (
				<div class="me-actions">
					<button class="adm-btn adm-btn--primary" type="submit">
						{m.st_org_save({}, o)}
					</button>
				</div>
			) : null}
		</form>
	);
}

const NOTICE_TEXT: Readonly<Record<Exclude<Notice, null>, (o: O) => string>> = {
	saved: (o) => m.st_org_saved({}, o),
	invalid: (o) => m.st_org_invalid({}, o),
	stale: (o) => m.st_org_stale({}, o),
};

const when = (iso: string, locale: Locale, timeZone: string): string =>
	new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(
		new Date(iso),
	);

/**
 * PROFIL ORGANIZAȚIE: who the organisation is and how the public reaches it. Whoever may see the settings sees it; whoever
 * may edit them saves it whole. A refused save comes back with what was typed; a stale one with the stored profile.
 */
export async function renderOrgProfile(
	ctx: Ctx,
	notice: Notice,
	typed?: FormValues,
): Promise<JSX.Element> {
	const o = at(ctx.locale);
	const edit = ctx.can.write("app_settings_edit");
	let body: JSX.Element;
	try {
		const view = await ctx.port.orgProfile(ctx.app);
		body = (
			<>
				{view.updatedAt === null ? null : (
					<p class="adm-muted" data-updated>
						{m.st_org_updated({ when: when(view.updatedAt, ctx.locale, ctx.caps.timeZone) }, o)}
					</p>
				)}
				<ProfileForm ctx={ctx} view={view} values={typed ?? formValues(view.profile)} edit={edit} />
			</>
		);
	} catch {
		body = (
			<Banner tone="error" icon="alert">
				<strong>{m.error_title({}, o)}</strong>
			</Banner>
		);
	}
	return OrgFrame({
		ctx,
		area: "profile",
		title: areaText("profile", ctx.locale).title,
		children: (
			<>
				{notice === null ? null : (
					<Banner
						tone={notice === "saved" ? "info" : "error"}
						icon={notice === "saved" ? "check" : "alert"}
					>
						<span data-notice={notice}>{NOTICE_TEXT[notice](o)}</span>
					</Banner>
				)}
				<div class="adm-card adm-stack" style="gap:var(--space-4)">
					<Fact label={m.st_profile_name({}, o)} value={ctx.caps.appName} />
					<Fact label={m.st_profile_zone({}, o)} value={ctx.caps.timeZone} />
					<Fact label={m.st_profile_slug({}, o)} value={ctx.app} />
				</div>
				{body}
			</>
		),
	});
}

async function save(c: Context<Env>): Promise<Response> {
	const ctx = c.var.ctx;
	const posted = PostedForm.safeParse(await c.req.parseBody());
	if (!posted.success) return c.html(await renderOrgProfile(ctx, "invalid"), 400, NOCACHE);
	const result = await runAction(actionCtx(ctx), "org.profile", posted.data, { confirmed: true });
	if (result.status === "ok") return c.redirect(result.to ?? "/settings/profile?saved=1", 303);
	if (result.status === "refused" && result.code === "invalid")
		return c.html(await renderOrgProfile(ctx, "invalid", posted.data), 400, NOCACHE);
	if (result.status === "refused" && result.code === "conflict")
		return c.html(await renderOrgProfile(ctx, "stale"), 409, NOCACHE);
	return c.text(result.status === "refused" ? result.code : "confirmation", 400);
}

export function registerOrgProfile(app: Hono<Env>): void {
	app.get("/settings/profile", async (c) =>
		c.html(
			await renderOrgProfile(c.var.ctx, c.req.query("saved") === "1" ? "saved" : null),
			200,
			NOCACHE,
		),
	);
	app.post("/settings/profile", save);
}
