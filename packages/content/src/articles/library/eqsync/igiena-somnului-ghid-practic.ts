import type { ArticleInput } from "../../../schema";

export const article: ArticleInput = {
	slug: "igiena-somnului-ghid-practic",
	brand: "eqsync",
	topic: "meditatie-si-relaxare",
	backlogNo: null,
	status: "draft",
	kind: "health",
	aiDrafted: true,
	draftedAt: "2026-11-12",
	author: null,
	reviewer: null,
	title: {
		ro: "Igiena somnului: ghid practic cu 10 obiceiuri care contează",
		en: "Sleep hygiene: a practical guide to the habits that matter",
	},
	standfirst: {
		ro: "Igiena somnului înseamnă obiceiurile și camera care îți pregătesc somnul: oră fixă de trezire, lumină ziua, întuneric noaptea, fără cafeină și alcool seara. Ajută, dar nu rezolvă singură insomnia de lungă durată. Mai jos, zece obiceiuri ordonate după efect și efort.",
		en: "Sleep hygiene means the habits and the room that prepare your sleep: a fixed wake time, light by day, dark by night, no caffeine or alcohol in the evening. It helps, but it does not fix long-lasting insomnia on its own. Below, ten habits ranked by effect and effort.",
	},
	body: [
		{
			type: "p",
			text: {
				ro: "Răspunsul scurt: igiena somnului este un set de obiceiuri de zi și de seară care fac somnul mai probabil. Cele mai solide sunt ora fixă de trezire, lumina din timpul zilei, fără cafeină și alcool cu ore înainte de culcare și un dormitor liniștit, întunecat și răcoros. Sunt un bun punct de plecare, dar dacă problemele ține de luni de zile, e momentul unui consult.",
				en: "The short answer: sleep hygiene is a set of daytime and evening habits that make sleep more likely. The most solid are a fixed wake time, daylight, no caffeine or alcohol for hours before bed, and a bedroom that is quiet, dark and cool. They are a good starting point, but if the trouble has lasted months, it is time for a consultation.",
			},
		},
		{
			type: "p",
			text: {
				ro: "E târziu, ai citit zece sfaturi despre somn și niciunul nu te-a făcut să dormi. Probabil te întrebi care dintre ele contează cu adevărat. Hai să le punem în ordine, cinstit: ce are dovezi, ce e sfat de bun-simț, ce e povestea bunicii.",
				en: "It is late, you have read ten sleep tips and none made you sleep. You probably wonder which ones truly matter. Let us put them in order, honestly: what has evidence, what is common sense, what is folklore.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce este igiena somnului și ce nu este?",
				en: "What is sleep hygiene, and what is it not?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Este tot ce poți controla în jurul somnului: ora, lumina, ce bei, ce mănânci, cum arată camera, cum îți închei ziua. Nu este un tratament pentru insomnie. O meta-analiză din 2025 a strâns 42 de studii randomizate pe 4.245 de adulți și a găsit că educația despre igiena somnului, singură, a adus o îmbunătățire a scorului de insomnie, dar a fost inferioară terapiei cognitiv-comportamentale pentru insomnie (CBT-I). Autorii notează și că majoritatea studiilor aveau un risc ridicat de erori de metodă.",
				en: "It is everything you can control around sleep: the hour, the light, what you drink, what you eat, how the room looks, how you close the day. It is not a treatment for insomnia. A 2025 meta-analysis gathered 42 randomised trials in 4,245 adults and found that sleep hygiene education alone brought an improvement in insomnia scores but was inferior to cognitive behavioural therapy for insomnia (CBT-I). The authors also note that most of the studies had a high risk of bias.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Traducere: igiena somnului merită făcută, dar nu o vindeca pe cea de lungă durată. Dacă după câteva săptămâni nu se schimbă nimic, nu ai greșit tu ceva, ci ai ajuns la punctul în care ajută un specialist.",
				en: "Translation: sleep hygiene is worth doing, but it will not cure the long-lasting kind. If nothing changes after a few weeks, you have not done something wrong, you have reached the point where a specialist helps.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Care sunt cele 10 obiceiuri, în ordinea efectului și a efortului?",
				en: "What are the 10 habits, ranked by effect and effort?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Clasamentul de mai jos e o judecată, nu o măsurătoare: am pus întâi ce are sprijin în studii și în ghidurile NHS și CDC și cere efort moderat, apoi ce e sfat uzual cu dovezi mai subțiri. Nu avem cifre de eficacitate pentru ele, și nu le promitem.",
				en: "The ranking below is a judgement, not a measurement: we put first what has support in studies and in NHS and CDC guidance and takes moderate effort, then what is common advice with thinner evidence. We have no efficacy figures for them and promise none.",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "1. Aceeași oră de trezire. NHS: trezește-te la aceeași oră în fiecare zi, fără somn prelungit după o noapte proastă. O trecere în revistă din 2025 a regularității somnului leagă orele neregulate de simptome depresive și anxioase, dar sunt studii observaționale. Efort mic, sprijin bun.",
					en: "1. The same wake time. NHS: get up at the same time every day, and do not sleep in after a poor night. A 2025 review of sleep regularity links irregular timing to depressive and anxiety symptoms, but these are observational studies. Low effort, good support.",
				},
				{
					ro: "2. Lumină ziua, întuneric noaptea. NIGMS: lumina și întunericul au cea mai mare influență asupra ritmului intern. Efort mic.",
					en: "2. Light by day, dark by night. NIGMS: light and dark have the biggest influence on the body’s rhythm. Low effort.",
				},
				{
					ro: "3. Cafeina oprită devreme. Un studiu cu o doză fixă a găsit efecte asupra somnului și când a fost luată cu 6 ore înainte de culcare. NHS: evită ceaiul și cafeaua cel puțin 6 ore înainte.",
					en: "3. Caffeine stopped early. One study with a fixed dose found effects on sleep even when taken 6 hours before bed. NHS: avoid tea and coffee for at least 6 hours before bed.",
				},
				{
					ro: "4. Alcoolul nu e un somnifer. O trecere în revistă a studiilor pe voluntari sănătoși arată că scurtează adormirea, dar crește întreruperile din a doua jumătate a nopții.",
					en: "4. Alcohol is not a sleeping aid. A review of studies in healthy volunteers shows it shortens falling asleep but increases disruption in the second half of the night.",
				},
				{
					ro: "5. Nicotina, mai ales seara. NHS include fumatul printre lucrurile de evitat cu cel puțin 6 ore înainte de somn.",
					en: "5. Nicotine, especially in the evening. The NHS lists smoking among the things to avoid for at least 6 hours before sleep.",
				},
				{
					ro: "6. Dormitor liniștit, întunecat, răcoros. NHS și CDC sunt de acord. Efort variabil, de la zero la o pereche de draperii.",
					en: "6. A quiet, dark, cool bedroom. The NHS and the CDC agree. Effort varies from none to a pair of curtains.",
				},
				{
					ro: "7. Oprește ecranele înainte de culcare. NHS spune cam o oră, CDC cel puțin 30 de minute.",
					en: "7. Switch off screens before bed. The NHS says about an hour, the CDC at least 30 minutes.",
				},
				{
					ro: "8. Mișcare regulată, dar nu aproape de culcare. NHS: nu face efort intens în ultimele 4 ore înainte de somn. O analiză în rețea din 2024 pe adulți sub vârsta senioratului a găsit antrenamentul cu greutăți ca fiind cea mai eficientă intervenție nefarmacologică pentru calitatea somnului, dar e o singură lucrare.",
					en: "8. Regular movement, but not close to bedtime. NHS: do not exercise within 4 hours of bedtime. A 2024 network meta-analysis in non-elderly adults found resistance training the most effective non-drug intervention for sleep quality, but it is a single paper.",
				},
				{
					ro: "9. Pat doar pentru somn. NHS: nu forța somnul; dacă ești treaz după vreo 20 de minute, ridică-te și revino când te simți somnoros. Nu am găsit un studiu care să izoleze regula, deci o tratăm ca sfat practic.",
					en: "9. Bed only for sleep. NHS: do not force sleep; if you are awake after around 20 minutes, get up and return when sleepy. We did not find a study that isolates this rule, so we treat it as practical advice.",
				},
				{
					ro: "10. O oră de relaxare și lista de mâine pe hârtie. NHS recomandă ambele. Efort mic, dovezi directe subțiri.",
					en: "10. An hour of winding down and tomorrow’s list on paper. The NHS recommends both. Low effort, thin direct evidence.",
				},
			],
		},
		{
			type: "h2",
			text: {
				ro: "De ce prima regulă este ora fixă de trezire?",
				en: "Why is the first rule a fixed wake time?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pentru că ora de trezire ancorează ceasul intern, iar ceasul intern hotărăște când ți se face somn seara. Ora de culcare e mai greu de controlat, fiindcă nu poți forța somnul. Ora de trezire poți s-o alegi.",
				en: "Because the wake time anchors the body clock, and the body clock decides when you feel sleepy in the evening. Bedtime is harder to control, since you cannot force sleep. The wake time you can choose.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Câteva rânduri despre weekend, fiindcă acolo cade regula la majoritatea oamenilor. Dacă sâmbătă te trezești la 11, duminică seara nu ți se face somn la 22. NHS spune să păstrezi rutina „și în zilele în care nu lucrezi”. Nu trebuie să fii rigid: o abatere mică, de o oră, e mai ușor de dus decât una de patru.",
				en: "A few lines about the weekend, because that is where the rule falls for most people. If on Saturday you wake at eleven, on Sunday evening you will not feel sleepy at ten. The NHS says to keep your routine “even on days when you’re not working”. You do not need to be rigid: a small drift of an hour is easier to carry than one of four.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Lumina de zi și întunericul de noapte: cum le pui în practică?",
				en: "Daylight and night darkness: how do you put them into practice?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Dimineața, ieși afară, chiar și pe vreme înnorată, o pauză de câteva minute cu ochii deschiși spre cer. Seara, coboară luminile treptat: stinge becurile de tavan, lasă veioze cu lumină caldă. Într-un studiu pe 116 voluntari, lumina obișnuită din cameră în cele opt ore dinaintea culcării a întârziat începutul melatoninei la aproape toți participanții față de lumina foarte slabă. Contează, deci, și becul din sufragerie, nu doar ecranul.",
				en: "In the morning, go outside, even on a cloudy day, for a few minutes with your eyes open to the sky. In the evening, lower the lights gradually: switch off ceiling bulbs, leave lamps with warm light. In a study of 116 volunteers, ordinary room light in the eight hours before bedtime delayed melatonin onset in nearly all participants compared with very dim light. So the living-room bulb counts, not just the screen.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cafeină, alcool, nicotină: ce să nu iei seara?",
				en: "Caffeine, alcohol, nicotine: what not to take in the evening?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Cele trei au aceeași regulă în ghidul NHS: evită-le cu cel puțin 6 ore înainte de culcare. În studiul lui Drake (2013), o doză fixă de cafeină luată cu 6 ore înainte de ora obișnuită de culcare a redus semnificativ somnul față de placebo. Revizuirea din 2017 despre cafea spune și că diferențele dintre oameni sunt mari, iar somnul persoanelor în vârstă poate fi mai sensibil.",
				en: "All three share one rule in NHS guidance: avoid them for at least 6 hours before bed. In Drake’s 2013 study, a fixed dose of caffeine taken 6 hours before habitual bedtime significantly reduced sleep compared with placebo. The 2017 review on coffee also says the differences between people are large, and that older adults’ sleep may be more sensitive.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Alcoolul e greu de recunoscut ca vinovat, fiindcă te adoarme. Dacă te trezești pe la 3–4 și ai băut seara, încearcă o săptămână fără și compară.",
				en: "Alcohol is hard to recognise as the culprit, because it puts you to sleep. If you wake around 3 or 4 and you drank in the evening, try a week without and compare.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Patul doar pentru somn: ce înseamnă în viața reală?",
				en: "Bed only for sleep: what does it mean in real life?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Înseamnă că patul nu devine birou, cinema sau sală de așteptare a grijilor. Dacă stai treaz în el și te frămânți, creierul învață că patul e locul frământării. De aceea NHS spune să te ridici după vreo 20 de minute, să stai undeva confortabil și să te întorci când te simți somnoros. Fără ceas la vedere și fără telefon. Aceasta nu e o regulă dură: e un mod blând de a-i reda patului sensul.",
				en: "It means the bed does not become an office, a cinema or a waiting room for worries. If you lie awake in it and fret, the brain learns that the bed is the place for fretting. That is why the NHS says to get up after around 20 minutes, sit somewhere comfortable and return when you feel sleepy. No clock in view and no phone. This is not a harsh rule: it is a gentle way of giving the bed its meaning back.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Mișcare și mese: ce oră e potrivită?",
				en: "Movement and meals: what time is right?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Mișcarea regulată în timpul zilei ajută somnul, spun și NHS, și CDC. Dacă exercițiul de seară te ține treaz, mută-l mai devreme; NHS dă un reper de cel puțin 4 ore înainte de somn. La mese, regula e la fel de simplă: mesele mari aproape de culcare pot face adormirea mai grea. O cină mai devreme și mai ușoară, un măr sau o băutură caldă fără cafeină dacă ți-e foame.",
				en: "Regular movement during the day helps sleep, say both the NHS and the CDC. If evening exercise keeps you up, move it earlier; the NHS gives a marker of at least 4 hours before sleep. For meals the rule is just as simple: large meals close to bedtime may make falling asleep harder. An earlier, lighter dinner, an apple or a warm caffeine-free drink if you are hungry.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Când igiena somnului nu mai ajunge",
				en: "When hygiene alone is not enough",
			},
		},
		{
			type: "p",
			text: {
				ro: "NHS spune să mergi la medicul de familie dacă schimbarea obiceiurilor nu a ajutat, dacă ai probleme de somn de luni de zile sau dacă îți e greu să faci față vieții de zi cu zi. Mergi și mai repede dacă ai sforăit puternic cu pauze de respirație, gâfâit în somn sau o nevoie puternică de a mișca picioarele noaptea: sunt semne după care NHS trimite la consult. Multe medicamente pot da insomnie; nu le opri singur, vorbește cu medicul.",
				en: "The NHS says to see your GP if changing habits has not helped, if you have had trouble sleeping for months, or if it is hard to cope with daily life. Go sooner if you have loud snoring with breathing pauses, gasping in sleep or a strong urge to move your legs at night: these are signs after which the NHS sends you to a consultation. Many medicines can cause insomnia; do not stop them yourself, talk to your doctor.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Lista de o pagină: bifează ce faci deja",
				en: "The one-page checklist: tick what you already do",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "Mă trezesc cam la aceeași oră, inclusiv sâmbăta și duminica.",
					en: "I wake at about the same time, weekends included.",
				},
				{
					ro: "Dimineața primesc lumină de afară, măcar câteva minute.",
					en: "In the morning I get outdoor light, even a few minutes.",
				},
				{
					ro: "Nu beau cafea sau ceai în ultimele ore înainte de culcare, și mă gândesc la cola și ciocolată.",
					en: "I take no coffee or tea in the last hours before bed, and I think of cola and chocolate too.",
				},
				{
					ro: "Seara nu beau alcool ca să adorm și nu fumez înainte de somn.",
					en: "In the evening I do not drink alcohol to fall asleep and do not smoke before sleep.",
				},
				{
					ro: "Cina e mai devreme și mai ușoară, iar efortul intens nu cade aproape de culcare.",
					en: "Dinner is earlier and lighter, and intense exercise does not fall close to bedtime.",
				},
				{
					ro: "Dormitorul e liniștit, întunecat și răcoros, iar ceasul nu e la vedere.",
					en: "The bedroom is quiet, dark and cool, and the clock is out of view.",
				},
				{
					ro: "Telefonul se încarcă în afara patului, cu o oră fixă de oprire a ecranului.",
					en: "The phone charges outside the bed, with a fixed screen cut-off.",
				},
				{
					ro: "Dacă sunt treaz după vreo 20 de minute, mă ridic și revin când mi-e somn.",
					en: "If I am awake after around 20 minutes, I get up and return when sleepy.",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "Aceasta nu este o diagnosticare. Un sunet de seară nu tratează nimic: EQ-SYNC este un instrument de bunăstare, nu un dispozitiv medical. Sesiunile binaurale se ascultă numai cu căști, iar persoanele cu epilepsie sau tulburări convulsive nu ar trebui să le asculte fără acordul medicului. Pasul următor: alege dintre cele zece un singur obicei, ora fixă de trezire, și începe programul gratuit EQ-SYNC, 21 de zile, o sesiune pe seară.",
				en: "This is not a diagnosis. An evening sound treats nothing: EQ-SYNC is a wellness tool, not a medical device. Binaural sessions are for headphones only, and people with epilepsy or seizure disorders should not listen without their doctor’s agreement. Your next step: from the ten, choose one habit, the fixed wake time, and start the free EQ-SYNC programme, 21 days, one session an evening.",
			},
		},
	],
	sources: [
		{
			label: {
				ro: "NHS: insomnia (sfaturi, când mergi la medic, trezirile nocturne)",
				en: "NHS: insomnia (self-help, when to see a GP, night waking)",
			},
			href: "https://www.nhs.uk/conditions/insomnia/",
		},
		{
			label: {
				ro: "NHS Every Mind Matters: cum adormi mai repede și dormi mai bine",
				en: "NHS Every Mind Matters: how to fall asleep faster and sleep better",
			},
			href: "https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/how-to-fall-asleep-faster-and-sleep-better/",
		},
		{
			label: {
				ro: "CDC: despre somn (igiena somnului)",
				en: "CDC: about sleep (sleep hygiene)",
			},
			href: "https://www.cdc.gov/sleep/about/index.html",
		},
		{
			label: {
				ro: "Educația despre igiena somnului pentru insomnie: trecere în revistă și meta-analiză, 2025 (PubMed)",
				en: "Effects of sleep hygiene education for insomnia: systematic review and meta-analysis, 2025 (PubMed)",
			},
			href: "https://pubmed.ncbi.nlm.nih.gov/40449065/",
		},
		{
			label: {
				ro: "Regularitatea somnului ca parte a igienei somnului: trecere în revistă, 2025 (PubMed)",
				en: "Sleep regularity as an important component of sleep hygiene: a systematic review, 2025 (PubMed)",
			},
			href: "https://pubmed.ncbi.nlm.nih.gov/41259946/",
		},
		{
			label: {
				ro: "Drake și colab. 2013: cafeina luată cu 0, 3 sau 6 ore înainte de culcare (PubMed)",
				en: "Drake et al. 2013: Caffeine effects on sleep taken 0, 3, or 6 hours before going to bed (PubMed)",
			},
			href: "https://pubmed.ncbi.nlm.nih.gov/24235903/",
		},
		{
			label: {
				ro: "Ebrahim și colab. 2013: alcoolul și somnul I (PubMed)",
				en: "Ebrahim et al. 2013: Alcohol and sleep I, effects on normal sleep (PubMed)",
			},
			href: "https://pubmed.ncbi.nlm.nih.gov/23347102/",
		},
		{
			label: {
				ro: "Gooley și colab. 2011: lumina din cameră înainte de culcare și melatonina (PubMed)",
				en: "Gooley et al. 2011: Room light before bedtime and melatonin (PubMed)",
			},
			href: "https://pubmed.ncbi.nlm.nih.gov/21193540/",
		},
	],
	provenance: [
		"https://www.nhs.uk/conditions/insomnia/ (same wake time, no sleeping in; avoid caffeine/alcohol/nicotine 6 h; no exercise within 4 h; large late meals; see a GP; many medicines cause insomnia)",
		"https://www.nhs.uk/every-mind-matters/mental-wellbeing-tips/how-to-fall-asleep-faster-and-sleep-better/ (routine even on non-working days; screens an hour; get up after around 20 minutes; worry list; quiet dark cool room)",
		"https://www.cdc.gov/sleep/about/index.html (same time every day; quiet, cool; devices off at least 30 minutes; no large meals/alcohol; no caffeine afternoon/evening; exercise)",
		"https://pubmed.ncbi.nlm.nih.gov/40449065/ (42 RCTs, 4,245 adults; SHE alone improved ISI but inferior to CBT-I; 85.71% high risk of bias)",
		"https://pubmed.ncbi.nlm.nih.gov/41259946/ (sleep regularity: observational association with depression, anxiety symptoms; no percentages quoted)",
		"https://pubmed.ncbi.nlm.nih.gov/24235903/ (400 mg caffeine at 0, 3, 6 h before bed; significant effects incl. at 6 h)",
		"https://pubmed.ncbi.nlm.nih.gov/26899133/ (caffeine: individual differences; older adults may be more sensitive)",
		"https://pubmed.ncbi.nlm.nih.gov/23347102/ (alcohol: shorter latency, more disruption in second half)",
		"https://pubmed.ncbi.nlm.nih.gov/21193540/ (116 volunteers; room light vs dim in 8 h before bed delayed melatonin onset in 99.0%)",
		"https://pubmed.ncbi.nlm.nih.gov/38837997/ (network meta-analysis non-elderly; resistance training most effective)",
		"http://www.nigms.nih.gov/education/fact-sheets/Pages/circadian-rhythms (light and dark biggest influence on rhythms)",
		"docs/brands/writing-voice.md (narrator, claim rules)",
		"packages/design/brand-books/2-eq-sync.md (voice, headphones)",
	],
	seo: {
		title: {
			ro: "Igiena somnului: 10 obiceiuri care contează, în ordine",
			en: "Sleep hygiene: 10 habits that matter, in order",
		},
		description: {
			ro: "Ce este igiena somnului, care obiceiuri au dovezi și care sunt sfaturi populare, o listă de o pagină și când nu mai ajunge singură.",
			en: "What sleep hygiene is, which habits have evidence and which are folk tips, a one-page checklist and when it is not enough on its own.",
		},
		keywords: {
			ro: [
				"igiena somnului",
				"obiceiuri pentru somn bun",
				"ora fixă de trezire",
				"dormitor pentru somn",
				"sfaturi pentru somn",
				"cafeina alcool somn",
			],
			en: [
				"sleep hygiene",
				"habits for better sleep",
				"fixed wake time",
				"bedroom for sleep",
				"sleep tips",
				"caffeine alcohol sleep",
			],
		},
	},
	faq: [
		{
			q: {
				ro: "Ce este igiena somnului?",
				en: "What is sleep hygiene?",
			},
			a: {
				ro: "Este setul de obiceiuri și condiții din jurul somnului: oră fixă de trezire, lumină ziua, întuneric noaptea, fără cafeină și alcool seara, un dormitor liniștit și răcoros. Nu este un tratament pentru insomnie, dar e un bun punct de plecare.",
				en: "It is the set of habits and conditions around sleep: a fixed wake time, light by day, dark by night, no caffeine or alcohol in the evening, a quiet and cool bedroom. It is not a treatment for insomnia, but it is a good starting point.",
			},
		},
		{
			q: {
				ro: "Ajută singură igiena somnului la insomnie?",
				en: "Does sleep hygiene alone help with insomnia?",
			},
			a: {
				ro: "Puțin. O meta-analiză din 2025 pe 42 de studii a găsit o îmbunătățire a scorului de insomnie, dar educația despre igiena somnului a fost inferioară terapiei cognitiv-comportamentale pentru insomnie, iar studiile aveau limite. Dacă nu ajută, vorbește cu medicul.",
				en: "A little. A 2025 meta-analysis of 42 trials found an improvement in insomnia scores, but sleep hygiene education was inferior to cognitive behavioural therapy for insomnia, and the trials had limitations. If it does not help, talk to your doctor.",
			},
		},
		{
			q: {
				ro: "Care obicei contează cel mai mult?",
				en: "Which habit matters most?",
			},
			a: {
				ro: "Nu există un singur câștigător pentru toți. Ora fixă de trezire are sprijin bun și cere efort mic, așa că e un început rezonabil. Urmează lumina de zi, cafeina și alcoolul ținute departe de culcare și un dormitor liniștit, întunecat și răcoros.",
				en: "There is no single winner for everyone. A fixed wake time has good support and takes little effort, so it is a reasonable start. Next come daylight, caffeine and alcohol kept away from bedtime, and a quiet, dark, cool bedroom.",
			},
		},
		{
			q: {
				ro: "Pot să dorm mai mult în weekend?",
				en: "Can I sleep in at weekends?",
			},
			a: {
				ro: "NHS recomandă să păstrezi rutina și în zilele în care nu lucrezi, deci aceeași oră de trezire cât poți. Nu trebuie să fii rigid: o abatere mică de o oră se duce mai ușor decât una de câteva ore, care îți mută ceasul intern.",
				en: "The NHS advises keeping your routine on days when you are not working, so the same wake time as far as you can. You do not need to be rigid: a small drift of an hour is easier to carry than one of several hours, which shifts your body clock.",
			},
		},
		{
			q: {
				ro: "Ce fac dacă nu pot adormi după 20 de minute?",
				en: "What do I do if I cannot fall asleep after 20 minutes?",
			},
			a: {
				ro: "NHS sugerează să te ridici și să stai undeva confortabil, cu lumină slabă, apoi să te întorci în pat când te simți somnoros. Nu forța somnul, nu te uita la ceas și nu lua telefonul. Poți nota pe hârtie ce te preocupă.",
				en: "The NHS suggests getting up and sitting somewhere comfortable, in dim light, then returning to bed when you feel sleepy. Do not force sleep, do not watch the clock and do not pick up the phone. You can write down on paper what is on your mind.",
			},
		},
		{
			q: {
				ro: "Când merg la medic pentru somn?",
				en: "When do I see a doctor about sleep?",
			},
			a: {
				ro: "Dacă schimbarea obiceiurilor nu a ajutat, dacă ai probleme de somn de luni de zile sau dacă îți e greu să faci față zilei, NHS spune să mergi la medicul de familie. Mergi mai repede dacă ai sforăit puternic cu pauze de respirație sau gâfâit în somn.",
				en: "If changing habits has not helped, if you have had trouble sleeping for months, or if it is hard to cope with the day, the NHS says to see your GP. Go sooner if you have loud snoring with breathing pauses or gasping in sleep.",
			},
		},
	],
	related: [
		"cafeaua-si-somnul-pana-la-ce-ora",
		"alcoolul-si-somnul-de-ce-te-trezesti",
		"ora-fixa-de-trezire-in-weekend",
		"dormitor-linistit-temperatura-lumina-zgomot",
	],
};
