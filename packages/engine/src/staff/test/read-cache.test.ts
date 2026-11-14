import { describe, expect, it } from "vitest";
import { z } from "zod";
import { DISCOVERY_TOOLS } from "../parity/discovery";
import { createReadCache } from "../read-cache";
import {
	FAKE_NOW,
	FakeStaffPort,
	OWNER_PERMISSIONS,
	RECEPTION_PERMISSIONS,
	staffConfigWith,
} from "../testing";
import { call, opened } from "./discovery-harness";

describe("the read cache: per person, short-lived, forgotten on a change", () => {
	let at = FAKE_NOW;
	const now = () => at;
	const reads = () => createReadCache(now);
	async function read(
		session: { run: (id: string, input?: Record<string, unknown>) => Promise<unknown> },
		id = "c1",
	) {
		return z
			.object({ cached: z.boolean() })
			.parse(await session.run(DISCOVERY_TOOLS.call, call("clients.get", { id })));
	}
	it("the same read again within its time is answered from the cache, then asked again once it expired", async () => {
		const cache = reads();
		at = FAKE_NOW;
		const one = await opened(OWNER_PERMISSIONS, { reads: cache, now });
		expect((await read(one)).cached).toBe(false);
		const two = await opened(OWNER_PERMISSIONS, { reads: cache, now, port: one.port });
		expect((await read(two)).cached).toBe(true);
		expect(one.port.callsTo("callRoute")).toHaveLength(1);
		at = FAKE_NOW + 31_000;
		const three = await opened(OWNER_PERMISSIONS, { reads: cache, now, port: one.port });
		expect((await read(three)).cached).toBe(false);
	});
	it("is never shared: another person, or the same person holding other permissions, asks the service", async () => {
		const cache = reads();
		at = FAKE_NOW;
		const ana = await opened(OWNER_PERMISSIONS, { reads: cache, now });
		await read(ana);
		const dan = new FakeStaffPort();
		dan.signIn({ sub: "sub-dan" });
		expect(
			(await read(await opened(OWNER_PERMISSIONS, { reads: cache, now, port: dan }))).cached,
		).toBe(false);
		const narrower = new FakeStaffPort();
		expect(
			(await read(await opened(RECEPTION_PERMISSIONS, { reads: cache, now, port: narrower })))
				.cached,
		).toBe(false);
	});
	it("a change the person confirms forgets everything they read", async () => {
		const cache = reads();
		at = FAKE_NOW;
		const ana = await opened(OWNER_PERMISSIONS, { reads: cache, now });
		await read(ana);
		cache.forget(`${ana.session.principal.sub}|${ana.session.principal.appId}`);
		const again = await opened(OWNER_PERMISSIONS, { reads: cache, now, port: ana.port });
		expect((await read(again)).cached).toBe(false);
	});
	it("a cache time of 0 keeps nothing", async () => {
		const port = new FakeStaffPort();
		port.config = staffConfigWith({ cacheTtlSeconds: 0 });
		const cache = reads();
		const one = await opened(OWNER_PERMISSIONS, { reads: cache, now, port });
		await read(one);
		expect((await read(await opened(OWNER_PERMISSIONS, { reads: cache, now, port }))).cached).toBe(
			false,
		);
	});
});
