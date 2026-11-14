import type { EntryReason, PlanReason } from "@psi/scheduling/domain";
import { m } from "../paraglide/messages.js";
import { at, type Locale } from "./i18n";

type Say = (locale: Locale) => string;

/** Every reason the service refuses a weekly plan with, in words: a reason it adds fails the build here. */
const PLAN: Readonly<Record<PlanReason, Say>> = {
	too_many: (l) => m.av_reason_too_many_rules({}, at(l)),
	weekday: (l) => m.av_reason_weekday({}, at(l)),
	end_before_start: (l) => m.av_reason_end_before_start({}, at(l)),
	out_of_day: (l) => m.av_reason_out_of_day({}, at(l)),
	grid: (l) => m.av_reason_grid({}, at(l)),
	no_mode: (l) => m.av_reason_no_mode({}, at(l)),
	bad_date: (l) => m.av_reason_bad_date({}, at(l)),
	validity: (l) => m.av_reason_validity({}, at(l)),
	period_start: (l) => m.av_reason_period_start({}, at(l)),
	too_many_intervals: (l) => m.av_reason_too_many_intervals({}, at(l)),
	overlap: (l) => m.av_reason_overlap({}, at(l)),
};

/** Every reason the service refuses a one-off day or a room closure with, in words. */
const ENTRY: Readonly<Record<EntryReason, Say>> = {
	bad_date: (l) => m.av_reason_bad_date({}, at(l)),
	range_order: (l) => m.av_reason_range_order({}, at(l)),
	range_too_long: (l) => m.av_reason_range_too_long({}, at(l)),
	times_pair: (l) => m.av_reason_times_pair({}, at(l)),
	open_needs_hours: (l) => m.av_reason_open_needs_hours({}, at(l)),
	end_before_start: (l) => m.av_reason_end_before_start({}, at(l)),
	out_of_day: (l) => m.av_reason_out_of_day({}, at(l)),
	grid: (l) => m.av_reason_grid({}, at(l)),
	no_mode: (l) => m.av_reason_no_mode({}, at(l)),
	dst_gap: (l) => m.av_reason_dst_gap({}, at(l)),
	duplicate: (l) => m.av_reason_duplicate({}, at(l)),
	overlap: (l) => m.av_reason_entry_overlap({}, at(l)),
	day_closed: (l) => m.av_reason_day_closed({}, at(l)),
	too_many: (l) => m.av_reason_too_many_days({}, at(l)),
};

export const planReasonText = (reason: PlanReason, locale: Locale): string => PLAN[reason](locale);
export const entryReasonText = (reason: EntryReason, locale: Locale): string =>
	ENTRY[reason](locale);

/** What the service says when it will not keep a pause of online booking, plus what the form itself refuses. */
export const PAUSE_REASONS = [
	"until_before_from",
	"until_past",
	"unknown_site",
	"unknown_service",
	"unknown_practitioner",
	"too_many",
	"no_target",
	"bad_time",
	"dst_gap",
] as const;
export type PauseReason = (typeof PAUSE_REASONS)[number];

const PAUSE: Readonly<Record<PauseReason, Say>> = {
	until_before_from: (l) => m.av_pause_reason_until_before_from({}, at(l)),
	until_past: (l) => m.av_pause_reason_until_past({}, at(l)),
	unknown_site: (l) => m.av_pause_reason_unknown_site({}, at(l)),
	unknown_service: (l) => m.av_pause_reason_unknown_service({}, at(l)),
	unknown_practitioner: (l) => m.av_pause_reason_unknown_practitioner({}, at(l)),
	too_many: (l) => m.av_pause_reason_too_many({}, at(l)),
	no_target: (l) => m.av_pause_reason_no_target({}, at(l)),
	bad_time: (l) => m.av_pause_reason_bad_time({}, at(l)),
	dst_gap: (l) => m.av_reason_dst_gap({}, at(l)),
};

export const pauseReasonText = (reason: PauseReason, locale: Locale): string =>
	PAUSE[reason](locale);

const isPauseReason = (r: string): r is PauseReason =>
	(PAUSE_REASONS as ReadonlyArray<string>).includes(r);

/** A pause refusal's reason, when it is one the page words; the general "not saved" otherwise. */
export const pauseRefusalText = (reason: string | undefined, locale: Locale): string =>
	reason !== undefined && isPauseReason(reason)
		? pauseReasonText(reason, locale)
		: m.av_not_saved({}, at(locale));
