import type { ArticleInput } from "../../../schema";

export const article: ArticleInput = {
	slug: "qeeg-sau-eeg-care-este-diferenta",
	brand: "psizone",
	topic: "qeeg",
	backlogNo: null,
	status: "draft",
	kind: "health",
	aiDrafted: true,
	draftedAt: "2026-11-12",
	author: null,
	reviewer: null,
	title: {
		ro: "QEEG sau EEG: care este diferența",
		en: "QEEG vs EEG: what is the difference",
	},
	standfirst: {
		ro: "EEG-ul clinic îl cere neurologul și caută epilepsie sau alte anomalii. QEEG-ul măsoară același tip de semnal, îl calculează pe benzi și zone și îl compară cu o bază de date. Nu se înlocuiesc: dacă ți s-a cerut un EEG, tot el îți trebuie.",
		en: "A clinical EEG is ordered by a neurologist and looks for epilepsy or other abnormalities. QEEG measures the same kind of signal, calculates it by band and area and compares it with a database. They do not replace each other: if you were asked for an EEG, an EEG is what you need.",
	},
	body: [
		{
			type: "p",
			text: {
				ro: "Răspunsul în trei rânduri. Primul: EEG-ul clinic este un test medical, citit de un medic, care caută epilepsie, tulburări de somn și alte anomalii ale activității electrice a creierului. Al doilea: QEEG-ul pornește de la o înregistrare asemănătoare, dar o analizează cu un program, pe benzi de frecvență și pe zone, și o compară cu o bază de date. Al treilea: nu se înlocuiesc, deci dacă medicul a cerut un EEG, QEEG-ul nu îl ține locul.",
				en: "The answer in three lines. First: a clinical EEG is a medical test, read by a doctor, that looks for epilepsy, sleep disorders and other abnormalities of the brain's electrical activity. Second: QEEG starts from a similar recording but analyses it with a program, by frequency band and area, and compares it with a database. Third: they do not replace each other, so if a doctor asked for an EEG, QEEG does not stand in for it.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Dacă ai ajuns aici pentru că ți-a spus cineva „faceți un EEG” și altcineva „faceți o hartă QEEG”, e firesc să te simți încurcat. Nu ai greșit nimic. Cele două nume sună aproape la fel și, într-adevăr, se bazează pe același tip de semnal. Diferența ține de ce întrebare pui, cine citește rezultatul și ce faci cu el.",
				en: "If you got here because one person told you “get an EEG” and another “get a QEEG map”, feeling muddled is natural. You have done nothing wrong. The two names sound almost the same and they really do rest on the same kind of signal. The difference lies in which question you ask, who reads the result and what you do with it.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce este un EEG și ce caută neurologul?",
				en: "What is an EEG and what does the neurologist look for?",
			},
		},
		{
			type: "p",
			text: {
				ro: "EEG înseamnă electroencefalogramă: o înregistrare a activității electrice a creierului. Serviciul de sănătate din Marea Britanie (NHS) spune că se folosește mai ales pentru a diagnostica sau a urmări epilepsia, în special după crize, și că poate ajuta și în cazul unor probleme de somn sau al encefalitei, adică al inflamației creierului.",
				en: "EEG stands for electroencephalogram: a recording of the brain's electrical activity. The UK's National Health Service (NHS) says it is used mainly to diagnose or monitor epilepsy, especially after seizures, and that it can also help with some sleep conditions and with encephalitis, inflammation of the brain.",
			},
		},
		{
			type: "p",
			text: {
				ro: "În practică, un tehnician măsoară capul și marchează locurile pentru niște discuri mici de metal, numite electrozi. Le fixează cu o pastă lipicioasă, iar firele merg la un aparat de înregistrare. Ți se poate cere să deschizi și să închizi ochii, să respiri adânc sau să te uiți la o lumină intermitentă. NHS spune că testul este nedureros și durează de obicei aproximativ o oră.",
				en: "In practice, a technician measures the head and marks the places for small metal discs, called electrodes. They fix them with a sticky paste, and the wires run to a recording machine. You may be asked to open and close your eyes, breathe deeply or look at a flashing light. The NHS says the test is painless and usually takes about an hour.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Ce caută neurologul? Forme anume ale undelor, care pot arăta, de pildă, o tendință la crize: vârfuri, unde ascuțite, ritmuri care apar în locul nepotrivit sau la momentul nepotrivit. Citește înregistrarea în timp, ca pe o poveste, și o pune lângă ce știe despre tine, simptomele și examenul medical. Întrebarea lui este: „Există o boală neurologică?”",
				en: "What does the neurologist look for? Particular shapes of waves that may show, for instance, a tendency towards seizures: spikes, sharp waves, rhythms that appear in the wrong place or at the wrong time. They read the recording through time, like a story, and set it beside what they know about you, your symptoms and the medical examination. Their question is: “Is there a neurological illness?”",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce adaugă analiza cantitativă?",
				en: "What does the quantitative analysis add?",
			},
		},
		{
			type: "p",
			text: {
				ro: "QEEG vine de la „EEG cantitativ”. Ideea este simplă: în loc să privim doar forma undelor, le măsurăm. Un program împarte semnalul pe ritmuri, adică delta, theta, alfa și beta, spune cât din fiecare este prezent în fiecare zonă a capului, cum se leagă zonele între ele și le pune în hărți colorate. Dacă se folosește o bază de date a persoanelor de aceeași vârstă, harta arată ce se abate de la medie.",
				en: "QEEG comes from “quantitative EEG”. The idea is simple: instead of only looking at the shape of the waves, we measure them. A program splits the signal into rhythms, that is delta, theta, alpha and beta, says how much of each is present in each area of the head, how the areas are linked to each other, and turns this into coloured maps. If a database of people of the same age is used, the map shows what departs from the average.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Întrebarea nu mai este „există o boală neurologică?”, ci „cum lucrează ritmurile acestui creier, față de ce ne-am aștepta la vârsta lui, și ce ar putea însemna asta pentru planul nostru?”. Este o întrebare de lucru, nu de diagnostic. Despre harta în sine am scris mai pe larg în articolul despre harta cerebrală QEEG.",
				en: "The question is no longer “is there a neurological illness?” but “how do the rhythms of this brain behave, compared with what we would expect at this age, and what might that mean for our plan?” It is a working question, not a diagnostic one. We wrote about the map itself in more detail in the article on the QEEG brain map.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "EEG și QEEG, față în față",
				en: "EEG and QEEG, side by side",
			},
		},
		{
			type: "p",
			text: {
				ro: "Un tabel ar fi ideal, dar o listă face același lucru. Iată diferențele, rând cu rând.",
				en: "A table would be ideal, but a list does the same job. Here are the differences, line by line.",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "Întrebarea: EEG clinic, „există epilepsie sau altă anomalie?”. QEEG, „cum lucrează ritmurile și ce ar putea ajuta în plan?”.",
					en: "The question: clinical EEG, “is there epilepsy or another abnormality?”. QEEG, “how do the rhythms behave and what might help in the plan?”.",
				},
				{
					ro: "Cine îl cere: EEG, de obicei neurologul sau medicul care suspectează o boală. QEEG, specialistul care face evaluarea, ca piesă dintr-un plan.",
					en: "Who asks for it: EEG, usually the neurologist or the doctor who suspects an illness. QEEG, the specialist doing the assessment, as one piece of a plan.",
				},
				{
					ro: "Cum se citește: EEG, vizual, de un medic, în timp. QEEG, cu ajutorul unui program, pe benzi și zone.",
					en: "How it is read: EEG, visually, by a doctor, through time. QEEG, with the help of a program, by band and area.",
				},
				{
					ro: "Ce produce: EEG, un raport medical. QEEG, hărți și un raport de lucru, comparat cu o bază de date.",
					en: "What it produces: EEG, a medical report. QEEG, maps and a working report, compared with a database.",
				},
				{
					ro: "Poate pune un diagnostic: EEG, poate susține un diagnostic neurologic, cum e epilepsia. QEEG, nu singur.",
					en: "Can it make a diagnosis: EEG, it can support a neurological diagnosis such as epilepsy. QEEG, not on its own.",
				},
				{
					ro: "Pe cine îl înlocuiește: niciunul din cele două nu îl înlocuiește pe celălalt.",
					en: "What it replaces: neither of the two replaces the other.",
				},
			],
		},
		{
			type: "h2",
			text: {
				ro: "Când ai nevoie de neurolog?",
				en: "When do you need a neurologist?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Dacă există crize, adică pierderi bruște ale conștienței, mișcări involuntare, absențe în care copilul „se oprește” și nu mai răspunde, sau dacă apare o schimbare bruscă de comportament sau de vorbire, primul pas este medicul, iar medicul poate cere un EEG. Aceasta nu e o situație în care așteptăm o hartă. Dacă tu sau cineva apropiat sunteți în pericol imediat, sunați la 112.",
				en: "If there are seizures, meaning sudden loss of consciousness, involuntary movements, absences in which the child “switches off” and does not respond, or if there is a sudden change in behaviour or speech, the first step is the doctor, and the doctor may order an EEG. This is not a situation in which we wait for a map. If you or someone close to you is in immediate danger, call 112.",
			},
		},
		{
			type: "p",
			text: {
				ro: "La fel, dacă un medic ți-a cerut explicit un EEG, fă-l pe acela, la cine ți-l recomandă. Harta QEEG nu îi poate lua locul și nu va fi acceptată ca atare de neurolog. Dacă vrei și harta, poți face ambele, în ordinea care are sens pentru tine și pentru medic.",
				en: "Likewise, if a doctor has explicitly asked you for an EEG, have that one, where they recommend. A QEEG map cannot take its place and a neurologist will not accept it as such. If you also want the map, you can have both, in the order that makes sense for you and your doctor.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Care sunt limitele QEEG?",
				en: "What are the limits of QEEG?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Sunt reale și le spunem. Un exemplu cunoscut: raportul theta/beta, un indicator QEEG folosit în ADHD. Neurologii americani (AAN) l-au analizat și l-au considerat, la momentul acela, un instrument de cercetare, nu un test de diagnostic stabilit; cercetătorii care au comentat analiza au recomandat prudență clinicienilor și celor care plătesc serviciile. O revizuire sistematică a studiilor la copii cu afecțiuni psihice, publicată în 2019, a adunat 33 de studii cu 2.268 de tineri și a găsit diferențe la nivel de grup, de exemplu un raport theta/beta mai mare în ADHD, dar a spus că nu e clar dacă ele disting o afecțiune de alta.",
				en: "They are real and we state them. One well-known example: the theta/beta ratio, a QEEG measure used in ADHD. American neurologists (the AAN) examined it and judged it, at that time, a research tool rather than an established diagnostic test; the researchers who commented on that review recommended caution to clinicians and payers. A systematic review of studies in children with psychiatric conditions, published in 2019, gathered 33 studies with 2,268 young people and found differences at group level, for example a higher theta/beta ratio in ADHD, but said it is unclear whether they distinguish one condition from another.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Mai sunt și limite practice. Harta depinde de calitatea înregistrării, iar mișcarea, somnolența sau un pic de nervozitate se văd în ea. Compararea cu o bază de date spune ce e diferit, nu de ce. Iar o diferență nu înseamnă o problemă. De aceea o citim întotdeauna împreună cu restul evaluării, nu singură. Dacă cineva îți oferă o hartă drept răspuns sigur la o întrebare complicată, ia o pauză și cere să vezi sursele. Un răspuns cinstit sună de obicei mai așa: „Probabil”, „în acest context”, „de verificat din nou peste câteva luni”.",
				en: "There are practical limits too. The map depends on the quality of the recording, and movement, sleepiness or a little nervousness show up in it. Comparison with a database says what is different, not why. And a difference does not mean a problem. That is why we always read it together with the rest of the assessment, never alone. If someone offers you a map as the sure answer to a complicated question, pause and ask to see the sources. An honest answer usually sounds more like this: “probably”, “in this context”, “to be checked again in a few months”.",
			},
		},
		{
			type: "quote",
			text: {
				ro: "O diferență pe hartă nu e o problemă. Contextul îi dă sensul.",
				en: "A difference on the map is not a problem. Context gives it meaning.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cine citește rezultatul și ce primești la final?",
				en: "Who reads the result, and what do you get at the end?",
			},
		},
		{
			type: "p",
			text: {
				ro: "La un EEG clinic, rezultatul este un raport medical, scris de medicul care a citit înregistrarea. Acel medic răspunde la întrebarea pentru care a fost cerut testul și te îndrumă mai departe, dacă este nevoie. Raportul poate conține termeni medicali, iar dacă nu îi înțelegi, ai tot dreptul să ceri să ți se explice.",
				en: "With a clinical EEG, the result is a medical report, written by the doctor who read the recording. That doctor answers the question for which the test was requested and directs you onward if needed. The report may contain medical terms, and if you do not understand them you have every right to ask for an explanation.",
			},
		},
		{
			type: "p",
			text: {
				ro: "La QEEG, rezultatul este o discuție și un raport de lucru. Îți arătăm hărțile, îți spunem în cuvinte simple ce vedem și ce nu putem spune și ce propunem mai departe. Nu pleci cu o hartă colorată și o frază care te sperie. Dacă harta se repetă mai târziu, o punem lângă prima, ca să vezi ce s-a mișcat și ce a rămas la fel.",
				en: "With QEEG, the result is a conversation and a working report. We show you the maps, tell you in plain words what we see and what we cannot say, and what we propose next. You do not leave with a coloured map and a frightening sentence. If the map is repeated later, we set it beside the first, so you can see what has moved and what has stayed the same.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Un lucru practic: păstrează orice raport. Dacă un medic îți cere vreodată să arăți ce s-a făcut înainte, să ai la îndemână și EEG-ul, și harta, fiecare cu data lui, te scutește de repetări. Iar dacă vrei să le arăți medicului curant, e bine să-l întrebi dinainte ce anume vrea să vadă.",
				en: "One practical thing: keep every report. If a doctor ever asks you to show what was done before, having both the EEG and the map to hand, each with its date, spares you repeats. And if you want to show them to your treating doctor, it is wise to ask beforehand what exactly they want to see.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum alegi, concret, între ele?",
				en: "How do you choose between them, in practice?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pornește de la întrebarea ta. Dacă te îngrijorează crize, leșinuri, pierderi de conștiență sau o boală neurologică, mergi la medic: EEG-ul e al lui. Dacă te întrebi cum lucrează atenția sau starea emoțională a copilului, iar un psiholog care face evaluarea consideră că o hartă ar aduce ceva în plus, QEEG-ul poate fi o piesă din plan. Iar dacă nu știi încă ce întrebare ai, începi cu o discuție. Nu e nicio rușine în asta: mulți părinți vin spunând doar „ceva nu merge cum ar trebui”, iar felul în care formulăm împreună întrebarea este deja o jumătate din evaluare. Alege-o pe cea care îți aduce liniște, nu pe cea care sună mai tehnic.",
				en: "Start from your question. If you are worried about seizures, fainting, loss of consciousness or a neurological illness, go to the doctor: the EEG is theirs. If you are wondering how your child's attention or emotional state works, and a psychologist doing the assessment thinks a map would add something, QEEG can be one piece of the plan. And if you do not yet know what your question is, begin with a conversation. There is no shame in that: many parents arrive saying only “something is not going the way it should”, and the way we put the question together is already half the assessment. Pick the one that brings you calm, not the one that sounds more technical.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Poți spune copilului același lucru în ambele cazuri: „Pun niște senzori pe cap, care doar ascultă. Nu doare și nu e un test.” Ce diferă este ce facem cu rezultatul, iar asta o explicăm noi, dinainte.",
				en: "You can tell your child the same thing in both cases: “They put some sensors on your head that just listen. It does not hurt and it is not a test.” What differs is what we do with the result, and we explain that beforehand.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Care este pasul următor?",
				en: "What is the next step?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Evaluarea. Prima discuție este despre voi, nu despre diagnostic. Din ea hotărâm împreună dacă o hartă QEEG are sens în cazul tău, ca metodă complementară, care nu înlocuiește recomandările medicale, psihologice, educaționale sau logopedice, și dacă, mai întâi, ai nevoie de un consult la neurolog. Pentru durată, disponibilitate și tarife, întreabă-ne la programare.",
				en: "The assessment. The first conversation is about the two of you, not about a diagnosis. From it we decide together whether a QEEG map makes sense in your case, as a complementary method that does not replace medical, psychological, educational or speech-therapy recommendations, and whether you first need to see a neurologist. For duration, availability and fees, ask us when you book.",
			},
		},
	],
	sources: [
		{
			label: {
				ro: "NHS: EEG (electroencefalogramă)",
				en: "NHS: electroencephalogram (EEG)",
			},
			href: "https://www.nhs.uk/conditions/electroencephalogram/",
		},
		{
			label: {
				ro: "Nuwer et al., 2016: QEEG în ADHD, o analiză a poziției AAN",
				en: "Nuwer et al., 2016: quantitative EEG in ADHD, a review of the AAN position",
			},
			href: "https://pubmed.ncbi.nlm.nih.gov/28058208/",
		},
		{
			label: {
				ro: "McVoy et al., 2019: revizuire sistematică a QEEG în tulburările psihice la copii",
				en: "McVoy et al., 2019: systematic review of QEEG in child psychiatric disorders",
			},
			href: "https://pubmed.ncbi.nlm.nih.gov/31300243/",
		},
		{
			label: { ro: "Psizone: servicii și evaluare", en: "Psizone: services and assessment" },
			href: "https://psizone.ro",
		},
	],
	provenance: [
		"https://www.nhs.uk/conditions/electroencephalogram/: what an EEG is for (epilepsy, sleep conditions, encephalitis), how it is done, painless, about an hour",
		"https://pubmed.ncbi.nlm.nih.gov/28058208/ (Nuwer, Buchhalter, Shepard 2016; via Europe PMC record): theta/beta ratio judged investigational by the AAN; caution for clinicians and payers",
		"https://pubmed.ncbi.nlm.nih.gov/31300243/ (McVoy 2019; via Europe PMC record): 33 studies, 2,268 youths aged 4 to 18, higher theta/beta in ADHD, unclear specificity",
		"https://psizone.ro: QEEG complementary, after individual evaluation, not a replacement for medical recommendations",
		"The neurologist's reading (spikes, sharp waves) and the quantitative method are standard descriptions, to be confirmed by the clinical reviewer",
		"docs/brands/writing-voice.md; packages/design/brand-books/1-psizone.md",
	],
	seo: {
		title: {
			ro: "QEEG vs EEG: diferența, pe înțeles | Psizone",
			en: "QEEG vs EEG difference: which one do you need? | Psizone",
		},
		description: {
			ro: "EEG-ul clinic caută epilepsie și anomalii; QEEG-ul măsoară și compară cu o bază de date. Diferența, limitele și când ai nevoie de neurolog.",
			en: "A clinical EEG looks for epilepsy and abnormalities; QEEG measures and compares with a database. The difference, the limits and when you need a neurologist.",
		},
		keywords: {
			ro: [
				"qeeg vs eeg diferența",
				"qeeg sau eeg",
				"EEG cantitativ",
				"EEG neurolog copii",
				"hartă cerebrală",
				"ce este QEEG",
			],
			en: [
				"QEEG vs EEG difference",
				"QEEG or EEG",
				"quantitative EEG",
				"EEG neurologist children",
				"brain map",
				"what is QEEG",
			],
		},
	},
	faq: [
		{
			q: {
				ro: "Poate QEEG-ul înlocui un EEG cerut de neurolog?",
				en: "Can QEEG replace an EEG ordered by a neurologist?",
			},
			a: {
				ro: "Nu. Neurologul cere EEG pentru a căuta epilepsie sau alte anomalii și îl citește ca pe un test medical. Harta QEEG răspunde la altă întrebare și nu îi ține locul. Dacă medicul ți-a cerut un EEG, fă-l pe acela; harta se poate adăuga ulterior, dacă are sens.",
				en: "No. The neurologist orders an EEG to look for epilepsy or other abnormalities and reads it as a medical test. A QEEG map answers a different question and does not stand in for it. If your doctor asked for an EEG, have that one; the map can be added afterwards, if it makes sense.",
			},
		},
		{
			q: {
				ro: "Care este diferența dintre EEG și QEEG?",
				en: "What is the difference between EEG and QEEG?",
			},
			a: {
				ro: "Ambele pornesc de la semnalul electric al creierului, înregistrat cu senzori pe scalp. EEG-ul clinic este citit de un medic și caută anomalii, cum e epilepsia. QEEG-ul este analizat cu un program pe benzi și zone și comparat cu o bază de date; el ajută la plan, nu pune singur un diagnostic.",
				en: "Both start from the brain's electrical signal, recorded with sensors on the scalp. A clinical EEG is read by a doctor and looks for abnormalities such as epilepsy. QEEG is analysed with a program by band and area and compared with a database; it helps with the plan and does not make a diagnosis on its own.",
			},
		},
		{
			q: { ro: "Doare vreunul dintre ele?", en: "Does either of them hurt?" },
			a: {
				ro: "Nu. Potrivit NHS, EEG-ul este un test nedureros. Senzorii doar citesc semnalul, nu trimit curent. Îți poate rămâne puțină pastă în păr, care se spală. Pentru copii mici, explicăm și arătăm casca înainte, ca să nu fie surprize.",
				en: "No. According to the NHS, an EEG is a painless test. The sensors only read the signal and send no current. A little paste may stay in your hair, and it washes out. For young children we explain and show the cap beforehand, so there are no surprises.",
			},
		},
		{
			q: {
				ro: "Ce este raportul theta/beta și diagnostichează ADHD?",
				en: "What is the theta/beta ratio, and does it diagnose ADHD?",
			},
			a: {
				ro: "Este un indicator QEEG care compară cantitatea a două ritmuri, theta și beta. Neurologii americani l-au considerat, la momentul analizei, un instrument de cercetare, nu un test de diagnostic stabilit. Nu poate stabili singur un ADHD; contează evaluarea completă.",
				en: "It is a QEEG measure that compares the amount of two rhythms, theta and beta. American neurologists considered it, at the time of the review, a research tool rather than an established diagnostic test. It cannot establish ADHD on its own; the full assessment is what counts.",
			},
		},
		{
			q: {
				ro: "Cu cine încep: neurolog sau psiholog?",
				en: "Where do I start: neurologist or psychologist?",
			},
			a: {
				ro: "Dacă există crize, pierderi de conștiență, absențe sau o schimbare bruscă de comportament, începi cu medicul. Dacă întrebarea ține de atenție, emoții sau învățare, poți începe cu o evaluare psihologică, iar dacă apare un semn neurologic, te îndrumăm spre medic.",
				en: "If there are seizures, loss of consciousness, absences or a sudden change in behaviour, you start with the doctor. If the question is about attention, emotions or learning, you can begin with a psychological assessment, and if a neurological sign appears we point you to the doctor.",
			},
		},
	],
	related: [
		"harta-cerebrala-qeeg",
		"qeeg-la-copii-cum-decurge-inregistrarea",
		"undele-cerebrale-alfa-beta-theta-delta",
	],
};
