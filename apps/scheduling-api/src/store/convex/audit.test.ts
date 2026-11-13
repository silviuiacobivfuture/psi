import { AUDIT_ACTIONS, AUDIT_ENTITIES } from "@psi/scheduling/clinic";
import { ROUTES, type RouteSpec } from "@psi/scheduling-sdk/contract";
import { describe, expect, it } from "vitest";
import { auditCollection } from "./audit";
import { apiActionOf, BY_API, mappingOf } from "./audit-map";
import { caller } from "./call";
import type { Rpc } from "./rpc";

/** An Rpc that records what would be sent to Convex and answers an append. */
function fake(): { rpc: Rpc; sent: { fn: string; args: Record<string, unknown> }[] } {
	const sent: { fn: string; args: Record<string, unknown> }[] = [];
	const answer = (fn: string, args: Readonly<Record<string, unknown>>) => {
		sent.push({ fn, args: { ...args } });
		return Promise.resolve({ ok: true, id: "e".repeat(32) });
	};
	return {
		sent,
		rpc: {
			query: (fn, args, schema) => answer(fn, args).then((v) => schema.parse(v)),
			mutation: (fn, args, schema) => answer(fn, args).then((v) => schema.parse(v)),
		},
	};
}

const event = (action: string, extra: object = {}) => ({
	id: "x",
	app: "psizone",
	at: 1,
	actor: { subject: "rita", kind: "person" as const },
	action,
	target: { type: "clients", id: "c1" },
	...extra,
});

describe("every audit action of the contract has a mapping onto Convex's closed log", () => {
	const actions = [
		...new Set(
			(ROUTES as ReadonlyArray<RouteSpec>)
				.map((r) => r.audit)
				.filter((a): a is string => a !== undefined),
		),
		"clinical.read",
		"file.download",
	];

	it("names a listed action and entity for each, or says plainly that it falls back", () => {
		const unmapped = actions.filter((a) => BY_API[a] === undefined);
		// The route table is the contract; a new audit action must be placed in the table on purpose.
		expect(unmapped).toEqual([]);
		for (const a of actions) {
			const m = mappingOf(a, { type: "records" });
			expect(AUDIT_ACTIONS).toContain(m.action);
			expect(AUDIT_ENTITIES).toContain(m.entity);
		}
	});

	it("reads a recorded wrapper event back as an API action that maps to it", () => {
		for (const [api, m] of Object.entries(BY_API).filter(([, x]) => x.recorded)) {
			const back = apiActionOf(m.action, m.entity, []);
			const again = BY_API[back];
			expect(again, `${api} -> ${back}`).toBeDefined();
			expect(again?.action).toBe(m.action);
			expect(again?.entity).toBe(m.entity);
		}
	});
});

describe("what reaches Convex is field names and a count", () => {
	it("skips an event a wrapper already wrote: one mutation, one event", async () => {
		const { rpc, sent } = fake();
		const audit = auditCollection(caller(rpc));
		for (const action of ["client.update", "appointment.create", "role.permissions", "member.put"])
			await audit.insert(event(action));
		expect(sent).toEqual([]);
	});

	it("appends the rest, with no value of the detail, no free text, and valid field names", async () => {
		const { rpc, sent } = fake();
		const audit = auditCollection(caller(rpc));
		await audit.insert(
			event("request.decide", {
				actor: { subject: "service:cms", kind: "service" as const },
				detail: { reason: "a name and a diagnosis", "bad key!": 1, count: 4, ids: ["c1", "c2"] },
			}),
		);
		const [call] = sent;
		expect(call?.fn).toBe("apiAudit:append");
		expect(JSON.stringify(call?.args)).not.toContain("diagnosis");
		expect(call?.args).toMatchObject({
			tenant: "psizone",
			actor: { subject: "service:cms" },
			action: "visit.update",
			entity: "visit",
			entityId: "c1",
			count: 4,
		});
		const fields = call?.args.fields as string[];
		expect(fields).toEqual(
			expect.arrayContaining(["api.request.decide", "type.clients", "by.service", "reason", "ids"]),
		);
		for (const f of fields) expect(f).toMatch(/^[A-Za-z][A-Za-z0-9_.]{0,47}$/);
	});

	it("a clinical read of a client is appended against the client; of a record the wrapper has it", async () => {
		const { rpc, sent } = fake();
		const audit = auditCollection(caller(rpc));
		await audit.insert(event("clinical.read", { target: { type: "client", id: "c1" } }));
		await audit.insert(event("clinical.read", { target: { type: "record", id: "r1" } }));
		expect(sent).toHaveLength(1);
		expect(sent[0]?.args).toMatchObject({ action: "record.read", entity: "client" });
	});

	it("never rewrites or removes an event", async () => {
		const audit = auditCollection(caller(fake().rpc));
		await expect(audit.replace(event("x.y"))).rejects.toMatchObject({ reason: "not_allowed" });
		await expect(audit.remove("psizone", "x")).rejects.toMatchObject({ reason: "not_allowed" });
	});
});
