import { describe, expect, it } from "vitest";
import { fixtureEnv } from "./fixture";
import { BookingForm } from "./form";
import { BookingConfirm, BookingDone, BookingFailed, BookingRequested } from "./results";
import { withAudience } from "./schemas";

const html = (node: unknown): string => String(node);
const PHONES = [
	{ tel: "+40700000001", display: "0700 000 001" },
	{ tel: "+40700000002", display: "0700 000 002" },
];

describe("the booking form's audience question", () => {
	it("asks it, with every audience of the site, when the site serves several", () => {
		const out = html(<BookingForm env={fixtureEnv()} values={{ forWhom: "teen" }} />);
		for (const label of ["u:child", "u:teen", "u:adult"]) expect(out).toContain(label);
		expect(out).toMatch(/value="teen"[^>]*checked/);
		expect(out).not.toMatch(/value="child"[^>]*checked/);
	});

	it("asks nothing when the site serves one audience, and carries that one", () => {
		const out = html(<BookingForm env={fixtureEnv({ audiences: ["adult"] })} />);
		expect(out).toContain('type="hidden" name="forWhom" value="adult"');
		expect(out).not.toContain("u:legend");
		expect(out).not.toContain("u:child");
	});

	it("replaces what the browser sent for the audience by the one the site serves, and only then", () => {
		const raw = { forWhom: "child", name: "Ana" };
		expect(withAudience(raw, fixtureEnv({ audiences: ["adult"] }))).toEqual({
			forWhom: "adult",
			name: "Ana",
		});
		expect(withAudience(raw, fixtureEnv())).toEqual(raw);
	});
});

describe("the form's states", () => {
	it("says what it knows of the account, and nothing when sign-in is not configured", () => {
		const env = fixtureEnv();
		expect(html(<BookingForm env={env} account={{ signedIn: true }} />)).toContain("a:in");
		const out = html(<BookingForm env={env} account={{ signedIn: false, signInHref: "/in" }} />);
		expect(out).toContain('href="/in"');
		expect(out).toContain("a:signin");
		const none = html(<BookingForm env={env} />);
		expect(none).not.toContain("a:in");
		expect(none).not.toContain("a:hint");
	});

	it("shows each field error beside its field, and the slot error above the details", () => {
		const out = html(
			<BookingForm
				env={fixtureEnv()}
				errors={{
					name: "E1",
					phone: "E2",
					forWhom: "E3",
					consent: "E4",
					slot: "E5",
					age: "E6",
					details: "E7",
					email: "E8",
				}}
			/>,
		);
		for (const e of ["E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8"]) expect(out).toContain(e);
	});

	it("posts to the site's own booking route in the chat form's id", () => {
		const out = html(
			<BookingForm env={fixtureEnv({ locale: "en" })} id="chat-booking-abc123" compact />,
		);
		expect(out).toContain('id="chat-booking-abc123"');
		expect(out).toContain('action="/book"');
		expect(out).toContain('value="chat-booking-abc123"');
		expect(out).toContain("cb-abc123-name");
	});
});

describe("the failure page", () => {
	it("gives the site's numbers as links when it has some", () => {
		const out = html(<BookingFailed env={fixtureEnv({ phones: PHONES })} />);
		expect(out).toContain('role="alert"');
		expect(out).toContain("x:phones");
		expect(out).toContain('href="tel:+40700000001"');
		expect(out).toContain('href="tel:+40700000002"');
		expect(out).toContain('href="/contact"');
	});

	it("shows no numbers and no lead-in when the site has none, and never says thank you", () => {
		const out = html(<BookingFailed env={fixtureEnv()} />);
		expect(out).not.toContain("x:phones");
		expect(out).not.toContain("tel:");
		expect(out).not.toContain("ok:");
		expect(out).toContain("x:retry");
	});
});

describe("the other results", () => {
	it("thanks the visitor by name", () => {
		expect(html(<BookingDone env={fixtureEnv()} name="Ana" />)).toContain("ok:Ana");
	});

	it("the confirm step carries the hold and the way back, on the site's routes", () => {
		const out = html(
			<BookingConfirm
				env={fixtureEnv()}
				held={{
					reference: "ABCD2345",
					holdToken: "h".repeat(24),
					start: Date.parse("2026-11-20T08:00:00Z"),
					expiresAt: Date.now() + 600_000,
					practitionerName: "Ana",
					timeZone: "Europe/Bucharest",
					values: {
						name: "Ana",
						age: 30,
						details: "Ceva de spus aici",
						email: "ana@example.ro",
						phone: "+40700000001",
						forWhom: "adult",
						when: "any",
						slot: "",
						service: "",
						cards: "",
						consent: "yes",
					},
				}}
			/>,
		);
		expect(out).toContain('action="/book/confirma"');
		expect(out).toContain("/book/renunta");
		expect(out).toContain('name="holdToken"');
		expect(out).toContain("c:with:Ana");
	});

	it("the requested page shows the account link only when the site has the page and the words", () => {
		const base = { name: "Ana", reference: "REF1", cancelCode: "CODE", start: 0, timeZone: "UTC" };
		const linked = html(<BookingRequested env={fixtureEnv()} {...base} inAccount="/cont" />);
		expect(linked).toContain('href="/cont"');
		expect(linked).toContain("r:acct-link");
		expect(html(<BookingRequested env={fixtureEnv()} {...base} />)).not.toContain("r:acct");
		const withoutWords = {
			...fixtureEnv(),
			copy: {
				...fixtureEnv().copy,
				requested: { ...fixtureEnv().copy.requested, inAccount: undefined },
			},
		};
		expect(html(<BookingRequested env={withoutWords} {...base} inAccount="/cont" />)).not.toContain(
			"/cont",
		);
		expect(html(<BookingRequested env={fixtureEnv()} {...base} cancelInChat />)).toContain("r:how");
	});
});
