import type { MastraDBMessage } from "@mastra/core/agent";
import type { ProcessInputArgs, Processor } from "@mastra/core/processors";

/**
 * Invisible characters that split words without showing: zero-width spaces and joiners, the word
 * joiner, bidirectional controls, the soft hyphen and the byte-order mark. Mastra's
 * `UnicodeNormalizer` (NFKC and control characters) leaves these in place.
 */
const INVISIBLE = /[­᠎​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

/** Cyrillic and Greek letters that look like Latin ones, mapped to the Latin letter they imitate. */
const LOOKALIKES: Readonly<Record<string, string>> = {
	а: "a",
	в: "b",
	е: "e",
	ё: "e",
	к: "k",
	м: "m",
	н: "h",
	о: "o",
	р: "p",
	с: "c",
	т: "t",
	у: "y",
	х: "x",
	і: "i",
	ј: "j",
	ѕ: "s",
	ԁ: "d",
	ӏ: "l",
	ɡ: "g",
	А: "A",
	В: "B",
	Е: "E",
	К: "K",
	М: "M",
	Н: "H",
	О: "O",
	Р: "P",
	С: "C",
	Т: "T",
	Х: "X",
	І: "I",
	Ј: "J",
	Ѕ: "S",
	α: "a",
	ε: "e",
	ι: "i",
	κ: "k",
	ν: "v",
	ο: "o",
	ρ: "p",
	τ: "t",
	υ: "u",
	χ: "x",
	Α: "A",
	Β: "B",
	Ε: "E",
	Ζ: "Z",
	Η: "H",
	Ι: "I",
	Κ: "K",
	Μ: "M",
	Ν: "N",
	Ο: "O",
	Ρ: "P",
	Τ: "T",
	Υ: "Y",
	Χ: "X",
};

const LOOKALIKE = new RegExp(`[${Object.keys(LOOKALIKES).join("")}]`, "g");
const LATIN = /[A-Za-zÀ-ɏ]/;
const WORD = /[\p{L}\p{M}\p{N}]+/gu;

/**
 * Folds look-alike letters in words that mix scripts ("рsihoterapie" with a Cyrillic "р"). A word
 * written entirely in Cyrillic or Greek is left alone: it is a real word, not a disguise.
 */
function foldLookalikes(text: string): string {
	return text.replace(WORD, (word) =>
		LATIN.test(word) ? word.replace(LOOKALIKE, (letter) => LOOKALIKES[letter] ?? letter) : word,
	);
}

/**
 * The text as the guardrails read it: NFKC (full-width and stylised letters become plain ones),
 * invisible characters removed, look-alike letters folded in mixed-script words. It runs before
 * crisis detection, so a zero-width space or a Cyrillic "о" cannot hide crisis language.
 */
export function cleanText(text: string): string {
	return foldLookalikes(text.normalize("NFKC").replace(INVISIBLE, ""));
}

function cleanMessage(message: MastraDBMessage): MastraDBMessage {
	const parts = message.content.parts.map((part) =>
		part.type === "text" ? { ...part, text: cleanText(part.text) } : part,
	);
	const content =
		typeof message.content.content === "string"
			? { ...message.content, parts, content: cleanText(message.content.content) }
			: { ...message.content, parts };
	return { ...message, content };
}

/**
 * The engine's own step after Mastra's `UnicodeNormalizer`: removes invisible characters and folds
 * look-alike letters, which Mastra's normalizer does not do. Deterministic and free.
 */
export class LookalikeFolder implements Processor<"lookalike-folder"> {
	readonly id = "lookalike-folder";
	readonly name = "Look-alike folder";

	processInput(args: ProcessInputArgs): Array<MastraDBMessage> {
		return args.messages.map(cleanMessage);
	}
}
