import type { ManifestText } from "./manifest";
import type { OfflineText } from "./offline-page";
import type { ArticleBrand, PushLocale, PushTexts, SubscriptionRecord, Topic } from "./push/types";
import type { DeviceRow } from "./ui/devices";
import type { NotifyPanelLabels, NotifyPurpose } from "./ui/notify-panel";
import type { PwaToolsLabels } from "./ui/tools";

type Options = { locale: PushLocale };
type Plain = (inputs: Record<string, never>, options: Options) => string;

/**
 * The PWA's message keys, as every app's Paraglide `m` has them (`messages/pwa/{locale}.json`).
 * This package ships no words: it only knows the keys, and each app passes its own `m`, so each
 * brand speaks in its own voice. Booking keys exist only where a site takes bookings.
 */
export interface PwaMessages {
	pwa_name: Plain;
	pwa_short_name: Plain;
	pwa_description: Plain;
	pwa_install: Plain;
	pwa_ios_title: Plain;
	pwa_ios_steps: Plain;
	pwa_notifications: Plain;
	pwa_offline_title: Plain;
	pwa_offline_lead: Plain;
	pwa_offline_retry: Plain;
	pwa_offline_home: Plain;
	pwa_page_title: Plain;
	pwa_page_lead: Plain;
	pwa_topic_articles_hint: Plain;
	pwa_topic_articles_psizone?: Plain;
	pwa_topic_articles_eqsync?: Plain;
	pwa_topic_articles_hemisync?: Plain;
	pwa_topic_booking?: Plain;
	pwa_topic_booking_hint?: Plain;
	pwa_notify_me: Plain;
	pwa_notify_stop: Plain;
	pwa_notify_on: Plain;
	pwa_sign_in_first: Plain;
	pwa_unsupported: Plain;
	pwa_ios_install: Plain;
	pwa_off: Plain;
	pwa_denied: Plain;
	pwa_failed: Plain;
	pwa_test: Plain;
	pwa_tested: Plain;
	pwa_too_soon: Plain;
	pwa_privacy: Plain;
	pwa_devices_title: Plain;
	pwa_devices_empty: Plain;
	pwa_device_remove: Plain;
	pwa_device_detail: (inputs: { date: string; topics: string }, options: Options) => string;
	pwa_push_booking_confirmed_title?: Plain;
	pwa_push_booking_confirmed_body?: Plain;
	pwa_push_booking_cancelled_title?: Plain;
	pwa_push_booking_cancelled_body?: Plain;
	pwa_push_booking_reminder_title?: Plain;
	pwa_push_booking_reminder_body?: Plain;
	pwa_push_article_title: (inputs: { brand: string }, options: Options) => string;
	pwa_push_article_body: (inputs: { headline: string }, options: Options) => string;
	pwa_push_test_title: Plain;
	pwa_push_test_body: Plain;
}

const at = (locale: PushLocale): Options => ({ locale });

export function manifestText(m: PwaMessages, l: PushLocale): ManifestText {
	return {
		name: m.pwa_name({}, at(l)),
		shortName: m.pwa_short_name({}, at(l)),
		description: m.pwa_description({}, at(l)),
	};
}

export function offlineText(m: PwaMessages, l: PushLocale): OfflineText {
	return {
		title: m.pwa_offline_title({}, at(l)),
		lead: m.pwa_offline_lead({}, at(l)),
		retry: m.pwa_offline_retry({}, at(l)),
		home: m.pwa_offline_home({}, at(l)),
	};
}

function pair(title: Plain | undefined, body: Plain | undefined, l: PushLocale) {
	return title !== undefined && body !== undefined
		? { title: title({}, at(l)), body: body({}, at(l)) }
		: undefined;
}

/** The worker's words; `{brand}` and `{headline}` stay placeholders, filled on the device. */
export function pushTexts(m: PwaMessages, l: PushLocale): PushTexts {
	const confirmed = pair(m.pwa_push_booking_confirmed_title, m.pwa_push_booking_confirmed_body, l);
	const cancelled = pair(m.pwa_push_booking_cancelled_title, m.pwa_push_booking_cancelled_body, l);
	const reminder = pair(m.pwa_push_booking_reminder_title, m.pwa_push_booking_reminder_body, l);
	return {
		"article.published": {
			title: m.pwa_push_article_title({ brand: "{brand}" }, at(l)),
			body: m.pwa_push_article_body({ headline: "{headline}" }, at(l)),
		},
		test: { title: m.pwa_push_test_title({}, at(l)), body: m.pwa_push_test_body({}, at(l)) },
		...(confirmed !== undefined ? { "booking.confirmed": confirmed } : {}),
		...(cancelled !== undefined ? { "booking.cancelled": cancelled } : {}),
		...(reminder !== undefined ? { "booking.reminder": reminder } : {}),
	};
}

export function toolsLabels(m: PwaMessages, l: PushLocale): PwaToolsLabels {
	return {
		install: m.pwa_install({}, at(l)),
		iosTitle: m.pwa_ios_title({}, at(l)),
		iosSteps: m.pwa_ios_steps({}, at(l)),
		notifications: m.pwa_notifications({}, at(l)),
	};
}

export function panelLabels(m: PwaMessages, l: PushLocale): NotifyPanelLabels {
	const o = at(l);
	return {
		notifyMe: m.pwa_notify_me({}, o),
		stop: m.pwa_notify_stop({}, o),
		on: m.pwa_notify_on({}, o),
		signInFirst: m.pwa_sign_in_first({}, o),
		unsupported: m.pwa_unsupported({}, o),
		iosInstall: m.pwa_ios_install({}, o),
		off: m.pwa_off({}, o),
		denied: m.pwa_denied({}, o),
		failed: m.pwa_failed({}, o),
		test: m.pwa_test({}, o),
		tested: m.pwa_tested({}, o),
		tooSoon: m.pwa_too_soon({}, o),
		privacy: m.pwa_privacy({}, o),
	};
}

const ARTICLE_KEY = {
	psizone: "pwa_topic_articles_psizone",
	eqsync: "pwa_topic_articles_eqsync",
	hemisync: "pwa_topic_articles_hemisync",
} as const satisfies Record<ArticleBrand, keyof PwaMessages>;

/** A topic's name in this site's words; a site never shows a topic it has no words for. */
export function topicLabel(m: PwaMessages, topic: Topic, l: PushLocale): string | undefined {
	const msg = topic === "booking" ? m.pwa_topic_booking : m[ARTICLE_KEY[topicBrand(topic)]];
	return msg?.({}, at(l));
}

function topicBrand(topic: Exclude<Topic, "booking">): ArticleBrand {
	return topic === "articles:psizone"
		? "psizone"
		: topic === "articles:eqsync"
			? "eqsync"
			: "hemisync";
}

/** The panel's rows for the topics this site offers. */
export function purposes(
	m: PwaMessages,
	l: PushLocale,
	topics: ReadonlyArray<Topic>,
): NotifyPurpose[] {
	return topics.flatMap((topic) => {
		const label = topicLabel(m, topic, l);
		const hint =
			topic === "booking"
				? m.pwa_topic_booking_hint?.({}, at(l))
				: m.pwa_topic_articles_hint({}, at(l));
		return label !== undefined && hint !== undefined ? [{ topic, label, hint }] : [];
	});
}

/** A signed-in person's devices, worded: where, since when, and what each receives. */
export function deviceRows(
	m: PwaMessages,
	l: PushLocale,
	records: ReadonlyArray<SubscriptionRecord>,
	siteName: (site: SubscriptionRecord["site"]) => string,
): DeviceRow[] {
	const date = new Intl.DateTimeFormat(l === "ro" ? "ro-RO" : "en-GB", { dateStyle: "long" });
	return records.map((r) => ({
		id: r.id,
		site: siteName(r.site),
		detail: m.pwa_device_detail(
			{
				date: date.format(r.createdAt),
				topics: r.topics.flatMap((t) => topicLabel(m, t, l) ?? []).join(", "),
			},
			at(l),
		),
	}));
}

export function devicesLabels(
	m: PwaMessages,
	l: PushLocale,
): { title: string; empty: string; remove: string } {
	return {
		title: m.pwa_devices_title({}, at(l)),
		empty: m.pwa_devices_empty({}, at(l)),
		remove: m.pwa_device_remove({}, at(l)),
	};
}
