import type { ArticleInput } from "../../../schema";

export const article: ArticleInput = {
	slug: "ce-sunt-starile-de-constiinta",
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
		ro: "Ce sunt stările de conștiință? Un ghid clar",
		en: "What are states of consciousness? A clear guide",
	},
	standfirst: {
		ro: "O stare de conștiință este felul în care îți este organizată experiența la un moment dat: cât de trează ești, cât de larg e câmpul atenției, cât de prezent îți ești ție și cât de vii sunt simțurile. Treci prin mai multe într-o zi. Granița dintre ele nu e trasă de natură, ci de convenție.",
		en: "A state of consciousness is the way your experience is organised at a given moment: how awake you are, how wide your attention is, how present you are to yourself and how vivid your senses feel. You pass through several in a day. The borders between them are drawn by convention, not by nature.",
	},
	cover: {
		src: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Romania_Piatra_Craiului_track_marcation.JPG/1280px-Romania_Piatra_Craiului_track_marcation.JPG",
		alt: {
			ro: "Indicator de traseu montan printre brazi, cu săgeți către Marele Grohotiș și Șaua Funduri.",
			en: "A mountain trail signpost among spruce trees, with arrows to Marele Grohotiș and Șaua Funduri.",
		},
		width: 1280,
		height: 960,
	},
	body: [
		{
			type: "p",
			text: {
				ro: "Pe scurt: o stare de conștiință este felul în care îți este organizată experiența într-un anumit moment. Nu e un loc în care ajungi, ci o configurație a ceea ce trăiești acum. Cercetătorii o descriu, de obicei, prin patru lucruri: cât de activat ești, cât de larg este câmpul atenției, cât de conștient ești de tine și cât de vii sunt senzațiile.",
				en: "In short: a state of consciousness is the way your experience is organised at a particular moment. It is not a place you arrive at but a configuration of what you are living right now. Researchers usually describe it through four things: how activated you are, how wide your field of attention is, how aware you are of yourself and how vivid your sensations are.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pagina aceasta pune pe o singură hartă starea de veghe, somnolența, somnul, visul, absorbirea într-o activitate și meditația. Pune și întrebarea cuminte pe care o evită multe pagini academice: cine hotărăște unde se termină una și începe alta? Răspunsul scurt: nimeni, în mod absolut. Răspunsul lung urmează.",
				en: "This page puts waking, drowsiness, sleep, dreaming, absorption in an activity and meditation on one map. It also asks the sensible question that many academic pages avoid: who decides where one ends and the next begins? The short answer: nobody, absolutely. The long answer follows.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce înseamnă „conștiință”, într-o definiție de lucru?",
				en: "What does “consciousness” mean, as a working definition?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Nici filozofii nu au o definiție unică. Enciclopedia de Filozofie a Universității Stanford numește „conștient” și „conștiință” termeni-umbrelă, care acoperă fenomene mentale foarte diferite și nu au un sens privilegiat. Distinge între conștiința unei ființe întregi, care poate fi trează și atentă la lumea ei, și conștiința unei stări anume: faptul că există „ceva ce se simte” a fi în ea. Formula vine de la filozoful Thomas Nagel, care a întrebat cum e să fii liliac.",
				en: "Not even philosophers have a single definition. The Stanford Encyclopedia of Philosophy calls “conscious” and “consciousness” umbrella terms that cover very different mental phenomena and have no privileged meaning. It distinguishes between the consciousness of a whole creature, which can be awake and alert to its world, and the consciousness of a particular state: that there is “something it is like” to be in it. The phrasing comes from the philosopher Thomas Nagel, who asked what it is like to be a bat.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pentru uzul nostru, e de ajuns o definiție de lucru: conștiința este faptul că ai o experiență, că lumea și tu însuți îți apari într-un fel anume. O stare de conștiință este modul în care se aranjează acea experiență. Când adormi, aranjamentul se schimbă. Când ești absorbit de un puzzle, se schimbă din nou.",
				en: "For our purposes a working definition is enough: consciousness is the fact that you have an experience, that the world and you yourself appear to you in a certain way. A state of consciousness is how that experience is arranged. When you fall asleep, the arrangement changes. When you are absorbed in a puzzle, it changes again.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce stări obișnuite parcurgi într-o singură zi?",
				en: "Which ordinary states do you pass through in a single day?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Mai multe decât crezi. Iată o zi obișnuită, la nivelul experienței:",
				en: "More than you think. Here is an ordinary day, at the level of experience:",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "Trezirea, cu câteva minute de zăpăceală, în care nu știi bine ora și nici dacă visul a fost vis.",
					en: "Waking up, with a few minutes of fog in which you do not quite know the time or whether the dream was a dream.",
				},
				{
					ro: "Veghea atentă, la volan sau la un document, cu câmpul atenției strâns pe o singură sarcină.",
					en: "Alert wakefulness, at the wheel or over a document, with the field of attention narrowed to one task.",
				},
				{
					ro: "Rătăcirea minții: stai în autobuz și realizezi că ai trecut două stații fără să-ți dai seama.",
					en: "Mind-wandering: you sit on the bus and realise you passed two stops without noticing.",
				},
				{
					ro: "Absorbirea într-o activitate, când timpul curge altfel: o conversație bună, un instrument, un sport.",
					en: "Absorption in an activity, when time flows differently: a good conversation, an instrument, a sport.",
				},
				{
					ro: "Somnolența de seară, cu gânduri care se destramă, imagini scurte și un corp tot mai greu.",
					en: "Evening drowsiness, with thoughts coming apart, brief images and an ever-heavier body.",
				},
				{
					ro: "Somnul, cu etapele lui, și visul.",
					en: "Sleep, with its stages, and dreaming.",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "Institutul Național de Tulburări Neurologice al SUA (NINDS) descrie somnul ca o succesiune de etape. Prima este un somn ușor, care durează de obicei câteva minute, cu respirația și mișcările ochilor încetinite. Urmează un somn ușor mai adânc, apoi un somn profund, în care e greu să fii trezit. Prima perioadă de somn cu vise intense, REM, apare cam la 90 de minute după adormire. În total, petreci aproximativ două ore pe noapte visând, deși îți amintești puține vise.",
				en: "The US National Institute of Neurological Disorders and Stroke (NINDS) describes sleep as a succession of stages. The first is light sleep, usually lasting several minutes, with breathing and eye movements slowing. Next comes deeper light sleep, then deep sleep, in which you may be hard to wake. The first period of vivid-dream REM sleep comes about 90 minutes after you fall asleep. In total you spend about two hours a night dreaming, though you remember few dreams.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Care e diferența dintre stările obișnuite și cele modificate?",
				en: "What is the difference between ordinary and altered states?",
			},
		},
		{
			type: "p",
			text: {
				ro: "O stare „modificată” este una care se abate de la starea ta obișnuită de veghe, într-un mod pe care îl observi. Atât. Cuvântul nu spune nimic despre pericol, mistic sau patologic. O trecere în revistă din Psychological Bulletin (Vaitl și colaboratorii, 2005) împarte stările modificate după felul în care apar: spontan, provocate de stimuli fizici sau fiziologici, induse psihologic sau cauzate de boli. Le caracterizează prin aceleași patru dimensiuni: activare, întinderea conștientizării, conștiința de sine și dinamica simțurilor.",
				en: "An “altered” state is one that departs from your usual waking state in a way you notice. That is all. The word says nothing about danger, mysticism or pathology. A review in Psychological Bulletin (Vaitl and colleagues, 2005) sorts altered states by how they arise: spontaneously, evoked by physical or physiological stimulation, induced by psychological means or caused by diseases. It characterises them by the same four dimensions: activation, awareness span, self-awareness and sensory dynamics.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Observă ce rezultă de aici. Dimensiunile sunt scări, nu întrerupătoare. Poți fi puțin mai absorbit sau foarte absorbit, puțin mai somnoros sau aproape adormit. De aceea întrebarea „cine hotărăște unde se termină una?” nu are un răspuns exact. Stările se topesc una în alta, iar etichetele sunt convenții, utile ca să ne înțelegem, dar nu linii în natură. Aceeași trecere în revistă notează că mediul, practicile mentale și tehnicile de autocontrol pot schimba temporar funcționarea creierului și experiența conștientă.",
				en: "Notice what follows from this. The dimensions are scales, not switches. You can be a little absorbed or very absorbed, a little drowsy or nearly asleep. That is why the question “who decides where one ends?” has no exact answer. States melt into one another, and the labels are conventions, useful for understanding each other but not lines in nature. The same review notes that environment, mental practices and techniques of self-control can temporarily change brain functioning and conscious experience.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Ia exemplul adormirii. NINDS pune prima etapă de somn drept tranziție dintre veghe și somn: respirația și mișcările ochilor încetinesc, mușchii se relaxează, undele cerebrale încetinesc. Dar când anume ai trecut dintr-o parte în alta? Putem trasa o linie pe un grafic EEG, și cercetătorii o trasează, însă experiența ta de dinăuntru nu are un clopoțel. Linia e utilă pentru măsurare. Nu este o graniță pe care să o simți.",
				en: "Take falling asleep. NINDS describes the first stage of sleep as the transition from wakefulness to sleep: breathing and eye movements slow, muscles relax, brain waves slow. But exactly when did you cross from one side to the other? We can draw a line on an EEG chart, and researchers do, yet your experience from the inside has no bell. The line is useful for measurement. It is not a border that you feel.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce sunt absorbirea, fluxul și meditația?",
				en: "What are absorption, flow and meditation?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Sunt stări în care atenția se așază. O trecere în revistă din Frontiers in Psychology (2022) descrie fluxul, „flow”, ca pe o stare gratifiantă de implicare profundă și absorbire. Apare când o provocare și abilitatea ta sunt în echilibru: un șah cu un adversar pe măsură, o melodie la limita mâinilor tale. Timpul pare să curgă altfel, iar grija de sine se retrage pe fundal.",
				en: "They are states in which attention settles. A review in Frontiers in Psychology (2022) describes flow as a gratifying state of deep involvement and absorption. It appears when a challenge and your skill are in balance: a game of chess against an equal opponent, a tune at the edge of what your hands can do. Time seems to flow differently, and self-consciousness retreats into the background.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Meditația merge pe un drum aproape invers. Nu cauți o provocare, ci te așezi și îți îndrepți atenția, de pildă spre respirație, și revii de fiecare dată când mintea pleacă. Că pleacă este normal. Ce se schimbă, pe un drum sau pe celălalt, este câmpul atenției și felul în care te raportezi la gânduri. Amândouă sunt stări obișnuite, la îndemâna oricui, dar nu sunt aceeași stare.",
				en: "Meditation takes an almost opposite road. You do not seek a challenge; you sit and direct your attention, for example to the breath, and return each time the mind leaves. That it leaves is normal. What changes, on either road, is the field of attention and the way you relate to thoughts. Both are ordinary states, within anyone’s reach, but they are not the same state.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum se măsoară stările de conștiință?",
				en: "How are states of consciousness measured?",
			},
		},
		{
			type: "p",
			text: {
				ro: "În două feluri, care se completează. Primul este din interior: relatarea persoanei despre ce trăiește, prin întrebări și chestionare. Al doilea este din exterior: electroencefalograma, EEG, care înregistrează activitatea electrică a creierului prin discuri mici lipite pe scalp. Serviciul de sănătate britanic NHS spune că testul se folosește în primul rând pentru epilepsie, dar și pentru unele tulburări de somn.",
				en: "In two ways, which complement each other. The first is from the inside: the person’s account of what they experience, through questions and questionnaires. The second is from the outside: the electroencephalogram, EEG, which records the brain’s electrical activity through small discs attached to the scalp. The UK’s NHS says the test is used mainly for epilepsy, but also for some sleep conditions.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pe EEG, activitatea se descrie în benzi de ritm, după câte unde apar pe secundă. Convenția obișnuită: delta, sub 4, e legată de somnul profund; theta, de la 4 la 7, de somnolență; alpha, de la 8 la 12, de veghea relaxată cu ochii închiși; beta, de la 13 la 30, de gândirea activă. Limitele nu sunt standardizate, iar sursele diferă ușor între ele. Ține minte, mai ales, că EEG arată un tipar al creierului, nu ce se simte să fii în el. De aceea relatarea persoanei rămâne importantă.",
				en: "On an EEG, activity is described in rhythm bands, by how many waves occur per second. The usual convention: delta, below 4, is linked with deep sleep; theta, from 4 to 7, with drowsiness; alpha, from 8 to 12, with relaxed wakefulness with eyes closed; beta, from 13 to 30, with active thinking. The limits are not standardised and sources differ slightly. Above all, remember that an EEG shows a pattern of the brain, not what it feels like to be in it. That is why the person’s own account stays important.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum văd alte culturi stările de conștiință?",
				en: "How do other cultures see states of consciousness?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Mult mai firesc decât ne-am aștepta. Într-un studiu clasic asupra a 488 de societăți, rezumat de Human Relations Area Files de la Yale, 90% aveau o formă de comportament sau credință legată de transă instituționalizată, iar credințele despre părăsirea corpului de către suflet apăreau în 95%. Transa e adesea legată de vindecători, de ritualuri, de vise folosite pentru îndrumare. Arhiva spune că în unele societăți stările modificate țin de însăși țesătura vieții sociale și religioase.",
				en: "Far more naturally than we might expect. In a classic study of 488 societies, summarised by the Human Relations Area Files at Yale, 90% had some form of institutionalised trance behaviour or belief, and beliefs about the soul leaving the body appeared in 95%. Trance is often tied to healers, rituals, and dreams used for guidance. The summary says that in some societies altered states belong to the very fabric of social and religious life.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Nu înseamnă că toate relatările sunt adevărate ca explicații. Înseamnă că a avea stări diferite de cea obișnuită este o experiență umană comună, pe care culturile au numit-o, au ritualizat-o și au interpretat-o în moduri foarte diferite. Experiența ar trebui descrisă cu respect, interpretarea cu prudență.",
				en: "This does not mean all the accounts are true as explanations. It means that having states different from the ordinary one is a common human experience, which cultures have named, ritualised and interpreted in very different ways. Experience deserves respectful description, interpretation deserves caution.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Unde se potrivesc nivelurile Focus, ca hartă?",
				en: "Where do the Focus levels fit, as a map?",
			},
		},
		{
			type: "p",
			text: {
				ro: "The Monroe Institute® a numit cu numere stări de conștiință pe care participanții le-au explorat, ca să poată vorbi despre ele fără doctrină. Focus 10 este descris ca „minte trează, corp adormit”: corpul relaxat profund, atenția rămâne trează. Focus 12 este descris ca o stare de conștientizare extinsă, în care atenția se lărgește. Programe mai avansate explorează niveluri mai înalte. Numerele sunt etichete, nu trepte: nu înseamnă „mai bun” sau „mai evoluat”.",
				en: "The Monroe Institute® named, with numbers, states of consciousness that participants explored, so that they could talk about them without doctrine. Focus 10 is described as “mind awake, body asleep”: the body deeply relaxed, attention staying awake. Focus 12 is described as a state of expanded awareness, in which attention widens. More advanced programmes explore higher levels. The numbers are labels, not rungs: they do not mean “better” or “more evolved”.",
			},
		},
		{
			type: "p",
			text: {
				ro: "O hartă este utilă, dar nu este teritoriul. Poți citi nivelurile ca pe un limbaj pentru dimensiunile de mai sus: Focus 10, de pildă, combină un corp foarte odihnit cu o atenție trează. Ascultătorii Hemi-Sync® descriu ce simt, iar ce spun este o relatare a experienței, nu o afirmație despre realitate. Nu este un tratament și nu înlocuiește sfatul unui medic sau al unui psiholog.",
				en: "A map is useful, but it is not the territory. You can read the levels as a language for the dimensions above: Focus 10, for example, combines a deeply rested body with an awake attention. Hemi-Sync® listeners describe what they feel, and what they say is an account of experience, not a claim about reality. It is not a treatment and does not replace the advice of a doctor or a psychologist.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce faci mai departe?",
				en: "What do you do next?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Dacă te-ai recunoscut în lista de mai sus, ai deja materialul de lucru. Dacă experiențe neobișnuite, de pildă senzații la adormire sau la trezire, te sperie, apar des sau îți strică somnul, vorbește cu medicul de familie. NHS spune despre paralizia în somn că e de obicei inofensivă, dar că merită o discuție dacă îți afectează somnul sau starea psihică.",
				en: "If you recognised yourself in the list above, you already have the working material. If unusual experiences, such as sensations when falling asleep or waking, frighten you, come often or spoil your sleep, talk to your family doctor. The NHS says of sleep paralysis that it is usually harmless but worth a conversation if it affects your sleep or your mental health.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Un singur pas următor: citește articolul nostru despre stările modificate de conștiință, cu exemple din viața de zi cu zi, de la visarea cu ochii deschiși până la alergat și muzică.",
				en: "One next step: read our article on altered states of consciousness, with everyday examples, from daydreaming to running and music.",
			},
		},
	],
	sources: [
		{
			label: {
				ro: "Stanford Encyclopedia of Philosophy: Consciousness",
				en: "Stanford Encyclopedia of Philosophy: Consciousness",
			},
			href: "https://plato.stanford.edu/entries/consciousness/",
		},
		{
			label: {
				ro: "Vaitl și colab. (2005), Psihobiologia stărilor modificate de conștiință, Psychological Bulletin (rezumat)",
				en: "Vaitl et al. (2005), Psychobiology of altered states of consciousness, Psychological Bulletin (abstract)",
			},
			href: "https://research.gold.ac.uk/id/eprint/430",
		},
		{
			label: {
				ro: "NINDS: Brain Basics, înțelegerea somnului",
				en: "NINDS: Brain Basics, Understanding Sleep",
			},
			href: "https://www.ninds.nih.gov/health-information/public-education/brain-basics/brain-basics-understanding-sleep",
		},
		{
			label: {
				ro: "NHS: electroencefalograma (EEG)",
				en: "NHS: electroencephalogram (EEG)",
			},
			href: "https://www.nhs.uk/conditions/electroencephalogram/",
		},
		{
			label: {
				ro: "Wikipedia: Electroencefalografia, benzile de frecvență",
				en: "Wikipedia: Electroencephalography, frequency bands",
			},
			href: "https://en.wikipedia.org/wiki/Electroencephalography",
		},
		{
			label: {
				ro: "Human Relations Area Files (Yale): stările modificate de conștiință, perspectivă interculturală",
				en: "Human Relations Area Files (Yale): altered states of consciousness, a cross-cultural view",
			},
			href: "https://hraf.yale.edu/ehc/summaries/altered-states-of-consciousness",
		},
		{
			label: {
				ro: "NHS: paralizia în somn",
				en: "NHS: sleep paralysis",
			},
			href: "https://www.nhs.uk/conditions/sleep-paralysis/",
		},
		{
			label: {
				ro: "Peifer și colab. (2022), cercetarea asupra fluxului, trecere în revistă, Frontiers in Psychology",
				en: "Peifer et al. (2022), flow research, scoping review, Frontiers in Psychology",
			},
			href: "https://www.frontiersin.org/articles/10.3389/fpsyg.2022.815665/full",
		},
	],
	provenance: [
		"https://plato.stanford.edu/entries/consciousness/ (umbrella terms, no privileged meaning; creature vs state consciousness; Nagel's 'something it is like'; first 100,000 characters read)",
		"https://research.gold.ac.uk/id/eprint/430 (abstract of Vaitl et al. 2005, Psychological Bulletin 131(1): four ways ASC arise; four dimensions; environmental stimuli, mental practices and self-control techniques can temporarily alter brain functioning and conscious experience). The PubMed record did not load for us, so only this abstract was read, not the full paper",
		"https://www.ninds.nih.gov/health-information/public-education/brain-basics/brain-basics-understanding-sleep (stage 1 lasts several minutes; deep sleep hard to wake; REM about 90 minutes after falling asleep; about two hours a night dreaming)",
		"https://www.nhs.uk/conditions/electroencephalogram/ (EEG records electrical activity through scalp electrodes; used mainly for epilepsy, also sleep conditions)",
		"https://en.wikipedia.org/wiki/Electroencephalography (band table: delta below 4 Hz, theta 4-7, alpha 8-12, beta 13-30; the article itself notes the boundaries are not standardised; first 100,000 characters read)",
		"https://hraf.yale.edu/ehc/summaries/altered-states-of-consciousness (survey of 488 societies, 90% with some cultural trance behaviour or belief; 95% with beliefs about out-of-body experience; trance tied to healers, ritual and dreams)",
		"https://www.frontiersin.org/articles/10.3389/fpsyg.2022.815665/full (flow as 'a gratifying state of deep involvement and absorption'; challenge-skill balance as a precondition; first 100,000 characters read)",
		"https://www.nhs.uk/conditions/sleep-paralysis/ (harmless but see a GP if it affects mental health or sleep)",
		"apps/hemisync-web/messages/content/ro.json: focus_s01, focus_s02, focus_s04 (levels as shared language, not a ladder; Focus 10 and 12 described; descriptions of experience, not claims about reality), hq_therapy_a (not a treatment)",
		"packages/design/brand-books/3-hemi-sync.md and docs/brands/writing-voice.md: voice and claim rules",
		"Cover photo: Romania Piatra Craiului track marcation, Wikimedia Commons, CC BY-SA 3.0, https://commons.wikimedia.org/wiki/File:Romania_Piatra_Craiului_track_marcation.JPG",
	],
	seo: {
		title: {
			ro: "Stări de conștiință: ce sunt, cum se măsoară, o hartă simplă",
			en: "States of consciousness: what they are and how they’re measured",
		},
		description: {
			ro: "Stări de conștiință pe înțelesul tuturor: veghe, somn, vis, absorbire, meditație, cum se măsoară și unde se așază nivelurile Focus ca hartă a experienței.",
			en: "States of consciousness in plain language: waking, sleep, dreaming, absorption and meditation, how they are measured and where the Focus levels fit as a map.",
		},
		keywords: {
			ro: [
				"stări de conștiință",
				"ce sunt stările de conștiință",
				"stări modificate de conștiință",
				"cum se măsoară conștiința",
				"nivelurile Focus Monroe",
				"undele cerebrale și stările de conștiință",
			],
			en: [
				"states of consciousness",
				"what are states of consciousness",
				"altered states of consciousness",
				"how consciousness is measured",
				"Monroe Focus levels",
				"brain waves and states of consciousness",
			],
		},
	},
	faq: [
		{
			q: {
				ro: "Ce sunt stările de conștiință?",
				en: "What are states of consciousness?",
			},
			a: {
				ro: "Sunt modurile în care este organizată experiența ta la un moment dat: trează sau somnoroasă, atentă pe un punct sau rătăcită, absorbită sau distrasă. Cercetătorii le descriu prin patru dimensiuni: activare, întinderea conștientizării, conștiința de sine și dinamica simțurilor. Treci prin mai multe într-o singură zi, de la trezire la somn.",
				en: "They are the ways your experience is organised at a given moment: awake or drowsy, attentive on one point or wandering, absorbed or distracted. Researchers describe them through four dimensions: activation, awareness span, self-awareness and sensory dynamics. You pass through several in a single day, from waking to sleep.",
			},
		},
		{
			q: {
				ro: "Câte stări de conștiință există?",
				en: "How many states of consciousness are there?",
			},
			a: {
				ro: "Nu există un număr fix, pentru că stările se topesc una în alta și etichetele sunt convenții. Se vorbește de obicei despre veghe, somn ușor, somn profund, somn cu vise (REM), plus stări precum absorbirea sau meditația. The Monroe Institute® folosește numere, Focus 10, 12 și altele, ca limbaj comun pentru experiențe, nu ca trepte.",
				en: "There is no fixed number, because states melt into one another and the labels are conventions. People usually speak of waking, light sleep, deep sleep, dreaming sleep (REM), plus states such as absorption or meditation. The Monroe Institute® uses numbers, Focus 10, 12 and others, as a shared language for experiences, not as rungs.",
			},
		},
		{
			q: {
				ro: "Cum se măsoară conștiința?",
				en: "How is consciousness measured?",
			},
			a: {
				ro: "Din interior, prin relatarea persoanei, și din exterior, de pildă prin EEG, care înregistrează activitatea electrică a creierului cu discuri lipite pe scalp. NHS spune că EEG se folosește mai ales pentru epilepsie și unele tulburări de somn. EEG arată un tipar al creierului, nu ce se simte, deci cele două feluri se completează.",
				en: "From the inside, through the person’s account, and from the outside, for example through EEG, which records the brain’s electrical activity with discs attached to the scalp. The NHS says EEG is used mainly for epilepsy and some sleep conditions. EEG shows a pattern of the brain, not what it feels like, so the two ways complement each other.",
			},
		},
		{
			q: {
				ro: "Care e diferența dintre o stare obișnuită și una modificată?",
				en: "What is the difference between an ordinary and an altered state?",
			},
			a: {
				ro: "Una modificată se abate de la starea ta obișnuită de veghe, într-un mod pe care îl observi, pe una sau mai multe dintre cele patru dimensiuni. Nu e un termen despre pericol sau mistică. Somnolența, visarea cu ochii deschiși și absorbirea sunt toate, în acest sens, ușor modificate. Granița e o convenție, nu o linie din natură.",
				en: "An altered one departs from your usual waking state in a way you notice, on one or more of the four dimensions. It is not a term about danger or mysticism. Drowsiness, daydreaming and absorption are all, in this sense, mildly altered. The border is a convention, not a line in nature.",
			},
		},
		{
			q: {
				ro: "Când merită să vorbesc cu un medic?",
				en: "When is it worth talking to a doctor?",
			},
			a: {
				ro: "Dacă experiențe neobișnuite la adormire sau trezire te sperie, apar des sau îți afectează somnul ori starea psihică. NHS spune despre paralizia în somn că e de obicei inofensivă, dar recomandă o discuție cu medicul dacă te face să-ți fie frică să adormi sau dacă ești obosit tot timpul. Dacă tu sau cineva apropiat sunteți în pericol imediat, sunați la 112.",
				en: "If unusual experiences when falling asleep or waking frighten you, come often or affect your sleep or mental health. The NHS says sleep paralysis is usually harmless but recommends seeing a GP if you become afraid to go to sleep or are tired all the time. If you or someone close to you is in immediate danger, call 112.",
			},
		},
	],
	related: [
		"starile-modificate-de-constiinta-exemple",
		"ce-sunt-undele-cerebrale",
		"fazele-somnului-explicate-simplu",
		"explorarea-constiintei-pentru-incepatori",
	],
};
