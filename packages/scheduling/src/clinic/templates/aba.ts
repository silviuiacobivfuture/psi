import { formDefinitionSchema } from "../forms";
import { f } from "./build";

export const ABA_SESSION_REPORT = formDefinitionSchema.parse({
	key: "aba-session-report",
	version: 1,
	kind: "report",
	title: { ro: "Raport de ședință ABA", en: "ABA session report" },
	fields: [
		f.multi("programs", "Programe lucrate", "Programs worked on"),
		f.multi("rewards_used", "Recompense folosite", "Rewards used"),
		f.multi("reward_types", "Tipuri de recompense", "Reward types"),
		f.choice("reward_quality", "Calitatea recompensei", "Reward quality"),
		f.longtext("other_details", "Alte detalii", "Other details"),
		f.multi("receptive_to", "Receptiv la", "Receptive to"),
		f.longtext("gaps_observed", "Lacune observate", "Gaps observed"),
		f.longtext("retained_skills", "Abilități reținute", "Retained skills"),
		f.longtext("improvements_needed", "Îmbunătățiri necesare", "Improvements needed"),
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
