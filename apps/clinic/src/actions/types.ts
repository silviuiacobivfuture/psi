import type { AdminIcon } from "@psi/ui/admin";
import type { z } from "zod";
import type { Can } from "../lib/can";
import type { Locale } from "../lib/i18n";
import type { SaveProblems } from "../port/availability-port";
import type { ClinicPort } from "../port/port";
import type { AppSlug, FieldGroupName } from "../port/schema";
import type { Actor } from "../port/schema-clinical";

/** Where a control for an action may appear. */
export const PLACEMENTS = ["primary", "screen", "menu", "empty", "palette"] as const;
export type Placement = (typeof PLACEMENTS)[number];

/** The screens an action may be offered on. */
export const SCREENS = [
	"global",
	"calendar",
	"clients",
	"client",
	"client.overview",
	"client.appointments",
	"client.packages",
	"client.records",
	"client.files",
	"client.notes",
	"appointment",
	"requests",
	"reminders",
	"settings",
	"settings.people",
	"settings.rooms",
	"settings.devices",
	"settings.services",
	"settings.roles",
	"settings.members",
	"settings.hours",
	"settings.online",
	"settings.assistant",
	"settings.assistant.people",
	"platform",
] as const;
export type Screen = (typeof SCREENS)[number];

export const TIERS = ["daily", "me", "org", "platform"] as const;
export type Tier = (typeof TIERS)[number];

export const ENTITIES = [
	"none",
	"client",
	"appointment",
	"note",
	"file",
	"record",
	"blacklist",
	"package",
	"request",
	"reminder",
	"person",
	"room",
	"device",
	"service",
	"role",
	"member",
	"availability",
	"pause",
] as const;
export type EntityKind = (typeof ENTITIES)[number];

/** How a phone gets to it: the bar over the tabs, the "⋯" menu, a floating button, a sheet, or a plain list row. */
export type MobilePlacement = "bar" | "menu" | "fab" | "sheet" | "list";

/** What asks to confirm: nothing, a yes/no, or a written reason (the params carry it). */
export type ConfirmPolicy = "none" | "confirm" | "reason";

/** What the caller needs; any ONE of the keys of each list is enough. */
export interface Needs {
	/** A change: held, and not while looking at the app as someone else. */
	write?: ReadonlyArray<string>;
	/** Something to open: held. */
	read?: ReadonlyArray<string>;
	/** Also needs to see this field group. */
	group?: FieldGroupName;
}

/** What the person is looking at, for the actions that depend on it. */
export interface EntityState {
	clientId?: string;
	clientArchived?: boolean;
	blacklistId?: string | null;
	/** The note/file/record/blacklist id the control would act on. */
	id?: string;
	/** The note is the viewer's own. */
	own?: boolean;
	pinned?: boolean;
}

export interface ActionCtx {
	port: ClinicPort;
	app: AppSlug;
	can: Can;
	actor: Actor;
	locale: Locale;
	today: string;
	/** The calendars that are the person's own (their `own` reach): what a narrowed permission may touch. */
	ownCalendars?: ReadonlyArray<string>;
}

export type ActionResult =
	| { status: "ok"; to?: string; data?: unknown }
	| { status: "needs-confirmation"; policy: Exclude<ConfirmPolicy, "none"> }
	| {
			status: "refused";
			code: "forbidden" | "invalid" | "not-found" | "conflict" | "unknown" | "unavailable";
			/** The service's own reason inside the code (`booking_paused`, `until_past`): a screen words each one. */
			reason?: string;
			/** A save refused with its problems (nothing written): the screen shows each beside what it is about. */
			problems?: SaveProblems;
	  };

export interface ActionDef {
	id: string;
	tier: Tier;
	entity: EntityKind;
	/** The label in the person's language (a message, never a literal). */
	label: (locale: Locale) => string;
	icon: AdminIcon;
	placements: Partial<Record<Placement, ReadonlyArray<Screen>>>;
	mobile: MobilePlacement;
	needs: Needs;
	/** The route that performs it (or shows what it opens); null for a pure in-page toggle. */
	route: { method: "GET" | "POST"; path: string } | null;
	confirm: ConfirmPolicy;
	params: z.ZodType<Record<string, unknown>, z.ZodTypeDef, unknown>;
	/** The Datastar signal that opens its sheet on the screen, when it has one. */
	opens?: string;
	/** Where a person goes to begin it, for a link or the palette. */
	to?: (e: EntityState) => string;
	/** Whether it makes sense for what is shown (an archived client is not archived again). */
	when?: (ctx: ActionCtx, e: EntityState) => boolean;
	/** Does it; absent for an action that only navigates. */
	run?: (ctx: ActionCtx, raw: unknown) => Promise<ActionResult>;
	/** Its result's `data` is for the person at the screen alone (a one-time sign-in link): the assistant never gets it. */
	privateResult?: true;
}

export interface ListQuery {
	screen: Screen;
	placement?: Placement;
	entity?: EntityState;
}
