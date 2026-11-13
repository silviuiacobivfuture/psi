import { z } from "zod";
import { type AuditChange, AuditSourceSchema } from "../schema";

const Text = z.string().min(1).max(500);
const Scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const asText = (v: z.infer<typeof Scalar>): string | null => (v === null ? null : String(v));

/** `{ field: { from, to } }` or `{ field: { before, after } }`: the shapes the service's `detail.changes` may take. */
const ChangeMap = z.record(
	z.string(),
	z.object({
		from: Scalar.optional(),
		to: Scalar.optional(),
		before: Scalar.optional(),
		after: Scalar.optional(),
	}),
);
const ChangeList = z.array(
	z.object({ field: z.string(), before: Scalar.optional(), after: Scalar.optional() }),
);

const Detail = z.object({
	source: AuditSourceSchema.optional().catch(undefined),
	requestId: Text.optional().catch(undefined),
	ip: Text.optional().catch(undefined),
	device: Text.optional().catch(undefined),
	userAgent: Text.optional().catch(undefined),
	reason: Text.optional().catch(undefined),
	asWhom: Text.optional().catch(undefined),
	viewAs: Text.optional().catch(undefined),
	changes: z.union([ChangeList, ChangeMap]).optional().catch(undefined),
});

export interface AuditExtras {
	source?: z.infer<typeof AuditSourceSchema>;
	requestId?: string;
	ip?: string;
	device?: string;
	reason?: string;
	asWhom?: string;
	changes?: AuditChange[];
}

const changesOf = (raw: z.infer<typeof Detail>["changes"]): AuditChange[] | undefined => {
	if (raw === undefined) return undefined;
	if (Array.isArray(raw))
		return raw.map((c) => ({
			field: c.field,
			before: asText(c.before ?? null),
			after: asText(c.after ?? null),
		}));
	return Object.entries(raw).map(([field, c]) => ({
		field,
		before: asText(c.from ?? c.before ?? null),
		after: asText(c.to ?? c.after ?? null),
	}));
};

/**
 * What the service recorded beside an event, read at the boundary: anything it did not say stays absent (a screen says
 * "not recorded"), anything of the wrong shape is dropped rather than shown.
 */
export function auditExtras(detail: Record<string, unknown> | undefined): AuditExtras {
	const parsed = Detail.safeParse(detail ?? {});
	if (!parsed.success) return {};
	const d = parsed.data;
	const changes = changesOf(d.changes);
	const device = d.device ?? d.userAgent;
	const asWhom = d.asWhom ?? d.viewAs;
	return {
		...(d.source === undefined ? {} : { source: d.source }),
		...(d.requestId === undefined ? {} : { requestId: d.requestId }),
		...(d.ip === undefined ? {} : { ip: d.ip }),
		...(device === undefined ? {} : { device }),
		...(d.reason === undefined ? {} : { reason: d.reason }),
		...(asWhom === undefined ? {} : { asWhom }),
		...(changes === undefined ? {} : { changes }),
	};
}
