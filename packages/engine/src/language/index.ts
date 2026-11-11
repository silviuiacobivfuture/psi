import { ENGLISH } from "./en";
import type { LanguagePack } from "./pack";
import { ROMANIAN } from "./ro";

/** The languages the engine ships with; a consumer adds more through `createEngine({ languages })`. */
export const BUNDLED_LANGUAGES: ReadonlyArray<LanguagePack> = [ROMANIAN, ENGLISH];
