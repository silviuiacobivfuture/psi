/**
 * The `.collect()` calls the Convex functions may keep, and why each set is bounded. Every other read of a list goes
 * through an index AND a bound (`convex/bounded.ts`: `take(max + 1)` refusing `too_many_rows`, a page, or a read that
 * stops at the page). `collects.test.ts` fails on a collect not listed here, and on a listed one that is gone.
 */
const WHY = {
	relation:
		"one object's own relation (a client's practitioners or keys, a subject's roles, overrides or assignments, a practitioner's rules or exceptions, one feedback's replies, one entity's custom values): bounded by what one person or object holds",
	catalogue:
		"the app's own set-up (practitioners, rooms, services, devices, group activities, definitions and their versions, key versions, the team): tens to hundreds rows the team writes; the clients that parse these answers (visitor, guide, staff tools) have no refusal for a size",
	window:
		"one calendar's bookings in a bounded window (a practitioner, a room or a column; availability and conflicts, the board's 14 days at most, a practitioner's 62 days): bounded by the time one calendar can hold",
	erase:
		"erasing or removing one client, one app or one fixture inside one mutation: it must read all of it to delete all of it, and that is one client's or one app's set-up",
	fixture: "the DEMO seed and the test fixtures: internal, admin key only, synthetic tenants",
	platform: "the estate's own apps (a handful of tenants), read by the daily retention job",
} as const;

export type Why = keyof typeof WHY;
export const REASONS: Readonly<Record<Why, string>> = WHY;

/** `<file>#<enclosing export or function>` → how many collects it holds, and the category of its bound. */
export const ALLOWED: Readonly<Record<string, { count: number; why: Why }>> = {
	"account.ts#unlink": { count: 1, why: "relation" },
	"apiAccess.ts#assignRole": { count: 1, why: "relation" },
	"apiAccess.ts#forSubject": { count: 3, why: "relation" },
	"apiAccess.ts#removeOverride": { count: 1, why: "relation" },
	"apiAccess.ts#setCoordinator": { count: 1, why: "relation" },
	"apiAccess.ts#setOverride": { count: 1, why: "relation" },
	"apiAccess.ts#unassignRole": { count: 1, why: "relation" },
	"apiAppsExtra.ts#removeApp": { count: 6, why: "erase" },
	"apiBuilder.ts#defineForm": { count: 1, why: "catalogue" },
	"apiBuilder.ts#setDefinition": { count: 1, why: "catalogue" },
	"apiBuilder.ts#setValue": { count: 1, why: "relation" },
	"apiBuilder.ts#values": { count: 1, why: "relation" },
	"apiCatalogExtra.ts#inUse": { count: 1, why: "catalogue" },
	"apiCatalogExtra.ts#removeRow": { count: 3, why: "relation" },
	"apiClients.ts#get": { count: 1, why: "relation" },
	"apiClients.ts#setTreating": { count: 1, why: "relation" },
	"apiClients.ts#treatingFor": { count: 2, why: "relation" },
	"apiClients.ts#writeKeys": { count: 1, why: "relation" },
	"apiDefinitionsExtra.ts#allDefinitions": { count: 2, why: "catalogue" },
	"apiDefinitionsExtra.ts#putDefinition": { count: 1, why: "catalogue" },
	"apiDefinitionsExtra.ts#removeDefinition": { count: 1, why: "catalogue" },
	"apiFeedback.ts#get": { count: 1, why: "relation" },
	"apiMembersExtra.ts#appsOf": { count: 2, why: "relation" },
	"apiMembersExtra.ts#heldBy": { count: 3, why: "relation" },
	"apiMembersExtra.ts#members": { count: 1, why: "catalogue" },
	"apiMembersExtra.ts#putMember": { count: 2, why: "relation" },
	"apiMembersExtra.ts#setOverrides": { count: 1, why: "relation" },
	"calendar.ts#appointmentsAround": { count: 1, why: "window" },
	"calendar.ts#exceptionsOf": { count: 1, why: "relation" },
	"calendar.ts#rulesOf": { count: 1, why: "relation" },
	"calendar.ts#visitBusyOnColumn": { count: 1, why: "window" },
	"callbacks.ts#dropFixture": { count: 1, why: "fixture" },
	"catalog.ts#services": { count: 1, why: "catalogue" },
	"clinicErase.ts#eraseClinicData": { count: 10, why: "erase" },
	"clinicInspect.ts#slugs": { count: 4, why: "catalogue" },
	"clinicKeys.ts#list": { count: 1, why: "catalogue" },
	"clinicRetention.ts#eraseDue": { count: 1, why: "platform" },
	"importClients.ts#upsertClients": { count: 1, why: "relation" },
	"roomPlan.ts#roomPlan": { count: 4, why: "window" },
	"seed.ts#demoRequests": { count: 1, why: "fixture" },
	"seed.ts#dropFixture": { count: 10, why: "fixture" },
	"seed.ts#replaceRules": { count: 1, why: "fixture" },
	"staffBoard.ts#board": { count: 5, why: "window" },
	"staffCatalog.ts#addRule": { count: 1, why: "relation" },
	"staffCatalog.ts#availability": { count: 2, why: "relation" },
	"staffCatalog.ts#catalog": { count: 2, why: "catalogue" },
	"staffClients.ts#eraseClient": { count: 2, why: "erase" },
	"staffRooms.ts#addRoomClosure": { count: 1, why: "relation" },
	"staffRooms.ts#rooms": { count: 2, why: "catalogue" },
	"staffSchedule.ts#removePeriod": { count: 1, why: "relation" },
	"staffSchedule.ts#setAlternating": { count: 1, why: "relation" },
	"staffSchedule.ts#setPeriod": { count: 1, why: "relation" },
	"staffSetup.ts#addDaysOff": { count: 1, why: "relation" },
	"staffSetup.ts#setDayRules": { count: 1, why: "relation" },
	"staff.ts#calendar": { count: 1, why: "window" },
	"visitConflicts.ts#busyOfVisitsInfo": { count: 4, why: "window" },
};
