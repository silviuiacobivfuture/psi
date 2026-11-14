/**
 * An element id as a Datastar signal name: "b-details" → "_bDetails". The leading underscore keeps
 * it local to the page (never sent with a request); ids are unique, so two forms never share one.
 */
export function signalName(id: string): string {
	return `_${id.replace(/[^A-Za-z0-9]+([A-Za-z0-9])/g, (_, c: string) => c.toUpperCase())}`;
}
