import type { ArticleInput } from "../../../schema";

export const article: ArticleInput = {
	slug: "ce-sunt-undele-cerebrale",
	brand: "hemisync",
	topic: "creier-si-minte",
	backlogNo: null,
	status: "draft",
	kind: "editorial",
	aiDrafted: true,
	draftedAt: "2026-11-12",
	author: null,
	reviewer: null,
	title: {
		ro: "Ce sunt undele cerebrale și cum se măsoară",
		en: "What are brainwaves and how are they measured",
	},
	standfirst: {
		ro: "Undele cerebrale sunt ritmurile pe care le fac, împreună, mulți neuroni, înregistrate cu un EEG prin electrozi lipiți pe scalp. Se grupează în benzi cu nume (delta, theta, alfa, beta), dar acele benzi sunt convenții, nu cutii. Ele arată cum funcționează creierul, nu ce gândești.",
		en: "Brainwaves are the rhythms that many neurons make together, recorded with an EEG through electrodes on the scalp. They are grouped into named bands (delta, theta, alpha, beta), but those bands are conventions, not boxes. They show how the brain is working, not what you are thinking.",
	},
	cover: {
		src: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/DFC_0003_Golden_sun_slipping_behind_a_peaceful_island_casting_a_shimmering_path_across_calm_evening_waters.jpg/1280px-DFC_0003_Golden_sun_slipping_behind_a_peaceful_island_casting_a_shimmering_path_across_calm_evening_waters.jpg",
		alt: {
			ro: "Soarele coboară în spatele unui deal, pe o mare liniștită, cu o potecă de lumină aurie pe valuri mici și câteva bărci departe.",
			en: "The sun sets behind a hill over a calm sea, a path of golden light on small ripples and a few distant boats.",
		},
		width: 1280,
		height: 853,
	},
	body: [
		{
			type: "p",
			text: {
				ro: "Pe scurt: undele cerebrale sunt ritmuri electrice slabe, produse de grupuri mari de neuroni care își schimbă activitatea împreună, într-un du-te-vino regulat. Un EEG, electroencefalograma, le înregistrează prin electrozi pe scalp. Le numim „unde” pentru că, desenate, arată ca niște unde, iar le grupăm după viteză, în numărul de cicluri pe secundă, în benzi precum alfa sau theta.",
				en: "In short: brainwaves are faint electrical rhythms produced by large groups of neurons that change their activity together, in a regular back-and-forth. An EEG, the electroencephalogram, records them through electrodes on the scalp. We call them “waves” because, drawn on paper, they look like waves, and we group them by speed, in cycles per second, into bands such as alpha or theta.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Subiectul apare des în jurul sunetelor binaurale și al meditației, așa că merită înțeles bine, fără mistică. Mai jos: ce sunt, cum se măsoară, cât de moi sunt granițele dintre benzi și ce nu ne spun. Spunem pe față și ce nu se știe.",
				en: "The subject comes up often around binaural sounds and meditation, so it is worth understanding well, without mysticism. Below: what they are, how they are measured, how soft the borders between bands are and what they do not tell us. We say plainly what is not known, too.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce sunt undele cerebrale, pe înțeles?",
				en: "What are brainwaves, in plain words?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Un neuron comunică prin impulsuri și prin curenți minusculi. Unul singur e prea slab ca să se vadă de la suprafața capului. Dar când mulți neuroni își ridică și își coboară activitatea aproape în același timp, curenții lor se adună într-un semnal pe care un electrod îl poate prinde. Potrivit unei sinteze din Nature Reviews Neuroscience, cel mai mare contribuabil la acest semnal extern este curentul sinaptic, cel care trece prin membranele neuronilor când primesc semnale.",
				en: "A neuron communicates through impulses and tiny currents. A single one is far too faint to be seen from the surface of the head. But when many neurons raise and lower their activity almost together, their currents add up into a signal that an electrode can catch. According to a review in Nature Reviews Neuroscience, the largest contributor to this outside signal is the synaptic current, the one passing through neurons’ membranes as they receive signals.",
			},
		},
		{
			type: "p",
			text: {
				ro: "O imagine care ajută: un stadion văzut din afară. Nu auzi vorbele niciunui om, auzi doar un zumzet. Când mulți bat din palme în același ritm, zumzetul devine un tact și se aude de departe. Unda cerebrală este tactul, nu cuvintele: arată cât de mulți neuroni lucrează la unison și cât de repede, nu ce spun.",
				en: "An image that helps: a stadium seen from outside. You hear no one’s words, only a hum. When many clap in the same rhythm, the hum becomes a beat and carries a long way. The brainwave is the beat, not the words: it shows how many neurons are working in unison and how fast, not what they say.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum se măsoară: ce se întâmplă, de fapt, la un EEG?",
				en: "How are they measured: what actually happens at an EEG?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Serviciul de sănătate britanic (NHS) descrie un EEG fără dramatism: ești așezat sau întins, un specialist măsoară capul și marchează unde vor sta electrozii, apoi niște discuri mici de argint sunt lipite pe scalp cu o pastă. Firele duc la un aparat care înregistrează activitatea electrică. Ți se poate cere să deschizi și să închizi ochii sau să respiri adânc. Testul nu doare și durează de obicei cam o oră.",
				en: "The UK’s National Health Service (NHS) describes an EEG without drama: you sit or lie down, a specialist measures your head and marks where the electrodes will go, then small silver discs are stuck to the scalp with a paste. Wires lead to a machine that records the electrical activity. You may be asked to open and close your eyes or breathe deeply. The test does not hurt and usually takes about an hour.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pe ecran, rezultatul e o linie care se agită, câte una pentru fiecare electrod. Dacă stai relaxat, cu ochii închiși, într-o înregistrare apare adesea un ritm regulat, în jur de zece cicluri pe secundă: ritmul alfa. Prima dată a fost văzut la om de Hans Berger: în 1924 a observat un curent slab pe scalp, iar în 1929, după cinci ani de perfecționare, și-a publicat primul raport. El a descris și că ritmul alfa se stinge când deschizi ochii.",
				en: "On the screen, the result is a restless line, one for each electrode. If you sit relaxed, eyes closed, a recording often shows a regular rhythm of around ten cycles per second: the alpha rhythm. It was first seen in humans by Hans Berger: in 1924 he observed a faint current on the scalp, and in 1929, after five years of refining his method, he published his first report. He also described how alpha fades when you open your eyes.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pe un EEG se vede nu numai ce faci, ci și în ce stare te afli. Potrivit NINDS, în primul stadiu de somn, tranziția de la veghe la somn, undele cerebrale încep să încetinească față de cele din timpul zilei, iar în somnul profund devin și mai lente. Așa se leagă viteza ritmului de o stare, și de aici vine ideea că ritmurile spun ceva despre „unde ești”.",
				en: "An EEG shows not only what you do but also what state you are in. According to NINDS, in the first stage of sleep, the changeover from waking to sleep, brain waves begin to slow from their daytime patterns, and in deep sleep they become slower still. That is how the speed of the rhythm is tied to a state, and why the idea took hold that rhythms say something about “where you are”.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum arată o înregistrare EEG pe hârtie?",
				en: "What does an EEG recording look like on paper?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Închipuie-ți o bandă lungă de hârtie, pe care mai multe linii merg una sub alta, de la stânga la dreapta. Fiecare linie vine de la un electrod; spre dreapta, timpul trece. Înălțimea unei unde arată cât de puternic e semnalul, iar distanța dintre două vârfuri arată cât de lent e ritmul: vârfuri rare, unde lungi, înseamnă ritm lent; vârfuri dese, unde scurte, înseamnă ritm rapid. Dacă numeri vârfurile dintr-o secundă, ai frecvența, în hertzi.",
				en: "Imagine a long strip of paper on which several lines run one beneath the other, from left to right. Each line comes from one electrode; towards the right, time passes. The height of a wave shows how strong the signal is, and the distance between two peaks shows how slow the rhythm is: sparse peaks, long waves, mean a slow rhythm; dense peaks, short waves, mean a fast one. If you count the peaks in one second, you have the frequency, in hertz.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Cu ochii închiși și în relaxare, multe linii se așază într-o undulație regulată, cam de zece ori pe secundă. Deschide ochii și undulația se estompează, lăsând loc unei activități mai mărunte și mai neregulate: exact ce a descris Berger. Nu e un truc de laborator; e ceva ce poți înțelege din ce știi deja despre tine, că atunci când te uiți la ceva, mintea nu mai e „în repaus”.",
				en: "With eyes closed and at rest, many lines settle into a regular undulation, about ten times a second. Open the eyes and the undulation fades, making room for smaller, more irregular activity: just what Berger described. It is not a laboratory trick; it is something you can grasp from what you already know about yourself, that when you look at something, the mind is no longer “at rest”.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Care sunt benzile și ce intervale au?",
				en: "What are the bands and what ranges do they cover?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Benzile au nume grecești, iar intervalele de mai jos sunt cele folosite cel mai des în literatura de cercetare, potrivit unei analize a 184 de studii din 2019. Un hertz (Hz) înseamnă un ciclu pe secundă.",
				en: "The bands have Greek names, and the ranges below are the ones most often used in the research literature, according to a 2019 analysis of 184 studies. One hertz (Hz) means one cycle per second.",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "Delta, cam 1,3–3,5 Hz: cel mai lent ritm, dominant în somnul profund.",
					en: "Delta, roughly 1.3–3.5 Hz: the slowest rhythm, dominant in deep sleep.",
				},
				{
					ro: "Theta, cam 4–7,5 Hz: ritm lent, frecvent la marginea somnului și în relaxarea profundă.",
					en: "Theta, roughly 4–7.5 Hz: a slow rhythm, common at the edge of sleep and in deep relaxation.",
				},
				{
					ro: "Alfa, cam 8–13 Hz: ritmul liniștii treze, mai ales cu ochii închiși.",
					en: "Alpha, roughly 8–13 Hz: the rhythm of quiet wakefulness, especially with the eyes closed.",
				},
				{
					ro: "Beta, cam 12,5–30 Hz: ritmul minții active, când rezolvi, vorbești, ești atent.",
					en: "Beta, roughly 12.5–30 Hz: the rhythm of the busy mind, when you solve, talk, attend.",
				},
				{
					ro: "Gamma, cam 30–40 Hz: folosită mai rar în aceleași studii.",
					en: "Gamma, roughly 30–40 Hz: used less often in the same studies.",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "Pe o pagină separată, articolul nostru despre diferențele dintre alfa, beta, theta și delta intră în amănunt. Aici reține doar ordinea: de la lent la rapid, de la somnul adânc la atenția încordată, și faptul că un creier treaz nu stă într-o singură bandă, ci le amestecă pe toate.",
				en: "On a separate page, our article on the differences between alpha, beta, theta and delta goes into detail. Here keep only the order: from slow to fast, from deep sleep to tense attention, and the fact that a waking brain does not sit in a single band but mixes them all.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "De ce sunt benzile etichete, nu cutii?",
				en: "Why are bands labels and not boxes?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pentru că limitele sunt o convenție. Aceeași analiză din 2019 a găsit că, în studiile ei, delta putea începe oriunde între 0 și 2 Hz, iar beta putea începe între 12 și 15 Hz și se putea termina oriunde între 20 și 50 Hz. Autorii notează că ceea ce înseamnă „delta” sau „beta” într-un articol nu e neapărat ce înseamnă în altul, iar alfa și beta se suprapun chiar în intervalele tipice. Unele diferențe vin din filtrele aparatelor.",
				en: "Because the limits are a convention. The same 2019 analysis found that, in its studies, delta could begin anywhere between 0 and 2 Hz, while beta could begin between 12 and 15 Hz and end anywhere between 20 and 50 Hz. The authors note that what “delta” or “beta” means in one paper is not necessarily what it means in another, and alpha and beta overlap even in the typical ranges. Some differences come from the filters of the machines.",
			},
		},
		{
			type: "quote",
			text: {
				ro: "Benzile sunt nume pe o scară, nu pereți între camere.",
				en: "Bands are names on a scale, not walls between rooms.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Un exemplu cotidian: „tânăr” și „bătrân” sunt etichete utile, dar nu există o zi în care devii bătrân. La fel e cu benzile: ne ajută să vorbim, nu desenează granițe în creier. Când citești că „theta începe la 4 Hz”, citește „în multe studii, cam de acolo”.",
				en: "An everyday example: “young” and “old” are useful labels, but there is no day on which you become old. It is the same with the bands: they help us talk, they do not draw borders in the brain. When you read that “theta starts at 4 Hz”, read “in many studies, about there”.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce nu ne spun undele cerebrale?",
				en: "What do brainwaves not tell us?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Multe lucruri, și merită să le spunem pe rând. Nu ne spun ce gândești, ce simți sau cine ești; ele arată ritmul, nu conținutul. Nu ne spun de unde vine exact semnalul: într-un articol din Trends in Neurosciences, un cercetător susține că știm „șocant de puțin” despre de unde vine EEG-ul și ce înseamnă. Iar, într-o analiză a 184 de studii, modelele de schimbare a puterii pe benzi nu sunt unice pentru o boală, ci se suprapun mult între afecțiuni și variază chiar în interiorul uneia.",
				en: "Many things, and they are worth saying one by one. They do not tell us what you are thinking, feeling or who you are; they show rhythm, not content. They do not tell us exactly where the signal comes from: in a Trends in Neurosciences article, a researcher argues that we know “shockingly little” about where EEG comes from and what it means. And in an analysis of 184 studies, patterns of change in band power are not unique to any one disorder but overlap a great deal between conditions and vary even within one.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Mai e un lucru de reținut: electrozii stau pe scalp, deci semnalul trece prin craniu și piele înainte să fie înregistrat. Analiza din 2019 arată că puterea absolută a semnalului depinde și de grosimea craniului și de forma capului, care diferă mult de la om la om. Un EEG este o imagine aproximativă a unui zumzet, nu o fotografie a unei conversații între neuroni.",
				en: "One more thing to keep in mind: the electrodes sit on the scalp, so the signal passes through skull and skin before it is recorded. The 2019 analysis notes that the absolute power of the signal also depends on skull thickness and head shape, which differ greatly from person to person. An EEG is an approximate picture of a hum, not a photograph of a conversation between neurons.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pe scurt, un EEG nu e un detector de gânduri și nici un test pe care să-l faci acasă ca să afli ce ai. NHS spune că este folosit mai ales pentru a diagnostica sau a urmări epilepsia, dar și în probleme de somn și în encefalită, și că rezultatul îl analizează un specialist. Dacă ești îngrijorat de ceva ce ține de creier sau de somn, locul tău este la medic, nu într-un grafic.",
				en: "In short, an EEG is not a thought detector and not a test to run at home to find out what you have. The NHS says it is mainly used to diagnose or monitor epilepsy, and also in sleep conditions and encephalitis, and that a specialist analyses the result. If you are worried about something to do with the brain or sleep, your place is with a doctor, not in a graph.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum se leagă undele de stările de conștiință?",
				en: "How do brainwaves relate to states of consciousness?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Cinstit: se leagă, dar nu cum ar vrea titlurile. Somnul, veghea și relaxarea au semnături diferite în EEG, iar acestea sunt printre cele mai solide aplicații. Într-un studiu din 2022, 30 de adulți fără experiență au practicat yoga nidra, iar la 26 dintre ei înregistrările cu EEG au fost marcate drept veghe pe toată durata, cu semne locale de unde lente. „Treaz” și „adormit” nu sunt două cutii, tot așa cum nici benzile nu sunt.",
				en: "Honestly: they do relate, but not the way headlines would like. Sleep, waking and relaxation have different EEG signatures, and these are among the most solid applications. In a 2022 study, 30 novice adults practised yoga nidra, and for 26 of them the EEG recordings were scored as awake throughout, with local signs of slow waves. “Awake” and “asleep” are not two boxes, just as the bands are not.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Aici intră și sunetele binaurale. Ele pot fi percepute în jur de 1–30 Hz, un interval care coincide cu principalele benzi EEG, iar Institutul Monroe dă un exemplu cu un ton de 5 Hz legat de theta și de o stare meditativă. Ipoteza că sunetul „antrenează” ritmul creierului are însă sprijin împărțit: într-o sinteză din 2023, din 14 studii, cinci au fost în sensul ipotezei, opt contrare și unul mixt. Spunem asta fără să tragem concluzii despre ce simți tu.",
				en: "Binaural sounds come in here. They can be perceived at around 1–30 Hz, a range that coincides with the main EEG bands, and the Monroe Institute gives an example with a 5 Hz tone linked to theta and a meditative state. The hypothesis that sound “entrains” the brain’s rhythm has divided support, though: in a 2023 synthesis, of 14 studies, five were in line with the hypothesis, eight contradicted it and one was mixed. We say this without drawing conclusions about what you will feel.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Hemi-Sync® nu este tratament și nu este dispozitiv medical. Institutul Monroe recomandă ca persoanele cu istoric de crize epileptice, tulburări de auz sau afecțiuni de sănătate mintală care se pot agrava să discute cu medicul înainte să asculte. Un singur pas, dacă ești curios: citește despre diferențele dintre alfa, beta, theta și delta și apoi încearcă un exercițiu gratuit de pe hemi-sync.ro, cu căști, notând doar ce observi.",
				en: "Hemi-Sync® is not a treatment and not a medical device. The Monroe Institute advises people with a history of seizures, auditory disorders or adverse mental health conditions to speak to a physician before listening. One step, if you are curious: read about the differences between alpha, beta, theta and delta and then try a free exercise on hemi-sync.ro, with headphones, noting only what you observe.",
			},
		},
	],
	sources: [
		{
			label: {
				ro: "NHS: electroencefalograma (EEG)",
				en: "NHS: electroencephalogram (EEG)",
			},
			href: "https://www.nhs.uk/conditions/electroencephalogram/",
		},
		{
			label: {
				ro: "Newson și Thiagarajan, 2019: benzile de frecvență EEG în tulburări psihice (Frontiers in Human Neuroscience)",
				en: "Newson and Thiagarajan, 2019: EEG frequency bands in psychiatric disorders (Frontiers in Human Neuroscience)",
			},
			href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6333694/",
		},
		{
			label: {
				ro: "Buzsáki, Anastassiou și Koch, 2012: originea câmpurilor extracelulare, EEG, ECoG, LFP (Nature Reviews Neuroscience)",
				en: "Buzsáki, Anastassiou and Koch, 2012: the origin of extracellular fields and currents, EEG, ECoG, LFP (Nature Reviews Neuroscience)",
			},
			href: "https://pubmed.ncbi.nlm.nih.gov/22595786/",
		},
		{
			label: {
				ro: "Cohen, 2017: de unde vine EEG-ul și ce înseamnă (Trends in Neurosciences)",
				en: "Cohen, 2017: where does EEG come from and what does it mean (Trends in Neurosciences)",
			},
			href: "https://pubmed.ncbi.nlm.nih.gov/28314445/",
		},
		{
			label: {
				ro: "Hans Berger la 150 de ani: EEG-ul uman (Arquivos de Neuro-Psiquiatria, 2023)",
				en: "An appraisal of Hans Berger at his 150th birthday: the human EEG (Arquivos de Neuro-Psiquiatria, 2023)",
			},
			href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10756801/",
		},
		{
			label: {
				ro: "NINDS: noțiuni de bază despre creier, înțelegerea somnului",
				en: "NINDS: Brain basics, understanding sleep",
			},
			href: "https://www.ninds.nih.gov/health-information/public-education/brain-basics/brain-basics-understanding-sleep",
		},
		{
			label: {
				ro: "Ingendoh și colab., 2023: bătăi binaurale și oscilațiile cerebrale, trecere în revistă sistematică",
				en: "Ingendoh et al., 2023: binaural beats and brain oscillations, a systematic review",
			},
			href: "https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0286023",
		},
		{
			label: {
				ro: "Datta și colab., 2022: dovezi electrofiziologice de somn local în yoga nidra (Frontiers in Neurology)",
				en: "Datta et al., 2022: electrophysiological evidence of local sleep during yoga nidra (Frontiers in Neurology)",
			},
			href: "https://pubmed.ncbi.nlm.nih.gov/35903117/",
		},
	],
	provenance: [
		"https://www.nhs.uk/conditions/electroencephalogram/ (EEG: small silver discs on the scalp with sticky paste, wires to a recorder; may be asked to open and close eyes or breathe deeply; painless, usually about an hour; mainly used to diagnose or monitor epilepsy, also sleep conditions and encephalitis; a specialist analyses the results)",
		"https://pmc.ncbi.nlm.nih.gov/articles/PMC6333694/ (Newson and Thiagarajan, Front Hum Neurosci 2019, 184 resting-state EEG studies: typical band ranges delta 1.3-3.5, theta 4-7.5, alpha 8-13, beta 12.5-30, gamma 30-40 Hz; delta start values 0 to ~2 Hz, beta start 12-15 and end 20-50 Hz in different papers; definitions vary and overlap; band-power patterns not unique to any one disorder; full text read through Europe PMC)",
		"https://pubmed.ncbi.nlm.nih.gov/22595786/ (Buzsaki, Anastassiou, Koch, Nat Rev Neurosci 2012, abstract: the major contributor to the extracellular signal is the synaptic transmembrane current; abstract read only)",
		"https://pubmed.ncbi.nlm.nih.gov/28314445/ (Cohen, Trends Neurosci 2017, abstract: 'we know shockingly little' about where EEG signals come from and what they mean; abstract read only)",
		"https://pmc.ncbi.nlm.nih.gov/articles/PMC10756801/ (appraisal of Hans Berger, Arq Neuropsiquiatr 2023: first current observed on the human scalp on 6 July 1924, first report published in 1929 after five years of perfecting the method; alpha blocking by eye opening; full text read through Europe PMC)",
		"https://www.ninds.nih.gov/health-information/public-education/brain-basics/brain-basics-understanding-sleep (stage 1 is the changeover from wakefulness to sleep; brain waves begin to slow from daytime patterns; stage 3 waves slower still)",
		"https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0286023 (Ingendoh et al., PLOS ONE 2023: binaural beats perceived at about 1-30 Hz, coinciding with the main EEG bands; 14 studies, 5 consistent with entrainment, 8 contradictory, 1 mixed)",
		"https://pubmed.ncbi.nlm.nih.gov/35903117/ (Datta et al., Frontiers in Neurology 2022, abstract: 30 novices, yoga nidra, awake scored throughout in 26 after two weeks, local slow waves; abstract read only; not a study of Hemi-Sync)",
		"https://www.monroeinstitute.org/pages/the-history-of-sound-at-the-monroe-institute (5 Hz binaural example linked to theta and a meditative state)",
		"Cover photo: DFC 0003 Golden sun slipping behind a peaceful island (PattayaPatrol), Wikimedia Commons, CC BY-SA 4.0, https://commons.wikimedia.org/wiki/File:DFC_0003_Golden_sun_slipping_behind_a_peaceful_island_casting_a_shimmering_path_across_calm_evening_waters.jpg",
		"packages/design/brand-books/3-hemi-sync.md and docs/brands/writing-voice.md: voice and claim rules; band ranges kept consistent with packages/content/src/articles/library/hemisync/unde-alfa-beta-theta-delta-diferente.ts",
	],
	seo: {
		title: {
			ro: "Unde cerebrale: ce sunt, cum se măsoară, câte benzi există",
			en: "Brainwaves explained: what they are and how they’re measured",
		},
		description: {
			ro: "Ce sunt undele cerebrale, cum le măsoară un EEG, ce intervale au benzile delta, theta, alfa și beta, de ce sunt convenții și ce nu ne spun despre gânduri.",
			en: "What brainwaves are, how an EEG measures them, what ranges delta, theta, alpha and beta cover, why they are conventions and what they do not tell about thoughts.",
		},
		keywords: {
			ro: [
				"unde cerebrale",
				"ce sunt undele cerebrale",
				"cum se măsoară undele cerebrale",
				"EEG electroencefalogramă",
				"benzi de frecvență delta theta alfa beta",
				"unde cerebrale și stări de conștiință",
			],
			en: [
				"brainwaves explained",
				"what are brainwaves",
				"how brainwaves are measured",
				"EEG electroencephalogram",
				"delta theta alpha beta bands",
				"brainwaves and states of consciousness",
			],
		},
	},
	faq: [
		{
			q: {
				ro: "Ce sunt undele cerebrale?",
				en: "What are brainwaves?",
			},
			a: {
				ro: "Sunt ritmuri electrice slabe, produse de grupuri mari de neuroni care își schimbă activitatea aproape împreună. Un EEG le înregistrează prin electrozi pe scalp. Le grupăm după viteză în benzi (delta, theta, alfa, beta, gamma). Ele arată cum lucrează creierul, nu ce gândești.",
				en: "They are faint electrical rhythms produced by large groups of neurons that change activity almost together. An EEG records them through electrodes on the scalp. We group them by speed into bands (delta, theta, alpha, beta, gamma). They show how the brain works, not what you think.",
			},
		},
		{
			q: {
				ro: "Cum se măsoară undele cerebrale?",
				en: "How are brainwaves measured?",
			},
			a: {
				ro: "Cu un EEG: niște discuri mici de argint sunt lipite pe scalp cu o pastă și legate prin fire de un aparat care înregistrează activitatea electrică. Potrivit NHS, testul nu doare și durează de obicei cam o oră. Ți se poate cere să deschizi și să închizi ochii sau să respiri adânc.",
				en: "With an EEG: small silver discs are stuck to the scalp with a paste and wired to a machine that records the electrical activity. According to the NHS, the test does not hurt and usually takes about an hour. You may be asked to open and close your eyes or breathe deeply.",
			},
		},
		{
			q: {
				ro: "Ce intervale au benzile alfa, beta, theta și delta?",
				en: "What ranges do alpha, beta, theta and delta cover?",
			},
			a: {
				ro: "În cele mai multe studii, delta e cam 1,3–3,5 Hz, theta 4–7,5 Hz, alfa 8–13 Hz și beta 12,5–30 Hz. Sunt intervale tipice, nu legi: în 184 de studii, limitele variau de la un articol la altul, iar benzile se suprapun. Citește-le ca pe niște zone pe o scară.",
				en: "In most studies, delta is roughly 1.3–3.5 Hz, theta 4–7.5 Hz, alpha 8–13 Hz and beta 12.5–30 Hz. These are typical ranges, not laws: across 184 studies, the limits varied from paper to paper, and the bands overlap. Read them as zones on a scale.",
			},
		},
		{
			q: {
				ro: "Pot citi gândurile cuiva din undele cerebrale?",
				en: "Can you read someone’s thoughts from brainwaves?",
			},
			a: {
				ro: "Nu. Un EEG arată ritmul activității electrice, nu conținutul gândurilor. Un cercetător scrie chiar că știm „șocant de puțin” despre de unde vine exact semnalul și ce înseamnă. Interpretarea unui EEG, pentru un medic, ține de probleme precum epilepsia sau somnul, nu de a citi minți.",
				en: "No. An EEG shows the rhythm of electrical activity, not the content of thoughts. One researcher even writes that we know “shockingly little” about exactly where the signal comes from and what it means. For a doctor, interpreting an EEG is about matters such as epilepsy or sleep, not reading minds.",
			},
		},
		{
			q: {
				ro: "Pot sunetele binaurale să-mi schimbe undele cerebrale?",
				en: "Can binaural sounds change my brainwaves?",
			},
			a: {
				ro: "Nu se știe sigur. Bătăile binaurale se aud în jur de 1–30 Hz, adică în intervalul benzilor EEG, dar într-o sinteză din 2023 din 14 studii, cinci au susținut ipoteza antrenării ritmului, opt au contrazis-o și unul a fost mixt. Nu promitem un efect; mulți ascultători descriu doar o relaxare bună.",
				en: "It is not known for sure. Binaural beats are heard at around 1–30 Hz, within the range of the EEG bands, but in a 2023 synthesis of 14 studies, five supported the entrainment hypothesis, eight contradicted it and one was mixed. We promise no effect; many listeners describe only a good relaxation.",
			},
		},
	],
	related: [
		"unde-alfa-beta-theta-delta-diferente",
		"unde-binaurale-cum-functioneaza",
		"ce-sunt-starile-de-constiinta",
		"fazele-somnului-explicate-simplu",
	],
};
