import type { RouteSpec } from "@psi/scheduling-sdk/contract";
import type { Handler, Handlers } from "../http/context";
import { adminHandlers } from "./admin";
import { appointmentHandlers } from "./appointments";
import { appHandlers } from "./apps";
import { blacklistHandlers } from "./blacklist";
import { catalogHandlers } from "./catalog";
import { clientHandlers } from "./clients";
import { deliveryHandlers } from "./deliveries";
import { feedbackHandlers } from "./feedback";
import { floorPlanHandlers } from "./floorplan";
import { inviteHandlers } from "./invites";
import { notificationPrefsHandlers } from "./notification-prefs";
import { packageHandlers } from "./packages";
import { recordHandlers } from "./records";
import { reminderHandlers } from "./reminders";
import { rosterHandlers } from "./roster";
import { viewAsHandlers } from "./viewas";
import { visitorHandlers } from "./visitor";

/** Every route of the contract has a handler here: the type is a mapped type over the table, so a missing one does not compile. */
const complete: Handlers = {
	...appHandlers,
	...catalogHandlers,
	...clientHandlers,
	...appointmentHandlers,
	...packageHandlers,
	...rosterHandlers,
	...reminderHandlers,
	...recordHandlers,
	...floorPlanHandlers,
	...blacklistHandlers,
	...feedbackHandlers,
	...inviteHandlers,
	...deliveryHandlers,
	...notificationPrefsHandlers,
	...adminHandlers,
	...viewAsHandlers,
	...visitorHandlers,
};

export const handlers: Readonly<Record<string, Handler<RouteSpec> | undefined>> = complete;
