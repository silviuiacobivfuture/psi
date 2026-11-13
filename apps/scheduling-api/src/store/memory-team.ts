import {
	type Collection,
	type CollectionName,
	type Rows,
	StoreConflict,
	StoreRefused,
} from "./types";

type Collections = { [K in CollectionName]: Collection<Rows[K]> };

/**
 * The rules the Convex wrappers enforce INSIDE the store for the team and its log, applied to the in-memory
 * collections so the two adapters answer the same (the contract suite runs on both):
 * - a role's name is unique within its app; a role someone holds is not removed (`in_use`);
 * - a member holds roles that exist (`unknown_role`) and coordinates practitioners that exist (`unknown_practitioner`);
 * - the audit log is append-only: an event is neither replaced nor removed (`not_allowed`).
 */
export function applyTeamRules(c: Collections): void {
	const { roles, members, audit } = c;
	const insertRole = roles.insert.bind(roles);
	const replaceRole = roles.replace.bind(roles);
	const removeRole = roles.remove.bind(roles);

	const nameTaken = async (app: string, name: string, except?: string): Promise<boolean> =>
		(await roles.list(app)).some((r) => r.name === name && r.id !== except);

	roles.insert = async (row) => {
		if (await nameTaken(row.app, row.name)) throw new StoreConflict(`${row.name} exists`);
		return insertRole(row);
	};
	roles.replace = async (row) => {
		if ((await roles.get(row.app, row.id)) === undefined) return false;
		if (await nameTaken(row.app, row.name, row.id)) throw new StoreConflict(`${row.name} exists`);
		return replaceRole(row);
	};
	roles.remove = async (app, id) => {
		const held = (await members.list(app)).some((m) => m.roles.includes(id));
		if (held) throw new StoreRefused("in_use");
		return removeRole(app, id);
	};

	const checkMember = async (row: Rows["members"]): Promise<void> => {
		for (const role of row.roles)
			if ((await roles.get(row.app, role)) === undefined) throw new StoreRefused("unknown_role");
		for (const person of row.coordinates) {
			const found = await c.people.get(row.app, person);
			if (found?.kind !== "practitioner") throw new StoreRefused("unknown_practitioner");
		}
	};
	const insertMember = members.insert.bind(members);
	const replaceMember = members.replace.bind(members);
	members.insert = async (row) => {
		await checkMember(row);
		return insertMember(row);
	};
	members.replace = async (row) => {
		if ((await members.get(row.app, row.id)) === undefined) return false;
		await checkMember(row);
		return replaceMember(row);
	};

	audit.replace = () => Promise.reject(new StoreRefused("not_allowed"));
	audit.remove = () => Promise.reject(new StoreRefused("not_allowed"));
}
