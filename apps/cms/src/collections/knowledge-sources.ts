import type { Access, CollectionConfig, Field, FieldAccess, Where } from "payload";
import { z } from "zod";
import { brandsFor } from "../authz/access";
import { BRANDS, type Brand } from "../authz/types";
import { brandListFilter } from "../brand/filter";
import { KS_LABELS as T } from "../i18n-knowledge";
import { SOURCE_MIME_TYPES } from "../knowledge/extract/index";
import { checkUrl, FetchError } from "../knowledge/fetch-url";
import {
	APPROVAL_STATES,
	ORIGINS,
	SENSITIVITIES,
	SOURCE_KINDS,
	SOURCE_LANGUAGES,
	SOURCE_STATUSES,
} from "../knowledge/source-doc";
import { sourceEndpoints } from "../knowledge/source-endpoints";
import {
	capFileSize,
	extractOnSave,
	ingestAfterSave,
	unindexOnDelete,
} from "../knowledge/source-hooks";
import { brandField } from "../review/fields";

/**
 * Knowledge sources (per brand): documents the owner uploads (PDF, DOCX, Markdown, TXT, HTML,
 * CSV) or a page to fetch (https, the brand's domains and psizone.ro only), extracted locally,
 * reviewed, then chunked and indexed into the SAME index the brand's guide searches. Only public
 * sources are indexed; one is indexed once someone with the AI role approved its current content
 * (src/knowledge/source-gate.ts). Files go to the media storage (S3 in the estate, disk locally).
 */
const signedIn: FieldAccess = ({ req }) => req.user !== null && req.user !== undefined;
const serverOnly = { create: (): boolean => false, update: (): boolean => false, read: signedIn };

function brandWhere(brands: ReadonlyArray<Brand>): Where | boolean {
	if (brands.length === 0) return false;
	if (brands.length === BRANDS.length) return true;
	return { brand: { in: [...brands] } };
}

/** Anonymous: only the file of a public, downloadable, indexed source. Signed in: `read` on the brand. */
const read: Access = async ({ req }) => {
	if (req.user === null || req.user === undefined) {
		return {
			and: [
				{ sensitivity: { equals: "public" } },
				{ downloadable: { equals: true } },
				{ status: { in: ["indexed", "indexed_lexical"] } },
			],
		};
	}
	return brandWhere(await brandsFor(req, "read"));
};

/** Uploading and editing: `write` (editors) or `ai_operator` on the brand. */
async function writers(req: Parameters<Access>[0]["req"]): Promise<Brand[]> {
	const [w, ai] = await Promise.all([brandsFor(req, "write"), brandsFor(req, "ai_operator")]);
	return [...new Set([...w, ...ai])];
}

const create: Access = async ({ req, data }) => {
	const brand = z.object({ brand: z.enum(BRANDS) }).safeParse(data);
	const mine = await writers(req);
	return brand.success ? mine.includes(brand.data.brand) : mine.length > 0;
};
const update: Access = async ({ req }) => brandWhere(await writers(req));
/** Deleting takes the source out of the index: `admin` or `ai_operator` on the brand. */
const remove: Access = async ({ req }) => {
	const [a, ai] = await Promise.all([brandsFor(req, "admin"), brandsFor(req, "ai_operator")]);
	return brandWhere([...new Set([...a, ...ai])]);
};

const opt = (
	values: ReadonlyArray<string>,
	labels?: Readonly<Record<string, { ro: string; en: string }>>,
) => values.map((value) => ({ value, label: labels?.[value] ?? value }));

const validSourceUrl = (
	value: unknown,
	{ siblingData }: { siblingData: unknown },
): true | string => {
	const s = z
		.object({ origin: z.string().nullish(), brand: z.enum(BRANDS).nullish() })
		.safeParse(siblingData);
	if (!s.success || s.data.origin !== "url") return true;
	if (typeof value !== "string" || value.trim() === "") return "https://…";
	try {
		checkUrl(value, s.data.brand ?? "psizone");
		return true;
	} catch (e) {
		return e instanceof FetchError ? e.message : "invalid URL";
	}
};

const readOnlyNumber = (name: string, label: { ro: string; en: string }): Field => ({
	name,
	type: "number",
	label,
	access: serverOnly,
	admin: { readOnly: true, position: "sidebar" },
});

export const KnowledgeSources: CollectionConfig = {
	slug: "knowledge-sources",
	labels: { singular: T.singular, plural: T.plural },
	admin: {
		// In the "Platformă / Platform" group of the admin navigation (components/AdminNav.tsx).
		group: false,
		useAsTitle: "title",
		defaultColumns: ["title", "brand", "language", "status", "chunks", "indexedAt"],
		baseListFilter: brandListFilter(),
		components: { beforeListTable: ["/components/knowledge/SourceFilters#SourceFilters"] },
	},
	access: { read, create, update, delete: remove },
	upload: {
		mimeTypes: SOURCE_MIME_TYPES,
		filesRequiredOnCreate: false,
		// Never served inline as HTML from the CMS origin: a download only.
		modifyResponseHeaders: ({ headers }) => {
			headers.set("content-disposition", "attachment");
			headers.set("x-content-type-options", "nosniff");
			return headers;
		},
	},
	endpoints: sourceEndpoints,
	hooks: {
		beforeOperation: [capFileSize],
		beforeChange: [extractOnSave],
		afterChange: [ingestAfterSave],
		afterDelete: [unindexOnDelete],
	},
	fields: [
		brandField(),
		{ name: "title", type: "text", required: true, label: T.title },
		{
			name: "language",
			type: "select",
			required: true,
			defaultValue: "ro",
			label: T.language,
			options: opt(SOURCE_LANGUAGES),
			admin: { position: "sidebar" },
		},
		{
			name: "kind",
			type: "select",
			required: true,
			defaultValue: "operational",
			label: T.kind,
			options: opt(SOURCE_KINDS),
			admin: { position: "sidebar" },
		},
		{
			name: "sensitivity",
			type: "select",
			required: true,
			defaultValue: "public",
			label: T.sensitivity,
			options: opt(SENSITIVITIES, {
				public: T.public,
				internal: T.internal,
				confidential: T.confidential,
			}),
			admin: { position: "sidebar", description: T.sensitivityHelp },
		},
		{
			name: "downloadable",
			type: "checkbox",
			defaultValue: false,
			label: T.downloadable,
			admin: { position: "sidebar", description: T.downloadableHelp },
		},
		{ name: "topics", type: "text", hasMany: true, label: T.topics },
		{ name: "audience", type: "text", label: T.audience },
		{
			name: "origin",
			type: "select",
			required: true,
			defaultValue: "file",
			label: T.origin,
			options: opt(ORIGINS, { file: T.originFile, url: T.originUrl }),
		},
		{
			name: "sourceUrl",
			type: "text",
			label: T.sourceUrl,
			validate: validSourceUrl,
			admin: { description: T.sourceUrlHelp, condition: (_d, s) => s?.origin === "url" },
		},
		{
			name: "refetch",
			type: "checkbox",
			label: T.refetch,
			admin: { condition: (_d, s) => s?.origin === "url" },
		},
		{
			name: "panel",
			type: "ui",
			admin: { components: { Field: "/components/knowledge/SourcePanel#SourcePanel" } },
		},
		{
			name: "status",
			type: "select",
			index: true,
			defaultValue: "uploaded",
			label: T.status,
			options: SOURCE_STATUSES.map((value) => ({ value, label: value })),
			access: serverOnly,
			admin: {
				readOnly: true,
				position: "sidebar",
				components: { Cell: "/components/knowledge/StatusCell#StatusCell" },
			},
		},
		{
			name: "error",
			type: "textarea",
			label: T.error,
			access: serverOnly,
			admin: { readOnly: true, position: "sidebar" },
		},
		readOnlyNumber("chars", T.chars),
		readOnlyNumber("sectionCount", T.sectionCount),
		readOnlyNumber("chunks", T.chunks),
		{
			name: "indexedAt",
			type: "date",
			label: T.indexedAt,
			access: serverOnly,
			admin: { readOnly: true, position: "sidebar", date: { pickerAppearance: "dayAndTime" } },
		},
		{
			name: "embedder",
			type: "text",
			label: T.embedder,
			access: serverOnly,
			admin: { readOnly: true, position: "sidebar" },
		},
		{
			name: "contentHash",
			type: "text",
			label: T.contentHash,
			access: serverOnly,
			admin: { readOnly: true, position: "sidebar" },
		},
		{
			name: "inIndex",
			type: "checkbox",
			defaultValue: true,
			label: T.inIndex,
			access: serverOnly,
			admin: { hidden: true },
		},
		{
			name: "approval",
			type: "group",
			label: T.approval,
			access: serverOnly,
			admin: { hidden: true },
			fields: [
				{ name: "state", type: "select", options: opt(APPROVAL_STATES) },
				{ name: "by", type: "text" },
				{ name: "byName", type: "text" },
				{ name: "at", type: "text" },
				{ name: "hash", type: "text" },
			],
		},
		// The extracted text, by section: what re-indexing reads (the file is never fetched again).
		{ name: "sections", type: "json", access: serverOnly, admin: { hidden: true } },
		{ name: "indexedIds", type: "json", access: serverOnly, admin: { hidden: true } },
		{ name: "indexedFingerprint", type: "text", access: serverOnly, admin: { hidden: true } },
	],
};
