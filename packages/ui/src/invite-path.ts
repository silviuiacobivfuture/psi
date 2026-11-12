/** A request path as a site's route tables know it: without the English prefix or a trailing slash. */
export function barePath(path: string): string {
	const bare = path.replace(/^\/en(?=\/|$)/, "").replace(/\/+$/, "");
	return bare === "" ? "/" : bare;
}
