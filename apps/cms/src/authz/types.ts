/**
 * What the CMS asks the estate's authorization, and nothing else. The relations are the
 * `cms_brand` relations declared in apps/cms/authz.manifest.json; the CMS never stores a role.
 */
import { SITES } from "@psi/cms-client";

/**
 * The brands permissions are decided on: the four sites, one admin for all of them
 * (`cms_brand:<brand>`). Articles belong to one of the three publishing brands (@psi/content).
 */
export const BRANDS = SITES;
export type Brand = (typeof BRANDS)[number];

export const RELATIONS = [
	"read",
	"write",
	"publish",
	"clinical_review",
	"manage_media",
	"admin",
	"ai_admin",
] as const;
export type Relation = (typeof RELATIONS)[number];

/**
 * Who is asking: the CMS user row, the directory's subject (absent for break-glass), the e-mail,
 * and the directory groups the last sign-in reported (the interim adapter's input only).
 */
export interface Subject {
	userId: string;
	sub: string | null;
	email: string;
	groups: ReadonlyArray<string>;
}

export interface Authorizer {
	/** Which adapter answered; recorded in the review trail. */
	readonly kind: "interim" | "openfga";
	/** Every brand on which this person holds `relation` (OpenFGA ListObjects). */
	brands(subject: Subject, relation: Relation): Promise<Brand[]>;
}
