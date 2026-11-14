import { afterEach, describe, expect, it } from "vitest";
import { type Console, MEMBER, startConsole } from "./harness";

let c: Console;
afterEach(() => c.close());

const open = async (
	roles: string[],
	platformAdmin: boolean,
	hemisync: string[] | null = null,
): Promise<void> => {
	c = await startConsole(MEMBER, platformAdmin ? { platformAdmins: new Set([MEMBER.sub]) } : {}, {
		[MEMBER.sub]: [
			{ app: "psizone", roles },
			...(hemisync === null ? [] : [{ app: "hemisync" as const, roles: hemisync }]),
		],
	});
	await c.signIn();
};

/** The text of the "Rolurile mele" section alone, tags dropped, so an assertion cannot match elsewhere on the page. */
const myRoles = async (): Promise<string> => {
	const html = await (await c.get("/me/profile")).text();
	const start = html.indexOf("data-my-roles");
	expect(start, "the section is on the page").toBeGreaterThan(-1);
	return html
		.slice(start, html.indexOf("</section>", start))
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ");
};

describe("a person sees every role they hold", () => {
	it("the pill names the system's administrator, then every organisation role, highest first", async () => {
		await open(["owner", "admin"], true);
		const html = await (await c.get("/calendar")).text();
		expect(html).toContain("Rol: Administrator sistem · Administrator + Proprietar");
		expect(html).not.toContain("Administrator clinică");
	});

	it("the order is by rank whatever order the roles are held in", async () => {
		await open(["admin", "owner"], true);
		const a = await (await c.get("/calendar")).text();
		await c.close();
		await open(["owner", "admin"], true);
		const b = await (await c.get("/calendar")).text();
		for (const html of [a, b]) expect(html).toContain("Administrator + Proprietar");
	});

	it("Rolurile mele lists the platform role and each organisation's roles, each with what it allows", async () => {
		await open(["owner", "admin"], true, ["reception"]);
		const text = await myRoles();
		expect(text).toContain("Rolurile mele");
		expect(text).toContain("Platformă");
		expect(text).toContain("Administrator sistem");
		expect(text).toContain("Administrează platforma");
		expect(text).toContain("Organizație: Psizone");
		expect(text).toContain("Organizație: Hemi-Sync");
		// Highest first, each with its sentence.
		expect(text.indexOf("Administrator Rolul cel mai înalt")).toBeGreaterThan(-1);
		expect(text.indexOf("Administrator Rolul cel mai înalt")).toBeLessThan(
			text.indexOf("Proprietar Totul în organizație"),
		);
		expect(text).toContain("Recepție Calendarul, clienții");
	});

	it("someone who is not the system's administrator has no platform level, only their organisation's roles", async () => {
		await open(["owner"], false);
		const text = await myRoles();
		expect(text).not.toContain("Platformă");
		expect(text).not.toContain("Administrator sistem");
		expect(text).toContain("Proprietar Totul în organizație");
	});

	it("a role that cannot read the roles list still sees its own role and what it allows", async () => {
		await open(["reception"], false);
		const text = await myRoles();
		expect(text).toContain("Recepție Calendarul, clienții");
		expect(text).toContain("fără date clinice");
	});
});
