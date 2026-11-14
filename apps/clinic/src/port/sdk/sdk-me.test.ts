import { type RunningApi, startApi } from "@psi/scheduling-api/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PortError } from "../port";
import { DEFAULT_SETTINGS } from "../schema-settings";
import { createSdkPort } from "./index";

let api: RunningApi;
beforeAll(async () => {
	api = await startApi();
});
afterAll(async () => {
	await api.close();
});

/** The port as a person of the populated clinic: the service sees THEIR token, so these are always their own. */
const as = async (subject: string) =>
	createSdkPort({ baseUrl: api.url, bearer: () => api.tokenFor(subject) });
const refusal = async (run: () => Promise<unknown>): Promise<PortError> => {
	try {
		await run();
	} catch (error) {
		if (error instanceof PortError) return error;
		throw error;
	}
	throw new Error("expected a refusal");
};

describe("a person's own settings and notifications, through the service", () => {
	it("my settings: the defaults until saved, then the saved set, each person's own", async () => {
		const olga = await as("olga");
		expect(await olga.mySettings("psizone", "olga")).toEqual({
			...DEFAULT_SETTINGS,
			stored: false,
		});
		const wanted = {
			...DEFAULT_SETTINGS,
			locale: "en" as const,
			calendarView: "week" as const,
		};
		expect(await olga.saveMySettings("psizone", "olga", wanted)).toEqual({
			...wanted,
			stored: true,
		});
		expect(await olga.mySettings("psizone", "olga")).toEqual({ ...wanted, stored: true });
		// The subject argument is not what decides: the token is Rita's, so these are Rita's.
		expect((await (await as("rita")).mySettings("psizone", "olga")).stored).toBe(false);
	});
	it("my settings: a set the contract refuses is `invalid`, and nothing is stored", async () => {
		const port = await as("dora");
		const refused = await refusal(() =>
			port.saveMySettings("psizone", "dora", {
				...DEFAULT_SETTINGS,
				calendarView: "year" as "day",
			}),
		);
		expect(refused.code).toBe("invalid");
		expect((await port.mySettings("psizone", "dora")).stored).toBe(false);
	});
	it("my notifications: the service's kinds, a saved switch read back, a locked one refused with nothing saved", async () => {
		const port = await as("dora");
		const first = await port.myNotifications("psizone", "dora");
		expect(first.prefs).toEqual({ channels: {}, quietHours: null });
		expect(first.kinds.map((k) => k.kind)).toContain("appointments");
		const quiet = { start: "21:00", end: "07:00", timeZone: "Europe/Bucharest" };
		const saved = await port.saveMyNotifications("psizone", "dora", {
			channels: { appointments: { push: false } },
			quietHours: quiet,
		});
		expect(saved.prefs.channels.appointments).toEqual({ push: false });
		expect((await port.myNotifications("psizone", "dora")).prefs.quietHours).toEqual(quiet);
		// The security notices stay in the console whatever is chosen.
		expect(first.kinds.find((k) => k.kind === "security")?.locked).toEqual(["in_app"]);
		const refused = await refusal(() =>
			port.saveMyNotifications("psizone", "dora", {
				channels: { security: { in_app: false } },
				quietHours: null,
			}),
		);
		expect(refused.code).toBe("invalid");
		expect((await port.myNotifications("psizone", "dora")).prefs.quietHours).toEqual(quiet);
		// The token decides whose: Rita's choices are untouched.
		expect((await (await as("rita")).myNotifications("psizone", "dora")).prefs.channels).toEqual(
			{},
		);
	});
});
