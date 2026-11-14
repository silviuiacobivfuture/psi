import type { RouteSpec } from "@psi/scheduling-sdk/contract";
import type { Handler, Handlers } from "../http/context";
import { adminHandlers } from "./admin";
import { appointmentEditHandlers } from "./appointment-edit";
import { appointmentHandlers } from "./appointments";
import { appHandlers } from "./apps";
import { assistantHandlers } from "./assistant";
import { blacklistHandlers } from "./blacklist";
import { catalogHandlers } from "./catalog";
import { clientHandlers } from "./clients";
import { feedbackHandlers } from "./feedback";
import { fileHandlers } from "./files";
import { floorPlanHandlers } from "./floorplan";
import { memberHandlers } from "./members";
import { noteHandlers } from "./notes";
import { packageHandlers } from "./packages";
import { recordHandlers } from "./records";
import { reminderHandlers } from "./reminders";
import { reportHandlers } from "./reports";
import { rosterHandlers } from "./roster";
import { seriesHandlers } from "./series";
import { viewAsHandlers } from "./viewas";
import { visitorHandlers } from "./visitor";

/** Every route of the contract has a handler here: the type is a mapped type over the table, so a missing one does not compile. */
const complete: Handlers = {
	...appHandlers,
	...memberHandlers,
	...catalogHandlers,
	...clientHandlers,
	...appointmentHandlers,
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
	...adminHandlers,
	...viewAsHandlers,
	...visitorHandlers,
	...assistantHandlers,
};

export const handlers: Readonly<Record<string, Handler<RouteSpec> | undefined>> = complete;
