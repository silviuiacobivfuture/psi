import { type RunningApi, startApi } from "@psi/scheduling-api/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PortError } from "../port";
import { createSdkPort } from "./index";

const A = "/v1/apps/psizone";
let api: RunningApi;
beforeAll(async () => {
	api = await startApi();
});
afterAll(async () => {
	await api.close();
});

const as = async (subject: string) =>
	createSdkPort({ baseUrl: api.url, bearer: () => api.tokenFor(subject) });
const owner = (method: string, path: string, body?: unknown) =>
	api.world.call("olga", method, `${A}${path}`, body);
let n = 0;
const reachable = async (): Promise<string> => {
	n += 1;
	return String(
		(
			await owner("POST", "/clients", {
				name: `Port Invitee ${n}`,
				contact: { email: `port${n}@example.test` },
			})
		).json.id,
	);
};
const refusal = async (run: () => Promise<unknown>): Promise<PortError> => {
	try {
		await run();
	} catch (error) {
		if (error instanceof PortError) return error;
		throw error;
	}
	throw new Error("expected a refusal");
};
const pick = { contact: "client", locale: "ro" } as const;

describe("the invitation through the console's own port, against the real service", () => {
	it("a client never invited has none", async () => {
		expect(await (await as("olga")).invite("psizone", await reachable())).toBeNull();
	});
	it("previews, sends, and reads it back as the console shows it", async () => {
		const port = await as("rita");
		const id = await reachable();
		const preview = await port.previewInvite("psizone", id, pick);
		expect(preview).toMatchObject({ subject: "Creează-ți contul online", existingAccount: false });
		expect(preview.html).toContain("/v1/public/invites/PREVIEW");
		expect(await port.invite("psizone", id)).toBeNull();
		const sent = await port.sendInvite("psizone", id, pick);
		expect(sent).toMatchObject({
			status: "invited",
			contact: "client",
			sends: 1,
			existingAccount: false,
		});
		expect(sent.sentTo).toMatch(/^p\*\*\*@example\.test$/);
		expect(await port.invite("psizone", id)).toEqual(sent);
		expect(JSON.stringify(sent)).not.toContain("invitedBy");
	});
	it("resends and withdraws", async () => {
		const port = await as("olga");
		const id = await reachable();
		await port.sendInvite("psizone", id, pick);
		api.world.clock.now += 61_000;
		expect((await port.resendInvite("psizone", id)).sends).toBe(2);
		expect((await port.revokeInvite("psizone", id)).status).toBe("revoked");
	});
	it("refusals arrive with their reason, as the typed error the screens branch on", async () => {
		const port = await as("olga");
		const id = await reachable();
		await port.sendInvite("psizone", id, pick);
		expect(await refusal(() => port.sendInvite("psizone", id, pick))).toMatchObject({
			code: "conflict",
			reason: "already_invited",
		});
		expect(await refusal(() => port.resendInvite("psizone", id))).toMatchObject({
			code: "conflict",
			reason: "too_soon",
		});
		const bare = String((await owner("POST", "/clients", { name: "No Mail" })).json.id);
		expect(await refusal(() => port.sendInvite("psizone", bare, pick))).toMatchObject({
			code: "invalid",
			reason: "no_email",
		});
		expect(await refusal(() => port.invite("psizone", "nope-nope"))).toMatchObject({
			code: "not-found",
		});
	});
	it("a therapist, who has no right to invite, is told not found, and nothing is sent", async () => {
		const id = await reachable();
		const before = await api.world.fingerprint();
		expect(
			await refusal(async () => (await as("dora")).sendInvite("psizone", id, pick)),
		).toMatchObject({
			code: "not-found",
		});
		expect(await api.world.fingerprint()).toBe(before);
	});
	it("a sign-in that is away is `unavailable`, not a crash, and nothing is written", async () => {
		const port = await as("olga");
		const id = await reachable();
		api.world.sso.failing = true;
		try {
			const before = await api.world.fingerprint();
			expect(await refusal(() => port.sendInvite("psizone", id, pick))).toMatchObject({
				code: "unavailable",
			});
			expect(await api.world.fingerprint()).toBe(before);
		} finally {
			api.world.sso.failing = false;
		}
	});
});
