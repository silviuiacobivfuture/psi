import type { BlogBrand } from "../brands";
import type { Locale } from "../i18n";
import { m } from "../paraglide/messages.js";
import { type Topic, TopicSchema } from "./schema";

type Text = (o: { locale: Locale }) => string;

const LABELS: Readonly<Record<Topic, Text>> = {
	autism: (o) => m.topic_autism({}, o),
	adhd: (o) => m.topic_adhd({}, o),
	adolescenti: (o) => m.topic_adolescenti({}, o),
	"integrare-senzoriala": (o) => m.topic_integrare_senzoriala({}, o),
	logopedie: (o) => m.topic_logopedie({}, o),
	qeeg: (o) => m.topic_qeeg({}, o),
	"anxietate-depresie": (o) => m.topic_anxietate_depresie({}, o),
	editorial: (o) => m.topic_editorial({}, o),
};

/** The hub on the brand's site that a topic belongs to, when that hub is live. */
const HUBS: Readonly<Partial<Record<Topic, string>>> = {
	autism: "/copii/autism",
	adhd: "/copii/adhd",
	adolescenti: "/adolescenti",
	"integrare-senzoriala": "/copii/integrare-senzoriala",
	logopedie: "/copii/logopedie",
	"anxietate-depresie": "/adulti/anxietate-depresie",
};

const BRAND_NAMES: Readonly<Record<BlogBrand, Text>> = {
	psizone: (o) => m.brand_psizone({}, o),
	eqsync: (o) => m.brand_eqsync({}, o),
	hemisync: (o) => m.brand_hemisync({}, o),
};

export function topicLabel(topic: Topic, locale: Locale): string {
	return LABELS[topic]({ locale });
}

export function topicHub(topic: Topic): string | undefined {
	return HUBS[topic];
}

export function brandName(brand: BlogBrand, locale: Locale): string {
	return BRAND_NAMES[brand]({ locale });
}

/** `?topic=` on the index: a known topic filters, anything else means all topics. */
export function topicFrom(query: string | undefined): Topic | undefined {
	const parsed = TopicSchema.safeParse(query);
	return parsed.success ? parsed.data : undefined;
}
