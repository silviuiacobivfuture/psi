import { formDefinitionSchema } from "../forms";
import { f } from "./build";

export const PARENT_QUESTIONNAIRE = formDefinitionSchema.parse({
	key: "parent-questionnaire",
	version: 1,
	kind: "questionnaire",
	title: { ro: "Chestionar pentru părinți", en: "Parent questionnaire" },
	fields: [
		f.choice("mood", "Dispoziția copilului", "Child's mood"),
		f.choice("sleep_quality", "Calitatea somnului", "Sleep quality"),
		f.choice("energy", "Nivelul de energie", "Energy"),
		f.choice("behavioural_crises", "Crize comportamentale", "Behavioural crises"),
		f.longtext("crises_context", "Contextul crizelor", "Context of the crises"),
		f.choice("rules_reaction", "Reacția la reguli", "Reaction to rules"),
		f.choice("focus_level", "Nivelul de concentrare", "Focus level"),
		f.choice("follows_instructions", "Urmează instrucțiunile", "Follows instructions"),
		f.choice("social_interaction", "Interacțiunea socială", "Social interaction"),
		f.choice("anxiety_frequency", "Frecvența anxietății", "Anxiety frequency"),
		f.longtext("positive_changes", "Schimbări pozitive", "Positive changes"),
		f.longtext("concerns", "Preocupări", "Concerns"),
		f.longtext("therapist_questions", "Întrebări pentru terapeut", "Questions for the therapist"),
		f.choice("overall_evolution", "Evoluția generală", "Overall evolution"),
		f.rating("reception_rating", "Evaluarea recepției", "Reception rating"),
		f.rating("staff_rating", "Evaluarea echipei", "Staff rating"),
		f.rating("space_rating", "Evaluarea spațiului", "Space rating"),
		f.choice("feels_informed", "Se simte informat", "Feels informed"),
		f.choice("schedule_fits", "Programul se potrivește", "Schedule fits"),
		f.choice("would_recommend", "Ar recomanda", "Would recommend"),
		f.longtext("suggestions", "Sugestii", "Suggestions"),
	],
});
