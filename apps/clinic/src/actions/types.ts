import type { AdminIcon } from "@psi/ui/admin";
import type { z } from "zod";
import type { Can } from "../lib/can";
import type { Locale } from "../lib/i18n";
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
}

export type ActionResult =
	| { status: "ok"; to?: string; data?: unknown }
	| { status: "needs-confirmation"; policy: Exclude<ConfirmPolicy, "none"> }
	| {
			status: "refused";
			code: "forbidden" | "invalid" | "not-found" | "conflict" | "unknown" | "unavailable";
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
}

export interface ListQuery {
	screen: Screen;
	placement?: Placement;
	entity?: EntityState;
}
