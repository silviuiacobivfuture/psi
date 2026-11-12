import type { ArticleInput } from "../../../schema";

export const article: ArticleInput = {
	slug: "cat-dureaza-o-evaluare-psihologica-copil",
	brand: "psizone",
	topic: "cum-lucram",
	backlogNo: null,
	status: "draft",
	kind: "editorial",
	aiDrafted: true,
	draftedAt: "2026-11-12",
	author: null,
	reviewer: null,
	title: {
		ro: "Cât durează o evaluare psihologică a copilului",
		en: "How long a child psychological evaluation takes",
	},
	standfirst: {
		ro: "De obicei nu e o singură întâlnire scurtă: o evaluare serioasă înseamnă una sau mai multe vizite, uneori cu pauze, iar numărul lor depinde de vârstă, de întrebarea cu care vii și de ce descoperim pe parcurs. Durata exactă ți-o spunem la programare, nu o promitem dinainte.",
		en: "It is usually not one short meeting: a serious evaluation means one or more visits, sometimes with breaks, and how many depends on age, on the question you bring and on what we find along the way. You are told the exact length when you book; we do not promise it in advance.",
	},
	body: [
		{
			type: "p",
			text: {
				ro: "O evaluare psihologică a unui copil nu are o durată fixă. Pentru majoritatea copiilor înseamnă mai mult decât o singură oră: de la o întâlnire mai lungă, cu pauze, până la câteva întâlniri mai scurte, repartizate pe zile sau săptămâni. Asta e o descriere orientativă, din practică, nu o cifră promisă. Durata exactă pentru copilul tău o afli la programare, de la centru.",
				en: "A child’s psychological evaluation has no fixed length. For most children it means more than a single hour: from one longer meeting with breaks to several shorter meetings spread over days or weeks. That is a rough description from practice, not a guaranteed figure. You learn the exact length for your child when you book, from the centre.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Probabil te întrebi, în spatele întrebării, dacă trebuie să ceri liber de la serviciu pentru o zi întreagă și dacă ți-l vei ține pe copil ore în șir într-un loc străin. Nu. Mai jos vezi de ce variază timpul, cum se petrec etapele și cum ținem seama de oboseala unui copil.",
				en: "Behind the question you are probably asking whether you need to take a whole day off work and whether your child will be kept for hours in a strange place. No. Below you can see why the time varies, how the stages unfold and how we take a child’s tiredness into account.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "De ce nu putem spune un număr fix de ore?",
				en: "Why can we not give a fixed number of hours?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pentru că evaluarea nu este un test cu un număr de itemi, ci un răspuns la o întrebare. „De ce îi este greu la citit?” cere altceva decât „de ce nu doarme?” sau „vorbește puțin pentru vârsta lui?”. Pe site-ul Psizone scrie că evaluarea inițială orientează obiectivele, specialiștii implicați și etapele intervenției; adică forma ei depinde de ce ai adus.",
				en: "Because an evaluation is not a test with a fixed number of items; it is an answer to a question. “Why does he find reading hard?” needs something different from “why doesn’t he sleep?” or “does he speak little for his age?”. The Psizone site says the initial evaluation shapes the goals, the specialists involved and the stages of the intervention; in other words its form depends on what you bring.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Mai contează cât de mult se știe deja. Un copil care vine cu rapoarte de la medic și de la școală cere mai puțin timp de strâns informații decât unul pentru care nu există niciun act. Și contează ce găsim pe parcurs: uneori o întrebare simplă se dovedește a avea două straturi, iar al doilea strat cere încă o întâlnire. Nu ne grăbim doar ca să încadrăm totul într-un interval.",
				en: "It also matters how much is already known. A child who comes with reports from a doctor and from school needs less time spent gathering information than one for whom there is no paperwork. And it matters what we find along the way: sometimes a simple question turns out to have two layers, and the second layer needs another meeting. We do not rush simply to squeeze everything into a set interval.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Care sunt etapele unei evaluări?",
				en: "What are the stages of an evaluation?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Nu există o singură schemă, dar ghidurile pentru evaluarea copiilor arată de obicei aceleași piese. Ghidul britanic NICE pentru autism la copii și tineri, de exemplu, descrie o evaluare completă ca incluzând întrebări detaliate despre îngrijorările părinților, experiențele copilului acasă și la școală, istoricul dezvoltării, observarea copilului în interacțiune cu specialistul, istoricul medical și o schiță a punctelor tari, a dificultăților și a nevoilor. Pentru o evaluare mai îngustă, piesele sunt mai puține. Iată cum arată, pe scurt, etapele la noi:",
				en: "There is no single scheme, but guidelines for evaluating children usually show the same pieces. The British NICE guideline on autism in children and young people, for example, describes a full assessment as including detailed questions about the parents’ concerns, the child’s experiences at home and at school, a developmental history, observation of the child interacting with the specialist, a medical history, and a profile of strengths, difficulties and needs. For a narrower evaluation there are fewer pieces. Here is how the stages look with us, in brief:",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "Discuția cu părinții: ce vă îngrijorează, de când, ce ați încercat, cum arată o zi obișnuită.",
					en: "The conversation with the parents: what worries you, since when, what you have tried, what an ordinary day looks like.",
				},
				{
					ro: "Istoricul: dezvoltarea, sănătatea, școala, rapoartele existente.",
					en: "The history: development, health, school, existing reports.",
				},
				{
					ro: "Întâlnirea cu copilul: joc, conversație, sarcini potrivite vârstei, prin care îl cunoaștem și îl observăm.",
					en: "Meeting the child: play, conversation, age-appropriate tasks through which we get to know and observe him.",
				},
				{
					ro: "Informații din alte locuri, cu acordul tău: școală, grădiniță, medic.",
					en: "Information from other places, with your agreement: school, nursery, doctor.",
				},
				{
					ro: "Punerea laolaltă: ce am văzut, ce înseamnă și ce propunem.",
					en: "Putting it together: what we saw, what it means and what we propose.",
				},
				{
					ro: "Discuția de încheiere cu tine și raportul scris.",
					en: "The closing conversation with you and the written report.",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "Unele etape se pot face în aceeași zi. Altele cer timp: o hartă cerebrală, dacă avem motive să o facem, e o întâlnire în sine, iar un raport de la școală nu apare peste noapte. Nu orice copil are nevoie de o hartă, iar aceasta nu pune diagnostic.",
				en: "Some stages can happen on the same day. Others need time: a brain map, if we have reason to do one, is a meeting of its own, and a report from school does not appear overnight. Not every child needs a map, and a map does not diagnose.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum influențează vârsta durata?",
				en: "How does age affect the length?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Mult. Un copil mic obosește repede și lucrează cel mai bine în joc, în ședințe mai scurte; de aceea, o evaluare la un preșcolar se împarte adesea în mai multe întâlniri scurte, nu într-una lungă. Un școlar poate sta mai mult și poate răspunde la sarcini mai structurate. Un adolescent vrea, de cele mai multe ori, să fie ascultat înaintea tuturor și să nu fie vorbit pe deasupra capului lui.",
				en: "A great deal. A small child tires quickly and works best through play, in shorter sessions; that is why an evaluation of a pre-schooler is often split into several short meetings rather than one long one. A school-age child can stay longer and respond to more structured tasks. A teenager most often wants to be listened to first and not talked over.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "De ce facem pauze și când avem nevoie de mai multe întâlniri?",
				en: "Why do we take breaks and when do we need more meetings?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pentru că un copil obosit sau flămând arată altceva decât copilul tău. Un test făcut în ora a patra de concentrare nu măsoară atenția, ci oboseala. Pauzele de câteva minute, o gustare, o oră de joc liber sunt parte din evaluare. Dacă un copil nu poate sau nu vrea azi, nu insistăm: ne revedem altă zi, cu rezultate mai fidele.",
				en: "Because a tired or hungry child looks different from your child. A test done in the fourth hour of concentration measures not attention but tiredness. Breaks of a few minutes, a snack, an hour of free play are part of the evaluation. If a child cannot or will not today, we do not insist: we meet another day, with more faithful results.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Mai multe întâlniri sunt necesare și atunci când răspunsurile nu se potrivesc între ele: ce spune școala diferă de ce vedem noi, ori copilul se poartă altfel acasă decât la cabinet. Ghidul NICE sugerează tocmai asta: dacă între simptomele raportate și observația clinică apar discrepanțe, se pot aduna informații suplimentare sau se pot face observații suplimentare. Mai bine o întâlnire în plus decât o concluzie pripită.",
				en: "More meetings are also needed when the answers do not match one another: what school says differs from what we see, or the child behaves differently at home from at the centre. The NICE guideline suggests exactly this: when discrepancies appear between reported symptoms and clinical observation, additional information can be gathered or further observation carried out. Better one more meeting than a hasty conclusion.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum arată, concret, o întâlnire cu copilul?",
				en: "What does a meeting with the child look like, concretely?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Imaginează-ți o cameră liniștită, cu o masă joasă, hârtie, creioane și câteva jucării. Copilul intră, se uită în jur și, dacă vrea, se așază pe covor. Nu începem cu „spune-mi ce ai”. Începem cu „ce ți-a plăcut azi la școală?” sau cu un desen. Un copil care se simte în siguranță arată mult mai ușor cum gândește, cum se joacă și cum cere ajutor.",
				en: "Picture a quiet room with a low table, paper, pencils and a few toys. The child comes in, looks around and, if he wants, sits on the rug. We do not begin with “tell me what’s wrong”. We begin with “what did you enjoy at school today?” or with a drawing. A child who feels safe shows far more easily how he thinks, how he plays and how he asks for help.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Apoi vin sarcinile potrivite vârstei, amestecate cu joc: de pildă povestit o imagine, construit ceva, răspuns la întrebări scurte. Specialistul observă mai ales cum încearcă copilul, nu doar dacă reușește: se descurajează repede, cere ajutor, se bucură când reușește, se uită la tine? Din asemenea lucruri se vede uneori mai mult decât dintr-un scor.",
				en: "Then come tasks suited to his age, mixed with play: telling a story from a picture, building something, answering short questions. The specialist watches above all how the child tries, not only whether he succeeds: does he get discouraged quickly, ask for help, enjoy it when he manages, look at you? Such things sometimes show more than a score.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Dacă la un moment dat copilul se oprește, spune că nu mai vrea sau începe să plângă, nu e un eșec al evaluării, ci informație utilă și un motiv de pauză. Nu forțăm și nu negociem un „încă puțin”. Putem continua după pauză sau ne revedem într-o altă zi.",
				en: "If at some point the child stops, says he does not want to go on or begins to cry, that is not a failure of the evaluation but useful information and a reason for a break. We do not force it and we do not negotiate “just a little more”. We can carry on after a break or meet again another day.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce se schimbă dacă sunt implicați mai mulți specialiști?",
				en: "What changes if several specialists are involved?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Timpul crește, dar nu în mod egal cu numărul specialiștilor. Centrul lucrează, între altele, cu psihologi, logopezi și terapeuți de integrare senzorială. Dacă întrebarea ta atinge mai multe domenii, de exemplu vorbire, atenție și comportament la masă, evaluarea inițială arată ce specialiști sunt potriviți. Ghidul NICE avertizează și el împotriva repetării inutile: profesioniștii ar trebui să comunice eficient între ei, ca să se evite adunarea repetată de informații și evaluările duble.",
				en: "Time grows, but not in step with the number of specialists. The centre works, among others, with psychologists, speech therapists and sensory integration therapists. If your question touches several areas, for example speech, attention and behaviour at meals, the initial evaluation shows which specialists fit. The NICE guideline likewise warns against pointless repetition: professionals should communicate efficiently so that repeated information gathering and duplicate assessments are avoided.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pentru tine asta înseamnă o regulă simplă: dă informațiile o singură dată, pe larg, iar noi le păstrăm și le folosim. Nu te trimitem de la un birou la altul să repeți aceeași poveste. Dacă ai deja rapoarte de la alți specialiști, adu-le: scurtează drumul.",
				en: "For you this means one simple rule: give the information once, fully, and we keep it and use it. We do not send you from one desk to another to repeat the same story. If you already have reports from other specialists, bring them: they shorten the road.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Când primești rezultatele?",
				en: "When do you get the results?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Nu la ușă, în picioare, după prima oră. Rezultatele cer timp de punere laolaltă: ce am observat, ce arată probele, ce spun rapoartele. Apoi stăm de vorbă cu tine, îți explicăm în cuvinte simple ce am văzut și ce nu putem spune, și îți spunem ce propunem mai departe. Primești și un raport scris, pe care îl poți arăta medicului sau școlii.",
				en: "Not at the door, standing up, after the first hour. Results need time to put together: what we observed, what the tasks show, what the reports say. Then we sit down with you, explain in plain words what we saw and what we cannot say, and tell you what we propose next. You also receive a written report that you can show to a doctor or the school.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Intervalul dintre ultima întâlnire cu copilul și discuția de încheiere îl stabilim din timp și ți-l spunem, ca să nu aștepți în ceață. Dacă la final rămâne o incertitudine, o spunem așa cum e. Ghidul NICE, pentru autism, spune la fel: dacă după evaluare există îndoieli despre diagnostic, copilul poate fi ținut sub observație, ținând cont de informațiile noi.",
				en: "We agree the interval between the last meeting with the child and the closing conversation in advance and tell you, so you are not left waiting in fog. If some uncertainty remains at the end, we say so as it is. The NICE guideline, for autism, says the same: if doubt about the diagnosis remains after the assessment, the child can be kept under review, taking new information into account.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce faci între timp, cât durează evaluarea?",
				en: "What do you do in the meantime, while the evaluation takes its course?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Alege, pe cât se poate, ore în care copilul e odihnit, nu imediat după o zi lungă de școală sau după un somn întrerupt. Dă-i de mâncare și apă înainte, și ia cu tine o gustare simplă pentru pauze. Dacă are ochelari sau aparat auditiv, nu-i lăsa acasă. Dacă ia medicamente prescrise de medic, dă-i-le ca de obicei, fără să schimbi nimic, și spune-ne ce ia; orice schimbare se discută cu medicul.",
				en: "Choose, as far as you can, times when the child is rested, not right after a long school day or a broken night. Give him food and water beforehand and bring a simple snack for the breaks. If he has glasses or a hearing aid, do not leave them at home. If he takes medicines prescribed by a doctor, give them as usual, changing nothing, and tell us what he takes; any change is discussed with the doctor.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Și ai grijă de tine. Se întâmplă ca părintele să fie mai neliniștit decât copilul. Copiii simt asta. Dacă ție ți-e greu, spune-ne; avem timp și pentru întrebările tale, nu doar pentru ale copilului.",
				en: "And look after yourself. It sometimes happens that the parent is more anxious than the child. Children sense it. If it is hard for you, tell us; we have time for your questions too, not only for the child’s.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Trăiește ca de obicei. Nu schimba brusc rutina copilului, nu începe diete sau terapii noi pe cont propriu și nu opri nicio medicație; despre medicație se vorbește cu medicul. Ține, în schimb, câteva însemnări simple: o situație concretă pe săptămână în care ți-a fost greu, una în care a mers bine și ce a spus educatoarea sau învățătoarea. Ne ajută mai mult decât un caiet întreg scris de teamă.",
				en: "Live as usual. Do not suddenly change the child’s routine, do not begin new diets or therapies on your own, and do not stop any medication; medication is discussed with the doctor. Do keep a few simple notes instead: one concrete situation a week where it was hard, one where it went well, and what the teacher said. They help us more than a whole notebook written out of fear.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Spune-i copilului adevărul, simplu. Poți zice: „Mergem la o doamnă care se joacă și îți pune întrebări, ca să înțelegem cum îți putem face lucrurile mai ușoare. Nu e un examen și nu există răspunsuri greșite.” Evită „mergem să vedem ce nu e în regulă cu tine”. Prima discuție este despre voi, nu despre diagnostic.",
				en: "Tell the child the truth, simply. You can say: “We are going to see a lady who plays and asks you questions, so we can understand how to make things easier for you. It is not an exam and there are no wrong answers.” Avoid “we are going to see what is wrong with you”. The first conversation is about you, not about a diagnosis.",
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
			type: "h2",
			text: {
				ro: "Care este pasul următor?",
				en: "What is the next step?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Programează evaluarea și întreabă, la programare, câte întâlniri crede specialistul că vor fi necesare și cam cât durează fiecare. Informațiile despre disponibilitate, durată și tarife le primești direct de la centru.",
				en: "Book the evaluation and ask, when you book, how many meetings the specialist expects to be needed and roughly how long each one lasts. Information about availability, duration and fees comes directly from the centre.",
			},
		},
	],
	sources: [
		{
			label: {
				ro: "NICE CG128: autismul la copii și tineri, diagnostic (evaluarea, etapele, discrepanțe, urmărire)",
				en: "NICE CG128: autism in under 19s, recognition, referral and diagnosis (assessment, stages, discrepancies, review)",
			},
			href: "https://www.nice.org.uk/guidance/cg128/chapter/Recommendations",
		},
		{
			label: {
				ro: "NIMH: Psihoterapii (întrebări de pus: obiective, număr de ședințe, implicarea părinților)",
				en: "NIMH: Psychotherapies (questions to ask: goals, number of sessions, parents’ involvement)",
			},
			href: "https://www.nimh.nih.gov/health/topics/psychotherapies",
		},
		{
			label: {
				ro: "Psizone: serviciile și evaluarea inițială",
				en: "Psizone: services and the initial evaluation",
			},
			href: "https://psizone.ro",
		},
	],
	provenance: [
		"https://www.nice.org.uk/guidance/cg128/chapter/Recommendations (1.5.5 what every assessment includes; 1.5.8 profile areas; 1.5.9 discrepancies lead to extra information or observation; 1.4.7 school report, hearing and vision results; follow-up and keeping under review when uncertain). It is an autism guideline, used here only as an example of what a thorough child assessment contains; it gives no total duration.)",
		"https://www.nimh.nih.gov/health/topics/psychotherapies (for a child, ask how parents will be involved; ask goals, time frame or number of sessions)",
		"https://psizone.ro (initial evaluation guides goals, specialists, stages; duration and fees via contact)",
		"packages/content/src/articles/library/psizone/harta-cerebrala-qeeg.ts (a map does not diagnose; not every child needs one)",
		"docs/brands/writing-voice.md",
	],
	seo: {
		title: {
			ro: "Cât durează o evaluare psihologică a copilului: întâlniri, etape",
			en: "How long does a child psychological evaluation take?",
		},
		description: {
			ro: "Cât durează o evaluare psihologică a copilului? Răspuns orientativ: una sau mai multe întâlniri. De ce variază timpul, etapele, pauzele și când primești rezultatele.",
			en: "How long does a child psychological evaluation take? A rough answer: one or more meetings. Why it varies, the stages, the breaks and when you get the results.",
		},
		keywords: {
			ro: [
				"cât durează o evaluare psihologică copil",
				"evaluare psihologică copil cum decurge",
				"evaluare psihologică copil Galați",
				"câte ședințe are o evaluare",
				"rezultatele evaluării copilului",
				"evaluare copil preșcolar",
			],
			en: [
				"how long does a child psychological evaluation take",
				"child psychological evaluation how it works",
				"child evaluation Galați",
				"how many sessions is an evaluation",
				"child evaluation results",
				"preschool child evaluation",
			],
		},
	},
	faq: [
		{
			q: {
				ro: "Cât durează o evaluare psihologică a unui copil?",
				en: "How long does a child’s psychological evaluation take?",
			},
			a: {
				ro: "Nu are o durată fixă. Orientativ, înseamnă mai mult decât o singură oră: de la o întâlnire mai lungă, cu pauze, până la câteva întâlniri mai scurte. Depinde de vârstă, de întrebarea pe care o ai și de ce aflăm pe parcurs. Durata exactă o afli la programare, de la centru.",
				en: "It has no fixed length. As a rough guide it means more than a single hour: from one longer meeting with breaks to several shorter meetings. It depends on age, on the question you have and on what we learn along the way. You learn the exact length when you book, from the centre.",
			},
		},
		{
			q: {
				ro: "Se poate face totul într-o singură zi?",
				en: "Can it all be done in one day?",
			},
			a: {
				ro: "Uneori unele etape da, dar nu orice. Un copil mic obosește repede, iar rezultatele sunt mai fidele dacă lucrează odihnit, cu pauze. Rapoartele de la școală sau de la medic cer timp, iar o hartă cerebrală, dacă e cazul, e o întâlnire separată. Mai bine în două zile bune decât într-una obositoare.",
				en: "Sometimes some stages, yes, but not everything. A small child tires quickly, and results are more faithful if he works rested, with breaks. Reports from school or a doctor take time, and a brain map, if needed, is a separate meeting. Better two good days than one tiring one.",
			},
		},
		{
			q: {
				ro: "Părintele participă la evaluare?",
				en: "Does the parent take part in the evaluation?",
			},
			a: {
				ro: "Da, mai ales la început: discuția despre îngrijorări, istoric și rapoarte se face cu părinții. NIMH recomandă să întrebi, la un copil, cum vor fi implicați părinții în tratament. Cât stai în cameră cu copilul în restul întâlnirilor depinde de vârsta lui și de ce funcționează mai bine; îți spunem dinainte.",
				en: "Yes, especially at the start: the conversation about concerns, history and reports is held with the parents. NIMH suggests asking, for a child, how parents will be involved in treatment. How much you stay in the room with your child in the other meetings depends on his age and on what works better; we tell you beforehand.",
			},
		},
		{
			q: {
				ro: "Când primim rezultatele evaluării?",
				en: "When do we get the results of the evaluation?",
			},
			a: {
				ro: "După ce punem laolaltă ce am observat, ce arată probele și ce spun rapoartele, nu la ușă după prima oră. Apoi stăm de vorbă, îți explicăm în cuvinte simple ce am văzut și îți dăm un raport scris. Intervalul îl stabilim din timp și ți-l spunem.",
				en: "After we put together what we observed, what the tasks show and what the reports say, not at the door after the first hour. Then we sit down, explain in plain words what we saw and give you a written report. We agree the interval beforehand and tell you.",
			},
		},
		{
			q: {
				ro: "Ce fac dacă l-am programat și copilului îi este frică?",
				en: "What if I have booked and my child is afraid?",
			},
			a: {
				ro: "Spune-i adevărul, simplu: mergeți la o doamnă care se joacă și pune întrebări, ca să înțelegeți cum să-i fie mai ușor; nu e examen și nu există răspunsuri greșite. Spune-ne frica lui la programare, ca să-i arătăm camera și jucăriile înainte să înceapă. Un copil poate cere pauză oricând.",
				en: "Tell him the truth, simply: you are going to see a lady who plays and asks questions, so you can understand how to make things easier for him; it is not an exam and there are no wrong answers. Tell us about his fear when you book, so we can show him the room and the toys before we begin. A child can ask for a break at any time.",
			},
		},
	],
	related: [
		"ce-include-o-evaluare-la-psizone-galati",
		"cum-pregatesti-copilul-pentru-prima-vizita",
		"ce-rapoarte-primesti-dupa-evaluare",
	],
};
