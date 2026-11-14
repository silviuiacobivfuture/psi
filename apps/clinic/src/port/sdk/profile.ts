import { PortError } from "../port";
import type { ProfilePort } from "../profile-port";
import type { SdkContext } from "./context";

const unavailable = (what: string): Promise<never> =>
	Promise.reject(new PortError("unavailable", `the service keeps no ${what} for a person yet`));

/**
 * The profile: a person's phone, their per-channel notification choices and the feedback they sent. The scheduling
 * service has no routes for them yet; this is the ONE place that maps them when it does. Until then each refuses
 * `unavailable` and the profile page says so in that section only.
 */
export function profileGroup(_sdk: SdkContext): ProfilePort {
	return {
		profile: () => unavailable("profile"),
		saveProfile: () => unavailable("profile"),
		notificationPrefs: () => unavailable("notification preferences"),
		saveNotificationPrefs: () => unavailable("notification preferences"),
		myFeedback: () => unavailable("feedback"),
	};
}
