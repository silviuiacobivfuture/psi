import { Client } from "@novu/framework";
import { serve } from "@novu/framework/hono";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { APP_KEYS } from "./apps";
import { CATALOGUE, workflowId } from "./catalogue";
import { RUNTIME } from "./gen/registry.generated";
import { SAMPLES } from "./testing/samples";

function bridge(): Hono {
	const app = new Hono();
	const handler = serve({
		client: new Client({
			secretKey: "sk_test",
			apiUrl: "http://127.0.0.1:1",
			strictAuthentication: false,
		}),
		workflows: RUNTIME.flatMap((r) => r.workflows()),
	});
	app.on(["GET", "POST", "OPTIONS"], "/api/novu", (c) => handler(c));
	return app;
}

describe("the bridge the estate serves", () => {
	it("discovers every workflow of every app, once", async () => {
		const res = await bridge().request("http://b/api/novu?action=discover");
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			workflows: Array<{ workflowId: string; steps: Array<{ type: string }> }>;
		};
		const ids = body.workflows.map((w) => w.workflowId).sort();
		expect(ids).toEqual(
			APP_KEYS.flatMap((a) => CATALOGUE.map((e) => workflowId(a, e.event, e.audience))).sort(),
		);
		const confirmed = body.workflows.find(
			(w) => w.workflowId === "psizone-appointment-confirmed-client",
		);
		expect(confirmed?.steps.map((s) => s.type)).toEqual(["push", "email"]);
		const request = body.workflows.find((w) => w.workflowId === "hemisync-request-new-team");
		expect(request?.steps.map((s) => s.type)).toEqual(["in_app", "push", "email"]);
	});

	const SAMPLE_META = {
		event: "appointment.confirmed",
		audience: "client",
		channels: { in_app: false, push: true, email: true },
		brandName: "Psizone",
		theme: "psizone-light",
		timeZone: "Europe/Bucharest",
		siteUrl: "https://psizone.example",
		consoleUrl: "https://clinic.example",
		place: {
			name: "Psizone",
			address: "Strada General Alexandru Cernat 126, Galați",
			mapUrl: "https://maps.example/x",
		},
	};

	async function preview(stepId: string, locale: string) {
		const res = await bridge().request(
			`http://b/api/novu?action=preview&workflowId=psizone-appointment-confirmed-client&stepId=${stepId}`,
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					payload: { ...SAMPLES["appointment.confirmed"], meta: SAMPLE_META },
					subscriber: { subscriberId: "s", locale },
					controls: {},
					state: [],
				}),
			},
		);
		return {
			status: res.status,
			body: (await res.json()) as { outputs?: { subject?: string; body?: string } },
		};
	}

	it("the e-mail step renders the real template in the subscriber's language", async () => {
		const ro = await preview("email", "ro");
		expect(ro.status).toBe(200);
		expect(ro.body.outputs?.subject).toBe("Programarea ta este confirmată");
		expect(ro.body.outputs?.body).toContain("General Alexandru Cernat 126");
		const en = await preview("email", "en_US");
		expect(en.body.outputs?.subject).toBe("Your appointment is confirmed");
	});

	it("the push step carries the brand and a fixed sentence, never the appointment", async () => {
		const p = await preview("push", "ro");
		expect(p.status).toBe(200);
		expect(p.body.outputs?.subject).toBe("Psizone");
		expect(JSON.stringify(p.body.outputs)).not.toContain("Terapie");
		expect(JSON.stringify(p.body.outputs)).not.toContain("Ana");
	});

	it("the registry has the shape the estate bridge reads", () => {
		expect(RUNTIME.map((r) => r.catalog.app)).toEqual([...APP_KEYS]);
		for (const r of RUNTIME) expect(r.workflows().length).toBe(CATALOGUE.length);
	});
});
