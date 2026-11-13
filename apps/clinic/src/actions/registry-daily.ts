import { z } from "zod";
import { areaText } from "../lib/area-labels";
import { ORG_AREAS, PLATFORM_KEY } from "../lib/areas";
import type { Locale } from "../lib/i18n";
import { m } from "../paraglide/messages.js";
import { PaymentMethodSchema } from "../port/schema";
import { define, label, none } from "./define";
import type { ActionDef, Needs, Tier } from "./types";

const id = z.string().min(1).max(100);

const nav = (
	key: string,
	tier: Tier,
	path: string,
	icon: ActionDef["icon"],
	text: (locale: Locale) => string,
	needs: Needs,
): ActionDef =>
	define({
		id: `nav.${key}`,
		tier,
		entity: "none",
		label: text,
		icon,
		placements: { palette: ["global"] },
		mobile: "list",
		needs,
		route: { method: "GET", path },
		confirm: "none",
		to: () => path,
		params: none,
	});

/** Where each screen of the console is, for the palette and the assistant. */
const NAV: ReadonlyArray<ActionDef> = [
	nav(
		"calendar",
		"daily",
		"/calendar",
		"calendar",
		label((o) => m.nav_calendar({}, o)),
		{ read: ["calendars_view"] },
	),
	nav(
		"clients",
		"daily",
		"/clients",
		"users",
		label((o) => m.nav_clients({}, o)),
		{ read: ["clients_view"] },
	),
	nav(
		"requests",
		"daily",
		"/requests",
		"inbox",
		label((o) => m.nav_requests({}, o)),
		{ read: ["web_requests_view"] },
	),
	nav(
		"roster",
		"daily",
		"/roster",
		"briefcase",
		label((o) => m.nav_roster({}, o)),
		{ read: ["roster_view"] },
	),
	nav(
		"reminders",
		"daily",
		"/reminders",
		"chat",
		label((o) => m.nav_reminders({}, o)),
		{ read: ["reminders_view"] },
	),
	nav(
		"floor",
		"daily",
		"/floor",
		"sidebar",
		label((o) => m.nav_floor({}, o)),
		{ read: ["calendars_view"] },
	),
	nav(
		"me",
		"me",
		"/me/settings",
		"settings",
		label((o) => m.nav_me({}, o)),
		{},
	),
	nav(
		"platform",
		"platform",
		"/platform",
		"shield",
		label((o) => m.nav_platform({}, o)),
		{ read: [PLATFORM_KEY] },
	),
	...ORG_AREAS.map((a) =>
		nav(`settings.${a.id}`, "org", a.href, a.icon, (locale) => areaText(a.id, locale).title, {
			read: [...a.keys],
		}),
	),
];

export const DAILY_ACTIONS: ReadonlyArray<ActionDef> = [
	...NAV,
	define({
		id: "appointment.new",
		tier: "daily",
		entity: "appointment",
		label: label((o) => m.new_appointment({}, o)),
		icon: "plus",
		placements: {
			primary: ["calendar", "client.appointments"],
			empty: ["client.appointments", "client.overview"],
			palette: ["global", "client"],
		},
		mobile: "fab",
		needs: { write: ["appointments_create"] },
		route: { method: "GET", path: "/calendar/editor" },
		confirm: "none",
		to: (e) =>
			`/calendar?new=1${e.clientId === undefined ? "" : `&client=${encodeURIComponent(e.clientId)}`}`,
		params: none,
	}),
	define({
		id: "appointment.attended",
		tier: "daily",
		entity: "appointment",
		label: label((o) => m.ap_mark_attended({}, o)),
		icon: "check",
		placements: { screen: ["appointment"] },
		mobile: "bar",
		needs: { write: ["appointments_edit"] },
		route: { method: "POST", path: "/appointments/:id/attended" },
		confirm: "none",
		params: z.object({ id }),
		run: async (ctx, p) => {
			await ctx.port.updateAppointment(ctx.app, p.id, { status: "attended" });
			return { status: "ok", to: "/calendar" };
		},
	}),
	define({
		id: "appointment.no_show",
		tier: "daily",
		entity: "appointment",
		label: label((o) => m.ap_mark_absent({}, o)),
		icon: "alert",
		placements: { screen: ["appointment"] },
		mobile: "bar",
		needs: { write: ["appointments_edit"] },
		route: { method: "POST", path: "/appointments/:id/no-show" },
		confirm: "none",
		params: z.object({ id }),
		run: async (ctx, p) => {
			await ctx.port.updateAppointment(ctx.app, p.id, { status: "no-show" });
			return { status: "ok", to: "/calendar" };
		},
	}),
	define({
		id: "appointment.cancel",
		tier: "daily",
		entity: "appointment",
		label: label((o) => m.ap_cancel({}, o)),
		icon: "x",
		placements: { screen: ["appointment"] },
		mobile: "bar",
		needs: { write: ["appointments_cancel"] },
		route: { method: "POST", path: "/appointments/:id/cancel" },
		confirm: "reason",
		params: z.object({ id, reason: z.string().trim().min(1).max(500) }),
		run: async (ctx, p) => {
			await ctx.port.cancelAppointment(ctx.app, p.id, p.reason);
			return { status: "ok", to: "/calendar" };
		},
	}),
	define({
		id: "appointment.pay",
		tier: "daily",
		entity: "appointment",
		label: label((o) => m.ap_collect({}, o)),
		icon: "check",
		placements: { screen: ["appointment"] },
		mobile: "bar",
		needs: { write: ["payments_create"] },
		route: { method: "POST", path: "/appointments/:id/pay" },
		confirm: "none",
		params: z.object({ id, method: PaymentMethodSchema }),
		run: async (ctx, p) => {
			await ctx.port.collectPayment(ctx.app, p.id, p.method);
			return { status: "ok", to: "/calendar" };
		},
	}),
	define({
		id: "package.new",
		tier: "daily",
		entity: "package",
		label: label((o) => m.pkg_new({}, o)),
		icon: "plus",
		placements: { primary: ["client.packages"], empty: ["client.packages"] },
		mobile: "bar",
		needs: { write: ["packages_create"] },
		route: { method: "POST", path: "/clients/:id/packages" },
		confirm: "none",
		opens: "newPkg",
		to: (e) => `/clients/${e.clientId ?? ""}/packages`,
		params: z.object({
			clientId: id,
			name: z.string().trim().min(1).max(120),
			sessions: z.number().int().min(0).max(999),
			bonus: z.number().int().min(0).max(999).default(0),
			totalBani: z.number().int().min(0).max(100_000_000),
		}),
		run: async (ctx, p) => {
			await ctx.port.createPackage(ctx.app, p.clientId, { ...p, note: "" });
			return { status: "ok", to: `/clients/${p.clientId}/packages` };
		},
	}),
	define({
		id: "request.handled",
		tier: "daily",
		entity: "request",
		label: label((o) => m.request_mark({}, o)),
		icon: "check",
		placements: { screen: ["requests"] },
		mobile: "list",
		needs: { write: ["web_requests_approve"] },
		route: { method: "POST", path: "/requests/:id/handled" },
		confirm: "none",
		params: z.object({ id }),
		run: async (ctx, p) => {
			await ctx.port.markRequestHandled(ctx.app, p.id);
			return { status: "ok", to: "/requests" };
		},
	}),
	define({
		id: "reminder.sent",
		tier: "daily",
		entity: "reminder",
		label: label((o) => m.reminder_sent({}, o)),
		icon: "check",
		placements: { screen: ["reminders"] },
		mobile: "list",
		needs: { write: ["reminders_send"] },
		route: { method: "POST", path: "/reminders/:id/sent" },
		confirm: "none",
		params: z.object({ id }),
		run: async (ctx, p) => {
			await ctx.port.markReminderSent(ctx.app, p.id);
			return { status: "ok", to: "/reminders" };
		},
	}),
	define({
		id: "role.save",
		tier: "org",
		entity: "none",
		label: label((o) => m.roles_save({}, o)),
		icon: "shield",
		placements: { screen: ["settings"] },
		mobile: "bar",
		needs: { write: ["roles_edit"] },
		route: { method: "POST", path: "/settings/roles/:id" },
		confirm: "none",
		params: z.object({ id }),
	}),
	define({
		id: "me.prefs",
		tier: "me",
		entity: "none",
		label: label((o) => m.theme_label({}, o)),
		icon: "settings",
		placements: { screen: ["settings"] },
		mobile: "sheet",
		needs: {},
		route: { method: "POST", path: "/prefs" },
		confirm: "none",
		params: z.object({
			theme: z.string().optional(),
			lang: z.string().optional(),
			deco: z.string().optional(),
		}),
	}),
	define({
		id: "me.notifications",
		tier: "me",
		entity: "none",
		label: label((o) => m.notif_save({}, o)),
		icon: "check",
		placements: { screen: ["settings"] },
		mobile: "sheet",
		needs: {},
		route: { method: "POST", path: "/me/settings/notifications" },
		confirm: "none",
		params: z.object({ requests: z.boolean(), reminders: z.boolean() }),
	}),
];
