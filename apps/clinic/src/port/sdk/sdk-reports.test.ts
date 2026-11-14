import { type RunningApi, startApi } from "@psi/scheduling-api/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PortError } from "../port";
import { ReportSchema } from "../report-schema";
import { createSdkPort } from "./index";

let api: RunningApi;
beforeAll(async () => {
	api = await startApi();
});
afterAll(async () => {
	await api.close();
});

const as = async (subject: string) =>
	createSdkPort({ baseUrl: api.url, bearer: () => api.tokenFor(subject) });

const ask = {
	from: "2026-11-01",
	to: "2026-11-30",
	compare: { from: "2026-10-01", to: "2026-10-31" },
} as const;

describe("statistics from the service's reports", () => {
	it("answers the screen's whole report, valid against its own schema, for the period and the one before it", async () => {
		const report = await (await as("olga")).report("psizone", ask);
		expect(ReportSchema.safeParse(report).success).toBe(true);
		expect(report.current.from).toBe("2026-11-01");
		expect(report.previous?.to).toBe("2026-10-31");
		expect(report.current.byDay).toHaveLength(30);
		expect(report.current.heat).toHaveLength(7);
		// The populated clinic has a visit in that month: what the calendar shows is what the report counts.
		expect(report.current.appointments).toBeGreaterThan(0);
		expect(report.current.byPerson.map((p) => p.name)).toContain("Dora Test");
	});

	it("asks for no comparison when none is wanted", async () => {
		const { compare: _drop, ...alone } = ask;
		expect((await (await as("olga")).report("psizone", alone)).previous).toBeNull();
	});

	it("narrows to one person, whose clients the service cannot split, so those say so", async () => {
		const port = await as("olga");
		const columns = await port.columns("psizone");
		const dora = columns.find((c) => c.name === "Dora Test");
		if (dora === undefined) throw new Error("the populated clinic has no Dora");
		const whole = await port.report("psizone", { from: ask.from, to: ask.to });
		const one = await port.report("psizone", { from: ask.from, to: ask.to, personId: dora.id });
		expect(one.current.appointments).toBeLessThanOrEqual(whole.current.appointments);
		expect(one.current.newClients).toBeNull();
		expect(one.current.returningClients).toBeNull();
		expect(whole.current.newClients).not.toBeNull();
	});

	it("never gives money to someone without the money group, and still answers the rest", async () => {
		// A receptionist holds no report at all (403), or holds the counts and no revenue: never revenue.
		try {
			const report = await (await as("rita")).report("psizone", { from: ask.from, to: ask.to });
			expect(report.current.revenueBani).toBeNull();
		} catch (error) {
			expect(error).toBeInstanceOf(PortError);
			expect(error instanceof PortError ? error.code : "").toBe("forbidden");
		}
	});

	it("refuses a stranger", async () => {
		const error = await (await as("mallory"))
			.report("psizone", { from: ask.from, to: ask.to })
			.catch((e: unknown) => e);
		expect(error).toBeInstanceOf(PortError);
	});

	it("refuses a period longer than a year and a day, answering nothing from part of it", async () => {
		const error = await (await as("olga"))
			.report("psizone", { from: "2024-01-01", to: "2026-11-30" })
			.catch((e: unknown) => e);
		expect(error).toBeInstanceOf(PortError);
		expect(error instanceof PortError ? error.code : "").toBe("invalid");
	});
});
