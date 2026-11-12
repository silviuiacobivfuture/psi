import type { ArticleInput } from "../../../schema";

export const article: ArticleInput = {
	slug: "istoria-cercetarii-constiintei",
	brand: "hemisync",
	topic: "explorarea-constiintei",
	backlogNo: null,
	status: "draft",
	kind: "editorial",
	aiDrafted: true,
	draftedAt: "2026-11-12",
	author: null,
	reviewer: null,
	title: {
		ro: "Istoria cercetării conștiinței: de la William James la neuroștiințe",
		en: "The history of consciousness research: from William James to neuroscience",
	},
	standfirst: {
		ro: "Cercetarea conștiinței a mers în valuri: introspecția lui William James (1890), tăcerea behaviorismului, primul EEG uman al lui Hans Berger (1924), revenirea subiectului în anii ’80–’90 și, azi, teorii care se testează una împotriva alteia. Parapsihologia a mers pe un drum paralel și mereu contestat.",
		en: "Consciousness research has moved in waves: William James’s introspection (1890), behaviourism’s silence, Hans Berger’s first human EEG (1924), the subject’s return in the 1980s and 1990s and, today, theories tested against one another. Parapsychology ran on a parallel, always contested road.",
	},
	cover: {
		src: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Blue_Ridge_Parkway_clouds_VA1.jpg/1280px-Blue_Ridge_Parkway_clouds_VA1.jpg",
		alt: {
			ro: "Un drum de munte care dispare în ceață, cu o culme îndepărtată deasupra norilor joși.",
			en: "A mountain road that vanishes into fog, with a distant ridge above the low clouds.",
		},
		width: 1280,
		height: 773,
	},
	body: [
		{
			type: "p",
			text: {
				ro: "Pe scurt: știința conștiinței a început serios cu introspecția psihologilor de la sfârșitul secolului al XIX-lea, a fost aproape ștearsă de behaviorism, a primit o fereastră fizică odată cu electroencefalograma (1924) și a revenit ca subiect respectabil abia în anii ’80–’90. Azi nu există o teorie acceptată de toți, iar două dintre cele mai cunoscute au fost puse, în 2025, la un test direct.",
				en: "In short: the science of consciousness began in earnest with the introspection of psychologists in the late nineteenth century, was nearly erased by behaviourism, gained a physical window with the electroencephalogram (1924) and returned as a respectable subject only in the 1980s and 1990s. Today there is no theory accepted by everyone, and two of the best known were put to a direct test in 2025.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Ce urmează e o cronologie cu oameni și cu răscruci, nu un manual. Am ales momentele care se văd și din afara laboratorului: cele în care s-a schimbat ceea ce se considera o întrebare permisă. La final vei vedea și unde își găsesc locul cei care explorează conștiința din interior, cu o practică, nu cu un aparat.",
				en: "What follows is a timeline of people and turning points, not a textbook. We chose the moments you can see even from outside the laboratory: the ones in which what counted as a permitted question changed. At the end you will see where those who explore consciousness from the inside, with a practice rather than an instrument, find their place.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum a început studiul conștiinței: cu introspecția lui William James?",
				en: "How did the study of consciousness begin: with William James and introspection?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Întrebările sunt mult mai vechi. Enciclopedia de Filosofie de la Stanford amintește că Descartes (1640) definea gândirea prin conștiința de sine, că Locke (1688) făcea din conștientizare o condiție a gândului și că Leibniz admitea, încă din 1686, „percepții mici” de care nu suntem conștienți. Dar ca știință experimentală, subiectul se naște în psihologia de la sfârșitul secolului al XIX-lea, cu Wundt, cu Titchener și cu William James.",
				en: "The questions are much older. The Stanford Encyclopedia of Philosophy recalls that Descartes (1640) defined thought through self-awareness, that Locke (1688) made awareness a condition of thought and that Leibniz, as early as 1686, allowed for “small perceptions” of which we are not aware. But as an experimental science, the subject is born in the psychology of the late nineteenth century, with Wundt, with Titchener and with William James.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Metoda lor era introspecția: observatorul își privește propria experiență și o descrie. În „The Principles of Psychology” (1890), James a vorbit despre minte ca despre un curent, nu ca despre un șir de bucăți, iar paginile lui au rămas în gândire și azi. Un contemporan, Thomas Huxley, spusese încă din 1866 că legătura dintre creier și conștiință e „inexplicabilă”: o frază pe care mulți cercetători de azi ar subscrie fără prea multe modificări.",
				en: "Their method was introspection: the observer looks at their own experience and describes it. In “The Principles of Psychology” (1890), James spoke of the mind as a stream, not a string of pieces, and his pages have stayed in thought to this day. A contemporary, Thomas Huxley, had said as early as 1866 that the link between brain and consciousness is “unaccountable”: a sentence many researchers today would sign with few changes.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "De ce a tăcut psihologia o jumătate de secol?",
				en: "Why did psychology fall silent for half a century?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Introspecția are o slăbiciune evidentă: doi observatori pot descrie diferit același lucru, iar nimeni nu poate verifica din afară ce vede celălalt. În 1913, John Watson a publicat „Psychology as the Behaviorist Views It”, în care cerea ca psihologia să fie o ramură „pur obiectivă și experimentală a științelor naturii”. Enciclopedia de la Stanford observă că articolul nu se ocupă direct de conștiință; efectul lui a fost, totuși, că subiectul a ieșit din laborator.",
				en: "Introspection has an obvious weakness: two observers may describe the same thing differently, and no one can check from outside what the other sees. In 1913 John Watson published “Psychology as the Behaviorist Views It”, in which he asked for psychology to be a “purely objective experimental branch of natural science”. The Stanford Encyclopedia observes that the paper does not deal directly with consciousness; its effect, nonetheless, was that the subject left the laboratory.",
			},
		},
		{
			type: "p",
			text: {
				ro: "B. F. Skinner a dus ideea cel mai departe. El nu nega că stările interioare există; spunea că ele nu sunt relevante într-o analiză funcțională (1953). Behaviorismul a dominat psihologia, în linii mari, din anii ’20 până spre mijlocul secolului. A slăbit când psihologia cognitivă, între aproximativ 1960 și 1985, a început din nou să modeleze procese mentale. Dar și atunci conștiința a rămas, spune aceeași sursă, neglijată până în anii ’80–’90.",
				en: "B. F. Skinner took the idea furthest. He did not deny that inner states exist; he said they are not relevant in a functional analysis (1953). Behaviourism dominated psychology, broadly, from the 1920s until the middle of the century. It weakened when cognitive psychology, between about 1960 and 1985, began again to model mental processes. Even then consciousness stayed, the same source says, neglected until the 1980s and 1990s.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce a schimbat electroencefalograma lui Hans Berger (1924)?",
				en: "What did Hans Berger’s electroencephalogram (1924) change?",
			},
		},
		{
			type: "p",
			text: {
				ro: "În timp ce psihologia tăcea, medicina a primit un instrument. Scientific American reia istoria: Richard Caton anunțase în 1875, la Edinburgh, unde înregistrase activitate electrică din creierul iepurilor și al maimuțelor; descoperirea lui a fost aproape uitată vreme de o jumătate de secol. Hans Berger a înregistrat în 1924, la Jena, primul EEG uman și a ținut descoperirea secretă cinci ani.",
				en: "While psychology was silent, medicine received an instrument. Scientific American retells the story: Richard Caton had announced in 1875, in Edinburgh, that he had recorded electrical activity from the brains of rabbits and monkeys; his discovery was largely forgotten for half a century. Hans Berger recorded the first human EEG in 1924, at Jena, and kept the discovery secret for five years.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Povestea lui nu e simplă. Berger credea că undele cerebrale sunt un fel de „energie psihică”, iar înregistrările lui au fost la început privite cu neîncredere; abia în 1934, Edgar Adrian a confirmat undele într-o lucrare publicată în „Brain”, tratându-le cu scepticism. Același articol amintește legăturile lui Berger cu nazismul și moartea lui prin sinucidere, în 1941. Un instrument care ne-a deschis creierul a avut un început în mâini care ne cer prudență.",
				en: "His story is not a simple one. Berger believed brainwaves were a kind of “psychic energy”, and his recordings were at first met with distrust; only in 1934 did Edgar Adrian confirm the waves in a paper in “Brain”, treating them with scepticism. The same article recalls Berger’s ties to Nazism and his death by suicide in 1941. An instrument that opened the brain to us had a beginning in hands that call for caution.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pentru subiectul nostru, contează un singur lucru: pentru prima dată, starea unui om, veghe, relaxare, somn, putea fi legată de ceva măsurabil. Nu răspundea la întrebarea „ce se simte”. Dar spunea „ce face creierul”, în același timp cu ce spunea persoana.",
				en: "For our subject, one thing matters: for the first time, a person’s state, waking, relaxation, sleep, could be linked to something measurable. It did not answer the question “what is it like”. But it said “what the brain is doing”, at the same time as what the person said.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum s-a întors conștiința în laborator, în anii ’80–’90?",
				en: "How did consciousness return to the laboratory in the 1980s and 1990s?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Enciclopedia de la Stanford numește câțiva autori ai revenirii: Bernard Baars (1988), Daniel Dennett (1991), David Chalmers (1996). Între ei, în 1995, Chalmers a publicat în „Journal of Consciousness Studies” articolul „Facing Up to the Problem of Consciousness”, care a despărțit întrebările „ușoare” (ce funcții îndeplinește mintea) de cea „grea” (de ce funcțiile acelea sunt însoțite de experiență). Articolul a dat subiectului un nume pe care îl folosim și azi.",
				en: "The Stanford Encyclopedia names several authors of the return: Bernard Baars (1988), Daniel Dennett (1991), David Chalmers (1996). Among them, in 1995, Chalmers published in the “Journal of Consciousness Studies” the paper “Facing Up to the Problem of Consciousness”, which separated the “easy” questions (what functions the mind performs) from the “hard” one (why those functions are accompanied by experience). The paper gave the subject a name we still use.",
			},
		},
		{
			type: "quote",
			text: {
				ro: "Știința a învățat să măsoare tot mai mult din ce face mintea. Ce se simte rămâne întrebarea.",
				en: "Science has learned to measure more and more of what the mind does. What it feels like remains the question.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Studiile clinice au dat subiectului și un ancoraj practic. În 2006, într-un articol din „Science”, Adrian Owen și colegii lui au cerut unei paciente aflate în stare vegetativă să-și imagineze că joacă tenis sau că se plimbă prin casă; activarea cerebrală a fost, scriu ei, indistinctă de cea a voluntarilor sănătoși. În 2013, Adenauer Casali și colaboratorii au propus un indice al nivelului de conștiință, calculat din răspunsul creierului la o stimulare magnetică, și l-au testat la oameni treji, în vis, în somn profund și sub sedare cu midazolam, xenon sau propofol, precum și la pacienți.",
				en: "Clinical studies gave the subject a practical anchor as well. In 2006, in a paper in “Science”, Adrian Owen and colleagues asked a patient in a vegetative state to imagine playing tennis or walking around her home; the brain activation was, they write, indistinguishable from that of healthy volunteers. In 2013, Adenauer Casali and colleagues proposed an index of the level of consciousness, calculated from the brain’s response to magnetic stimulation, and tested it in people awake, dreaming, in non-REM sleep and under sedation with midazolam, xenon or propofol, as well as in patients.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Unde se așază parapsihologia în toată povestea asta?",
				en: "Where does parapsychology sit in all this?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pe un drum paralel, adesea la marginea științei. Enciclopedia Psi a Societății pentru Cercetări Psihice notează că societatea s-a înființat în 1882. În 1927–1930, J. B. Rhine s-a alăturat psihologului William McDougall la Duke și a ajuns să aibă un laborator propriu; în 1934 a publicat „Extra-Sensory Perception”, de unde provin termenii „percepție extrasenzorială” și „parapsihologie”. Cărțile de joc cu simboluri, numite azi cărți Zener, au fost proiectate cu ajutorul unui psiholog, Karl Zener.",
				en: "On a parallel road, often at the edge of science. The Psi Encyclopedia of the Society for Psychical Research notes that the society was founded in 1882. In 1927–1930, J. B. Rhine joined the psychologist William McDougall at Duke and came to have a laboratory of his own; in 1934 he published “Extra-Sensory Perception”, the source of the terms “extrasensory perception” and “parapsychology”. The symbol cards, known today as Zener cards, were designed with the help of a psychologist, Karl Zener.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Primirea a fost în mare parte ostilă; metodele lui Rhine au fost dezbătute la o reuniune a Asociației Americane de Psihologie, în 1938. Mai târziu, între mijlocul anilor ’70 și 1995, guvernul american a finanțat programul Star Gate de „remote viewing”, la SRI și apoi la SAIC. Aceeași sursă spune că întrebarea centrală, replicabilitatea, rămâne disputată: sceptici susțin că nu există experimente replicabile, iar parapsihologii înșiși recunosc, în bună parte, lipsa „replicabilității predictive”. Noi nu luăm partea nimănui; consemnăm că rezultatele au fost contestate.",
				en: "The reception was largely hostile; Rhine’s methods were debated at a meeting of the American Psychological Association in 1938. Later, between the mid-1970s and 1995, the US government funded the Star Gate programme of remote viewing, at SRI and then at SAIC. The same source says the central question, replicability, remains disputed: sceptics hold that there are no replicable experiments, and parapsychologists themselves largely concede the lack of “predictive replicability”. We take nobody’s side; we record that the results were contested.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce teorii se confruntă astăzi?",
				en: "Which theories compete today?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Nu există un singur „model standard”. Trei familii de teorii apar mereu în discuție, așa cum le prezintă Enciclopedia de la Stanford:",
				en: "There is no single “standard model”. Three families of theories keep appearing in the discussion, as the Stanford Encyclopedia presents them:",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "Teoriile spațiului de lucru global (Baars, 1988): conștient e ce devine disponibil pe scară largă, pentru multe subsisteme ale minții deodată.",
					en: "Global workspace theories (Baars, 1988): what is conscious is what becomes widely available, to many subsystems of the mind at once.",
				},
				{
					ro: "Teoria informației integrate, IIT (Giulio Tononi, susținută de Christof Koch): conștiința este informație integrată și există în grade, chiar și într-un sistem foarte simplu.",
					en: "Integrated information theory, IIT (Giulio Tononi, supported by Christof Koch): consciousness is integrated information and exists in degrees, even in a very simple system.",
				},
				{
					ro: "Teoriile de ordin superior (David Rosenthal, 1986 și 1993; David Armstrong, 1981): o stare mentală e conștientă când e însoțită de o altă stare care reprezintă faptul că ești în ea.",
					en: "Higher-order theories (David Rosenthal, 1986 and 1993; David Armstrong, 1981): a mental state is conscious when accompanied by another state representing that you are in it.",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "În iunie 2025, în „Nature”, consorțiul Cogitate a publicat un test „adversarial” al spațiului de lucru global și al IIT: designul și predicțiile au fost stabilite în prealabil de susținătorii ambelor teorii, împreună cu un grup neutru, iar 256 de voluntari au fost studiați cu fMRI, MEG și EEG intracranian. Concluzia autorilor: unele predicții au fost confirmate, dar ideile-cheie ale ambelor teorii au fost puse sub semnul întrebării. Niciuna nu a ieșit neatinsă, iar cercetătorii spun că sunt peste douăzeci de teorii, dintre care au testat două.",
				en: "In June 2025, in “Nature”, the Cogitate consortium published an “adversarial” test of the global workspace and of IIT: the design and predictions were set in advance by supporters of both theories together with a neutral group, and 256 volunteers were studied with fMRI, MEG and intracranial EEG. The authors’ conclusion: some predictions were supported, but key tenets of both theories were challenged. Neither came out unscathed, and the researchers say there are more than twenty theories, of which they tested two.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Unde își găsesc locul cei care explorează conștiința din interior?",
				en: "Where do those who explore consciousness from the inside find their place?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Povestea de mai sus are o ironie: introspecția, metoda pe care psihologia a pus-o deoparte acum o sută de ani, rămâne singura cale spre ce se simte. Enciclopedia de la Stanford notează că, pentru behavioriști, relatările introspective sunt date utile în experimente, chiar dacă nu dovedesc natura minții. Aceeași idee e valabilă azi: ce spune un om despre starea lui de conștiință e o dată. Nu e un verdict despre lume, dar nici un zgomot de eliminat.",
				en: "The story above holds an irony: introspection, the method psychology set aside a hundred years ago, remains the only road to what it feels like. The Stanford Encyclopedia notes that, for behaviourists, introspective reports are useful data in experiments, even if they do not show the nature of the mind. The same holds today: what a person says of their state of consciousness is a datum. It is not a verdict about the world, but neither is it noise to be removed.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Practicile contemplative și programele de explorare, între care cele ale Institutului Monroe, lucrează cu această materie primă: ce observi, ce simți, ce se schimbă când îți lași corpul să se odihnească și atenția să rămână trează. Ele nu rezolvă întrebarea grea și nu pretind asta. Ne arată doar câte feluri de experiență există de descris.",
				en: "Contemplative practices and exploration programmes, among them those of the Monroe Institute, work with this raw material: what you observe, what you feel, what changes when you let the body rest and the attention stay awake. They do not solve the hard question and do not claim to. They only show how many kinds of experience there are to describe.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Dacă vrei un singur pas mai departe, citește articolul despre problema grea a conștiinței, explicată fără jargon.",
				en: "If you want a single step further, read the article on the hard problem of consciousness, explained without jargon.",
			},
		},
	],
	sources: [
		{
			label: {
				ro: "Stanford Encyclopedia of Philosophy: Consciousness (istoric și teorii)",
				en: "Stanford Encyclopedia of Philosophy: Consciousness (history and theories)",
			},
			href: "https://plato.stanford.edu/entries/consciousness/",
		},
		{
			label: {
				ro: "Stanford Encyclopedia of Philosophy: Behaviorism",
				en: "Stanford Encyclopedia of Philosophy: Behaviorism",
			},
			href: "https://plato.stanford.edu/entries/behaviorism/",
		},
		{
			label: {
				ro: "Scientific American: istoria descoperirii undelor cerebrale (Caton, Berger)",
				en: "Scientific American: the history of the discovery of human brainwaves (Caton, Berger)",
			},
			href: "https://www.scientificamerican.com/article/the-human-brainwaves-centennial-exposes-a-darker-science-history/",
		},
		{
			label: {
				ro: "Chalmers (1995), Facing Up to the Problem of Consciousness",
				en: "Chalmers (1995), Facing Up to the Problem of Consciousness",
			},
			href: "https://consc.net/papers/facing.html",
		},
		{
			label: {
				ro: "Owen et al. (2006), Detecting awareness in the vegetative state. Science",
				en: "Owen et al. (2006), Detecting awareness in the vegetative state. Science",
			},
			href: "https://pubmed.ncbi.nlm.nih.gov/16959998/",
		},
		{
			label: {
				ro: "Casali et al. (2013), un indice al conștiinței independent de procesarea senzorială. Science Translational Medicine",
				en: "Casali et al. (2013), an index of consciousness independent of sensory processing. Science Translational Medicine",
			},
			href: "https://pubmed.ncbi.nlm.nih.gov/23946194/",
		},
		{
			label: {
				ro: "Cogitate Consortium (2025), testul adversarial GNWT și IIT. Nature",
				en: "Cogitate Consortium (2025), adversarial testing of GNWT and IIT. Nature",
			},
			href: "https://research.birmingham.ac.uk/en/publications/adversarial-testing-of-global-neuronal-workspace-and-integrated-i/",
		},
		{
			label: {
				ro: "Enciclopedia Psi (SPR): parapsihologia experimentală",
				en: "Psi Encyclopedia (SPR): experimental parapsychology",
			},
			href: "https://psi-encyclopedia.spr.ac.uk/articles/experimental-parapsychology",
		},
	],
	provenance: [
		"https://plato.stanford.edu/entries/consciousness/ (Descartes 1640, Locke 1688, Leibniz 1686 petites perceptions; Wundt, James 1890, Titchener introspection; Huxley 1866 'unaccountable'; behaviourism Watson 1924 and Skinner 1953; cognitive psychology 1960s; consciousness neglected until the 1980s-90s; Baars 1988, Dennett 1991, Chalmers 1996; global workspace, IIT with Tononi and Koch, higher-order theories Rosenthal 1986/1993 and Armstrong 1981). Only the first 100,000 of 160,291 characters were read",
		"https://plato.stanford.edu/entries/behaviorism/ (Watson 1913 'Psychology as a Behaviorist Views It', 'a purely objective experimental branch of natural science'; the paper does not address consciousness directly; introspective reports as data; Skinner 1953 on inner states; dominant roughly 1920s to mid-century; cognitive science matured roughly 1960-1985)",
		"https://www.scientificamerican.com/article/the-human-brainwaves-centennial-exposes-a-darker-science-history/ (Caton 1875 Edinburgh, rabbits and monkeys; Berger first human EEG 1924 at Jena, kept secret five years; Berger thought brainwaves a 'psychic energy'; Adrian 1934 in Brain; Berger's Nazi ties and death by suicide, 1941)",
		"https://consc.net/papers/facing.html (Chalmers, Journal of Consciousness Studies 2(3), 200-219, 1995; easy and hard problems)",
		"https://pubmed.ncbi.nlm.nih.gov/16959998/ (Owen et al., Science 2006: read through NCBI E-utilities; vegetative-state patient, tennis and home-navigation imagery, activation indistinguishable from healthy volunteers)",
		"https://pubmed.ncbi.nlm.nih.gov/23946194/ (Casali et al., Sci Transl Med 2013: read through NCBI E-utilities; perturbational complexity index tested in wakefulness, dreaming, NREM sleep, midazolam, xenon and propofol sedation, and patients)",
		"https://research.birmingham.ac.uk/en/publications/adversarial-testing-of-global-neuronal-workspace-and-integrated-i/ (Cogitate Consortium, Nature 2025: 256 participants, fMRI, MEG and iEEG, preregistered adversarial design; key tenets of both theories challenged). The 'more than twenty theories' remark comes from a search-result summary of press coverage of the paper (Lepauvre), not from the paper's full text, which was not opened",
		"https://psi-encyclopedia.spr.ac.uk/articles/experimental-parapsychology (SPR founded 1882; Rhine with McDougall 1927-1930; Zener cards early 1930s; 1934 Extra-Sensory Perception; 1938 APA debate; Star Gate mid-1970s to 1995 at SRI then SAIC; replicability remains disputed)",
		"packages/design/brand-books/3-hemi-sync.md and docs/brands/writing-voice.md: voice and claim rules",
		"Cover photo: 'Blue Ridge Parkway clouds VA1', Acroterion, CC BY-SA 4.0, Wikimedia Commons, https://commons.wikimedia.org/wiki/File:Blue_Ridge_Parkway_clouds_VA1.jpg",
	],
	seo: {
		title: {
			ro: "Istoria cercetării conștiinței: de la James la neuroștiințe",
			en: "History of consciousness research: from James to neuroscience",
		},
		description: {
			ro: "Cronologie a cercetării conștiinței: James și introspecția, behaviorismul, EEG-ul lui Berger, revenirea din anii ’90, parapsihologia și teoriile de azi.",
			en: "A timeline of consciousness research: James and introspection, behaviourism, Berger’s EEG, the 1990s return, parapsychology and today’s competing theories.",
		},
		keywords: {
			ro: [
				"istoria cercetării conștiinței",
				"William James introspecție",
				"cine a inventat EEG",
				"behaviorism și conștiință",
				"teorii ale conștiinței",
				"parapsihologie istorie",
			],
			en: [
				"history of consciousness research",
				"William James introspection",
				"who invented the EEG",
				"behaviourism and consciousness",
				"theories of consciousness",
				"history of parapsychology",
			],
		},
	},
	faq: [
		{
			q: {
				ro: "Când a început cercetarea științifică a conștiinței?",
				en: "When did the scientific study of consciousness begin?",
			},
			a: {
				ro: "Ca știință experimentală, la sfârșitul secolului al XIX-lea, cu introspecția lui Wundt, Titchener și William James (The Principles of Psychology, 1890). A fost apoi puternic redusă de behaviorism și a revenit în laborator în anii ’80–’90, cu autori ca Baars, Dennett și Chalmers.",
				en: "As an experimental science, in the late nineteenth century, with the introspection of Wundt, Titchener and William James (The Principles of Psychology, 1890). It was then sharply reduced by behaviourism and returned to the laboratory in the 1980s and 1990s, with authors such as Baars, Dennett and Chalmers.",
			},
		},
		{
			q: {
				ro: "De ce a ignorat behaviorismul conștiința?",
				en: "Why did behaviourism ignore consciousness?",
			},
			a: {
				ro: "Pentru că introspecția nu poate fi verificată din exterior. În 1913, Watson cerea o psihologie „pur obiectivă și experimentală”, iar Skinner (1953) spunea că stările interioare nu sunt relevante într-o analiză funcțională, nu că nu există. Rezultatul a fost că subiectul a ieșit, pentru decenii, din laborator.",
				en: "Because introspection cannot be checked from outside. In 1913 Watson asked for a “purely objective experimental” psychology, and Skinner (1953) said inner states are not relevant in a functional analysis, not that they do not exist. The result was that the subject left the laboratory for decades.",
			},
		},
		{
			q: {
				ro: "Cine a înregistrat primul EEG uman?",
				en: "Who recorded the first human EEG?",
			},
			a: {
				ro: "Hans Berger, în 1924, la Jena; a ținut descoperirea secretă cinci ani. Înaintea lui, Richard Caton înregistrase activitate electrică la animale, în 1875. Lucrările lui Berger au fost confirmate în 1934 de Edgar Adrian, care le-a privit cu scepticism.",
				en: "Hans Berger, in 1924, at Jena; he kept the discovery secret for five years. Before him, Richard Caton had recorded electrical activity in animals, in 1875. Berger’s work was confirmed in 1934 by Edgar Adrian, who regarded it with scepticism.",
			},
		},
		{
			q: {
				ro: "Care sunt principalele teorii ale conștiinței?",
				en: "What are the main theories of consciousness?",
			},
			a: {
				ro: "Trei familii apar des: spațiul de lucru global (Baars), teoria informației integrate (Tononi, Koch) și teoriile de ordin superior (Rosenthal, Armstrong). În 2025, un test adversarial publicat în Nature a pus față în față primele două și a arătat că ideile-cheie ale ambelor sunt puse sub semnul întrebării. Nicio teorie nu e acceptată de toți.",
				en: "Three families appear often: the global workspace (Baars), integrated information theory (Tononi, Koch) and higher-order theories (Rosenthal, Armstrong). In 2025 an adversarial test published in Nature pitted the first two against each other and showed that key tenets of both are called into question. No theory is accepted by everyone.",
			},
		},
		{
			q: {
				ro: "Este parapsihologia acceptată de știință?",
				en: "Is parapsychology accepted by science?",
			},
			a: {
				ro: "În general, nu. Primirea a fost ostilă încă de la cartea lui Rhine din 1934, iar replicabilitatea rămâne punctul central al disputei: sceptici spun că nu există experimente replicabile, iar parapsihologii înșiși recunosc lipsa replicabilității predictive. Rezultatele sunt contestate, de aceea le prezentăm ca atare.",
				en: "Generally, no. Reception was hostile from Rhine’s 1934 book onward, and replicability remains the central point of dispute: sceptics say there are no replicable experiments, and parapsychologists themselves concede the lack of predictive replicability. The results are contested, which is why we present them as such.",
			},
		},
	],
	related: [
		"problema-grea-a-constiintei",
		"explicatia-stiintei-pentru-experienta-extracorporala",
		"proiectul-stargate-istoria-pe-scurt",
		"ce-sunt-starile-de-constiinta",
	],
};
