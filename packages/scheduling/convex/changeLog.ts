import { CHANGE_KINDS, type ChangeKind } from "../src/clinic/changes";
import type { MutationCtx } from "./_generated/server";

/** Appends one entry to the app's change log. Content-free: a kind, an id and a version. */
export async function logChange(
	ctx: MutationCtx,
	tenant: string,
	kind: ChangeKind,
	entityId: string,
	version: number,
): Promise<void> {
	await ctx.db.insert("changeLog", { tenant, kind, entityId, at: Date.now(), version });
}

/** The change kind of each clinic table the import writes. */
export function kindOfTable(table: string): ChangeKind | undefined {
	const map: Record<string, ChangeKind> = {
		practitioners: "person",
		staffMembers: "person",
		devices: "device",
		rooms: "room",
		groupActivities: "group",
		clients: "client",
		visits: "visit",
		packages: "package",
		payments: "payment",
		rosterDays: "roster",
		staffBlocks: "staff_block",
		formResponses: "record",
		files: "file",
	};
	return map[table];
}

export { CHANGE_KINDS };
