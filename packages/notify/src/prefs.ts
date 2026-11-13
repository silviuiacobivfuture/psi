import { z } from "zod";
import { type AppKey, inQuietHours, type QuietHours, QuietHoursSchema } from "./apps";
import { CHANNELS, type Channel, defaultChannels, type Entry, NotifyKindSchema } from "./catalogue";

/** What one person chose: a switch per kind and channel, quiet hours for push, a language. Anything unset follows the catalogue's default. */
export const ChannelSwitchesSchema = z
	.object({ in_app: z.boolean(), push: z.boolean(), email: z.boolean() })
	.partial()
	.strict();
export const PrefsSchema = z
	.object({
		channels: z.record(NotifyKindSchema, ChannelSwitchesSchema),
		quietHours: QuietHoursSchema.nullable(),
		locale: z.enum(["ro", "en"]).optional(),
	})
	.strict();
export type Prefs = z.infer<typeof PrefsSchema>;

/** A person who chose nothing. */
export const NO_PREFS: Prefs = { channels: {}, quietHours: null };

/** Who is asked about: a member of staff by their sign-in subject, or a client by their record. */
export type PrefsOwner = { side: "staff"; subject: string } | { side: "client"; clientId: string };

/** Where choices live; the scheduling service implements it over its store. A failure here never blocks a notification. */
export interface PreferenceSource {
	resolve(app: AppKey, owner: PrefsOwner): Promise<Prefs | undefined>;
}

export type SuppressReason = "preference" | "quiet-hours" | "no-address";

export interface Applied {
	readonly channels: Readonly<Record<Channel, boolean>>;
	/** Channels the entry offers that this delivery will not use, and why. */
	readonly suppressed: Readonly<Partial<Record<Channel, SuppressReason>>>;
}

/**
 * The channels one delivery may use. In order: what the entry offers; what the person chose (or the catalogue's default);
 * a locked channel stays on whatever was chosen; push is held back in quiet hours (the person's own, else the app's);
 * an e-mail with no address cannot go. Pure: the same inputs always give the same answer.
 */
export function applyPrefs(input: {
	entry: Entry;
	prefs: Prefs | undefined;
	appQuiet: QuietHours | null;
	now: number;
	hasEmail: boolean;
}): Applied {
	const { entry, prefs } = input;
	const quietHours = prefs?.quietHours ?? input.appQuiet;
	const channels = { in_app: false, push: false, email: false };
	const suppressed: Partial<Record<Channel, SuppressReason>> = {};
	for (const channel of CHANNELS) {
		if (!entry.channels.includes(channel)) continue;
		const locked = entry.locked?.includes(channel) === true;
		const chosen = prefs?.channels[entry.kind]?.[channel];
		const on = locked || (chosen ?? defaultChannels(entry).includes(channel));
		if (!on) suppressed[channel] = "preference";
		else if (channel === "push" && inQuietHours(quietHours, input.now))
			suppressed[channel] = "quiet-hours";
		else if (channel === "email" && !input.hasEmail) suppressed[channel] = "no-address";
		else channels[channel] = true;
	}
	return { channels, suppressed };
}
