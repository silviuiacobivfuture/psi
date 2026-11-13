import { accessContract } from "./access.contract";
import { catalogSection } from "./catalog.contract";
import type { ContractSection } from "./env";
import { moneyContract } from "./money.contract";
import { notifyContract } from "./notify.contract";
import { recordsContract } from "./records.contract";
import { requestsSection } from "./requests.contract";
import { visitsContract } from "./visits.contract";

/** Every section of the suite, in one list; an area adds its own here. */
export const SECTIONS: ReadonlyArray<ContractSection> = [
	accessContract,
	catalogSection,
	notifyContract,
	recordsContract,
	requestsSection,
	visitsContract,
	moneyContract,
];
