import type { KnowledgeEntryInput } from "../entry";
import { PSIZONE_EN } from "./psizone-en";
import { PSIZONE_RO } from "./psizone-ro";

/** The seed: non-clinical Psizone entries (operational and editorial), ro and en. */
export const SEED: ReadonlyArray<KnowledgeEntryInput> = [...PSIZONE_RO, ...PSIZONE_EN];
