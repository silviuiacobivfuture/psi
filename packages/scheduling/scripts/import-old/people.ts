import { groupLegacy, practitionerLegacy, resourceLegacy } from "./mapping";
import type { DeviceRow, GroupRow, PractitionerRow, RoomRow, StaffRow } from "./rows";
import type { Row } from "./source";
import { type Ctx, clean, fingerprintOf, reportExtraColumns, slugify } from "./support";

/** Practitioners, devices, rooms, group activities and staff: the things the calendar's columns are made of. */

export interface PeopleOut {
	practitioners: PractitionerRow[];
	devices: DeviceRow[];
	rooms: RoomRow[];
	groups: GroupRow[];
	staff: StaffRow[];
	/** Old therapist ids that became practitioners. */
	practitionerIds: Set<number>;
	groupIds: Set<number>;
	/** Old ids of roster-only staff (mapping) and of volunteers. */
	staffIds: Set<number>;
}

const THERAPIST_COLUMNS = new Set([
	"id",
	"name",
	"short_name",
	"specialty",
	"color",
	"bg",
	"days",
	"start_hour",
	"end_hour",
	"is_active",
	"sort_order",
	"created_at",
]);
const GROUP_COLUMNS = new Set([
	"id",
	"name",
	"short_name",
	"color",
	"bg",
	"sort_order",
	"created_at",
]);
const VOLUNTEER_COLUMNS = new Set(["id", "name", "active", "created_at"]);

function minutesOf(value: number | null | undefined): number | undefined {
	return value === null || value === undefined || value < 0 || value > 1440 ? undefined : value;
}

export async function planPeople(
	ctx: Ctx,
	therapists: ReadonlyArray<Row<"therapists">>,
	groupRows: ReadonlyArray<Row<"group_activities">>,
	volunteers: ReadonlyArray<Row<"optimo_volunteers">>,
): Promise<PeopleOut> {
	const out: PeopleOut = {
		practitioners: [],
		devices: [],
		rooms: [],
		groups: [],
		staff: [],
		practitionerIds: new Set(),
		groupIds: new Set(),
		staffIds: new Set(),
	};
	const mapping = ctx.mapping;
	const staffById = new Map(mapping.staff.map((s) => [s.legacyId, s]));
	const resourceSlugOf = new Map(Object.entries(mapping.therapistResources));
	const lookOf = new Map<string, Row<"therapists">>();
	const used = new Set<string>();

	for (const t of therapists) {
		reportExtraColumns(ctx, "therapists", t.id, t, THERAPIST_COLUMNS);
		const slugOfResource = resourceSlugOf.get(String(t.id));
		if (slugOfResource !== undefined) {
			lookOf.set(slugOfResource, t);
			continue;
		}
		if (staffById.has(t.id)) continue;
		const name = clean(t.name) ?? clean(t.short_name);
		if (name === undefined) ctx.log.add("therapist_without_name", "note", `therapists:${t.id}`);
		const base = slugify(clean(t.short_name) ?? name ?? "") || `therapist-${t.id}`;
		let slug = base.length < 2 ? `therapist-${t.id}` : base;
		if (used.has(slug)) slug = `${slug.slice(0, 34)}-${t.id}`;
		used.add(slug);
		const days =
			t.days === null ? undefined : t.days.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
		const start = minutesOf(t.start_hour);
		const end = minutesOf(t.end_hour);
		const row = {
			legacyId: practitionerLegacy(t.id),
			slug,
			displayName: name ?? `Therapist ${t.id}`,
			active: t.is_active ?? true,
			shortName: clean(t.short_name),
			specialty: clean(t.specialty),
			color: clean(t.color),
			background: clean(t.bg),
			sortOrder: t.sort_order ?? undefined,
			workDays: days,
			workStartMinutes: start,
			workEndMinutes: end,
		};
		out.practitioners.push({ ...row, fingerprint: await fingerprintOf(ctx, "therapists", t) });
		out.practitionerIds.add(t.id);
	}

	for (const r of mapping.resources) {
		const t = lookOf.get(r.slug);
		const look = {
			color: clean(t?.color),
			background: clean(t?.bg),
			sortOrder: t?.sort_order ?? undefined,
		};
		const fingerprint = await fingerprintOf(ctx, "resource", { r, t });
		if (r.kind === "device") {
			out.devices.push({
				legacyId: resourceLegacy(r.slug),
				fingerprint,
				slug: r.slug,
				name: r.name,
				kind: /nfb/i.test(r.name) ? "neurofeedback" : "other",
				active: t?.is_active ?? true,
				...look,
			});
		} else {
			out.rooms.push({
				legacyId: resourceLegacy(r.slug),
				fingerprint,
				slug: r.slug,
				name: r.name,
				kind: r.roomKind ?? "other",
				capacity: r.capacity ?? 1,
				active: t?.is_active ?? true,
				...look,
			});
		}
	}

	for (const g of groupRows) {
		reportExtraColumns(ctx, "group_activities", g.id, g, GROUP_COLUMNS);
		const name = clean(g.name) ?? clean(g.short_name) ?? `Group ${g.id}`;
		out.groups.push({
			legacyId: groupLegacy(g.id),
			fingerprint: await fingerprintOf(ctx, "group_activities", g),
			slug: slugify(clean(g.short_name) ?? name) || `group-${g.id}`,
			name,
			shortName: clean(g.short_name),
			active: true,
			color: clean(g.color),
			background: clean(g.bg),
			sortOrder: g.sort_order ?? undefined,
		});
		out.groupIds.add(g.id);
	}

	for (const s of mapping.staff) {
		out.staff.push({
			legacyId: practitionerLegacy(s.legacyId),
			fingerprint: await fingerprintOf(ctx, "staff", s),
			name: s.name,
			kind: s.kind,
			active: true,
		});
		out.staffIds.add(s.legacyId);
	}
	for (const v of volunteers) {
		reportExtraColumns(ctx, "optimo_volunteers", v.id, v, VOLUNTEER_COLUMNS);
		out.staff.push({
			legacyId: `optimo_volunteers:${v.id}`,
			fingerprint: await fingerprintOf(ctx, "optimo_volunteers", v),
			name: clean(v.name) ?? `Volunteer ${v.id}`,
			kind: "volunteer",
			active: v.active ?? true,
		});
	}
	return out;
}
