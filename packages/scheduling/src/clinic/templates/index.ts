import type { FormDefinition } from "../forms";
import { ABA_SESSION_REPORT } from "./aba";
import { PARENT_QUESTIONNAIRE } from "./parent-questionnaire";
import { PSYCHOTHERAPY_REPORT } from "./psychotherapy";
import { RACE_ME_UP_REPORT } from "./race-me-up";

export { ABA_SESSION_REPORT, PARENT_QUESTIONNAIRE, PSYCHOTHERAPY_REPORT, RACE_ME_UP_REPORT };

/** The four templates of the old app, seeded into every app's builder as version 1. */
export const SEED_FORM_TEMPLATES: ReadonlyArray<FormDefinition> = [
	ABA_SESSION_REPORT,
	RACE_ME_UP_REPORT,
	PSYCHOTHERAPY_REPORT,
	PARENT_QUESTIONNAIRE,
];
