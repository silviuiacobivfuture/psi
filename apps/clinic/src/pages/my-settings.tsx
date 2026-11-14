import { Banner, PageHeader } from "@psi/ui/admin";
import type { Context, Hono } from "hono";
import { setCookie } from "hono/cookie";
import type { JSX } from "hono/jsx/jsx-runtime";
import { z } from "zod";
import { actionCtx } from "../actions/context";
import { runAction } from "../actions/engine";
import type { Env } from "../app";
import { Page, rolesText } from "../chrome";
import type { Ctx } from "../lib/context";
import { at } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import type { MySettings, MySettingsView } from "../port/schema-settings";
import { NotificationsForm } from "./my-notifications";

function Fact({ label, value }: { label: string; value: string }): JSX.Element {
	return (
		<div class="adm-stack">
			<span class="adm-muted">{label}</span>
			<strong>{value}</strong>
		</div>
	);
}

function Choice<V extends string>({
	name,
	label,
	value,
	options,
}: {
	name: string;
	label: string;
	value: V;
	options: ReadonlyArray<{ value: V; label: string }>;
}): JSX.Element {
	return (
		<label class="adm-field">
			<span>{label}</span>
			<select class="adm-input" name={name}>
				{options.map((o) => (
					<option key={o.value} value={o.value} selected={o.value === value}>
						{o.label}
					</option>
				))}
			</select>
		</label>
	);
}

/** Language, theme and the calendar's first view: kept by the service, so they follow the person to any device. */
function Preferences({ ctx, settings }: { ctx: Ctx; settings: MySettings }): JSX.Element {
	const o = at(ctx.locale);
	return (
		<section class="adm-card adm-stack me-card" id="prefs" aria-labelledby="me-prefs">
			<h2 class="adm-h2" id="me-prefs">
				{m.me_appearance({}, o)}
			</h2>
			<form method="post" action="/me/settings" class="me-form" data-action="me.settings">
				<Choice
					name="locale"
					label={m.me_lang({}, o)}
					value={settings.locale}
					options={[
						{ value: "ro", label: m.me_lang_ro({}, o) },
						{ value: "en", label: m.me_lang_en({}, o) },
					]}
				/>
				<Choice
					name="theme"
					label={m.theme_label({}, o)}
					value={settings.theme}
					options={[
						{ value: "system", label: m.theme_system({}, o) },
						{ value: "light", label: m.theme_light({}, o) },
						{ value: "dark", label: m.theme_dark({}, o) },
					]}
				/>
				<Choice
					name="calendarView"
					label={m.me_view({}, o)}
					value={settings.calendarView}
					options={[
						{ value: "day", label: m.view_day({}, o) },
						{ value: "week", label: m.view_week({}, o) },
						{ value: "month", label: m.view_month({}, o) },
					]}
				/>
				<div class="me-actions">
					<button class="adm-btn adm-btn--primary" type="submit">
						{m.me_settings_save({}, o)}
					</button>
				</div>
			</form>
			<form method="post" action="/prefs" class="adm-row" data-action="me.prefs">
				<span class="adm-muted">{m.deco_label({}, o)}</span>
				<fieldset class="adm-seg">
					{(["off", "on"] as const).map((v) => (
						<button
							key={v}
							class="adm-seg__item"
							type="submit"
							name="deco"
							value={v}
							aria-pressed={ctx.deco === (v === "on")}
						>
							{v === "on" ? m.deco_on({}, o) : m.deco_off({}, o)}
						</button>
					))}
				</fieldset>
			</form>
		</section>
	);
}

const Notice = z.enum(["prefs", "notif"]).optional().catch(undefined);

/** SETĂRILE MELE: what is each person's own, whatever their role. */
export async function renderMySettings(
	ctx: Ctx,
	notice: { saved?: "prefs" | "notif" | undefined; invalid: boolean },
): Promise<JSX.Element> {
	const o = at(ctx.locale);
	const settings: MySettingsView = await ctx.port.mySettings(ctx.app, ctx.person.subject);
	return Page({
		ctx,
		current: "me",
		title: m.me_title({}, o),
		children: (
			<div class="adm-page">
				<PageHeader title={m.me_title({}, o)} />
				<p class="adm-muted">{m.me_lead({}, o)}</p>
				{notice.saved === undefined ? null : (
					<Banner tone="info" icon="check">
						{m.me_saved({}, o)}
					</Banner>
				)}
				{notice.invalid ? (
					<Banner tone="error" icon="alert">
						{m.me_invalid({}, o)}
					</Banner>
				) : null}
				<section class="adm-card adm-stack me-card" aria-labelledby="me-profile">
					<h2 class="adm-h2" id="me-profile">
						{m.me_profile({}, o)}
					</h2>
					<Fact label={m.me_name({}, o)} value={ctx.person.name} />
					<Fact label={m.me_email({}, o)} value={ctx.person.email ?? "—"} />
					<Fact
						label={m.me_roles({}, o)}
						value={rolesText(ctx.caps.roles, ctx.locale, ctx.caps.roleNames)}
					/>
				</section>
				{/* The language and theme the person sees now (the top bar may have changed them on this device): saving
				keeps them for every device. */}
				<Preferences ctx={ctx} settings={{ ...settings, locale: ctx.locale, theme: ctx.pref }} />
				<section class="adm-stack" id="notif" aria-labelledby="me-notif">
					<h2 class="adm-h2" id="me-notif">
						{m.me_notifications({}, o)}
					</h2>
					<NotificationsForm ctx={ctx} settings={settings} />
					<div class="adm-card">
						{ctx.pwa.notifications({
							locale: ctx.locale,
							signedIn: true,
							signInHref: "/",
							devices: await ctx.pwa.devices(ctx.person.subject),
						})}
					</div>
				</section>
				<section class="adm-card adm-stack me-card">
					<h2 class="adm-h2">{m.me_session({}, o)}</h2>
					<form method="post" action={ctx.signOut}>
						<button class="adm-btn" type="submit">
							{m.sign_out({}, o)}
						</button>
					</form>
				</section>
			</div>
		),
	});
}

const COOKIE = { path: "/", maxAge: 31536000, sameSite: "Lax" as const };

/** The device remembers language and theme too, so the next page is already in them before anything is asked. */
export function rememberOnDevice(c: Context, s: Pick<MySettings, "locale" | "theme">): void {
	setCookie(c, "lang", s.locale, COOKIE);
	setCookie(c, "theme", s.theme, COOKIE);
}

const SettingsData = z.object({
	locale: z.enum(["ro", "en"]),
	theme: z.enum(["light", "dark", "system"]),
});

/** One of the page's forms, through its action; an invalid set comes back to the page saying so, nothing saved. */
async function save(c: Context<Env>, id: "me.settings" | "me.notifications"): Promise<Response> {
	const form = Object.fromEntries(
		Object.entries(await c.req.parseBody()).filter(([, v]) => typeof v === "string"),
	);
	const result = await runAction(actionCtx(c.var.ctx), id, form, { confirmed: true });
	if (result.status === "ok") {
		const data = SettingsData.safeParse(result.data);
		if (data.success) rememberOnDevice(c, data.data);
		return c.redirect(result.to ?? "/me/settings", 303);
	}
	if (result.status === "refused" && result.code === "invalid")
		return c.redirect(
			`/me/settings?error=invalid#${id === "me.settings" ? "prefs" : "notif"}`,
			303,
		);
	return c.text(result.status === "refused" ? result.code : "confirmation", 400);
}

export function registerMySettings(app: Hono<Env>): void {
	app.get("/me/settings", async (c) =>
		c.html(
			await renderMySettings(c.var.ctx, {
				saved: Notice.parse(c.req.query("saved")),
				invalid: c.req.query("error") === "invalid",
			}),
			200,
			{ "cache-control": "private, no-store" },
		),
	);
	app.post("/me/settings", (c) => save(c, "me.settings"));
	app.post("/me/settings/notifications", (c) => save(c, "me.notifications"));
	// The old addresses keep working.
	app.get("/settings/notifications", (c) => c.redirect("/me/settings", 302));
	// The older addresses of the notification forms are the same save.
	app.post("/settings/notifications", (c) => save(c, "me.notifications"));
	app.post("/me/profile/notifications", (c) => save(c, "me.notifications"));
}
