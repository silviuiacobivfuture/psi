import type { Localized } from "../locale";
import type { CoverKey } from "./covers.generated";

/**
 * What each photo shows, in both locales: alt text describes the picture, never the article it
 * illustrates (the same photo serves many). Exhaustive over the generated manifest.
 */
export const COVER_ALT: Readonly<Record<CoverKey, Localized>> = {
	psizoneEditorial: {
		ro: "O mână răsfoiește paginile unei cărți deschise, în lumină caldă.",
		en: "A hand leafing through an open book in warm light.",
	},
	psizoneFirstStep: {
		ro: "O peniță scrie de mână pe o foaie liniată.",
		en: "A fountain pen writing by hand on lined paper.",
	},
	psizoneHowWeWork: {
		ro: "Două carnete, un pix și o cafea pe o masă de lemn.",
		en: "Two notebooks, a pen and a coffee on a wooden table.",
	},
	eqsyncHeadphones: {
		ro: "Căști negre, văzute de sus, atârnate de marginea unui birou alb.",
		en: "Black headphones seen from above, hanging from the edge of a white desk.",
	},
	eqsyncEvening: {
		ro: "Becuri cu filament aprinse într-o încăpere întunecată.",
		en: "Filament bulbs glowing in a dark room.",
	},
	eqsyncNight: {
		ro: "Două felinare aprinse într-o noapte cu ninsoare.",
		en: "Two lit street lamps on a snowy night.",
	},
	hemisyncExercises: {
		ro: "Cineva stă pe o culme lângă Sinaia și privește soarele care apune peste munți.",
		en: "Someone sits on a ridge near Sinaia, watching the sun set over the mountains.",
	},
	hemisyncFocus: {
		ro: "Nori joși umplu o vale dintre pereți de stâncă.",
		en: "Low clouds fill a valley between rock walls.",
	},
};
