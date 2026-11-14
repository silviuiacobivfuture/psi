import { z } from "zod";
import { m } from "../paraglide/messages.js";
import type { MySettings, NotifyChannel, NotifyKind } from "../port/schema-settings";
import { define, flag, label } from "./define";
import type { ActionCtx, ActionDef } from "./types";

/** The form field of one cell of the notification matrix: `n.<kind>.<channel>`. */
export const cellName = <K extends NotifyKind, C extends NotifyChannel>(
	kind: K,
	channel: C,
): `n.${K}.${C}` => `n.${kind}.${channel}`;

const Clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** Each cell a checkbox: ticked is on, absent is off (an unticked box is not sent). */
const NotificationsForm = z
	.object({
		"n.requests.email": flag,
		"n.requests.push": flag,
		"n.appointments.email": flag,
		"n.appointments.push": flag,
		"n.reminders.email": flag,
		"n.reminders.push": flag,
		quiet: flag,
		quietStart: Clock.optional(),
		quietEnd: Clock.optional(),
	})
	.refine((f) => !f.quiet || (f.quietStart !== undefined && f.quietEnd !== undefined), {
		message: "quiet hours need a start and an end",
	});

/** Saves a change of the person's own settings over what they hold, and answers where the page goes next. */
async function saveOver(
	ctx: ActionCtx,
	change: (held: MySettings) => MySettings,
	anchor: string,
): Promise<{ status: "ok"; to: string; data: MySettings }> {
	const { stored: _stored, ...held } = await ctx.port.mySettings(ctx.app, ctx.actor.subject);
	const saved = await ctx.port.saveMySettings(ctx.app, ctx.actor.subject, change(held));
	const { stored: _s, ...data } = saved;
	return { status: "ok", to: `/me/settings?saved=${anchor}#${anchor}`, data };
}

/**
 * "Setările mele": what each person sets for themselves, whatever their role. The service keeps it per person and app;
 * the assistant runs the same actions as the page.
 */
export const ME_ACTIONS: ReadonlyArray<ActionDef> = [
	define({
		id: "me.settings",
		tier: "me",
		entity: "none",
		label: label((o) => m.me_settings_save({}, o)),
		icon: "settings",
		placements: { screen: ["settings"], palette: ["global"] },
		mobile: "sheet",
		needs: {},
		route: { method: "POST", path: "/me/settings" },
		confirm: "none",
		to: () => "/me/settings#prefs",
		params: z.object({
			locale: z.enum(["ro", "en"]).optional(),
			theme: z.enum(["light", "dark", "system"]).optional(),
			calendarView: z.enum(["day", "week", "month"]).optional(),
		}),
		run: (ctx, p) =>
			saveOver(
				ctx,
				(held) => ({
					...held,
					...(p.locale === undefined ? {} : { locale: p.locale }),
					...(p.theme === undefined ? {} : { theme: p.theme }),
					...(p.calendarView === undefined ? {} : { calendarView: p.calendarView }),
				}),
				"prefs",
			),
	}),
	define({
		id: "me.notifications",
		tier: "me",
		entity: "none",
		label: label((o) => m.notif_save({}, o)),
		icon: "check",
		placements: { screen: ["settings"], palette: ["global"] },
		mobile: "sheet",
		needs: {},
		route: { method: "POST", path: "/me/settings/notifications" },
		confirm: "none",
		to: () => "/me/settings#notif",
		params: NotificationsForm,
		run: (ctx, p) =>
			saveOver(
				ctx,
				(held) => ({
					...held,
					quietHours:
						p.quiet && p.quietStart !== undefined && p.quietEnd !== undefined
							? { start: p.quietStart, end: p.quietEnd }
							: null,
					notifications: {
						requests: {
							email: p[cellName("requests", "email")],
							push: p[cellName("requests", "push")],
						},
						appointments: {
							email: p[cellName("appointments", "email")],
							push: p[cellName("appointments", "push")],
						},
						reminders: {
							email: p[cellName("reminders", "email")],
							push: p[cellName("reminders", "push")],
						},
					},
				}),
				"notif",
			),
	}),
];
