/** Where a form post goes back to: the page it came from when that is this site, else the front page. */
export function backPath(referer: string | undefined, here: string): string {
	if (referer === undefined) return "/";
	try {
		const r = new URL(referer, here);
		return r.origin === new URL(here).origin ? `${r.pathname}${r.search}` : "/";
	} catch {
		return "/";
	}
}
