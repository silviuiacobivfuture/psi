import type { ArticleInput } from "../../../schema";

export const article: ArticleInput = {
	slug: "harta-cerebrala-qeeg",
	brand: "psizone",
	topic: "qeeg",
	backlogNo: 9,
	status: "draft",
	kind: "health",
	aiDrafted: true,
	draftedAt: "2026-11-12",
	author: null,
	reviewer: null,
	title: {
		ro: "Ce este o hartă cerebrală QEEG",
		en: "What is a QEEG brain map",
	},
	standfirst: {
		ro: "O hartă cerebrală QEEG este o înregistrare EEG făcută cu o cască de senzori, apoi analizată statistic. Nu doare, nu trimite nimic în creier și nu pune singură un diagnostic. Arată cum lucrează ritmurile creierului și ajută la construirea unui plan.",
		en: "A QEEG brain map is an EEG recording made with a cap of sensors and then analysed statistically. It does not hurt, nothing is sent into the brain, and it cannot make a diagnosis on its own. It shows how the brain's rhythms behave and helps build a plan.",
	},
	body: [
		{
			type: "p",
			text: {
				ro: "Ca să spunem direct: harta cerebrală QEEG este un EEG, adică o înregistrare a activității electrice a creierului, făcută cu o cască cu senzori, la care se adaugă o analiză cantitativă. Pe scurt, nu doar „se uită cineva la unde”, ci se și calculează cât din fiecare ritm apare în fiecare zonă. Nu doare, durează puțin, iar rezultatul este o imagine de lucru, nu o sentință.",
				en: "To put it plainly: a QEEG brain map is an EEG, a recording of the brain's electrical activity made with a cap of sensors, with a quantitative analysis added. In short, it is not just someone looking at waves; the amount of each rhythm in each area is also calculated. It does not hurt, it takes little time, and the result is a working picture, not a verdict.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Dacă ești părinte, probabil te întrebi două lucruri: „Îl doare?” și „O să-mi spună ce are?”. Răspunsul scurt: nu, și nu. Hai să le luăm pe rând.",
				en: "If you are a parent, you are probably asking two things: “Will it hurt?” and “Will it tell me what is wrong?” The short answer: no, and no. Let us take them in turn.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce este, de fapt, o hartă cerebrală QEEG?",
				en: "What exactly is a QEEG brain map?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Creierul produce în permanență semnale electrice foarte mici. Senzorii așezați pe scalp le prind, fără să trimită nimic înapoi. Un EEG obișnuit îl citește un specialist, pe hârtie sau pe ecran, ca pe o partitură. În QEEG (EEG cantitativ), semnalul este în plus măsurat și prelucrat de un program, care îl împarte pe ritmuri și zone și îl pune în hărți colorate.",
				en: "The brain constantly produces very small electrical signals. Sensors placed on the scalp pick them up without sending anything back. An ordinary EEG is read by a specialist, on paper or on a screen, like a musical score. In QEEG (quantitative EEG), the signal is also measured and processed by a program, which splits it by rhythm and area and turns it into coloured maps.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Dacă harta e comparată cu o bază de date de persoane de aceeași vârstă, spunem ce se abate de la medie, nu ce este „bolnav”. O abatere nu înseamnă o problemă, la fel cum un copil înalt nu are o boală. Sensul îl dă contextul: ce observi tu, ce vedem noi în evaluare, ce spune istoricul copilului.",
				en: "If the map is compared with a database of people of the same age, we say what differs from the average, not what is “ill”. A difference is not a problem, just as a tall child does not have a disease. Context gives the meaning: what you observe, what we see in the assessment, what the child's history says.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum decurge înregistrarea și doare?",
				en: "How does the recording go, and does it hurt?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Nu doare. Serviciul național de sănătate din Marea Britanie (NHS) descrie EEG-ul ca pe un test nedureros, iar harta QEEG se bazează pe aceeași înregistrare. Nimic nu intră în corp și nu trece curent prin cap: senzorii doar ascultă.",
				en: "It does not hurt. The UK's National Health Service (NHS) describes the EEG as a painless test, and a QEEG map rests on the same kind of recording. Nothing enters the body and no current passes through the head: the sensors only listen.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Iată cum arată, de obicei, o înregistrare. Stai pe un scaun confortabil, într-o cameră liniștită. Ți se pune pe cap o cască elastică, pe care sunt fixați senzorii; uneori se folosește puțin gel sau pastă pentru contactul cu pielea, pe care îl speli apoi cu apă. Ți se explică ce urmează, iar la un copil, mai ales mic, îi arătăm întâi casca pe o jucărie sau pe mâna părintelui.",
				en: "This is what a recording usually looks like. You sit in a comfortable chair, in a quiet room. An elastic cap with the sensors fixed to it goes on your head; sometimes a little gel or paste is used for contact with the skin, which you wash out afterwards with water. What comes next is explained, and with a child, especially a young one, we first show the cap on a toy or on the parent's hand.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Apoi ți se cere, pe rând, să stai relaxat cu ochii închiși, apoi cu ochii deschiși, uneori să faci o sarcină simplă, cum ar fi citirea unui text. Contează să stai cât mai nemișcat, pentru că mișcarea ochilor, a maxilarului sau a umerilor apare în semnal ca zgomot. Pentru un copil, o poveste scurtă sau un film liniștit între etape ajută mult.",
				en: "Then you are asked, in turn, to sit relaxed with your eyes closed, then with your eyes open, and sometimes to do a simple task such as reading a text. It matters to stay as still as possible, because movement of the eyes, jaw or shoulders shows up in the signal as noise. For a child, a short story or a quiet film between stages helps a great deal.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Cât durează? Înregistrarea propriu-zisă e scurtă, iar cu pregătirea, orientativ, vizita e de ordinul unei ore. Un EEG clinic, în spital, ia de obicei aproximativ o oră, potrivit NHS. Durata exactă pentru copilul tău o afli la programare.",
				en: "How long does it take? The recording itself is short, and with preparation the visit is, as a rough guide, around an hour. A clinical EEG in hospital usually takes about an hour, according to the NHS. You will learn the exact length for your child when you book.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce sunt benzile delta, theta, alfa și beta?",
				en: "What are the delta, theta, alpha and beta bands?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Semnalul din creier nu este o singură undă, ci mai multe ritmuri suprapuse, ca instrumentele într-o orchestră. Le împărțim după viteză, de la cele mai lente la cele mai rapide.",
				en: "The signal from the brain is not one wave but several overlapping rhythms, like the instruments of an orchestra. We divide them by speed, from the slowest to the fastest.",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "Delta: cel mai lent ritm, asociat în special cu somnul profund.",
					en: "Delta: the slowest rhythm, associated above all with deep sleep.",
				},
				{
					ro: "Theta: ritm lent, care apare în starea de moleșeală, la adormire și în visare cu ochii deschiși.",
					en: "Theta: a slow rhythm, seen in drowsiness, falling asleep and daydreaming.",
				},
				{
					ro: "Alfa: ritm de repaus treaz, mai ales când stai relaxat cu ochii închiși.",
					en: "Alpha: the rhythm of relaxed wakefulness, above all when you sit relaxed with your eyes closed.",
				},
				{
					ro: "Beta: ritm rapid, al stării active, al gândirii și al atenției, dar și al încordării.",
					en: "Beta: a fast rhythm of activity, thinking and attention, but also of tension.",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "Fiecare om le are pe toate patru, în fiecare moment. Harta arată cât din fiecare e prezent în fiecare zonă și cum se comportă când treci de la ochi închiși la ochi deschiși. Nu există un ritm „bun” și unul „rău”: contează echilibrul și potrivirea cu situația.",
				en: "Everybody has all four, at every moment. The map shows how much of each is present in each area and how they behave when you move from eyes closed to eyes open. There is no “good” rhythm and “bad” rhythm: what matters is balance and fit with the situation.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pentru amatorii de cifre, bandurile se definesc prin intervale de frecvență, iar limitele diferă puțin de la o sursă la alta. De aceea, într-un raport, tot ce vezi are explicația lui scrisă.",
				en: "For those who like numbers, the bands are defined by frequency ranges, and the limits differ slightly from one source to another. That is why, in a report, everything you see comes with its written explanation.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce poate și ce nu poate spune o hartă cerebrală?",
				en: "What can and what can't a brain map tell you?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Poate arăta cum lucrează creierul în acel moment: dacă un ritm e mai prezent decât la vârsta respectivă, dacă zonele se sincronizează diferit, dacă se schimbă între ochi închiși și deschiși. Poate ajuta la alegerea obiectivelor și, apoi, la compararea cu o a doua hartă, ca să vezi ce s-a schimbat.",
				en: "It can show how the brain is working at that moment: whether a rhythm is more present than at that age, whether areas synchronise differently, whether things change between eyes closed and eyes open. It can help choose goals and then be compared with a second map, so you can see what has changed.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Nu poate pune singură un diagnostic. Neurologii americani (AAN) au analizat un indicator QEEG folosit în ADHD, raportul theta/beta, și l-au considerat un instrument încă de cercetare. O revizuire sistematică a studiilor QEEG la copii cu afecțiuni psihice, publicată în 2019, a cuprins 33 de studii cu 2.268 de tineri și a arătat unele diferențe la grupuri, de exemplu un raport theta/beta mai mare în ADHD, dar a rămas neclar dacă acestea separă clar o afecțiune de alta.",
				en: "It cannot make a diagnosis on its own. American neurologists (the AAN) examined one QEEG measure used in ADHD, the theta/beta ratio, and judged it a tool still at the research stage. A systematic review of QEEG studies in young people with psychiatric conditions, published in 2019, covered 33 studies with 2,268 young people and showed some group differences, for example a higher theta/beta ratio in ADHD, but it stayed unclear whether these clearly separate one condition from another.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Nici nu înlocuiește un EEG clinic cerut de neurolog, dacă există suspiciunea unei epilepsii sau a altei boli neurologice. Ele răspund la întrebări diferite.",
				en: "Nor does it replace a clinical EEG requested by a neurologist if epilepsy or another neurological illness is suspected. They answer different questions.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum folosim harta într-un plan, nu ca diagnostic?",
				en: "How do we use the map in a plan, not as a diagnosis?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Harta este o piesă dintr-o evaluare mai largă. Alături de ea sunt discuția cu tine, chestionarele, observația și, când e cazul, rapoartele de la școală sau de la medic. Din toate acestea hotărâm împreună ce urmează: poate terapie, poate sprijin la școală, poate un consult medical, poate și neurofeedback, ca metodă complementară.",
				en: "The map is one piece of a wider assessment. Beside it are the conversation with you, questionnaires, observation and, where relevant, reports from school or the doctor. From all of this we decide together what comes next: perhaps therapy, perhaps school support, perhaps a medical consultation, perhaps neurofeedback as a complementary method.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Dacă alegem să lucrăm cu neurofeedback, harta devine și un punct de plecare. După câteva săptămâni sau luni, stabilite din timp, repetăm măsurătoarea și îți arătăm ce s-a schimbat și ce nu. Așa se vede schimbarea, nu doar se simte. Iar dacă nu s-a schimbat nimic, spunem și asta.",
				en: "If we choose to work with neurofeedback, the map also becomes a starting point. After a few weeks or months, agreed in advance, we repeat the measurement and show you what has changed and what has not. That is how change is seen, not only felt. And if nothing has changed, we say that too.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce primești la final?",
				en: "What do you get at the end?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Nu pleci cu o foaie cu cifre pe care nu o înțelegi. La final stăm de vorbă: îți arătăm hărțile, îți explicăm în cuvinte simple ce vedem și ce nu putem spune, și ce propunem mai departe. Primești un raport scris, cu explicații, pe care îl poți arăta medicului sau școlii, dacă vrei.",
				en: "You do not leave with a sheet of numbers you cannot understand. At the end we talk: we show you the maps, explain in simple words what we see and what we cannot say, and what we propose next. You receive a written report, with explanations, which you can show to your doctor or school if you wish.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Poți spune copilului: „Punem o pălărie cu senzori, care doar ascultă cum lucrează creierul tău. Stai liniștit, nu doare și nu trebuie să răspunzi la nimic corect.” Pentru mulți copii, faptul că nu e un test e cea mai mare ușurare.",
				en: "You can tell your child: “We put on a hat with sensors that just listens to how your brain works. Sit quietly, it does not hurt and you do not have to answer anything correctly.” For many children, the fact that it is not a test is the biggest relief.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum te pregătești pentru înregistrare?",
				en: "How do you prepare for the recording?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Vino cu părul curat și uscat, fără gel, ceară sau coafuri strânse, pentru că senzorii prind mai bine semnalul când contactul cu pielea e bun. Dacă ai un copil mic, alege o oră în care nu e obosit și nu îi e foame. Un copil flămând sau adormit produce o hartă care vorbește mai mult despre foame sau somn decât despre atenție.",
				en: "Come with clean, dry hair, without gel, wax or tight styles, because the sensors pick up the signal better when contact with the skin is good. If your child is small, choose a time when they are neither tired nor hungry. A hungry or sleepy child produces a map that says more about hunger or sleep than about attention.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Spune-ne dinainte ce medicamente ia copilul sau tu, dacă ai avut recent nopți proaste, o boală sau un eveniment care a răvășit zilele. Nu pentru a opri ceva, ci ca să citim harta cu aceste informații în față. Nu schimba și nu opri nicio medicație înaintea înregistrării; despre asta se vorbește cu medicul psihiatru sau cu medicul de familie.",
				en: "Tell us beforehand what medicines your child or you take, and whether you have recently had bad nights, an illness or an event that turned the days upside down. Not so that anything is stopped, but so that we read the map with that information in front of us. Do not change or stop any medication before the recording; that is a conversation for the psychiatrist or family doctor.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Și, dacă te frământă ceva, întreabă. Mai bine cinci întrebări înainte decât o neliniște după. Dacă ți-e teamă că rezultatul va „dovedi” că ceva nu e în regulă, ține minte că harta descrie un moment, nu un destin, și că nimeni nu o citește în afara contextului în care a fost făcută.",
				en: "And if something is bothering you, ask. Better five questions beforehand than one worry afterwards. If you fear the result will “prove” that something is wrong, remember that the map describes a moment, not a destiny, and that nobody reads it outside the context in which it was made.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Pentru cine nu este necesară o hartă cerebrală?",
				en: "Who does not need a brain map?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Nu orice copil sau adult are nevoie de ea. Dacă întrebarea ta se poate lămuri cu o discuție, un chestionar sau o evaluare psihologică, harta nu adaugă nimic. Nu e potrivită nici ca „verificare” pentru un om care nu are nicio îngrijorare, și nu e un test de inteligență, de personalitate sau de „talent”. Iar dacă există semne de alarmă neurologice, de exemplu crize, pierderi bruște de conștiență sau o schimbare bruscă a comportamentului, primul pas este medicul, nu harta.",
				en: "Not every child or adult needs one. If your question can be answered by a conversation, a questionnaire or a psychological assessment, the map adds nothing. It is not suitable as a “check-up” for someone with no concerns, and it is not a test of intelligence, personality or “talent”. And if there are neurological warning signs, such as seizures, sudden loss of consciousness or a sudden change in behaviour, the first step is the doctor, not the map.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Dacă tu sau cineva apropiat sunteți în pericol imediat, sunați la 112.",
				en: "If you or someone close to you is in immediate danger, call 112.",
			},
		},
		{
			type: "quote",
			text: {
				ro: "Facem o hartă cerebrală, apoi îți arătăm ce s-a schimbat.",
				en: "We make a brain map, then we show you what has changed.",
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
				ro: "Evaluarea. Prima discuție este despre voi, nu despre diagnostic. În funcție de ce ne spui, hotărâm împreună dacă o hartă QEEG are sens în cazul tău. Psizone, în Galați, oferă QEEG ca metodă complementară, recomandată în anumite situații după evaluarea individuală, care nu înlocuiește recomandările psihologice, educaționale, logopedice sau medicale. Pentru durată, disponibilitate și tarife, întreabă-ne la programare.",
				en: "The assessment. The first conversation is about the two of you, not about a diagnosis. Depending on what you tell us, we decide together whether a QEEG map makes sense in your case. Psizone, in Galați, offers QEEG as a complementary method, recommended in certain situations after an individual assessment, and it does not replace psychological, educational, speech-therapy or medical recommendations. For duration, availability and fees, ask us when you book.",
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
		"https://www.nhs.uk/conditions/electroencephalogram/: EEG painless, usually about an hour, electrodes with paste, eyes open/closed",
		"https://pubmed.ncbi.nlm.nih.gov/28058208/ (Nuwer, Buchhalter, Shepard 2016, Neurol Clin Pract; via Europe PMC record): theta/beta ratio, AAN judged it investigational",
		"https://pubmed.ncbi.nlm.nih.gov/31300243/ (McVoy 2019, Psychiatry Res; via Europe PMC record): 33 studies, 2,268 youths aged 4 to 18, higher theta/beta in ADHD, unclear specificity",
		"https://psizone.ro: QEEG and neurofeedback complementary after individual evaluation; durations and fees on enquiry",
		"Band descriptions are the standard textbook characterisation, kept qualitative (no Hz limits) because boundaries differ between sources",
		"docs/brands/writing-voice.md; packages/design/brand-books/1-psizone.md",
	],
	seo: {
		title: {
			ro: "Hartă cerebrală QEEG: ce este, cum decurge, ce arată",
			en: "QEEG brain map: what it is, how it works, what it shows",
		},
		description: {
			ro: "Ce este o hartă cerebrală QEEG, cum decurge înregistrarea, dacă doare și ce poate sau nu poate spune. Explicat simplu, de psihologi din Galați.",
			en: "What a QEEG brain map is, how the recording goes, whether it hurts and what it can and cannot tell you. Explained simply by psychologists in Galați.",
		},
		keywords: {
			ro: [
				"hartă cerebrală qeeg",
				"qeeg ce este",
				"qeeg copii",
				"unde cerebrale delta theta alfa beta",
				"EEG cantitativ",
				"hartă cerebrală Galați",
			],
			en: [
				"QEEG brain map",
				"what is QEEG",
				"QEEG for children",
				"brain waves delta theta alpha beta",
				"quantitative EEG",
				"brain mapping Galați",
			],
		},
	},
	faq: [
		{
			q: { ro: "Doare harta cerebrală QEEG?", en: "Does a QEEG brain map hurt?" },
			a: {
				ro: "Nu. Senzorii de pe cască doar citesc semnalul electric al creierului; nu trimit curent și nu intră nimic în corp. Poate fi puțin neplăcută atingerea gelului sau strânsoarea căștii, iar gelul se spală cu apă. La copii mici arătăm întâi casca pe o jucărie sau pe mâna părintelui.",
				en: "No. The sensors on the cap only read the brain's electrical signal; they send no current and nothing enters the body. The touch of the gel or the snugness of the cap may feel slightly odd, and the gel washes out with water. With young children we first show the cap on a toy or on the parent's hand.",
			},
		},
		{
			q: {
				ro: "Poate o hartă QEEG să pună un diagnostic?",
				en: "Can a QEEG map make a diagnosis?",
			},
			a: {
				ro: "Nu singură. Harta arată cum lucrează ritmurile creierului, dar un diagnostic se pune pe baza unei evaluări complete, cu discuție, observație și chestionare. Neurologii americani au considerat, de exemplu, raportul theta/beta din ADHD un instrument încă investigativ. La noi, harta ajută la plan, nu înlocuiește evaluarea.",
				en: "Not on its own. The map shows how the brain's rhythms behave, but a diagnosis rests on a full assessment with conversation, observation and questionnaires. American neurologists, for example, considered the theta/beta ratio in ADHD an investigational tool. For us, the map helps with the plan; it does not replace the assessment.",
			},
		},
		{
			q: { ro: "Cât durează o înregistrare QEEG?", en: "How long does a QEEG recording take?" },
			a: {
				ro: "Înregistrarea propriu-zisă e scurtă, iar cu așezarea căștii și explicațiile, vizita este, orientativ, de ordinul unei ore. Un EEG clinic în spital durează de obicei aproximativ o oră, potrivit NHS. Durata exactă pentru copilul sau pentru tine o afli la programare.",
				en: "The recording itself is short, and with fitting the cap and the explanations, the visit is, as a rough guide, around an hour. A clinical EEG in hospital usually takes about an hour, according to the NHS. You will learn the exact length for your child or yourself when you book.",
			},
		},
		{
			q: { ro: "Ce primesc după hartă?", en: "What do I get after the map?" },
			a: {
				ro: "O discuție în care îți arătăm hărțile și îți explicăm în cuvinte simple ce vedem și ce nu putem spune, plus un raport scris cu explicații. Îl poți arăta medicului sau școlii. Apoi stabilim împreună ce urmează, iar dacă alegem un antrenament, repetăm harta mai târziu ca să vezi schimbarea.",
				en: "A conversation in which we show you the maps and explain in simple words what we see and what we cannot say, plus a written report with explanations. You can show it to your doctor or school. Then we decide together what comes next, and if we choose a training, we repeat the map later so you can see the change.",
			},
		},
		{
			q: { ro: "Cine nu are nevoie de o hartă cerebrală?", en: "Who does not need a brain map?" },
			a: {
				ro: "Cine poate primi răspunsul dintr-o discuție sau dintr-o evaluare psihologică. Nici cine nu are nicio îngrijorare, nici cine caută un test de inteligență sau de personalitate. Iar dacă există crize, pierderi bruște de conștiență sau o schimbare bruscă a comportamentului, primul pas este medicul.",
				en: "Anyone whose question can be answered by a conversation or a psychological assessment. Nor does someone with no concerns, or someone looking for an intelligence or personality test. And if there are seizures, sudden loss of consciousness or a sudden change in behaviour, the first step is the doctor.",
			},
		},
	],
	related: [
		"qeeg-sau-eeg-care-este-diferenta",
		"qeeg-la-copii-cum-decurge-inregistrarea",
		"undele-cerebrale-alfa-beta-theta-delta",
		"ce-rapoarte-primesti-dupa-evaluare",
	],
};
