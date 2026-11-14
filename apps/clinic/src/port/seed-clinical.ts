import type { Client } from "./schema";
import type { BlacklistEntry, ClientFile, ClientNote, ClientRecord } from "./schema-clinical";

/** Notes, blacklist entries, records and files of the synthetic clinic; everything invented. */
export interface ClinicalData {
	notes: ClientNote[];
	blacklist: BlacklistEntry[];
	records: ClientRecord[];
	files: Array<{ meta: ClientFile; bytes: Uint8Array }>;
}

const enc = (text: string): Uint8Array => new TextEncoder().encode(text);

export function seedClinical(clients: ReadonlyArray<Client>, today: string): ClinicalData {
	const id = (n: number): string | undefined => clients[n]?.id;
	const [c1, c2, c3, c4, c5] = [id(0), id(1), id(2), id(3), id(4)];
	const note = (
		n: number,
		clientId: string | undefined,
		over: Partial<ClientNote> & Pick<ClientNote, "body" | "category">,
	): ClientNote[] =>
		clientId === undefined
			? []
			: [
					{
						id: `n${n}`,
						clientId,
						pinned: false,
						authorSubject: "mock-ana-7f3c",
						authorName: "Ana Test",
						createdAt: `${today}T09:10:00`,
						editedAt: null,
						...over,
					},
				];
	const notes: ClientNote[] = [
		...note(1, c1, {
			body: "Părintele preferă mesaje, nu apeluri, după ora 17.",
			category: "administrative",
			pinned: true,
		}),
		...note(2, c1, {
			body: "Reacționează bine la pauze scurte; evităm sunetele puternice.",
			category: "clinical",
			authorSubject: "t1",
			authorName: "Terapeut Alfa",
			createdAt: `${today}T08:00:00`,
		}),
		...note(3, c1, {
			body: "A cerut factură pe firmă pentru pachetul curent.",
			category: "payment",
			editedAt: `${today}T11:30:00`,
		}),
		...note(4, c2, { body: "Vine cu bunica; sună înainte.", category: "general", pinned: true }),
	];
	const entry = (
		n: number,
		clientId: string | undefined,
		over: Partial<BlacklistEntry> & Pick<BlacklistEntry, "severity" | "reason" | "category">,
	): BlacklistEntry[] =>
		clientId === undefined
			? []
			: [
					{
						id: `b${n}`,
						clientId,
						createdAt: `${today}T07:00:00`,
						createdBy: "Ana Test",
						expiresOn: null,
						endedAt: null,
						endedBy: null,
						endReason: null,
						...over,
					},
				];
	const blacklist: BlacklistEntry[] = [
		...entry(1, c4, {
			severity: "block_online",
			category: "no_show_repeated",
			reason: "Trei absențe nemotivate la rând; programările online sunt oprite.",
		}),
		...entry(2, c5, {
			severity: "warn",
			category: "unpaid",
			reason: "Sold restant din luna trecută; discutați la recepție.",
			expiresOn: "2099-12-31",
		}),
		...entry(3, c3, {
			severity: "block_all",
			category: "other",
			reason: "Încheiat de comun acord.",
			endedAt: `${today}T10:00:00`,
			endedBy: "Ana Test",
			endReason: "Situație lămurită.",
		}),
	];
	const records: ClientRecord[] =
		c1 === undefined
			? []
			: [
					{
						id: "r1",
						clientId: c1,
						formKey: "aba-session-report",
						formVersion: 1,
						appointmentId: null,
						status: "final",
						authorName: "Terapeut Alfa",
						createdAt: `${today}T12:00:00`,
						updatedAt: `${today}T12:30:00`,
						data: {
							programs: [
								{ name: "Imitație motorie", prompt: "Parțial", status: "În lucru", success: "70%" },
							],
							recommendations: "Continuăm cu imitația motorie.",
						},
					},
					{
						id: "r2",
						clientId: c1,
						formKey: "psychotherapy-report",
						formVersion: 1,
						appointmentId: null,
						status: "draft",
						authorName: "Terapeut Alfa",
						createdAt: `${today}T13:00:00`,
						updatedAt: `${today}T13:00:00`,
						data: {},
					},
					// A report whose client is gone (deleted before the move): it belongs to no client.
					{
						id: "r3",
						clientId: null,
						formKey: "aba-session-report",
						formVersion: 1,
						appointmentId: null,
						status: "final",
						authorName: "Terapeut Alfa",
						createdAt: `${today}T08:00:00`,
						updatedAt: `${today}T08:00:00`,
						data: { recommendations: "Raport fără client, sintetic." },
					},
				];
	const files =
		c1 === undefined
			? []
			: [
					{
						meta: {
							id: "f1",
							clientId: c1,
							name: "Evaluare inițială.txt",
							contentType: "text/plain",
							size: enc("Evaluare sintetică.").length,
							uploadedByName: "Ana Test",
							createdAt: `${today}T09:00:00`,
						},
						bytes: enc("Evaluare sintetică."),
					},
				];
	return { notes, blacklist, records, files };
}
