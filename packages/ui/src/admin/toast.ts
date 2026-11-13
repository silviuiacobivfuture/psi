import { escapeHtml } from "./escape";

/** The element a toast patches into `#adm-toasts`: a message that removes itself when dismissed. */
export function toastElement(message: string, dismissLabel: string): string {
	return `<div id="adm-toasts" class="adm-toasts" role="status" aria-live="polite"><div class="adm-toast" data-signals="{toast:true}" data-show="$toast"><span>${escapeHtml(message)}</span><button type="button" class="adm-iconbtn" aria-label="${escapeHtml(dismissLabel)}" data-on:click="$toast = false">&times;</button></div></div>`;
}
