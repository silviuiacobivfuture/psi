/** The record resources of the service's catalogue: a form's responses are governed by one of these. */
export const RECORD_RESOURCES = [
	"report_aba",
	"report_racemeup",
	"report_psychotherapy",
	"report_custom",
	"questionnaire_parent",
] as const;

export const recordKeys = (action: "view" | "create" | "edit" | "delete"): string[] =>
	RECORD_RESOURCES.map((r) => `${r}_${action}`);
