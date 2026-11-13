/*
 * ro.js — THE SIGN-IN IN ROMANIAN.
 *
 * Authentik 2026.5.3 ships no Romanian: its interface is compiled with a fixed
 * list of locales (lit-localize) and Romanian is not on it, so every word it
 * writes itself — "Log in", "Continue", "Forgot password?" — is English however
 * the browser is set. What CAN be set in Romanian is set where it lives (flow
 * titles, field labels, the policy's messages — blueprints-theme.yaml and
 * blueprints-recovery.yaml). This file covers the rest: it replaces Authentik's
 * own English with the estate's Romanian, in the page and inside every web
 * component's shadow root, as the text appears.
 *
 * HOW. Loaded as a classic script at the end of <body> by the page template
 * override (templates/skeleton.html, mounted at /templates/base/). Authentik's
 * own code is module scripts, which run only after the page is parsed, so this
 * runs before Authentik defines a single component: it wraps `attachShadow` to
 * watch every shadow root from birth, and a MutationObserver on each translates
 * text nodes and the four attributes a person meets (placeholder, aria-label,
 * title, alt). Lit compares a binding with the value IT last wrote, not with the
 * DOM, so a translated node stays translated until Authentik writes a different
 * English sentence there — which the observer then translates in turn.
 *
 * WHAT IT IS NOT. A translation of strings it does not know: those stay
 * English, exactly as before — never a guess, never an empty label. The admin
 * interface is left alone (its readers are the operators). And it is the
 * TEXT, not the behaviour: no element is added, removed or re-ordered.
 *
 * UPGRADES. The keys are Authentik's English source strings; an upgrade that
 * rewords one leaves that one English (never blank). doctor.sh ("Authentik
 * screens wear the estate's look") checks that this file is served and loaded;
 * re-reading the strings is part of the upgrade (RUNBOOK, 2026-10-23).
 */
(() => {
	if (window.location.pathname.startsWith("/if/admin")) return;
	if (window.__estateRo) return;

	/** Authentik's English, exactly as it renders, → the estate's Romanian. */
	const RO = new Map(
		Object.entries({
			// ── signing in ───────────────────────────────────────────────────
			"Log in": "Autentifică-te",
			Continue: "Continuă",
			"Forgot username or password?": "Ai uitat parola?",
			"Forgot password?": "Ai uitat parola?",
			"Not you?": "Nu ești tu?",
			Password: "Parola",
			"Please enter your password": "Introdu parola",
			"Invalid password": "Parola nu este corectă.",
			"Show password": "Arată parola",
			"Hide password": "Ascunde parola",
			"Caps Lock is enabled.": "Tasta Caps Lock este activă.",
			"Remember me on this device": "Ține-mă minte pe acest dispozitiv",
			"When enabled, your username will be remembered on this device for future logins.":
				"Adresa ta va fi completată automat data viitoare, pe acest dispozitiv.",
			"Need an account?": "Nu ai cont?",
			Email: "E-mail",
			Username: "Nume de utilizator",
			"Email or Username": "E-mail sau nume de utilizator",
			"Email sau Username": "E-mail sau nume de utilizator",
			"Username or Email": "Nume de utilizator sau e-mail",
			"Username sau Email": "Nume de utilizator sau e-mail",
			"Enter the email address or username associated with your account.":
				"Introdu adresa de e-mail a contului tău.",
			"Failed to authenticate.": "Autentificarea nu a reușit.",
			"Failed to authenticate": "Autentificarea nu a reușit",
			"Authenticating...": "Te autentificăm…",
			"Loading...": "Se încarcă…",
			Loading: "Se încarcă",
			"Flow does not apply to current user.": "Această pagină nu se aplică contului tău.",
			"Flow does not apply to current user": "Această pagină nu se aplică contului tău",
			"This flow is completed.": "Pasul acesta s-a încheiat.",
			"Something went wrong! Please try again later.":
				"Ceva nu a mers. Încearcă din nou mai târziu.",
			"An unknown error occurred": "A apărut o eroare neprevăzută",
			"There was an error submitting the form.": "Formularul nu a putut fi trimis.",
			"This field is required.": "Câmpul este obligatoriu.",
			"This field may not be blank.": "Câmpul nu poate rămâne gol.",
			"Auto-Detect": "Automat",
			"Auto-detect": "Automat",
			"Required.": "Obligatoriu.",

			// ── second factor ────────────────────────────────────────────────
			"Authentication code": "Cod de autentificare",
			"Type an authentication code...": "Introdu codul",
			"Open your authenticator app to retrieve a one-time use code.":
				"Introdu codul din aplicația de autentificare.",
			"Enter the code from your authenticator device.":
				"Introdu codul din aplicația de autentificare.",
			"Invalid Token. Please ensure the time on your device is accurate and try again.":
				"Cod incorect. Verifică dacă ora de pe telefon este corectă și încearcă din nou.",
			"Select an authentication method": "Alege metoda de autentificare",
			"Select another authentication method": "Alege altă metodă de autentificare",
			"Select a configuration stage": "Alege ce configurezi",
			"Select one of the options below to continue.": "Alege una dintre variantele de mai jos.",
			"Traditional authenticator": "Aplicație de autentificare",
			"Use a code-based authenticator.": "Folosește codul din aplicația de autentificare.",
			"Time-based one-time password": "Cod de unică folosință",
			"Please scan the QR code above using the Microsoft Authenticator, Google Authenticator, or other authenticator apps on your device, and enter the code the device displays below to finish setting up the MFA device.":
				"Scanează codul QR de mai sus cu Google Authenticator, Microsoft Authenticator sau altă aplicație de autentificare de pe telefon, apoi introdu mai jos codul afișat de aplicație.",
			"QR-Code to setup a time-based one-time password":
				"Cod QR pentru configurarea aplicației de autentificare",
			"Copy TOTP Config": "Copiază configurarea",
			"Copy Secret": "Copiază cheia",
			"Copy time-based one-time password configuration":
				"Copiază configurarea aplicației de autentificare",
			"Copy time-based one-time password secret": "Copiază cheia aplicației de autentificare",
			"Paste this URL into your authenticator app to set up a time-based one-time password.":
				"Lipește această adresă în aplicația de autentificare pentru a o configura.",
			"Paste this secret into your authenticator app to set up a time-based one-time password.":
				"Lipește această cheie în aplicația de autentificare pentru a o configura.",
			"TOTP Code": "Cod din aplicație",
			"Type your TOTP code...": "Introdu codul din aplicație",
			"Type your time-based one-time password code.":
				"Introdu codul din aplicația de autentificare.",
			"Copied to clipboard.": "Copiat.",
			"Copy to clipboard": "Copiază",
			"Clipboard not available. Please copy the value manually.":
				"Copierea automată nu este disponibilă. Copiază valoarea manual.",
			"Invalid response code": "Cod incorect",
			"Stay signed in?": "Rămâi autentificat?",
			"Select Yes to reduce the number of times you're asked to sign in.":
				"Alege Da ca să ți se ceară autentificarea mai rar.",

			// ── recovery: the e-mailed link ──────────────────────────────────
			"Check your Inbox for a verification email.":
				"Ți-am trimis un e-mail. Deschide linkul din el ca să îți alegi parola.",
			"Resend Email": "Retrimite e-mailul",
			"Email sent": "E-mail trimis",
			"Email Successfully sent.": "E-mailul a fost trimis.",
			"Password set": "Parola a fost setată",

			// ── refusals and errors ──────────────────────────────────────────
			"Permission denied": "Acces refuzat",
			"Request has been denied.": "Accesul a fost refuzat.",
			"Interface can only be accessed by internal users.":
				"Pagina contului este disponibilă doar conturilor interne.",
			"Go home": "Înapoi la început",
			"Go back": "Înapoi",
			"Return home": "Înapoi la început",
			"Not found": "Pagina nu există",
			"Retry authentication": "Încearcă din nou",

			// ── consent, redirects, signing out ──────────────────────────────
			"Application requires following permissions:": "Aplicația cere următoarele permisiuni:",
			"Application already has access to the following permissions:":
				"Aplicația are deja acces la următoarele:",
			"Application requires following new permissions:": "Aplicația cere aceste permisiuni noi:",
			"Application authorized": "Aplicație autorizată",
			"General Profile Information": "Informațiile generale ale profilului",
			"Email address": "Adresa de e-mail",
			"User's groups": "Grupurile contului",
			"Access to offline_access": "Acces când nu ești conectat",
			"Follow redirect": "Continuă",
			"You're about to be redirected to the following URL.":
				"Urmează să fii trimis la adresa de mai jos.",
			"Logging out of providers...": "Te deconectăm din aplicații…",
			"You may close this page now.": "Poți închide această pagină.",
			"Single Logout": "Deconectare din toate aplicațiile",

			// ── the account pages (/if/user/) ────────────────────────────────
			"Skip to content": "Sari la conținut",
			"Application Dashboard": "Aplicațiile mele",
			"Application list": "Lista aplicațiilor",
			"Search for an application by name...": "Caută o aplicație după nume",
			"Type to filter applications": "Scrie pentru a filtra aplicațiile",
			"No Applications available.": "Nicio aplicație disponibilă.",
			"Either no applications are defined, or you don’t have access to any.":
				"Nu ai acces la nicio aplicație deocamdată.",
			Ungrouped: "Fără grup",
			Settings: "Setări",
			"Sign out": "Deconectare",
			"User settings": "Setările contului",
			"User details": "Datele contului",
			"Update details": "Actualizează datele",
			"Successfully updated details": "Datele au fost actualizate",
			Name: "Nume",
			Locale: "Limba",
			Save: "Salvează",
			"Save Changes": "Salvează modificările",
			"Saving Changes...": "Se salvează…",
			"Change your password": "Schimbă-ți parola",
			"Change password": "Schimbă parola",
			Sessions: "Sesiuni",
			Consent: "Acorduri",
			Credentials: "Autentificare",
			"MFA Devices": "Aplicații de autentificare",
			"No MFA devices enrolled.": "Nicio aplicație de autentificare configurată.",
			Enroll: "Adaugă",
			"TOTP Device": "Aplicație de autentificare (TOTP)",
			"Connected services": "Servicii conectate",
			"Connect your user account to the services listed below, to allow you to login using the service instead of traditional credentials.":
				"Conturile externe legate de contul tău.",
			"No services available.": "Niciun serviciu disponibil.",
			"Tokens and App passwords": "Tokenuri și parole de aplicație",
			"User Tokens": "Tokenuri",
			"No User Tokens enrolled.": "Niciun token.",
			"Create Token": "Creează un token",
			"Create App Password": "Creează o parolă de aplicație",
			"New Token": "Token nou",
			"New App Password": "Parolă de aplicație nouă",
			Refresh: "Reîmprospătează",
			Delete: "Șterge",
			Edit: "Modifică",
			Cancel: "Renunță",
			Close: "Închide",
			Actions: "Acțiuni",
			Type: "Tip",
			Identifier: "Identificator",
			Application: "Aplicație",
			Permissions: "Permisiuni",
			Expires: "Expiră",
			"Expires on": "Expiră la",
			"Created at": "Creat la",
			"Last IP": "Ultima adresă IP",
			"Last used": "Ultima folosire",
			"Last used at": "Folosit ultima dată la",
			"Last refreshed": "Actualizat",
			"Delete account": "Șterge contul",
			"No objects found.": "Nimic de afișat.",
			"Search...": "Caută…",
			"What are you looking for?": "Ce cauți?",
			Notifications: "Notificări",
			"Notification Drawer": "Notificări",
			unread: "necitite",
			"No notifications found.": "Nicio notificare.",
			"You don't have any notifications currently.": "Nu ai notificări.",
			"Clear all notifications": "Șterge toate notificările",
			"Mark as read": "Marchează ca citită",

			// ── the page's own landmarks (read by screen readers) ────────────
			"Additional actions": "Alte acțiuni",
			"Form actions": "Acțiunile formularului",
			"Authentication form": "Formular de autentificare",
			"User information": "Contul",
			"Status messages": "Mesaje",
			"Site footer": "Subsolul paginii",
			"Site links": "Linkuri",
			"Flow links": "Linkuri",
			"Select language": "Alege limba",
			Main: "Conținut",
			Error: "Eroare",
			"Toggle notifications drawer": "Arată sau ascunde notificările",
			"Close notification drawer": "Închide notificările",
			"Table actions": "Acțiuni",
			"Table content": "Conținutul tabelului",
			"Table Search": "Caută în tabel",
			"Row Actions": "Acțiuni",
			"Column actions": "Acțiuni",
			"Avatar image": "Avatar",
			"authentik Logo": "Psi",
			"User avatar": "Avatar",
		}),
	);

	/** Sentences with a name or a number in them. */
	const PATTERNS = [
		[
			/^(\d+) applications? available$/,
			(_, n) => (n === "1" ? "o aplicație disponibilă" : `${n} aplicații disponibile`),
		],
		[/^Open "(.+)"$/, (_, app) => `Deschide „${app}”`],
		[/^(.+) Icon$/, (_, app) => `Pictograma ${app}`],
		[/^Sort by "(.+)"$/, (_, col) => `Sortează după „${RO.get(col) ?? col}”`],
		[/^Welcome, (.+)\.?$/, (_, who) => `Bine ai venit, ${who}`],
		[
			/^(.+) - (?:authentik|Psi)$/,
			(_, title) => `${RO.get(title) ?? title} — Psi`,
		],
		[
			/^Select all rows on page \((\d+) of (\d+) selected\)$/,
			(_, a, b) => `Selectează toate rândurile (${a} din ${b})`,
		],
	];

	const ATTRIBUTES = ["placeholder", "aria-label", "title", "alt"];

	/** The Romanian for a piece of Authentik's English, or null to leave it be. */
	function translate(text) {
		const key = text.trim();
		if (!key) return null;
		const direct = RO.get(key);
		if (direct !== undefined) return text.replace(key, direct);
		for (const [pattern, rewrite] of PATTERNS) {
			if (pattern.test(key)) return text.replace(key, key.replace(pattern, rewrite));
		}
		return null;
	}

	function translateElement(element) {
		for (const name of ATTRIBUTES) {
			const value = element.getAttribute(name);
			if (value === null) continue;
			const ro = translate(value);
			if (ro !== null && ro !== value) element.setAttribute(name, ro);
		}
		// Some fields get their placeholder as a PROPERTY (Lit's `.placeholder=`),
		// which no attribute observer sees. By the time a node is inserted Lit
		// has set it, so it is read here, once, as the field arrives.
		if (
			(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) &&
			!element.hasAttribute("placeholder") &&
			element.placeholder
		) {
			const ro = translate(element.placeholder);
			if (ro !== null && ro !== element.placeholder) element.placeholder = ro;
		}
	}

	function translateNode(node) {
		if (node.nodeType === Node.TEXT_NODE) {
			const parent = node.parentNode;
			if (parent && (parent.nodeName === "SCRIPT" || parent.nodeName === "STYLE")) return;
			const ro = translate(node.data);
			if (ro !== null && ro !== node.data) node.data = ro;
			return;
		}
		if (
			node.nodeType !== Node.ELEMENT_NODE &&
			node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE &&
			node.nodeType !== Node.DOCUMENT_NODE
		)
			return;
		if (node.nodeType === Node.ELEMENT_NODE) {
			translateElement(node);
			if (node.shadowRoot) watch(node.shadowRoot);
		}
		for (const child of node.childNodes) translateNode(child);
	}

	const watched = new WeakSet();

	/** Translate a document or shadow root now, and everything written into it later. */
	function watch(root) {
		if (watched.has(root)) return;
		watched.add(root);
		new MutationObserver((mutations) => {
			for (const m of mutations) {
				if (m.type === "characterData") translateNode(m.target);
				else if (m.type === "attributes") translateElement(m.target);
				else for (const added of m.addedNodes) translateNode(added);
			}
		}).observe(root, {
			subtree: true,
			childList: true,
			characterData: true,
			attributes: true,
			attributeFilter: ATTRIBUTES,
		});
		translateNode(root);
	}

	const attachShadow = Element.prototype.attachShadow;
	Element.prototype.attachShadow = function attachShadowInRomanian(init) {
		const root = attachShadow.call(this, init);
		watch(root);
		return root;
	};

	document.documentElement.lang = "ro";
	watch(document);

	// For the drift test and for doctor.sh: what this file knows, by key. One fixed
	// global for every estate: a name built from the short name would not be valid
	// JavaScript for a hyphenated one.
	window.__estateRo = { translate, size: RO.size };
})();
