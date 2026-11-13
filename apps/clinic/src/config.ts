import { readEnv } from "./env";

/** Read once at start: a bad or forbidden setting stops the boot here, loudly. */
export const ENV = readEnv();
export const ORIGIN = ENV.origin;
