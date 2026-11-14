import type { ActionInfo, ActionParam, StaffPage } from "@psi/engine/staff";
import { z } from "zod";
import { actionById, listActions, permitted, runAction } from "../actions/engine";
import type { ActionCtx, ActionDef, EntityState, Screen } from "../actions/types";
import { PortError } from "../port/port";
import type { ActionsSource } from "./staff-port-extra";

/** The registry screens an assistant screen covers: what is on the open page, plus what is always there. */
const SCREENS_OF: Readonly<Record<StaffPage["screen"], ReadonlyArray<Screen>>> = {
	calendar: ["calendar"],
	clients: ["clients"],
	client: [
		"client",
		"client.overview",
		"client.appointments",
		"client.packages",
		"client.records",
		"client.files",
		"client.notes",
	],
	appointment: ["appointment"],
	packages: ["client.packages"],
	roster: [],
	requests: ["requests"],
	reminders: ["reminders"],
	settings: [
		"settings",
		"settings.people",
		"settings.rooms",
		"settings.devices",
		"settings.services",
		"settings.roles",
		"settings.members",
	],
	other: [],
};

type Shape = z.ZodTypeAny;

/** What a field of an action's parameters is, read from its schema: a word the assistant can ask for. */
function paramOf(name: string, schema: Shape): ActionParam {
	let inner: Shape = schema;
	let required = true;
	for (;;) {
		if (inner instanceof z.ZodOptional) {
			required = false;
			inner = inner.unwrap();
		} else if (inner instanceof z.ZodDefault) {
			required = false;
			inner = inner.removeDefault();
		} else if (inner instanceof z.ZodNullable) inner = inner.unwrap();
		else if (inner instanceof z.ZodEffects) inner = inner._def.schema;
		else break;
	}
	const base = { name, label: name, required } as const;
	if (inner instanceof z.ZodNumber) return { ...base, kind: "number" };
	if (inner instanceof z.ZodBoolean) return { ...base, kind: "boolean" };
	if (inner instanceof z.ZodEnum)
		return { ...base, kind: "choice", choices: [...(inner.options as ReadonlyArray<string>)] };
	if (/(^id$|Id$)/.test(name)) return { ...base, kind: "id" };
	return { ...base, kind: "text" };
}

function paramsOf(def: ActionDef): Array<ActionParam> {
	let schema: Shape = def.params;
	while (schema instanceof z.ZodEffects) schema = schema._def.schema;
	if (!(schema instanceof z.ZodObject)) return [];
	return Object.entries(schema.shape as Record<string, Shape>).map(([n, s]) => paramOf(n, s));
}

function infoOf(def: ActionDef, locale: ActionCtx["locale"]): ActionInfo {
	const label = def.label(locale);
	// A change is anything that needs a write capability or does a POST; the rest only reads or opens.
	const write = def.needs.write !== undefined || def.route?.method === "POST";
	return {
		id: def.id,
		label,
		summary: label,
		group: def.entity === "none" ? def.tier : def.entity,
		kind: write ? "write" : "read",
		destructive: def.confirm !== "none",
		params: paramsOf(def),
	};
}

/**
 * The console's action registry, for one signed-in person: what it lists for the open screen is
 * what they may do (capability-gated, the same call the buttons make), and running goes through
 * the one `runAction` path with `via: "assistant"`, after the person confirmed the card.
 */
export function createActionsSource(ctx: ActionCtx): ActionsSource {
	return {
		async listActions(page) {
			const screens: ReadonlyArray<Screen> =
				page === undefined ? ["global"] : ["global", ...SCREENS_OF[page.screen]];
			const entity: EntityState = page?.clientId === undefined ? {} : { clientId: page.clientId };
			const seen = new Map<string, ActionDef>();
			for (const screen of screens)
				for (const def of listActions(ctx, { screen, entity })) seen.set(def.id, def);
			return [...seen.values()].map((def) => infoOf(def, ctx.locale));
		},
		async runAction(id, params) {
			const def = actionById(id);
			// An action that only takes the person somewhere (a sheet, a tab): the answer is where.
			if (def !== undefined && def.run === undefined) {
				if (!permitted(ctx, def)) throw new PortError("forbidden", `${id} not permitted`);
				const href = def.to?.({});
				return { summary: def.label(ctx.locale), ...(href === undefined ? {} : { href }) };
			}
			const result = await runAction(ctx, id, params, { confirmed: true, via: "assistant" });
			switch (result.status) {
				case "ok":
					return {
						summary: def === undefined ? id : def.label(ctx.locale),
						...(result.data === undefined ? {} : { data: result.data }),
						...(result.to === undefined ? {} : { href: result.to }),
					};
				case "needs-confirmation":
					throw new PortError("invalid", `${id} still needs a confirmation`);
				case "refused":
					throw new PortError(
						result.code === "not-found"
							? "not-found"
							: result.code === "forbidden" ||
									result.code === "invalid" ||
									result.code === "conflict"
								? result.code
								: result.code === "unknown"
									? "not-found"
									: "unavailable",
						`${id} refused: ${result.code}`,
					);
				default: {
					const never: never = result;
					return never;
				}
			}
		},
	};
}
