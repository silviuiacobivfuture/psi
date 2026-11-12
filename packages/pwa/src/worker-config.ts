import type { ArticleBrand, PushLocale, PushTexts } from "./push/types";

/**
 * What the server writes in front of the worker's code (`self.__PSI_PWA__ = …`): everything that
 * differs by site. The worker ships no words of its own; these are the site's Paraglide messages.
 */
export interface WorkerConfig {
	site: string;
	/** A hash of this file and the worker's code: a new value is a new worker and new caches. */
	version: string;
	/** Fetched on install: the offline pages, the stylesheet, Datastar, the client and the icons. */
	shell: ReadonlyArray<string>;
	/** The offline page per locale. */
	offline: Readonly<Record<PushLocale, string>>;
	texts: Readonly<Record<PushLocale, PushTexts>>;
	/** Each article brand's name in each locale, for `{brand}`. */
	brandNames: Readonly<Record<PushLocale, Readonly<Record<ArticleBrand, string>>>>;
	/** The app's short name per locale: the title of a push the worker cannot word. */
	names: Readonly<Record<PushLocale, string>>;
	icon: string;
	/** Monochrome badge (Android status bar). */
	badge: string;
	/** The estate's origins: a notification may open a page on one of these, never elsewhere. */
	origins: ReadonlyArray<string>;
}
