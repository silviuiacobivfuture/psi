import { z } from "zod";
import type { AppSlug } from "./schema";

/** What the service keeps about a person beyond their sign-in: today their phone number. */
export const ProfileSchema = z.object({ phone: z.string().max(40).nullable() });
export type Profile = z.infer<typeof ProfileSchema>;

/** A thing the person told the team (a suggestion, a problem) and how it stands. */
export const MyFeedbackSchema = z.object({
	id: z.string(),
	at: z.string(),
	text: z.string(),
	status: z.enum(["open", "answered"]),
	reply: z.string().nullable(),
});
export type MyFeedback = z.infer<typeof MyFeedbackSchema>;

/**
 * What the profile page reads and writes, about the signed-in person only. Each call may refuse `unavailable` while the
 * service keeps no such thing; the page then says so in that section and the rest still works.
 */
export interface ProfilePort {
	profile(app: AppSlug, subject: string): Promise<Profile>;
	saveProfile(app: AppSlug, subject: string, profile: Profile): Promise<void>;
	myFeedback(app: AppSlug, subject: string): Promise<ReadonlyArray<MyFeedback>>;
}
