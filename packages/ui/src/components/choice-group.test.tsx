/** @jsxRuntime automatic @jsxImportSource hono/jsx */
// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { ChoiceGroup, type ChoiceGroupProps } from "./choice-group";
import { TextArea, type TextAreaProps } from "./text-area";

const OPTIONS = [
	{ value: "morning", label: "Dimineața" },
	{ value: "afternoon", label: "După-amiaza" },
	{ value: "any", label: "Oricând" },
];

function render(node: unknown): HTMLElement {
	const host = document.createElement("div");
	host.innerHTML = String(node);
	return host;
}

function group(props: Partial<ChoiceGroupProps> = {}): HTMLElement {
	return render(
		<ChoiceGroup
			id="g"
			name="when"
			legend="Când?"
			options={OPTIONS}
			type="checkbox"
			checked={[]}
			{...props}
		/>,
	);
}

describe("ChoiceGroup", () => {
	it("draws every option as a native control inside its labelled pill, with the legend", () => {
		const host = group({ type: "radio", name: "forWhom" });
		expect(host.querySelector("legend")?.textContent).toBe("Când?");
		const inputs = [...host.querySelectorAll<HTMLInputElement>("label.pz-choice > input")];
		expect(inputs.map((i) => [i.type, i.name, i.value])).toEqual([
			["radio", "forWhom", "morning"],
			["radio", "forWhom", "afternoon"],
			["radio", "forWhom", "any"],
		]);
		expect([...host.querySelectorAll("label.pz-choice")].map((l) => l.textContent)).toEqual([
			"Dimineața",
			"După-amiaza",
			"Oricând",
		]);
		expect(host.querySelectorAll("label.pz-choice svg[aria-hidden=true]")).toHaveLength(3);
	});

	it("ticks exactly the values given, and none when given none", () => {
		const ticked = (h: HTMLElement) =>
			[...h.querySelectorAll<HTMLInputElement>("input")]
				.filter((i) => i.checked)
				.map((i) => i.value);
		expect(ticked(group({ checked: ["morning", "afternoon"] }))).toEqual(["morning", "afternoon"]);
		expect(ticked(group({ checked: [] }))).toEqual([]);
		expect(ticked(group({ checked: ["evening"] }))).toEqual([]);
	});

	it("a radio set is a radiogroup, required when asked; a checkbox set is a plain group, never required", () => {
		const radios = group({ type: "radio", required: true });
		expect(radios.querySelector("fieldset")?.getAttribute("role")).toBe("radiogroup");
		expect([...radios.querySelectorAll("input")].every((i) => i.required)).toBe(true);
		const boxes = group({ type: "checkbox", required: true });
		expect(boxes.querySelector("fieldset")?.hasAttribute("role")).toBe(false);
		expect([...boxes.querySelectorAll("input")].some((i) => i.required)).toBe(false);
		expect(boxes.querySelectorAll(".pz-choice__mark--box")).toHaveLength(3);
		expect(radios.querySelectorAll(".pz-choice__mark--box")).toHaveLength(0);
	});

	it("an error is shown under the options and describes the group; without one, nothing", () => {
		const bad = group({ type: "radio", error: "Eroare: alege." });
		const fieldset = bad.querySelector("fieldset");
		expect(bad.querySelector("#g-error")?.textContent).toBe("Eroare: alege.");
		expect(fieldset?.getAttribute("aria-describedby")).toBe("g-error");
		expect(fieldset?.getAttribute("aria-invalid")).toBe("true");
		expect(fieldset?.classList.contains("pz-choices--error")).toBe(true);
		const ok = group({ type: "radio" });
		expect(ok.querySelector("#g-error")).toBeNull();
		expect(ok.querySelector("fieldset")?.hasAttribute("aria-describedby")).toBe(false);
		expect(ok.querySelector("fieldset")?.hasAttribute("aria-invalid")).toBe(false);
	});

	it("focus goes to the first option only when asked, on load and after a patch", () => {
		const focused = group({ autofocus: true });
		const first = focused.querySelector("input");
		expect(first?.hasAttribute("autofocus")).toBe(true);
		expect(focused.querySelectorAll("[autofocus]")).toHaveLength(1);
		expect(group().querySelectorAll("[autofocus]")).toHaveLength(0);
	});

	it("an exclusive option wires the change handler on checkboxes only, and refuses a value that is not a plain token", () => {
		expect(
			group({ exclusive: "any" }).querySelector("fieldset")?.hasAttribute("data-on:change"),
		).toBe(true);
		expect(group().querySelector("fieldset")?.hasAttribute("data-on:change")).toBe(false);
		expect(
			group({ type: "radio", exclusive: "any" })
				.querySelector("fieldset")
				?.hasAttribute("data-on:change"),
		).toBe(false);
		expect(() => group({ exclusive: "a'b" })).toThrow(/plain token/);
	});

	it("the exclusive handler, run, clears the others when 'any' is ticked and clears 'any' when another is", () => {
		const host = group({ exclusive: "any", checked: ["morning", "afternoon"] });
		document.body.append(host);
		const fieldset = host.querySelector("fieldset");
		const handler = fieldset?.getAttribute("data-on:change") ?? "";
		const run = new Function("el", "evt", `return (${handler})`);
		const input = (v: string) => host.querySelector<HTMLInputElement>(`input[value=${v}]`);
		const any = input("any");
		if (any === null) throw new Error("no 'any' box");
		any.checked = true;
		run(fieldset, { target: any });
		expect([input("morning")?.checked, input("afternoon")?.checked, any.checked]).toEqual([
			false,
			false,
			true,
		]);
		const morning = input("morning");
		if (morning === null) throw new Error("no 'morning' box");
		morning.checked = true;
		run(fieldset, { target: morning });
		expect([morning.checked, input("afternoon")?.checked, any.checked]).toEqual([
			true,
			false,
			false,
		]);
		morning.checked = false;
		run(fieldset, { target: morning });
		expect([morning.checked, any.checked]).toEqual([false, false]);
		host.remove();
	});
});

function area(props: Partial<TextAreaProps> = {}): HTMLElement {
	return render(
		<TextArea
			id="b-details"
			name="details"
			label="Ce se întâmplă?"
			minLength={10}
			maxLength={2000}
			minHint="minim 10 caractere"
			invalid="Eroare: prea scurt."
			hint="Câteva rânduri."
			{...props}
		/>,
	);
}

describe("TextArea", () => {
	it("empty: labelled, counted at 0, the minimum hinted, no error shown or announced", () => {
		const host = area();
		const field = host.querySelector("textarea");
		expect(host.querySelector("label")?.getAttribute("for")).toBe("b-details");
		expect(field?.getAttribute("minlength")).toBe("10");
		expect(field?.getAttribute("maxlength")).toBe("2000");
		expect(field?.getAttribute("aria-invalid")).toBe("false");
		expect(field?.getAttribute("aria-describedby")).toBe("b-details-min b-details-hint");
		expect(host.querySelector(".pz-field__count")?.textContent).toBe("0 / 2000");
		expect(host.querySelector<HTMLElement>("#b-details-error")?.style.display).toBe("none");
		expect(host.querySelector<HTMLElement>("#b-details-min")?.style.display).toBe("");
		expect(host.querySelector(".pz-field")?.classList.contains("pz-field--error")).toBe(false);
	});

	it("with text long enough: its length counted, no minimum hint", () => {
		const host = area({ value: "  zece caractere  " });
		expect(host.querySelector("textarea")?.textContent).toBe("  zece caractere  ");
		expect(host.querySelector(".pz-field__count")?.textContent).toBe("18 / 2000");
		expect(host.querySelector<HTMLElement>("#b-details-min")?.style.display).toBe("none");
		expect(host.querySelector("textarea")?.getAttribute("aria-describedby")).toBe("b-details-hint");
	});

	it("short once trimmed (and CRLF counted as the server counts it): the minimum is still hinted", () => {
		const host = area({ value: "  scurt \r\n " });
		expect(host.querySelector<HTMLElement>("#b-details-min")?.style.display).toBe("");
		expect(host.querySelector(".pz-field__count")?.textContent).toBe("11 / 2000");
	});

	it("with the server's error: shown at once in the error line, invalid, the minimum hint hidden", () => {
		const host = area({ value: "abc", error: "Eroare: de la server." });
		const field = host.querySelector("textarea");
		expect(host.querySelector("#b-details-error")?.textContent).toBe("Eroare: de la server.");
		expect(host.querySelector<HTMLElement>("#b-details-error")?.style.display).toBe("");
		expect(host.querySelector<HTMLElement>("#b-details-min")?.style.display).toBe("none");
		expect(field?.getAttribute("aria-invalid")).toBe("true");
		expect(field?.getAttribute("aria-describedby")).toBe("b-details-error b-details-hint");
		expect(host.querySelector(".pz-field")?.classList.contains("pz-field--error")).toBe(true);
	});

	it("without a hint there is no note; extra attributes reach the field", () => {
		const host = area({ attrs: { autofocus: "autofocus" }, hint: undefined });
		const field = host.querySelector("textarea");
		expect(field?.hasAttribute("autofocus")).toBe(true);
		expect(host.querySelector(".pz-field__note")).toBeNull();
		expect(field?.getAttribute("aria-describedby")).toBe("b-details-min");
		expect(area().querySelector(".pz-field__note")?.textContent).toBe("Câteva rânduri.");
	});
});
