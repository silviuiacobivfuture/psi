import { ACCOUNT_TOPICS, type PushStore, type SubscriptionRecord } from "@psi/pwa";
import type { AppKey } from "../apps";
import { createNovuHttp, type NovuHttp } from "../novu-http";

export interface DeviceSyncOptions {
	novu: { apiUrl: string; secretKey: string; fetch?: typeof globalThis.fetch };
	store: PushStore;
	app: AppKey;
	site: SubscriptionRecord["site"];
	/** The person's Novu subscriber id for a signed-in subject (staff: the subject itself). Undefined: not a notified person. */
	subscriberOf: (subject: string) => Promise<string | undefined>;
	http?: NovuHttp;
}

/** The `onDevicesChanged` of `mountPushApi`: keeps the person's Push Webhook device tokens in Novu equal to their devices here. */
export function createDeviceSync(o: DeviceSyncOptions): (subject: string) => Promise<void> {
	const http = o.http ?? createNovuHttp(o.novu);
	return async (subject) => {
		const subscriberId = await o.subscriberOf(subject);
		if (subscriberId === undefined) return;
		const devices = (await o.store.forSubject(subject)).filter(
			(d) => d.site === o.site && d.topics.some((t) => ACCOUNT_TOPICS.includes(t)),
		);
		await http.upsertSubscriber({ subscriberId });
		await http.setPushTokens(
			subscriberId,
			`push-webhook-${o.app}`,
			devices.map((d) => d.id),
		);
	};
}
