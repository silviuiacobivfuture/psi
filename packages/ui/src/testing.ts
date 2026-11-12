/**
 * Test helpers for apps that render the compass: which destinations a typed query lists, read
 * from the rendered HTML and decided by the very Datastar expressions the browser runs.
 */

const ITEM = /<a id="pz-dest-[^"]*" class="pz-compass__item" href="([^"]*)" data-show="([^"]*)"/g;

function decodeAttribute(attr: string): string {
	return attr
		.replaceAll("&quot;", '"')
		.replaceAll("&#39;", "'")
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&amp;", "&");
}

/** The hrefs of the destinations the compass in `html` lists while `query` is typed. */
export function compassDestinations(html: string, query: string): ReadonlyArray<string> {
	const listed: string[] = [];
	for (const [, href, show] of html.matchAll(ITEM)) {
		if (href === undefined || show === undefined) continue;
		const decide = new Function("$compassQuery", `return (${decodeAttribute(show)})`);
		if (decide(query) === true) listed.push(decodeAttribute(href));
	}
	return listed;
}
