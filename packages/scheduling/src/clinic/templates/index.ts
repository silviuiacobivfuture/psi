import type { FormDefinition } from "../forms";
import { ABA_SESSION_REPORT } from "./aba";
import { PARENT_QUESTIONNAIRE } from "./parent-questionnaire";
import { PSYCHOTHERAPY_REPORT } from "./psychotherapy";
import { PSYCHOTHERAPY_INTAKE } from "./psychotherapy-intake";
import { RACE_ME_UP_REPORT } from "./race-me-up";

export {
	ABA_SESSION_REPORT,
	PARENT_QUESTIONNAIRE,
	PSYCHOTHERAPY_INTAKE,
	PSYCHOTHERAPY_REPORT,
	RACE_ME_UP_REPORT,
};

/**
 * The five templates of the old app, seeded into every app's builder as version 1. An app made before one of them
 * existed receives it the next time it is completed (clinicApps.ensureApp, which the import calls on every real run).
 */
export const SEED_FORM_TEMPLATES: ReadonlyArray<FormDefinition> = [
	ABA_SESSION_REPORT,
	RACE_ME_UP_REPORT,
	PSYCHOTHERAPY_REPORT,
	PARENT_QUESTIONNAIRE,
	PSYCHOTHERAPY_INTAKE,
];
