import type { ToolKey } from "./copy";

/**
 * The staff tools' ids. All carry the `staff` prefix and none equals a visitor tool's id
 * (`findAvailability`, `requestAppointment`, `cancelRequest`, `searchKnowledge`, …): the leak
 * tests look for these ids on the visitor side.
 */
export const STAFF_TOOLS = {
	findClient: "staffFindClient",
	clientSummary: "staffClientSummary",
	agenda: "staffAgenda",
	freeSlots: "staffFreeSlots",
	createAppointment: "staffCreateAppointment",
	moveAppointment: "staffMoveAppointment",
	cancelAppointment: "staffCancelAppointment",
	markAttendance: "staffMarkAttendance",
	recordPayment: "staffRecordPayment",
	packageBalance: "staffPackageBalance",
	roster: "staffRoster",
	requestLeave: "staffRequestLeave",
	webRequests: "staffWebRequests",
	markRequestHandled: "staffMarkRequestHandled",
	draftReminders: "staffDraftReminders",
	sendReminders: "staffSendReminders",
	searchNotes: "staffSearchNotes",
	stats: "staffStats",
} as const satisfies Readonly<Record<ToolKey, string>>;

export const STAFF_TOOL_IDS: ReadonlyArray<string> = Object.values(STAFF_TOOLS);

/** The tool key behind a tool id, for the chip's words. */
export function toolKeyOf(id: string): ToolKey | undefined {
	return (Object.keys(STAFF_TOOLS) as ToolKey[]).find((key) => STAFF_TOOLS[key] === id);
}
