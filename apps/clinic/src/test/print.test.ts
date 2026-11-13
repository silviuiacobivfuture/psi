import type { Browser } from "playwright-core";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AXE_RUN, AXE_SOURCE, launch, ViolationsSchema } from "./browser";
import { type Console, MEMBER, startConsole } from "./harness";

let c: Console;
beforeEach(async () => {
	c = await startConsole(MEMBER, { today: "2026-11-16" });
	await c.signIn();
});
afterEach(() => c.close());

const print = async (q: string): Promise<string> =>
	await (await c.get(`/calendar/print?${q}`)).text();

describe("the print page", () => {
	it("a day for every calendar: a table per calendar with full names, full times and the status in words", async () => {
		const html = await print("view=day&date=2026-11-16&scope=all");
		const day = await c.port.calendar("psizone", "2026-11-16", "2026-11-16");
		for (const col of day.columns) expect(html).toContain(col.name);
		const a = day.appointments.find((x) => x.clientId !== null && x.status === "confirmed");
		const name = day.clients.find((x) => x.id === a?.clientId)?.name ?? "";
		expect(html).toContain(name);
		expect(html).toMatch(/\d{2}:\d{2}–\d{2}:\d{2}/);
		expect(html).toContain("Confirmat");
		expect(html).toContain("Tipărit de Ana Test");
		expect(html).toContain("Psizone");
	});
	it("one row per appointment, in time order, and none for an empty hour", async () => {
		const html = await print("view=day&date=2026-11-16&scope=p1");
		const day = await c.port.calendar("psizone", "2026-11-16", "2026-11-16");
		const mine = day.appointments.filter((a) => a.columnId === "p1");
		expect(html.match(/class="prt__time"/g)).toHaveLength(mine.length);
		const times = [...html.matchAll(/class="prt__time">(\d{2}:\d{2})/g)].map((x) => x[1] ?? "");
		expect(times).toEqual([...times].sort());
	});
	it("a week gives each day of the calendar a heading, and leaves out days with nothing", async () => {
		const html = await print("view=week&date=2026-11-16&scope=p1");
		expect(html).toContain("luni, 16 noiembrie");
		expect(html).not.toContain("sâmbătă, 21 noiembrie");
		expect(html).toContain('data-view="week"');
	});
	it("the orientation is chosen by the page: A4 portrait or landscape", async () => {
		expect(await print("orient=landscape")).toContain('data-orient="landscape"');
		expect(await print("orient=portrait")).toContain('data-orient="portrait"');
		expect(await print("orient=sideways")).toContain('data-orient="portrait"');
	});
	it("few calendars on a day make one compact grid", async () => {
		const html = await (async () => {
			const only = await startConsole(
				MEMBER,
				{ today: "2026-11-16" },
				{
					[MEMBER.sub]: [{ app: "hemisync", roles: ["owner"] }],
				},
			);
			await only.signIn();
			const text = await (
				await only.get("/calendar/print?view=day&date=2026-11-16&scope=all")
			).text();
			await only.close();
			return text;
		})();
		expect(html).toContain("prt__grid");
	});
	it("a day with nothing says so instead of printing empty tables", async () => {
		const html = await print("view=day&date=2027-02-02&scope=p1");
		expect(html).toContain("Nicio programare în această perioadă.");
		expect(html).not.toContain("<tbody");
	});
	it("a garbled date, view or scope falls back to today, a day and everything; a note and unicode print", async () => {
		const html = await print("view=zz&date=nope&scope=%3Cb%3E");
		expect(html).not.toContain("<b>");
		expect(html).not.toMatch(/NaN|undefined|Infinity/);
		await c.port.createAppointments("psizone", {
			date: "2027-02-02",
			startMin: 600,
			columnId: "p1",
			clientId: "c1",
			serviceId: "s1",
			note: "Notă ăîâșț 🙂 <i>",
		});
		const withNote = await print("view=day&date=2027-02-02&scope=p1");
		expect(withNote).toContain("Notă ăîâșț 🙂 &lt;i&gt;");
	});
	it("auto=1 opens the print dialog once the page has loaded; without it, no script runs", async () => {
		expect(await print("auto=1")).toContain('addEventListener("load"');
		expect(await print("")).not.toContain('addEventListener("load"');
	});
	it("the calendar's print option opens a sheet with period, calendar, date and page", async () => {
		const html = await (await c.get("/calendar?date=2026-11-16")).text();
		for (const t of [
			"Perioada",
			"Toate calendarele",
			"A4 peisaj",
			'action="/calendar/print"',
			'target="_blank"',
		])
			expect(html).toContain(t);
	});
});

let browser: Browser;
beforeAll(async () => {
	browser = await launch();
});
afterAll(async () => {
	await browser.close();
});

describe("printed, in a real browser", () => {
	it("black on white, text wrapped never cut, no controls, one table per calendar", async () => {
		const { serveConsole } = await import("./harness");
		const live = await serveConsole({ today: "2026-11-16" });
		const context = await browser.newContext({ colorScheme: "dark" });
		const page = await context.newPage();
		await page.goto(`${live.url}/calendar/print?view=day&date=2026-11-16&scope=all`);
		await page.emulateMedia({ media: "print" });
		const facts = await page.evaluate(() => {
			const cs = (e: Element) => getComputedStyle(e);
			const cells = [...document.querySelectorAll(".prt td")];
			return {
				bodyBg: cs(document.body).backgroundColor,
				ink: cs(document.querySelector(".prt") as Element).color,
				ellipsis: cells.some((e) => cs(e).textOverflow === "ellipsis"),
				nowrapText: cells
					.filter((e) => !e.classList.contains("prt__time"))
					.some((e) => cs(e).whiteSpace === "nowrap"),
				button: cs(document.querySelector(".prt__go") as Element).display,
				tables: document.querySelectorAll(".prt table").length,
				overflowX: document.documentElement.scrollWidth - window.innerWidth,
			};
		});
		expect(facts.bodyBg).toBe("rgba(0, 0, 0, 0)");
		const [r = 255, g = 255, b = 255] =
			(/\d+/g.exec.bind(/\d+/g) && facts.ink.match(/\d+/g)?.map(Number)) ?? [];
		expect(Math.max(r, g, b)).toBeLessThan(60);
		expect(facts.ellipsis).toBe(false);
		expect(facts.nowrapText).toBe(false);
		expect(facts.button).toBe("none");
		expect(facts.tables).toBeGreaterThan(1);
		const pdf = await page.pdf({ preferCSSPageSize: true });
		expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
		await context.close();
		await live.close();
	});

	it("the preview is accessible (WCAG 2.2 AA) at 375 and 1280, in both themes", async () => {
		const { serveConsole } = await import("./harness");
		const live = await serveConsole({ today: "2026-11-16" });
		const failures: string[] = [];
		for (const theme of ["light", "dark"] as const)
			for (const width of [375, 1280]) {
				const context = await browser.newContext({
					viewport: { width, height: 800 },
					colorScheme: theme,
				});
				await context.addCookies([{ name: "theme", value: theme, url: live.url }]);
				const page = await context.newPage();
				for (const q of ["view=day&scope=all", "view=week&scope=p1&orient=landscape"]) {
					await page.goto(`${live.url}/calendar/print?date=2026-11-17&${q}`);
					await page.addScriptTag({ path: AXE_SOURCE });
					for (const v of ViolationsSchema.parse(await page.evaluate(AXE_RUN)))
						failures.push(`${theme} ${width} ${q}: ${v.id} ${v.nodes.slice(0, 2).join(" | ")}`);
				}
				await context.close();
			}
		await live.close();
		expect(failures).toEqual([]);
	});
});
