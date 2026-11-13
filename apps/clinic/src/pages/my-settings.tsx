import { Banner, EmptyState, PageHeader } from "@psi/ui/admin";
import type { Hono } from "hono";
import type { JSX } from "hono/jsx/jsx-runtime";
import type { Env } from "../app";
import { Page, roleName } from "../chrome";
import type { Ctx } from "../lib/context";
import { at } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import { PortError } from "../port/port";
import type { PushPrefs } from "../port/schema";

function Fact({ label, value }: { label: string; value: string }): JSX.Element {
	return (
		<div class="adm-stack">
			<span class="adm-muted">{label}</span>
			<strong>{value}</strong>
		</div>
	);
}

/** SETĂRILE MELE: what is each person's own, whatever their role. */
export async function renderMySettings(ctx: Ctx, saved: boolean): Promise<JSX.Element> {
	const o = at(ctx.locale);
	let prefs: PushPrefs | null = null;
	try {
		prefs = await ctx.port.pushPrefs(ctx.person.subject);
	} catch (err) {
		// The service keeps no push preferences yet: the form says "în curând"; the device list below still works.
		if (!(err instanceof PortError && err.code === "not-available-yet")) throw err;
	}
	return Page({
		ctx,
		current: "me",
		title: m.me_title({}, o),
		children: (
			<div class="adm-page">
				<PageHeader title={m.me_title({}, o)} />
				<p class="adm-muted">{m.me_lead({}, o)}</p>
				{saved ? (
					<Banner tone="info" icon="check">
						{m.me_saved({}, o)}
					</Banner>
				) : null}
				<section class="adm-card adm-stack" style="gap:var(--space-4)">
					<h2 class="adm-h2">{m.me_profile({}, o)}</h2>
					<Fact label={m.me_name({}, o)} value={ctx.person.name} />
					<Fact label={m.me_email({}, o)} value={ctx.person.email ?? "—"} />
					<Fact
						label={m.me_roles({}, o)}
						value={ctx.caps.roles.map((r) => roleName(r, ctx.locale)).join(", ")}
					/>
				</section>
				<section class="adm-card adm-stack" style="gap:var(--space-4)">
					<h2 class="adm-h2">{m.me_appearance({}, o)}</h2>
					<form method="post" action="/prefs" class="adm-row" data-action="me.prefs">
						<fieldset class="adm-seg">
							{(["light", "dark", "system"] as const).map((v) => (
								<button
									key={v}
									class="adm-seg__item"
									type="submit"
									name="theme"
									value={v}
									aria-pressed={ctx.pref === v}
								>
									{v === "light"
										? m.theme_light({}, o)
										: v === "dark"
											? m.theme_dark({}, o)
											: m.theme_system({}, o)}
								</button>
							))}
						</fieldset>
						<fieldset class="adm-seg">
							{(["ro", "en"] as const).map((v) => (
								<button
									key={v}
									class="adm-seg__item"
									type="submit"
									name="lang"
									value={v}
									aria-pressed={ctx.locale === v}
								>
									{v.toUpperCase()}
								</button>
							))}
						</fieldset>
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
				<section class="adm-stack" style="gap:var(--space-4)">
					<h2 class="adm-h2">{m.me_notifications({}, o)}</h2>
					{prefs === null ? (
						<div class="adm-card">
							<EmptyState icon="clock" title={m.soon_title({}, o)} text={m.soon_text({}, o)} />
						</div>
					) : (
						<form
							method="post"
							action="/me/settings/notifications"
							class="adm-card adm-stack"
							data-action="me.notifications"
						>
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
					)}
					<div class="adm-card">
						{ctx.pwa.notifications({
							locale: ctx.locale,
							signedIn: true,
							signInHref: "/",
							devices: await ctx.pwa.devices(ctx.person.subject),
						})}
					</div>
				</section>
				<section class="adm-card adm-stack">
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

export function registerMySettings(app: Hono<Env>): void {
	app.get("/me/settings", async (c) =>
		c.html(await renderMySettings(c.var.ctx, c.req.query("saved") === "1"), 200, {
			"cache-control": "private, no-store",
		}),
	);
	app.post("/me/settings/notifications", async (c) => {
		const ctx = c.var.ctx;
		const form = await c.req.parseBody();
		await ctx.port.savePushPrefs(ctx.person.subject, {
			requests: form.requests !== undefined,
			reminders: form.reminders !== undefined,
		});
		return c.redirect("/me/settings?saved=1", 303);
	});
	// The old addresses keep working.
	app.get("/settings/notifications", (c) => c.redirect("/me/settings", 302));
	app.post("/settings/notifications", (c) => c.redirect("/me/settings/notifications", 308));
}
