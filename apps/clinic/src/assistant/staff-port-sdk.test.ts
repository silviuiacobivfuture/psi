import { type RunningApi, startApi } from "@psi/scheduling-api/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSdkPort } from "../port/sdk";
import { createStaffPort } from "./staff-port";

/** The assistant's port over the console's real SDK port and the real service: windows the service refuses show here. */
let api: RunningApi;
beforeAll(async () => {
	api = await startApi();
});
afterAll(async () => {
	await api.close();
});

async function staffAs(subject: string) {
	const port = createSdkPort({ baseUrl: api.url, bearer: () => api.tokenFor(subject) });
	const me = await port.capabilities(subject, "psizone");
	return createStaffPort({
		port,
		app: "psizone",
		appName: "Psizone",
		person: { subject, name: subject, email: null },
		roles: me.roles,
		permissions: Object.keys(me.permissions),
		readOnly: false,
		locale: "ro",
	});
}

describe("the assistant's reads over the real service", () => {
	it("lists the bookings of a period (it reads every appointment there is, in a window the service accepts)", async () => {
		const staff = await staffAs("olga");
		const found = await staff.bookings({ from: "2026-01-01", to: "2026-12-31", limit: 100 });
		expect(found.ok).toBe(true);
	});

	it("finds an appointment by id across every date", async () => {
		const staff = await staffAs("olga");
		const day = await staff.agenda({ from: "2026-11-13", to: "2026-11-14" });
		if (!day.ok || day.value[0] === undefined) throw new Error("the populated clinic has a visit");
		const found = await staff.appointment(day.value[0].id);
		expect(found.ok).toBe(true);
	});
});
