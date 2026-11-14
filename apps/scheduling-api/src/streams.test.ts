import { beforeEach, describe, expect, it } from "vitest";
import { createWorld, type Populated } from "./testing/populate";
import { bookingContact, HOUR, NOW } from "./testing/world";

const A = "/v1/apps/psizone";
let w: Populated;
beforeEach(async () => {
	w = await createWorld();
});

interface Open {
	status: number;
	/** The next event within `ms`, or undefined if none came. Heartbeats are skipped. */
	next(ms?: number): Promise<Record<string, unknown> | undefined>;
	ended(ms?: number): Promise<boolean>;
	close(): Promise<void>;
}

async function open(as: string, path: string): Promise<Open> {
	const controller = new AbortController();
	const res = await w.app.request(`${A}${path}`, {
		headers: { authorization: `Bearer ${await w.issuer.mint(as)}` },
		signal: controller.signal,
	});
	const reader = res.body?.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let done = false;
	const take = (): Record<string, unknown> | undefined => {
		for (;;) {
			const at = buffer.indexOf("\n\n");
			if (at < 0) return undefined;
			const block = buffer.slice(0, at);
			buffer = buffer.slice(at + 2);
			const data = block.split("\n").find((l) => l.startsWith("data:"));
			if (data !== undefined) return JSON.parse(data.slice(5).trim());
		}
	};
	// One read stays pending across calls: abandoning a read would swallow the chunk it later receives.
	let pending: Promise<ReadableStreamReadResult<Uint8Array>> | undefined;
	const pump = async (ms: number): Promise<void> => {
		if (reader === undefined || done) return;
		pending ??= reader.read();
		const timeout = new Promise<"timeout">((r) => setTimeout(() => r("timeout"), ms));
		const got = await Promise.race([pending, timeout]);
		if (got === "timeout") return;
		pending = undefined;
		if (got.done) done = true;
		else buffer += decoder.decode(got.value, { stream: true });
	};
	return {
		status: res.status,
		async next(ms = 250) {
			const end = Date.now() + ms;
			for (;;) {
				const e = take();
				if (e !== undefined) return e;
				if (done || Date.now() >= end) return undefined;
				await pump(Math.max(1, end - Date.now()));
			}
		},
		async ended(ms = 300) {
			const end = Date.now() + ms;
			while (!done && Date.now() < end) await pump(Math.max(1, end - Date.now()));
			return done;
		},
		async close() {
			controller.abort();
			await reader?.cancel().catch(() => undefined);
		},
	};
}
const book = (practitionerId: string, clientId: string, hours: number) =>
	w.call("olga", "POST", `${A}/appointments`, {
		practitionerId,
		clientId,
		start: NOW + hours * HOUR,
		end: NOW + (hours + 1) * HOUR,
	});

describe("the calendar stream", () => {
	it("opens with `ready`, and a mutation through the API reaches a permitted subscriber", async () => {
		const s = await open("rita", "/calendar/stream");
		expect(s.status).toBe(200);
		expect(await s.next()).toMatchObject({ kind: "ready", op: "ready" });
		const created = await book(w.ids.dora, w.ids.c1, 100);
		expect(await s.next()).toMatchObject({
			kind: "appointment",
			op: "created",
			id: created.json.id,
		});
		await w.call("rita", "POST", `${A}/appointments/${created.json.id}/cancel`, {
			reason: "client asked",
		});
		expect(await s.next()).toMatchObject({
			kind: "appointment",
			op: "updated",
			id: created.json.id,
		});
		await s.close();
	});

	it("a mutation on someone else's calendar does NOT reach a therapist limited to their own", async () => {
		const s = await open("dora", "/calendar/stream");
		await s.next();
		await book(w.ids.elena, w.ids.c2, 110);
		expect(await s.next(150)).toBeUndefined();
		const mine = await book(w.ids.dora, w.ids.c1, 111);
		expect(await s.next()).toMatchObject({ kind: "appointment", id: mine.json.id });
		await s.close();
	});

	it("a caller with no calendar permission is refused at the door", async () => {
		await w.call("olga", "PUT", `${A}/members/blank`, {
			displayName: "B",
			roles: [],
			coordinates: [],
		});
		expect((await open("blank", "/calendar/stream")).status).toBe(403);
		expect((await open("hugo", "/calendar/stream")).status).toBe(404);
	});

	it("resumes after a sequence number without losing or repeating events", async () => {
		const first = await book(w.ids.dora, w.ids.c1, 120);
		const second = await book(w.ids.dora, w.ids.c1, 122);
		const s = await open("rita", "/calendar/stream?after=0");
		const seen: unknown[] = [];
		for (let i = 0; i < 6; i++) {
			const e = await s.next(100);
			if (e !== undefined) seen.push(e);
		}
		const ids = seen
			.filter((e) => (e as { kind: string }).kind === "appointment")
			.map((e) => (e as { id: string }).id);
		expect(ids).toContain(first.json.id);
		expect(ids).toContain(second.json.id);
		expect(new Set(ids).size).toBe(ids.length);
		await s.close();
	});

	it("cuts a subscriber off when their access is revoked, at the next event", async () => {
		const s = await open("dora", "/calendar/stream");
		await s.next();
		await w.call("olga", "PUT", `${A}/members/dora`, {
			displayName: "Dora",
			roles: [],
			coordinates: [],
		});
		await book(w.ids.dora, w.ids.c1, 130);
		expect(await s.ended()).toBe(true);
	});

	it("beats while quiet, so a proxy keeps the connection", async () => {
		const res = await w.app.request(`${A}/calendar/stream`, {
			headers: { authorization: `Bearer ${await w.issuer.mint("rita")}` },
		});
		const reader = res.body?.getReader();
		let text = "";
		const end = Date.now() + 400;
		while (!text.includes(": hb") && Date.now() < end) {
			const got = await Promise.race([
				reader?.read(),
				new Promise<undefined>((r) => setTimeout(() => r(undefined), 100)),
			]);
			if (got?.value) text += new TextDecoder().decode(got.value);
		}
		await reader?.cancel();
		expect(text).toContain(": hb");
	});
});

describe("the requests stream and the inbox badge", () => {
	const callback = () =>
		w.callKey("psizone-web", "POST", `${A}/book/callback-requests`, {
			contact: { name: "Caller Test", phone: "0733 000 222" },
			locale: "ro",
		});

	it("a visitor's request reaches reception live, and not a therapist", async () => {
		const reception = await open("rita", "/requests/stream");
		await reception.next();
		expect((await open("dora", "/requests/stream")).status).toBe(403);
		const made = await callback();
		expect(await reception.next()).toMatchObject({
			kind: "request",
			op: "created",
			id: made.json.reference,
		});
		await reception.close();
	});

	it("the badge starts with the counts and moves when something that counts changes", async () => {
		const s = await open("rita", "/inbox-counts/stream");
		expect(await s.next()).toMatchObject({ requests: 0, reminders: 2 });
		await callback();
		expect(await s.next()).toMatchObject({ requests: 1, reminders: 2 });
		await w.call("rita", "POST", `${A}/reminders/${w.ids.a1}/state`, { state: "sent" });
		await book(w.ids.dora, w.ids.c1, 140);
		expect((await s.next())?.requests).toBe(1);
		await s.close();
	});

	it("the badge leaves the reminder count out for a caller who may not see reminders", async () => {
		await w.call("olga", "PUT", `${A}/members/rita/overrides`, {
			grant: [],
			deny: ["reminders_view_all"],
		});
		const s = await open("rita", "/inbox-counts/stream");
		const first = await s.next();
		expect(first).toHaveProperty("requests");
		expect(Object.keys(first ?? {})).not.toContain("reminders");
		await s.close();
	});

	it("a visitor cancelling and the team deciding both tell the stream", async () => {
		const s = await open("rita", "/requests/stream");
		await s.next();
		const slots = (
			await w.callKey(
				"psizone-web",
				"GET",
				`${A}/book/slots?service=evaluation&from=${NOW}&to=${NOW + 10 * 24 * HOUR}&limit=1`,
			)
		).json.slots as { practitioner: string; start: number }[];
		const hold = (
			await w.callKey("psizone-web", "POST", `${A}/book/holds`, {
				service: "evaluation",
				practitioner: slots[0]?.practitioner,
				start: slots[0]?.start,
				mode: "onsite",
				locale: "ro",
				channel: "form",
			})
		).json;
		const sub = (
			await w.callKey("psizone-web", "POST", `${A}/book/holds/${hold.reference}/submit`, {
				holdToken: hold.holdToken,
				contact: bookingContact({ phone: "0733 000 333" }),
			})
		).json;
		expect(await s.next()).toMatchObject({ op: "created" });
		await w.call("rita", "POST", `${A}/requests/${sub.reference}/decision`, {
			decision: "confirm",
		});
		expect(await s.next()).toMatchObject({ op: "updated", id: sub.reference });
		await s.close();
	});
});
