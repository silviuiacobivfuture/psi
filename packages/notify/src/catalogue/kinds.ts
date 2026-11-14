import { z } from "zod";

/** Who a workflow addresses. `team`, `reception` and `owners` are teams: people resolved from the permission an entry names. */
export const AUDIENCES = [
	"team",
	"reception",
	"owners",
	"client",
	"practitioner",
	"requester",
	"actor",
	"invitee",
] as const;
export const AudienceSchema = z.enum(AUDIENCES);
export type Audience = z.infer<typeof AudienceSchema>;

/** The push purposes a person can switch on or off on a device (the three groups of the browser's push permission). */
export const PUSH_KINDS = ["requests", "appointments", "reminders"] as const;
export type PushKind = (typeof PUSH_KINDS)[number];

export const CHANNELS = ["in_app", "push", "email"] as const;
export type Channel = (typeof CHANNELS)[number];

/**
 * What a person can switch on or off in their preferences: one row per kind, one switch per channel. The scheduling
 * contract keeps a copy of this list (`NOTIFY_KINDS`); its guard test fails when the two differ.
 */
export const NOTIFY_KINDS = [
	"requests",
	"appointments",
	"reminders",
	"packages",
	"payments",
	"feedback",
	"account",
	"digests",
	"alerts",
	"security",
	"assignments",
	"leave",
] as const;
export const NotifyKindSchema = z.enum(NOTIFY_KINDS);
export type NotifyKind = z.infer<typeof NotifyKindSchema>;
