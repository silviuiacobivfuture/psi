import { createSchedulingClient, type SchedulingClient } from "@psi/scheduling-sdk";
import { VIEW_AS_HEADER } from "@psi/scheduling-sdk/contract";
import type { ClinicPort, PortError, ViewAsTarget } from "../port";
import { adminGroup } from "./admin";
import { appointmentsGroup } from "./appointments";
import { assistantGroup } from "./assistant";
import { calendarGroup } from "./calendar";
import { catalogGroup } from "./catalog";
import { clientsGroup } from "./clients";
import { clinicalGroup } from "./clinical";
import { createContext } from "./context";
import { invitesGroup } from "./invites";
import { type Backoff, DEFAULT_BACKOFF, liveSignals } from "./live";
import { membersGroup } from "./members";
import { profileGroup } from "./profile";
import { reportsGroup } from "./reports";
import { roleSummaryGroup } from "./role-summary";

export interface SdkPortOptions {
	/** The scheduling service's origin (SCHEDULING_API_URL). */
	baseUrl: string;
	/** The signed-in person's token, asked for on every call: the service authorizes AS them, never as the console. */
	bearer: () => Promise<string>;
	/** Looking at the app as someone else: every call carries the header on which the service refuses writes. */
	viewAs?: ViewAsTarget | undefined;
	fetch?: typeof globalThis.fetch;
	timeoutMs?: number;
	backoff?: Backoff;
	/** Told of every refusal a call met (the screen may replace itself with "în curând" or "fără acces"). */
	onError?: (error: PortError) => void;
}

function withViewAs(
	base: typeof globalThis.fetch,
	viewAs: ViewAsTarget | undefined,
): typeof globalThis.fetch {
	if (viewAs === undefined) return base;
	return (input, init) => {
		const headers = new Headers(init?.headers);
		headers.set(VIEW_AS_HEADER, viewAs);
		return base(input, { ...init, headers });
	};
}

/** `ClinicPort` over the scheduling service's SDK, acting with the signed-in person's own token. */
export function createSdkPort(options: SdkPortOptions): ClinicPort {
	const api: SchedulingClient = createSchedulingClient({
		baseUrl: options.baseUrl,
		auth: { bearer: options.bearer },
		...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
		fetch: withViewAs(options.fetch ?? globalThis.fetch.bind(globalThis), options.viewAs),
	});
	const sdk = createContext(api, options.onError, options.fetch);
	const calendar = calendarGroup(sdk);
	const { clientsPage, ...cal } = calendar;
	const catalog = catalogGroup(sdk);
	const clients = clientsGroup(sdk, clientsPage);
	const clinical = clinicalGroup(sdk, clientsPage);
	const invites = invitesGroup(sdk);
	const admin = adminGroup(sdk);
	const appointments = appointmentsGroup(sdk);
	return {
		...cal,
		...appointments,
		...clients,
		...clinical,
		...catalog,
		...invites,
		...admin,
		...membersGroup(sdk),
		...reportsGroup(sdk, { columns: cal.columns, services: cal.services, calendar: cal.calendar }),
		...profileGroup(sdk),
		...assistantGroup(sdk),
		...roleSummaryGroup(sdk),
		live: (app, signal) => liveSignals(api, app, signal, options.backoff ?? DEFAULT_BACKOFF),
	};
}
