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

/**
 * The expression that sends `text` as the person's next message, once: `$staff.busy` is on from
 * the first press until the server says the turn ended (a second press, or another button, does
 * nothing meanwhile), and a safety timer lets go if the connection never answers.
 */
export function sendExpression(base: string, text: string): string {
	return `if (!$staff.busy) { $staff.busy = true; $staff.message = ${jsString(text)}; @post(${jsString(`${base}/chat`)}); setTimeout(() => { $staff.busy = false }, 120000) }`;
}

/** The expression for the typed message: sent only when there is one and no turn is running. */
export function submitExpression(base: string, opensSheet: boolean): string {
	return `if ($staff.message.trim() !== '' && !$staff.busy) { $staff.busy = true; ${opensSheet ? "$compassOpen = true; " : ""}@post(${jsString(`${base}/chat`)}); setTimeout(() => { $staff.busy = false }, 120000) }`;
}
