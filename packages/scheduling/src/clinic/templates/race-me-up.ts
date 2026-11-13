import { formDefinitionSchema } from "../forms";
import { f } from "./build";

export const RACE_ME_UP_REPORT = formDefinitionSchema.parse({
	key: "race-me-up-report",
	version: 1,
	kind: "report",
	title: { ro: "Raport Race Me Up", en: "Race Me Up report" },
	fields: [
		f.multi("posts", "Posturi", "Posts"),
		f.multi("emotional_states", "Stări emoționale", "Emotional states"),
		f.longtext("emotional_notes", "Observații emoționale", "Emotional notes"),
		f.multi("behaviours", "Comportamente", "Behaviours"),
		f.text("other_behaviour", "Alt comportament", "Other behaviour"),
		f.multi("strategies", "Strategii", "Strategies"),
		f.text("other_strategy", "Altă strategie", "Other strategy"),
		f.rating("intervention_efficiency", "Eficiența intervenției", "Intervention efficiency"),
		f.multi("triggers", "Factori declanșatori", "Triggers"),
		f.longtext("parent_feedback", "Feedback pentru părinte", "Parent feedback"),
		f.longtext("recommendations", "Recomandări", "Recommendations"),
	],
});
