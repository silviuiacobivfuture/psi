import type { Topic } from "@psi/content";
import { z } from "zod";
import type { Locale } from "../i18n";
import { m } from "../paraglide/messages.js";

/** The index reads as a magazine: each shelf gathers some topics under one heading. */
export const SHELF_IDS = [
	"copii",
	"minte",
	"creier",
	"recuperare",
	"evaluare",
	"sport",
	"seara",
	"constiinta",
	"despre",
] as const;
export type ShelfId = (typeof SHELF_IDS)[number];

const TOPICS_OF: Readonly<Record<ShelfId, ReadonlyArray<Topic>>> = {
	copii: ["autism", "adhd", "adolescenti", "integrare-senzoriala", "logopedie", "parinti"],
	minte: ["anxietate-depresie", "psihoterapie", "cuplu-familie"],
	creier: ["creier-si-minte"],
	recuperare: ["post-avc", "psiho-oncologie"],
	evaluare: ["qeeg", "neuromodulare"],
	sport: ["sport"],
	seara: ["sunet-si-creier", "programul-eqsync", "meditatie-si-relaxare"],
	constiinta: ["explorarea-constiintei"],
	despre: ["editorial", "cum-lucram"],
};

export function shelfTopics(shelf: ShelfId): ReadonlyArray<Topic> {
	return TOPICS_OF[shelf];
}

/** The shelf a topic stands on. */
export function shelfOf(topic: Topic): ShelfId | undefined {
	return SHELF_IDS.find((s) => TOPICS_OF[s].includes(topic));
}

export function shelfFrom(value: string | undefined): ShelfId | undefined {
	return SHELF_IDS.find((s) => s === value);
}

/** `?page=`: a positive whole number; anything else means the first page. */
export function pageFrom(value: string | undefined): number {
	const parsed = z.coerce.number().int().min(1).max(10_000).safeParse(value);
	return parsed.success ? parsed.data : 1;
}

const LABELS: Readonly<Record<ShelfId, (o: { locale: Locale }) => string>> = {
	copii: (o) => m.shelf_copii({}, o),
	minte: (o) => m.shelf_minte({}, o),
	creier: (o) => m.shelf_creier({}, o),
	recuperare: (o) => m.shelf_recuperare({}, o),
	evaluare: (o) => m.shelf_evaluare({}, o),
	sport: (o) => m.shelf_sport({}, o),
	seara: (o) => m.shelf_seara({}, o),
	constiinta: (o) => m.shelf_constiinta({}, o),
	despre: (o) => m.shelf_despre({}, o),
};

export function shelfLabel(shelf: ShelfId, locale: Locale): string {
	return LABELS[shelf]({ locale });
}
