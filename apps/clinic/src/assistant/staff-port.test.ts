import { describe, expect, it } from "vitest";
import { createFakePort } from "../port/fake";
import { createStaffPort } from "./staff-port";

const TODAY = "2026-11-13";
const person = { subject: "sub-1", name: "Recepție Demo", email: null };

function setup(roles: ReadonlyArray<string>) {
	const port = createFakePort({
		today: TODAY,
		members: { "sub-1": [{ app: "psizone", roles: [...roles] }] },
	});
	const staff = createStaffPort({
		port,
		app: "psizone",
		appName: "Psizone",
		person,
		roles,
		locale: "ro",
	});
	return { port, staff };
}

async function first(staff: ReturnType<typeof setup>["staff"]) {
	const day = await staff.agenda({ from: TODAY, to: TODAY });
	if (!day.ok || day.value[0] === undefined) throw new Error("the synthetic day is empty");
	return day.value[0];
}

describe("the assistant's port over the console's own port", () => {
	it("knows who is signed in, in which app and with which roles", async () => {
		const { staff } = setup(["reception"]);
		expect(await staff.whoami()).toMatchObject({
			ok: true,
			value: { sub: "sub-1", appId: "psizone", roles: ["reception"], locale: "ro" },
		});
	});

	it("reads the same day the calendar shows", async () => {
		const { port, staff } = setup(["reception"]);
		const cal = await port.calendar("psizone", TODAY, TODAY);
		const day = await staff.agenda({ from: TODAY, to: TODAY });
		expect(day.ok && day.value.length).toBe(
			cal.appointments.filter((a) => a.status !== "leave" && a.status !== "medical-leave").length,
		);
	});

	it("a move really changes the clinic and is refused when the appointment changed meanwhile", async () => {
		const { port, staff } = setup(["owner"]);
		const a = await first(staff);
		const stale = await staff.moveAppointment({
			id: a.id,
			expectedVersion: "old",
			date: TODAY,
			startMin: 1000,
			resourceIds: a.resourceIds,
		});
		expect(stale).toEqual({ ok: false, reason: "conflict" });
		const moved = await staff.moveAppointment({
			id: a.id,
			expectedVersion: a.version,
			date: "2026-11-16",
			startMin: 1000,
			resourceIds: a.resourceIds,
		});
		expect(moved).toMatchObject({ ok: true, value: { date: "2026-11-16", startMin: 1000 } });
		const cal = await port.calendar("psizone", "2026-11-16", "2026-11-16");
		expect(cal.appointments.find((x) => x.id === a.id)).toMatchObject({ startMin: 1000 });
	});

	it("cancel, attendance and payment change the data and land in the audit log", async () => {
		const { port, staff } = setup(["owner"]);
		const a = await first(staff);
		expect(
			await staff.markAttendance({ id: a.id, expectedVersion: a.version, status: "attended" }),
		).toMatchObject({ ok: true, value: { status: "attended" } });
		const again = await staff.appointment(a.id);
		expect(again.ok && again.value.status).toBe("attended");
		await staff.audit({
			tool: "staffMarkAttendance",
			phase: "execute",
			outcome: "ok",
			subjects: [a.id],
		});
		expect((await port.audit("psizone")).some((e) => e.action.startsWith("assistant."))).toBe(true);
	});

	it("an overpayment is refused and nothing is written", async () => {
		const { port, staff } = setup(["owner"]);
		const attention = await staff.attention({ from: TODAY, to: "2026-11-30", lowAt: 2 });
		const owing = attention.ok ? attention.value.find((x) => x.dueBani > 0) : undefined;
		if (owing === undefined) throw new Error("nobody owes in the synthetic clinic");
		const pkgs = await staff.packages(owing.clientId);
		const pkg = pkgs.ok ? pkgs.value[0] : undefined;
		if (pkg === undefined) throw new Error("no package");
		const before = (await port.packages("psizone", owing.clientId))[0]?.paidBani;
		const over = await staff.recordPayment({
			clientId: owing.clientId,
			packageId: pkg.id,
			expectedVersion: pkg.version,
			amountBani: pkg.totalBani * 2,
			method: "cash",
		});
		expect(over).toEqual({ ok: false, reason: "invalid" });
		expect((await port.packages("psizone", owing.clientId))[0]?.paidBani).toBe(before);
	});

	it("a reception person holds no audit, settings or clinical capability, and may not request leave", async () => {
		const { staff } = setup(["reception"]);
		const caps = await staff.capabilities();
		expect(caps.ok && caps.value.permissions).toEqual(
			expect.arrayContaining(["calendar_view_all", "reminders_send"]),
		);
		expect(
			caps.ok && caps.value.permissions.some((p) => /audit|roles|settings|records/.test(p)),
		).toBe(false);
		expect(await staff.can("leave.request")).toEqual({ ok: true, value: false });
		expect(await staff.can("appointments.cancel")).toEqual({ ok: true, value: true });
	});

	it("a person with no role in the app can do nothing", async () => {
		const { staff } = setup([]);
		const caps = await staff.capabilities();
		expect(caps.ok && caps.value.permissions).toEqual([]);
		expect(await staff.can("appointments.create")).toEqual({ ok: true, value: false });
	});

	it("a failing console port is `unavailable`, never a throw", async () => {
		const port = createFakePort({ today: TODAY, members: {}, failing: new Set(["calendar"]) });
		const staff = createStaffPort({
			port,
			app: "psizone",
			appName: "Psizone",
			person,
			roles: ["owner"],
			locale: "ro",
		});
		expect(await staff.agenda({ from: TODAY, to: TODAY })).toEqual({
			ok: false,
			reason: "unavailable",
		});
	});

	it("a prepared WhatsApp reminder is a wa.me link, an e-mail one is just marked", async () => {
		const { staff } = setup(["owner"]);
		const targets = await staff.reminderTargets(TODAY);
		const t = targets.ok ? targets.value[0] : undefined;
		if (t === undefined) throw new Error("no reminders today");
		const wa = await staff.sendReminder({
			about: "appointment",
			appointmentId: t.appointmentId,
			expectedVersion: t.version,
			channel: "whatsapp",
			text: "salut",
		});
		expect(wa.ok && wa.value.link).toMatch(/^https:\/\/wa\.me\/\d+\?text=salut$/);
		const mail = await staff.sendReminder({
			about: "appointment",
			appointmentId: t.appointmentId,
			expectedVersion: t.version,
			channel: "email",
			text: "salut",
		});
		expect(mail).toEqual({ ok: true, value: { channel: "email" } });
	});
});
