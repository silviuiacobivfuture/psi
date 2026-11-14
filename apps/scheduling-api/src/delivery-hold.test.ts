import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDeps } from "./build";
import { deliversNotices, loadConfig } from "./config";

/** A local instance with every notification setting, and mail: what production carries, on the in-memory adapters. */
const ENV: Record<string, string> = {
	OIDC_ISSUERS: JSON.stringify([
		{ issuer: "https://auth.test/application/o/clinic/", audiences: ["c"] },
	]),
	CLINIC_MASTER_KEY: "ab".repeat(32),
	MAIL_API_URL: "http://mail.test/send",
	MAIL_API_KEY: "m",
	MAIL_FROM: "noreply@psizone.ro",
	NOVU_API_URL: "http://novu-api.novu.svc:3000",
	NOVU_SECRET_KEY: "novu-secret",
	REMINDER_LINK_SECRET: "r".repeat(64),
	CONSOLE_URL: "https://programari.test",
};

afterEach(() => {
	vi.restoreAllMocks();
});

describe("NOTIFY_DELIVERY: held delivery for an instance whose people another system still serves", () => {
	it("is `send` when unset: an instance with Novu delivers", () => {
		const c = loadConfig(ENV);
		expect(c.delivery).toBe("send");
		expect(deliversNotices(c)).toBe(true);
	});

	it("`hold` keeps the Novu settings (still required) and delivers nothing", () => {
		const c = loadConfig({ ...ENV, NOTIFY_DELIVERY: "hold" });
		expect(c.delivery).toBe("hold");
		expect(c.notify).toBeDefined();
		expect(deliversNotices(c)).toBe(false);
	});

	it("an instance without Novu delivers nothing, whatever the switch says", () => {
		const {
			NOVU_API_URL: _a,
			NOVU_SECRET_KEY: _b,
			REMINDER_LINK_SECRET: _c,
			CONSOLE_URL: _d,
			...bare
		} = ENV;
		expect(deliversNotices(loadConfig(bare))).toBe(false);
		expect(deliversNotices(loadConfig({ ...bare, NOTIFY_DELIVERY: "send" }))).toBe(false);
	});

	it.each([["pause"], ["HOLD"], [""], ["send "]])("refuses %j, by name", (value) => {
		expect(() => loadConfig({ ...ENV, NOTIFY_DELIVERY: value })).toThrow(/NOTIFY_DELIVERY/);
	});

	it("held: no Novu call, no signed link, no reminder or invitation pages, no mailer", async () => {
		const fetch = vi.spyOn(globalThis, "fetch");
		vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		const deps = buildDeps(loadConfig({ ...ENV, NOTIFY_DELIVERY: "hold" }));
		expect(deps.links).toBeUndefined();
		expect(deps.reminders).toBeUndefined();
		expect(deps.invites).toBeUndefined();
		expect(deps.mailer).toBeUndefined();
		await deps.notifier.notify({
			app: "psizone",
			event: "appointment.confirmed",
			payload: { appointmentId: "a1", start: 1 },
			to: { kind: "client", clientId: "c1" },
			idempotencyKey: "k1",
		});
		expect(fetch).not.toHaveBeenCalled();
	});

	it("sending (the same settings, not held) wires the links, the pages and the mailer", () => {
		vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		const deps = buildDeps(loadConfig(ENV));
		expect(deps.links).toBeDefined();
		expect(deps.reminders).toBeDefined();
		expect(deps.mailer).toBeDefined();
	});
});
