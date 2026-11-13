import { formDefinitionSchema } from "../forms";
import { f } from "./build";

export const PSYCHOTHERAPY_REPORT = formDefinitionSchema.parse({
	key: "psychotherapy-report",
	version: 1,
	kind: "report",
	title: { ro: "Raport de psihoterapie", en: "Psychotherapy report" },
	fields: [
		f.choice("format", "Format", "Format"),
		f.choice("presence", "Prezență", "Presence"),
		f.number("session_number", "Numărul ședinței", "Session number"),
		f.number("duration_min", "Durata (minute)", "Duration (minutes)"),
		f.choice("mood_start", "Dispoziție la început", "Mood at start"),
		f.multi("predominant_emotions", "Emoții predominante", "Predominant emotions"),
		f.longtext("emotions_notes", "Observații despre emoții", "Emotions notes"),
		f.choice("homework_check", "Verificarea temei", "Homework check"),
		f.longtext("homework_notes", "Observații despre temă", "Homework notes"),
		f.longtext("session_content", "Conținutul ședinței", "Session content"),
		f.multi("techniques_used", "Tehnici folosite", "Techniques used"),
		f.text("nfb_method", "Metodă NFB", "NFB method"),
		f.text("nfb_protocol", "Protocol NFB", "NFB protocol"),
		f.number("nfb_duration", "Durată NFB", "NFB duration"),
		f.choice("nfb_tolerance", "Toleranță NFB", "NFB tolerance"),
		f.longtext("nfb_client_feedback", "Feedback client NFB", "NFB client feedback"),
		f.longtext("clinical_observations", "Observații clinice", "Clinical observations"),
		f.longtext("homework_assigned", "Temă dată", "Homework assigned"),
		f.longtext(
			"recommendations_next",
			"Recomandări pentru următoarea ședință",
			"Recommendations for the next session",
		),
		f.choice("mood_end", "Dispoziție la final", "Mood at end"),
		f.date("next_session_date", "Data următoarei ședințe", "Next session date"),
	],
});
