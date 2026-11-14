import { accountClientId } from "@psi/notify";
import { accountHashOf } from "@psi/scheduling";
import { beforeEach, describe, expect, it } from "vitest";
import { createNovuNotify } from "./ports/novu-notify";
import { bookAs } from "./testing/booking";
import { createWorld, type Populated } from "./testing/populate";
import { NOW } from "./testing/world";

let w: Populated;
let calls: { event: string; payload: Record<string, unknown>; to: Record<string, unknown>[] }[];
beforeEach(async () => {
	w = await createWorld();
	calls = [];
});

const adapter = () =>
	createNovuNotify({
		store: w.store,
		clock: () => NOW,
		log: () => undefined,
		notifier: {
			notify(_app, event, payload, to) {
				calls.push({ event, payload, to: to.map((r) => ({ ...r })) });
				return Promise.resolve({ status: "queued", jobs: to.length });
			},
			drain: () => Promise.resolve(0),
			start: () => () => undefined,
			upsertSubscriber: () => Promise.resolve(),
			setTeam: () => Promise.resolve(),
			pending: () => Promise.resolve(0),
		},
	});

describe("a signed-in visitor is told as their account", () => {
	it("a confirmation of a request made signed in goes to the account's client subscriber, with the contact's e-mail", async () => {
		const { reference } = await bookAs(w, "visitor-acc", 5);
		await adapter().notify({
			app: "psizone",
			event: "appointment.confirmed",
			payload: { reference, account: accountHashOf("visitor-acc") },
			to: { kind: "request", reference },
			idempotencyKey: "k-acc",
		});
		expect(calls[0]?.to).toEqual([
			expect.objectContaining({
				audience: "client",
				clientId: accountClientId(accountHashOf("visitor-acc")),
				email: "visitor@example.test",
			}),
		]);
	});

	it("a visitor's own move says the new time and the old one, to the account", async () => {
		const { reference } = await bookAs(w, "visitor-mv", 5);
		const before = (
			(
				await w.callKey("psizone-web", "GET", "/v1/apps/psizone/me/appointments", undefined, {
					"x-psi-subject": "visitor-mv",
				})
			).json.items as { start: number }[]
		)[0]?.start;
		await adapter().notify({
			app: "psizone",
			event: "appointment.moved",
			payload: { reference, previousStart: NOW - 3_600_000, account: accountHashOf("visitor-mv") },
			to: { kind: "team", permission: "web_requests_view" },
			idempotencyKey: "k-mv",
		});
		expect(calls[0]).toMatchObject({
			event: "appointment.moved",
			payload: { previousStartsAt: new Date(NOW - 3_600_000).toISOString() },
		});
		expect(calls[0]?.payload.startsAt).toBe(new Date(before ?? 0).toISOString());
		expect(calls[0]?.to).toEqual([
			expect.objectContaining({ clientId: accountClientId(accountHashOf("visitor-mv")) }),
		]);
		expect(before).toBeTypeOf("number");
	});

	it("an anonymous request is still told by its reference alone", async () => {
		const { reference } = await bookAs(w, "visitor-anon", 6);
		await adapter().notify({
			app: "psizone",
			event: "appointment.cancelled",
			payload: { reference, by: "team" },
			to: { kind: "request", reference },
			idempotencyKey: "k-anon",
		});
		expect(calls[0]?.to[0]).toMatchObject({ audience: "client", clientId: reference });
	});

	it("deciding a request made signed in passes the account to the notification", async () => {
		const signed = await bookAs(w, "visitor-dec", 7);
		await w.call("olga", "POST", `/v1/apps/psizone/requests/${signed.reference}/decision`, {
			decision: "confirm",
		});
		const sent = w.notifier.sent.find(
			(s) => s.payload.reference === signed.reference && s.event === "appointment.confirmed",
		);
		expect(sent).toMatchObject({
			event: "appointment.confirmed",
			payload: { account: accountHashOf("visitor-dec") },
		});
	});
});
