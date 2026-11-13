import { z } from "zod";
import { runMutation } from "./admin";
import { harness, id } from "./api-harness";

/** Two throwaway apps, a few synthetic clients, and the helpers the backend suites of the blacklist and feedback share. */
export function clinicWorld(prefix: string) {
	const a = harness(prefix);
	const b = harness(`${prefix}2`);
	const ids: Record<string, string> = {};
	const state = { practitioner: "" };
	const ref = (key: string): string => {
		const found = ids[key];
		if (found === undefined) throw new Error(`no id ${key}`);
		return found;
	};
	const person = { kind: "adult", consent: { contact: true, reminders: true } };

	async function setup(): Promise<void> {
		for (const t of [a.TENANT, b.TENANT]) {
			const made = await runMutation(
				"seed:fixture",
				{ tenant: t },
				z.object({ practitioner: z.string() }),
			);
			if (t === a.TENANT) state.practitioner = made.practitioner;
		}
		ids.ana = id(
			await a.mut("apiClients:create", {
				client: { ...person, name: "Test Ana", phone: "0700 000 001", email: "Ana@Test.example" },
			}),
		);
		ids.child = id(
			await a.mut("apiClients:create", {
				client: {
					...person,
					kind: "child",
					name: "Test Child",
					guardian: { name: "Test Guardian", phone: "0700 000 003" },
				},
			}),
		);
		ids.ion = id(
			await a.mut("apiClients:create", {
				client: { ...person, name: "Test Ion", phone: "0700 000 002" },
			}),
		);
	}

	async function teardown(): Promise<void> {
		for (const t of [a.TENANT, b.TENANT])
			await runMutation("seed:dropFixture", { tenant: t }, z.unknown());
	}

	const flag = (extra: Record<string, unknown>, limit?: string) =>
		a.mut("apiBlacklist:create", {
			entry: { reason: "a reason", category: "other", severity: "warn", ...extra },
			...(limit === undefined ? {} : { limit }),
		});

	/** A client no entry names, with a phone of its own. */
	const freeClient = async (): Promise<string> =>
		id(
			await a.mut("apiClients:create", {
				client: { ...person, name: "Test Free", phone: "0700 555 555" },
			}),
		);

	return { a, b, ids, ref, state, setup, teardown, flag, freeClient, person };
}
