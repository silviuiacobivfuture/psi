import type { EventId } from "../apps";
import type { Audience, Channel, NotifyKind, PushKind } from "./kinds";

/** One workflow: an event for one audience, through the channels it offers, with what a person starts on. */
export interface Entry {
	readonly event: EventId;
	readonly audience: Audience;
	/** The channels this notification can use at all. */
	readonly channels: ReadonlyArray<Channel>;
	/** The channels that are on until the person chooses otherwise; absent means every offered channel. */
	readonly defaults?: ReadonlyArray<Channel>;
	/** Channels no preference can switch off: what the person needs to act, or asked for (an invitation). */
	readonly locked?: ReadonlyArray<Channel>;
	/** The row of the preferences page it belongs to. */
	readonly kind: NotifyKind;
	/** The push purpose, when push is a channel. */
	readonly push?: PushKind;
	/**
	 * For a team audience: the permission (a catalogue key without its scope) whose holders are told. The service resolves
	 * the people; a person who lost the permission stops getting the notification with it.
	 */
	readonly needs?: string;
	/** Where the notification leads, relative to the console (staff) or the site (clients). */
	readonly path: (payload: Record<string, unknown>) => string;
}

export const appointmentPath = (p: Record<string, unknown>): string =>
	`/calendar?appointment=${encodeURIComponent(String(p.appointmentId))}`;

/** The site's account page, where every client-facing message leads unless it carries its own link. */
export const accountPath = (): string => "/cont";
