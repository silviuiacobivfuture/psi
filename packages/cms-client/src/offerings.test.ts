import { describe, expect, it } from "vitest";
import {
	createOfferingsClient,
	formatPrice,
	offeringFromPayload,
	type PriceLabels,
} from "./offerings";
import { handleRevalidate, SIGNATURE_HEADER, signRevalidation } from "./revalidate";

const both = (ro: string, en: string) => ({ ro, en });
const raw = (patch: Record<string, unknown> = {}) => ({
	brand: "eqsync",
	slug: "sedinta-1-1",
	kind: "service",
	title: both("Ședință 1:1", "1:1 session"),
	summary: null,
	price: { mode: "fixed", amount: 250, currency: "RON" },
	priceNote: null,
	validFrom: "2026-12-01T00:00:00.000Z",
	sortOrder: 2,
	demo: false,
	...patch,
});
const ro: PriceLabels = {
	fixed: (a) => `${a} lei`,
	range: (f, t) => `${f}–${t} lei`,
	from: (a) => `de la ${a} lei`,
	onRequest: "la cerere",
};

describe("offerings: the CMS → sites price contract", () => {
	it("maps a fixed price and the validity day", () => {
		expect(offeringFromPayload(raw())).toMatchObject({
			price: { mode: "fixed", amount: 250, currency: "RON" },
			validFrom: "2026-12-01",
		});
	});
	it.each([
		["a range upside down", { mode: "range", from: 500, to: 300 }],
		["a fixed price without an amount", { mode: "fixed" }],
		["another currency", { mode: "fixed", amount: 10, currency: "EUR" }],
		["a negative price", { mode: "from", from: -1 }],
	])("refuses %s", (_n, price) => {
		expect(offeringFromPayload(raw({ price }))).toBeNull();
	});
	it("refuses a title in one language only", () => {
		expect(offeringFromPayload(raw({ title: { ro: "Doar" } }))).toBeNull();
	});
	it("formats every mode with the site's words", () => {
		expect(formatPrice({ mode: "fixed", amount: 1200, currency: "RON" }, "ro", ro)).toBe(
			"1.200 lei",
		);
		expect(formatPrice({ mode: "range", from: 800, to: 1200, currency: "RON" }, "ro", ro)).toBe(
			"800–1.200 lei",
		);
		expect(formatPrice({ mode: "from", from: 300, currency: "RON" }, "ro", ro)).toBe(
			"de la 300 lei",
		);
		expect(formatPrice({ mode: "on_request" }, "ro", ro)).toBe("la cerere");
	});
});

describe("createOfferingsClient", () => {
	function client(docs: unknown[], includeDemo = false) {
		let t = 0;
		let calls = 0;
		const fake: typeof fetch = async (url) => {
			calls++;
			expect(new URL(String(url)).searchParams.get("where[_status][equals]")).toBe("published");
			return Response.json({ docs });
		};
		const c = createOfferingsClient({
			cmsUrl: "http://cms.test",
			includeDemo,
			fetch: fake,
			now: () => t,
		});
		return { c, tick: (ms: number) => (t += ms), calls: () => calls };
	}
	it("is empty until the CMS answered (the page keeps its placeholder), then sorted per brand", async () => {
		const s = client([
			raw({ slug: "b", sortOrder: 2 }),
			raw({ slug: "a", sortOrder: 1 }),
			raw({ brand: "psizone" }),
		]);
		expect(s.c.offeringsFor("eqsync", "ro")).toEqual([]);
		await s.c.refresh();
		expect(s.c.offeringsFor("eqsync", "en").map((x) => [x.slug, x.title])).toEqual([
			["a", "1:1 session"],
			["b", "1:1 session"],
		]);
	});
	it("hides demonstration entries unless asked to show them", async () => {
		const prod = client([raw({ demo: true })]);
		await prod.c.refresh();
		expect(prod.c.offeringsFor("eqsync", "ro")).toEqual([]);
		const local = client([raw({ demo: true })], true);
		await local.c.refresh();
		expect(local.c.offeringsFor("eqsync", "ro")).toHaveLength(1);
	});
	it("refreshes in the background after 60 s, not before", async () => {
		const s = client([raw()]);
		await s.c.refresh();
		s.c.offeringsFor("eqsync", "ro");
		expect(s.calls()).toBe(1);
		s.tick(61_000);
		s.c.offeringsFor("eqsync", "ro");
		expect(s.calls()).toBe(2);
	});
	it("is revalidated by the same webhook", async () => {
		const SECRET = "r".repeat(32);
		const seen: string[] = [];
		const { body, signature } = signRevalidation(
			{
				kind: "offerings",
				event: "publish",
				id: "3",
				slug: "club",
				brand: "hemisync",
				sentAt: new Date().toISOString(),
			},
			SECRET,
		);
		const r = await handleRevalidate(
			new Request("http://x/__cms/revalidate", {
				method: "POST",
				body,
				headers: { [SIGNATURE_HEADER]: signature },
			}),
			SECRET,
			{ offerings: (e) => void seen.push(e.slug ?? "") },
		);
		expect([r.status, seen]).toEqual([204, ["club"]]);
	});
});
