import type { StaffCopy } from "./copy";
import type { StaffPage } from "./events";
import { dateLabel, todayIn, weekdayName } from "./format";
import type { Principal } from "./model";

/** The agent's standing instructions in the person's language: its voice and its numbered rules. */
export function staffInstructions(copy: StaffCopy): string {
	const rules = copy.prompt.rules.map((rule, i) => `${i + 1}. ${rule}`);
	return `${copy.prompt.language}\n\n${[copy.prompt.rulesHeading, ...rules].join("\n")}`;
}

/** The turn's notes: who is asking, today's date and the open screen (ids only), each as context. */
export function staffNotes(args: {
	copy: StaffCopy;
	principal: Principal;
	page: StaffPage | undefined;
	timeZone: string;
	now: number;
	otherLanguage: string | undefined;
}): string {
	const { copy, principal, page, timeZone, now, otherLanguage } = args;
	const day = todayIn(timeZone, now);
	return [
		copy.prompt.person(principal.name, principal.appName, principal.roles),
		copy.prompt.today(`${day} (${dateLabel(copy, day)})`, weekdayName(copy, day), timeZone),
		...(page === undefined ? [] : [`${copy.prompt.pageHeading}\n${copy.prompt.page(page)}`]),
		...(otherLanguage === undefined ? [] : [copy.prompt.otherLanguage(otherLanguage)]),
	].join("\n\n");
}
