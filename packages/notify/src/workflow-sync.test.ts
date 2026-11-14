import { describe, expect, it } from "vitest";
import { APP_KEYS } from "./apps";
import { CATALOGUE, PAYLOADS } from "./catalogue";
import { SAMPLES } from "./testing/samples";
import { diffWorkflows, presentWorkflowIds, servedWorkflowIds } from "./workflow-sync";

describe("the workflows the bridge serves", () => {
	it("are every entry of the catalogue for every app, once,", () => {
		const served = servedWorkflowIds();
		expect(served).toHaveLength(CATALOGUE.length * APP_KEYS.length);
		expect(new Set(served).size).toBe(served.length);
	});
	it("name the two brands in their ids, so one environment can hold both without a clash", () => {
		for (const id of servedWorkflowIds()) expect(id).toMatch(/^(psizone|hemisync)-/);
	});
});

describe("what the next sync would change", () => {
	it("names what is served and not in Novu yet, and what Novu holds of ours that is no longer served", () => {
		const diff = diffWorkflows(
			["psizone-a", "psizone-b"],
			["psizone-a", "psizone-old", "other-app-x"],
		);
		expect(diff).toEqual({ missing: ["psizone-b"], stale: ["psizone-old"] });
	});
	it("is empty when Novu holds exactly what the bridge serves, and never calls another app's workflow stale", () => {
		expect(diffWorkflows(["psizone-a"], ["psizone-a", "nova-daily"])).toEqual({
			missing: [],
			stale: [],
		});
		expect(diffWorkflows([], [])).toEqual({ missing: [], stale: [] });
	});
});

describe("reading Novu's list", () => {
	const page = (ids: string[], total: number) =>
		new Response(
			JSON.stringify({ workflows: ids.map((workflowId) => ({ workflowId })), totalCount: total }),
		);
	it("pages through every workflow with the API key, and stops at the total", async () => {
		const seen: string[] = [];
		const ids = Array.from({ length: 130 }, (_, i) => `psizone-w${i}`);
		const fetch: typeof globalThis.fetch = (input, init) => {
			seen.push(`${String(input)} ${new Headers(init?.headers).get("authorization")}`);
			const offset = Number(new URL(String(input)).searchParams.get("offset"));
			return Promise.resolve(page(ids.slice(offset, offset + 100), ids.length));
		};
		const got = await presentWorkflowIds({
			apiUrl: "http://novu.test:3000/",
			secretKey: "k",
			fetch,
		});
		expect(got).toEqual(ids);
		expect(seen).toEqual([
			"http://novu.test:3000/v2/workflows?limit=100&offset=0 ApiKey k",
			"http://novu.test:3000/v2/workflows?limit=100&offset=100 ApiKey k",
		]);
	});
	it("refuses an answer that is not a list, and an error status, by saying so", async () => {
		const wrong: typeof globalThis.fetch = () =>
			Promise.resolve(new Response(JSON.stringify({ nope: 1 })));
		await expect(
			presentWorkflowIds({ apiUrl: "http://n", secretKey: "k", fetch: wrong }),
		).rejects.toThrow();
		const down: typeof globalThis.fetch = () => Promise.resolve(new Response("", { status: 503 }));
		await expect(
			presentWorkflowIds({ apiUrl: "http://n", secretKey: "k", fetch: down }),
		).rejects.toThrow("Novu answered 503");
	});
});

describe("the new payloads", () => {
	it("a conflict on a day the therapist does not work names no other session", () => {
		const { otherAppointmentId: _other, ...alone } = SAMPLES["appointment.conflict"];
		expect(PAYLOADS["appointment.conflict"].safeParse({ ...alone, what: "roster" }).success).toBe(
			true,
		);
		expect(PAYLOADS["appointment.conflict"].safeParse({ ...alone, what: "nowhere" }).success).toBe(
			false,
		);
	});
});
