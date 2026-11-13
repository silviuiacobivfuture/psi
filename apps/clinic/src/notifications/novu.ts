import { createFeed } from "@psi/notify/inbox";
import type { NovuSettings } from "../env";
import type { NotificationsPort } from "./port";

/** The estate's Novu inbox for the console: the person's subscriber hash is derived here, the key never leaves the server. */
export function createNovuNotifications(novu: NovuSettings): NotificationsPort {
	return createFeed({
		apiUrl: novu.apiUrl,
		applicationId: novu.applicationId,
		secretKey: novu.secretKey,
	});
}
