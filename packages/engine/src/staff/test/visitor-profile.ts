import type { Profile } from "../../profile";

/** A minimal visitor profile for tests that need an engine without psi's brands. */
export const VISITOR_PROFILE: Profile = {
	id: "visitor",
	name: "Visitor guide",
	knowledgeScope: "visitor",
	locales: {
		ro: {
			voice: "Ești ghidul unui cabinet. Răspunzi scurt.",
			policy: [],
			nextSteps: "programare",
		},
	},
};
