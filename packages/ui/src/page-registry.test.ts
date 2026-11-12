import { createPageResolver } from "@psi/guide";
import { describe, expect, it } from "vitest";
import { createPageRegistry, readRenderedPage } from "./page-registry";

const HTML = `<!doctype html><html><head><title>Contact &amp; programări — Psizone</title>
<meta name="description" content="Cum ne găsești &amp; cum programezi."></head><body>
<nav><a>Meniu</a></nav>
<main><h1>Contact</h1><p>Sunăm noi.</p>
<h2>Telefon</h2><p>0748 017 752</p><ul><li>luni</li><li>marți</li></ul>
<h2>Formular</h2><form><input name="x"></form><p>Lasă datele.</p><script>alert(1)</script>
</main><footer>Subsol</footer></body></html>`;

describe("reading a rendered page", () => {
	it("takes the h1, the description and the h2 headings, and the text by section when allowed", () => {
		const page = readRenderedPage(HTML, "/contact", true);
		expect(page).toMatchObject({
			title: "Contact",
			path: "/contact",
			lead: "Cum ne găsești & cum programezi.",
			headings: ["Telefon", "Formular"],
		});
		expect(page?.sections).toEqual([
			{ text: "Sunăm noi." },
			{ heading: "Telefon", text: "0748 017 752\nluni\nmarți" },
			{ heading: "Formular", text: "Lasă datele." },
		]);
	});

	it("leaves the text out unless the site says the page is not clinical", () => {
		expect(readRenderedPage(HTML, "/contact", false)?.sections).toBeUndefined();
	});

	it("falls back to the document title, and gives nothing for a page without one", () => {
		expect(
			readRenderedPage("<title>Doar titlu</title><main><p>x</p></main>", "/x", false)?.title,
		).toBe("Doar titlu");
		expect(readRenderedPage("<main><p>x</p></main>", "/x", false)).toBeUndefined();
	});

	it("never carries script text", () => {
		expect(JSON.stringify(readRenderedPage(HTML, "/contact", true))).not.toContain("alert");
	});
});

describe("the registry", () => {
	function registry(withText: boolean) {
		const calls: string[] = [];
		const reg = createPageRegistry({ withText: () => withText });
		reg.connect((path) => {
			calls.push(path);
			return new Response(path === "/gone" ? "no" : HTML, {
				status: path === "/gone" ? 404 : 200,
				headers: { "content-type": "text/html; charset=utf-8" },
			});
		});
		return { reg, calls };
	}

	it("reads a page once, then answers from memory", async () => {
		const { reg, calls } = registry(true);
		await reg.ensure("/contact");
		await reg.ensure("/contact");
		expect(calls).toEqual(["/contact"]);
		expect(reg.lookup("/contact")?.title).toBe("Contact");
	});

	it("knows nothing of a missing page, a staff or account path, or a path that is not plain", async () => {
		const { reg, calls } = registry(true);
		for (const p of [
			"/gone",
			"/__admin/compass",
			"/cont",
			"/en/ghid",
			"https://evil.example/",
			"//x",
		]) {
			await reg.ensure(p);
			expect(reg.lookup(p), p).toBeUndefined();
		}
		expect(calls).toEqual(["/gone"]);
	});

	it("does nothing before it is connected", async () => {
		const reg = createPageRegistry({ withText: () => true });
		await reg.ensure("/contact");
		expect(reg.lookup("/contact")).toBeUndefined();
	});

	it("gives a resolver every page it renders: lead and headings always, text only where allowed", async () => {
		for (const withText of [true, false]) {
			const { reg } = registry(withText);
			await reg.ensure("/contact");
			const resolve = createPageResolver({ brand: "psizone", rendered: reg.lookup });
			const page = resolve({ path: "/contact" }, "ro", "ce telefon aveți?");
			expect(page).toMatchObject({
				title: "Contact",
				status: "published",
				headings: ["Telefon", "Formular"],
			});
			expect(page?.excerpt !== undefined).toBe(withText);
			expect(page?.clinical).toBe(false);
		}
	});

	it("a forged typed target gets no page from the rendered ones", async () => {
		const { reg } = registry(true);
		await reg.ensure("/contact");
		const resolve = createPageResolver({ brand: "psizone", rendered: reg.lookup });
		expect(
			resolve({ path: "/contact", target: { kind: "hub", id: "nu-exista" } }, "ro", "x"),
		).toBeUndefined();
	});
});
