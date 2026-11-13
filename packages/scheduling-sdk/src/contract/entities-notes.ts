import { z } from "zod/v4";
import { Id, Ms, Subject } from "./primitives";

/**
 * What a note is about. `clinic` is clinical: the service keeps it as ciphertext and shows it only to a caller who holds
 * the clinical group of the notes permission (`notes_view_clinical`); the other four are plain staff notes.
 */
export const NOTE_CATEGORIES = [
	"general",
	"administrativ",
	"plata",
	"comportament",
	"clinic",
] as const;
export const NoteCategory = z.enum(NOTE_CATEGORIES);
export type NoteCategoryName = z.infer<typeof NoteCategory>;

export const NOTE_MAX_CHARS = 5_000;
const Text = z.string().trim().min(1).max(NOTE_MAX_CHARS);

export const ClientNote = z.object({
	id: Id,
	clientId: Id,
	category: NoteCategory,
	text: z.string().max(NOTE_MAX_CHARS),
	/** Pinned notes lead the list and the client's summary. */
	pinned: z.boolean(),
	authorSubject: Subject,
	createdAt: Ms,
	updatedAt: Ms,
});

export const NoteCreate = z.object({
	category: NoteCategory.default("general"),
	text: Text,
	pinned: z.boolean().default(false),
});

/**
 * A note's text or category. A note does not cross the clinical line: a clinical note stays clinical and the others stay
 * among themselves (refused with 400), because the one is ciphertext only the clinical group opens.
 */
export const NotePatch = z.object({ text: Text.optional(), category: NoteCategory.optional() });

export const NotePin = z.object({ pinned: z.boolean() });
