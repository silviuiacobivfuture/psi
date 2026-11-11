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
] as const;
/**
 * Topics @psi/content already has and the CMS does not yet: each needs a migration (the topic is a
 * Postgres enum) and regenerated types before it moves into TOPICS above.
 */
export const TOPICS_AWAITING_MIGRATION = [
	"cum-lucram",
	"programul-eqsync",
	"explorarea-constiintei",
] as const;
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
