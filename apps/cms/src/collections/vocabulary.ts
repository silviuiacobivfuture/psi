/**
 * The blog's vocabulary, kept identical to packages/content/src/brands.ts and schema.ts (@psi/content)
 * (vocabulary.test.ts fails when they part).
 */
export const BRANDS = ["psizone", "eqsync", "hemisync"] as const;
export const TOPICS = [
	"autism",
	"adhd",
	"adolescenti",
	"integrare-senzoriala",
	"logopedie",
	"qeeg",
	"anxietate-depresie",
	"editorial",
	"cum-lucram",
	"programul-eqsync",
	"explorarea-constiintei",
	"cuplu-familie",
	"post-avc",
	"psiho-oncologie",
	"sport",
	"psihoterapie",
	"neuromodulare",
	"parinti",
	"creier-si-minte",
	"sunet-si-creier",
	"meditatie-si-relaxare",
] as const;
/**
 * Topics @psi/content has and the CMS does not yet: each needs a migration (the topic is a
 * Postgres enum) and regenerated types before it moves into TOPICS above. None today: the last
 * ten moved with migration 20261112_*_article_seo_faq.
 */
export const TOPICS_AWAITING_MIGRATION = [] as const;
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const TOPIC_LABELS: Readonly<Record<(typeof TOPICS)[number], { ro: string; en: string }>> = {
	autism: { ro: "Autism", en: "Autism" },
	adhd: { ro: "ADHD", en: "ADHD" },
	adolescenti: { ro: "Adolescenți", en: "Teenagers" },
	"integrare-senzoriala": { ro: "Integrare senzorială", en: "Sensory integration" },
	logopedie: { ro: "Logopedie", en: "Speech therapy" },
	qeeg: { ro: "QEEG", en: "QEEG" },
	"anxietate-depresie": { ro: "Anxietate și depresie", en: "Anxiety and depression" },
	editorial: { ro: "Editorial", en: "Editorial" },
	"cum-lucram": { ro: "Cum lucrăm", en: "How we work" },
	"programul-eqsync": { ro: "Programul EQ-SYNC", en: "The EQ-SYNC programme" },
	"explorarea-constiintei": { ro: "Explorarea conștiinței", en: "Exploring consciousness" },
	"cuplu-familie": { ro: "Cuplu și familie", en: "Couple and family" },
	"post-avc": { ro: "Recuperare după AVC", en: "Stroke recovery" },
	"psiho-oncologie": { ro: "Psiho-oncologie", en: "Psycho-oncology" },
	sport: { ro: "Sport și performanță", en: "Sport and performance" },
	psihoterapie: { ro: "Psihoterapie", en: "Psychotherapy" },
	neuromodulare: { ro: "Neuromodulare", en: "Neuromodulation" },
	parinti: { ro: "Pentru părinți", en: "For parents" },
	"creier-si-minte": { ro: "Creier și minte", en: "Brain and mind" },
	"sunet-si-creier": { ro: "Sunet și creier", en: "Sound and the brain" },
	"meditatie-si-relaxare": { ro: "Meditație și relaxare", en: "Meditation and relaxation" },
};
