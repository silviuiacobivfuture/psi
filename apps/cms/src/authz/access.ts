import type { Access, FieldAccess, PayloadRequest, Where } from "payload";
import { z } from "zod";
import { authorizer } from "./index";
import { BRANDS, type Brand, type Relation, type Subject } from "./types";

/**
 * Payload access functions, all answered by the authorizer (ported from the stopped CMS slice,
 * adapted to upstream's users: `sub` from the directory, none for break-glass). Answers are
 * memoised per request: Payload calls access many times while rendering one admin view.
 */

const UserShape = z.object({
	id: z.union([z.number(), z.string()]),
	email: z.string().min(1),
	sub: z.string().min(1).nullish(),
	directoryGroups: z.array(z.string()).nullish(),
	collection: z.literal("users").optional(),
});

/** The signed-in person as the authorizer sees them, or null for an anonymous request. */
export function subjectOf(user: unknown): Subject | null {
	const r = UserShape.safeParse(user);
	if (!r.success) return null;
	return {
		userId: String(r.data.id),
		sub: r.data.sub ?? null,
		email: r.data.email,
		groups: r.data.directoryGroups ?? [],
	};
}

const memo = new WeakMap<object, Map<string, Promise<Brand[]>>>();

/** Brands on which the request's person holds `relation`; [] when anonymous. */
export function brandsFor(req: PayloadRequest, relation: Relation): Promise<Brand[]> {
	const subject = subjectOf(req.user);
	if (subject === null) return Promise.resolve([]);
	let perReq = memo.get(req);
	if (perReq === undefined) {
		perReq = new Map();
		memo.set(req, perReq);
	}
	const key = `${subject.userId}:${relation}`;
	const hit = perReq.get(key);
	if (hit !== undefined) return hit;
	const pending = authorizer().brands(subject, relation);
	perReq.set(key, pending);
	return pending;
}

export async function can(req: PayloadRequest, relation: Relation, brand: Brand): Promise<boolean> {
	return (await brandsFor(req, relation)).includes(brand);
}

const BrandValue = z.enum(BRANDS);

/**
 * The rows a person may touch, as a Where on the collection's own brand values (`values`: the
 * field's select options). Only brands the field can hold are named — a brand outside its enum
 * (e.g. `blog` on articles) would make Postgres refuse the whole query — and `true` (no filter)
 * only when the person holds every value the field can hold. A retired brand is never granted
 * (`withoutRetired`), so its rows stay filtered out.
 */
export function brandWhere(
	brands: ReadonlyArray<Brand>,
	values: ReadonlyArray<string>,
	field = "brand",
): Where | boolean {
	const held = values.filter((v) => brands.some((b) => b === v));
	if (held.length === 0) return false;
	if (held.length === values.length) return true;
	return { [field]: { in: held } };
}

const signedInUser = (req: PayloadRequest): boolean => req.user !== null && req.user !== undefined;

/**
 * The brand-scoped access rules of a collection whose `brand` select holds `values`.
 * Anonymous: published only. Signed in: every brand the person may read (drafts included).
 * Versions hold drafts: never anonymous, and only on brands the person may read (Payload's
 * default would show every brand's drafts to anyone signed in).
 */
export function brandAccess(values: ReadonlyArray<string>): {
	read: Access;
	readVersions: Access;
	create: Access;
	update: Access;
	delete: Access;
} {
	return {
		read: async ({ req }) => {
			if (!signedInUser(req)) return { _status: { equals: "published" } };
			return brandWhere(await brandsFor(req, "read"), values);
		},
		readVersions: async ({ req }) => {
			if (!signedInUser(req)) return false;
			return brandWhere(await brandsFor(req, "read"), values, "version.brand");
		},
		// Create: `write` on the brand being created (any of its brands while the form is empty).
		create: async ({ req, data }) => {
			const parsed = z.object({ brand: BrandValue }).safeParse(data);
			if (parsed.success) return can(req, "write", parsed.data.brand);
			return brandWhere(await brandsFor(req, "write"), values) !== false;
		},
		update: async ({ req }) => brandWhere(await brandsFor(req, "write"), values),
		delete: async ({ req }) => brandWhere(await brandsFor(req, "admin"), values),
	};
}

/** Field level: internal identifiers and reviewer notes are for signed-in people only. */
export const signedInOnly: FieldAccess = ({ req }) => signedInUser(req);

/** Field level: written by the server alone (the review endpoints, hooks). */
export const serverOnly = { create: (): boolean => false, update: (): boolean => false };

/** The admin panel opens for anyone who may read at least one brand. */
export async function mayEnterAdmin(req: PayloadRequest): Promise<boolean> {
	return (await brandsFor(req, "read")).length > 0;
}

/** Signed-in people who may read anything: the review trail, the people, the analytics. */
export const readers: Access = async ({ req }) => mayEnterAdmin(req);

/** Media: public to read (it is published on the sites); managing it needs `manage_media`. */
export const manageMedia: Access = async ({ req }) =>
	(await brandsFor(req, "manage_media")).length > 0;

/** People (authors, reviewers): editors keep them; admins remove them. */
export const writeAnywhere: Access = async ({ req }) => (await brandsFor(req, "write")).length > 0;
export const adminAnywhere: Access = async ({ req }) => (await brandsFor(req, "admin")).length > 0;

/** Users: a person sees their own row; `admin` anywhere sees and manages every row. */
export const usersRead: Access = async ({ req }) => {
	const subject = subjectOf(req.user);
	if (subject === null) return false;
	if ((await brandsFor(req, "admin")).length > 0) return true;
	return { id: { equals: subject.userId } };
};
