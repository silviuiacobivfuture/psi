/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import { STAFF_RO, type StaffCard } from "@psi/engine/staff";
import { describe, expect, it } from "vitest";
import { CardView } from "./cards";
import { StaffPanel } from "./panel";

const ctx = { labels: STAFF_RO.panel, base: "/assistant" };

function html(card: StaffCard): string {
	const out = (<CardView card={card} ctx={ctx} />).toString();
	if (typeof out !== "string") throw new Error("async render");
	return out;
}

const presses = (out: string, tag: string): number => out.split(tag).length - 1;

describe("a quick reply is pressed once", () => {
	it("every slot of a free-times card is off while a turn runs, and sends only when none does", () => {
		const out = html({
			kind: "slots",
			title: "Ore libere",
			empty: "-",
			slots: [
				{ label: "vineri 13:00", detail: "Alfa", ask: "Alege vineri 13:00" },
				{ label: "vineri 14:00", detail: "Alfa", ask: "Alege vineri 14:00" },
			],
		});
		expect(presses(out, 'data-attr:disabled="$staff.busy"')).toBe(2);
		expect(presses(out, "if (!$staff.busy) { $staff.busy = true;")).toBe(2);
	});

	it("so is every choice and every briefing follow-up", () => {
		const choices = html({
			kind: "choices",
			title: "Care serviciu?",
			options: [{ label: "Evaluare", ask: "Evaluare [s1]" }],
		});
		expect(choices).toContain('data-attr:disabled="$staff.busy"');
		const brief = html({
			kind: "briefing",
			title: "Pe scurt",
			sections: [{ title: "Azi", tone: "neutral", items: [{ text: "x", ask: "arată" }] }],
		});
		expect(brief).toContain('data-attr:disabled="$staff.busy"');
	});

	it("the suggestion chips of the panel too", () => {
		const out = (
			<StaffPanel
				labels={STAFF_RO.panel}
				base="/assistant"
				page={{ screen: "calendar" }}
				suggestions={["unu", "doi"]}
				threadId="t"
			/>
		).toString();
		expect(presses(String(out), 'class="sa-chipbtn"')).toBe(2);
		expect(presses(String(out), 'data-attr:disabled="$staff.busy"')).toBeGreaterThanOrEqual(2);
	});

	it("a proposal's confirm and dismiss go off together at the first press, and so does undo", () => {
		const proposal = html({
			kind: "proposal",
			proposalId: "prop_1",
			title: "Programare",
			lines: [],
			destructive: false,
			expiresAt: 1,
		});
		expect(presses(proposal, "b.disabled = true")).toBe(2);
		const result = html({
			kind: "result",
			proposalId: "prop_1",
			ok: true,
			title: "Făcut",
			lines: [],
			links: [],
			undo: { proposalId: "prop_2", label: "Anulează" },
		});
		expect(result).toContain("b.disabled = true");
	});
});
