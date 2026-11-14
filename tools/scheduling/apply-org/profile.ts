import { randomBytes } from "node:crypto";
import { withActor } from "@psi/scheduling-api/store-actor";
import type { StorePort } from "@psi/scheduling-api/store-types";
import { OrgProfile, type OrgProfileType } from "@psi/scheduling-sdk/contract";

/** What a run does to the contact profile: write it (with the fields it fills in), or leave it as the owners have it. */
export type ProfileStep =
	| { kind: "save"; revision: number; next: OrgProfileType; fields: string[] }
	| { kind: "keep"; revision: number };

const filled = (v: unknown): boolean => v !== undefined && !(Array.isArray(v) && v.length === 0);

/**
 * The seed's contact profile under what the store already holds: every field the owners have set is theirs and stays;
 * the seed only fills what is unset (the address field by field). A second run, or a profile the owners completed,
 * writes nothing. The result is checked against the contract, so a seed the service would refuse never reaches it.
 */
export function planProfile(
	seed: OrgProfileType,
	stored: { revision: number; body: string } | undefined,
): ProfileStep {
	const revision = stored?.revision ?? 0;
	const held: OrgProfileType =
		stored === undefined ? { phones: [], hours: [] } : OrgProfile.parse(JSON.parse(stored.body));
	const address = { ...seed.address, ...held.address };
	const merged: Record<string, unknown> = { ...held };
	const fields: string[] = [];
	for (const [key, value] of Object.entries(seed)) {
		if (key === "address") continue;
		if (filled(value) && !filled(merged[key])) {
			merged[key] = value;
			fields.push(key);
		}
	}
	if (Object.keys(address).length > 0) {
		if (JSON.stringify(address) !== JSON.stringify(held.address ?? {})) fields.push("address");
		merged.address = address;
	}
	if (fields.length === 0) return { kind: "keep", revision };
	return { kind: "save", revision, next: OrgProfile.parse(merged), fields: fields.sort() };
}

/**
 * Fills the stored contact profile from the seed (see `planProfile`), as `actor`, and journals it like the service's
 * own save (`org.profile`, the names of the fields filled, never their values). A dry run writes nothing.
 */
export async function applyProfile(input: {
	store: StorePort;
	app: string;
	seed: OrgProfileType;
	actor: string;
	dryRun: boolean;
	now: number;
}): Promise<ProfileStep> {
	const { store, app, actor } = input;
	const step = planProfile(input.seed, await store.docs.get(app, "org_profile"));
	if (step.kind === "keep" || input.dryRun) return step;
	const saved = await withActor(actor, () =>
		store.docs.put(app, "org_profile", step.revision, JSON.stringify(step.next)),
	);
	await store.c.audit.insert({
		id: `e${randomBytes(8).toString("hex")}`,
		app,
		at: input.now,
		actor: { subject: actor, kind: "service" },
		action: "org.profile",
		target: { type: "sched_app", id: app },
		detail: { revision: saved.revision, fields: step.fields },
	});
	return { ...step, revision: saved.revision };
}
