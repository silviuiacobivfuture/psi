import { generateKeyPair, SignJWT } from "jose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type LocalAuthentik, startLocalAuthentik } from "./authentik.fixture";
import { createBearerVerifier } from "./verify-bearer";
import { createGateVerifier } from "./verify-gate";

let ak: LocalAuthentik;
beforeAll(async () => {
	ak = await startLocalAuthentik();
});
afterAll(async () => {
	await ak.close();
});

const person = {
	sub: "hashed-sub-1",
	email: "staff@psizone.ro",
	preferred_username: "staff",
	groups: ["app-agent-studio-viewer"],
};

describe("bearer (RS256 via JWKS)", () => {
	const verifier = () =>
		createBearerVerifier({
			issuer: ak.issuer("agent-studio-api"),
			audience: "agent-studio-api",
			jwksUrl: new URL("jwks/", ak.issuer("agent-studio-api")),
		});

	it("accepts a token the provider signed for this audience", async () => {
		const token = await ak.signRs256({
			...person,
			iss: ak.issuer("agent-studio-api"),
			aud: "agent-studio-api",
		});
		await expect(verifier().verify(token)).resolves.toEqual({
			id: "hashed-sub-1",
			email: "staff@psizone.ro",
			username: "staff",
			groups: ["app-agent-studio-viewer"],
			via: "bearer",
		});
	});

	it("refuses another issuer", async () => {
		const token = await ak.signRs256({
			...person,
			iss: ak.issuer("pdfcraft"),
			aud: "agent-studio-api",
		});
		await expect(verifier().verify(token)).rejects.toThrow(/ERR_JWT_CLAIM_VALIDATION_FAILED/);
	});

	it("refuses another audience", async () => {
		const token = await ak.signRs256({ ...person, iss: ak.issuer("agent-studio-api"), aud: "cms" });
		await expect(verifier().verify(token)).rejects.toThrow(/ERR_JWT_CLAIM_VALIDATION_FAILED/);
	});

	it("refuses an expired token", async () => {
		const token = await ak.signRs256(
			{ ...person, iss: ak.issuer("agent-studio-api"), aud: "agent-studio-api" },
			{ expiresIn: "-5m" },
		);
		await expect(verifier().verify(token)).rejects.toThrow(/ERR_JWT_EXPIRED/);
	});

	it("refuses a token signed by a key the JWKS does not hold", async () => {
		const other = await generateKeyPair("RS256");
		const token = await ak.signRs256(
			{ ...person, iss: ak.issuer("agent-studio-api"), aud: "agent-studio-api" },
			{ withKey: other.privateKey },
		);
		await expect(verifier().verify(token)).rejects.toThrow(/ERR_JWS_SIGNATURE_VERIFICATION_FAILED/);
	});

	it("refuses HS256 (algorithm confusion) before any key is consulted", async () => {
		const token = await new SignJWT({
			...person,
			iss: ak.issuer("agent-studio-api"),
			aud: "agent-studio-api",
		})
			.setProtectedHeader({ alg: "HS256", kid: "local-1" })
			.setIssuedAt()
			.setExpirationTime("5m")
			.sign(new TextEncoder().encode("anything-at-all-anything-at-all-00"));
		await expect(verifier().verify(token)).rejects.toThrow(/ERR_JOSE_ALG_NOT_ALLOWED/);
	});

	it("refuses an unsigned token", async () => {
		const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
		const exp = Math.floor(Date.now() / 1000) + 300;
		const token = `${enc({ alg: "none" })}.${enc({ ...person, iss: ak.issuer("agent-studio-api"), aud: "agent-studio-api", exp, iat: exp - 300 })}.`;
		await expect(verifier().verify(token)).rejects.toThrow(/bearer token refused/);
	});

	it("refuses a verified token that carries no groups claim", async () => {
		const { groups: _drop, ...noGroups } = person;
		const token = await ak.signRs256({
			...noGroups,
			iss: ak.issuer("agent-studio-api"),
			aud: "agent-studio-api",
		});
		await expect(verifier().verify(token)).rejects.toThrow(/lacks sub or groups/);
	});
});

describe("gate (the outpost's X-authentik-jwt, confirmed with userinfo)", () => {
	const verifier = (audience?: string) =>
		createGateVerifier({
			issuer: ak.issuer("agent-studio"),
			userinfoUrl: new URL("/application/o/userinfo/", ak.origin),
			...(audience === undefined ? {} : { audience }),
		});

	it("accepts a live token for this application, with groups from Authentik's answer", async () => {
		const token = await ak.issueGateToken(
			{
				sub: person.sub,
				iss: ak.issuer("agent-studio"),
				aud: "proxy-client-id",
				groups: ["forged-in-token"],
			},
			person,
		);
		const user = await verifier("proxy-client-id").verify(token);
		expect(user).toMatchObject({
			id: "hashed-sub-1",
			groups: ["app-agent-studio-viewer"],
			via: "gate",
		});
	});

	it("refuses another gated application's token without asking Authentik", async () => {
		const before = ak.userinfoCalls();
		const token = await ak.issueGateToken({ sub: person.sub, iss: ak.issuer("pdfcraft") }, person);
		await expect(verifier().verify(token)).rejects.toThrow(/another application's/);
		expect(ak.userinfoCalls()).toBe(before);
	});

	it("refuses an expired token", async () => {
		const token = await ak.issueGateToken(
			{ sub: person.sub, iss: ak.issuer("agent-studio") },
			person,
			{ expiresIn: "-5m" },
		);
		await expect(verifier().verify(token)).rejects.toThrow(/expired/);
	});

	it("refuses a token with the wrong audience when one is configured", async () => {
		const token = await ak.issueGateToken(
			{ sub: person.sub, iss: ak.issuer("agent-studio"), aud: "other" },
			person,
		);
		await expect(verifier("proxy-client-id").verify(token)).rejects.toThrow(/audience/);
	});

	it("refuses a well-formed token Authentik does not know (forged)", async () => {
		const forged = await new SignJWT({ sub: person.sub, iss: ak.issuer("agent-studio") })
			.setProtectedHeader({ alg: "HS256" })
			.setIssuedAt()
			.setExpirationTime("5m")
			.sign(new TextEncoder().encode("a-guess-at-the-client-secret-00000"));
		await expect(verifier().verify(forged)).rejects.toThrow(/refused the token \(401\)/);
	});

	it("refuses when userinfo names a different subject", async () => {
		const token = await ak.issueGateToken(
			{ sub: "someone-else", iss: ak.issuer("agent-studio") },
			person,
		);
		await expect(verifier().verify(token)).rejects.toThrow(/subject differs/);
	});

	it("refuses when userinfo carries no groups", async () => {
		const { groups: _drop, ...noGroups } = person;
		const token = await ak.issueGateToken(
			{ sub: person.sub, iss: ak.issuer("agent-studio") },
			noGroups,
		);
		await expect(verifier().verify(token)).rejects.toThrow(/lacks sub or groups/);
	});

	it("reuses a confirmation within the cache window", async () => {
		const v = verifier();
		const token = await ak.issueGateToken(
			{ sub: person.sub, iss: ak.issuer("agent-studio") },
			person,
		);
		const before = ak.userinfoCalls();
		await v.verify(token);
		await v.verify(token);
		expect(ak.userinfoCalls()).toBe(before + 1);
	});

	it("refuses something that is not a JWT", async () => {
		await expect(verifier().verify("not-a-jwt")).rejects.toThrow(/not a JWT/);
	});
});
