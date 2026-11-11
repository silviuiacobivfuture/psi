import type { ArticleInput, Topic } from "../schema";

/** A backlog entry from content-strategy.md: titled, placed in its hub, not yet written. */
function inReview(
	backlogNo: number,
	slug: string,
	topic: Topic,
	title: { ro: string; en: string },
): ArticleInput {
	return {
		backlogNo,
		slug,
		brand: "psizone",
		topic,
		title,
		status: "in-review",
		author: null,
		reviewer: null,
	};
}

/**
 * Wave 1 of the backlog (articles 1–10, Romanian titles exactly as in content-strategy.md). Nothing
 * clinical is written here: they carry no body until a psychologist has written and a clinician has
 * reviewed them.
 */
export const BACKLOG: ReadonlyArray<ArticleInput> = [
	inReview(1, "primele-semne-de-autism-pe-varste", "autism", {
		ro: "Primele semne de autism, pe vârste",
		en: "The first signs of autism, by age",
	}),
	inReview(2, "evaluarea-pentru-autism", "autism", {
		ro: "Ce se întâmplă la o evaluare pentru autism",
		en: "What happens at an autism assessment",
	}),
	inReview(3, "terapia-aba-pe-intelees", "autism", {
		ro: "Terapia ABA pe înțeles",
		en: "ABA therapy, plainly explained",
	}),
	inReview(4, "adhd-sau-doar-energie", "adhd", {
		ro: "ADHD sau doar energie?",
		en: "ADHD, or just energy?",
	}),
	inReview(5, "neurofeedback-pentru-atentie", "adhd", {
		ro: "Neurofeedback pentru atenție: ce spun studiile",
		en: "Neurofeedback for attention: what the studies say",
	}),
	inReview(6, "timpul-pe-ecrane", "adolescenti", {
		ro: "Timpul pe ecrane: ghid pentru părinți",
		en: "Screen time: a guide for parents",
	}),
	inReview(7, "suprastimularea-senzoriala", "integrare-senzoriala", {
		ro: "Semnele unei suprastimulări senzoriale",
		en: "The signs of sensory overload",
	}),
	inReview(8, "cand-cel-mic-nu-vorbeste", "logopedie", {
		ro: "Când să te îngrijoreze că cel mic nu vorbește",
		en: "When to worry that your little one isn’t talking",
	}),
	inReview(9, "harta-cerebrala-qeeg", "qeeg", {
		ro: "Ce este o hartă cerebrală QEEG",
		en: "What a QEEG brain map is",
	}),
	inReview(10, "atacul-de-panica", "anxietate-depresie", {
		ro: "Atacul de panică: ce e și ce ajută",
		en: "Panic attacks: what they are and what helps",
	}),
];
