import type { Hono } from "hono";
import { z } from "zod";
import type { AppDeps, Env } from "../app";
import { Page } from "../chrome";
import type { Ctx } from "../lib/context";
import { addDays, todayIso, weekStart } from "../lib/dates";
import { at } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import { PortError } from "../port/port";
import { NOTIFY_CHANNELS, NOTIFY_KINDS, type NotificationPrefs } from "../port/profile-port";
import { hoursSummary } from "./hours";
import {
	Account,
	Identity,
	MyFeedbackList,
	Notifications,
	Preferences,
	type ProfileData,
	Sessions,
} from "./sections";

/** A section the service cannot serve yet is `null` (the page says "în curând" there); any other refusal is the page's. */
async function orSoon<T>(call: Promise<T>): Promise<T | null> {
	try {
		return await call;
	} catch (error) {
		if (
			error instanceof PortError &&
			(error.code === "unavailable" || error.code === "not-available-yet")
		)
			return null;
		throw error;
	}
}

const Phone = z
	.string()
	.trim()
	.max(40)
	.regex(/^[0-9 +().\-/]*$/);

const Flash = z.enum(["phone", "notif"]).optional().catch(undefined);

async function calendarOf(
	ctx: Ctx,
): Promise<{ column: ProfileData["column"]; hours: string | null }> {
	const own = ctx.caps.reach.own;
	if (own.length === 0 || ctx.viewAs !== null) return { column: null, hours: null };
	const columns = await ctx.port.columns(ctx.app).catch(() => []);
	const column = columns.find((c) => c.kind === "person" && own.includes(c.id)) ?? null;
	if (column === null) return { column: null, hours: null };
	if (!ctx.can.has("roster_view")) return { column, hours: null };
	const start = weekStart(todayIso());
	const week = await ctx.port.roster(ctx.app, start).catch(() => null);
	const mine = week?.entries.filter(
		(e) => e.personId === column.id && e.date >= start && e.date <= addDays(start, 6),
	);
	return { column, hours: mine === undefined ? null : hoursSummary(mine, ctx.locale) };
}

/** "Profilul meu": every signed-in person's own page; the account menu leads here. */
export function registerProfile(app: Hono<Env>, deps: AppDeps): void {
	app.get("/me/profile", async (c) => {
		const ctx = c.var.ctx;
		const { subject } = ctx.person;
		const [profile, prefs, feedback, sessions, calendar] = await Promise.all([
			orSoon(ctx.port.profile(ctx.app, subject)),
			orSoon(ctx.port.notificationPrefs(subject)),
			orSoon(ctx.port.myFeedback(ctx.app, subject)),
			deps.auth.sessions(c),
			calendarOf(ctx),
		]);
		const flash = Flash.parse(c.req.query("saved"));
		const data: ProfileData = {
			profile,
			prefs,
			feedback,
			sessions,
			...calendar,
			ssoUrl: deps.ssoAccountUrl ?? null,
			flash: c.req.query("error") === "phone" ? "phone-invalid" : (flash ?? null),
		};
		const o = at(ctx.locale);
		return c.html(
			await Page({
				ctx,
				current: "profile",
				title: m.pf_title({}, o),
				children: (
					<div class="adm-page pf-page">
						<Identity ctx={ctx} data={data} />
						<div class="pf-grid">
							<Account ctx={ctx} data={data} />
							<Preferences ctx={ctx} />
							<Notifications ctx={ctx} data={data} />
							<Sessions ctx={ctx} data={data} />
							<MyFeedbackList ctx={ctx} data={data} />
						</div>
					</div>
				),
			}),
			200,
			{ "cache-control": "private, no-store" },
		);
	});

	// The profile is the person's own: writes are never allowed while looking at the app as someone else.
	app.post("/me/profile/phone", async (c) => {
		const ctx = c.var.ctx;
		if (ctx.viewAs !== null) return c.text(m.view_as_readonly({}, at(ctx.locale)), 403);
		const form = await c.req.parseBody();
		const phone = Phone.safeParse(typeof form.phone === "string" ? form.phone : "");
		if (!phone.success) return c.redirect("/me/profile?error=phone", 303);
		await ctx.port.saveProfile(ctx.app, ctx.person.subject, {
			phone: phone.data === "" ? null : phone.data,
		});
		return c.redirect("/me/profile?saved=phone", 303);
	});

	app.post("/me/profile/notifications", async (c) => {
		const ctx = c.var.ctx;
		if (ctx.viewAs !== null) return c.text(m.view_as_readonly({}, at(ctx.locale)), 403);
		const form = await c.req.parseBody();
		const prefs: NotificationPrefs = {
			prefs: NOTIFY_KINDS.flatMap((kind) =>
				NOTIFY_CHANNELS.map((channel) => ({
					kind,
					channel,
					on: form[`n.${kind}.${channel}`] !== undefined,
				})),
			),
		};
		await ctx.port.saveNotificationPrefs(ctx.person.subject, prefs);
		return c.redirect("/me/profile?saved=notif", 303);
	});
}
