import { afterEach, describe, expect, it } from "vitest";
import { type Console, MEMBER, startConsole } from "./harness";

let c: Console;
afterEach(() => c.close());

const open = async (roles: string[] = ["owner"]): Promise<void> => {
	c = await startConsole(
		MEMBER,
		{ today: "2026-11-16" },
		{ [MEMBER.sub]: [{ app: "psizone", roles }] },
	);
	await c.signIn();
};
const form = { "content-type": "application/x-www-form-urlencoded" };
const post = (values: Record<string, string>): Promise<Response> =>
	c.post("/settings/profile", new URLSearchParams(values), form);
const stored = () => c.port.orgProfile("psizone");

/** A whole form: every field, a noon break on Monday, Saturday morning, two phones (the second labelled). */
const FULL: Record<string, string> = {
	revision: "0",
	legalName: "Centrul Psizone SRL",
	cui: "RO123456",
	logoUrl: "https://example.test/logo.svg",
	street: "Str. General Alexandru Cernat nr. 126",
	city: "Galați",
	county: "Galați",
	postalCode: "800001",
	mapUrl: "https://maps.example.test/?q=Galați",
	phone1_number: "0748 017 752",
	phone1_label: "",
	phone2_number: "0752 466 792",
	phone2_label: "Recepție",
	phone3_number: "",
	phone3_label: "",
	email: "contact@example.test",
	website: "https://example.test",
	mon_open1: "09:00",
	mon_close1: "13:00",
	mon_open2: "14:00",
	mon_close2: "20:00",
	sat_open1: "10:00",
	sat_close1: "14:00",
	hoursNote: "Sâmbăta doar cu programare",
};

describe("Profil organizație: the page", () => {
	it("an owner sees an empty profile to fill in: every field, the seven days, the save button", async () => {
		await open();
		const res = await c.get("/settings/profile");
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain('data-action="org.profile"');
		expect(html).toContain('name="revision" value="0"');
		for (const name of Object.keys(FULL).filter(
			(k) => !k.includes("_open2") && !k.includes("_close2"),
		))
			if (!/^(mon|sat)_/.test(name)) expect(html, name).toContain(`name="${name}"`);
		for (const day of ["mon", "tue", "wed", "thu", "fri", "sat", "sun"])
			expect(html, day).toContain(`data-day="${day}"`);
		for (const label of ["Luni", "Duminică", "Program", "Adresă", "CUI"])
			expect(html).toContain(label);
		expect(html).toContain("Salvează datele organizației");
		expect(html).not.toContain("readonly");
		expect(html).not.toContain("data-updated");
	});

	it("saves the whole profile, says so, and shows it back from the service", async () => {
		await open();
		const res = await post(FULL);
		expect(res.status).toBe(200);
		const html = await res.text();
		expect(html).toContain('data-notice="saved"');
		expect(html).toContain('name="revision" value="1"');
		expect(html).toContain('value="Str. General Alexandru Cernat nr. 126"');
		expect(html).toContain('value="Recepție"');
		expect(html).toContain("data-updated");
		const held = await stored();
		expect(held.revision).toBe(1);
		expect(held.profile).toEqual({
			legalName: "Centrul Psizone SRL",
			cui: "RO123456",
			logoUrl: "https://example.test/logo.svg",
			address: {
				street: "Str. General Alexandru Cernat nr. 126",
				city: "Galați",
				county: "Galați",
				postalCode: "800001",
			},
			mapUrl: "https://maps.example.test/?q=Galați",
			phones: [{ number: "0748 017 752" }, { number: "0752 466 792", label: "Recepție" }],
			email: "contact@example.test",
			website: "https://example.test",
			hours: [
				{
					day: "mon",
					spans: [
						{ open: "09:00", close: "13:00" },
						{ open: "14:00", close: "20:00" },
					],
				},
				{ day: "sat", spans: [{ open: "10:00", close: "14:00" }] },
			],
			hoursNote: "Sâmbăta doar cu programare",
		});
	});

	it("emptying a field takes it off the profile; an empty form saves an empty profile", async () => {
		await open();
		await post(FULL);
		await post({
			...FULL,
			revision: "1",
			cui: "",
			email: "",
			phone2_number: "",
			sat_open1: "",
			sat_close1: "",
		});
		const held = await stored();
		expect(held.profile).not.toHaveProperty("cui");
		expect(held.profile).not.toHaveProperty("email");
		expect(held.profile.phones).toEqual([{ number: "0748 017 752" }]);
		expect(held.profile.hours.map((d) => d.day)).toEqual(["mon"]);
		await post({ revision: "2" });
		expect((await stored()).profile).toEqual({ phones: [], hours: [] });
	});

	const bad: [string, Record<string, string>][] = [
		["an e-mail that is not one", { email: "not-an-email" }],
		["a website over http", { website: "http://example.test" }],
		["a postal code of five digits", { postalCode: "80000" }],
		["a CUI with letters", { cui: "ABC" }],
		["a day that closes before it opens", { mon_open1: "13:00", mon_close1: "09:00" }],
		["a stretch with one time only", { tue_open1: "09:00" }],
		["overlapping stretches", { mon_open2: "12:00" }],
		["a phone of letters", { phone1_number: "sunați-ne" }],
	];
	it.each(
		bad,
	)("%s is refused: the form comes back with what was typed, nothing saved", async (_n, over) => {
		await open();
		const res = await post({ ...FULL, ...over });
		expect(res.status).toBe(400);
		const html = await res.text();
		expect(html).toContain('data-notice="invalid"');
		for (const v of Object.values(over)) expect(html).toContain(`value="${v}"`);
		expect((await stored()).revision).toBe(0);
	});

	it("a save from a revision someone else moved past is refused and shows what is stored now", async () => {
		await open();
		await post(FULL);
		const res = await post({ ...FULL, revision: "0", legalName: "Altceva SRL" });
		expect(res.status).toBe(409);
		const html = await res.text();
		expect(html).toContain('data-notice="stale"');
		expect(html).toContain('value="Centrul Psizone SRL"');
		expect((await stored()).profile.legalName).toBe("Centrul Psizone SRL");
	});

	it("a role that may see the settings but not edit them reads the profile, cannot change it", async () => {
		await open(["reception"]);
		const reception = (await c.port.roles("psizone")).find((r) => r.id === "reception");
		if (reception === undefined) throw new Error("no reception role");
		await c.port.saveRole("psizone", {
			...reception,
			grants: { ...reception.grants, settings: { view: "all" } },
		});
		const page = await c.get("/settings/profile");
		expect(page.status).toBe(200);
		const html = await page.text();
		expect(html).toContain("readonly");
		expect(html).not.toContain("Salvează datele organizației");
		const res = await post(FULL);
		expect(res.status).toBe(403);
		expect((await stored()).revision).toBe(0);
	});

	it("a role with no settings at all is refused the page and the save", async () => {
		await open(["therapist"]);
		expect((await c.get("/settings/profile")).status).toBe(403);
		expect((await post(FULL)).status).toBe(403);
		expect((await stored()).revision).toBe(0);
	});

	it("the save is in the journal, as the organisation's contact details", async () => {
		await open();
		await post(FULL);
		const events = await c.port.audit("psizone");
		expect(events.some((e) => e.action === "org.profile")).toBe(true);
		const journal = await (await c.get("/settings/audit")).text();
		expect(journal).toContain("Datele de contact ale organizației modificate");
	});

	it("in English, the page speaks English", async () => {
		await open();
		await c.post(
			"/me/settings",
			new URLSearchParams({ locale: "en", theme: "system", calendarView: "day" }),
			form,
		);
		const html = await (await c.get("/settings/profile")).text();
		for (const label of ["Opening hours", "Monday", "Postal code", "Save the organisation"])
			expect(html).toContain(label);
	});
});
