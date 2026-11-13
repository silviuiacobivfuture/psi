import { getFunctionName } from "convex/server";
import { z } from "zod";
import { internal } from "../../convex/_generated/api";
import type { AdminClient } from "../../src/admin-client";
import { type WrappedKey, wrappedKeySchema } from "../../src/crypto";
import type {
	BlockRow,
	ClientRow,
	DeviceRow,
	FileRow,
	GroupRow,
	PackageRow,
	PaymentRow,
	PractitionerRow,
	ResponseRow,
	RoomRow,
	RosterRow,
	StaffRow,
	VisitRow,
} from "./rows";

/** Where the import writes: the real store (admin key) or, in tests, memory. */

export interface RowsByKind {
	practitioners: PractitionerRow;
	devices: DeviceRow;
	rooms: RoomRow;
	groups: GroupRow;
	staff: StaffRow;
	clients: ClientRow;
	packages: PackageRow;
	visits: VisitRow;
	payments: PaymentRow;
	roster: RosterRow;
	blocks: BlockRow;
	responses: ResponseRow;
	files: FileRow;
}
export type Kind = keyof RowsByKind;

/** Dependency order: a row may point only at rows written before it. */
export const WRITE_ORDER: ReadonlyArray<Kind> = [
	"practitioners",
	"devices",
	"rooms",
	"groups",
	"staff",
	"clients",
	"packages",
	"visits",
	"payments",
	"roster",
	"blocks",
	"responses",
	"files",
];

export const resultSchema = z.object({
	legacyId: z.string(),
	id: z.string().optional(),
	outcome: z.enum(["created", "updated", "unchanged", "orphan"]),
	flag: z.string().optional(),
});
export type UpsertResult = z.infer<typeof resultSchema>;

export interface AppSpec {
	slug: string;
	name: string;
	kind: "clinic" | "club";
	address?: string;
}

export interface ImportSink {
	ensureApp(app: AppSpec): Promise<void>;
	keys(tenant: string): Promise<WrappedKey[]>;
	installKey(tenant: string, version: number, wrapped: WrappedKey): Promise<void>;
	upsert<K extends Kind>(
		tenant: string,
		kind: K,
		rows: ReadonlyArray<RowsByKind[K]>,
	): Promise<UpsertResult[]>;
	knownFiles(tenant: string, legacyIds: ReadonlyArray<string>): Promise<Map<string, string>>;
	/** The slugs already in the app's practitioners, rooms, devices and group activities. */
	slugs(
		tenant: string,
	): Promise<Array<{ kind: SlugKind; slug: string; legacyId: string | undefined }>>;
}

export type SlugKind = "practitioners" | "rooms" | "devices" | "groups";

const FUNCTION: Record<Kind, string> = {
	practitioners: getFunctionName(internal.importPeople.upsertPractitioners),
	devices: getFunctionName(internal.importPeople.upsertDevices),
	rooms: getFunctionName(internal.importPeople.upsertRooms),
	groups: getFunctionName(internal.importPeople.upsertGroups),
	staff: getFunctionName(internal.importPeople.upsertStaff),
	clients: getFunctionName(internal.importClients.upsertClients),
	packages: getFunctionName(internal.importMoney.upsertPackages),
	visits: getFunctionName(internal.importVisits.upsertVisits),
	payments: getFunctionName(internal.importMoney.upsertPayments),
	roster: getFunctionName(internal.importRoster.upsertRosterDays),
	blocks: getFunctionName(internal.importRoster.upsertStaffBlocks),
	responses: getFunctionName(internal.importRecords.upsertResponses),
	files: getFunctionName(internal.importRecords.upsertFiles),
};

export const BATCH = 200;

/** The real sink: internal Convex functions over the admin key. Batches are small; answers carry old ids only. */
export function createConvexSink(admin: AdminClient): ImportSink {
	return {
		async ensureApp(app) {
			await admin.mutation(
				getFunctionName(internal.clinicApps.ensureApp),
				{
					slug: app.slug,
					name: app.name,
					kind: app.kind,
					defaultLocale: "ro",
					currency: "RON",
					...(app.address === undefined ? {} : { address: app.address }),
				},
				z.object({ created: z.boolean(), rolesAdded: z.number(), formsAdded: z.number() }),
			);
		},
		keys: async (tenant) =>
			(
				await admin.query(
					getFunctionName(internal.clinicKeys.list),
					{ tenant },
					z.array(z.object({ version: z.number(), wrapped: wrappedKeySchema })),
				)
			).map((k) => k.wrapped),
		async installKey(tenant, version, wrapped) {
			await admin.mutation(
				getFunctionName(internal.clinicKeys.install),
				{ tenant, version, wrapped },
				z.enum(["installed", "exists"]),
			);
		},
		async upsert(tenant, kind, rows) {
			const out: UpsertResult[] = [];
			for (let i = 0; i < rows.length; i += BATCH) {
				const batch = rows.slice(i, i + BATCH);
				out.push(
					...(await admin.mutation(FUNCTION[kind], { tenant, rows: batch }, z.array(resultSchema))),
				);
			}
			return out;
		},
		async slugs(tenant) {
			const found = await admin.query(
				getFunctionName(internal.clinicInspect.slugs),
				{ tenant },
				z.array(
					z.object({
						kind: z.enum(["practitioners", "rooms", "devices", "groups"]),
						slug: z.string(),
						legacyId: z.string().optional(),
					}),
				),
			);
			return found.map((f) => ({ kind: f.kind, slug: f.slug, legacyId: f.legacyId }));
		},
		async knownFiles(tenant, legacyIds) {
			const known = new Map<string, string>();
			for (let i = 0; i < legacyIds.length; i += BATCH) {
				const found = await admin.query(
					getFunctionName(internal.importRecords.knownFiles),
					{ tenant, legacyIds: legacyIds.slice(i, i + BATCH) },
					z.array(z.object({ legacyId: z.string(), fingerprint: z.string() })),
				);
				for (const f of found) known.set(f.legacyId, f.fingerprint);
			}
			return known;
		},
	};
}
