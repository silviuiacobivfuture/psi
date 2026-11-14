import type { RouteSpec } from "@psi/scheduling-sdk/contract";
import type { Handler, Handlers } from "../http/context";
import { adminHandlers } from "./admin";
import { appointmentEditHandlers } from "./appointment-edit";
import { appointmentHandlers } from "./appointments";
import { appHandlers } from "./apps";
import { assistantHandlers } from "./assistant";
import { blacklistHandlers } from "./blacklist";
import { calendarSummaryHandlers } from "./calendar-summary";
import { catalogHandlers } from "./catalog";
import { clientHandlers } from "./clients";
import { deliveryHandlers } from "./deliveries";
import { feedbackHandlers } from "./feedback";
import { fileHandlers } from "./files";
import { floorPlanHandlers } from "./floorplan";
import { inviteHandlers } from "./invites";
import { memberHandlers } from "./members";
import { noteHandlers } from "./notes";
import { notificationPrefsHandlers } from "./notification-prefs";
import { packageHandlers } from "./packages";
import { recordHandlers } from "./records";
import { reminderHandlers } from "./reminders";
import { reportHandlers } from "./reports";
import { roleSummaryHandlers } from "./role-summary";
import { rosterHandlers } from "./roster";
import { seriesHandlers } from "./series";
import { staffHandlers } from "./staff-accounts";
import { viewAsHandlers } from "./viewas";
import { visitorHandlers } from "./visitor";

/** Every route of the contract has a handler here: the type is a mapped type over the table, so a missing one does not compile. */
const complete: Handlers = {
	...appHandlers,
	...roleSummaryHandlers,
	...memberHandlers,
	...catalogHandlers,
	...clientHandlers,
	...appointmentHandlers,
	...calendarSummaryHandlers,
	...appointmentEditHandlers,
	...seriesHandlers,
	...noteHandlers,
	...reportHandlers,
	...packageHandlers,
	...rosterHandlers,
	...reminderHandlers,
	...recordHandlers,
	...fileHandlers,
	...floorPlanHandlers,
	...blacklistHandlers,
	...feedbackHandlers,
	...inviteHandlers,
	...staffHandlers,
	...deliveryHandlers,
	...notificationPrefsHandlers,
	...adminHandlers,
	...viewAsHandlers,
	...visitorHandlers,
	...assistantHandlers,
};

export const handlers: Readonly<Record<string, Handler<RouteSpec> | undefined>> = complete;
