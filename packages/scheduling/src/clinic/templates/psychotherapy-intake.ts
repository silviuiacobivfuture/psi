import { formDefinitionSchema } from "../forms";
import { f } from "./build";

/**
 * The psychotherapy intake: the first-meeting record a psychotherapist writes about a client (the old app's
 * `psychotherapy_intake` table, one row per intake, by client). Every column of that table is a field here, under
 * its own name, so the import carries each one across and a column the old app adds later blocks rather than being
 * dropped. Free text stays free text: `age`, `category` and `referral` were typed by hand in the old app.
 * Governed like the psychotherapy report (report_psychotherapy, permissions/catalogue.ts): the same clinicians
 * write and read both.
 */
export const PSYCHOTHERAPY_INTAKE = formDefinitionSchema.parse({
	key: "psychotherapy-intake",
	version: 1,
	kind: "report",
	title: { ro: "Fișă de intake psihoterapie", en: "Psychotherapy intake" },
	fields: [
		f.text("client_code", "Cod client", "Client code"),
		f.text("age", "Vârstă", "Age"),
		f.text("category", "Categorie", "Category"),
		f.text("contact", "Contact", "Contact"),
		f.text("legal_rep", "Reprezentant legal", "Legal representative"),
		f.text("referral", "Trimis de", "Referred by"),
		f.text("therapist_name", "Terapeut", "Therapist"),
		f.date("first_session_date", "Data primei ședințe", "First session date"),
		f.longtext("presenting_problem", "Problema prezentată", "Presenting problem"),
		f.longtext(
			"personal_family_history",
			"Istoric personal și familial",
			"Personal and family history",
		),
		f.longtext(
			"medical_psychiatric_history",
			"Istoric medical și psihiatric",
			"Medical and psychiatric history",
		),
		f.longtext("trauma_history", "Istoric de traume", "Trauma history"),
		f.longtext("previous_therapy", "Terapie anterioară", "Previous therapy"),
		f.longtext("risk_factors", "Factori de risc", "Risk factors"),
		f.longtext("therapeutic_goals", "Obiective terapeutice", "Therapeutic goals"),
	],
});
