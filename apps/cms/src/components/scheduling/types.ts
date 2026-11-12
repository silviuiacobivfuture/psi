import type { CustomKey } from "../../i18n";
import type { Reply } from "./api";

export type { T } from "../studio/types";
export { fill } from "../studio/types";

/** Runs one manager action, reloads the setup on success, and reports back what the action said. */
export type Run = (
	path: string,
	body: Readonly<Record<string, unknown>>,
	done?: (data: Record<string, unknown>) => string | null,
) => Promise<Reply<Record<string, unknown>>>;

/** What every card receives besides its own data. */
export interface CardProps {
	/** `calendar_manager` on the brand: otherwise every control is read-only. */
	canEdit: boolean;
	busy: boolean;
	run: Run;
}

const ERROR_KEYS: Readonly<Record<string, CustomKey>> = {
	invalid: "psi:scErr_invalid",
	notFound: "psi:scErr_notFound",
	exists: "psi:scErr_exists",
	unreachable: "psi:scErr_unreachable",
	notConfigured: "psi:scErr_notConfigured",
	forbidden: "psi:scErr_forbidden",
	signIn: "psi:scErr_signIn",
};

/** The words for an error key from the API; anything unknown reads as "not answering". */
export function errorKey(error: string): CustomKey {
	return ERROR_KEYS[error] ?? "psi:scErr_unreachable";
}
