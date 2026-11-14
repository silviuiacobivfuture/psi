import { z } from "zod/v4";
import { Id, Ms } from "./primitives";

/**
 * Stopping online booking. A pause covers the whole organisation (the app), one public site (the caller a site's service
 * key names: `psizone-web`, `hemisync-web`), one service or one practitioner; it starts now or at `from`, and lasts until
 * `until` or until it is lifted. While one is in force the visitor routes that would book (free times, holds, submits,
 * moves) answer 409 `booking_paused` with `BookingPausedDetail`, and callback requests stay open unless the pause says
 * otherwise. Staff keep booking from the console unless `blockStaff` is set. Whether it is in force is decided at each
 * request by the service's clock, never stored.
 */
export const PAUSE_LEVELS = ["organisation", "site", "service", "practitioner"] as const;
export const PauseLevel = z.enum(PAUSE_LEVELS);
export type PauseLevelName = z.infer<typeof PauseLevel>;

const SiteId = z.string().regex(/^[a-z][a-z0-9-]{1,40}$/);
const ServiceSlug = z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/);

export const PauseScope = z.discriminatedUnion("level", [
	z.object({ level: z.literal("organisation") }),
	z.object({ level: z.literal("site"), site: SiteId }),
	z.object({ level: z.literal("service"), service: ServiceSlug }),
	z.object({ level: z.literal("practitioner"), practitionerId: Id }),
]);

/** The longest message a visitor is shown, per language. */
export const PAUSE_MESSAGE_MAX = 600;
export const PauseMessage = z.object({
	ro: z.string().trim().min(1).max(PAUSE_MESSAGE_MAX),
	en: z.string().trim().min(1).max(PAUSE_MESSAGE_MAX),
});

export const PauseInput = z.object({
	scope: PauseScope,
	/** When it starts; absent starts it now. */
	from: Ms.optional(),
	/** When it ends by itself; absent lasts until it is lifted. */
	until: Ms.optional(),
	/** What visitors read; absent uses the service's default (RO/EN), which follows `callbacksOpen`. */
	message: PauseMessage.optional(),
	/** Visitors can still ask to be called back. */
	callbacksOpen: z.boolean().default(true),
	/** Staff cannot book what it covers from the console either. */
	blockStaff: z.boolean().default(false),
});

export const PauseState = z.enum(["scheduled", "active", "ended"]);

export const BookingPause = z.object({
	id: z.string(),
	scope: PauseScope,
	from: Ms.optional(),
	until: Ms.optional(),
	/** The words visitors read: the pause's own, or the default. */
	message: PauseMessage,
	/** True when the message is the default (no words of its own were saved). */
	defaultMessage: z.boolean(),
	callbacksOpen: z.boolean(),
	blockStaff: z.boolean(),
	/** At the moment of the answer. */
	state: PauseState,
	createdAt: Ms,
	createdBy: z.string(),
	updatedAt: Ms,
});

export const BookingPauses = z.object({
	items: z.array(BookingPause),
	/** The public sites that book into this app (the service keys of this app's callers). */
	sites: z.array(z.string()),
	/** True while any pause is in force. */
	paused: z.boolean(),
});

/** What a visitor is told: the message, whether a callback can still be asked, and when booking opens again if known. */
export const PauseNotice = z.object({
	level: PauseLevel,
	message: PauseMessage,
	callbacksOpen: z.boolean(),
	until: Ms.optional(),
});
/** `detail` of a 409 `booking_paused`. */
export const BookingPausedDetail = PauseNotice;
export type BookingPausedDetailType = z.infer<typeof BookingPausedDetail>;
