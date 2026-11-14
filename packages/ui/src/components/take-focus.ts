/**
 * Focus on arrival: `autofocus` when the element comes with the page, Datastar's `data-init` when it
 * is patched in after a submit (browsers ignore `autofocus` on content inserted later).
 */
export const TAKE_FOCUS: Readonly<Record<string, string>> = {
	autofocus: "autofocus",
	"data-init": "el.focus()",
};
