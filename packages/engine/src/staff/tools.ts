import type { ToolsInput } from "@mastra/core/agent";
import type { RequestContext } from "@mastra/core/request-context";
import { SESSION_KEY, type StaffSession } from "./session";
import {
	cancelAppointmentTool,
	createAppointmentTool,
	markAttendanceTool,
	moveAppointmentTool,
} from "./tools-appointments";
import { agendaTool, clientSummaryTool, findClientTool, freeSlotsTool } from "./tools-calendar";
import {
	markRequestHandledTool,
	recordPaymentTool,
	requestLeaveTool,
	sendRemindersTool,
} from "./tools-office";
import { packageBalanceTool, rosterTool, searchNotesTool } from "./tools-records";
import { draftRemindersTool, statsTool, webRequestsTool } from "./tools-requests";

const verified = new WeakSet<object>();

/** Marks a session as made by `openSession` after the port's `whoami` succeeded. */
export function vouch(session: StaffSession): StaffSession {
	verified.add(session);
	return session;
}

function isVerified(value: unknown): value is StaffSession {
	return typeof value === "object" && value !== null && verified.has(value);
}

/**
 * The staff tools of one verified session. The agent hydrates them per call from the request
 * context; a call without a verified session has no tools and no run: it throws.
 */
export function staffTools({
	requestContext,
}: {
	requestContext: RequestContext;
}): Promise<ToolsInput> {
	const session = requestContext.get(SESSION_KEY);
	if (!isVerified(session)) {
		return Promise.reject(new Error("the staff assistant needs a verified staff principal"));
	}
	return Promise.resolve({
		staffFindClient: findClientTool(session),
		staffClientSummary: clientSummaryTool(session),
		staffAgenda: agendaTool(session),
		staffFreeSlots: freeSlotsTool(session),
		staffCreateAppointment: createAppointmentTool(session),
		staffMoveAppointment: moveAppointmentTool(session),
		staffCancelAppointment: cancelAppointmentTool(session),
		staffMarkAttendance: markAttendanceTool(session),
		staffRecordPayment: recordPaymentTool(session),
		staffPackageBalance: packageBalanceTool(session),
		staffRoster: rosterTool(session),
		staffRequestLeave: requestLeaveTool(session),
		staffWebRequests: webRequestsTool(session),
		staffMarkRequestHandled: markRequestHandledTool(session),
		staffDraftReminders: draftRemindersTool(session),
		staffSendReminders: sendRemindersTool(session),
		staffSearchNotes: searchNotesTool(session),
		staffStats: statsTool(session),
	});
}
