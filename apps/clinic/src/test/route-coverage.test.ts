import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ROUTES } from "@psi/scheduling-sdk/contract";
import { describe, expect, it } from "vitest";

/**
 * Every route of the scheduling service is used by a consumer, or is named here with who uses it instead and why the
 * console does not. A new route nobody calls, a console call to a route that went away, and a route listed here that the
 * console has started to call all fail this test: the contract and its consumers move together.
 */
const NOT_THE_CONSOLE: Readonly<Record<string, string>> = {
	"meta.health": "the cluster's probes",
	"meta.openapi": "tooling and the documentation",
	"visitor.services":
		"the visitor flow's contract (the public sites book through @psi/scheduling today)",
	"visitor.slots": "the visitor flow's contract",
	"visitor.hold": "the visitor flow's contract",
	"visitor.release": "the visitor flow's contract",
	"visitor.submit": "the visitor flow's contract",
	"visitor.cancel": "the visitor flow's contract",
	"visitor.callback": "the visitor flow's contract",
	"visitor.mine": "the visitor flow's contract (a customer's own appointments)",
	"visitor.mineCancel": "the visitor flow's contract",
	"visitor.mineReschedule": "the sites' Programările mele (@psi/scheduling-sdk ownBookings)",
	"apps.create": "the platform's provisioning (an estate administrator)",
	"apps.get": "the platform's provisioning",
	"apps.update": "the platform's provisioning",
	"groups.create": "group sessions: not offered by the console yet",
	"groups.update": "group sessions: not offered by the console yet",
	"groups.remove": "group sessions: not offered by the console yet",
	"clients.assign": "the assistant's tools (packages/engine) and a future reassignment screen",
	"clients.restore": "the recovery of a deleted client: not offered by the console yet",
	"appointments.remove": "soft delete of an appointment: the console cancels instead",
	"appointments.restore": "soft delete of an appointment: the console cancels instead",
	"series.get": "a series is shown through its appointments",
	"packages.remove": "a package is never deleted from the console (its ledger stays)",
	"payments.remove":
		"a payment is never deleted from the console (the ledger is append-only there)",
	"roster.put": "the roster is edited in the scheduling backend for now",
	"ownership.transfer":
		"handing the organisation over: the Owner's or the estate administrator's call to the service; no console screen yet",
	"leave.list": "leave requests: not offered by the console yet",
	"leave.create": "leave requests: not offered by the console yet",
	"leave.decide": "leave requests: not offered by the console yet",
	"reminders.email": "the reminder e-mail is sent by the service's own job",
	"reminders.whatsapp": "the console builds the WhatsApp link itself (pages/detail.tsx)",
	"blacklist.check": "the booking gate inside the service",
	"blacklist.events": "the blacklist's own history screen: not offered by the console yet",
	"blacklist.get": "one entry is shown from the list",
	"blacklist.remove": "an entry is switched off, never deleted, from the console",
	"builder.remove": "the builder screen: not offered by the console yet",
	"imports.list": "imports run from tools/; their screen is not offered yet",
	"reports.ratings": "the feedback statistics: not offered by the console yet",
	"reports.blacklistHits": "the blacklist statistics: not offered by the console yet",
	"reports.csv": "the statistics page exports its own CSV",
	"feedback.linkInspect": "feedback: not offered by the console yet",
	"feedback.linkSubmit": "the feedback link a client opens (a public page, not the console)",
	"feedback.list": "feedback: not offered by the console yet",
	"feedback.get": "feedback: not offered by the console yet",
	"feedback.reply": "feedback: not offered by the console yet",
	"feedback.issueLink": "feedback: not offered by the console yet",
	"feedback.setStatus": "feedback: not offered by the console yet",
	"visitor.notifications":
		"the public sites' account page: a client's own notification preferences",
	"visitor.notificationsSave": "the public sites' account page",
	"notifications.deliveries": "the delivery log: its screen is not offered by the console yet",
	"assistantUsage.get":
		"the meters alone, for the assistant's tools; the settings screen reads them inside assistantConfig.get",
};

const SRC = fileURLToPath(new URL("..", import.meta.url));

function sources(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory())
			return name === "paraglide" || name === "test" ? [] : sources(path);
		return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
	});
}

/** `api.<group>.<operation>(`: how the console calls the SDK client. */
const called = new Set(
	sources(SRC).flatMap((file) =>
		[...readFileSync(file, "utf8").matchAll(/\bapi\.([a-zA-Z]+)\.([a-zA-Z]+)\(/g)].map(
			(m) => `${m[1]}.${m[2]}`,
		),
	),
);
const ids: ReadonlySet<string> = new Set(ROUTES.map((r) => r.id));

describe("the console and the service's contract agree", () => {
	it("every route is called by the console or named with its other consumer", () => {
		const orphans = [...ids].filter((id) => !called.has(id) && !Object.hasOwn(NOT_THE_CONSOLE, id));
		expect(orphans).toEqual([]);
	});

	it("the console calls no route the contract does not have", () => {
		expect([...called].filter((id) => !ids.has(id))).toEqual([]);
	});

	it("names no route the console calls, and none that does not exist", () => {
		for (const id of Object.keys(NOT_THE_CONSOLE)) {
			expect(ids.has(id), `${id} is not a route`).toBe(true);
			expect(called.has(id), `${id} is called by the console: drop it from the list`).toBe(false);
		}
	});
});
