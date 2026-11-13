import type { BookingCopy, BookingEnv, BookingLocale, BookingPhone } from "./types";
import { routesUnder } from "./types";

/** Booking copy for the library's own tests: every string says where it is used. */
export const FIXTURE_COPY: BookingCopy = {
	errors: {
		name: "e:name",
		contact: "e:contact",
		forWhom: "e:for",
		consent: "e:consent",
		slot: "e:slot",
		hold: "e:hold",
	},
	account: { signedIn: "a:in", signInHint: "a:hint", signIn: "a:signin" },
	details: { title: "d:title", hint: "d:hint" },
	fields: {
		name: "f:name",
		email: "f:email",
		contactHint: "f:hint",
		phone: "f:phone",
		consent: "f:consent",
		submit: "f:submit",
	},
	audience: { legend: "u:legend", labels: { child: "u:child", teen: "u:teen", adult: "u:adult" } },
	when: { legend: "w:legend", labels: { morning: "w:am", afternoon: "w:pm", any: "w:any" } },
	done: { title: (name) => `ok:${name}`, text: "ok:text" },
	confirm: {
		title: "c:title",
		text: (time, day, minutes) => `c:${time}|${day}|${minutes}`,
		with: (who) => `c:with:${who}`,
		submit: "c:submit",
		change: "c:change",
	},
	requested: {
		title: (name) => `r:${name}`,
		text: (time, day) => `r:${time}|${day}`,
		reference: "r:ref",
		cancel: "r:cancel",
		cancelHow: "r:how",
		inAccount: { text: "r:acct", link: "r:acct-link" },
	},
	failed: { title: "x:title", text: "x:text", phones: "x:phones", retry: "x:retry" },
	picker: {
		slots: {
			duration: (m) => `${m}min`,
			chooseDay: "p:day",
			prevWeek: "p:prev",
			nextWeek: "p:next",
			today: "p:today",
			freeTimes: (n) => `${n} free`,
			noTimes: "p:none",
			parts: { morning: "p:am", afternoon: "p:pm", evening: "p:eve" },
			mode: "p:mode",
			modes: { onsite: "p:onsite", online: "p:online" },
			practitioner: "p:who",
			anyone: "p:anyone",
			selected: (when, who, mode) => `p:sel ${when} ${who} ${mode}`,
			nothingSelected: "p:nothing",
			taken: "p:taken",
			emptyWeek: "p:empty",
			jumpToNext: (range) => `p:jump ${range}`,
		},
		service: "p:service",
		unavailable: "p:unavailable",
		callback: "p:callback",
		back: "p:back",
		modeOnsite: "p:onsite",
		modeOnline: "p:online",
	},
	serviceFallback: (slug) => `svc:${slug}`,
	chat: {
		contactLink: "k:contact",
		intro: "k:intro",
		confirmPicker: "k:confirm",
		none: "k:none",
		elsewhere: "k:elsewhere",
		elsewhereCta: "k:cta",
		notices: {
			refined: "k:refined",
			relaxed: "k:relaxed",
			taken: "k:taken",
			not_free: "k:notfree",
			ambiguous: "k:ambiguous",
		},
		cancelAsk: "k:cancel-ask",
		cancelResult: {
			cancelled: "k:cancelled",
			not_found: "k:notfound",
			not_cancellable: "k:notcancellable",
			unavailable: "k:unavailable",
		},
		services: (names) => `k:services ${names}`,
		details: {
			thanksName: (name) => `t:${name}`,
			thanks: "t:thanks",
			need: (what) => `t:need ${what}`,
			needName: "t:name",
			needContact: "t:contact",
			needFor: "t:for",
			needConsent: "t:consent",
			ready: "t:ready",
			nudge: "t:nudge",
		},
		summary: { times: "s:times", confirm: "s:confirm", cancel: "s:cancel", services: "s:services" },
	},
};

/** A booking environment for the library's own tests. */
export function fixtureEnv(
	options: {
		locale?: BookingLocale;
		phones?: ReadonlyArray<BookingPhone>;
		audiences?: BookingEnv["audiences"];
	} = {},
): BookingEnv {
	return {
		locale: options.locale ?? "ro",
		copy: FIXTURE_COPY,
		routes: routesUnder("/book", "/contact"),
		phones: options.phones ?? [],
		audiences: options.audiences ?? ["child", "teen", "adult"],
	};
}
