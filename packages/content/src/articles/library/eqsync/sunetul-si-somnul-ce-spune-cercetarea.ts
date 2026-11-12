import type { ArticleInput } from "../../../schema";

export const article: ArticleInput = {
	slug: "sunetul-si-somnul-ce-spune-cercetarea",
	brand: "eqsync",
	topic: "sunet-si-creier",
	backlogNo: null,
	status: "draft",
	kind: "health",
	aiDrafted: true,
	draftedAt: "2026-11-12",
	author: null,
	reviewer: null,
	title: {
		ro: "Sunetul și somnul: ce spune cercetarea despre sunete pentru adormit",
		en: "Sound and sleep: what research says about sounds for sleeping",
	},
	standfirst: {
		ro: "Cel mai bine susținută este muzica liniștitoare, cu efect mic spre moderat asupra somnului resimțit. Zgomotul continuu are dovezi slabe, iar sunetele binaurale au studii foarte mici. Mulți oameni se simt bine cu ele, dar nu sunt tratament. Poți face singur un test de două săptămâni.",
		en: "Soothing music has the best support, with a small to moderate effect on how well people feel they slept. Steady noise has weak evidence, and binaural audio has very small studies. Many people feel at ease with them, but none is a treatment. You can run your own two-week test.",
	},
	body: [
		{
			type: "p",
			text: {
				ro: "Pe scurt: muzica liniștitoare are cele mai solide dovezi dintre sunetele pentru somn, dar dovezile spun că ajută la somnul pe care îl simți, nu neapărat la cel pe care îl măsoară aparatele. Zgomotul continuu, precum zgomotul alb sau roz, are dovezi slabe și amestecate. Sunetele binaurale au studii mici, prea puține ca să tragem o concluzie. Restul articolului este harta acestor trei zone, scrisă fără entuziasm și fără dispreț.",
				en: "In short: soothing music has the firmest evidence of any sound used for sleep, but the evidence says it helps the sleep you feel you had, not necessarily the sleep that instruments record. Steady noise, such as white or pink noise, has weak and mixed evidence. Binaural audio has small studies, too few to draw a conclusion. The rest of this article is a map of those three zones, written without hype and without scorn.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce spune cercetarea despre sunete pentru somn, pe scurt?",
				en: "What does research say about sounds for sleep, in brief?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Dacă ești sceptic, ai dreptate să fii. Domeniul este plin de aplicații cu promisiuni mari și de studii cu eșantioane mici. Așa că am împărțit ce am găsit în trei coșuri, după cât de bine stau dovezile.",
				en: "If you are sceptical, you are right to be. The field is full of apps with big promises and studies with small samples. So we sorted what we found into three baskets, by how well the evidence stands.",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "Promițător: muzica ascultată înainte de somn. O analiză Cochrane din 2022 a găsit că poate îmbunătăți calitatea somnului raportată de adulții cu simptome de insomnie, cu încredere moderată în rezultat.",
					en: "Promising: music listened to before sleep. A 2022 Cochrane review found it may improve the sleep quality reported by adults with insomnia symptoms, with moderate certainty in the result.",
				},
				{
					ro: "Modest sau neclar: zgomotul continuu, alb sau roz. Două analize sistematice spun, cu cuvinte diferite, că dovezile sunt slabe și că studiile nu se potrivesc între ele.",
					en: "Modest or unclear: steady noise, white or pink. Two systematic reviews say, in different words, that the evidence is weak and that the studies do not line up with each other.",
				},
				{
					ro: "Nedovedit încă: sunetele binaurale pentru somn. Există studii mici, de câteva zeci de oameni cel mult, care nu pot susține nicio concluzie sigură.",
					en: "Not yet shown: binaural beats for sleep. There are small studies, a few dozen people at most, which cannot support a firm conclusion.",
				},
			],
		},
		{
			type: "h2",
			text: {
				ro: "De ce ar putea un sunet constant să acopere zgomotele din jur?",
				en: "Why might a steady sound mask the noises around you?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Explicația obișnuită ține de acustica simplă, nu de vreun studiu anume. Creierul adormit rămâne atent la schimbări: o ușă care se trântește, un telefon care vibrează, un vecin care urcă scările. Ceea ce te trezește rar este nivelul zgomotului. De cele mai multe ori este contrastul dintre liniștea de dinainte și sunetul brusc.",
				en: "The usual explanation comes from simple acoustics, not from any one study. A sleeping brain stays alert to change: a door that slams, a phone that buzzes, a neighbour on the stairs. What wakes you is rarely the level of the noise. More often it is the contrast between the quiet before and the sudden sound.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Un sunet de fundal constant micșorează acel contrast. Mormăitul unui frigider face mai greu de observat un zgomot mic, exact cum o lumină de veghe face mai blândă o ușă deschisă în noapte. Asta este ideea de „mascare”. Ține minte însă că este un mecanism plauzibil, iar studiile despre somn măsoară altceva: dacă oamenii adorm mai repede sau se trezesc mai rar.",
				en: "A constant background sound shrinks that contrast. The hum of a fridge makes a small noise harder to notice, much as a night light softens an open door in the dark. That is the idea of “masking”. Remember, though, that this is a plausible mechanism, while sleep studies measure something else: whether people fall asleep sooner or wake less often.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce știm despre muzică și somn, cu tot cu limite?",
				en: "What do we know about music and sleep, limits included?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Analiza Cochrane din 2022 a strâns 13 studii cu 1.007 adulți în total. Participanții ascultau muzică înregistrată în fiecare zi, câte 25 până la 60 de minute, între 3 zile și 3 luni, și erau comparați cu oameni care nu ascultau nimic. Calitatea somnului, raportată de ei înșiși, a fost mai bună în grupul cu muzică. Autorii nu au raportat efecte adverse.",
				en: "The 2022 Cochrane review gathered 13 studies with 1,007 adults in all. Participants listened to recorded music every day, 25 to 60 minutes at a time, for anywhere from 3 days to 3 months, and were compared with people who listened to nothing. Sleep quality, as the participants rated it, was better in the music groups. The authors reported no adverse effects.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Limitele sunt la fel de importante. Oamenii nu pot să nu știe dacă ascultă muzică, deci studiile nu pot fi „orb” în sens strict, iar autorii consideră acest risc ridicat în toate cele 13. Gravitatea insomniei nu s-a deosebit clar între grupuri. Iar în cele trei studii care au măsurat somnul cu aparate, nu s-a văzut o îmbunătățire. O recenzie publicată în 2025 în revista Sleep ajunge la o concluzie asemănătoare: relaxarea cu muzică are cel mai bun sprijin dintre sunetele pentru somn.",
				en: "The limits matter just as much. People cannot be unaware that they are listening to music, so these studies cannot be blind in the strict sense, and the authors rate that risk as high in all 13. Insomnia severity did not differ clearly between groups. And in the three studies that measured sleep with instruments, no improvement was seen. A perspective published in the journal Sleep in 2025 reaches a similar view: music-based relaxation has the best support of the sounds used for sleep.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Funcționează zgomotul alb sau roz pentru somn?",
				en: "Do white or pink noise work for sleep?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Aici dovezile sunt cele mai încurcate. O analiză din 2021, în Sleep Medicine Reviews, a evaluat 38 de studii despre zgomot continuu și somn. Rezultatele mergeau de la „ajută” la „strică somnul”, iar autorii au considerat dovezile că zgomotul îmbunătățește somnul de calitate foarte scăzută. Ei au cerut mai multă cercetare înainte ca zgomotul continuu să fie recomandat ca ajutor pentru somn, și au notat că ar putea afecta și auzul.",
				en: "Here the evidence is at its most tangled. A 2021 review in Sleep Medicine Reviews assessed 38 studies of continuous noise and sleep. Results ranged from “helps” to “disrupts sleep”, and the authors rated the evidence that noise improves sleep as very low quality. They asked for more research before continuous noise is promoted as a sleep aid, and noted that it could also harm hearing.",
			},
		},
		{
			type: "p",
			text: {
				ro: "O altă analiză, din 2022, a căutat în 34 de studii cu 1.103 participanți. Concluzia a fost că nu există dovezi puternice în favoarea stimulării auditive pentru somn, deși nu s-au raportat efecte adverse pe termen scurt. Cu alte cuvinte: nu avem motive să interzicem nimănui zgomotul de fond, dar nici temei să promitem ceva.",
				en: "Another review, from 2022, looked at 34 studies with 1,103 participants. It concluded that there is no strong evidence for auditory stimulation for sleep, though no adverse effects were reported in the short term. In other words: we have no reason to forbid anyone a background hum, but no basis to promise anything either.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Dar sunetele binaurale? Ce se știe și ce nu",
				en: "And binaural beats? What is known and what is not",
			},
		},
		{
			type: "p",
			text: {
				ro: "Sunetele binaurale înseamnă că fiecare ureche primește un ton ușor diferit, iar creierul recompune diferența. Pentru asta ai nevoie de căști. Întrebarea de cercetare are două părți: schimbă ele undele creierului și schimbă somnul?",
				en: "Binaural beats mean that each ear receives a slightly different tone, and the brain puts the difference back together. For that you need headphones. The research question has two parts: do they change brain waves, and do they change sleep?",
			},
		},
		{
			type: "p",
			text: {
				ro: "La prima parte, o analiză din 2023 a adunat 14 studii despre efectul asupra undelor cerebrale. Cinci au susținut ideea, opt au contrazis-o, unul a dat rezultat mixt. La a doua, studiile despre somn sunt de-a dreptul mici: unul a urmărit 12 adulți în somn de după-amiază, altul zece oameni peste două nopți, altul cincisprezece. Autorii lor spun singuri că mărimea eșantionului este limita principală. Sunt pași de început, nu o dovadă.",
				en: "On the first part, a 2023 review collected 14 studies of the effect on brain waves. Five supported the idea, eight contradicted it, and one gave mixed results. On the second, the sleep studies are genuinely small: one followed 12 adults in afternoon naps, another ten people across two nights, another fifteen. Their own authors name sample size as the main limit. These are first steps, not proof.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "De ce contează mărimea unui studiu?",
				en: "Why does the size of a study matter?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Gândește-te la un sondaj făcut printre zece prieteni. Dacă șapte spun că dorm mai bine, nu știi dacă e sunetul, săptămâna mai liniștită sau simplul fapt că au fost întrebați. Cu zece oameni, o singură persoană neobișnuită poate mișca întreg rezultatul. De aceea, studiile mici sunt bune pentru a formula întrebări, nu pentru a le închide.",
				en: "Think of a poll of ten friends. If seven say they sleep better, you cannot tell whether it is the sound, a calmer week, or just the fact of being asked. With ten people, one unusual person can move the whole result. That is why small studies are good for forming questions, not for closing them.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Mai contează cu cine se compară grupul. Multe studii despre sunet compară cu „nimic”, iar participanții știu ce aud. Așteptarea de a dormi mai bine poate face parte din efect. Nu e o rușine: așteptarea este reală și poate fi folositoare. Dar trebuie numită.",
				en: "It also matters what the group is compared with. Many sound studies compare with “nothing”, and participants know what they are hearing. The expectation of sleeping better may be part of the effect. There is no shame in that: expectation is real and can be useful. But it has to be named.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce poți aștepta, realist, de la un sunet de seară?",
				en: "What can you realistically expect from an evening sound?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Să luăm o seară obișnuită. Este 23:10, ai stins lumina, iar mintea reia discuția de la serviciu. Un sunet blând nu o va opri. Ce poate face este să-i dea minții un loc unde să se așeze: ceva lent și previzibil, în loc de liniștea în care fiecare gând se aude tare. Pentru unii oameni, exact asta este diferența.",
				en: "Take an ordinary evening. It is 23:10, the light is off, and your mind is replaying the conversation from work. A gentle sound will not stop it. What it can do is give the mind somewhere to settle: something slow and predictable, instead of a silence in which every thought is loud. For some people, that is exactly the difference.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pentru alții nu face nicio diferență, și e în regulă. Somnul depinde de multe lucruri deodată: ora de culcare, cafeaua, lumina ecranelor, grijile, temperatura camerei. Serviciul de sănătate britanic recomandă, înaintea oricărui alt truc, ore regulate de culcare și trezire, o oră de relaxare înainte de somn și o cameră liniștită. Sunetul se așază lângă aceste obiceiuri, nu în locul lor.",
				en: "For others it makes no difference, and that is fine. Sleep depends on many things at once: bedtime, coffee, screen light, worries, the temperature of the room. The NHS recommends, before any other trick, regular bedtimes and wake-up times, a wind-down hour before sleep and a quiet room. Sound sits beside these habits, not in place of them.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Mai e un lucru de spus cinstit. Dacă un sunet te face să stai cu ochii pe telefon, să schimbi piesa de zece ori sau să aștepți nerăbdător să „funcționeze”, el lucrează împotriva ta. Efortul de a adormi este adesea ceea ce ține somnul departe. Un sunet bun este unul pe care îl poți uita.",
				en: "One more honest thing. If a sound has you watching your phone, changing the track ten times, or waiting impatiently for it to “work”, it is working against you. The effort to fall asleep is often what keeps sleep away. A good sound is one you can forget about.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Un instrument de wellness, nu un dispozitiv medical",
				en: "A wellness tool, not a medical device",
			},
		},
		{
			type: "p",
			text: {
				ro: "Sunetele pentru somn, ale noastre sau ale altora, sunt un instrument de wellness. Nu sunt dispozitiv medical, nu tratează insomnia și nu înlocuiesc consultul. Serviciul de sănătate din Marea Britanie recomandă să mergi la medic dacă ai probleme cu somnul de luni de zile sau dacă insomnia îți îngreunează ziua. Atunci sunetul poate rămâne un obicei plăcut, dar nu mai este singurul răspuns.",
				en: "Sounds for sleep, ours or anyone else’s, are a wellness tool. They are not a medical device, they do not treat insomnia, and they do not replace a consultation. The NHS advises seeing a GP if you have had trouble sleeping for months, or if insomnia makes daily life hard to cope with. Then sound can stay a pleasant habit, but it is no longer the only answer.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Dacă încerci audio binaural, folosești căști, iar dacă ai epilepsie sau o afecțiune convulsivă, nu îl folosești fără acordul medicului. La orice sunet, volumul rămâne mic: Institutul american pentru surditate (NIDCD) spune că sunetele de până la 70 dBA sunt puțin probabil să dăuneze auzului, în timp ce expunerea lungă sau repetată la 85 dBA sau mai mult poate cauza pierderea auzului.",
				en: "If you try binaural audio, you use headphones, and if you have epilepsy or a seizure disorder, you do not use it without your doctor’s agreement. With any sound, keep the volume low: the US National Institute on Deafness (NIDCD) says sounds at or below 70 dBA are unlikely to damage hearing, while long or repeated exposure to 85 dBA or more can cause hearing loss.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum îți faci propriul test de două săptămâni?",
				en: "How do you run your own two-week test?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Cea mai cinstită cale prin tot acest teren nesigur este să te uiți la propriul somn. Nu ai nevoie de aplicații. Un caiet și un pix lângă pat ajung.",
				en: "The most honest way through this uncertain ground is to look at your own sleep. You need no apps. A notebook and a pen by the bed are enough.",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "Nopțile 1 până la 7: dormi ca de obicei, fără sunet nou. Dimineața, notează în două rânduri cât de odihnit te simți și cât ți-a luat să adormi, cam cât ți se pare.",
					en: "Nights 1 to 7: sleep as usual, with no new sound. In the morning, note in two lines how rested you feel and roughly how long it took to fall asleep.",
				},
				{
					ro: "Nopțile 8 până la 14: adaugi un singur sunet, același în fiecare seară, la volum mic, cu temporizator. Notezi aceleași două lucruri.",
					en: "Nights 8 to 14: add one sound, the same every evening, at low volume, on a timer. Note the same two things.",
				},
				{
					ro: "A 15-a dimineață: citești ambele pagini. Dacă diferența e clară pentru tine, păstrezi sunetul. Dacă nu, păstrezi liniștea, fără regrete.",
					en: "Morning 15: read both pages. If the difference is clear to you, keep the sound. If not, keep the silence, with no regrets.",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "Schimbă un singur lucru o dată. Dacă începi și sunetul, și o oră nouă de culcare, și renunți la cafea, nu vei ști ce a contat. Un test de două săptămâni nu este un studiu, dar este despre tine, iar asta este exact ce nu poate oferi niciun studiu mare.",
				en: "Change one thing at a time. If you start the sound, a new bedtime and give up coffee all at once, you will not know which one mattered. A two-week test is not a study, but it is about you, which is exactly what no large study can offer.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pasul următor: alege în seara asta un singur sunet, setează un temporizator și începe a doua săptămână a testului, după ce ai notat prima.",
				en: "Next step: tonight, choose one sound, set a timer, and start the second week of your test once you have written down the first.",
			},
		},
	],
	sources: [
		{
			label: {
				ro: "Jespersen et al., Cochrane 2022: Listening to music for insomnia in adults",
				en: "Jespersen et al., Cochrane 2022: Listening to music for insomnia in adults",
			},
			href: "https://pubmed.ncbi.nlm.nih.gov/36000763/",
		},
		{
			label: {
				ro: "Riedy et al., 2021: Noise as a sleep aid, o analiză sistematică",
				en: "Riedy et al., 2021: Noise as a sleep aid, a systematic review",
			},
			href: "https://pubmed.ncbi.nlm.nih.gov/33007706/",
		},
		{
			label: {
				ro: "Capezuti et al., 2022: Systematic review, auditory stimulation and sleep",
				en: "Capezuti et al., 2022: Systematic review, auditory stimulation and sleep",
			},
			href: "https://pubmed.ncbi.nlm.nih.gov/34964434/",
		},
		{
			label: {
				ro: "Ingendoh et al., 2023, PLoS ONE: Binaural beats to entrain the brain?",
				en: "Ingendoh et al., 2023, PLoS ONE: Binaural beats to entrain the brain?",
			},
			href: "https://doi.org/10.1371/journal.pone.0286023",
		},
		{
			label: {
				ro: "Vazzaz et al., 2025, Sleep: Between sound and sleep",
				en: "Vazzaz et al., 2025, Sleep: Between sound and sleep",
			},
			href: "https://doi.org/10.1093/sleep/zsaf275",
		},
		{
			label: { ro: "NHS: Insomnia", en: "NHS: Insomnia" },
			href: "https://www.nhs.uk/conditions/insomnia/",
		},
		{
			label: {
				ro: "NIDCD: Noise-induced hearing loss",
				en: "NIDCD: Noise-induced hearing loss",
			},
			href: "https://www.nidcd.nih.gov/health/noise-induced-hearing-loss",
		},
	],
	provenance: [
		"https://pubmed.ncbi.nlm.nih.gov/36000763/ (via Europe PMC record: 13 studies, 1,007 adults, 25 to 60 minutes daily, 3 days to 3 months, moderate certainty for sleep quality, objective measures in 3 studies no improvement, no adverse events)",
		"https://pubmed.ncbi.nlm.nih.gov/33007706/ (via Europe PMC record: 38 studies, very low GRADE certainty, authors call for more research, may harm sleep and hearing)",
		"https://pubmed.ncbi.nlm.nih.gov/34964434/ (34 studies, 1,103 participants, no strong evidence, no short-term adverse effects)",
		"https://doi.org/10.1371/journal.pone.0286023 (14 studies of EEG entrainment: 5 supported, 8 contradicted, 1 mixed)",
		"Small binaural sleep studies via Europe PMC: PMID 39478090 (12 adults, naps), PMID 38629490 (10 adults, 2 nights), PMID 41840327 (15 adults); not cited as links, quoted only for sample size",
		"https://doi.org/10.1093/sleep/zsaf275 (Europe PMC PMC12597667: music-based relaxation best supported, ambient sounds inconclusive)",
		"https://www.nhs.uk/conditions/insomnia/ (see a GP when trouble sleeping lasts months or affects daily life)",
		"https://www.nidcd.nih.gov/health/noise-induced-hearing-loss (70 dBA and 85 dBA thresholds)",
		"The masking explanation is general acoustics, not taken from one study; flagged as such in the text",
		"packages/design/brand-books/2-eq-sync.md; apps/eqsync-web/messages/en.json (method_line, faq_4_a, faq_5_a)",
	],
	seo: {
		title: {
			ro: "Sunete pentru somn: ce spune cercetarea, fără exagerări",
			en: "Sounds for sleep research: what the evidence really says",
		},
		description: {
			ro: "Muzică, zgomot alb sau roz, sunete binaurale: ce susțin studiile despre somn, cât de mici sunt ele și cum îți faci propriul test de două săptămâni.",
			en: "Music, white or pink noise, binaural beats: what studies say about sleep, how small they are, and how to run your own two-week test at home.",
		},
		keywords: {
			ro: [
				"sunete pentru somn",
				"cercetare sunet și somn",
				"muzică pentru somn studii",
				"zgomot alb somn dovezi",
				"sunete binaurale somn studii",
				"cum adormi cu sunete",
			],
			en: [
				"sounds for sleep research",
				"does music help sleep",
				"white noise sleep evidence",
				"binaural beats sleep studies",
				"sleep sounds evidence",
				"how to sleep with sound",
			],
		},
	},
	faq: [
		{
			q: {
				ro: "Ajută muzica la somn conform cercetării?",
				en: "Does music help sleep according to research?",
			},
			a: {
				ro: "O analiză Cochrane din 2022, cu 13 studii și 1.007 adulți, a găsit că muzica ascultată zilnic poate îmbunătăți calitatea somnului pe care o raportează oamenii cu simptome de insomnie. Măsurătorile făcute cu aparate nu au arătat o îmbunătățire, iar participanții știau că ascultă muzică. Este cea mai bună dovadă dintre sunetele pentru somn, dar nu este un tratament.",
				en: "A 2022 Cochrane review of 13 studies and 1,007 adults found that music listened to daily may improve the sleep quality reported by people with insomnia symptoms. Measurements made with instruments did not show an improvement, and participants knew they were listening to music. It is the best evidence of any sleep sound, but it is not a treatment.",
			},
		},
		{
			q: {
				ro: "Zgomotul alb te ajută să dormi?",
				en: "Does white noise help you sleep?",
			},
			a: {
				ro: "Nu se poate spune cu siguranță. O analiză din 2021 a evaluat 38 de studii și a considerat dovezile de calitate foarte scăzută: unele studii arată un somn mai bun, altele unul mai tulburat. Mulți oameni îl folosesc pentru că acoperă zgomotele din jur și li se pare liniștitor. Dacă ție ți se pare asta, îl poți păstra la volum mic.",
				en: "It cannot be said with certainty. A 2021 review assessed 38 studies and rated the evidence very low quality: some studies show better sleep, others more disturbed sleep. Many people use it because it covers the noises around them and feels soothing. If that is true for you, you can keep it at a low volume.",
			},
		},
		{
			q: {
				ro: "Sunt dovedite sunetele binaurale pentru somn?",
				en: "Are binaural beats proven for sleep?",
			},
			a: {
				ro: "Nu. Studiile despre somn au câțiva zeci de participanți cel mult, de exemplu 10, 12 sau 15 adulți, iar autorii înșiși cer cercetări mai mari. O analiză din 2023 a găsit rezultate împărțite chiar și la întrebarea dacă ele schimbă undele creierului. Ascultarea se face cu căști și nu este recomandată fără acordul medicului în epilepsie.",
				en: "No. The sleep studies have a few dozen participants at most, for example 10, 12 or 15 adults, and the authors themselves ask for larger research. A 2023 review found split results even on whether they change brain waves. You listen with headphones, and it is not advised without a doctor’s agreement in epilepsy.",
			},
		},
		{
			q: {
				ro: "De ce contează cât de mare este un studiu?",
				en: "Why does the size of a study matter?",
			},
			a: {
				ro: "Într-un studiu cu zece oameni, o singură persoană neobișnuită poate mișca rezultatul, iar întâmplarea cântărește mult. Eșantioanele mari reduc acest risc. De aceea, studiile mici sunt utile pentru a formula întrebări, dar nu pentru a promite un rezultat. Contează și cu ce este comparat grupul, și dacă participanții știau ce ascultă.",
				en: "In a study of ten people, one unusual person can move the result, and chance weighs heavily. Large samples reduce that risk. That is why small studies are useful for forming questions, but not for promising an outcome. It also matters what the group is compared with, and whether participants knew what they were hearing.",
			},
		},
		{
			q: {
				ro: "Pot testa singur dacă un sunet mă ajută?",
				en: "Can I test whether a sound helps me?",
			},
			a: {
				ro: "Da, simplu. Notează timp de șapte nopți cum dormi, fără sunet nou. Apoi adaugă timp de alte șapte un singur sunet, același, la volum mic, cu temporizator, și notează aceleași lucruri. Nu este un studiu, dar spune ceva despre tine. Schimbă o singură variabilă o dată, altfel nu vei ști ce a contat.",
				en: "Yes, simply. For seven nights, note how you sleep with no new sound. Then for another seven add one sound, the same one, at low volume, on a timer, and note the same things. It is not a study, but it tells you something about you. Change one variable at a time, or you will not know what mattered.",
			},
		},
		{
			q: {
				ro: "Când să merg la medic pentru somn?",
				en: "When should I see a doctor about sleep?",
			},
			a: {
				ro: "Serviciul de sănătate din Marea Britanie (NHS) recomandă să mergi la medicul de familie dacă schimbarea obiceiurilor nu ajută, dacă ai probleme cu somnul de luni de zile sau dacă insomnia îți îngreunează viața de zi cu zi. Sunetele sunt un instrument de wellness și nu înlocuiesc consultul medical.",
				en: "The NHS advises seeing a GP if changing your habits has not helped, if you have had trouble sleeping for months, or if insomnia affects your daily life in a way that makes it hard to cope. Sounds are a wellness tool and do not replace medical advice.",
			},
		},
	],
	related: [
		"zgomot-alb-roz-brun-diferente",
		"binaural-beats-pentru-somn-cum-functioneaza",
		"muzica-pentru-adormit-ce-alegi",
	],
};
