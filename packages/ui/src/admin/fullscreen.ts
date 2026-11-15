/**
 * The console's full-screen hook, for a page that offers it (`fullscreen` on the shell). Any control marked
 * `data-full-toggle` switches it. "Full screen" hides the navigation and the bars (the `is-full` class on the shell)
 * and, where the browser has the Fullscreen API, takes the whole browser window too. The choice is saved in the
 * `adm-full` cookie, so the server renders the next page already right; Escape leaves it in both forms.
 * Delegated on the document, so a control a live update replaced keeps working.
 */
export const ADMIN_FULLSCREEN_JS = `(() => {
	const host = document.currentScript?.closest(".adm");
	if (!host) return;
	const set = (on) => {
		host.classList.toggle("is-full", on);
		document.cookie = "adm-full=" + (on ? "1" : "0") + "; path=/; max-age=31536000; samesite=lax";
		for (const b of document.querySelectorAll("[data-full-toggle]")) b.setAttribute("aria-pressed", String(on));
	};
	const toggle = async () => {
		if (host.classList.contains("is-full")) {
			if (document.fullscreenElement) await document.exitFullscreen();
			set(false);
			return;
		}
		set(true);
		if (document.fullscreenEnabled) await document.documentElement.requestFullscreen();
	};
	document.addEventListener("click", (e) => {
		if (e.target instanceof Element && e.target.closest("[data-full-toggle]")) toggle();
	});
	document.addEventListener("fullscreenchange", () => {
		if (!document.fullscreenElement) set(false);
	});
	document.addEventListener("keydown", (e) => {
		if (e.key === "Escape" && host.classList.contains("is-full") && !document.fullscreenElement) set(false);
	});
})();`;
