import type { Audience, Mode } from "./domain/catalog";

/** The inputs the team's setup functions take (see `StaffSchedulingClient`). */

/** A service's name in both languages. */
export interface ServiceName {
	ro: string;
	en: string;
}

/** What `createService` takes: every setting stated, the slug its key for good. */
export interface NewService {
	/** Lowercase letters, digits and hyphens (2 to 41 characters); never changes. */
	slug: string;
	name: ServiceName;
	durationMinutes: number;
	bufferMinutes: number;
	stepMinutes: number;
	minNoticeMinutes: number;
	horizonDays: number;
	holdMinutes: number;
	modes: Mode[];
	/** For onsite sessions: the address key the app renders. */
	location?: string;
	/** Practitioner ids of this tenant who offer it. */
	practitioners: string[];
}

/** One opening of a regular day: minutes after local midnight, and the modes it offers. */
export interface DayWindow {
	start: number;
	end: number;
	modes: Mode[];
}

/** What a room is, as the team writes it. */
export interface NewRoom {
	/** Lowercase letters, digits and hyphens; its key for good. */
	slug: string;
	name: string;
	/** One of `ROOM_KINDS`. */
	kind: string;
	capacity: number;
	suits: Audience[];
	/** Short tags (`eeg`, `snoezelen`) a service may require. */
	equipment: string[];
}

/** The room an onsite session of a service needs. */
export interface RoomRequirement {
	roomKind: string;
	roomEquipment?: string[];
	roomAudiences?: Audience[];
}

/** One weekday of a period schedule. */
export interface PeriodDay {
	weekday: number;
	windows: DayWindow[];
}
/** What `updateService` may change; anything left out stays as it is. */
export interface ServicePatch {
	name?: ServiceName;
	durationMinutes?: number;
	bufferMinutes?: number;
	stepMinutes?: number;
	minNoticeMinutes?: number;
	horizonDays?: number;
	holdMinutes?: number;
	modes?: Mode[];
	/** Practitioner ids of this tenant who offer it (replaces the list). */
	practitioners?: string[];
	/** The room kind an onsite session needs; null: none. */
	roomKind?: string | null;
	roomEquipment?: string[];
	roomAudiences?: Audience[];
	active?: boolean;
}
