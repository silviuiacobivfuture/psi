import type { Locale } from "../i18n";
import { m } from "../paraglide/messages.js";

type Text = (o: { locale: Locale }) => string;

export interface Hub {
	id: string;
	/** Romanian slug, served under both locales until English slugs exist. */
	path: string;
	eyebrow: Text;
	title: Text;
	text: Text;
	/** Articles from the content backlog that will feed this hub. */
	spokes: ReadonlyArray<Text>;
	hue: 1 | 2 | 3;
}

/** The condition hubs live today (six of the ten in the content strategy). */
export const HUBS: ReadonlyArray<Hub> = [
	{
		id: "autism",
		path: "/copii/autism",
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
		eyebrow: (o) => m.hub_adhd_eyebrow({}, o),
		title: (o) => m.hub_adhd_title({}, o),
		text: (o) => m.hub_adhd_text({}, o),
		spokes: [(o) => m.spoke_adhd_1({}, o), (o) => m.spoke_adhd_2({}, o)],
		hue: 2,
	},
	{
		id: "sensory",
		path: "/copii/integrare-senzoriala",
		eyebrow: (o) => m.hub_sensory_eyebrow({}, o),
		title: (o) => m.hub_sensory_title({}, o),
		text: (o) => m.hub_sensory_text({}, o),
		spokes: [(o) => m.spoke_sensory_1({}, o)],
		hue: 3,
	},
	{
		id: "speech",
		path: "/copii/logopedie",
		eyebrow: (o) => m.hub_speech_eyebrow({}, o),
		title: (o) => m.hub_speech_title({}, o),
		text: (o) => m.hub_speech_text({}, o),
		spokes: [(o) => m.spoke_speech_1({}, o)],
		hue: 1,
	},
	{
		id: "teens",
		path: "/adolescenti",
		eyebrow: (o) => m.hub_teens_eyebrow({}, o),
		title: (o) => m.hub_teens_title({}, o),
		text: (o) => m.hub_teens_text({}, o),
		spokes: [(o) => m.spoke_teens_1({}, o), (o) => m.spoke_teens_2({}, o)],
		hue: 2,
	},
	{
		id: "adults",
		path: "/adulti/anxietate-depresie",
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
];
