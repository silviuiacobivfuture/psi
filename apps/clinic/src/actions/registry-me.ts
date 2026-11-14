import { APP_DEFAULTS } from "@psi/notify";
import { z } from "zod";
import { m } from "../paraglide/messages.js";
import type {
	MyNotifications,
	MyNotificationsView,
	MySettings,
	NotifyChannel,
	NotifyKind,
} from "../port/schema-settings";
import { define, flag, label } from "./define";
import type { ActionCtx, ActionDef } from "./types";

/** The form field of one cell of the notification matrix: `n.<kind>.<channel>`. */
export const cellName = (kind: NotifyKind, channel: NotifyChannel): string =>
	`n.${kind}.${channel}`;

const Clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const Cell = /^n\.[a-z]+\.(in_app|push|email)$/;

/**
 * The page's matrix: each offered cell a checkbox (ticked is on, absent is off, since an unticked box is not sent), and
 * quiet hours. The cells are named by the kinds the service offers, so the form takes any `n.<kind>.<channel>`; one the
 * service does not offer is refused there, with nothing saved.
 */
const NotificationsForm = z
	.object({
		quiet: flag,
		quietStart: Clock.optional(),
		quietEnd: Clock.optional(),
	})
	.catchall(z.union([z.boolean(), z.string()]))
	.refine((f) => !f.quiet || (f.quietStart !== undefined && f.quietEnd !== undefined), {
		message: "quiet hours need a start and an end",
	})
	.refine((f) => !f.quiet || f.quietStart !== f.quietEnd, {
		message: "quiet hours start and end at different times",
	})
	.refine((f) => Object.keys(f).every((k) => k.startsWith("quiet") || Cell.test(k)), {
		message: "unknown field",
	});
type NotificationsInput = z.output<typeof NotificationsForm>;

const on = (v: unknown): boolean => v === true || v === "on" || v === "true" || v === "1";

/**
 * The whole set the form describes, over what the service offers: every channel a kind offers is on when its box is
 * ticked; a channel that cannot be switched off is left to the service (it stays on). Quiet hours keep the zone they
 * had, or the app's own.
 */
export function choicesFrom(
	view: MyNotificationsView,
	form: NotificationsInput,
	timeZone: string,
): MyNotifications {
	const channels: MyNotifications["channels"] = {};
	for (const k of view.kinds) {
		const switches: Partial<Record<NotifyChannel, boolean>> = {};
		for (const c of k.offered)
			if (!k.locked.includes(c)) switches[c] = on(form[cellName(k.kind, c)]);
		if (Object.keys(switches).length > 0) channels[k.kind] = switches;
	}
	const zone = view.prefs.quietHours?.timeZone ?? timeZone;
	return {
		channels,
		quietHours:
			form.quiet && form.quietStart !== undefined && form.quietEnd !== undefined
				? { start: form.quietStart, end: form.quietEnd, timeZone: zone }
				: null,
		...(view.prefs.locale === undefined ? {} : { locale: view.prefs.locale }),
	};
}

/** Saves a change of the person's own settings over what they hold, and answers where the page goes next. */
async function saveOver(
	ctx: ActionCtx,
	change: (held: MySettings) => MySettings,
): Promise<{ status: "ok"; to: string; data: MySettings }> {
	const { stored: _stored, ...held } = await ctx.port.mySettings(ctx.app, ctx.actor.subject);
	const saved = await ctx.port.saveMySettings(ctx.app, ctx.actor.subject, change(held));
	const { stored: _s, ...data } = saved;
	return { status: "ok", to: "/me/settings?saved=prefs#prefs", data };
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
			saveOver(ctx, (held) => ({
				...held,
				...(p.locale === undefined ? {} : { locale: p.locale }),
				...(p.theme === undefined ? {} : { theme: p.theme }),
				...(p.calendarView === undefined ? {} : { calendarView: p.calendarView }),
			})),
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
		run: async (ctx, p) => {
			const view = await ctx.port.myNotifications(ctx.app, ctx.actor.subject);
			const data = await ctx.port.saveMyNotifications(
				ctx.app,
				ctx.actor.subject,
				choicesFrom(view, p, APP_DEFAULTS[ctx.app].timeZone),
			);
			return { status: "ok", to: "/me/settings?saved=notif#notif", data };
		},
	}),
];
