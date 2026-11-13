import { type AuditAction, type AuditEntity, makeAuditEvent } from "../src/clinic/audit";
import type { ChangeKind } from "../src/clinic/changes";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { logChange } from "./changeLog";

/**
 * What the server-keyed clinic wrappers share. Every wrapper demands the server key, takes the
 * acting subject, checks that what it touches belongs to the app, and (for a write) bumps the
 * version, appends one audit event (action, entity, field names: no content) and one change-log
 * entry. Ciphertext goes in and out untouched: nothing here decrypts.
 */
export const REFUSED = (reason: string) => ({ ok: false as const, reason });

type Owned =
	| "clients"
	| "visits"
	| "packages"
	| "payments"
	| "rosterDays"
	| "staffBlocks"
	| "formResponses"
	| "files"
	| "roles"
	| "devices"
	| "groupActivities"
	| "staffMembers"
	| "practitioners"
	| "rooms"
	| "formDefinitions"
	| "customFieldDefs"
	| "builderDefs"
	| "blacklistEntries";

/** A row of the app by the id the caller holds, or null when it is not an id of that table or belongs to another app. */
export async function owned<T extends Owned>(
	ctx: QueryCtx,
	table: T,
	tenant: string,
	id: string,
): Promise<Doc<T> | null> {
	const normal = ctx.db.normalizeId(table, id);
	if (normal === null) return null;
	const row = await ctx.db.get(normal);
	return row !== null && row.tenant === tenant ? row : null;
}

export interface Recorded {
	tenant: string;
	actor: string;
	action: AuditAction;
	entity: AuditEntity;
	entityId: string;
	kind: ChangeKind;
	version: number;
	fields?: ReadonlyArray<string>;
}

/** The audit event and the change-log entry of one write. */
export async function record(ctx: MutationCtx, r: Recorded): Promise<void> {
	const made = makeAuditEvent({
		tenant: r.tenant,
		at: Date.now(),
		actor: r.actor,
		action: r.action,
		entity: r.entity,
		entityId: r.entityId,
		...(r.fields === undefined ? {} : { fields: [...r.fields] }),
	});
	if (!made.ok) throw new Error(`audit event refused: ${made.problems.join(",")}`);
	const e = made.event;
	await ctx.db.insert("auditEvents", {
		tenant: e.tenant,
		at: e.at,
		actor: e.actor,
		action: e.action,
		entity: e.entity,
		entityId: e.entityId,
		summary: e.summary,
	});
	await logChange(ctx, r.tenant, r.kind, r.entityId, r.version);
}

/** Refuses a stale write: the caller read version `expected`, the row is at another. */
export function stale(current: number | undefined, expected: number | undefined): boolean {
	return expected !== undefined && (current ?? 0) !== expected;
}

export type { Id, TableNames };
