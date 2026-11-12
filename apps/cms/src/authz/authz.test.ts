import { describe, expect, it } from "vitest";
import { withBreakGlass } from "./index";
import { interimAuthorizer, parseAssignments } from "./interim";
import { ROLES } from "./manifest";
import { openFgaAuthorizer } from "./openfga";
import type { Subject } from "./types";

const person = (email: string, groups: string[] = [], sub: string | null = "s1"): Subject => ({
	userId: "1",
	sub,
	email,
	groups,
});

describe("the manifest's roles", () => {
	it("are the four editorial roles, the reader and the AI administrator", () => {
		expect([...ROLES.keys()].sort()).toEqual([
			"cms:admin",
			"cms:ai_admin",
			"cms:clinical_reviewer",
			"cms:editor",
			"cms:publisher",
			"cms:reader",
		]);
	});
	it("never let an editor publish or review", () => {
		const editor = ROLES.get("cms:editor");
		expect(editor?.has("publish")).toBe(false);
		expect(editor?.has("clinical_review")).toBe(false);
		expect(ROLES.get("cms:clinical_reviewer")?.has("write")).toBe(false);
	});
});

describe("interim authorizer", () => {
	const a = interimAuthorizer(
		"ana@psizone.ro=cms:editor@eqsync;dr@psizone.ro=cms:clinical_reviewer;group:app-cms-ai-admin=cms:ai_admin@blog",
	);
	it("scopes a brand-bound role to its brand: an EQ-SYNC editor never reads Psizone", async () => {
		expect(await a.brands(person("Ana@Psizone.ro"), "read")).toEqual(["eqsync"]);
		expect(await a.brands(person("ana@psizone.ro"), "publish")).toEqual([]);
	});
	it("grants a platform role on every brand", async () => {
		expect(await a.brands(person("dr@psizone.ro"), "clinical_review")).toEqual([
			"psizone",
			"eqsync",
			"hemisync",
			"blog",
		]);
	});
	it("binds directory groups, mirrored at sign-in", async () => {
		expect(await a.brands(person("x@psizone.ro", ["app-cms-ai-admin"]), "ai_admin")).toEqual([
			"blog",
		]);
		expect(await a.brands(person("x@psizone.ro"), "ai_admin")).toEqual([]);
	});
	it("grants nothing to anyone unlisted", async () => {
		expect(await a.brands(person("nobody@psizone.ro"), "read")).toEqual([]);
	});
	it.each([
		["an unknown role", "a@b.ro=cms:owner"],
		["an unknown brand", "a@b.ro=cms:editor@acme"],
		["no e-mail", "ana=cms:editor"],
		["no role", "a@b.ro"],
	])("refuses %s", (_why, raw) => {
		expect(() => parseAssignments(raw)).toThrow("CMS_ROLE_ASSIGNMENTS");
	});
});

describe("OpenFGA authorizer", () => {
	it("asks list-objects for user:<sub> and keeps the known brands", async () => {
		const asked: unknown[] = [];
		const fake: typeof fetch = async (url, init) => {
			expect(String(url)).toBe("http://fga.test/stores/st/list-objects");
			expect(new Headers(init?.headers).get("authorization")).toBe("Bearer tok");
			asked.push(JSON.parse(String(init?.body)));
			return Response.json({ objects: ["cms_brand:eqsync", "cms_brand:acme", "other:psizone"] });
		};
		const a = openFgaAuthorizer({
			apiUrl: "http://fga.test",
			storeId: "st",
			token: "tok",
			fetch: fake,
		});
		expect(await a.brands(person("a@b.ro"), "write")).toEqual(["eqsync"]);
		expect(asked).toEqual([{ type: "cms_brand", relation: "write", user: "user:s1" }]);
	});
	it("fails closed: an error or an unknown answer grants nothing", async () => {
		const errors: string[] = [];
		const down: typeof fetch = async () => new Response("no", { status: 503 });
		const a = openFgaAuthorizer({
			apiUrl: "http://fga.test",
			storeId: "st",
			token: "t",
			fetch: down,
			onError: (m) => errors.push(m),
		});
		expect(await a.brands(person("a@b.ro"), "read")).toEqual([]);
		expect(errors[0]).toContain("503");
	});
	it("knows nobody without a directory subject (break-glass)", async () => {
		const never: typeof fetch = async () => {
			throw new Error("must not be called");
		};
		const a = openFgaAuthorizer({ apiUrl: "http://f", storeId: "s", token: "t", fetch: never });
		expect(await a.brands(person("b@b.ro", [], null), "read")).toEqual([]);
	});
});

describe("break-glass", () => {
	const none = withBreakGlass(interimAuthorizer(""), "Break@Psizone.ro");
	it("lets the local break-glass account in with no bindings at all", async () => {
		expect(await none.brands(person("break@psizone.ro", [], null), "admin")).toHaveLength(4);
	});
	it("does not extend to a directory account with the same e-mail", async () => {
		expect(await none.brands(person("break@psizone.ro", [], "sub-1"), "admin")).toEqual([]);
	});
});
