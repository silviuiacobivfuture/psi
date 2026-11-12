import { z } from "zod";
import { SetupSchema, type SetupState } from "../../platform/scheduling-model";

/**
 * The setup page's calls to /api/platform/scheduling, every answer parsed: `{ ok: true, … }` or
 * `{ ok: false, error }` where `error` is a key the page has words for (`scErr_<error>`).
 */
export type Reply<D> = { ok: true; data: D } | { ok: false; error: string };

const Failure = z.object({ ok: z.literal(false), error: z.string() });
const Plain = z.object({ ok: z.literal(true) }).passthrough();
const StateReply = z.object({ ok: z.literal(true), setup: SetupSchema });
const PreviewReply = z.object({
	ok: z.literal(true),
	timeZone: z.string(),
	slots: z.array(
		z.object({
			start: z.number(),
			practitioner: z.string(),
			modes: z.array(z.enum(["onsite", "online"])),
		}),
	),
});
export type Preview = z.infer<typeof PreviewReply>;

async function answer<S extends z.ZodTypeAny>(
	run: () => Promise<Response>,
	schema: S,
): Promise<Reply<z.infer<S>>> {
	try {
		const body: unknown = await (await run()).json();
		const ok = schema.safeParse(body);
		if (ok.success) return { ok: true, data: ok.data };
		const bad = Failure.safeParse(body);
		return { ok: false, error: bad.success ? bad.data.error : "unreachable" };
	} catch {
		return { ok: false, error: "unreachable" };
	}
}

const get = (path: string): Promise<Response> =>
	fetch(`/api/platform/scheduling/${path}`, { credentials: "include", cache: "no-store" });

export const readSetup = (brand: string): Promise<Reply<{ setup: SetupState }>> =>
	answer(() => get(`state?brand=${encodeURIComponent(brand)}`), StateReply);

export const readPreview = (brand: string, service: string): Promise<Reply<Preview>> =>
	answer(
		() => get(`preview?brand=${encodeURIComponent(brand)}&service=${encodeURIComponent(service)}`),
		PreviewReply,
	);

/** One manager action; `data` carries what the action reports (`upcoming`, `added`). */
export const act = (
	path: string,
	body: Readonly<Record<string, unknown>>,
): Promise<Reply<Record<string, unknown>>> =>
	answer(
		() =>
			fetch(`/api/platform/scheduling/setup/${path}`, {
				method: "POST",
				credentials: "include",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			}),
		Plain,
	);

const BoardReply = z.object({
	ok: z.literal(true),
	timeZone: z.string(),
	today: z.string(),
	hours: z.array(
		z.object({ practitionerId: z.string(), date: z.string(), start: z.number(), end: z.number() }),
	),
	off: z.array(z.object({ practitionerId: z.string(), date: z.string() })),
	appointments: z.array(
		z.object({
			reference: z.string(),
			status: z.enum(["held", "requested", "confirmed", "cancelled", "declined", "expired"]),
			start: z.number(),
			end: z.number(),
			blockedUntil: z.number(),
			mode: z.enum(["onsite", "online"]),
			practitionerId: z.string(),
			serviceSlug: z.string(),
			roomId: z.string().optional(),
			contactName: z.string().optional(),
		}),
	),
	closures: z.array(
		z.object({
			id: z.string(),
			roomId: z.string(),
			date: z.string(),
			start: z.number().optional(),
			end: z.number().optional(),
		}),
	),
});
export type Board = z.infer<typeof BoardReply>;
export type BoardAppointment = Board["appointments"][number];

export const readBoard = (brand: string, from: string, days: number): Promise<Reply<Board>> =>
	answer(
		() => get(`board?brand=${encodeURIComponent(brand)}&from=${from}&days=${days}`),
		BoardReply,
	);
