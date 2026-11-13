import { RESOURCES, recordResourceFor } from "@psi/scheduling/permissions";
import { ROUTES, type RouteSpec } from "@psi/scheduling-sdk/contract";
import { beforeAll, describe, expect, it } from "vitest";
import { ApiError } from "./http/errors";
import { requireAsked } from "./http/pipeline";
import { createWorld, ok, type Populated } from "./testing/populate";

const A = "/v1/apps/psizone";

/** A form per record resource: the seeded templates' keys, and one an app's owners built. */
const FORMS = {
	report_aba: "aba-session-report",
	report_racemeup: "race-me-up-report",
	report_psychotherapy: "psychotherapy-report",
	report_custom: "owners-own-form",
	questionnaire_parent: "parent-questionnaire",
} as const;
type RecordResource = keyof typeof FORMS;
const RECORD_RESOURCES = Object.keys(FORMS) as RecordResource[];

let w: Populated;
const as = (who: string, method: string, path: string, body?: unknown) =>
	w.call(who, method, `${A}${path}`, body);

/** A member with no role whose only permission is the one granted. */
async function onlyWith(subject: string, relation: string): Promise<void> {
	ok(
		await as("olga", "PUT", `/members/${subject}`, {
			displayName: subject,
			roles: [],
			coordinates: [],
		}),
		subject,
	);
	ok(
		await as("olga", "PUT", `/members/${subject}/overrides`, { grant: [relation], deny: [] }),
		subject,
	);
}
const record = async (form: string): Promise<string> =>
	String(
		ok(
			await as("olga", "POST", `/clients/${w.ids.c1}/records`, {
				formId: form,
				data: { summary: form },
			}),
			"record",
		).id,
	);

beforeAll(async () => {
	w = await createWorld();
	for (const form of Object.values(FORMS))
		ok(
			await as("olga", "PUT", `/builder/forms/${form}`, {
				name: { ro: form, en: form },
				body: { kind: "session_report", fields: ["summary"] },
			}),
			form,
		);
	for (const resource of RECORD_RESOURCES)
		for (const action of ["view", "create", "edit", "delete"])
			await onlyWith(`u-${resource}-${action}`.replace(/_/g, "-"), `${resource}_${action}_all`);
});
const who = (resource: string, action: string): string =>
	`u-${resource}-${action}`.replace(/_/g, "-");

describe("which resource governs a record is the form's, and the package says which", () => {
	it("the five record resources of the route table are the package's", () => {
		const fromPackage = RESOURCES.filter(
			(r) => r.startsWith("report_") || r === "questionnaire_parent",
		).sort();
		expect(RECORD_RESOURCES.sort()).toEqual(fromPackage.filter((r) => r !== "reports"));
		for (const [resource, form] of Object.entries(FORMS))
			expect(recordResourceFor(form), form).toBe(resource);
		const dynamic = (ROUTES as ReadonlyArray<RouteSpec>).filter(
			(r) => r.permission?.target.kind === "dynamic",
		);
		for (const r of dynamic) {
			const target = r.permission?.target;
			if (target?.kind !== "dynamic" || r.permission?.key !== "record:dynamic") continue;
			expect(
				target.candidates.map((c) => c.replace(/_(view|create|edit|delete)$/, "")).sort(),
				r.id,
			).toEqual(RECORD_RESOURCES.sort());
		}
	});
});

describe("a dynamic route is answered only once its handler asked", () => {
	it("refuses a handler that returned without authorizing, and lets one that asked through", () => {
		expect(() => requireAsked({ required: true, asked: false })).toThrow(ApiError);
		expect(() => requireAsked({ required: true, asked: true })).not.toThrow();
		expect(() => requireAsked({ required: false, asked: false })).not.toThrow();
	});
});

describe.each(RECORD_RESOURCES)("records of the %s resource", (resource) => {
	const mine = FORMS[resource];
	const others = RECORD_RESOURCES.filter((r) => r !== resource);

	it("view: opens the records of its own form and nothing else", async () => {
		const own = await record(mine);
		expect((await as(who(resource, "view"), "GET", `/records/${own}`)).status).toBe(200);
		for (const other of others) {
			const id = await record(FORMS[other]);
			const before = await w.fingerprint();
			const r = await as(who(resource, "view"), "GET", `/records/${id}`);
			expect({ other, status: r.status }).toEqual({ other, status: 404 });
			// A read of clinical content is audited, so only the refusals are held to "nothing written".
			expect(await w.fingerprint()).toBe(before);
		}
	});

	it("list: shows only the records of its own form", async () => {
		const own = await record(mine);
		for (const other of others) await record(FORMS[other]);
		const items = (await as(who(resource, "view"), "GET", `/clients/${w.ids.c1}/records`)).json
			.items as { id: string; formId: string }[];
		expect(items.map((i) => i.id)).toContain(own);
		// (the populated "session-report" form is a custom one too, so it belongs to report_custom)
		for (const i of items) expect(recordResourceFor(i.formId)).toBe(resource);
	});

	it("create: writes a record of its own form, and refuses another form's, writing nothing", async () => {
		const made = await as(who(resource, "create"), "POST", `/clients/${w.ids.c1}/records`, {
			formId: mine,
			data: { summary: "x" },
		});
		expect(made.status).toBe(200);
		for (const other of others) {
			const before = await w.fingerprint();
			const r = await as(who(resource, "create"), "POST", `/clients/${w.ids.c1}/records`, {
				formId: FORMS[other],
				data: { summary: "x" },
			});
			expect({ other, status: r.status }).toEqual({ other, status: 404 });
			expect(await w.fingerprint()).toBe(before);
		}
	});

	it("edit: changes a record of its own form, and refuses another form's, writing nothing", async () => {
		const own = await record(mine);
		expect(
			(await as(who(resource, "edit"), "PATCH", `/records/${own}`, { data: { summary: "y" } }))
				.status,
		).toBe(200);
		for (const other of others) {
			const id = await record(FORMS[other]);
			const before = await w.fingerprint();
			const r = await as(who(resource, "edit"), "PATCH", `/records/${id}`, {
				data: { summary: "y" },
			});
			expect({ other, status: r.status }).toEqual({ other, status: 404 });
			expect(await w.fingerprint()).toBe(before);
		}
	});

	it("delete: removes a record of its own form, and refuses another form's, writing nothing", async () => {
		const own = await record(mine);
		expect((await as(who(resource, "delete"), "DELETE", `/records/${own}`)).status).toBe(200);
		for (const other of others) {
			const id = await record(FORMS[other]);
			const before = await w.fingerprint();
			const r = await as(who(resource, "delete"), "DELETE", `/records/${id}`);
			expect({ other, status: r.status }).toEqual({ other, status: 404 });
			expect(await w.fingerprint()).toBe(before);
		}
	});

	it("holding the view does not give the edit, nor the reverse (each action is its own key)", async () => {
		const id = await record(mine);
		const before = await w.fingerprint();
		expect(
			(await as(who(resource, "view"), "PATCH", `/records/${id}`, { data: { summary: "z" } }))
				.status,
		).toBe(403);
		expect((await as(who(resource, "edit"), "GET", `/records/${id}`)).status).toBe(403);
		expect(await w.fingerprint()).toBe(before);
	});
});

describe("the other dynamic routes", () => {
	it("payments.remove asks where the payment hangs: the package it belongs to", async () => {
		await onlyWith("u-pay-delete", "payments_delete_all");
		await onlyWith("u-pay-view", "payments_view_all");
		const before = await w.fingerprint();
		expect((await as("u-pay-view", "DELETE", `/payments/${w.ids.payment}`)).status).toBe(403);
		expect(await w.fingerprint()).toBe(before);
		expect((await as("u-pay-delete", "DELETE", `/payments/${w.ids.payment}`)).status).toBe(200);
	});

	it("leave.decide asks on the person whose leave it is: own scope does not reach a colleague's", async () => {
		await onlyWith("u-leave-own", "leave_approve_own");
		const before = await w.fingerprint();
		const r = await as("u-leave-own", "POST", `/leave/${w.ids.leave}/decision`, {
			decision: "approved",
		});
		expect(r.status).toBe(404);
		expect(await w.fingerprint()).toBe(before);
		await onlyWith("u-leave-all", "leave_approve_all");
		expect(
			(await as("u-leave-all", "POST", `/leave/${w.ids.leave}/decision`, { decision: "approved" }))
				.status,
		).toBe(200);
	});
});
