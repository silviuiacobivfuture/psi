import type { BookingOffer } from "@psi/guide";
import { describe, expect, it } from "vitest";
import {
	BookedCard,
	DetailsQuestion,
	detailsLine,
	SubmitFailed,
	SummaryCard,
} from "./chat-details";
import { fixtureEnv } from "./fixture";

const html = (node: unknown): string => String(node);
const SLOT = {
	slotId: "s",
	startsAt: "2026-11-17T08:00:00.000Z",
	date: "2026-11-17",
	time: "10:00",
	weekday: 2,
	durationMinutes: 60,
	mode: "onsite" as const,
	practitioner: "DEMO Fitter",
};
const OFFER: BookingOffer = {
	kind: "confirm",
	service: "evaluation",
	status: "ok",
	slots: [SLOT],
	chosen: SLOT,
};
type Details = NonNullable<BookingOffer["details"]>;
const asking = (over: Partial<Details> = {}): Details => ({
	values: {},
	missing: ["name", "age", "details", "phone", "email"],
	heard: [],
	ask: "name",
	nudge: false,
	edit: false,
	...over,
});
const FULL: Details = asking({
	values: {
		name: "Ana Pop",
		age: 34,
		details: "d".repeat(300),
		phone: "+40722123456",
		email: "a@b.ro",
		forWhom: "adult",
	},
	missing: [],
	ask: undefined,
});

describe("the guide's line in the details step", () => {
	const env = fixtureEnv();
	it("leads with the time on the first question, thanks by first name after a name, and names a problem", () => {
		expect(detailsLine(asking(), env, "W", true)).toBe("t:lead W q:name");
		expect(
			detailsLine(
				asking({ ask: "age", heard: ["name"], values: { name: "Ana Pop" } }),
				env,
				"W",
				false,
			),
		).toBe("t:Ana q:age");
		expect(detailsLine(asking({ ask: "age", heard: ["age"] }), env, "W", false)).toBe(
			"t:thanks q:age",
		);
		expect(
			detailsLine(
				asking({ ask: "phone", problem: { field: "phone", code: "invalid" } }),
				env,
				"W",
				false,
			),
		).toBe("i:phone");
		expect(
			detailsLine(
				asking({
					ask: "email",
					problem: { field: "email", code: "typo", suggestion: "gmail.com" },
				}),
				env,
				"W",
				false,
			),
		).toBe("i:typo gmail.com");
		expect(detailsLine(asking({ nudge: true }), env, "W", false)).toBe("t:nudge q:name");
	});
});

describe("the question, the summary and the sent request", () => {
	it("one question and one way to the form; the form is not drawn", () => {
		const out = html(<DetailsQuestion env={fixtureEnv()} offer={OFFER} details={asking()} />);
		expect(out).toContain("q:name");
		expect((out.match(/<button/g) ?? []).length).toBe(1);
		expect(out).toContain("t:form");
		expect(out).not.toContain("<form");
	});

	it("the summary lists everything, trims a long description, and has exactly Confirm and Edit", () => {
		const out = html(
			<SummaryCard env={fixtureEnv()} offer={OFFER} details={FULL} serviceLabel="Evaluare" />,
		);
		for (const text of [
			"Evaluare",
			"10:00",
			"DEMO Fitter",
			"Ana Pop",
			"34",
			"+40722123456",
			"a@b.ro",
			"u:adult",
			"cd:consent",
			"Confirmă programarea",
			"Editează",
		]) {
			expect(out, text).toContain(text);
		}
		expect(out).toContain(`${"d".repeat(160)}…`);
		expect((out.match(/<button/g) ?? []).length).toBe(2);
		expect(out).toContain("psi-guide-ask");
		expect(out).toContain("disabled = true");
	});

	it("a site with one audience does not show who it is for; a summary after a non-yes says nothing was sent", () => {
		const one = html(
			<SummaryCard
				env={fixtureEnv({ audiences: ["adult"] })}
				offer={OFFER}
				details={{ ...FULL, nudge: true }}
				serviceLabel="x"
			/>,
		);
		expect(one).not.toContain("l:for");
		expect(one).toContain("cd:nudge");
		expect(one).not.toContain("cd:lead");
	});

	it("the booked card shows the reference and the code once, the way to cancel and what happens next, and is never retired", () => {
		const booked: BookingOffer = {
			...OFFER,
			kind: "booked",
			booked: {
				name: "Ana Pop",
				reference: "ABCD2345",
				cancelCode: "WXYZ-2345-ABCD-6789",
				start: Date.parse("2026-11-17T08:00:00Z"),
				timeZone: "Europe/Bucharest",
				mode: "onsite",
				practitioner: "DEMO Fitter",
			},
		};
		const out = html(<BookedCard env={fixtureEnv()} offer={booked} id="chat-booking-x" />);
		for (const text of ["ABCD2345", "WXYZ-2345-ABCD-6789", "r:how", "b:next", "data-booked"])
			expect(out, text).toContain(text);
		expect(html(<BookedCard env={fixtureEnv()} offer={OFFER} id="x" />)).toBe("");
	});

	it("a failure is plain: the phones when the site has them, none when it has none, and the way to try again", () => {
		const phones = [{ tel: "+40700000001", display: "0700 000 001" }];
		const withPhones = html(<SubmitFailed env={fixtureEnv({ phones })} id="x" />);
		expect(withPhones).toContain("tel:+40700000001");
		expect(withPhones).toContain('role="alert"');
		expect(withPhones).toContain("k:retry");
		expect(html(<SubmitFailed env={fixtureEnv()} id="x" />)).not.toContain("tel:");
	});

	it("both languages render the same cards (the environment decides the words)", () => {
		for (const locale of ["ro", "en"] as const) {
			const out = html(
				<SummaryCard env={fixtureEnv({ locale })} offer={OFFER} details={FULL} serviceLabel="x" />,
			);
			expect(out).toContain("Ana Pop");
		}
	});
});
