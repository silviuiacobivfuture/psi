/** The address with `?app=` set to `app` ("all" when no app is chosen), the rest kept. */
export function withApp(href: string, app: string): string {
	const url = new URL(href);
	url.searchParams.delete("brand");
	url.searchParams.set("app", app === "" ? "all" : app);
	return url.toString();
}
