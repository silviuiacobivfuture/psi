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
	"cv-adhd-1": {
		ro: "O mână ține un avion de hârtie alb deasupra acoperișurilor unui oraș.",
		en: "A hand holding a white paper plane above a city of rooftops.",
	},
	"cv-adhd-2": {
		ro: "Doi copii aleargă departe, pe un câmp cu iarbă, în alb-negru.",
		en: "Two children running away across a grassy field, in black and white.",
	},
	"cv-adhd-3": {
		ro: "Un buchet de baloane legate cu sfoară, pe un cer albastru.",
		en: "A bunch of balloons on a string against a blue sky.",
	},
	"cv-adhd-4": {
		ro: "Un balon cu aer cald se ridică deasupra unui lac liniștit, în lumina dimineții.",
		en: "A hot-air balloon rising over a still lake in morning light.",
	},
	"cv-adolescenti-1": {
		ro: "O placă de skateboard pe o parte, pe fundalul unui apus roz-violet.",
		en: "A skateboard on its side against a pink and violet sunset.",
	},
	"cv-adolescenti-2": {
		ro: "Un skater singur, departe, pe un drum prin pădure la apus.",
		en: "A lone skater far down a forest road at sunset.",
	},
	"cv-adolescenti-3": {
		ro: "Un longboard colorat sprijinit de un gard de lemn.",
		en: "A colourful longboard leaning on a wooden fence.",
	},
	"cv-adolescenti-4": {
		ro: "Degete apăsând corzile pe gâtul unei chitare.",
		en: "Fingers pressing the frets of a guitar neck.",
	},
	"cv-anxietate-depresie-1": {
		ro: "O cameră în penumbră, cu o perdea închisă lângă o fereastră cenușie de ploaie.",
		en: "A dim room with a dark curtain beside a window grey with rain.",
	},
	"cv-anxietate-depresie-2": {
		ro: "Picături de ploaie pe un geam, cu strada încețoșată în spate.",
		en: "Raindrops on a window pane, the street blurred behind.",
	},
	"cv-anxietate-depresie-3": {
		ro: "Ceață care se așază printr-o pădure de toamnă, într-o vale.",
		en: "Mist drifting through an autumn forest in a valley.",
	},
	"cv-anxietate-depresie-4": {
		ro: "Umbre de plante pe o perdea subțire, la o fereastră luminoasă.",
		en: "Shadows of plants on a sheer curtain in a bright window.",
	},
	"cv-autism-1": {
		ro: "Creioane colorate într-o cutie galbenă, lângă un copil care desenează, fără chip la vedere.",
		en: "Crayons in a yellow box beside a child colouring, seen without a face.",
	},
	"cv-autism-2": {
		ro: "Două palme făcute căuș țin câteva creioane cerate albastre.",
		en: "Two cupped hands holding a few blue crayons.",
	},
	"cv-autism-3": {
		ro: "Cretă colorată pastelată, așezată pe hârtie de ambalaj.",
		en: "Pastel chalks laid out on brown paper.",
	},
	"cv-autism-4": {
		ro: "O cutie cu creioane cerate pe o masă, în lumină blândă.",
		en: "A box of crayons on a table in soft light.",
	},
	"cv-creier-si-minte-1": {
		ro: "Un labirint desenat în nisipul deschis de lângă mare, cu o siluetă mică ce îi străbate cercurile.",
		en: "A labyrinth raked into pale sand by the sea, one tiny figure walking its rings.",
	},
	"cv-creier-si-minte-2": {
		ro: "Piese de șah închise la culoare, aliniate pe o tablă de lemn lustruit.",
		en: "Dark chess pieces lined up on a polished wooden board.",
	},
	"cv-creier-si-minte-3": {
		ro: "O lampă mică de alamă, aprinsă lângă un teanc de cărți vechi, într-o cameră întunecată.",
		en: "A small brass lamp glowing beside a stack of old books in a dark room.",
	},
	"cv-creier-si-minte-4": {
		ro: "O bibliotecă somptuoasă, cu lambriuri de lemn și cărți până la tavanul aurit.",
		en: "A grand wood-panelled library with books climbing to a gilded ceiling.",
	},
	"cv-cum-lucram-1": {
		ro: "Un fotoliu portocaliu cu model, într-o cameră albă și luminoasă, lângă o măsuță.",
		en: "A patterned orange armchair in a bright white room beside a small side table.",
	},
	"cv-cum-lucram-2": {
		ro: "Un living luminos, cu o canapea gri, o masă joasă din lemn și tapet cu frunze.",
		en: "A bright living room with a grey sofa, a low wooden table and leafy wallpaper.",
	},
	"cv-cum-lucram-3": {
		ro: "Un living cald, cu un candelabru, tablouri în ramă și flori pe o măsuță joasă.",
		en: "A warm living room with a chandelier, framed pictures and flowers on a low table.",
	},
	"cv-cum-lucram-4": {
		ro: "Flori mici în ghivece și un ceainic alb pe pervaz, în fața unor câmpuri verzi.",
		en: "Small potted flowers and a white teapot on a windowsill in front of green fields.",
	},
	"cv-cuplu-familie-1": {
		ro: "Două perechi de mâini în jurul unor ceșcuțe de cafea, pe o masă rotundă de piatră.",
		en: "Two pairs of hands around small cups of coffee on a round stone table.",
	},
	"cv-cuplu-familie-2": {
		ro: "Un cuplu merge mână în mână pe un gazon luminat de soare, văzut din spate.",
		en: "A couple walking hand in hand across a sunlit lawn, seen from behind.",
	},
	"cv-cuplu-familie-3": {
		ro: "Două siluete mici stau pe malul unei ape liniștite, la apus.",
		en: "Two small figures standing by a calm shore at sunset.",
	},
	"cv-cuplu-familie-4": {
		ro: "Două siluete stau pe o bancă, pe un cer chihlimbariu.",
		en: "Two silhouettes sitting on a bench against an amber sky.",
	},
	"cv-editorial-1": {
		ro: "Un birou văzut de sus: o mașină de scris veche, o cafea, un aparat foto și trandafiri roșii.",
		en: "A desk seen from above: an old typewriter, a coffee, a camera and red roses.",
	},
	"cv-editorial-2": {
		ro: "O mașină de scris turcoaz pe un birou de lemn deschis, lângă un carnet și o plantă.",
		en: "A teal typewriter on a pale wooden desk beside a notebook and a plant.",
	},
	"cv-editorial-3": {
		ro: "Rafturi de lemn pline cu cărți de toate culorile.",
		en: "Wooden shelves filled with books in many colours.",
	},
	"cv-editorial-4": {
		ro: "O felicitare roșie, un carnet și un toc de pix pe o masă de piatră.",
		en: "A red thank-you card, a notebook and a fountain pen on a stone table.",
	},
	"cv-explorarea-constiintei-1": {
		ro: "O mare joasă de ceață umple o vale, sub un cer de apus chihlimbariu.",
		en: "A low sea of mist filling a valley under an amber sunset sky.",
	},
	"cv-explorarea-constiintei-2": {
		ro: "O cupolă de granit luminată în roz se ridică deasupra unui strat de nori, la apus.",
		en: "A rose-lit granite dome rising above a bed of cloud at sunset.",
	},
	"cv-explorarea-constiintei-3": {
		ro: "Bocancii unui drumeț, sprijiniți pe o stâncă, deasupra unei văi împădurite și a norilor joși.",
		en: "A walker’s boots resting on a rock above a wooded valley and low cloud.",
	},
	"cv-explorarea-constiintei-4": {
		ro: "Ceață care se rostogolește peste dealuri înzăpezite și copaci desfrunziți, în lumină cenușie.",
		en: "Fog rolling over snowy hills and bare trees in grey light.",
	},
	"cv-integrare-senzoriala-1": {
		ro: "Două mâini apăsate în nisip ud, cu sclipiri de apă pe piele.",
		en: "Two hands pressed into wet sand, with glints of water on the skin.",
	},
	"cv-integrare-senzoriala-2": {
		ro: "O persoană ghemuită lasă nisipul uscat să se scurgă printre degete.",
		en: "A crouching person letting dry sand run through their fingers.",
	},
	"cv-integrare-senzoriala-3": {
		ro: "Mâini modelează lut ud pe o masă de lemn.",
		en: "Hands shaping wet clay on a wooden table.",
	},
	"cv-integrare-senzoriala-4": {
		ro: "Palme făcute căuș țin lăstari verzi, proaspeți, de molid.",
		en: "Cupped hands holding fresh green spruce shoots.",
	},
	"cv-logopedie-1": {
		ro: "Un șir de clape vechi, de culoare crem, cu literele de la A la H.",
		en: "A row of old cream-coloured letter keys, A to H.",
	},
	"cv-logopedie-2": {
		ro: "Mâini țin deschisă o cărticică ilustrată, sprijinită pe genunchi.",
		en: "Hands holding a small picture book open on someone’s lap.",
	},
	"cv-logopedie-3": {
		ro: "Cotoarele unor cărți pentru copii, colorate, pe un raft.",
		en: "Spines of colourful children’s books on a shelf.",
	},
	"cv-logopedie-4": {
		ro: "Silueta unui copil care citește o carte pe un deal, la apus.",
		en: "The silhouette of a child reading a book on a hillside at sunset.",
	},
	"cv-meditatie-si-relaxare-1": {
		ro: "O singură lumânare roșie, arzând în întuneric deplin.",
		en: "A single red candle burning in complete darkness.",
	},
	"cv-meditatie-si-relaxare-2": {
		ro: "Două borcane de sticlă cu lumânări aprinse, strălucind într-o cameră albastră, în penumbră.",
		en: "Two glass jars with lit candles glowing in a dim blue room.",
	},
	"cv-meditatie-si-relaxare-3": {
		ro: "O potecă îngustă, plină de rădăcini, care șerpuiește printr-o pădure verde.",
		en: "A narrow, root-covered path winding through a green forest.",
	},
	"cv-meditatie-si-relaxare-4": {
		ro: "Un drum de pădure luminat de soare, care se curbează printre pini înalți.",
		en: "A sunlit woodland track curving between tall pines.",
	},
	"cv-neuromodulare-1": {
		ro: "Un far văzut de jos, cu lampa care aruncă o stea de lumină pe un cer chihlimbariu.",
		en: "A lighthouse seen from below, its lamp throwing a star of light into an amber sky.",
	},
	"cv-neuromodulare-2": {
		ro: "Piloni electrici cu cablurile lor, pe un cer verzui de seară.",
		en: "Electricity pylons with their cables against a pale green dusk sky.",
	},
	"cv-neuromodulare-3": {
		ro: "Un singur bec cald, aprins, pe o suprafață întunecată.",
		en: "A single warm glowing light bulb on a dark surface.",
	},
	"cv-neuromodulare-4": {
		ro: "O busolă de alamă deschisă pe o stâncă deschisă la culoare, în lumina soarelui.",
		en: "A brass compass open on a pale rock in sunlight.",
	},
	"cv-parinti-1": {
		ro: "Un rând de leagăne goale dintr-un parc de joacă, în lumină blândă.",
		en: "A row of empty playground swings hanging in soft light.",
	},
	"cv-parinti-2": {
		ro: "Două leagăne de lemn atârnate sub copaci înalți, într-un parc liniștit.",
		en: "Two wooden swings hanging under tall trees in a quiet park.",
	},
	"cv-parinti-3": {
		ro: "Un copil mic se îndepărtează pe un drum gol, prin pădure.",
		en: "A small child walking away down an empty road through the woods.",
	},
	"cv-parinti-4": {
		ro: "O mamă și doi copii, siluete pe un ponton, la apus.",
		en: "A mother and two children as silhouettes on a pier at sunset.",
	},
	"cv-post-avc-1": {
		ro: "Două mâini în vârstă pe clapele unui pian, în alb-negru.",
		en: "An older pair of hands resting on piano keys, in black and white.",
	},
	"cv-post-avc-2": {
		ro: "Un picior urcă o scară cu trepte cu muchia galbenă.",
		en: "A foot stepping up a staircase with yellow-edged treads.",
	},
	"cv-post-avc-3": {
		ro: "O persoană se îndepărtează pe o alee din parc, printre copaci, în lumină pătată.",
		en: "A person walking away along a tree-lined park path in dappled light.",
	},
	"cv-post-avc-4": {
		ro: "O scară deschisă la culoare, cu o balustradă subțire de fier, pe un perete simplu.",
		en: "A pale staircase with a thin iron rail rising along a plain wall.",
	},
	"cv-programul-eqsync-1": {
		ro: "O lună aurie care răsare în spatele unor coroane de copaci întunecate.",
		en: "A golden moon rising behind dark treetops.",
	},
	"cv-programul-eqsync-2": {
		ro: "O lună plină aurie pe un cer de seară, de un albastru-verzui adânc.",
		en: "A golden full moon on a deep teal evening sky.",
	},
	"cv-programul-eqsync-3": {
		ro: "Ferestrele luminate ale unui turn de birouri, strălucind roz și albastru noaptea.",
		en: "The lit windows of an office tower glowing pink and blue at night.",
	},
	"cv-programul-eqsync-4": {
		ro: "O plajă liniștită la amurg, sub un cer care se stinge în albastru și chihlimbar.",
		en: "A quiet beach at dusk under a fading blue and amber sky.",
	},
	"cv-psiho-oncologie-1": {
		ro: "Două mâini țin o lumânare aprinsă într-un borcan de sticlă, pe un fundal verde-albăstrui închis.",
		en: "Two hands cradling a lit candle in a glass jar against a deep teal background.",
	},
	"cv-psiho-oncologie-2": {
		ro: "Mâini se încălzesc în jurul unui pahar de carton, cu un fular roșu tricotat și un palton gri.",
		en: "Hands warming around a paper cup, a red knitted scarf and a grey coat.",
	},
	"cv-psiho-oncologie-3": {
		ro: "O plantă verde mică, într-un ghiveci, pe o suprafață albă, văzută de sus.",
		en: "A small green plant in a pot on a white surface, seen from above.",
	},
	"cv-psiho-oncologie-4": {
		ro: "Două persoane merg mână în mână pe un trotuar.",
		en: "Two people holding hands as they walk down a city pavement.",
	},
	"cv-psihoterapie-1": {
		ro: "O canapea albastră într-o cameră luminoasă, lângă o bibliotecă înaltă din lemn.",
		en: "A blue sofa in a bright room beside a tall wooden bookshelf.",
	},
	"cv-psihoterapie-2": {
		ro: "Fotolii și o masă joasă într-un colț luminos, cu pereți de cărămidă și plante.",
		en: "Armchairs and a low table in a sunlit corner with brick walls and plants.",
	},
	"cv-psihoterapie-3": {
		ro: "Lumina soarelui se strecoară printr-o perdea, în falduri calde.",
		en: "Sunlight spilling through a window curtain in warm folds.",
	},
	"cv-psihoterapie-4": {
		ro: "O canapea roz și două măsuțe joase de lemn, într-o încăpere luminoasă.",
		en: "A pink sofa and two low wooden coffee tables in a bright room.",
	},
	"cv-qeeg-1": {
		ro: "Unduiri fine pe suprafața apei, în lumină violetă și argintie.",
		en: "Fine ripples across the surface of water in violet and silver light.",
	},
	"cv-qeeg-2": {
		ro: "Unduiri blânde pe apa albastră, cu reflexii calde.",
		en: "Gentle ripples on blue water catching warm reflections.",
	},
	"cv-qeeg-3": {
		ro: "Ondulații desenate de vânt pe curba unei dune de nisip.",
		en: "Wind-drawn ripples on the curve of a sand dune.",
	},
	"cv-qeeg-4": {
		ro: "Cercuri concentrice care se întind pe apa neagră și liniștită.",
		en: "Concentric rings spreading across dark, still water.",
	},
	"cv-sport-1": {
		ro: "Liniile de start numerotate ale unei piste roșii de alergare.",
		en: "The numbered start lines of a red running track.",
	},
	"cv-sport-2": {
		ro: "Șapte sprinteri aliniați pe o pistă roșie, văzuți de sus.",
		en: "Seven sprinters lined up on a red track, seen from high above.",
	},
	"cv-sport-3": {
		ro: "O minge de fotbal pe un teren cu iarbă proaspăt tunsă.",
		en: "A football resting on a freshly cut grass pitch.",
	},
	"cv-sport-4": {
		ro: "Culoare goale de înot, într-un bazin acoperit și luminos.",
		en: "Empty swimming lanes in a bright indoor pool hall.",
	},
	"cv-sunet-si-creier-1": {
		ro: "Căști luminate blând de o lumină caldă, lângă un telefon, într-o cameră întunecată.",
		en: "Headphones glowing softly in warm light beside a phone, in a dark room.",
	},
	"cv-sunet-si-creier-2": {
		ro: "Discuri așezate pe un raft, lângă o pereche de căști negre.",
		en: "Records standing on a shelf beside a pair of black headphones.",
	},
	"cv-sunet-si-creier-3": {
		ro: "Un disc de vinil cu o etichetă turcoaz și portocalie, rotindu-se pe un pick-up.",
		en: "A vinyl record with a teal and orange label turning on a turntable.",
	},
	"cv-sunet-si-creier-4": {
		ro: "O mână pe clapele unui pian, cu încăperea din spate ușor estompată.",
		en: "A hand moving over piano keys, the room behind it softly blurred.",
	},
};
