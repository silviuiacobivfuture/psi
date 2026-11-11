/** @jsxRuntime automatic @jsxImportSource hono/jsx */
import type { JSX } from "hono/jsx/jsx-runtime";

/**
 * A 2px glow-1 hairline at the top of the viewport that fills as the page is read. Pure CSS
 * (scroll-driven animation); where unsupported, or under reduced motion, it stays empty.
 */
export function ReadingProgress(): JSX.Element {
	return <div class="pz-read" aria-hidden="true" />;
}
