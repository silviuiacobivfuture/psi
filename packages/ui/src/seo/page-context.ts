import tokens from "@psi/design/tokens.json" with { type: "json" };
import { tryGetContext } from "hono/context-storage";

/** The `bg` of a design theme (`psizone-light` → `#F4EEE2`), for `<meta name="theme-color">`. */
export function themeColor(theme: string): string | undefined {
	const bg = tokens.color.tokens.find((t) => t.name === "bg");
	if (bg === undefined) return undefined;
	const value: unknown = Object.entries(bg.value).find(([id]) => id === theme)?.[1];
	return typeof value === "string" ? value : undefined;
}

/**
 * The path of the request being rendered, without a trailing slash, when the app runs Hono's
 * `contextStorage()` middleware; `undefined` outside a request (tests, static renders).
 */
export function requestPath(): string | undefined {
	const path = tryGetContext()?.req.path;
	if (path === undefined) return undefined;
	return path.replace(/\/+$/, "") || "/";
}
