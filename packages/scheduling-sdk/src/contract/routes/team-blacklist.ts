import { z } from "zod/v4";
import { route } from "../define";
import {
	BlacklistChanged,
	BlacklistCheckQuery,
	BlacklistCreate,
	BlacklistEntry,
	BlacklistEvent,
	BlacklistEventsQuery,
	BlacklistHit,
	BlacklistPatch,
} from "../entities-blacklist";
import { AppParam, IdParam, Ok, PageQuery, page } from "../primitives";

/**
 * Who may not book, with the reason. `check` and `events` are declared before `:id` so their paths are never read as an
 * id. Creating needs `blacklist_create` (any severity) or `blacklist_create_warn` (warn only): the handler asks which.
 */
export const BLACKLIST_ROUTES = [
	route({
		id: "blacklist.check",
		method: "GET",
		path: "/v1/apps/:app/blacklist/check",
		side: "team",
		summary:
			"Does the blacklist name this client, phone or e-mail? The banner's question; writes nothing",
		params: AppParam,
		query: BlacklistCheckQuery,
		response: z.object({ hit: BlacklistHit.nullable() }),
		permission: { key: "blacklist_view", target: { kind: "app" } },
	}),
	route({
		id: "blacklist.events",
		method: "GET",
		path: "/v1/apps/:app/blacklist/events",
		side: "team",
		summary:
			"What the blacklist did: online refusals and staff overrides with their reasons, newest first",
		params: AppParam,
		query: BlacklistEventsQuery,
		response: z.object({ items: z.array(BlacklistEvent) }),
		permission: { key: "blacklist_view", target: { kind: "app" } },
	}),
	route({
		id: "blacklist.list",
		method: "GET",
		path: "/v1/apps/:app/blacklist",
		side: "team",
		summary: "The app's blacklist; entries switched off or expired only with includeInactive",
		params: AppParam,
		query: z
			.object({ includeInactive: z.enum(["true", "false"]).default("false") })
			.extend(PageQuery.shape),
		response: page(BlacklistEntry),
		permission: { key: "blacklist_view", target: { kind: "app" } },
	}),
	route({
		id: "blacklist.create",
		method: "POST",
		path: "/v1/apps/:app/blacklist",
		side: "team",
		summary: "Flag a client, phone or e-mail with a reason (warn severity needs only create_warn)",
		params: AppParam,
		body: BlacklistCreate,
		response: BlacklistEntry,
		permission: {
			key: "blacklist_create",
			target: {
				kind: "dynamic",
				type: "sched_role",
				candidates: ["blacklist_create", "blacklist_create_warn"],
			},
		},
		audit: "blacklist.create",
	}),
	route({
		id: "blacklist.get",
		method: "GET",
		path: "/v1/apps/:app/blacklist/:id",
		side: "team",
		summary: "One entry",
		params: IdParam,
		response: BlacklistEntry,
		permission: { key: "blacklist_view", target: { kind: "app" } },
	}),
	route({
		id: "blacklist.update",
		method: "PATCH",
		path: "/v1/apps/:app/blacklist/:id",
		side: "team",
		summary: "Change an entry, switch it off or on, or take identifiers off it",
		params: IdParam,
		body: BlacklistPatch,
		response: BlacklistChanged,
		permission: { key: "blacklist_edit", target: { kind: "app" } },
		audit: "blacklist.update",
	}),
	route({
		id: "blacklist.remove",
		method: "DELETE",
		path: "/v1/apps/:app/blacklist/:id",
		side: "team",
		summary: "Delete an entry for good (its events stay)",
		params: IdParam,
		response: Ok,
		permission: { key: "blacklist_delete", target: { kind: "app" } },
		audit: "blacklist.delete",
	}),
] as const;
