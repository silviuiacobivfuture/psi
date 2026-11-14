import { afterEach, describe, expect, it } from "vitest";
import { deviceLabel } from "../device";
import { hoursSummary } from "../profile/hours";
import { type Console, MEMBER, startConsole } from "./harness";

let c: Console;
afterEach(() => c.close());

const open = async (roles: string[] = ["owner"], fake = {}): Promise<void> => {
	c = await startConsole(MEMBER, fake, { [MEMBER.sub]: [{ app: "psizone", roles }] });
	await c.signIn();
};

describe("Profilul meu", () => {
	it("is in the account menu of everyone and shows the person's real name, e-mail and roles", async () => {
		for (const role of ["owner", "reception", "therapist", "accountant"]) {
			await open([role]);
			expect(await (await c.get("/calendar")).text()).toContain('href="/me/profile"');
			const html = await (await c.get("/me/profile")).text();
			expect(html).toContain("Ana Test");
			expect(html).toContain("ana@psizone.test");
			expect(html).toContain("Psizone:");
			await c.close();
		}
	});

	it("keeps the name and e-mail read-only, with the way to change them at the sign-in", async () => {
		await open();
		const html = await (await c.get("/me/profile")).text();
		expect(html).toContain("https://sso.example.test/if/user/#/settings");
		expect(html).not.toMatch(/<input[^>]*name="(name|email)"/);
	});

	it("saves the phone, and says no to what is not a phone, writing nothing", async () => {
		await open();
		const form = { "content-type": "application/x-www-form-urlencoded" };
		const bad = await c.post("/me/profile/phone", "phone=%3Cscript%3E", form);
		expect(await bad.text()).toContain("Scrie un număr de telefon");
		expect((await c.port.profile("psizone", MEMBER.sub)).phone).toBeNull();
		const ok = await c.post("/me/profile/phone", "phone=0700%20000%20123", form);
		expect(await ok.text()).toContain("Telefonul a fost salvat.");
		expect((await c.port.profile("psizone", MEMBER.sub)).phone).toBe("0700 000 123");
		await c.post("/me/profile/phone", "phone=", form);
		expect((await c.port.profile("psizone", MEMBER.sub)).phone).toBeNull();
	});

	it("leads to Setările mele for the notifications, and a form posted from an older page lands there", async () => {
		await open();
		const html = await (await c.get("/me/profile")).text();
		expect(html).toContain('href="/me/settings#notif"');
		expect(html).toContain("Alege notificările");
		expect(html).not.toContain('action="/me/profile/notifications"');
		const form = { "content-type": "application/x-www-form-urlencoded" };
		await c.post("/me/profile/notifications", "n.requests.push=on", form);
		const saved = await c.port.mySettings("psizone", MEMBER.sub);
		expect(saved.stored).toBe(true);
		expect(saved.notifications.requests).toEqual({ email: false, push: true });
	});

	it("lists the person's own feedback, and the browsers with the way out of all of them", async () => {
		await open();
		await c.port.saveProfile("psizone", MEMBER.sub, { phone: null });
		const html = await (await c.get("/me/profile")).text();
		expect(html).toContain("Deconectează-mă de peste tot");
		expect(html).toContain("Acest dispozitiv");
		expect(html).toContain("Aș vrea să văd în calendar");
		expect(html).toContain("Cu răspuns");
	});

	it("a therapist sees their calendar column; the others have none", async () => {
		await open(["therapist"]);
		expect(await (await c.get("/me/profile")).text()).toContain("Terapeut Alfa");
		await c.close();
		await open(["reception"]);
		expect(await (await c.get("/me/profile")).text()).not.toContain("Calendarul meu");
	});

	it("says 'în curând' in the section the service cannot serve, and the rest still works", async () => {
		await open();
		const { PortError } = await import("../port/port");
		const real = c.port.myFeedback;
		c.port.myFeedback = () => Promise.reject(new PortError("unavailable", "no"));
		const html = await (await c.get("/me/profile")).text();
		c.port.myFeedback = real;
		expect(html).toContain("În curând");
		expect(html).toContain("Contul meu");
		expect(html).not.toContain("Cu răspuns");
	});

	it("a write while looking at the app as someone else is refused", async () => {
		await open();
		await c.post("/view-as", "as=role%3Areception&label=Recep%C8%9Bie", {
			"content-type": "application/x-www-form-urlencoded",
		});
		const res = await c.post("/me/profile/phone", "phone=0700", {
			"content-type": "application/x-www-form-urlencoded",
		});
		expect(res.status).toBe(403);
		expect((await c.port.profile("psizone", MEMBER.sub)).phone).toBeNull();
	});
});

describe("what the profile says in words", () => {
	it("names a browser and a system from a User-Agent, and nothing it does not know", () => {
		expect(
			deviceLabel(
				"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
				"pe",
			),
		).toBe("Chrome pe Linux");
		expect(
			deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Version/17.0 Safari/604.1", "pe"),
		).toBe("Safari pe iPhone");
		expect(deviceLabel(undefined, "pe")).toBe("");
		expect(deviceLabel("curl/8", "pe")).toBe("");
	});
	it("joins the days that share hours into one phrase and leaves leave out", () => {
		const day = (date: string, kind: "work" | "leave", from: number | null, to: number | null) => ({
			personId: "p",
			date,
			kind,
			fromMin: from,
			toMin: to,
		});
		expect(
			hoursSummary(
				[
					day("2026-11-16", "work", 540, 1020),
					day("2026-11-17", "work", 540, 1020),
					day("2026-11-18", "work", 600, 840),
					day("2026-11-19", "leave", null, null),
				],
				"ro",
			),
		).toBe("lun., mar. 09:00–17:00 · mie. 10:00–14:00");
		expect(hoursSummary([], "ro")).toBe("");
	});
});
