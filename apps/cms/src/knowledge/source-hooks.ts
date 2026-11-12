import { createHash } from "node:crypto";
import {
	APIError,
	type CollectionAfterChangeHook,
	type CollectionAfterDeleteHook,
	type CollectionBeforeChangeHook,
	type CollectionBeforeOperationHook,
	type PayloadRequest,
} from "payload";
import { z } from "zod";
import { brandsFor, subjectOf } from "../authz/access";
import { BRANDS, type Brand } from "../authz/types";
import { htmlTitle } from "./extract/html";
import { ExtractError, extract, formatOf, MAX_BYTES } from "./extract/index";
import { FetchError, fetchSource } from "./fetch-url";
import { ownedIds, unindexSource } from "./ingest-source";
import { sourceIndex } from "./ingest-store";
import { SourceDocSchema } from "./source-doc";
import { approvalAfterSave, approvalRelations, heldOn } from "./source-gate";
import { brandSettings, INTERNAL, runAfterCommit } from "./source-ports";

/**
 * The collection's hooks: the size cap before Payload stores a file; extraction (from the
 * uploaded bytes, or the fetched page) and the review stamp on every save; the ingestion run
 * after the save commits; removal from the index on delete. The pipeline's own writes carry
 * `context[INTERNAL]` and skip all of this.
 */
const Rec = z.record(z.unknown());
const UploadFile = z.object({
	data: z.instanceof(Buffer),
	mimetype: z.string().nullish(),
	name: z.string().nullish(),
	size: z.number().nullish(),
});

const internal = (context: Record<string, unknown>): boolean => context[INTERNAL] === true;

export const capFileSize: CollectionBeforeOperationHook = ({ req, operation }) => {
	if (operation !== "create" && operation !== "update") return;
	const f = UploadFile.safeParse(req.file);
	const size = f.success ? (f.data.size ?? f.data.data.byteLength) : 0;
	if (size > MAX_BYTES) {
		throw new APIError(
			`The file is ${(size / 1048576).toFixed(1)} MB; the limit is ${MAX_BYTES / 1048576} MB.`,
			413,
			null,
			true,
		);
	}
};

const sha256 = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

async function bytesOf(
	req: PayloadRequest,
	merged: Record<string, unknown>,
	original: Record<string, unknown> | undefined,
	brand: Brand,
): Promise<{
	bytes: Uint8Array;
	format: ReturnType<typeof formatOf>;
	title?: string | null;
} | null> {
	if (merged.origin === "url") {
		const url = z.string().safeParse(merged.sourceUrl);
		if (!url.success || url.data.trim() === "") return null;
		const changed =
			original === undefined || original.sourceUrl !== url.data || merged.refetch === true;
		if (!changed) return null;
		const f = await fetchSource(url.data, brand);
		return {
			bytes: f.bytes,
			format: f.format,
			title: f.format === "html" ? htmlTitle(new TextDecoder().decode(f.bytes)) : null,
		};
	}
	const file = UploadFile.safeParse(req.file);
	if (!file.success) return null;
	return {
		bytes: new Uint8Array(file.data.data),
		format: formatOf(file.data.mimetype, file.data.name),
	};
}

export const extractOnSave: CollectionBeforeChangeHook = async ({
	data,
	originalDoc,
	req,
	context,
}) => {
	if (internal(context)) return data;
	const out = Rec.parse(data);
	const original = originalDoc === undefined ? undefined : Rec.parse(originalDoc);
	const merged = { ...(original ?? {}), ...out };
	const brand = z.enum(BRANDS).parse(merged.brand);
	const kind = z.string().catch("operational").parse(merged.kind);
	const say = (k: "ksPage"): string => req.t(`psi:${k}` as Parameters<typeof req.t>[0]);
	try {
		const got = await bytesOf(req, merged, original, brand);
		if (got !== null) {
			const hash = sha256(got.bytes);
			out.refetch = false;
			if (hash !== original?.contentHash || original?.status === "failed") {
				if (got.format === null)
					throw new ExtractError("unsupported", "this file type is not read");
				const x = await extract({
					format: got.format,
					bytes: got.bytes,
					pageLabel: (n) => `${say("ksPage")} ${n}`,
				});
				Object.assign(out, {
					sections: x.sections,
					chars: x.chars,
					contentHash: hash,
					status: "uploaded",
					error: null,
				});
			}
		}
	} catch (error) {
		if (!(error instanceof ExtractError) && !(error instanceof FetchError)) throw error;
		Object.assign(out, {
			sections: [],
			chars: 0,
			status: "failed",
			error: error.message,
			refetch: false,
		});
	}
	// The review stamp: kept while the content is the approved one; else pending, or automatic
	// for an uploader who holds what approving needs on this brand.
	const subject = subjectOf(req.user);
	const needed = approvalRelations({ brand, kind });
	const held = subject === null ? new Set() : await heldOn((r) => brandsFor(req, r), brand, needed);
	const name = z
		.object({ name: z.string().nullish(), email: z.string().nullish() })
		.parse(req.user ?? {});
	out.approval = approvalAfterSave({
		previous:
			original?.approval === undefined
				? null
				: z.record(z.string().nullish()).catch({}).parse(original.approval),
		contentHash:
			z
				.string()
				.nullish()
				.parse(out.contentHash ?? merged.contentHash) ?? null,
		scopeChanged:
			original !== undefined && (original.brand !== merged.brand || original.kind !== merged.kind),
		mayApprove: needed.every((r) => held.has(r)),
		actor:
			subject === null
				? null
				: { id: subject.userId, name: name.name ?? name.email ?? subject.email },
		now: new Date().toISOString(),
	});
	return out;
};

export const ingestAfterSave: CollectionAfterChangeHook = ({ doc, req, context }) => {
	if (internal(context)) return doc;
	const d = Rec.parse(doc);
	runAfterCommit(req.payload, String(d.id), z.string().nullish().parse(d.updatedAt) ?? null);
	return doc;
};

export const unindexOnDelete: CollectionAfterDeleteHook = async ({ doc, req }) => {
	const parsed = SourceDocSchema.safeParse(doc);
	if (!parsed.success || ownedIds(parsed.data).length === 0) return;
	try {
		const index = await sourceIndex(
			parsed.data.brand,
			await brandSettings(req.payload, parsed.data.brand),
		);
		await unindexSource(index, parsed.data);
	} catch (err) {
		req.payload.logger.error({ err, id: parsed.data.id }, "knowledge source: removal failed");
	}
};
