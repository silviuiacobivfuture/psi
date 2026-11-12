import type { ArticleInput } from "../../../schema";

export const article: ArticleInput = {
	slug: "tehnica-pomodoro-pentru-concentrare",
	brand: "eqsync",
	topic: "creier-si-minte",
	backlogNo: null,
	status: "draft",
	kind: "health",
	aiDrafted: true,
	draftedAt: "2026-11-12",
	author: null,
	reviewer: null,
	title: {
		ro: "Tehnica Pomodoro: cum o adaptezi ca să te ajute cu adevărat",
		en: "The Pomodoro technique, adapted so it helps",
	},
	standfirst: {
		ro: "Tehnica Pomodoro înseamnă, în forma clasică, 25 de minute de lucru la o singură sarcină, apoi 5 minute de pauză. Merge bine ca punct de plecare, dar nu e o lege. Mai jos: cum alegi intervalul, ce faci în pauză, când ignori cronometrul și cum o împerechezi cu un sunet constant.",
		en: "In its classic form, the Pomodoro technique means 25 minutes of work on a single task, then a 5-minute break. It is a good starting point, but not a law. Below: how to choose the interval, what to do in the break, when to ignore the timer, and how to pair it with a steady sound.",
	},
	body: [
		{
			type: "p",
			text: {
				ro: "Tehnica Pomodoro, în forma ei clasică, are un singur mecanism: alegi o sarcină, pui cronometrul pe 25 de minute, lucrezi până sună, apoi te oprești 5 minute. După patru astfel de intervale, faci o pauză mai lungă, de 15 până la 30 de minute. Atât. Restul articolului este despre cum faci din acest schelet ceva care chiar îți folosește, în loc de un joc de cronometre.",
				en: "The Pomodoro technique, in its classic form, has a single mechanism: you pick a task, set a timer for 25 minutes, work until it rings, then stop for 5 minutes. After four such intervals you take a longer break, of 15 to 30 minutes. That is all. The rest of this article is about turning this scaffold into something that really helps you, rather than a game of timers.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum funcționează tehnica Pomodoro clasică, de 25 și 5?",
				en: "How does the classic 25/5 Pomodoro technique work?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Numele vine de la italienescul „pomodoro”, roșie, după cronometrul de bucătărie în formă de roșie folosit de Francesco Cirillo, student la sfârșitul anilor ’80, care a pus la punct metoda. Universități precum Duke o descriu pentru studenți în câțiva pași: definești o sarcină, pui timerul pe 25 de minute, lucrezi doar la ea, faci o pauză de 5 minute, de preferat departe de ecrane, și după patru intervale iei o pauză mai lungă.",
				en: "The name comes from the Italian “pomodoro”, tomato, after the tomato-shaped kitchen timer used by Francesco Cirillo, a student in the late 1980s, who devised the method. Universities such as Duke describe it for students in a few steps: define one task, set the timer for 25 minutes, work only on it, take a 5-minute break, preferably away from screens, and after four intervals take a longer break.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Cifra 25 nu e o lege a naturii. Pare să fi ieșit din experimentele lui Cirillo, nu dintr-un laborator, și nu avem o dovadă că ar fi „numărul corect” pentru toată lumea. Ce are valoare e structura: un început clar, un sfârșit vizibil, o singură sarcină.",
				en: "The number 25 is not a law of nature. It seems to have come from Cirillo’s own experiments, not from a lab, and we have no proof that it is “the right number” for everyone. What has value is the structure: a clear beginning, a visible end, one task.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum alegi intervalul care ți se potrivește?",
				en: "How do you choose the interval that suits you?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Încearcă mai multe variante, câte trei zile fiecare, și notează ce simți la sfârșit. Dacă te enervezi când sună cronometrul, intervalul e prea scurt. Dacă pe la minutul 18 te uiți deja la ceas, e prea lung. Variantele mai lungi pe care le folosesc mulți sunt 35 sau 45 de minute de lucru cu 10 de pauză, sau 50 cu 10. Sunt alegeri practice, nu rețete cu garanții.",
				en: "Try several versions, three days each, and note how you feel at the end. If you get annoyed when the timer rings, the interval is too short. If by minute 18 you are already looking at the clock, it is too long. Longer variants that many people use are 35 or 45 minutes of work with a 10-minute break, or 50 with 10. These are practical choices, not recipes with guarantees.",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "25 și 5: pentru începuturi, sarcini plictisitoare sau zile obosite.",
					en: "25 and 5: for beginnings, dull tasks or tired days.",
				},
				{
					ro: "35 sau 45 și 10: pentru scris, învățat sau programat, când te adânci mai greu.",
					en: "35 or 45 and 10: for writing, studying or coding, when it takes longer to sink in.",
				},
				{
					ro: "50 și 10: pentru ziua în care ai deja o sarcină mare și o poți ține.",
					en: "50 and 10: for a day when you already have a big task and can hold it.",
				},
				{
					ro: "15 și 3: pentru zilele în care orice altceva pare prea mult. E mai bine decât nimic.",
					en: "15 and 3: for days when anything else feels like too much. It is better than nothing.",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "Regula de aur: intervalul trebuie să fie ușor de pornit. Dacă ți se pare că „nu are rost să încep, dacă tot nu pot 25 de minute”, scurtează-l. Un interval mic, terminat, construiește încredere. Unul mare, abandonat, o demolează.",
				en: "The golden rule: the interval must be easy to start. If you think “there is no point beginning if I cannot manage 25 minutes anyway”, shorten it. A small interval, finished, builds confidence. A large one, abandoned, tears it down.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce faci, concret, în pauză?",
				en: "What exactly do you do in the break?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Aici se pierde cel mai mult din tehnică. Pauza de cinci minute devine, de obicei, o defilare pe telefon, iar când sună din nou cronometrul, mintea n-a mai avut deloc odihnă. Ridică-te. Mișcă-te. Privește departe pe fereastră. Bea apă. Dacă poți, ieși o clipă afară. Fără ecran, fără mesaje, fără „doar o privire” la mail.",
				en: "This is where the technique loses most. The five-minute break usually becomes scrolling on your phone, and when the timer rings again, your mind has had no rest at all. Stand up. Move. Look far out of the window. Drink water. If you can, step outside for a moment. No screen, no messages, no “just a glance” at your inbox.",
			},
		},
		{
			type: "p",
			text: {
				ro: "O analiză din 2022, publicată în PLOS ONE, a strâns studii despre micropauze de cel mult zece minute. Pauzele au adus un mic plus de energie și o mică scădere a oboselii. Efectul asupra performanței nu a fost clar, iar autorii notează că sarcinile foarte solicitante pot cere pauze mai lungi. Concluzia pentru tine: pauza nu e o recompensă. E parte din muncă, iar dacă o zi e grea, nu te simți vinovat că ai nevoie de una mai lungă.",
				en: "A 2022 review published in PLOS ONE gathered studies of micro-breaks of ten minutes or less. Breaks brought a small gain in energy and a small drop in fatigue. The effect on performance was not clear, and the authors note that very demanding tasks may need longer breaks. The conclusion for you: a break is not a reward. It is part of the work, and if a day is hard, do not feel guilty for needing a longer one.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pentru o pauză cu adevărat liniștitoare, ia cinci respirații lente, cu expirația mai lungă. Serviciul de sănătate britanic notează că o pauză de câteva minute pentru a respira te poate ajuta să te simți mai calm, indiferent ce faci.",
				en: "For a truly calming break, take five slow breaths, with the exhale longer. The UK health service notes that pausing for a few minutes to breathe can help you feel calmer, whatever you are doing.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Când ignori cronometrul?",
				en: "When do you ignore the timer?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Sunt zile în care, la minutul 25, ești exact în mijlocul unui gând bun. Atunci, ce faci? Dacă e un moment de adâncime reală, lasă cronometrul să sune și continuă, dar notează ora. Când ajungi la un loc de oprire firesc (sfârșitul unui paragraf, al unei probleme), fă pauza. Cirillo a fost strict cu metoda, dar tu nu ești un robot de cronometrat, iar scopul este atenția, nu respectarea timerului.",
				en: "There are days when, at minute 25, you are right in the middle of a good thought. What do you do then? If it is a moment of real depth, let the timer ring and carry on, but note the time. When you reach a natural stopping place (the end of a paragraph, of a problem), take the break. Cirillo was strict about the method, but you are not a robot to be timed, and the aim is attention, not obeying the timer.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Există și reversul: dacă ignori cronometrul în fiecare zi, el nu mai face nimic. Folosește-l ca pe o plasă de siguranță, nu ca pe un stăpân. Regula simplă: ignoră-l cel mult o dată pe zi, și numai când ai ales asta conștient, nu din inerție.",
				en: "There is also the reverse: if you ignore the timer every day, it does nothing. Use it as a safety net, not a master. A simple rule: ignore it at most once a day, and only when you have chosen to consciously, not out of inertia.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce faci când ești întrerupt în mijlocul unui interval?",
				en: "What do you do when you are interrupted mid-interval?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Se va întâmpla: un coleg te strigă, sună cineva, îți amintești brusc că ai uitat să răspunzi unui mesaj. Descrierea metodei de la Duke sfătuiește să-ți pregătești mediul în așa fel încât să eviți distragerile și, când se poate, să duci intervalul până la capăt. Întreruperile mici, cum ar fi verificarea mailului, se strâng într-o scurtă sesiune separată.",
				en: "It will happen: a colleague calls you, someone phones, you suddenly remember you forgot to answer a message. Duke’s description of the method advises setting up your environment to avoid distractions and, where possible, seeing the interval through. Small interruptions, such as checking email, are gathered into one short separate session.",
			},
		},
		{
			type: "p",
			text: {
				ro: "În practică, ține o foaie alături. Gândul care te-a întrerupt se notează într-o jumătate de rând („Ana: confirmare vineri”) și ți-l lași pentru pauză. Dacă întreruperea e reală și nu poate aștepta, oprește cronometrul, rezolvă-o și reia un interval nou, fără să te învinuiești. Un interval întrerupt nu e un interval eșuat, e un interval de reluat.",
				en: "In practice, keep a sheet beside you. The thought that interrupted you is noted in half a line (“Ana: confirm Friday”) and left for the break. If the interruption is real and cannot wait, stop the timer, deal with it and start a new interval, without blaming yourself. An interrupted interval is not a failed interval, it is an interval to restart.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum arată o după-amiază de studiu cu Pomodoro?",
				en: "What does a study afternoon with Pomodoro look like?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Să zicem că ai un examen peste două săptămâni și un capitol de recapitulat. La 15:00 scrii pe o hârtie: „capitolul 4, subcapitolele 1 și 2”. Telefonul pleacă în altă cameră. Primul interval, 25 de minute: citești și subliniezi. Pauza: te ridici, bei apă, privești pe fereastră. Al doilea interval: reciți din memorie, fără carte, ce ai citit. Aici descoperi ce ai reținut cu adevărat.",
				en: "Say you have an exam in two weeks and a chapter to revise. At 3 p.m. you write on a sheet: “chapter 4, sections 1 and 2”. Your phone goes to another room. First interval, 25 minutes: you read and underline. The break: you stand up, drink water, look out of the window. Second interval: you recall from memory, without the book, what you read. This is where you find out what you really kept.",
			},
		},
		{
			type: "p",
			text: {
				ro: "După patru intervale ai deja aproape două ore de lucru real și o pauză lungă binemeritată. Nu toate zilele vor arăta așa. Dar o după-amiază cu ritm, cu margini vizibile, obosește mai puțin decât una lungă și fără formă, în care stai patru ore la birou și abia ai făcut ceva.",
				en: "After four intervals you have almost two hours of real work and a well-earned long break. Not every day will look like this. But an afternoon with a rhythm, with visible edges, tires you less than a long formless one in which you sit at your desk for four hours and hardly do anything.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum ții evidența fără vinovăție?",
				en: "How do you keep track without guilt?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Mulți oameni țin o listă cu intervalele terminate: o bifă pentru fiecare. Poate fi motivant, dar poate deveni și o sursă de rușine, mai ales în zilele cu două bife. Propunerea noastră: numără ce ai făcut, nu ce n-ai făcut. Două intervale terminate într-o zi grea sunt două intervale terminate. Nu există o cotă.",
				en: "Many people keep a list of finished intervals: a tick for each. It can be motivating, but it can also become a source of shame, especially on days with two ticks. Our suggestion: count what you did, not what you did not. Two intervals finished on a hard day are two intervals finished. There is no quota.",
			},
		},
		{
			type: "p",
			text: {
				ro: "O variantă blândă: la sfârșitul zilei, scrie într-un rând ce ai făcut cu intervalele tale („trei intervale, unul la raport, două la mailuri”). Peste o săptămână vei vedea tiparul. Aceasta e utilă pentru a-ți planifica zilele următoare, nu pentru a te judeca.",
				en: "A gentle version: at the end of the day, write in one line what you did with your intervals (“three intervals, one on the report, two on emails”). After a week you will see the pattern. That is useful for planning the following days, not for judging yourself.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Un ultim lucru, onest: tehnica nu e pentru toată lumea. Unele persoane se simt presate de cronometru, iar presiunea le face să se concentreze mai prost. Dacă ți se întâmplă asta, încearcă un cronometru discret, care nu face zgomot, sau renunță la el și folosește doar ideea de bază: o sarcină, un început, un sfârșit. Metoda există ca să te ajute pe tine, nu ca să-ți dea încă un motiv de neliniște.",
				en: "One last honest thing: the technique is not for everyone. Some people feel pressed by the timer, and the pressure makes them concentrate worse. If that happens to you, try a discreet timer that makes no noise, or drop it and use only the basic idea: one task, a beginning, an end. The method exists to help you, not to give you one more reason to feel uneasy.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Poți împerechea Pomodoro cu un sunet constant?",
				en: "Can you pair Pomodoro with a steady sound?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Da, ca semnal. Alege un sunet sau o piesă fără versuri, la volum mic, și pornește-o doar când începi un interval. Când se oprește, e pauză. În timp, sunetul devine el însuși un semn de „acum lucrăm”. Un studiu din Journal of Cognition (2023) a arătat că muzica cu versuri deranjează citirea și memoria verbală, în timp ce muzica instrumentală nu a ajutat și nici nu a stricat clar. Așadar, dacă ai de citit sau de scris, tăcerea poate fi cea mai sigură variantă.",
				en: "Yes, as a cue. Pick a sound or a track without lyrics, at low volume, and start it only when you begin an interval. When it stops, it is break time. Over time the sound itself becomes a sign of “now we work”. A study in the Journal of Cognition (2023) showed that music with lyrics disturbs reading and verbal memory, while instrumental music neither clearly helped nor hurt. So if you have reading or writing to do, silence may be the safest option.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Dacă lucrezi cu căștile, poți începe fiecare interval cu un exercițiu ghidat foarte scurt. EQ-SYNC are exerciții ascultate cu căști, pentru că frecvențele binaurale cer ca fiecare ureche să primească un ton ușor diferit. EQ-SYNC este un instrument de wellness, nu un dispozitiv medical, iar persoanele cu epilepsie sau cu afecțiuni convulsive nu folosesc audio binaural fără acordul medicului.",
				en: "If you work with headphones, you can begin each interval with a very short guided exercise. EQ-SYNC has exercises heard through headphones, because binaural frequencies need each ear to receive a slightly different tone. EQ-SYNC is a wellness tool, not a medical device, and people with epilepsy or seizure disorders do not use binaural audio without their doctor’s agreement.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pasul următor, unul singur: alege azi o sarcină și un interval, de 25 de minute sau mai scurt, și întreabă ghidul EQ-SYNC cum poți începe fiecare interval cu o respirație ghidată, în ritmul tău.",
				en: "One next step: pick one task and one interval today, of 25 minutes or shorter, and ask the EQ-SYNC guide how you can begin each interval with a guided breath, at your own pace.",
			},
		},
	],
	sources: [
		{
			label: {
				ro: "Duke University: tehnica Pomodoro",
				en: "Duke University: the Pomodoro technique",
			},
			href: "https://arc.duke.edu/pomodoro-technique",
		},
		{
			label: {
				ro: "Albulescu și colab., PLOS ONE 2022: micropauze la muncă",
				en: "Albulescu et al., PLOS ONE 2022: micro-breaks at work",
			},
			href: "https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0272460",
		},
		{
			label: {
				ro: "NHS Every Mind Matters: Stres",
				en: "NHS Every Mind Matters: Stress",
			},
			href: "https://www.nhs.uk/every-mind-matters/mental-health-issues/stress/",
		},
		{
			label: {
				ro: "Souza și Barbosa, Journal of Cognition 2023: muzica cu versuri",
				en: "Souza and Barbosa, Journal of Cognition 2023: music with lyrics",
			},
			href: "https://journalofcognition.org/articles/273",
		},
	],
	provenance: [
		"https://arc.duke.edu/pomodoro-technique (25 minutes, single task, 5-minute break away from screens, 15 to 30 minutes after four)",
		"https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0272460 (micro-breaks: small effects on vigour and fatigue, performance not clear, demanding tasks may need longer breaks)",
		"https://www.nhs.uk/every-mind-matters/mental-health-issues/stress/ (pause and breathe for a few minutes)",
		"https://journalofcognition.org/articles/273 (lyrics interfere; instrumental effects unclear)",
		"WebSearch result summarising Cirillo's book (origin of the name, no scientific basis for 25 minutes); his own site returned 403 and was not opened",
		"apps/eqsync-web/messages/ro.json, packages/content/src/articles/eqsync-casti.ts (headphones, binaural mechanism, wellness tool wording)",
		"docs/brands/writing-voice.md",
	],
	seo: {
		title: {
			ro: "Tehnica Pomodoro: cum o adaptezi ca să te ajute cu adevărat",
			en: "Pomodoro technique: how to adapt it so it really helps",
		},
		description: {
			ro: "Pomodoro dincolo de 25 și 5: cum alegi intervalul, ce faci în pauză, când ignori cronometrul și cum o combini cu un sunet constant.",
			en: "Pomodoro beyond 25 and 5: how to pick your interval, what to do in the break, when to ignore the timer, and how to pair it with a steady sound.",
		},
		keywords: {
			ro: [
				"tehnica pomodoro",
				"tehnica pomodoro cum funcționează",
				"pomodoro 25 5",
				"pauze în timpul studiului",
				"cum învăț cu cronometru",
				"pomodoro cu muzică",
			],
			en: [
				"pomodoro technique",
				"how does the pomodoro technique work",
				"pomodoro 25 5",
				"study breaks",
				"timer for studying",
				"pomodoro with music",
			],
		},
	},
	faq: [
		{
			q: {
				ro: "Cum funcționează tehnica Pomodoro?",
				en: "How does the Pomodoro technique work?",
			},
			a: {
				ro: "Alegi o sarcină, pui cronometrul pe 25 de minute, lucrezi doar la ea până sună, apoi faci o pauză de 5 minute, de preferat departe de ecran. După patru intervale, iei o pauză mai lungă, de 15 până la 30 de minute. Cifrele sunt un punct de pornire, nu o regulă obligatorie.",
				en: "You pick a task, set a timer for 25 minutes, work only on it until it rings, then take a 5-minute break, preferably away from screens. After four intervals you take a longer break of 15 to 30 minutes. The numbers are a starting point, not a mandatory rule.",
			},
		},
		{
			q: {
				ro: "Trebuie să fie exact 25 de minute?",
				en: "Does it have to be exactly 25 minutes?",
			},
			a: {
				ro: "Nu. Cifra 25 pare să vină din încercările creatorului metodei, nu dintr-un studiu care ar arăta că e potrivită pentru toți. Încearcă 15, 25, 35 sau 45 de minute, câte trei zile fiecare, și păstrează intervalul care e ușor de pornit și nu te enervează când sună.",
				en: "No. The number 25 seems to come from the method creator’s own trials, not from a study showing it suits everyone. Try 15, 25, 35 or 45 minutes, three days each, and keep the interval that is easy to start and does not annoy you when it rings.",
			},
		},
		{
			q: {
				ro: "Ce fac în pauza de 5 minute?",
				en: "What should I do in the 5-minute break?",
			},
			a: {
				ro: "Ridică-te, mișcă-te, privește departe, bea apă, respiră lent de câteva ori. Evită telefonul și mailul, pentru că o defilare pe ecran nu odihnește mintea. O analiză din 2022 a găsit că micropauzele aduc un mic plus de energie și o mică scădere a oboselii.",
				en: "Stand up, move, look far away, drink water, breathe slowly a few times. Avoid the phone and your email, because scrolling a screen does not rest the mind. A 2022 review found that micro-breaks bring a small gain in energy and a small drop in fatigue.",
			},
		},
		{
			q: {
				ro: "Pot ignora cronometrul dacă sunt într-o stare bună de concentrare?",
				en: "Can I ignore the timer if I am deeply focused?",
			},
			a: {
				ro: "Da, uneori. Dacă ești în mijlocul unui gând bun, lasă cronometrul să sune și continuă până la un loc de oprire firesc, apoi fă pauza. Doar nu face din asta regulă zilnică, altfel cronometrul își pierde rostul. Scopul este atenția, nu respectarea cronometrului.",
				en: "Sometimes, yes. If you are in the middle of a good thought, let the timer ring and carry on to a natural stopping point, then take your break. Just do not make it a daily rule, or the timer loses its purpose. The aim is attention, not obeying the timer.",
			},
		},
		{
			q: {
				ro: "Pot folosi muzică sau un sunet cu tehnica Pomodoro?",
				en: "Can I use music or a sound with the Pomodoro technique?",
			},
			a: {
				ro: "Da, ca semnal de început: aceeași piesă sau același sunet constant, fără versuri, la volum mic, doar pentru lucru. Pentru citit și scris, tăcerea poate fi mai sigură, fiindcă muzica cu versuri a deranjat citirea într-un studiu din 2023. Dovezile sunt amestecate, deci încearcă și observă.",
				en: "Yes, as a start cue: the same track or the same steady sound, without lyrics, at low volume, only for work. For reading and writing, silence may be safer, since music with lyrics disturbed reading in a 2023 study. The evidence is mixed, so try and observe.",
			},
		},
	],
	related: [
		"deep-work-cum-incepi-pas-cu-pas",
		"pauza-de-10-minute-la-birou",
		"sunete-pentru-studiu-si-examene",
	],
};
