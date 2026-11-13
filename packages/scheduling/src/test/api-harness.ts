import { expect } from "vitest";
import { z } from "zod";
import { runQuery } from "./admin";
import { callMutation, callQuery } from "./server";

/** Shared by the wrapper tests: the call helper that proves a refusal writes nothing and a write is audited. */
export const DAY = 86_400_000;
export const HOUR = 3_600_000;
export const actor = { subject: "sub-test" };
export const enc = { keyVersion: 1, iv: "aXY=", data: "ZGF0YQ==" };
export const result = z.record(z.string(), z.unknown());
export const n = (c: Record<string, number>, k: string): number => c[k] ?? 0;
export const id = (o: Record<string, unknown>): string => z.string().parse(o.id);
const WRONG = "x".repeat(40);

export function harness(prefix: string) {
	const TENANT = `test-${prefix}-${Date.now().toString(36)}`;
	const counts = () =>
		runQuery("clinicInspect:counts", { tenant: TENANT }, z.record(z.string(), z.number()));
	async function run(
		kind: "mutation" | "query",
		name: string,
		args: Record<string, unknown>,
		expected: { audit?: number; ok?: boolean; same?: boolean } = {},
	): Promise<Record<string, unknown>> {
		const call = kind === "mutation" ? callMutation : callQuery;
		const before = await counts();
		await expect(call(name, { tenant: TENANT, ...args }, null)).rejects.toThrow();
		await expect(call(name, { tenant: TENANT, ...args }, WRONG)).rejects.toThrow();
		expect(await counts(), `${name} without the key wrote something`).toEqual(before);
		const out = result.parse(await call(name, { tenant: TENANT, ...args }));
		const after = await counts();
		const audit = expected.audit ?? (kind === "mutation" ? 1 : 0);
		expect(n(after, "auditEvents") - n(before, "auditEvents"), `${name} audit events`).toBe(audit);
		// A refusal that says `same` wrote nothing at all, in any table of the app.
		if (expected.same === true) expect(after, `${name} wrote something`).toEqual(before);
		if (expected.ok !== false) expect(out.ok, `${name}: ${JSON.stringify(out)}`).toBe(true);
		else expect(out.ok).toBe(false);
		return out;
	}
	return {
		TENANT,
		counts,
		mut: (
			name: string,
			args: Record<string, unknown>,
			e?: { audit?: number; ok?: boolean; same?: boolean },
		) => run("mutation", name, { actor, ...args }, e),
		/** A mutation no staff member makes (the online gates): no actor. */
		sys: (
			name: string,
			args: Record<string, unknown>,
			e?: { audit?: number; ok?: boolean; same?: boolean },
		) => run("mutation", name, args, e),
		qry: (
			name: string,
			args: Record<string, unknown>,
			e?: { audit?: number; ok?: boolean; same?: boolean },
		) => run("query", name, args, e),
	};
}
