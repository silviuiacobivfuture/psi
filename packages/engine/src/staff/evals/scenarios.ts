import type { Scenario } from "./scenario-types";
import { ACTION_SCENARIOS } from "./scenarios-actions";
import { BOOKING_SCENARIOS } from "./scenarios-booking";
import { DAY_SCENARIOS } from "./scenarios-day";
import { OFFICE_SCENARIOS } from "./scenarios-office";

export type { Expect, Move, Scenario, Wanted } from "./scenario-types";

/** Every scenario the assistant is judged on, replay and live. */
export const SCENARIOS: ReadonlyArray<Scenario> = [
	...DAY_SCENARIOS,
	...OFFICE_SCENARIOS,
	...ACTION_SCENARIOS,
	...BOOKING_SCENARIOS,
];
