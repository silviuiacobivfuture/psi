import { describe, expect, it } from "vitest";
import { hashSecret, verifyServiceKey } from "./auth/service-keys";
import { createTokenVerifier } from "./auth/tokens";
import { hashVariable, loadConfig } from "./config";
import { createHttpMailer, MailUnavailable } from "./ports/mail";
import { createS3Store } from "./ports/objects";
import { createTestIssuer } from "./testing/tokens";

const NOW = Date.UTC(2026, 10, 13, 8);
const setup = async () => {
	const issuer = await createTestIssuer(undefined, undefined, () => NOW);
	const verifier = createTokenVerifier({
		issuers: [{ issuer: issuer.issuer, audiences: [issuer.audience, "clinic-console"] }],
		keys: issuer.keys,
		now: () => new Date(NOW),
	});
	return { issuer, verifier };
};

describe("bearer tokens", () => {
	it("accepts a good token and any of the issuer's audiences, and reads the subject and name", async () => {
		const { issuer, verifier } = await setup();
		expect(await verifier.verify(await issuer.mint("u1", { name: "U One" }))).toEqual({
			ok: true,
			subject: "u1",
			name: "U One",
		});
		expect(
			await verifier.verify(await issuer.mint("u1", { audience: "clinic-console" })),
		).toMatchObject({ ok: true });
	});

	it.each([
		["an expired token", { expiresIn: -60 }, "expired"],
		["another audience", { audience: "someone-else" }, "wrong_audience"],
		["an unknown issuer", { issuer: "https://elsewhere.test/" }, "unknown_issuer"],
		["a foreign key", { foreignKey: true }, "bad_signature"],
		["a token not yet valid", { notBefore: 3600 }, "not_yet_valid"],
	] as const)("refuses %s", async (_name, options, reason) => {
		const { issuer, verifier } = await setup();
		expect(await verifier.verify(await issuer.mint("u1", options))).toEqual({ ok: false, reason });
	});

	it("refuses junk, an empty token and a token with no subject", async () => {
		const { issuer, verifier } = await setup();
		for (const junk of ["", "abc", "a.b.c", "a.e30.c"])
			expect(await verifier.verify(junk)).toMatchObject({ ok: false });
		const noSubject = (await issuer.mint("x")).split(".");
		const payload = JSON.parse(Buffer.from(noSubject[1] ?? "", "base64url").toString());
		delete payload.sub;
		noSubject[1] = Buffer.from(JSON.stringify(payload)).toString("base64url");
		expect(await verifier.verify(noSubject.join("."))).toMatchObject({ ok: false });
	});

	it("says the keys are unavailable when the issuer cannot be reached, instead of letting anyone in", async () => {
		const { issuer } = await setup();
		const verifier = createTokenVerifier({
			issuers: [
				{ issuer: issuer.issuer, audiences: [issuer.audience], jwksUrl: "http://127.0.0.1:1/jwks" },
			],
			now: () => new Date(NOW),
		});
		expect(await verifier.verify(await issuer.mint("u1"))).toEqual({
			ok: false,
			reason: "keys_unavailable",
		});
	});
});

describe("service keys", () => {
	const callers = [{ id: "psizone-web", app: "psizone" }];
	const hashes = new Map([["psizone-web", hashSecret("s3cret")]]);

	it("accepts the caller's key and names its app", () => {
		expect(verifyServiceKey("psizone-web.s3cret", callers, hashes)).toEqual({
			ok: true,
			callerId: "psizone-web",
			app: "psizone",
		});
	});

	it("refuses a wrong secret, an unknown caller, another caller's secret, an empty key and a key with no caller", () => {
		for (const key of ["psizone-web.nope", "ghost.s3cret", "psizone-web.", "", "s3cret", ".s3cret"])
			expect(verifyServiceKey(key, callers, hashes), key).toEqual({ ok: false });
	});

	it("never accepts a key whose hash is missing from the environment", () => {
		expect(verifyServiceKey("psizone-web.s3cret", callers, new Map())).toEqual({ ok: false });
	});
});

describe("configuration", () => {
	const base = {
		OIDC_ISSUERS: JSON.stringify([
			{ issuer: "https://auth.test/application/o/clinic/", audiences: ["scheduling-api"] },
		]),
		CLINIC_MASTER_KEY: "ab".repeat(32),
	};
	const prod = {
		...base,
		NODE_ENV: "production",
		SCHEDULING_STORE: "convex",
		CONVEX_URL: "http://scheduling-backend.scheduling.svc:3210",
		PSI_SCHEDULING_KEY: "k".repeat(40),
		OPENFGA_ENDPOINT: "http://openfga.openfga.svc:8081",
		OPENFGA_WRITE_ENDPOINT: "http://openfga-admin.openfga.svc:8080",
		OPENFGA_STORE_ID: "S",
		OPENFGA_MODEL_ID: "M",
		OPENFGA_TOKEN: "t",
		MAIL_API_URL: "http://mail.test/send",
		MAIL_API_KEY: "m",
		MAIL_FROM: "noreply@psizone.ro",
		S3_ENDPOINT: "https://s3.test",
		S3_BUCKET: "b",
		S3_ACCESS_KEY_ID: "a",
		S3_SECRET_ACCESS_KEY: "s",
		NOVU_API_URL: "http://novu-api.novu.svc:3000",
		NOVU_SECRET_KEY: "novu-secret",
		REMINDER_LINK_SECRET: "r".repeat(64),
		CONSOLE_URL: "https://programari-dev.psizone.ro",
		SERVICE_CALLERS: "psizone-web=psizone",
		[hashVariable("psizone-web")]: "c".repeat(64),
	};

	it("starts locally on the in-memory adapters", () => {
		const c = loadConfig(base);
		expect(c).toMatchObject({ port: 4380, store: { kind: "memory" }, authz: { kind: "memory" } });
	});

	it("starts in production on convex and OpenFGA, with callers and their hashes", () => {
		const c = loadConfig(prod);
		expect(c.authz).toMatchObject({ kind: "openfga", modelId: "M" });
		expect(c.callerHashes.get("psizone-web")).toBe("c".repeat(64));
	});

	it.each([
		["the in-memory store", { SCHEDULING_STORE: "memory" }],
		["no OpenFGA store id", { OPENFGA_STORE_ID: "" }],
		["a model id of 'latest'", { OPENFGA_MODEL_ID: "latest" }],
		["no master key", { CLINIC_MASTER_KEY: "" }],
		["a short master key", { CLINIC_MASTER_KEY: "abcd" }],
		["no mail", { MAIL_API_KEY: "" }],
		["no object storage", { S3_BUCKET: "" }],
		["no Novu API address", { NOVU_API_URL: "" }],
		["a Novu API address that is not a URL", { NOVU_API_URL: "novu-api" }],
		["no Novu secret key", { NOVU_SECRET_KEY: "" }],
		["no console URL", { CONSOLE_URL: "" }],
		["a console URL that is not a URL", { CONSOLE_URL: "programari" }],
		["no reminder link secret", { REMINDER_LINK_SECRET: "" }],
		["a short reminder link secret", { REMINDER_LINK_SECRET: "r".repeat(31) }],
		["no issuer", { OIDC_ISSUERS: "[]" }],
		["issuers that are not JSON", { OIDC_ISSUERS: "{" }],
		["a caller without its key hash", { [hashVariable("psizone-web")]: "" }],
		["a malformed caller list", { SERVICE_CALLERS: "oops" }],
		["a convex store with no server key", { PSI_SCHEDULING_KEY: "short" }],
	])("production refuses %s, by name", (_what, change) => {
		expect(() => loadConfig({ ...prod, ...change })).toThrow();
	});

	it("production carries the notification settings through", () => {
		expect(loadConfig(prod).notify).toEqual({
			novuApiUrl: "http://novu-api.novu.svc:3000",
			novuSecretKey: "novu-secret",
			reminderLinkSecret: "r".repeat(64),
			consoleUrl: "https://programari-dev.psizone.ro",
		});
	});

	it("locally the notification settings are optional: absent means none are delivered", () => {
		expect(loadConfig(base).notify).toBeUndefined();
	});

	it.each([
		["a Novu address alone", { NOVU_API_URL: "http://novu-api.novu.svc:3000" }],
		["a link secret alone", { REMINDER_LINK_SECRET: "r".repeat(40) }],
		["a console URL alone", { CONSOLE_URL: "https://programari-dev.psizone.ro" }],
		[
			"a short link secret",
			{ NOVU_API_URL: "http://n:3000", NOVU_SECRET_KEY: "k", REMINDER_LINK_SECRET: "short" },
		],
	])("outside production, %s is still refused (half a setup delivers nothing)", (_what, extra) => {
		expect(() => loadConfig({ ...base, ...extra })).toThrow(/NOVU|REMINDER/);
	});

	it("the error names the variable and never echoes a value", () => {
		try {
			loadConfig({ ...prod, CLINIC_MASTER_KEY: "very-secret-but-wrong" });
			expect.unreachable();
		} catch (error) {
			expect(String(error)).toContain("CLINIC_MASTER_KEY");
			expect(String(error)).not.toContain("very-secret-but-wrong");
		}
	});
});

describe("ports", () => {
	it("signs S3 URLs: expiring, scoped to one key and method, deterministic for a fixed clock", () => {
		const s3 = createS3Store({
			endpoint: "https://s3.test",
			bucket: "b",
			region: "eu",
			accessKeyId: "AK",
			secretAccessKey: "SK",
			now: () => NOW,
		});
		const up = s3.signUpload("psizone/c1/f1", "application/pdf", 900);
		expect(up.url).toContain("/b/psizone/c1/f1?");
		expect(up.url).toContain("X-Amz-Expires=900");
		expect(up.url).toMatch(/X-Amz-Signature=[0-9a-f]{64}$/);
		expect(up.expiresAt).toBe(NOW + 900_000);
		expect(s3.signUpload("psizone/c1/f1", "application/pdf", 900).url).toBe(up.url);
		expect(s3.signDownload("psizone/c1/f1", 900, "a.pdf").url).not.toBe(up.url);
		expect(up.url).not.toContain("SK");
	});

	it("the mail adapter posts with the bearer key and reports a failure instead of pretending", async () => {
		let seen: { auth?: string | null; body?: unknown } = {};
		const ok = createHttpMailer({
			url: "http://mail.test/send",
			key: "k",
			from: "n@x.test",
			fromName: "N",
			fetch: async (_u, init) => {
				seen = {
					auth: new Headers(init?.headers).get("authorization"),
					body: JSON.parse(String(init?.body)),
				};
				return new Response("{}");
			},
		});
		await ok.send({ to: "a@b.test", subject: "s", text: "t" });
		expect(seen).toMatchObject({
			auth: "Bearer k",
			body: { to: "a@b.test", subject: "s", body: "t" },
		});
		const down = createHttpMailer({
			url: "http://mail.test/send",
			key: "k",
			from: "n@x.test",
			fromName: "N",
			fetch: async () => new Response("no", { status: 502 }),
		});
		await expect(down.send({ to: "a@b.test", subject: "s", text: "t" })).rejects.toBeInstanceOf(
			MailUnavailable,
		);
		const gone = createHttpMailer({
			url: "http://mail.test/send",
			key: "k",
			from: "n@x.test",
			fromName: "N",
			fetch: () => Promise.reject(new TypeError("x")),
		});
		await expect(gone.send({ to: "a@b.test", subject: "s", text: "t" })).rejects.toBeInstanceOf(
			MailUnavailable,
		);
	});
});
