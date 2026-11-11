/*
 * PDFCraft's script slot, loaded by the nginx front from <head> on every page (nginx.conf).
 * SEB's default does one thing: upstream's automatic "check for updates" asks GitHub and two
 * third-party mirrors from every visitor's browser; it reads its switch from localStorage, so
 * the switch is set OFF here, before their application starts. An estate's component
 * (components/estate/pdfcraft) may replace this file (keeping the switch off).
 */
(() => {
	const UPDATE_SETTINGS = "pdfcraft_update_settings";
	try {
		const raw = window.localStorage.getItem(UPDATE_SETTINGS);
		const settings = raw ? JSON.parse(raw) : {};
		if (settings === null || typeof settings !== "object" || settings.autoCheck !== false) {
			window.localStorage.setItem(
				UPDATE_SETTINGS,
				JSON.stringify({ ...(settings || {}), autoCheck: false }),
			);
		}
	} catch {
		/* storage blocked: the check runs as upstream ships it */
	}
})();
