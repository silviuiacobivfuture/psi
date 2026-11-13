import type { StaffScreen, Tone } from "../events";
import type { AppointmentStatus, PackageBalance, StaffLocale } from "../model";
import type { PortRefusal } from "../port";

/** The tool keys a chip or a card title is written for. */
export const TOOL_KEYS = [
	"findClient",
	"clientSummary",
	"agenda",
	"freeSlots",
	"createAppointment",
	"moveAppointment",
	"cancelAppointment",
	"markAttendance",
	"recordPayment",
	"packageBalance",
	"roster",
	"requestLeave",
	"webRequests",
	"markRequestHandled",
	"draftReminders",
	"sendReminders",
	"searchNotes",
	"stats",
	"resolveDate",
	"roomsAt",
	"freeRooms",
	"attention",
	"paymentReminders",
	"copyWeek",
	"absence",
] as const;
export type ToolKey = (typeof TOOL_KEYS)[number];

/** Why a call or a confirmation came to nothing, in the person's words. */
export type RefusalKey =
	| PortRefusal
	| "not_allowed"
	| "tainted"
	| "repeat"
	| "ambiguous"
	| "no_match";
export type ConfirmKey =
	| "done"
	| PortRefusal
	| "unknown"
	| "expired"
	| "already_done"
	| "stale"
	| "no_principal"
	| "audit_failed";

/** Every word of the panel itself; the console passes these to the component. */
export interface PanelCopy {
	title: string;
	open: string;
	close: string;
	shortcut: string;
	placeholder: string;
	send: string;
	stop: string;
	confirm: string;
	dismiss: string;
	confirming: string;
	dismissed: string;
	expires: string;
	empty: string;
	emptyHint: string;
	you: string;
	assistant: string;
	thinking: string;
	suggestions: string;
	newChat: string;
	refusals: Record<
		"no_principal" | "rate_limited" | "invalid" | "unavailable" | "language",
		string
	>;
	sheetLabel: string;
	undo: string;
}

export interface StaffCopy {
	locale: StaffLocale;
	/** Intl locale for dates and money. */
	intl: string;
	prompt: {
		language: string;
		rulesHeading: string;
		rules: ReadonlyArray<string>;
		/** The line that opens the section holding the open screen's ids. */
		pageHeading: string;
		page(page: {
			screen: string;
			clientId?: string;
			appointmentId?: string;
			resourceId?: string;
			date?: string;
		}): string;
		today(date: string, weekday: string, timeZone: string): string;
		person(name: string, appName: string, roles: ReadonlyArray<string>): string;
		otherLanguage(detected: string): string;
	};
	chip(tool: ToolKey, phase: "running" | "done" | "refused"): string;
	refusal: Readonly<Record<RefusalKey, string>>;
	confirmOutcome: Readonly<Record<ConfirmKey, string>>;
	status: Readonly<Record<AppointmentStatus, string>>;
	statusTone: Readonly<Record<AppointmentStatus, Tone>>;
	resourceKind: Readonly<Record<"person" | "room" | "device" | "group", string>>;
	label: {
		phone: string;
		email: string;
		guardian: string;
		practitioner: string;
		status: string;
		current: string;
		archived: string;
		diagnosis: string;
		lastReport: string;
		upcoming: string;
		recent: string;
		packages: string;
		note: string;
		client: string;
		service: string;
		when: string;
		where: string;
		from: string;
		to: string;
		amount: string;
		method: string;
		package: string;
		channel: string;
		person: string;
		kind: string;
		forDay: string;
		reminder: string;
		recipients: string;
		wasWhen: string;
		reason: string;
		sessionsLeft: string;
		total: string;
		paid: string;
		due: string;
		reassigned: string;
		toReschedule: string;
		conflicts: string;
		notices: string;
		toCreate: string;
		moves: string;
		room: string;
		free: string;
		busy: string;
	};
	method: Readonly<Record<"cash" | "card" | "transfer", string>>;
	channel: Readonly<Record<"email" | "whatsapp", string>>;
	leaveKind: Readonly<Record<"leave" | "medical", string>>;
	rosterKind: Readonly<Record<"work" | "leave" | "medical" | "free", string>>;
	card: {
		agenda(scope: string): string;
		noAppointments: string;
		client(name: string): string;
		slots: string;
		noSlots: string;
		pickSlot(args: { when: string; where: string }): string;
		packages(client: string): string;
		noPackages: string;
		roster: string;
		noRoster: string;
		requests: string;
		noRequests: string;
		reminders(date: string): string;
		noReminders: string;
		notes: string;
		noNotes: string;
		stats(from: string, to: string): string;
		matches: string;
		noMatches: string;
		sessions: string;
		attended: string;
		noShows: string;
		cancelled: string;
		unpaid: string;
		unpaidClients: string;
		packageLine(p: PackageBalance, money: (bani: number) => string): string;
		handled: string;
		sent: string;
		notSent: string;
		noEmail: string;
		noPhone: string;
		rooms(time: string): string;
		freeRooms: string;
		noFreeRooms: string;
		attention: string;
		noAttention: string;
		attentionLine(args: { sessionsLeft: number; due: string; booked: number }): string;
		choose(what: string): string;
		conflictBusy: string;
		conflictLeave: string;
	};
	proposal: {
		create: string;
		move: string;
		cancel: string;
		attendance(status: "attended" | "no-show"): string;
		payment: string;
		leave: string;
		handle: string;
		reminders(n: number): string;
		paymentReminders(n: number): string;
		copyWeek(n: number): string;
		absence(name: string): string;
	};
	result: {
		done: string;
		failed: string;
		openWhatsapp(name: string): string;
		reminderSent: string;
		undo: string;
		undoTitle(title: string): string;
		progress(ran: number, total: number): string;
	};
	reminderText(args: {
		name: string;
		when: string;
		where: string;
		appName: string;
		channel: "email" | "whatsapp";
	}): string;
	paymentText(args: { name: string; due: string; appName: string }): string;
	absenceText(args: { name: string; when: string; appName: string; newWhere?: string }): string;
	briefing: {
		title(date: string): string;
		today(args: { count: number; first: string }): string;
		freeToday: string;
		unconfirmed(n: number): string;
		unpaid(n: number): string;
		lowPackages(n: number): string;
		requests(n: number): string;
		leave(names: string): string;
		conflicts(n: number): string;
		clear: string;
		sections: Record<"today" | "tomorrow" | "money" | "requests" | "team", string>;
		asks: Record<
			"agenda" | "reminders" | "attention" | "requests" | "roster" | "paymentReminders",
			string
		>;
	};
	panel: PanelCopy;
	suggestions: Readonly<Record<StaffScreen, ReadonlyArray<string>>>;
}
