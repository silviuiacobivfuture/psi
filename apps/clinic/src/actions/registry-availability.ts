import { APP_DEFAULTS } from "@psi/notify";
import { m } from "../paraglide/messages.js";
import {
	ClosureParams,
	ClosureRemoveParams,
	CopyParams,
	closureOf,
	entryOf,
	OneOffParams,
	OneOffRemoveParams,
	PauseParams,
	PauseRemoveParams,
	PauseUpdateParams,
	pauseOf,
	RulesParams,
} from "./availability-params";
import { define, label } from "./define";
import type { ActionCtx, ActionDef, ActionResult } from "./types";

const HOURS = "/settings/hours";
const ONLINE = "/settings/online";
const FORBIDDEN: ActionResult = { status: "refused", code: "forbidden" };

/** A narrowed permission (`own`) reaches only the person's own calendar; `all` reaches every one. */
export function mayTouch(ctx: ActionCtx, key: string, personId: string): boolean {
	if (!ctx.can.has(key)) return false;
	const scopes = ctx.can.scopes(key);
	return scopes.includes("all") || (ctx.ownCalendars ?? []).includes(personId);
}

const at = (person: string, notice: string, hash: string): string =>
	`${HOURS}?person=${encodeURIComponent(person)}&saved=${notice}#${hash}`;

/**
 * Setări → Program (a practitioner's weekly hours, their one-off days, the rooms' closed days) and Setări → Programări
 * online (stopping online booking). Every write is one action: the page's forms and the assistant run the same ones.
 */
export const AVAILABILITY_ACTIONS: ReadonlyArray<ActionDef> = [
	define({
		id: "availability.rules",
		tier: "org",
		entity: "availability",
		label: label((o) => m.av_ac_rules({}, o)),
		icon: "clock",
		placements: { screen: ["settings.hours"] },
		mobile: "bar",
		needs: { write: ["availability_edit"] },
		route: { method: "POST", path: `${HOURS}/:person/rules` },
		confirm: "none",
		to: () => HOURS,
		params: RulesParams,
		run: async (ctx, p) => {
			if (!mayTouch(ctx, "availability_edit", p.person)) return FORBIDDEN;
			const data = await ctx.port.saveRules(ctx.app, p.person, p.rules);
			return { status: "ok", to: at(p.person, "rules", "rules"), data };
		},
	}),
	define({
		id: "availability.copy",
		tier: "org",
		entity: "availability",
		label: label((o) => m.av_ac_copy({}, o)),
		icon: "users",
		placements: { screen: ["settings.hours"] },
		mobile: "sheet",
		needs: { write: ["availability_edit"] },
		route: { method: "POST", path: `${HOURS}/:person/copy` },
		confirm: "confirm",
		to: () => HOURS,
		params: CopyParams,
		run: async (ctx, p) => {
			if (p.to.length === 0) return { status: "refused", code: "invalid" };
			if (
				!mayTouch(ctx, "availability_view", p.person) ||
				!p.to.every((id) => mayTouch(ctx, "availability_edit", id))
			)
				return FORBIDDEN;
			const data = await ctx.port.copyRules(ctx.app, p.person, p.to);
			return { status: "ok", to: at(p.person, "copy", "copy"), data };
		},
	}),
	define({
		id: "availability.one_off_add",
		tier: "org",
		entity: "availability",
		label: label((o) => m.av_ac_one_off_add({}, o)),
		icon: "plus",
		placements: { screen: ["settings.hours"] },
		mobile: "sheet",
		needs: { write: ["availability_edit"] },
		route: { method: "POST", path: `${HOURS}/:person/one-offs` },
		confirm: "none",
		to: () => HOURS,
		params: OneOffParams,
		run: async (ctx, p) => {
			const people = [p.person, ...p.also.filter((id) => id !== p.person)];
			if (!people.every((id) => mayTouch(ctx, "availability_edit", id))) return FORBIDDEN;
			const data = await ctx.port.addOneOff(ctx.app, people, entryOf(p));
			return { status: "ok", to: at(p.person, "one-off", "one-offs"), data };
		},
	}),
	define({
		id: "availability.one_off_remove",
		tier: "org",
		entity: "availability",
		label: label((o) => m.av_ac_one_off_remove({}, o)),
		icon: "trash",
		placements: { screen: ["settings.hours"] },
		mobile: "list",
		needs: { write: ["availability_edit"] },
		route: { method: "POST", path: `${HOURS}/:person/one-offs/:entry/remove` },
		confirm: "confirm",
		to: () => HOURS,
		params: OneOffRemoveParams,
		run: async (ctx, p) => {
			if (!mayTouch(ctx, "availability_edit", p.person)) return FORBIDDEN;
			await ctx.port.removeOneOff(ctx.app, p.person, p.entry);
			return { status: "ok", to: at(p.person, "one-off-removed", "one-offs") };
		},
	}),
	define({
		id: "rooms.closure_add",
		tier: "org",
		entity: "room",
		label: label((o) => m.av_ac_closure_add({}, o)),
		icon: "plus",
		placements: { screen: ["settings.hours"] },
		mobile: "sheet",
		needs: { write: ["rooms_edit"] },
		route: { method: "POST", path: `${HOURS}/rooms/:room/closures` },
		confirm: "none",
		to: () => `${HOURS}?tab=rooms`,
		params: ClosureParams,
		run: async (ctx, p) => {
			const data = await ctx.port.addRoomClosure(ctx.app, p.room, closureOf(p));
			return {
				status: "ok",
				to: `${HOURS}?tab=rooms&room=${encodeURIComponent(p.room)}&saved=closure#closures`,
				data,
			};
		},
	}),
	define({
		id: "rooms.closure_remove",
		tier: "org",
		entity: "room",
		label: label((o) => m.av_ac_closure_remove({}, o)),
		icon: "trash",
		placements: { screen: ["settings.hours"] },
		mobile: "list",
		needs: { write: ["rooms_edit"] },
		route: { method: "POST", path: `${HOURS}/rooms/:room/closures/:closure/remove` },
		confirm: "confirm",
		to: () => `${HOURS}?tab=rooms`,
		params: ClosureRemoveParams,
		run: async (ctx, p) => {
			await ctx.port.removeRoomClosure(ctx.app, p.room, p.closure);
			return {
				status: "ok",
				to: `${HOURS}?tab=rooms&room=${encodeURIComponent(p.room)}&saved=closure-removed#closures`,
			};
		},
	}),
	define({
		id: "booking_pause.create",
		tier: "org",
		entity: "pause",
		label: label((o) => m.av_ac_pause_create({}, o)),
		icon: "alert",
		placements: { screen: ["settings.online"] },
		mobile: "bar",
		needs: { write: ["booking_pause_edit"] },
		route: { method: "POST", path: `${ONLINE}/pauses` },
		confirm: "none",
		to: () => `${ONLINE}?new=1#editor`,
		params: PauseParams,
		run: async (ctx, p) => {
			const input = pauseOf(p, APP_DEFAULTS[ctx.app].timeZone);
			if ("reason" in input) return { status: "refused", code: "invalid", reason: input.reason };
			const data = await ctx.port.createPause(ctx.app, input.ok);
			return { status: "ok", to: `${ONLINE}?saved=created`, data };
		},
	}),
	define({
		id: "booking_pause.update",
		tier: "org",
		entity: "pause",
		label: label((o) => m.av_ac_pause_update({}, o)),
		icon: "edit",
		placements: { screen: ["settings.online"] },
		mobile: "list",
		needs: { write: ["booking_pause_edit"] },
		route: { method: "POST", path: `${ONLINE}/pauses/:id` },
		confirm: "none",
		to: () => ONLINE,
		params: PauseUpdateParams,
		run: async (ctx, p) => {
			const input = pauseOf(p, APP_DEFAULTS[ctx.app].timeZone);
			if ("reason" in input) return { status: "refused", code: "invalid", reason: input.reason };
			const data = await ctx.port.updatePause(ctx.app, p.id, input.ok);
			return { status: "ok", to: `${ONLINE}?saved=updated`, data };
		},
	}),
	define({
		id: "booking_pause.remove",
		tier: "org",
		entity: "pause",
		label: label((o) => m.av_ac_pause_remove({}, o)),
		icon: "check",
		placements: { screen: ["settings.online"] },
		mobile: "list",
		needs: { write: ["booking_pause_edit"] },
		route: { method: "POST", path: `${ONLINE}/pauses/:id/remove` },
		confirm: "confirm",
		to: () => ONLINE,
		params: PauseRemoveParams,
		run: async (ctx, p) => {
			await ctx.port.removePause(ctx.app, p.id);
			return { status: "ok", to: `${ONLINE}?saved=lifted` };
		},
	}),
];
