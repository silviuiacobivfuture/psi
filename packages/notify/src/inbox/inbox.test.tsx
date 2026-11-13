import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type FakeInbox, startFakeInbox } from "../testing/fake-inbox";
import { createFeed, FeedUnavailable } from "./feed";
import { consolePath, present } from "./present";
import { createInboxRoutes } from "./routes";

const SECRET = "sk_inbox_test";
const APP_ID = "app_123";
const NOW = Date.parse("2026-11-20T10:00:00Z");
let novu: FakeInbox;

beforeEach(async () => {
	novu = await startFakeInbox(SECRET, APP_ID);
	novu.messages.set("sub-1", [
		{
			id: "m1",
			subject: "Cerere nouă de la Maria",
			body: "Maria a trimis o cerere.",
			isRead: false,
			createdAt: "2026-11-20T08:00:00Z",
			redirect: { url: "https://clinic.example/requests/r1" },
		},
		{
			id: "m2",
			subject: "Alt mesaj",
			body: "x",
			isRead: true,
			createdAt: "2026-11-18T08:00:00Z",
			redirect: { url: "https://evil.example/phish" },
		},
	]);
	novu.messages.set("sub-2", [
		{
			id: "z1",
			subject: "Al altcuiva",
			body: "x",
			isRead: false,
			createdAt: "2026-11-20T08:00:00Z",
		},
	]);
});
afterEach(async () => {
	await novu.close();
});

const feed = () =>
	createFeed({ apiUrl: novu.url, applicationId: APP_ID, secretKey: SECRET, now: () => NOW });

describe("feed", () => {
	it("opens a session with the person's subscriber hash and lists only their notifications", async () => {
		const r = await feed().list("sub-1", 20);
		expect(r.entries.map((e) => e.id)).toEqual(["m1", "m2"]);
		expect(r.unread).toBe(1);
		expect((await feed().list("sub-2", 20)).entries.map((e) => e.id)).toEqual(["z1"]);
	});
	it("a wrong secret is refused by Novu and surfaces as unavailable", async () => {
		const bad = createFeed({ apiUrl: novu.url, applicationId: APP_ID, secretKey: "other" });
		await expect(bad.list("sub-1", 20)).rejects.toBeInstanceOf(FeedUnavailable);
	});
	it("a wrong application is refused", async () => {
		const bad = createFeed({ apiUrl: novu.url, applicationId: "other", secretKey: SECRET });
		await expect(bad.list("sub-1", 20)).rejects.toBeInstanceOf(FeedUnavailable);
	});
	it("reuses the session, and opens a new one when Novu answers 401", async () => {
		const f = feed();
		await f.list("sub-1", 20);
		await f.list("sub-1", 20);
		expect(novu.sessions).toBe(1);
		novu.rejectNext401 = true;
		await f.list("sub-1", 20);
		expect(novu.sessions).toBe(2);
	});
	it("marks one and all as read", async () => {
		const f = feed();
		await f.markRead("sub-1", "m1");
		expect((await f.list("sub-1", 20)).unread).toBe(0);
		novu.messages.get("sub-1")?.push({
			id: "m3",
			subject: "n",
			body: "",
			isRead: false,
			createdAt: "2026-11-20T09:00:00Z",
		});
		await f.markAllRead("sub-1");
		expect((await f.list("sub-1", 20)).unread).toBe(0);
	});
	it("marking another person's notification fails and changes nothing", async () => {
		await expect(feed().markRead("sub-1", "z1")).rejects.toBeInstanceOf(FeedUnavailable);
		expect(novu.messages.get("sub-2")?.[0]?.isRead).toBe(false);
	});
	it("Novu down is unavailable, not a crash", async () => {
		novu.down = true;
		await expect(feed().list("sub-1", 20)).rejects.toBeInstanceOf(FeedUnavailable);
	});
});

describe("presentation", () => {
	const o = {
		locale: "ro" as const,
		timeZone: "Europe/Bucharest",
		consoleOrigin: "https://clinic.example",
		now: NOW,
	};
	it("groups today and earlier and keeps links on the console", async () => {
		const r = await feed().list("sub-1", 20);
		const data = present(r.entries, r.unread, o);
		if (data.state !== "ready") throw new Error("ready expected");
		expect(data.entries.map((e) => [e.id, e.group, e.href])).toEqual([
			["m1", "today", "/requests/r1"],
			["m2", "earlier", "/"],
		]);
		expect(data.entries[0]?.time).toBe("10:00");
	});
	it("consolePath: relative stays, same origin becomes a path, protocol-relative and foreign go home", () => {
		const c = "https://clinic.example";
		expect(consolePath("/a?b=1", c)).toBe("/a?b=1");
		expect(consolePath("https://clinic.example/x?y=2", c)).toBe("/x?y=2");
		expect(consolePath("//evil.example/x", c)).toBe("/");
		expect(consolePath("https://evil.example/x", c)).toBe("/");
		expect(consolePath("javascript:alert(1)", c)).toBe("/");
		expect(consolePath("", c)).toBe("/");
		expect(consolePath(undefined, c)).toBe("/");
	});
});

describe("routes", () => {
	function mount(subscriber: string | undefined, pollMs = 20): Hono {
		const { app } = createInboxRoutes({
			feed: feed(),
			subscriberOf: () => subscriber,
			localeOf: () => "ro",
			consoleOrigin: "https://clinic.example",
			timeZone: "Europe/Bucharest",
			mount: "/inbox",
			pollMs,
			now: () => NOW,
		});
		return new Hono().route("/inbox", app);
	}
	const post = (
		app: Hono,
		path: string,
		headers: Record<string, string> = { "sec-fetch-site": "same-origin" },
	) => app.request(`http://clinic.example${path}`, { method: "POST", headers });

	it("signed out: every route is 401 and Novu is never asked", async () => {
		const app = mount(undefined);
		for (const [m, p] of [
			["GET", "/inbox/panel"],
			["GET", "/inbox/stream"],
			["POST", "/inbox/read?id=m1"],
			["POST", "/inbox/read-all"],
		] as const)
			expect(
				(
					await app.request(`http://clinic.example${p}`, {
						method: m,
						headers: { "sec-fetch-site": "same-origin" },
					})
				).status,
				p,
			).toBe(401);
		expect(novu.sessions).toBe(0);
	});

	it("panel is a Datastar patch of the widget with the person's own notifications", async () => {
		const res = await mount("sub-1").request("http://clinic.example/inbox/panel");
		expect(res.headers.get("content-type")).toContain("text/event-stream");
		const text = await res.text();
		expect(text).toContain("event: datastar-patch-elements");
		expect(text).toContain("Cerere nouă de la Maria");
		expect(text).not.toContain("Al altcuiva");
		expect(text).toContain("Notificări, 1 necitite");
	});

	it("read marks one as read and returns the new state; a cross-site POST changes nothing", async () => {
		const app = mount("sub-1");
		expect((await post(app, "/inbox/read?id=m1", { "sec-fetch-site": "cross-site" })).status).toBe(
			403,
		);
		expect(novu.messages.get("sub-1")?.[0]?.isRead).toBe(false);
		const ok = await post(app, "/inbox/read?id=m1");
		expect(await ok.text()).toContain("Notificări, nimic necitit");
		expect(novu.messages.get("sub-1")?.[0]?.isRead).toBe(true);
	});

	it("read without an id, or another person's id, shows the error state and changes nothing", async () => {
		const app = mount("sub-1");
		expect(await (await post(app, "/inbox/read")).text()).toContain('role="alert"');
		expect(await (await post(app, "/inbox/read?id=z1")).text()).toContain('role="alert"');
		expect(novu.messages.get("sub-2")?.[0]?.isRead).toBe(false);
	});

	it("read-all", async () => {
		const res = await post(mount("sub-1"), "/inbox/read-all");
		expect(await res.text()).toContain("nimic necitit");
		expect(novu.messages.get("sub-1")?.every((m) => m.isRead)).toBe(true);
	});

	it("Novu down: the panel shows the error state with a retry", async () => {
		novu.down = true;
		const text = await (await mount("sub-1").request("http://clinic.example/inbox/panel")).text();
		expect(text).toContain("Nu am putut încărca notificările.");
		expect(text).toContain("@get(");
	});

	it("the stream sends the state, stays quiet while nothing changes, and patches the badge when a notification arrives", async () => {
		const res = await mount("sub-1", 30).request("http://clinic.example/inbox/stream");
		const reader = res.body?.getReader();
		if (!reader) throw new Error("no stream");
		const decoder = new TextDecoder();
		let seen = "";
		const readUntil = async (needle: string): Promise<void> => {
			const deadline = Date.now() + 3000;
			while (!seen.includes(needle) && Date.now() < deadline) {
				const { value, done } = await reader.read();
				if (done) break;
				seen += decoder.decode(value);
			}
			expect(seen).toContain(needle);
		};
		await readUntil("Notificări, 1 necitite");
		expect(seen.match(/datastar-patch-elements/g)?.length).toBe(1);
		novu.messages.get("sub-1")?.unshift({
			id: "m9",
			subject: "A doua cerere",
			body: "",
			isRead: false,
			createdAt: "2026-11-20T09:30:00Z",
		});
		await readUntil("Notificări, 2 necitite");
		expect(seen.match(/datastar-patch-elements/g)?.length).toBe(2);
		await reader.cancel();
	});
});
