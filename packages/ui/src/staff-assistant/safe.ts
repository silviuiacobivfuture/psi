/**
 * A JavaScript string literal for `text` that is safe inside a Datastar expression: `$` and `@`
 * are written as escapes, so a client named "$x @post(" never reads as a signal or an action.
 */
export function jsString(text: string): string {
	return JSON.stringify(text).replace(
		/[$@<>&]/g,
		(c) => `\\u00${c.charCodeAt(0).toString(16).padStart(2, "0")}`,
	);
}

/**
 * A link the card may carry: a path of the console, or a prepared WhatsApp address. Nothing else
 * (no `javascript:`, no other site) becomes an `href`.
 */
export function safeHref(href: string | undefined): string | undefined {
	if (href === undefined) return undefined;
	if (/^\/(?!\/)[^\s"'<>]*$/.test(href)) return href;
	if (/^https:\/\/wa\.me\/\d{6,15}(\?text=[^\s"'<>]*)?$/.test(href)) return href;
	return undefined;
}

/** The expression that sends `text` as the person's next message. */
export function sendExpression(base: string, text: string): string {
	return `$staff.message = ${jsString(text)}; @post(${jsString(`${base}/chat`)})`;
}
