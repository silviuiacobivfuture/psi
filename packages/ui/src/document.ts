import { raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";

/** Render first in every page layout: without a doctype, browsers lay the page out in quirks mode. */
export function Doctype(): HtmlEscapedString {
	return raw("<!doctype html>");
}
