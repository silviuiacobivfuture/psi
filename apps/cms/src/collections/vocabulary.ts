/**
 * The blog's vocabulary, kept identical to apps/blog-web/src/brands.ts and content/schema.ts
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
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
