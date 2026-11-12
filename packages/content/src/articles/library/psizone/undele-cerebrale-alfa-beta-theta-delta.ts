import type { ArticleInput } from "../../../schema";

export const article: ArticleInput = {
	slug: "undele-cerebrale-alfa-beta-theta-delta",
	brand: "psizone",
	topic: "creier-si-minte",
	backlogNo: null,
	status: "draft",
	kind: "health",
	aiDrafted: true,
	draftedAt: "2026-11-12",
	author: null,
	reviewer: null,
	title: {
		ro: "Undele cerebrale pe înțeles: alfa, beta, theta, delta",
		en: "Brainwaves explained: alpha, beta, theta, delta",
	},
	standfirst: {
		ro: "Undele cerebrale sunt ritmuri ale activității electrice a creierului, măsurate cu EEG și grupate după frecvență: delta (cele mai lente), theta, alfa, beta și gamma (cele mai rapide). Sunt o hartă utilă, nu un cititor de gânduri: o bandă singură nu spune în ce stare ești sau ce diagnostic ai.",
		en: "Brainwaves are rhythms in the brain’s electrical activity, measured with EEG and grouped by frequency: delta (the slowest), theta, alpha, beta and gamma (the fastest). They are a useful map, not a mind reader: one band alone does not tell what state you are in or what diagnosis you have.",
	},
	body: [
		{
			type: "p",
			text: {
				ro: "Pe scurt: creierul produce tot timpul semnale electrice mici, care oscilează. Când le măsori cu un EEG și le sortezi după câte oscilații fac pe secundă, obții benzile numite delta, theta, alfa, beta și gamma. Fiecare este mai frecventă în anumite stări, dar niciuna nu este „starea” în sine. Toate sunt prezente, în proporții diferite, în orice moment.",
				en: "In short: the brain constantly produces tiny electrical signals that oscillate. When you measure them with an EEG and sort them by how many oscillations they make per second, you get the bands called delta, theta, alpha, beta and gamma. Each is more common in certain states, but none of them is the “state” itself. All are present, in different proportions, at any moment.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Probabil ai întâlnit afirmații de tipul „în alfa ești relaxat, în beta ești stresat, în theta ajungi la intuiție”. Sunt simplificări simpatice și, uneori, înșelătoare. Haide să vedem ce se știe cu adevărat, fără mistică.",
				en: "You have probably met statements like “in alpha you are relaxed, in beta you are stressed, in theta you reach intuition”. They are charming simplifications and sometimes misleading. Let us see what is actually known, without the mysticism.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce măsoară, de fapt, un EEG?",
				en: "What does an EEG actually measure?",
			},
		},
		{
			type: "p",
			text: {
				ro: "NHS îl descrie simplu: un test care înregistrează activitatea electrică a creierului. Pe scalp se lipesc, cu o pastă, electrozi mici, argintii, conectați prin fire la un aparat de înregistrare. Testul nu doare și durează, de obicei, cam o oră; ți se poate cere să deschizi și să închizi ochii sau să respiri adânc. Clinic, EEG-ul se folosește pentru a diagnostica sau monitoriza o afecțiune a creierului, în primul rând epilepsia, dar și tulburări de somn sau encefalita.",
				en: "The NHS describes it simply: a test that records the electrical activity of the brain. Small silver electrodes are attached to the scalp with a sticky paste and connected by wires to a recording machine. The test does not hurt and usually takes about an hour; you may be asked to open and close your eyes or breathe deeply. Clinically, an EEG is used to diagnose or monitor a brain condition, mainly epilepsy, but also sleep conditions or encephalitis.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Ce vezi pe ecran este un grafic ondulat. Un program matematic îl descompune apoi în frecvențe, cam cum ai separa o melodie în note joase și înalte. Frecvența se măsoară în herți (Hz): câte oscilații pe secundă. Așa se nasc benzile.",
				en: "What you see on the screen is a wavy graph. A mathematical program then breaks it down into frequencies, much as you might split a melody into low and high notes. Frequency is measured in hertz (Hz): oscillations per second. That is how the bands are born.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Care sunt benzile și cât de rapide sunt (orientativ)?",
				en: "What are the bands and how fast are they (roughly)?",
			},
		},
		{
			type: "p",
			text: {
				ro: "O sinteză din Frontiers in Human Neuroscience, care a trecut în revistă 184 de studii de EEG în repaus, dă intervalele tipice de mai jos. Le citim ca pe un ordin de mărime, nu ca pe niște granițe exacte.",
				en: "A review in Frontiers in Human Neuroscience, covering 184 resting-state EEG studies, gives the typical ranges below. We read them as an order of magnitude, not as exact borders.",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "Delta, sub 4 Hz (în studii, în jur de 1,3 până la 3,5 Hz): cele mai lente. Domină somnul profund, stadiul N3, unde Sleep Foundation indică 1 până la 4 Hz.",
					en: "Delta, below 4 Hz (in studies around 1.3 to 3.5 Hz): the slowest. They dominate deep sleep, stage N3, where the Sleep Foundation gives 1 to 4 Hz.",
				},
				{
					ro: "Theta, aproximativ 4 până la 7,5 Hz: ritm lent, întâlnit în somnolență și în somnul ușor.",
					en: "Theta, roughly 4 to 7.5 Hz: a slow rhythm, met in drowsiness and in light sleep.",
				},
				{
					ro: "Alfa, aproximativ 8 până la 13 Hz: descris în manuale ca ritmul unui creier treaz și relaxat, mai ales cu ochii închiși.",
					en: "Alpha, roughly 8 to 13 Hz: described in textbooks as the rhythm of an awake, relaxed brain, especially with the eyes closed.",
				},
				{
					ro: "Beta, aproximativ 12,5 până la 30 Hz: ritmuri rapide, asociate de obicei cu o minte activă, concentrată.",
					en: "Beta, roughly 12.5 to 30 Hz: fast rhythms, usually associated with an active, focused mind.",
				},
				{
					ro: "Gamma, aproximativ 30 până la 40 Hz în sinteza citată (unele studii merg mai sus): cele mai rapide și cel mai greu de interpretat, pentru că mișcările mușchilor le pot contamina.",
					en: "Gamma, roughly 30 to 40 Hz in the review cited (some studies go higher): the fastest and the hardest to interpret, because muscle movement can contaminate them.",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "Observi că unele intervale se suprapun puțin. Nu e o greșeală de scriere, ci o realitate: autorii sintezei au arătat că definițiile diferă mult de la un studiu la altul. De pildă, delta poate începe oriunde între 0 și 2 Hz și se poate termina oriunde între 3,5 și 6 Hz. Cel mai frecvent interval pentru o bandă a apărut doar în aproximativ 30 până la 50% dintre studii. Cu alte cuvinte, ce numește un articol „beta” nu e neapărat ce numește altul „beta”.",
				en: "You will notice some ranges overlap slightly. This is not a typo but a fact: the authors of the review showed that definitions differ a great deal from one study to another. For example, delta may start anywhere between 0 and 2 Hz and end anywhere between 3.5 and 6 Hz. The most common range for a band appeared in only about 30 to 50% of studies. In other words, what one article calls “beta” is not necessarily what another calls “beta”.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce nu pot spune undele despre tine? Mituri frecvente",
				en: "What can brainwaves not say about you? Common myths",
			},
		},
		{
			type: "p",
			text: {
				ro: "Mitul 1: „Dacă ai multă theta, ești distras; dacă ai multă beta, ești stresat.” În realitate, aceeași bandă apare în stări foarte diferite, iar creierul nu funcționează pe un singur ritm. Autorii sintezei din Frontiers avertizează că EEG-ul nu este o simplă sumă de unde regulate și că spectrul nu trebuie interpretat ca atare.",
				en: "Myth 1: “If you have a lot of theta you are distracted; if you have a lot of beta you are stressed.” In reality the same band shows up in very different states, and the brain does not run on a single rhythm. The authors of the Frontiers review warn that the EEG is not a simple sum of regular waves and that the spectrum should not be interpreted as such.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Mitul 2: „O hartă a undelor îți pune un diagnostic.” Aceeași sinteză spune că diferențele dintre grupuri se suprapun mult, iar corelațiile cu simptomele sunt, de regulă, în jur de 0,4, așa că benzile nu sunt „deosebit de utile pentru diagnostic la nivel individual”. Un exemplu: raportul theta/beta, aprobat de autoritatea americană FDA pentru ADHD, apare și în schizofrenie și în tulburarea obsesiv-compulsivă, deci nu e specific.",
				en: "Myth 2: “A wave map gives you a diagnosis.” The same review says group differences overlap a great deal, and correlations with symptoms are typically around 0.4, so the bands are “not particularly useful for diagnosis at an individual level”. An example: the theta/beta ratio, approved by the US FDA for ADHD, also shows up in schizophrenia and in obsessive-compulsive disorder, so it is not specific.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Mitul 3: „Undele îți citesc gândurile sau starea sufletească.” Nu. Un EEG vede activitate electrică de la suprafață, nu conținutul gândurilor. Poate arăta, grosso modo, dacă dormi sau ești treaz, dacă ochii sunt deschiși sau închiși, dacă există anomalii care interesează neurologul. Atât. Și chiar ce vedem poate fi mutat puțin de cum filtrezi semnalul sau de cum alegi intervalele.",
				en: "Myth 3: “Waves read your thoughts or your mood.” No. An EEG sees electrical activity from the surface, not the content of thoughts. It can show, roughly, whether you are asleep or awake, whether your eyes are open or closed, whether there are abnormalities of interest to a neurologist. That is all. And even what we see can shift a little with how you filter the signal or choose the ranges.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Ce rămâne după ce dăm mitul la o parte? Ceva mai puțin spectaculos și mai solid: benzile sunt un limbaj comun, o modalitate de a descrie semnalul, folosită în cercetare, în somnologie și în neurologie. Ele ne ajută să punem întrebări mai bune. Nu ne dau, singure, răspunsurile.",
				en: "What is left once we set the myth aside? Something less spectacular and more solid: the bands are a common language, a way of describing the signal, used in research, in sleep medicine and in neurology. They help us ask better questions. They do not, on their own, give us the answers.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum citește un specialist benzile și ce întrebări poți pune tu?",
				en: "How does a specialist read the bands, and what can you ask?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Aceeași înregistrare poate arăta puțin diferit în funcție de cum a fost prelucrată. Sinteza din Frontiers enumeră câteva alegeri tehnice care pot muta rezultatele: filtrele hardware, felul în care se alege punctul de referință, setările analizei matematice, lungimea secvențelor analizate și dacă se raportează puterea absolută sau relativă. Autorii spun chiar că unele diferențe raportate pot dispărea dacă muți puțin ferestrele benzilor. Nu e un motiv de panică, e un motiv de prudență și de a ceri explicații.",
				en: "The same recording can look slightly different depending on how it was processed. The Frontiers review lists several technical choices that can shift the results: hardware filters, how the reference point is chosen, the settings of the mathematical analysis, the length of the stretches analysed and whether absolute or relative power is reported. The authors even say that some reported differences may disappear if you move the band windows slightly. This is not a reason for panic, it is a reason for caution and for asking for explanations.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Dacă cineva îți arată o hartă colorată și îți spune că „ai prea multă theta”, ai tot dreptul să întrebi lucrurile de mai jos. Un specialist bun nu se supără; le explică.",
				en: "If someone shows you a coloured map and tells you that you “have too much theta”, you have every right to ask the questions below. A good specialist will not mind; they will explain.",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "Cu ce date normative a fost comparată înregistrarea și pentru ce vârstă?",
					en: "Which normative data was the recording compared with, and for what age?",
				},
				{
					ro: "A fost făcută cu ochii închiși, deschiși sau în timpul unei sarcini?",
					en: "Was it done with eyes closed, open or during a task?",
				},
				{
					ro: "Ce înseamnă concret diferența față de medie și ce nu înseamnă?",
					en: "What does the difference from the average mean in concrete terms, and what does it not mean?",
				},
				{
					ro: "Ce alte informații, de la evaluarea psihologică sau medicală, stau alături de hartă?",
					en: "What other information, from the psychological or medical evaluation, sits beside the map?",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "Răspunsul onest conține aproape întotdeauna cuvântul „împreună cu”: harta, împreună cu istoricul, observația clinică și, la copii, ce spun părinții și școala. Un grafic singur nu duce o poveste întreagă.",
				en: "The honest answer almost always contains the words “together with”: the map, together with the history, the clinical observation and, for children, what parents and school say. A graph alone does not carry a whole story.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce legătură au undele cu somnul?",
				en: "What do brainwaves have to do with sleep?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Somnul este locul unde benzile se văd cel mai frumos. Conform Sleep Foundation, un ciclu complet durează cam 90 de minute, iar noaptea alternezi între somn NREM și REM de mai multe ori. În stadiul N1, ușor, undele încetinesc. În N2, apar „fusuri de somn”, mici explozii de 7 până la 15 Hz, care durează de la o jumătate de secundă la trei secunde, și complexe K. În N3, somnul profund, domină delta, cu 1 până la 4 Hz, iar cea mai mare parte a lui vine la începutul nopții. În REM, activitatea creierului crește, uneori aproape de nivelul din starea de veghe.",
				en: "Sleep is where the bands show most beautifully. According to the Sleep Foundation, a full cycle takes about 90 minutes, and during the night you alternate between NREM and REM several times. In stage N1, light sleep, the waves slow down. In N2, “sleep spindles” appear, small bursts of 7 to 15 Hz lasting from half a second to three seconds, and K-complexes. In N3, deep sleep, delta dominates, at 1 to 4 Hz, and most of it comes at the start of the night. In REM, brain activity rises, sometimes close to the level of wakefulness.",
			},
		},
		{
			type: "p",
			text: {
				ro: "De aceea nu e deloc surprinzător că „delta” a ajuns sinonim cu somnul adânc. Dar și aici: faptul că vezi delta pe un grafic nu înseamnă că ai dormit bine, iar un somn prost nu se repară „antrenând delta”. Când somnul e problema, vorbește cu medicul. Am scris separat despre somn și creier.",
				en: "That is why it is no surprise that “delta” has become a synonym for deep sleep. But here too: seeing delta on a graph does not mean you slept well, and poor sleep is not fixed by “training delta”. When sleep is the problem, talk to your doctor. We have written separately about sleep and the brain.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum apar undele într-o hartă QEEG?",
				en: "How do brainwaves show up in a QEEG map?",
			},
		},
		{
			type: "p",
			text: {
				ro: "QEEG vine de la „EEG cantitativ”. Pe pagina Psizone, harta cerebrală este descrisă ca o analiză a activității electrice, neinvazivă și nedureroasă: se pune o cască cu electrozi pe scalp, fără curent electric, activitatea se înregistrează în repaus, cu ochii închiși și deschiși, uneori și în timpul unor sarcini, datele se prelucrează cu un program și se compară cu baze de date normative, iar la final ești primit cu un raport. Benzile sunt chiar materialul lui: harta arată cât de mult din fiecare bandă apare în fiecare zonă a scalpului.",
				en: "QEEG stands for “quantitative EEG”. On the Psizone page, the brain map is described as an analysis of electrical activity, non-invasive and painless: a cap with electrodes goes on the scalp, with no electric current, activity is recorded at rest, with eyes closed and open and sometimes during tasks, the data are processed with a program and compared with normative databases, and at the end you receive a report. The bands are its very material: the map shows how much of each band appears in each area of the scalp.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Cum îl folosim, într-o scenă: un părinte aduce un copil cu dificultăți de atenție. Facem harta, o citim împreună cu evaluarea psihologică, nu în locul ei, apoi vedem ce are sens să încercăm și cum măsurăm schimbarea. Harta este un punct de plecare pentru discuție. Nu este un verdict. Psizone o prezintă drept metodă complementară, recomandată în anumite situații după o evaluare individuală, care nu înlocuiește recomandările psihologice, logopedice, educaționale sau medicale.",
				en: "How we use it, in a scene: a parent brings a child with attention difficulties. We make the map, read it together with the psychological evaluation, not instead of it, then see what makes sense to try and how we will measure change. The map is a starting point for conversation. It is not a verdict. Psizone presents it as a complementary method, recommended in certain situations after an individual evaluation, which does not replace psychological, speech-therapy, educational or medical recommendations.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pentru cine nu este: dacă ți s-a cerut un EEG clinic de către neurolog, de pildă pentru suspiciunea de epilepsie, QEEG-ul nu îl înlocuiește. Aceea e o întrebare medicală, cu un răspuns medical.",
				en: "Who it is not for: if a neurologist asked for a clinical EEG, for example for suspected epilepsy, a QEEG does not replace it. That is a medical question, with a medical answer.",
			},
		},
		{
			type: "quote",
			text: {
				ro: "Benzile sunt o hartă utilă, nu un cititor de gânduri.",
				en: "The bands are a useful map, not a mind reader.",
			},
		},
		{
			type: "h2",
			text: { ro: "Pasul următor", en: "Your next step" },
		},
		{
			type: "p",
			text: {
				ro: "Dacă te întrebi dacă o hartă cerebrală ți-ar folosi ție sau copilului tău, nu începe cu aparatul, ci cu întrebarea: ce vrei să înțelegi? Scrie-o într-o frază și programează o evaluare pe psizone.ro. Prima discuție este despre voi, nu despre diagnostic.",
				en: "If you wonder whether a brain map would help you or your child, do not start with the machine but with the question: what do you want to understand? Write it in one sentence and book an evaluation on psizone.ro. The first conversation is about you, not a diagnosis.",
			},
		},
	],
	sources: [
		{
			label: {
				ro: "Newson și Thiagarajan, Frontiers in Human Neuroscience: benzile de frecvență EEG",
				en: "Newson and Thiagarajan, Frontiers in Human Neuroscience: EEG frequency bands",
			},
			href: "https://www.frontiersin.org/journals/human-neuroscience/articles/10.3389/fnhum.2018.00521/full",
		},
		{
			label: { ro: "NHS: EEG (electroencefalogramă)", en: "NHS: EEG (electroencephalogram)" },
			href: "https://www.nhs.uk/conditions/electroencephalogram/",
		},
		{
			label: {
				ro: "Sleep Foundation: somnul NREM, stadii și unde",
				en: "Sleep Foundation: NREM sleep, stages and waves",
			},
			href: "https://www.sleepfoundation.org/stages-of-sleep/nrem-sleep",
		},
		{
			label: { ro: "Sleep Foundation: somnul REM", en: "Sleep Foundation: REM sleep" },
			href: "https://www.sleepfoundation.org/stages-of-sleep/rem-sleep",
		},
		{
			label: { ro: "Psizone: QEEG, harta cerebrală", en: "Psizone: QEEG, the brain map" },
			href: "https://psizone.ro/qeeg",
		},
	],
	provenance: [
		"https://www.frontiersin.org/journals/human-neuroscience/articles/10.3389/fnhum.2018.00521/full (Newson & Thiagarajan, 184 resting-state studies): typical Hz ranges, definition inconsistency, 30-50% agreement, correlations around 0.4, not useful for individual diagnosis, theta/beta ratio and other disorders",
		"https://www.nhs.uk/conditions/electroencephalogram/: EEG records electrical activity, electrodes with paste, about an hour, epilepsy, sleep conditions, encephalitis",
		"https://www.sleepfoundation.org/stages-of-sleep/nrem-sleep: 90-minute cycle, N1/N2/N3, spindles 7 to 15 Hz for 0.5 to 3 seconds, delta 1 to 4 Hz",
		"https://www.sleepfoundation.org/stages-of-sleep/rem-sleep: brain activity rises in REM, sometimes close to waking levels",
		"https://psizone.ro/qeeg: what QEEG is, no electric current, rest with eyes closed and open, normative databases, report",
		"https://psizone.ro: QEEG and neurofeedback are complementary after individual evaluation",
		"Alpha described as relaxed-wakefulness rhythm, beta as active mind: standard textbook characterisation, kept qualitative (same convention as packages/content/src/articles/library/psizone/harta-cerebrala-qeeg.ts)",
		"docs/brands/writing-voice.md; packages/design/brand-books/1-psizone.md",
	],
	seo: {
		title: {
			ro: "Unde cerebrale alfa, beta, theta, delta: ce sunt, pe scurt",
			en: "Brainwaves alpha, beta, theta, delta: what they are, simply",
		},
		description: {
			ro: "Ce sunt undele cerebrale alfa, beta, theta și delta, în ce Hz apar, ce legătură au cu somnul și ce nu pot spune despre tine. Fără mistică.",
			en: "What alpha, beta, theta and delta brainwaves are, roughly how many Hz they cover, how they link to sleep and what they cannot say about you.",
		},
		keywords: {
			ro: [
				"unde cerebrale alfa beta theta delta",
				"unde cerebrale",
				"benzi EEG Hz",
				"unde delta somn",
				"unde alfa relaxare",
				"QEEG benzi de frecvență",
			],
			en: [
				"brainwaves alpha beta theta delta",
				"brain waves explained",
				"EEG frequency bands Hz",
				"delta waves sleep",
				"alpha waves relaxation",
				"QEEG frequency bands",
			],
		},
	},
	faq: [
		{
			q: {
				ro: "Care sunt tipurile de unde cerebrale?",
				en: "What are the types of brainwaves?",
			},
			a: {
				ro: "Cele cinci benzi uzuale sunt delta (cele mai lente, sub 4 Hz), theta (cam 4 până la 7,5 Hz), alfa (cam 8 până la 13 Hz), beta (cam 12,5 până la 30 Hz) și gamma (peste 30 Hz). Intervalele sunt orientative: o sinteză din 2019 arată că definițiile diferă de la un studiu la altul.",
				en: "The five usual bands are delta (the slowest, below 4 Hz), theta (about 4 to 7.5 Hz), alpha (about 8 to 13 Hz), beta (about 12.5 to 30 Hz) and gamma (above 30 Hz). The ranges are approximate: a review shows that definitions differ from one study to another.",
			},
		},
		{
			q: {
				ro: "Ce unde apar în somnul profund?",
				en: "Which waves appear in deep sleep?",
			},
			a: {
				ro: "În stadiul N3, somnul profund, domină undele delta, cu o frecvență de 1 până la 4 Hz, conform Sleep Foundation. Cea mai mare parte a somnului profund vine la începutul nopții, iar un ciclu complet de somn durează cam 90 de minute.",
				en: "In stage N3, deep sleep, delta waves dominate, at a frequency of 1 to 4 Hz, according to the Sleep Foundation. Most deep sleep comes at the start of the night, and a full sleep cycle takes about 90 minutes.",
			},
		},
		{
			q: {
				ro: "Poate un EEG să spună dacă am ADHD sau anxietate?",
				en: "Can an EEG tell whether I have ADHD or anxiety?",
			},
			a: {
				ro: "Nu singur. O sinteză a studiilor arată că diferențele dintre grupuri se suprapun mult și că benzile nu sunt deosebit de utile pentru diagnostic la nivel individual. Diagnosticul se pune de un specialist, pe baza unei evaluări complete. O hartă QEEG poate fi o piesă din ea, nu verdictul.",
				en: "Not on its own. A review of studies shows that differences between groups overlap a great deal and that bands are not particularly useful for diagnosis at an individual level. A diagnosis is made by a specialist, from a full evaluation. A QEEG map can be one piece of it, not the verdict.",
			},
		},
		{
			q: {
				ro: "Care e diferența dintre EEG și QEEG?",
				en: "What is the difference between EEG and QEEG?",
			},
			a: {
				ro: "EEG-ul clinic îl cere medicul, de pildă neurologul, ca să caute epilepsie sau alte anomalii. QEEG pornește de la o înregistrare asemănătoare, dar o analizează cu un program, pe benzi și zone, și o compară cu baze de date. Nu se înlocuiesc: dacă ți s-a cerut un EEG, tot el îți trebuie.",
				en: "A clinical EEG is ordered by a doctor, for example a neurologist, to look for epilepsy or other abnormalities. QEEG starts from a similar recording but analyses it with a program, by band and area, and compares it with databases. They do not replace each other: if you were asked for an EEG, an EEG is what you need.",
			},
		},
		{
			q: {
				ro: "Pot să-mi „schimb” undele cerebrale singur, prin relaxare?",
				en: "Can I “change” my brainwaves on my own through relaxation?",
			},
			a: {
				ro: "Undele se schimbă oricum, tot timpul, cu somnul, atenția sau starea ta. Nu avem dovezi că ai putea să le „reglezi” voluntar, bandă cu bandă. Ce poți face e să dormi, să respiri lent și să-ți odihnești mintea, iar pentru o problemă anume să vorbești cu medicul sau cu un psiholog.",
				en: "They change anyway, all the time, with sleep, attention or your state. We have no evidence that you can “tune” them voluntarily, band by band. What you can do is sleep, breathe slowly and rest your mind, and for a particular problem talk to a doctor or a psychologist.",
			},
		},
	],
	related: [
		"harta-cerebrala-qeeg",
		"qeeg-sau-eeg-care-este-diferenta",
		"somnul-si-creierul-ce-se-intampla-noaptea",
	],
};
