import { isParityRoute, NEVER_REASONS } from "@psi/engine/staff";
import { ROUTES, type RouteSpec } from "@psi/scheduling-sdk/contract";
import { describe, expect, it } from "vitest";
import { ACTIONS } from "../actions/registry";
import type { ActionCtx } from "../actions/types";
import type { Can } from "../lib/can";
import { createFakePort } from "../port/fake";
import { consoleRoutes } from "../test/console-routes";
import { createActionsSource } from "./actions-source";

/**
 * THE parity guard: everything a person can do in the console is something the assistant can do for them, derived
 * from the two sources of truth (the action registry and the service's route table), never listed by hand. A new UI
 * action, a new route of the contract or a new form handler of the console that the assistant cannot reach fails here.
 */
const TABLE = ROUTES as ReadonlyArray<RouteSpec>;
const TEAM = TABLE.filter((r) => r.side === "team");

/** Routes the assistant does not offer, and why (the estate's own administration stays on its screens). */
const NOT_OFFERED: Readonly<Record<string, string>> = {
	...NEVER_REASONS,
	"apps.create": "estate administration (a new organisation) stays on the Administrare screen",
	"assistantPlatform.get": "estate administration stays on the Administrare screen",
	"assistantPlatform.put": "estate administration stays on the Administrare screen",
};

/**
 * Console form handlers that are not an action of the registry, each with the routes of the contract through which
 * the assistant does the same thing, or why it is not the clinic's function at all.
 */
const POSTS: Readonly<Record<string, ReadonlyArray<string> | string>> = {
	"/calendar/editor/save": ["appointments.create", "appointments.update", "series.create"],
	"/calendar/editor/check": ["calendar.get", "appointments.list"],
	"/calendar/editor/clients": ["clients.list"],
	"/clients/:id/packages/:pid/field/:field": ["packages.update"],
	"/clients/:id/packages/:pid/payments": ["payments.create"],
	"/clients/:id/invite/preview": ["invites.preview"],
	"/clients/:id/invite/send": ["invites.send"],
	"/clients/:id/invite/resend": ["invites.resend"],
	"/clients/:id/invite/revoke": ["invites.revoke"],
	"/settings/members/staff": ["staff.search"],
	"/settings/members/invite": ["staff.invite"],
	"/inbox/read": "the person's own notification inbox on this device, not a clinic function",
	"/inbox/read-all": "the person's own notification inbox on this device, not a clinic function",
	"/settings/notifications": "the person's own notification preferences, not a clinic function",
	"/me/profile/phone": "the person's own sign-in profile, kept by the estate's account service",
	"/me/profile/notifications": "the person's own notification preferences, not a clinic function",
	"/view-as": "switching whose rights the console uses: the assistant never does",
	"/view-as/stop": "switching whose rights the console uses: the assistant never does",
	"/auth/sign-out": "signing out of the console",
	"/auth/backchannel-logout": "the identity provider's sign-out call",
	"/pwa/push/subscribe": "this device's push subscription",
	"/pwa/push/status": "this device's push subscription",
	"/pwa/push/unsubscribe": "this device's push subscription",
	"/pwa/push/test": "this device's push subscription",
	"/pwa/push/devices/remove": "this device's push subscription",
	"/__pwa/notify": "the platform's push delivery",
};

/** Registry actions whose form the console handles itself, with the contract routes the assistant does it through, or why not. */
const RUN_ELSEWHERE: Readonly<Record<string, ReadonlyArray<string> | string>> = {
	"role.save": ["roles.update", "roles.setPermissions"],
	"me.prefs": "the person's own display preferences (theme, language) on this device",
	"me.notifications": "the person's own notification preferences, not a clinic function",
};

/** A person who holds everything, the estate's administration included: the registry lists every action to them. */
const everything: Can = {
	has: () => true,
	any: () => true,
	write: () => true,
	scopes: () => ["all"],
	narrowed: () => false,
	group: () => true,
	readOnly: false,
};

describe("every UI action is an assistant tool", () => {
	it("the assistant's discovery lists every action of the registry to a person who may do them all", async () => {
		const ctx: ActionCtx = {
			port: createFakePort({ members: {} }),
			app: "psizone",
			can: everything,
			actor: { subject: "s", name: "S" },
			locale: "ro",
			today: "2026-11-16",
		};
		const listed = new Set(
			(await createActionsSource(ctx).listActions(undefined)).map((a) => a.id),
		);
		// An action shown only for some record (its `when`) is listed on that record's screen; the rest are listed here.
		const missing = ACTIONS.filter((a) => a.when === undefined && !listed.has(a.id)).map(
			(a) => a.id,
		);
		expect(missing).toEqual([]);
	});
	it("every action that changes something can be run (the one `run` a button and the assistant take), or is done through the contract", () => {
		for (const [id, via] of Object.entries(RUN_ELSEWHERE)) {
			expect(
				ACTIONS.some((a) => a.id === id && a.run === undefined),
				id,
			).toBe(true);
			if (typeof via === "string") expect(via.length, id).toBeGreaterThan(15);
			else
				for (const r of via)
					expect(
						TABLE.some((t) => t.id === r && isParityRoute(t)),
						`${id} → ${r}`,
					).toBe(true);
		}
		const unrunnable = ACTIONS.filter(
			(a) => a.route?.method === "POST" && a.run === undefined && !(a.id in RUN_ELSEWHERE),
		).map((a) => a.id);
		expect(unrunnable).toEqual([]);
	});
});

describe("every route of the service's contract is reachable by the assistant", () => {
	it("each team route is offered (as the person, filtered by what they hold) or named here with why it is not", () => {
		const unreachable = TEAM.filter(
			(r) => !isParityRoute(r) && r.stream !== true && !(r.id in NOT_OFFERED),
		).map((r) => r.id);
		expect(unreachable).toEqual([]);
	});
	it("every exemption is a route that exists, with its reason; none hides a route that is offered anyway", () => {
		for (const [id, why] of Object.entries(NOT_OFFERED)) {
			const route = TABLE.find((r) => r.id === id);
			expect(route, id).toBeDefined();
			expect(why.length, id).toBeGreaterThan(20);
			if (route !== undefined) expect(isParityRoute(route), id).toBe(false);
		}
	});
	it("the guard refuses an invented route", () => {
		const invented: RouteSpec = {
			id: "widgets.invent",
			method: "POST",
			path: "/v1/widgets",
			side: "team",
			summary: "x",
			response: TABLE[0]?.response ?? ROUTES[0].response,
			platform: true,
		};
		expect(isParityRoute(invented) || invented.id in NOT_OFFERED).toBe(false);
	});
});

describe("every form handler of the console is an action, or done through the contract", () => {
	const actionRoutes = new Set(
		ACTIONS.flatMap((a) => (a.route?.method === "POST" ? [a.route.path] : [])),
	);
	const posts = [
		...new Set(
			consoleRoutes()
				.filter((r) => r.method === "POST")
				.map((r) => r.path),
		),
	];
	it("each POST the console serves is a registry action or listed with the routes that do the same", () => {
		const unknown = posts.filter((p) => !actionRoutes.has(p) && POSTS[p] === undefined);
		expect(unknown).toEqual([]);
		expect(posts.length).toBeGreaterThan(20);
	});
	it("each route named for a handler exists and is offered to the assistant", () => {
		for (const [path, via] of Object.entries(POSTS)) {
			if (typeof via === "string") {
				expect(via.length, path).toBeGreaterThan(15);
				continue;
			}
			for (const id of via) {
				const route = TABLE.find((r) => r.id === id);
				expect(route, `${path} → ${id}`).toBeDefined();
				if (route !== undefined) expect(isParityRoute(route), id).toBe(true);
			}
		}
	});
	it("no listed handler is stale (each still exists)", () => {
		const served = new Set(posts);
		expect(Object.keys(POSTS).filter((p) => !served.has(p))).toEqual([]);
	});
});
