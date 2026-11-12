import { describe, expect, it } from "vitest";
import { type PwaMessages, purposes, pushTexts, topicLabel } from "./words";

const say = (word: string) => (_i: unknown, o: { locale: "ro" | "en" }) => `${word} ${o.locale}`;
/** Every PWA key, worded as "<key> <locale>": enough to see which word lands where. */
const M: PwaMessages = {
	pwa_name: say("pwa_name"),
	pwa_short_name: () => "Psizone",
	pwa_description: say("pwa_description"),
	pwa_install: say("pwa_install"),
	pwa_ios_title: say("pwa_ios_title"),
	pwa_ios_steps: say("pwa_ios_steps"),
	pwa_notifications: say("pwa_notifications"),
	pwa_offline_title: say("pwa_offline_title"),
	pwa_offline_lead: say("pwa_offline_lead"),
	pwa_offline_retry: say("pwa_offline_retry"),
	pwa_offline_home: say("pwa_offline_home"),
	pwa_page_title: say("pwa_page_title"),
	pwa_page_lead: say("pwa_page_lead"),
	pwa_topic_articles_hint: say("pwa_topic_articles_hint"),
	pwa_topic_articles_psizone: say("pwa_topic_articles_psizone"),
	pwa_topic_articles_eqsync: say("pwa_topic_articles_eqsync"),
	pwa_topic_articles_hemisync: say("pwa_topic_articles_hemisync"),
	pwa_topic_booking: say("pwa_topic_booking"),
	pwa_topic_booking_hint: say("pwa_topic_booking_hint"),
	pwa_notify_me: say("pwa_notify_me"),
	pwa_notify_stop: say("pwa_notify_stop"),
	pwa_notify_on: say("pwa_notify_on"),
	pwa_sign_in_first: say("pwa_sign_in_first"),
	pwa_unsupported: say("pwa_unsupported"),
	pwa_ios_install: say("pwa_ios_install"),
	pwa_off: say("pwa_off"),
	pwa_denied: say("pwa_denied"),
	pwa_failed: say("pwa_failed"),
	pwa_test: say("pwa_test"),
	pwa_tested: say("pwa_tested"),
	pwa_too_soon: say("pwa_too_soon"),
	pwa_privacy: say("pwa_privacy"),
	pwa_devices_title: say("pwa_devices_title"),
	pwa_devices_empty: say("pwa_devices_empty"),
	pwa_device_remove: say("pwa_device_remove"),
	pwa_device_detail: (i, o) => `since ${i.date}: ${i.topics} ${o.locale}`,
	pwa_push_booking_confirmed_title: say("pwa_push_booking_confirmed_title"),
	pwa_push_booking_confirmed_body: say("pwa_push_booking_confirmed_body"),
	pwa_push_booking_cancelled_title: say("pwa_push_booking_cancelled_title"),
	pwa_push_booking_cancelled_body: say("pwa_push_booking_cancelled_body"),
	pwa_push_booking_reminder_title: say("pwa_push_booking_reminder_title"),
	pwa_push_booking_reminder_body: say("pwa_push_booking_reminder_body"),
	pwa_push_article_title: (i, o) => `new from ${i.brand} ${o.locale}`,
	pwa_push_article_body: (i) => i.headline,
	pwa_push_test_title: say("pwa_push_test_title"),
	pwa_push_test_body: say("pwa_push_test_body"),
};

/** The same messages without the booking keys: a site that takes no bookings. */
const {
	pwa_topic_booking: _a,
	pwa_topic_booking_hint: _b,
	pwa_push_booking_confirmed_title: _c,
	pwa_push_booking_confirmed_body: _d,
	pwa_push_booking_cancelled_title: _e,
	pwa_push_booking_cancelled_body: _f,
	pwa_push_booking_reminder_title: _g,
	pwa_push_booking_reminder_body: _h,
	...ARTICLES_ONLY
} = M;

describe("words", () => {
	it("keeps {brand} and {headline} as placeholders for the device to fill", () => {
		const t = pushTexts(M, "en");
		expect(t["article.published"]).toEqual({ title: "new from {brand} en", body: "{headline}" });
		expect(t["booking.confirmed"]).toEqual({
			title: "pwa_push_booking_confirmed_title en",
			body: "pwa_push_booking_confirmed_body en",
		});
	});

	it("gives a site without booking words no booking texts and no booking purpose", () => {
		const t = pushTexts(ARTICLES_ONLY, "ro");
		expect(Object.keys(t).sort()).toEqual(["article.published", "test"]);
		expect(
			purposes(ARTICLES_ONLY, "ro", ["booking", "articles:eqsync"]).map((p) => p.topic),
		).toEqual(["articles:eqsync"]);
		expect(topicLabel(ARTICLES_ONLY, "booking", "ro")).toBeUndefined();
	});

	it("lists the offered purposes in order, in the locale asked for", () => {
		expect(purposes(M, "ro", ["booking", "articles:psizone"])).toEqual([
			{ topic: "booking", label: "pwa_topic_booking ro", hint: "pwa_topic_booking_hint ro" },
			{
				topic: "articles:psizone",
				label: "pwa_topic_articles_psizone ro",
				hint: "pwa_topic_articles_hint ro",
			},
		]);
	});
});
