import type { FunctionArgs, FunctionReference } from "convex/server";
import type { internal } from "../../convex/_generated/api";

/** The rows each internal Convex function takes, derived from its validators: one description. */
type RowOf<F extends FunctionReference<"mutation", "internal">> =
	FunctionArgs<F> extends {
		rows: ReadonlyArray<infer R>;
	}
		? R
		: never;

export type PractitionerRow = RowOf<typeof internal.importPeople.upsertPractitioners>;
export type DeviceRow = RowOf<typeof internal.importPeople.upsertDevices>;
export type RoomRow = RowOf<typeof internal.importPeople.upsertRooms>;
export type GroupRow = RowOf<typeof internal.importPeople.upsertGroups>;
export type StaffRow = RowOf<typeof internal.importPeople.upsertStaff>;
export type ClientRow = RowOf<typeof internal.importClients.upsertClients>;
export type PackageRow = RowOf<typeof internal.importMoney.upsertPackages>;
export type PaymentRow = RowOf<typeof internal.importMoney.upsertPayments>;
export type VisitRow = RowOf<typeof internal.importVisits.upsertVisits>;
export type RosterRow = RowOf<typeof internal.importRoster.upsertRosterDays>;
export type BlockRow = RowOf<typeof internal.importRoster.upsertStaffBlocks>;
export type ResponseRow = RowOf<typeof internal.importRecords.upsertResponses>;
export type FileRow = RowOf<typeof internal.importRecords.upsertFiles>;
