import type { Locale } from "../i18n";
import { m } from "../paraglide/messages.js";
import type { Localised } from "./localised";

type Text = (o: { locale: Locale }) => string;

/** Who a hub speaks to: the groups the home page and the compass show hubs in. */
export type HubGroup = "children" | "teens-adults" | "programmes";

export interface Hub {
	id: string;
	/** Romanian slug, served under both locales until English slugs exist. */
	path: string;
	group: HubGroup;
	eyebrow: Text;
	title: Text;
	text: Text;
	/** A documented fact set under the lead (never an outcome claim). */
	note?: Text;
	/** Articles from the content backlog that will feed this hub. */
	spokes: ReadonlyArray<Text>;
	/** Related pages on this site, linked from the hub. */
	related?: ReadonlyArray<{ label: Text; href: string }>;
	hue: 1 | 2 | 3;
}

const text =
	(x: Localised): Text =>
	(o) =>
		x[o.locale];

/** The ten condition and programme hubs of the content strategy. */
export const HUBS: ReadonlyArray<Hub> = [
	{
		id: "autism",
		path: "/copii/autism",
		group: "children",
		eyebrow: (o) => m.hub_autism_eyebrow({}, o),
		title: (o) => m.hub_autism_title({}, o),
		text: (o) => m.hub_autism_text({}, o),
		spokes: [
			(o) => m.spoke_autism_1({}, o),
			(o) => m.spoke_autism_2({}, o),
			(o) => m.spoke_autism_3({}, o),
		],
		hue: 1,
	},
	{
		id: "adhd",
		path: "/copii/adhd",
		group: "children",
		eyebrow: (o) => m.hub_adhd_eyebrow({}, o),
		title: (o) => m.hub_adhd_title({}, o),
		text: (o) => m.hub_adhd_text({}, o),
		spokes: [(o) => m.spoke_adhd_1({}, o), (o) => m.spoke_adhd_2({}, o)],
		hue: 2,
	},
	{
		id: "sensory",
		path: "/copii/integrare-senzoriala",
		group: "children",
		eyebrow: (o) => m.hub_sensory_eyebrow({}, o),
		title: (o) => m.hub_sensory_title({}, o),
		text: (o) => m.hub_sensory_text({}, o),
		note: text({
			ro: "În cabinetul nostru am amenajat prima sală de integrare senzorială și polisenzorială din Galați.",
			en: "In our practice we fitted out Galați's first sensory and multisensory integration room.",
		}),
		spokes: [(o) => m.spoke_sensory_1({}, o)],
		hue: 3,
	},
	{
		id: "speech",
		path: "/copii/logopedie",
		group: "children",
		eyebrow: (o) => m.hub_speech_eyebrow({}, o),
		title: (o) => m.hub_speech_title({}, o),
		text: (o) => m.hub_speech_text({}, o),
		spokes: [(o) => m.spoke_speech_1({}, o)],
		hue: 1,
	},
	{
		id: "teens",
		path: "/adolescenti",
		group: "teens-adults",
		eyebrow: (o) => m.hub_teens_eyebrow({}, o),
		title: (o) => m.hub_teens_title({}, o),
		text: (o) => m.hub_teens_text({}, o),
		spokes: [(o) => m.spoke_teens_1({}, o), (o) => m.spoke_teens_2({}, o)],
		hue: 2,
	},
	{
		id: "adults",
		path: "/adulti/anxietate-depresie",
		group: "teens-adults",
		eyebrow: (o) => m.hub_adults_eyebrow({}, o),
		title: (o) => m.hub_adults_title({}, o),
		text: (o) => m.hub_adults_text({}, o),
		spokes: [
			(o) => m.spoke_adults_1({}, o),
			(o) => m.spoke_adults_2({}, o),
			(o) => m.spoke_adults_3({}, o),
		],
		hue: 3,
	},
	/*
	 * DRAFT — owner and clinical review pending (written 2026-11-12). The four hubs below are in the
	 * content strategy and the plan's sitemap; their titles and spokes come from
	 * docs/brands/content-strategy.md, the one-liners are new copy, and the sport note restates the
	 * owners' story (content/story.ts).
	 */
	{
		id: "couple",
		path: "/adulti/cuplu-familie",
		group: "teens-adults",
		eyebrow: text({ ro: "Adulți", en: "Adults" }),
		title: text({ ro: "Cuplu și familie", en: "Couples and family" }),
		text: text({
			ro: "Certuri care se repetă, distanță, un copil în terapie: lucrăm cu cuplul sau cu toată familia.",
			en: "Arguments that keep coming back, distance, a child in therapy: we work with the couple or the whole family.",
		}),
		spokes: [
			text({
				ro: "Semne că terapia de cuplu v-ar ajuta",
				en: "Signs couples therapy could help",
			}),
			text({
				ro: "Terapia de familie când un copil e în tratament",
				en: "Family therapy when a child is in treatment",
			}),
		],
		hue: 1,
	},
	{
		id: "stroke",
		path: "/adulti/post-avc",
		group: "teens-adults",
		eyebrow: text({ ro: "Adulți și seniori", en: "Adults and seniors" }),
		title: text({ ro: "După un AVC", en: "After a stroke" }),
		text: text({
			ro: "Schimbările emoționale de după un AVC și sprijinul pentru familie.",
			en: "The emotional changes after a stroke, and support for the family.",
		}),
		spokes: [
			text({
				ro: "Schimbările emoționale după un AVC",
				en: "Emotional changes after a stroke",
			}),
			text({
				ro: "Cum îți sprijini părintele după un AVC",
				en: "Supporting a parent after a stroke",
			}),
		],
		hue: 2,
	},
	{
		id: "oncology",
		path: "/adulti/psiho-oncologie",
		group: "teens-adults",
		eyebrow: text({ ro: "Pacienți și familii", en: "Patients and families" }),
		title: text({ ro: "Psiho-oncologie", en: "Psycho-oncology" }),
		text: text({
			ro: "Sprijin psihologic la un diagnostic de cancer, pentru pacient și pentru cei apropiați.",
			en: "Psychological support with a cancer diagnosis, for the patient and those close to them.",
		}),
		spokes: [
			text({
				ro: "Cum faci față unui diagnostic de cancer",
				en: "Coping with a cancer diagnosis",
			}),
			text({ ro: "Grija pentru cel care îngrijește", en: "Caring for the carer" }),
		],
		hue: 3,
	},
	{
		id: "sport",
		path: "/programe/sport",
		group: "programmes",
		eyebrow: text({ ro: "Sportivi și părinți", en: "Athletes and parents" }),
		title: text({ ro: "Psihologie sportivă", en: "Sport psychology" }),
		text: text({
			ro: "Tracul dinaintea competiției, concentrarea, presiunea: partea mentală a performanței.",
			en: "Pre-competition nerves, focus, pressure: the mental side of performance.",
		}),
		note: text({
			ro: "Am lucrat cu piloți de automobilism și cu sportivi de taekwondo, tenis, karate, gimnastică și înot.",
			en: "We have worked with racing drivers and with athletes in taekwondo, tennis, karate, gymnastics and swimming.",
		}),
		spokes: [
			text({ ro: "Emoțiile înainte de competiție", en: "Emotions before a competition" }),
			text({ ro: "Partea mentală a motorsportului", en: "The mental side of motorsport" }),
		],
		related: [
			{
				label: text({ ro: "Programul Race Me Up", en: "The Race Me Up programme" }),
				href: "/programe/race-me-up",
			},
			{ label: text({ ro: "Povestea noastră", en: "Our story" }), href: "/povestea" },
		],
		hue: 1,
	},
];
