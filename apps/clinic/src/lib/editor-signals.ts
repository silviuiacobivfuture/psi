import { z } from "zod";
import { IsoDateSchema, PaymentMethodSchema } from "../port/schema";

/** What the appointment editor sends: every field as the person typed it, parsed here and nowhere else. */
export const EditorSchema = z.object({
	id: z.string().max(40),
	date: IsoDateSchema,
	time: z.string().regex(/^\d{2}:\d{2}$/),
	col: z.string().max(40),
	room: z.string().max(40),
	device: z.string().max(40),
	client: z.string().max(40),
	clientName: z.string().max(120),
	q: z.string().max(120),
	svc: z.string().max(40),
	dur: z.coerce.number(),
	status: z.enum(["confirmed", "requested"]),
	note: z.string().max(1000),
	remind: z.boolean(),
	rec: z.enum(["none", "count", "until"]),
	recN: z.coerce.number(),
	recUntil: z.string().max(10),
	pkg: z.string().max(40),
	price: z.string().max(24),
	payNow: z.boolean(),
	payMethod: PaymentMethodSchema,
	newc: z.boolean(),
	nName: z.string().max(120),
	nPhone: z.string().max(40),
	nGuardian: z.string().max(120),
	/** The weekly series the appointment being edited belongs to (empty: none), and how many of it a change reaches. */
	series: z.string().max(40).default(""),
	scope: z.enum(["this", "following", "all"]).default("this"),
	/** Override a blacklist warning with a reason (when the blacklist exists). */
	override: z.string().max(500).default(""),
});
export type Editor = z.infer<typeof EditorSchema>;

export const EditorSignalsSchema = z.object({ ed: EditorSchema });

export const minutesOf = (hhmm: string): number =>
	Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
