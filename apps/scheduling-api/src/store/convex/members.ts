import { z } from "zod";
import { type Collection, type MemberRow, StoreConflict, StoreRefused } from "../types";
import { actorArg, type Caller } from "./call";
import { matches } from "./filter";
import { personApiId, personRef, toConvexId } from "./ids";

/**
 * `members`: a member's id IS their subject. The profile (name, e-mail), the whole set of roles and the whole set of
 * coordinated practitioners are one write (`apiMembersExtra:putMember`, one audit event); personal grants and denials are
 * another (`setOverrides`). A person with no role is still a member. Coordinators are practitioners: a person id of
 * another kind is refused. Roles come back in no particular order; the service never depends on it.
 */
const Stored = z.object({
	subject: z.string(),
	displayName: z.string(),
	email: z.string().optional(),
	roles: z.array(z.string()),
	coordinates: z.array(z.string()),
	grants: z.array(z.string()),
	denies: z.array(z.string()),
	createdAt: z.number(),
	updatedAt: z.number(),
});
type Stored = z.infer<typeof Stored>;

const toRow = (app: string, m: Stored): MemberRow => ({
	id: m.subject,
	app,
	subject: m.subject,
	displayName: m.displayName,
	...(m.email === undefined ? {} : { email: m.email }),
	roles: m.roles,
	coordinates: m.coordinates.map((p) => personApiId("practitioner", p)),
	grants: [...m.grants].sort(),
	denies: [...m.denies].sort(),
	createdAt: m.createdAt,
	updatedAt: m.updatedAt,
});

function practitionerIds(apiIds: readonly string[]): string[] {
	return apiIds.map((id) => {
		const ref = personRef(id);
		if (ref?.kind !== "practitioner") throw new StoreRefused("unknown_practitioner");
		return ref.id;
	});
}
function roleIds(apiIds: readonly string[]): string[] {
	return apiIds.map((id) => {
		const convex = toConvexId(id);
		if (convex === undefined) throw new StoreRefused("unknown_role");
		return convex;
	});
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
	a.length === b.length && a.every((x) => b.includes(x));

export function membersCollection(call: Caller): Collection<MemberRow> {
	const one = async (app: string, subject: string): Promise<MemberRow | undefined> => {
		try {
			const out = await call.query(
				"apiMembersExtra:member",
				{ tenant: app, subject },
				{ member: Stored },
			);
			return toRow(app, out.member);
		} catch (error) {
			if (error instanceof StoreRefused && error.reason === "not_found") return undefined;
			throw error;
		}
	};
	const writeProfile = (row: MemberRow) =>
		call.mutate(
			"apiMembersExtra:putMember",
			{
				tenant: row.app,
				actor: actorArg(),
				subject: row.subject,
				displayName: row.displayName,
				...(row.email === undefined ? {} : { email: row.email }),
				roles: roleIds(row.roles),
				coordinators: practitionerIds(row.coordinates),
			},
			{ changed: z.boolean(), created: z.boolean() },
		);
	const writeOverrides = (row: MemberRow) =>
		call.mutate(
			"apiMembersExtra:setOverrides",
			{
				tenant: row.app,
				actor: actorArg(),
				subject: row.subject,
				grants: row.grants,
				denies: row.denies,
			},
			{ changed: z.boolean() },
		);
	return {
		get: (app, id) => one(app, id),
		async list(app, query) {
			const out = await call.query(
				"apiMembersExtra:members",
				{ tenant: app },
				{ members: z.array(Stored) },
			);
			return out.members.map((m) => toRow(app, m)).filter((m) => matches(m, query));
		},
		async insert(row) {
			if ((await one(row.app, row.subject)) !== undefined)
				throw new StoreConflict(`${row.id} exists`);
			await writeProfile({ ...row, id: row.subject });
			if (row.grants.length > 0 || row.denies.length > 0) await writeOverrides(row);
			return (await one(row.app, row.subject)) ?? row;
		},
		async replace(row) {
			const held = await one(row.app, row.subject);
			if (held === undefined) return false;
			if (
				held.displayName !== row.displayName ||
				held.email !== row.email ||
				!sameSet(held.roles, row.roles) ||
				!sameSet(held.coordinates, row.coordinates)
			)
				await writeProfile(row);
			if (!sameSet(held.grants, row.grants) || !sameSet(held.denies, row.denies))
				await writeOverrides(row);
			return true;
		},
		async remove(app, id) {
			try {
				await call.mutate(
					"apiMembersExtra:removeMember",
					{ tenant: app, actor: actorArg(), subject: id },
					{},
				);
				return true;
			} catch (error) {
				if (error instanceof StoreRefused && error.reason === "not_found") return false;
				throw error;
			}
		},
	};
}

/** The apps a person is a member of, with the ids of their roles there. */
export async function appsOfSubject(
	call: Caller,
	subject: string,
): Promise<{ app: string; roles: string[] }[]> {
	const out = await call.query(
		"apiMembersExtra:appsOf",
		{ subject },
		{ apps: z.array(z.object({ app: z.string(), roles: z.array(z.string()) })) },
	);
	return out.apps;
}
