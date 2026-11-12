import type { ArticleInput } from "../../../schema";

export const article: ArticleInput = {
	slug: "unde-alfa-beta-theta-delta-diferente",
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
		ro: "Unde alfa, beta, theta, delta: diferențe și când apar",
		en: "Alpha, beta, theta, delta waves: differences and when they appear",
	},
	standfirst: {
		ro: "Cele patru nume sunt benzi de ritm, măsurate în hertzi pe un EEG: delta cea mai lentă, apoi theta, alfa și beta, cea mai rapidă. Apar toate, în același timp, în orice creier treaz sau adormit. Ce se schimbă e ce domină, nu o „stare” pentru fiecare undă.",
		en: "The four names are bands of rhythm, measured in hertz on an EEG: delta the slowest, then theta, alpha and beta, the fastest. All of them are present, at once, in every brain, awake or asleep. What changes is which one dominates, not a single “mood” per wave.",
	},
	body: [
		{
			type: "p",
			text: {
				ro: "Undele alfa, beta, theta și delta sunt cele patru benzi de ritm în care se împarte activitatea electrică a creierului atunci când o măsoară un EEG. Delta e cea mai lentă, beta cea mai rapidă. Toate patru sunt prezente tot timpul; ce se schimbă, de la o oră la alta, este care dintre ele se aude mai tare.",
				en: "Alpha, beta, theta and delta waves are the four bands of rhythm into which the brain’s electrical activity is divided when an EEG measures it. Delta is the slowest, beta the fastest. All four are present all the time; what changes, from one hour to the next, is which of them is heard loudest.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pe internet vei găsi des o variantă mai simplă: beta înseamnă stres, alfa calm, theta meditație, delta somn. Are un sâmbure de adevăr și o mulțime de excepții. În rândurile de mai jos le punem una lângă alta, cu scene din ziua ta, și spunem și unde simplificarea se rupe.",
				en: "On the internet you will often meet a simpler version: beta is stress, alpha is calm, theta is meditation, delta is sleep. It has a kernel of truth and plenty of exceptions. Below we set them side by side, with scenes from your day, and say where the simplification breaks.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Care e diferența dintre undele alfa, beta, theta și delta?",
				en: "What is the difference between alpha, beta, theta and delta waves?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Diferența de bază e viteza: câte oscilații pe secundă are ritmul, adică câți hertzi. Numerele exacte nu sunt aceleași în toate lucrările. O trecere în revistă a 184 de studii asupra creierului în repaus a găsit intervale tipice precum cele de mai jos, dar și faptul că limitele variază de la un articol la altul. Citește-le ca pe o hartă cu granițe aproximative.",
				en: "The basic difference is speed: how many oscillations per second the rhythm has, which is to say how many hertz. The exact numbers are not the same in every paper. A review of 184 studies of the resting brain found typical ranges like those below, and also that the limits vary from one paper to the next. Read them as a map with approximate borders.",
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
					ro: "Theta, cam 4–7,5 Hz: ritm lent, frecvent la marginea somnului și în stări de relaxare adâncă.",
					en: "Theta, roughly 4–7.5 Hz: a slow rhythm, common at the edge of sleep and in deep relaxation.",
				},
				{
					ro: "Alfa, cam 8–13 Hz: ritmul liniștii treze, mai ales cu ochii închiși.",
					en: "Alpha, roughly 8–13 Hz: the rhythm of quiet wakefulness, especially with the eyes closed.",
				},
				{
					ro: "Beta, cam 12,5–30 Hz: ritmul minții active, când rezolvi, vorbești, ești atent la ceva.",
					en: "Beta, roughly 12.5–30 Hz: the rhythm of the busy mind, when you solve, talk or attend to something.",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "Mai există gamma, în jur de 30–40 Hz, folosită mai rar în aceleași studii. Observă cum alfa se termină la 13 și beta începe la 12,5: chiar pe pagină, benzile se suprapun. Prima lecție e că nu sunt cutii cu pereți, ci zone pe o scară.",
				en: "There is also gamma, around 30–40 Hz, used less often in the same studies. Notice how alpha ends at 13 and beta begins at 12.5: on the page itself, the bands overlap. The first lesson is that they are not boxes with walls but zones on a scale.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum arată fiecare undă într-o zi obișnuită?",
				en: "What does each wave look like in an ordinary day?",
			},
		},
		{
			type: "p",
			text: {
				ro: "E 9:10, ai deschis e-mailul, telefonul sună și cineva îți cere ceva „pentru ieri”. Aici predomină ritmurile rapide, beta. Mintea alege, compară, ține în minte trei lucruri deodată. Nu e „stres”: e pur și simplu munca atenției, și poate fi la fel de bine plăcută.",
				en: "It is 9:10, you have opened your e-mail, the phone rings and somebody wants something “for yesterday”. The fast rhythms, beta, prevail here. The mind chooses, compares, keeps three things in play at once. It is not “stress”: it is simply the work of attention, and it can just as well be enjoyable.",
			},
		},
		{
			type: "p",
			text: {
				ro: "La prânz te așezi lângă geam și închizi ochii pentru un minut. Ritmul alfa, cel de repaus treaz, se vede de regulă mai bine acum, cu ochii închiși. Gândurile încetinesc fără să dispară. Nu adormi, nu te concentrezi; doar ești.",
				en: "At lunch you sit by the window and close your eyes for a minute. The alpha rhythm, that of awake rest, is usually seen better now, with the eyes closed. Thoughts slow down without disappearing. You are not asleep and you are not concentrating; you simply are.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Seara, în tramvai, privirea ți se pierde pe geam și realizezi că ai ratat stația. Sau stai în pat și imaginile încep să nu mai țină de logică: o ușă care e și o carte. Aceasta e marginea somnului, unde ritmurile mai lente, theta printre ele, devin tot mai prezente. Alt articol de pe acest site, despre hipnagogie, o descrie mai larg.",
				en: "In the evening, on the tram, your gaze drifts out of the window and you realise you have missed your stop. Or you lie in bed and the images stop obeying logic: a door that is also a book. This is the edge of sleep, where the slower rhythms, theta among them, become more present. Another article on this site, about hypnagogia, describes it more fully.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Iar la o oră-două după ce ai adormit, în somnul adânc din prima parte a nopții, dacă ai fi conectat la un EEG, ai vedea unde mari și lente, cele delta. Dormi atât de adânc încât, dacă ar suna telefonul, ai avea nevoie de un moment să te dumirești unde ești.",
				en: "And an hour or two after you fall asleep, in the deep sleep of the early part of the night, if you were wired to an EEG you would see large, slow waves, the delta ones. You sleep so deeply that if the phone rang you would need a moment to work out where you are.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "De ce „o undă = o stare” este o simplificare?",
				en: "Why is “one wave, one state” an oversimplification?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pentru că niciun creier nu are o singură undă la un moment dat. Un EEG arată un amestec; benzile sunt felii pe care le separă calculul, nu stări separate în capul tău. Când spunem „predomină alfa”, spunem doar că acea felie are cea mai mare putere în acel loc, în acel minut.",
				en: "Because no brain has a single wave at any one moment. An EEG shows a mixture; the bands are slices that the calculation separates, not separate states inside your head. When we say “alpha predominates”, we are only saying that this slice has the most power in that place, in that minute.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Mai e și o problemă de limbaj. Autorii acelei treceri în revistă a 184 de studii notează că ce numește o lucrare „delta” sau „beta” nu coincide neapărat cu ce numește alta la fel. Cel mai folosit interval pentru o bandă apare doar în 30–50% dintre studii, după bandă. Iar tiparele de unde observate la persoane cu diverse probleme se suprapun mult între ele, deci nu spun, luate singure, cine ești sau ce ai.",
				en: "There is also a problem of language. The authors of that review of 184 studies note that what one paper calls “delta” or “beta” is not necessarily what another calls the same. The most common range for a band appears in only 30–50% of studies, depending on the band. And the patterns of waves seen in people with various difficulties overlap a great deal, so on their own they do not say who you are or what you have.",
			},
		},
		{
			type: "quote",
			text: {
				ro: "Benzile sunt felii pe care le separă calculul, nu stări separate din capul tău.",
				en: "The bands are slices the calculation separates, not separate states inside your head.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Și mai sunt excepțiile de zi cu zi. Poți fi foarte calm și totuși cu beta mult, de pildă când citești absorbit. Poți fi agitat și să ai alfa. De aceea, „beta = anxietate” nu se poate citi ca regulă. Un EEG de calitate se citește într-un cabinet, de un specialist, nu din titluri.",
				en: "And there are the everyday exceptions. You can be very calm and still have plenty of beta, for example when reading absorbed. You can be restless and still have alpha. That is why “beta = anxiety” cannot be read as a rule. A good EEG is read in a clinic, by a specialist, not from headlines.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum citești un grafic de unde fără să te păcălești?",
				en: "How do you read a wave chart without fooling yourself?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Poate vei primi cândva un raport cu grafice colorate sau vei vedea un titlu care promite „ritmul tău ideal”. Câteva întrebări simple te ajută să nu te pierzi în ele. Nu sunt o metodă de diagnostic, ci obiceiuri de lectură atentă.",
				en: "One day you may be handed a report with coloured graphs, or see a headline promising “your ideal rhythm”. A few simple questions help you not to get lost in them. They are not a diagnostic method, only habits of careful reading.",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "Cu ochii închiși sau deschiși? Revizuirea celor 184 de studii a găsit rezultate mai consecvente cu ochii închiși decât cu ochii deschiși, iar alfa se schimbă mult între cele două.",
					en: "Eyes closed or open? The review of 184 studies found results more consistent with the eyes closed than open, and alpha changes a great deal between the two.",
				},
				{
					ro: "Putere absolută sau relativă? Sunt două moduri de a număra, iar rezultatul dominant a coincis între ele doar în 62% dintre comparații.",
					en: "Absolute or relative power? These are two ways of counting, and the dominant result matched between them in only 62% of comparisons.",
				},
				{
					ro: "Ce interval s-a numit „theta” aici? Verifică hertzii, nu doar numele benzii.",
					en: "Which range was called “theta” here? Check the hertz, not just the name of the band.",
				},
				{
					ro: "Cine a interpretat graficul? O cifră fără un specialist care te cunoaște rămâne o cifră.",
					en: "Who interpreted the chart? A number without a specialist who knows you stays a number.",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "Dacă lista pare prudentă, e intenționat. Undele sunt un instrument excelent de cercetare și, în mâna unui clinician, o parte dintr-un tablou mai mare. Din afara cabinetului, ele devin ușor o poveste frumoasă care nu e tot adevărul.",
				en: "If the list seems cautious, that is deliberate. Waves are an excellent research instrument and, in a clinician’s hands, one part of a larger picture. Outside the clinic, they easily become a lovely story that is not the whole truth.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce legătură au undele theta cu meditația?",
				en: "What have theta waves to do with meditation?",
			},
		},
		{
			type: "p",
			text: {
				ro: "O legătură există, dar mai blândă decât se spune. O trecere în revistă sistematică a studiilor EEG despre meditația mindfulness, publicată în 2015 de Lomas și colegii, a notat că rezultatul cel mai frecvent a fost mai multă putere alfa și theta în timpul practicii, față de repausul cu ochii închiși. Dar nu în toate studiile, iar pentru beta, delta sau gamma nu a ieșit un tipar consecvent.",
				en: "There is a link, but a gentler one than is often said. A systematic review of EEG studies on mindfulness meditation, published in 2015 by Lomas and colleagues, noted that the most frequent result was more alpha and theta power during practice, compared with resting with the eyes closed. But not in every study, and for beta, delta or gamma no consistent pattern emerged.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Autorii au propus că alfa și theta laolaltă ar putea însemna o „alertă relaxată”, trează și liniștită în același timp. Merită să reții formularea, pentru că e mai aproape de ce descriu mulți oameni: nu „am adormit” și nici „m-am concentrat tare”, ci un loc între. Nu e o dovadă că theta „produce” meditația; e doar ce s-a observat.",
				en: "The authors suggested that alpha and theta together might mean a “relaxed alertness”, awake and quiet at the same time. The phrase is worth keeping, because it is closer to what many people describe: not “I fell asleep” and not “I concentrated hard”, but a place between. It is not proof that theta “produces” meditation; it is only what was observed.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Delta și somnul: ce se întâmplă în somnul profund?",
				en: "Delta and sleep: what happens in deep sleep?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Somnul se desfășoară în cicluri de aproximativ 90 de minute, care trec prin somn ușor, somn profund și somn REM. În stadiul de somn profund, numit N3, activitatea dominantă este formată din unde delta mari și lente, de 1–4 Hz, potrivit Sleep Foundation. Cea mai mare parte a somnului profund vine devreme în noapte.",
				en: "Sleep unfolds in cycles of about 90 minutes, which pass through light sleep, deep sleep and REM sleep. In the deep-sleep stage, called N3, the dominant activity is made of large, slow delta waves of 1–4 Hz, according to the Sleep Foundation. Most deep sleep comes early in the night.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Fiindcă somnul profund e atât de profund, te trezești greu din el și poți fi buimac câteva minute: se numește inerție de somn. Asta explică de ce un telefon care sună la început de noapte te lasă fără cuvinte. Nu e un defect al tău. Așa arată un creier care doarme bine.",
				en: "Because deep sleep is so deep, it is hard to wake from and you may be groggy for a few minutes: this is called sleep inertia. It explains why a phone ringing early in the night leaves you without words. It is not a flaw in you. It is what a brain that sleeps well looks like.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce nu putem spune despre unde și starea ta?",
				en: "What can’t we say about waves and how you feel?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Nu putem spune că o anumită undă „vindecă”, că ți-o poți regla singur ca pe un buton sau că o anumită valoare înseamnă că ai o problemă. Nu diagnosticăm și nu promitem rezultate. Putem spune ce se măsoară, ce se observă și unde cercetarea încă se contrazice.",
				en: "We cannot say that a given wave “heals”, that you can tune it yourself like a dial, or that a given value means you have a problem. We do not diagnose and we do not promise results. We can say what is measured, what is observed and where the research still disagrees.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Aici intră și audio-ul. Unele exerciții folosesc sunete binaurale gândite să fie apropiate de aceste ritmuri, ideea fiind ca ritmul sunetului să „invite” creierul spre el. Dacă o face cu adevărat e încă o întrebare deschisă: într-o trecere în revistă din 2023, din 14 studii, 5 au susținut ipoteza, 8 au contrazis-o, unul a fost mixt. Despre asta, pe larg, în articolul despre cum funcționează undele binaurale.",
				en: "This is where audio comes in. Some exercises use binaural beats designed to sit near these rhythms, the idea being that the rhythm of the sound will “invite” the brain toward it. Whether it truly does is still an open question: in a 2023 review, of 14 studies, 5 supported the hypothesis, 8 contradicted it and one was mixed. More on that in the article on how binaural beats work.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce poți încerca astăzi, fără să măsori nimic?",
				en: "What can you try today, without measuring anything?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Nu ai nevoie de un aparat ca să observi aceste ritmuri în viața ta. Alege trei momente: unul în care ești absorbit de o sarcină, unul în care stai cu ochii închiși o clipă și unul chiar înainte de somn. Notează, fără să judeci, cum se simte atenția în fiecare. Vei ajunge singur la ideea acestui articol: stările nu sunt etichete, sunt un drum.",
				en: "You do not need a device to notice these rhythms in your life. Choose three moments: one when you are absorbed in a task, one when you sit with your eyes closed for a moment, and one just before sleep. Note, without judging, how attention feels in each. You will arrive by yourself at the idea of this article: states are not labels, they are a road.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Dacă vrei să-l parcurgi și cu sunetul, pasul următor este un exercițiu gratuit pe site-ul Hemi-Sync România, cu căști și fără grabă. Este o explorare a experienței tale, nu un tratament.",
				en: "If you would like to walk it with sound as well, the next step is a free exercise on the Hemi-Sync Romania site, with headphones and no hurry. It is an exploration of your own experience, not a treatment.",
			},
		},
	],
	sources: [
		{
			label: {
				ro: "Newson & Thiagarajan, 2018: EEG pe benzi de frecvență în tulburări (trecere în revistă a 184 de studii)",
				en: "Newson & Thiagarajan, 2018: EEG frequency bands in disorders (review of 184 studies)",
			},
			href: "https://www.frontiersin.org/journals/human-neuroscience/articles/10.3389/fnhum.2018.00521/full",
		},
		{
			label: {
				ro: "Sleep Foundation: somnul NREM, stadiul N3 și undele delta",
				en: "Sleep Foundation: NREM sleep, stage N3 and delta waves",
			},
			href: "https://www.sleepfoundation.org/stages-of-sleep/nrem-sleep",
		},
		{
			label: {
				ro: "Lomas, Ivtzan & Fu, 2015: neurofiziologia mindfulness pe oscilații EEG (trecere în revistă sistematică)",
				en: "Lomas, Ivtzan & Fu, 2015: the neurophysiology of mindfulness on EEG oscillations (systematic review)",
			},
			href: "https://pubmed.ncbi.nlm.nih.gov/26175009/",
		},
		{
			label: {
				ro: "Ingendoh et al., 2023, PLOS ONE: antrenează sunetele binaurale creierul? (trecere în revistă sistematică)",
				en: "Ingendoh et al., 2023, PLOS ONE: do binaural beats entrain the brain? (systematic review)",
			},
			href: "https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0286023",
		},
		{
			label: {
				ro: "Hemi-Sync România: tehnologia și exercițiile gratuite",
				en: "Hemi-Sync Romania: the technology and the free exercises",
			},
			href: "https://hemi-sync.ro/tehnologia",
		},
	],
	provenance: [
		"https://www.frontiersin.org/journals/human-neuroscience/articles/10.3389/fnhum.2018.00521/full (Table 2 typical ranges: delta 1.3–3.5, theta 4–7.5, alpha 8–13, beta 12.5–30, gamma 30–40 Hz; 184 studies; most frequent range used in only 30–50% of studies; overlap across disorders)",
		"https://www.sleepfoundation.org/stages-of-sleep/nrem-sleep (N3, delta 1–4 Hz, 90-minute cycle, most deep sleep early in the night, sleep inertia)",
		"https://pubmed.ncbi.nlm.nih.gov/26175009/ (Lomas, Ivtzan & Fu 2015: most frequent finding higher alpha and theta power in mindfulness versus eyes-closed rest, not uniform, no consistent pattern for beta, delta, gamma; 'relaxed alertness' interpretation; read through the author manuscript and abstract summaries, paper counts deliberately not quoted)",
		"https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0286023 (14 studies: 5 support, 8 contradict, 1 mixed)",
		"https://hemi-sync.ro/tehnologia and https://hemi-sync.ro (free exercises, headphones, method not belief)",
		"docs/brands/writing-voice.md; packages/design/brand-books/3-hemi-sync.md",
		"packages/content/src/articles/library/psizone/undele-cerebrale-alfa-beta-theta-delta.ts (house treatment of the same bands, kept qualitative)",
	],
	seo: {
		title: {
			ro: "Unde alfa beta theta delta: diferențe, scene și excepții",
			en: "Alpha beta theta delta waves: differences, scenes, exceptions",
		},
		description: {
			ro: "Ce sunt undele alfa, beta, theta și delta, cât de repede oscilează și când apar în ziua ta. De ce „o undă, o stare” e o simplificare, cu surse deschise.",
			en: "What alpha, beta, theta and delta waves are, how fast they oscillate and when they show up in your day. Why “one wave, one state” oversimplifies, with open sources.",
		},
		keywords: {
			ro: [
				"unde alfa beta theta delta",
				"diferența dintre undele cerebrale",
				"unde theta meditație",
				"unde delta somn",
				"hertzi unde cerebrale",
				"benzi EEG",
			],
			en: [
				"alpha beta theta delta waves",
				"brain wave differences",
				"theta waves meditation",
				"delta waves sleep",
				"brain wave frequencies hertz",
				"EEG bands",
			],
		},
	},
	faq: [
		{
			q: {
				ro: "Care sunt undele cerebrale, de la cea mai lentă la cea mai rapidă?",
				en: "What are the brain waves, from slowest to fastest?",
			},
			a: {
				ro: "De la lent la rapid: delta (cam 1,3–3,5 Hz), theta (cam 4–7,5 Hz), alfa (cam 8–13 Hz), beta (cam 12,5–30 Hz) și gamma (cam 30–40 Hz). Limitele diferă de la un studiu la altul, așa că le poți citi ca pe niște zone aproximative pe o scară, nu ca pe niște pereți.",
				en: "From slow to fast: delta (roughly 1.3–3.5 Hz), theta (roughly 4–7.5 Hz), alpha (roughly 8–13 Hz), beta (roughly 12.5–30 Hz) and gamma (roughly 30–40 Hz). The limits differ from one study to another, so read them as approximate zones on a scale, not as walls.",
			},
		},
		{
			q: {
				ro: "Pot avea mai multe tipuri de unde în același timp?",
				en: "Can I have several kinds of wave at the same time?",
			},
			a: {
				ro: "Da, ai mereu mai multe deodată. Un EEG arată un amestec, iar când se spune că „predomină alfa” se înțelege că acea bandă are cea mai mare putere într-un loc și într-un interval anume. Celelalte nu dispar; doar se aud mai încet în acel moment.",
				en: "Yes, you always have several at once. An EEG shows a mixture, and when we say “alpha predominates” we mean that this band has the most power in a given place and interval. The others do not disappear; they are just quieter at that moment.",
			},
		},
		{
			q: {
				ro: "Sunt undele theta ale meditației?",
				en: "Are theta waves the waves of meditation?",
			},
			a: {
				ro: "Pe jumătate. O trecere în revistă din 2015 a studiilor EEG despre mindfulness a notat că cel mai des apare mai multă putere alfa și theta în timpul practicii, dar nu în toate studiile. Theta este o observație, nu un ingredient pe care să-l „produci” ca să meditezi corect.",
				en: "Half true. A 2015 review of EEG studies on mindfulness noted that more alpha and theta power most often appears during practice, but not in every study. Theta is an observation, not an ingredient you must “produce” to meditate correctly.",
			},
		},
		{
			q: {
				ro: "În ce stadiu de somn apar undele delta?",
				en: "In which sleep stage do delta waves appear?",
			},
			a: {
				ro: "În somnul profund, stadiul N3, unde activitatea dominantă e formată din unde mari și lente de 1–4 Hz. Un ciclu complet de somn durează aproximativ 90 de minute, iar cea mai mare parte a somnului profund vine în prima parte a nopții, după Sleep Foundation.",
				en: "In deep sleep, stage N3, where the dominant activity is made of large, slow waves of 1–4 Hz. A full sleep cycle lasts about 90 minutes, and most deep sleep comes in the first part of the night, according to the Sleep Foundation.",
			},
		},
		{
			q: {
				ro: "Pot să-mi „reglez” undele cerebrale ascultând sunete?",
				en: "Can I “tune” my brain waves by listening to sounds?",
			},
			a: {
				ro: "Nu există o garanție. Într-o trecere în revistă din 2023, din 14 studii despre sunete binaurale, 5 au susținut ideea că ele antrenează ritmul creierului, 8 au contrazis-o și unul a fost mixt. Poți asculta ca explorare a experienței tale, fără să aștepți un rezultat anume.",
				en: "There is no guarantee. In a 2023 review, of 14 studies on binaural beats, 5 supported the idea that they entrain the brain’s rhythm, 8 contradicted it and one was mixed. You can listen as an exploration of your own experience, without expecting a particular result.",
			},
		},
	],
	related: [
		"ce-sunt-undele-cerebrale",
		"fazele-somnului-explicate-simplu",
		"hipnagogia-ce-este",
		"unde-binaurale-cum-functioneaza",
	],
};
