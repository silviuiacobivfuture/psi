import type { RichPage, RichSection } from "./types";

/** One section's text in one language; the section's kind and anchor come from `SHAPE`. */
export interface Part {
	h2: string;
	paras: ReadonlyArray<string>;
	list?: ReadonlyArray<string>;
}

/** One language of a hub page. `parts` follow `SHAPE`, in order. */
export interface HubSide {
	seoTitle: string;
	seoDescription: string;
	lead: string;
	parts: ReadonlyArray<Part>;
	faq: ReadonlyArray<readonly [string, string]>;
	nextStep: string;
}

/** The fixed order of a hub page's sections, shared by both languages. */
const SHAPE: ReadonlyArray<Pick<RichSection, "kind" | "id" | "ordered">> = [
	{ kind: "what", id: "ce-este" },
	{ kind: "session", id: "cum-decurge", ordered: true },
	{ kind: "measured", id: "progres" },
	{ kind: "for", id: "pentru-cine" },
	{ kind: "more", id: "metode" },
	{ kind: "not-for", id: "pentru-cine-nu" },
	{ kind: "duration", id: "durata" },
	{ kind: "where", id: "unde" },
];

/** Zips the Romanian and English sides into one `RichPage`; a mismatch fails at import. */
export function buildHub(
	ro: HubSide,
	en: HubSide,
	links: ReadonlyArray<readonly [string, string, string]>,
): RichPage {
	if (ro.parts.length !== SHAPE.length || en.parts.length !== SHAPE.length) {
		throw new Error("a hub page needs one part per section of SHAPE in both languages");
	}
	return {
		seoTitle: { ro: ro.seoTitle, en: en.seoTitle },
		seoDescription: { ro: ro.seoDescription, en: en.seoDescription },
		lead: { ro: ro.lead, en: en.lead },
		sections: SHAPE.map((shape, i): RichSection => {
			const r = ro.parts[i];
			const e = en.parts[i];
			if (r === undefined || e === undefined) throw new Error("missing part");
			return {
				...shape,
				h2: { ro: r.h2, en: e.h2 },
				paras: r.paras.map((p, j) => ({ ro: p, en: e.paras[j] ?? "" })),
				...(r.list === undefined
					? {}
					: { list: r.list.map((p, j) => ({ ro: p, en: e.list?.[j] ?? "" })) }),
			};
		}),
		faq: ro.faq.map(([q, a], i) => ({
			q: { ro: q, en: en.faq[i]?.[0] ?? "" },
			a: { ro: a, en: en.faq[i]?.[1] ?? "" },
		})),
		links: links.map(([href, labelRo, labelEn]) => ({
			href,
			label: { ro: labelRo, en: labelEn },
		})),
		nextStep: { ro: ro.nextStep, en: en.nextStep },
	};
}
