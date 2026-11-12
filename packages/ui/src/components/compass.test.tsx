/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { describe, expect, it } from "vitest";
import {
	Compass,
	type CompassChat,
	type CompassGroup,
	destinationWords,
	matchExpression,
	matchesDestination,
	queryWords,
	STAFF_KEYWORDS,
} from "./compass";

/** Evaluates a Datastar expression over `$compassQuery` as the browser would. */
function evaluate(expression: string, query: string): unknown {
	return new Function("$compassQuery", `return (${expression})`)(query);
}

const ADMIN = destinationWords({
	label: "Administrare",
	keywords: STAFF_KEYWORDS,
});
const TEAM = destinationWords({ label: "Echipa" });
const CONTACT = destinationWords({
	label: "Programează o evaluare",
	keywords: ["contact"],
});

const CHAT_PROPS: CompassChat = {
	storageKey: "psi.chat.test",
	suggestions: ["Cum arată o evaluare?", "Costă $5?"],
	labels: {
		greeting: "GREETING",
		disclaimer: "DISCLAIMER",
		newChat: "NEW",
		close: "CLOSE",
		guideTab: "GUIDE",
		pagesTab: "PAGES",
		views: "VIEWS",
		newMessage: "NEWMSG",
		placeholder: "WRITE",
		suggestions: "ASK",
		dropped: "DROPPED",
		retry: "RETRY",
		unanswered: "UNANSWERED",
	},
};

const CHAT = [
	"ce zici",
	"salut",
	"cat costa",
	"Ce zici?",
	"bună ziua",
	"a",
	"o e",
];

describe("destination matching", () => {
	it("folds diacritics and keeps words of two characters or more", () => {
		expect(queryWords("  Ședință, ȚARĂ a  ")).toEqual(["sedinta", "tara"]);
		expect(
			destinationWords({ label: "Integrare senzorială", keywords: ["Adulți"] }),
		).toEqual(["integrare", "senzoriala", "adulti"]);
	});

	it("never lists a destination for chat-like questions", () => {
		for (const q of CHAT) {
			for (const words of [ADMIN, TEAM, CONTACT]) {
				expect(matchesDestination(q, words), `${q} → ${words.join(" ")}`).toBe(
					false,
				);
			}
		}
	});

	it("matches only when every word starts a word of the destination", () => {
		expect(matchesDestination("ech", TEAM)).toBe(true);
		expect(matchesDestination("echipa noastra", TEAM)).toBe(false);
		expect(matchesDestination("progr eval", CONTACT)).toBe(true);
		expect(matchesDestination("rogr", CONTACT)).toBe(false);
	});

	it("lists Administrare only for admin, administrare, panou, control", () => {
		for (const q of ["admin", "Administrare", "panou", "control", "adm"]) {
			expect(matchesDestination(q, ADMIN), q).toBe(true);
		}
		for (const q of [
			"ce zici",
			"de",
			"al",
			"situri",
			"minist",
			"panoul de control",
		]) {
			expect(matchesDestination(q, ADMIN), q).toBe(false);
		}
	});

	it("lists everything for an empty field and nothing for one-letter words", () => {
		expect(matchesDestination("", TEAM)).toBe(true);
		expect(matchesDestination("   ", TEAM)).toBe(true);
		expect(matchesDestination("e", TEAM)).toBe(false);
	});

	it("the Datastar expression decides exactly as the function", () => {
		const queries = [
			...CHAT,
			"",
			" ",
			"ech",
			"admin",
			"panou",
			"progr eval",
			"Echipă",
			"ce",
		];
		for (const words of [ADMIN, TEAM, CONTACT]) {
			const expression = matchExpression(words);
			for (const q of queries)
				expect(evaluate(expression, q), q).toBe(matchesDestination(q, words));
		}
	});
});

describe("the compass", () => {
	const groups: ReadonlyArray<CompassGroup> = [
		{
			label: "Centrul",
			items: [{ label: "Echipa", href: "/echipa", hint: "Cine suntem" }],
		},
	];
	const html = String(
		<Compass
			label="L"
			placeholder="P"
			toggleLabel="T"
			askHint="Întreabă ghidul"
			groups={groups}
			guideAction="/ghid?target=compass-answer"
			answerId="compass-answer"
			staffLink="/__admin/compass?l=ro"
			chat={CHAT_PROPS}
		/>,
	);

	it("asks on Enter: the submit opens only an arrow-picked destination, never the first match", () => {
		expect(html).toContain("pz-compass__item.is-picked");
		expect(html).not.toContain("if (q &amp;&amp; a)");
		expect(html).toContain("compassOp: &#39;ask&#39;");
		expect(html).toContain('maxlength="500"');
	});

	it("puts the ask row first, then the destinations, and filters the staff group by its keywords", () => {
		expect(html.indexOf('id="pz-compass-ask"')).toBeLessThan(
			html.indexOf("pz-compass__groups"),
		);
		expect(html).toContain('id="pz-dest-0-0"');
		expect(html).toContain("el.psiFilter");
		expect(html).toContain(
			"[&quot;admin&quot;,&quot;administrare&quot;,&quot;panou&quot;,&quot;control&quot;]",
		);
	});
});

describe("compassDestinations (the apps' test helper)", () => {
	it("reads the rendered expressions and lists only real matches", async () => {
		const { compassDestinations } = await import("../testing");
		const html = String(
			<Compass
				label="L"
				placeholder="P"
				toggleLabel="T"
				askHint="A"
				groups={[{ label: "G", items: [{ label: "Echipa", href: "/echipa" }] }]}
				guideAction="/ghid"
				answerId="compass-answer"
				chat={CHAT_PROPS}
			/>,
		);
		expect(compassDestinations(html, "")).toEqual(["/echipa"]);
		expect(compassDestinations(html, "ech")).toEqual(["/echipa"]);
		expect(compassDestinations(html, "ce zici")).toEqual([]);
	});
});
