import { describe, expect, it } from "vitest";
import { interimAuthorizer } from "../authz/interim";
import type { Brand, Subject } from "../authz/types";
import { checkUrl, FetchError, fetchSource } from "./fetch-url";
import { approvalAfterSave, approvalRelations, decideApproval, heldOn } from "./source-gate";

const person = (email: string): Subject => ({ userId: "u1", sub: "s1", email, groups: [] });

/** The manifest's roles, through the interim adapter: what the estate would answer. */
const auth = interimAuthorizer(
	[
		"ops@psi.ro=cms:ai_operator",
		"eqops@psi.ro=cms:ai_operator@eqsync",
		"admin@psi.ro=cms:ai_admin",
		"clin@psi.ro=cms:ai_operator+cms:clinical_reviewer",
		"editor@psi.ro=cms:editor",
	].join(";"),
	() => undefined,
);

async function decide(email: string, source: { brand: Brand; kind: string }) {
	const subject = person(email);
	const held = await heldOn(
		(r) => auth.brands(subject, r),
		source.brand,
		approvalRelations(source),
	);
	return decideApproval(subject.userId, source, held);
}

describe("the review gate (authorization through the manifest's relations)", () => {
	it("allows the AI role (ai_operator, also inside cms:ai_admin) on a non-clinical brand", async () => {
		expect(await decide("ops@psi.ro", { brand: "eqsync", kind: "operational" })).toEqual({
			ok: true,
		});
		expect(await decide("admin@psi.ro", { brand: "hemisync", kind: "programme" })).toEqual({
			ok: true,
		});
	});

	it("denies an editor, and the AI role held on another brand only", async () => {
		expect(await decide("editor@psi.ro", { brand: "eqsync", kind: "operational" })).toMatchObject({
			ok: false,
			status: 403,
			missing: ["ai_operator"],
		});
		expect(await decide("eqops@psi.ro", { brand: "hemisync", kind: "operational" })).toMatchObject({
			ok: false,
			status: 403,
		});
		expect(await decide("eqops@psi.ro", { brand: "eqsync", kind: "operational" })).toEqual({
			ok: true,
		});
	});

	it("follows the clinical rule: Psizone (and any clinical source) also needs clinical_review", async () => {
		expect(await decide("ops@psi.ro", { brand: "psizone", kind: "operational" })).toMatchObject({
			ok: false,
			missing: ["clinical_review"],
		});
		expect(await decide("ops@psi.ro", { brand: "eqsync", kind: "clinical" })).toMatchObject({
			ok: false,
		});
		expect(await decide("clin@psi.ro", { brand: "psizone", kind: "operational" })).toEqual({
			ok: true,
		});
	});

	it("refuses a signed-out request", () => {
		expect(decideApproval(null, { brand: "eqsync", kind: "operational" }, new Set())).toMatchObject(
			{
				ok: false,
				status: 401,
			},
		);
	});

	it("auto-approves an uploader who may approve; a new file goes back to pending otherwise", () => {
		const base = {
			scopeChanged: false,
			now: "2026-11-12T00:00:00.000Z",
			actor: { id: "u1", name: "Ana" },
		};
		expect(
			approvalAfterSave({ ...base, previous: null, contentHash: "h1", mayApprove: true }),
		).toMatchObject({
			state: "approved",
			hash: "h1",
			byName: "Ana",
		});
		expect(
			approvalAfterSave({ ...base, previous: null, contentHash: "h1", mayApprove: false }).state,
		).toBe("pending");
		const approved = { state: "approved", hash: "h1", by: "u9", byName: "Ion", at: "x" };
		expect(
			approvalAfterSave({ ...base, previous: approved, contentHash: "h1", mayApprove: false }),
		).toMatchObject({ state: "approved", byName: "Ion" });
		expect(
			approvalAfterSave({ ...base, previous: approved, contentHash: "h2", mayApprove: false })
				.state,
		).toBe("pending");
		expect(
			approvalAfterSave({
				...base,
				previous: approved,
				contentHash: "h1",
				mayApprove: false,
				scopeChanged: true,
			}).state,
		).toBe("pending");
	});
});

describe("URL sources", () => {
	it("fetches https from the brand's domains and the owner's psizone.ro only", () => {
		expect(checkUrl("https://www.hemi-sync.ro/program", "hemisync").hostname).toBe(
			"www.hemi-sync.ro",
		);
		expect(checkUrl("https://psizone.ro/x", "eqsync").hostname).toBe("psizone.ro");
		const refused = (u: string, b: Brand): string => {
			try {
				checkUrl(u, b);
				return "allowed";
			} catch (e) {
				return e instanceof FetchError ? e.problem : "other";
			}
		};
		expect(refused("http://psizone.ro/", "psizone")).toBe("not_https");
		expect(refused("https://eq-sync.ro/", "hemisync")).toBe("not_allowed");
		expect(refused("https://evilpsizone.ro/", "psizone")).toBe("not_allowed");
		expect(refused("https://psizone.ro.evil.com/", "psizone")).toBe("not_allowed");
		expect(refused("https://user:pw@psizone.ro/", "psizone")).toBe("not_allowed");
		expect(refused("https://psizone.ro:8443/", "psizone")).toBe("not_allowed");
	});

	it("checks every redirect hop, and caps the body", async () => {
		const hop: typeof fetch = async (input) => {
			const u = String(input);
			if (u.endsWith("/a"))
				return new Response(null, { status: 302, headers: { location: "https://evil.example/x" } });
			if (u.endsWith("/big")) {
				return new Response("x".repeat(10), {
					headers: { "content-type": "text/plain", "content-length": "999999999" },
				});
			}
			return new Response("<h1>Program</h1><p>Luni</p>", {
				headers: { "content-type": "text/html" },
			});
		};
		await expect(fetchSource("https://psizone.ro/a", "psizone", hop)).rejects.toMatchObject({
			problem: "not_allowed",
		});
		await expect(fetchSource("https://psizone.ro/big", "psizone", hop)).rejects.toMatchObject({
			problem: "too_large",
		});
		const ok = await fetchSource("https://psizone.ro/program", "psizone", hop);
		expect([ok.format, new TextDecoder().decode(ok.bytes)]).toEqual([
			"html",
			"<h1>Program</h1><p>Luni</p>",
		]);
	});
});
