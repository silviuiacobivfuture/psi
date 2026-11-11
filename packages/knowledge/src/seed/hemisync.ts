import type { KnowledgeEntryInput } from "../entry";

/**
 * Hemi-Sync România, Romanian and English. Copied from the site's own copy
 * (apps/hemisync-web/messages/{ro,en}.json: gateway_*, synccreation_*, lucid_*, exercises_*,
 * ex_*, tech_*, method_*, focus_*, club_*, footer_tagline, footer_trademarks). No health claims
 * (the sentence of tech_text about what the brain does is left out), no prices.
 */

type Locale = "ro" | "en";

const common = {
	brand: "hemisync",
	status: "published",
	reviewedBy: null,
	reviewedAt: null,
} as const;

function home(locale: Locale, anchor: string): string {
	return locale === "ro" ? `/#${anchor}` : `/en/#${anchor}`;
}

interface Copy {
	slug: string;
	kind: "programme" | "operational";
	anchor: string;
	title: Record<Locale, string>;
	body: Record<Locale, ReadonlyArray<string>>;
}

const COPY: ReadonlyArray<Copy> = [
	{
		slug: "programmes",
		kind: "programme",
		anchor: "programe",
		title: {
			ro: "Programele Monroe Institute® în română",
			en: "Monroe Institute® programmes in Romanian",
		},
		body: {
			ro: [
				"## Drumuri ghidate către conștiență",
				"",
				"Programe oficiale ale Monroe Institute în limba română, facilitate de traineri acreditați. Explorarea conștiinței prin tehnologia audio Hemi-Sync®.",
				"",
				"- **Gateway Voyage®** (program de bază): programul fundamental de explorare a conștiinței.",
				"- **SyncCreation®** (program Monroe): devino un co-creator conștient al vieții tale.",
				"- **Lucid Dreaming®** (nou, 2026): conștient în interiorul propriilor vise.",
				"",
				"Dacă vrei să începi fără plată, pornește de la exercițiile gratuite.",
				"",
				"Hemi-Sync® este marcă înregistrată a Interstate Industries, Inc. Monroe® este marcă înregistrată a Monroe Institute.",
			],
			en: [
				"## Guided paths towards awareness",
				"",
				"Official Monroe Institute programmes in Romanian, facilitated by accredited trainers. Exploring consciousness through Hemi-Sync® audio technology.",
				"",
				"- **Gateway Voyage®** (foundation programme): the foundational programme for exploring consciousness.",
				"- **SyncCreation®** (Monroe programme): become a conscious co-creator of your life.",
				"- **Lucid Dreaming®** (new, 2026): aware inside your own dreams.",
				"",
				"If you want to begin free of charge, start with the free exercises.",
				"",
				"Hemi-Sync® is a registered trademark of Interstate Industries, Inc. Monroe® is a registered trademark of the Monroe Institute.",
			],
		},
	},
	{
		slug: "free-exercises",
		kind: "programme",
		anchor: "exercitii",
		title: { ro: "Exercițiile gratuite Hemi-Sync®", en: "The free Hemi-Sync® exercises" },
		body: {
			ro: [
				"## Începe cu exercițiile gratuite",
				"",
				"Exerciții audio Hemi-Sync®, ascultate direct de pe site, fără plată:",
				"",
				"- **Introducere în tehnologia Hemi-Sync®** (exercițiu introductiv): te familiarizează cu tehnologia audio Hemi-Sync®.",
				"- **Intro to DEC** (Dolphin Energy Club): exercițiul introductiv al Clubului Delfinului (Dolphin Energy Club), creat în cadrul Monroe Institute.",
				"- **Forgiveness** (meditație): „Iertarea”, o meditație oferită de Institutul Monroe celor care poartă amintiri dureroase.",
				"- **Spirit of the Season** (exercițiu de sărbători): o călătorie scurtă către cei dragi și către Pământul văzut de sus, cu zăpadă.",
				"",
				"Ascultă în căști, într-o poziție confortabilă și într-un loc liniștit, unde nu vei fi deranjat.",
			],
			en: [
				"## Start with the free exercises",
				"",
				"Hemi-Sync® audio exercises, to listen to right on the site, free of charge:",
				"",
				"- **Introduction to Hemi-Sync® technology** (introductory exercise): get to know Hemi-Sync® audio technology.",
				"- **Intro to DEC** (Dolphin Energy Club): the introductory exercise of the Dolphin Energy Club, created within the Monroe Institute.",
				"- **Forgiveness** (meditation): a meditation the Monroe Institute offers to everyone who carries painful memories.",
				"- **Spirit of the Season** (holiday exercise): a short journey to your loved ones and to the Earth seen from above, under snow.",
				"",
				"Listen with headphones, in a comfortable position and a quiet place where you won't be disturbed.",
			],
		},
	},
	{
		slug: "headphones",
		kind: "operational",
		anchor: "tehnologia",
		title: { ro: "Cum asculți: în căști", en: "How to listen: with headphones" },
		body: {
			ro: [
				"## Ascultă în căști",
				"",
				"Ascultă în căști. Sunt tonuri joase: pe difuzoarele laptopului aproape nu se aud, iar efectul binaural nu apare deloc.",
				"",
				"Alege o poziție confortabilă și un loc liniștit, unde nu vei fi deranjat.",
			],
			en: [
				"## Listen with headphones",
				"",
				"Listen with headphones. These are low tones: laptop speakers barely play them, and the binaural effect does not appear at all.",
				"",
				"Choose a comfortable position and a quiet place where you won't be disturbed.",
			],
		},
	},
	{
		slug: "technology",
		kind: "programme",
		anchor: "tehnologia",
		title: { ro: "Tehnologia Hemi-Sync®", en: "Hemi-Sync® technology" },
		body: {
			ro: [
				"## Sincronizare emisferică, prin sunet",
				"",
				"Hemi-Sync® transmite sunete precise, ușor diferite, către fiecare ureche: de exemplu 100 Hz în urechea stângă și 104 Hz în urechea dreaptă; diferența de 4 Hz este a treia frecvență, cea percepută.",
				"",
				"## O metodă, nu o credință",
				"",
				"Hemi-Sync® nu îți cere să crezi nimic. Îți oferă experiența directă: tehnologii audio care te susțin în explorarea propriei conștiințe, cu respect deplin pentru liberul tău arbitru.",
			],
			en: [
				"## Hemispheric synchronisation, through sound",
				"",
				"Hemi-Sync® sends precise, slightly different sounds to each ear: for example 100 Hz in the left ear and 104 Hz in the right; the 4 Hz difference is the third frequency, the one perceived.",
				"",
				"## A method, not a belief",
				"",
				"Hemi-Sync® asks you to believe nothing. It offers direct experience: audio technologies that support you in exploring your own consciousness, with full respect for your free will.",
			],
		},
	},
	{
		slug: "focus-levels",
		kind: "programme",
		anchor: "focus",
		title: { ro: "Nivelurile Focus", en: "The Focus levels" },
		body: {
			ro: [
				"## Nivelurile Focus: harta conștiinței",
				"",
				"Nivelurile Focus sunt nume date unor stări de conștiință pe care le explorezi treptat, ghidat de sunet. Sunt repere ale experienței tale, nu trepte de urcat.",
				"",
				"- **Focus 10, mintea trează, corpul adormit:** primul prag: relaxare totală a corpului, în timp ce mintea rămâne lucidă și alertă.",
				"- **Focus 12, conștientizare extinsă:** atenția se lărgește dincolo de percepția obișnuită: un spațiu pentru intuiție, vizualizare și claritate.",
				"- **Focus 15, starea fără timp:** percepția obișnuită a timpului liniar se estompează; rămâne o liniște profundă.",
				"- **Focus 21, granița dintre lumi:** corpul ajunge într-o relaxare foarte profundă, iar conștiința rămâne trează și capabilă să exploreze.",
				"",
				"Sunt descrieri ale experienței ascultătorilor, nu afirmații despre realitate.",
			],
			en: [
				"## The Focus levels: a map of consciousness",
				"",
				"The Focus levels are names for states of consciousness you explore gradually, guided by sound. They are landmarks of your experience, not steps to climb.",
				"",
				"- **Focus 10, mind awake, body asleep:** the first threshold: the body fully relaxed while the mind stays lucid and alert.",
				"- **Focus 12, expanded awareness:** attention widens beyond ordinary perception: room for intuition, visualisation and clarity.",
				"- **Focus 15, the state of no time:** the usual sense of linear time fades; a deep stillness remains.",
				"- **Focus 21, the edge between worlds:** the body reaches a very deep relaxation while awareness stays awake and able to explore.",
				"",
				"These are descriptions of what listeners experience, not claims about reality.",
			],
		},
	},
	{
		slug: "dolphin-club",
		kind: "programme",
		anchor: "club",
		title: { ro: "Clubul Delfinului", en: "The Dolphin Energy Club" },
		body: {
			ro: [
				"## Clubul Delfinului",
				"",
				"Clubul de Energie al Delfinului (Dolphin Energy Club) reunește ascultătorii care practică împreună exercițiul DEC, creat în cadrul Monroe Institute. Poți începe cu exercițiul introductiv, gratuit: Intro to DEC.",
				"",
				"Clubul este complementar și nu înlocuiește tratamentul medical sau psihologic.",
			],
			en: [
				"## The Dolphin Energy Club",
				"",
				"The Dolphin Energy Club brings together listeners who practise the DEC exercise together, created within the Monroe Institute. You can begin with the free introductory exercise: Intro to DEC.",
				"",
				"The club is complementary and does not replace medical or psychological treatment.",
			],
		},
	},
];

function entries(locale: Locale): ReadonlyArray<KnowledgeEntryInput> {
	return COPY.map((c) => ({
		...common,
		locale,
		id: `hemisync-${locale}-${c.slug}`,
		kind: c.kind,
		title: c.title[locale],
		url: home(locale, c.anchor),
		body: c.body[locale].join("\n"),
	}));
}

export const HEMISYNC_RO: ReadonlyArray<KnowledgeEntryInput> = entries("ro");
export const HEMISYNC_EN: ReadonlyArray<KnowledgeEntryInput> = entries("en");
