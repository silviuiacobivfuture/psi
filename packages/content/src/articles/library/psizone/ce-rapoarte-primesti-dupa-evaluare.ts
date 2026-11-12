import type { ArticleInput } from "../../../schema";

export const article: ArticleInput = {
	slug: "ce-rapoarte-primesti-dupa-evaluare",
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
		ro: "Ce rapoarte primești după evaluare",
		en: "What reports you receive after an evaluation",
	},
	standfirst: {
		ro: "După o evaluare primești un raport scris: motivul venirii, ce s-a folosit, ce s-a găsit și ce recomandăm. Ți-l explicăm în persoană, pe înțeles, înainte să-l duci la școală sau la medic. Nu e un verdict, iar termenul îl spunem onest, fără promisiuni.",
		en: "After an evaluation you receive a written report: why you came, what was used, what was found and what we recommend. We explain it in person, in plain words, before you take it to school or to the doctor. It is not a verdict, and we state the timing honestly, with no promises.",
	},
	cover: {
		src: "https://psizone.ro/wp-content/uploads/2025/05/487859333_1238497454732574_3867930478048064448_n.jpg",
		alt: {
			ro: "Cabinetul de mapping cerebral de la Psizone: un copil poartă casca QEEG în fața unui specialist, un alt copil stă cu căști lângă un ursuleț de pluș, iar în colț se văd hărți cerebrale.",
			en: "The brain-mapping room at Psizone: one child wears a QEEG cap in front of a specialist, another sits with headphones beside a teddy bear, and brain maps are shown in the corner.",
		},
		width: 557,
		height: 388,
	},
	body: [
		{
			type: "p",
			text: {
				ro: "Ai făcut evaluarea, ai așteptat și acum te întrebi ce ții, de fapt, în mână: un document de zece pagini cu cifre? O sentință? Pe scurt, raportul de evaluare este explicația scrisă a ce s-a făcut și a ce s-a înțeles, cu recomandări pentru pașii următori. Ghidul Colegiului Psihologilor din România spune că rezultatul unei evaluări se înregistrează tocmai așa: într-un raport de evaluare, înmânat clientului sau unor terți relevanți. Mai jos vezi din ce e făcut, cum îl citești și la ce îți folosește.",
				en: "You have done the evaluation, you have waited, and now you wonder what you are actually holding: a ten-page document of numbers? A sentence? In short, the evaluation report is the written account of what was done and what was understood, with recommendations for the next steps. The guide of the College of Psychologists of Romania says that the result of an evaluation is recorded in just this way: in an evaluation report, handed to the client or to relevant third parties. Below you will see what it is made of, how to read it and what it is for.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Din ce părți e făcut un raport de evaluare?",
				en: "What parts does an evaluation report have?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Nu există o formă unică, iar structura exactă a raportului nostru ți-o arătăm la discuția de explicare. Rapoartele de evaluare psihologică au însă, de obicei, aceeași arhitectură. Un ghid pentru părinți despre evaluările psiho-educaționale, publicat în Statele Unite, descrie secțiuni precum:",
				en: "There is no single form, and we show you the exact structure of our report at the explanation meeting. Psychological evaluation reports do, though, usually share the same architecture. A guide for parents on psycho-educational evaluations, published in the United States, describes sections such as:",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "Motivul evaluării și istoricul: de ce ați venit, ce s-a întâmplat până acum, informații despre dezvoltare, sănătate, școală, familie.",
					en: "The reason for the evaluation and the background: why you came, what has happened so far, information on development, health, school, family.",
				},
				{
					ro: "Funcționarea cognitivă: cum gândește și învață, de pildă raționamentul, anumite tipuri de memorie, viteza de procesare.",
					en: "Cognitive functioning: how he thinks and learns, for example reasoning, certain kinds of memory, processing speed.",
				},
				{
					ro: "Procese precum atenția, organizarea sau limbajul.",
					en: "Processes such as attention, organisation or language.",
				},
				{
					ro: "Funcționarea școlară: citit, scris, ortografie, matematică, când e cazul.",
					en: "Academic functioning: reading, writing, spelling, mathematics, where relevant.",
				},
				{
					ro: "Funcționarea socială și emoțională, adesea din chestionare completate de părinți, profesori sau de copil, după vârstă.",
					en: "Social and emotional functioning, often from questionnaires filled in by parents, teachers or the child, depending on age.",
				},
				{
					ro: "Recomandări: ce ar putea ajuta și ce urmează.",
					en: "Recommendations: what might help and what comes next.",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "Dacă s-a făcut și o hartă cerebrală QEEG, la Psizone ea are propriul raport: cu hărțile, interpretare clinică și recomandări, explicat în persoană. Îl poți păstra și îl poți arăta medicului tău. Harta nu pune singură un diagnostic. Ea adaugă o informație măsurată la restul imaginii.",
				en: "If a QEEG brain map was also made, at Psizone it has its own report: with the maps, clinical interpretation and recommendations, explained in person. You can keep it and show it to your doctor. The map does not make a diagnosis on its own. It adds a measured piece of information to the rest of the picture.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum citești limbajul unui raport?",
				en: "How do you read the language of a report?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Cel mai dificil într-un raport nu sunt ideile, ci cifrele. Ele sunt scoruri standardizate: compară performanța cu cea a copiilor de aceeași vârstă, nu cu un „ideal”. Ghidul american amintit explică, pe scurt, câteva dintre scări:",
				en: "The hardest thing in a report is not the ideas but the numbers. They are standardised scores: they compare performance with that of children of the same age, not with an “ideal”. The American guide mentioned explains, briefly, some of the scales:",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "La majoritatea testelor psihologice și educaționale, abaterea standard este 15, iar media e aproape de 100. Un scor de 85 e cu o abatere standard sub medie, iar 70, cu două.",
					en: "In most psychological and educational tests, the standard deviation is 15 and the mean is close to 100. A score of 85 is one standard deviation below the mean, and 70 is two.",
				},
				{
					ro: "Scorurile T, folosite la scalele de comportament, au media 50 și abaterea standard 10.",
					en: "T-scores, used by behaviour scales, have a mean of 50 and a standard deviation of 10.",
				},
				{
					ro: "Stanină: o scală de la 1 la 9, în care 5 înseamnă mediu.",
					en: "Stanine: a scale from 1 to 9, in which 5 is average.",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "Cum ți se explică toate acestea contează mai mult decât tabelele. Un scor nu e un verdict: e o fotografie făcută într-o zi, cu un anumit instrument. De aceea un raport bun leagă cifrele de ce se vede în viața copilului, nu le lasă singure. Dacă o cifră te sperie, nu o ține pentru tine: întreabă „Ce înseamnă asta, concret, la școală sau acasă?”",
				en: "How all this is explained to you matters more than the tables. A score is not a verdict: it is a photograph taken on one day, with a certain instrument. That is why a good report ties the numbers to what is seen in the child’s life, and does not leave them alone. If a number frightens you, do not keep it to yourself: ask, “What does this mean, concretely, at school or at home?”",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce să cauți într-un raport bun",
				en: "What to look for in a good report",
			},
		},
		{
			type: "p",
			text: {
				ro: "Nu trebuie să fii specialist ca să-ți dai seama dacă un raport e scris pentru tine sau doar pentru arhivă. Câteva semne că e unul bun:",
				en: "You do not have to be a specialist to tell whether a report is written for you or only for the file. A few signs that it is a good one:",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "spune de ce s-a făcut evaluarea, în cuvintele pe care le-ai folosit tu la început;",
					en: "it says why the evaluation was done, in the words you used at the start;",
				},
				{
					ro: "numește instrumentele folosite și explică, într-o frază, ce măsoară fiecare;",
					en: "it names the instruments used and explains, in a sentence, what each one measures;",
				},
				{
					ro: "scrie și despre ce merge bine, nu doar despre dificultăți;",
					en: "it writes about what is going well too, not only about difficulties;",
				},
				{
					ro: "leagă cifrele de situații concrete: temele, jocul, relația cu ceilalți;",
					en: "it ties the numbers to concrete situations: homework, play, relationships with others;",
				},
				{
					ro: "are recomandări specifice, cu un prim pas clar, nu formule generale;",
					en: "it has specific recommendations, with a clear first step, not general formulas;",
				},
				{
					ro: "recunoaște limitele: ce nu se poate spune încă, ce trebuie revăzut.",
					en: "it acknowledges its limits: what cannot yet be said, what needs revisiting.",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "Dacă raportul tău nu face așa, nu e vina ta că nu îl înțelegi. Cere o explicație. A explica un raport e parte din munca specialistului, nu un serviciu în plus.",
				en: "If your report does not do this, it is not your fault that you do not understand it. Ask for an explanation. Explaining a report is part of the specialist’s work, not an extra service.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Un lucru pe care îl auzim des de la părinți: „Mi-e teamă că raportul o să-l eticheteze.” E o teamă pe care o luăm în serios. Un raport nu e o etichetă pe fruntea unui copil. E o descriere a felului în care funcționează el acum, cu punctele lui tari și cu ce îl încurcă, scrisă ca să știți ce să faceți mai departe. Dacă o formulare ți se pare prea dură, spune-o: formulările se pot revedea, pentru că limbajul contează.",
				en: "Something we often hear from parents: “I am afraid the report will label him.” It is a fear we take seriously. A report is not a label on a child’s forehead. It is a description of how he works now, with his strengths and what gets in his way, written so that you know what to do next. If a phrase seems too harsh, say so: language matters, and wording can be revisited.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum decurge discuția de explicare?",
				en: "What does the explanation meeting look like?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Ghidul psihologilor descrie, după evaluare, cel puțin o ședință de prezentare a rezultatelor, de tip psihoeducativ. La Psizone, îți explicăm raportul pe înțelesul tău, în persoană. Nu te lăsăm singur cu un document. Poți veni cu întrebările notate și îți poți cere să repetăm un pasaj. Dacă vii pentru un copil, spune-ne dacă vrei ca părți din discuție să fie și pentru el, în cuvinte pe care le înțelege.",
				en: "The psychologists’ guide describes, after the evaluation, at least one session presenting the results, of a psychoeducational kind. At Psizone, we explain the report to you in plain words, in person. We do not leave you alone with a document. You can come with your questions written down and ask us to repeat a passage. If you come for a child, tell us whether you want parts of the conversation to be for him too, in words he understands.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Un exemplu de întrebări bune de pus: „Ce e puternic la copilul meu? Ce l-a surprins pe specialist? Ce schimbăm mai întâi acasă? Ce ar trebui să urmărim în următoarele luni? Ce nu putem spune încă din această evaluare?” Ultima merită pusă mereu. Un raport onest spune și ce nu știe.",
				en: "An example of good questions to ask: “What is strong in my child? What surprised the specialist? What do we change first at home? What should we watch for in the coming months? What can we not yet say from this evaluation?” The last one is always worth asking. An honest report says what it does not know, too.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Și o ultimă scenă: e seară, copilul doarme, iar tu citești raportul la masa din bucătărie. Cifrele pe care le vezi pentru prima oară pot părea reci. Citește întâi recomandările și abia apoi tabelele. Apoi lasă raportul și mai citește-l a doua zi. Ceea ce pare un lucru foarte grav la ora zece seara arată, de obicei, altfel la prânz.",
				en: "And a last scene: it is evening, the child is asleep, and you are reading the report at the kitchen table. The numbers you see for the first time can look cold. Read the recommendations first and the tables afterwards. Then put the report down and read it again the next day. What looks very serious at ten at night usually looks different at lunchtime.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce faci cu raportul la școală și la medic?",
				en: "What do you do with the report at school and at the doctor’s?",
			},
		},
		{
			type: "p",
			text: {
				ro: "La medic, raportul e o informație în plus. Un diagnostic medical îl pune medicul specialist; raportul nostru nu îl înlocuiește. Dacă tu sau copilul tău luați medicamente, spune-ne, ca să citim corect datele. Decizia despre ele rămâne între tine și medic, iar noi nu recomandăm și nu oprim tratamente.",
				en: "At the doctor’s, the report is extra information. A medical diagnosis is made by the specialist doctor; our report does not replace it. If you or your child take medication, tell us, so that we read the data correctly. The decision about it stays between you and the doctor, and we neither recommend nor stop treatments.",
			},
		},
		{
			type: "p",
			text: {
				ro: "La școală, lucrurile depind de ce cere școala. Nu putem promite că raportul nostru ține loc de un anumit act oficial: întreabă învățătoarea, dirigintele sau consilierul școlar ce document le trebuie și în ce formă. Putem discuta cu ei adaptări simple, dar doar cu acordul tău: un loc în față, instrucțiuni date pe rând, sarcini împărțite în pași, mai mult timp la teste sau pauze scurte de mișcare. Scopul nu e un favor, ci condiții în care copilul să poată arăta ce știe.",
				en: "At school, things depend on what the school requires. We cannot promise that our report stands in for a particular official document: ask the teacher, the form tutor or the school counsellor what document they need and in what form. We can discuss simple adjustments with them, but only with your agreement: a seat at the front, instructions given one at a time, tasks split into steps, more time on tests or short movement breaks. The aim is not a favour but conditions in which the child can show what he knows.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cât de confidențial e raportul?",
				en: "How confidential is the report?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Raportul e despre cineva, iar informația despre sănătatea sau dezvoltarea unei persoane e sensibilă. Ghidul psihologilor vorbește despre protejarea datelor clientului și despre drepturile și demnitatea persoanei. În practică, asta înseamnă simplu: raportul e al tău, noi nu îl trimitem nimănui fără acordul tău, iar dacă îl dai mai departe, tu alegi cui și ce parte. Dacă vrei să-l arăți școlii, nu e nevoie să arăți tot: poți cere un rezumat, doar cu recomandările.",
				en: "The report is about someone, and information about a person’s health or development is sensitive. The psychologists’ guide speaks of protecting the client’s data and of the rights and dignity of the person. In practice, that simply means: the report is yours, we do not send it to anyone without your agreement, and if you pass it on, you choose to whom and which part. If you want to show it to school, you do not have to show everything: you can ask for a summary, with the recommendations only.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Păstrează raportul într-un loc sigur și gândește-te cui îl trimiți și pe ce cale: un fișier pe un e-mail partajat nu e același lucru cu un exemplar înmânat. Dacă nu ești sigur ce ar trebui să conțină un document pentru o instituție anume, întreabă-ne înainte să-l trimiți.",
				en: "Keep the report in a safe place and think about whom you send it to and by what route: a file on a shared e-mail is not the same as a copy handed over in person. If you are not sure what a document for a particular institution should contain, ask us before you send it.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cât de repede primești raportul?",
				en: "How soon do you receive the report?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Nu dăm un termen în zile, pentru că nu ar fi corect pentru toate evaluările: depinde de câte instrumente s-au folosit, de vârstă și de cât de complexă e imaginea. Ce putem spune cinstit: întreabă la programare și din nou la finalul evaluării, iar noi îți spunem ce știm atunci, fără să promitem ce nu putem ține. Dacă ai nevoie de raport pentru o dată anume, spune-ne la programare, ca să știm de la început.",
				en: "We do not give a deadline in days, because it would not be right for every evaluation: it depends on how many instruments were used, on age and on how complex the picture is. What we can honestly say: ask when you book and again at the end of the evaluation, and we will tell you what we know then, without promising what we cannot keep. If you need the report by a particular date, tell us when you book, so that we know from the start.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Și după raport? Reevaluarea",
				en: "And after the report? The re-evaluation",
			},
		},
		{
			type: "p",
			text: {
				ro: "Raportul e un punct de plecare. Dacă urmează un plan, vom măsura din nou și îți vom arăta ce s-a schimbat, nu doar cum au mers ședințele. Pentru QEEG, harta de la început rămâne reperul, iar la reevaluare se face din nou înregistrarea, în aceleași condiții, și cele două hărți se pun una lângă alta. Despre felul în care măsurăm progresul avem un articol separat.",
				en: "The report is a starting point. If a plan follows, we will measure again and show you what has changed, not just how the sessions went. For QEEG, the first map stays the reference, and at re-evaluation the recording is made again, under the same conditions, and the two maps are placed side by side. We have a separate article on how we measure progress.",
			},
		},
		{
			type: "h2",
			text: { ro: "Pasul următor", en: "The next step" },
		},
		{
			type: "p",
			text: {
				ro: "Dacă ești în fața unei evaluări, întreabă la programare ce raport primești, cum ți-l explicăm și ce termen realist poți aștepta. Programează evaluarea și pune întrebarea de la început: e mai ușor să știi dinainte ce vei ține în mână.",
				en: "If you are facing an evaluation, ask when you book what report you will receive, how we explain it and what realistic timing to expect. Book the evaluation and ask the question from the start: it is easier to know beforehand what you will be holding.",
			},
		},
	],
	sources: [
		{
			label: {
				ro: "Colegiul Psihologilor din România: Ghid de competențe de evaluare și intervenție",
				en: "College of Psychologists of Romania: Guide to evaluation and intervention competences",
			},
			href: "https://copsi.ro/images/files/dosare/1.10._Ghid_Competente_de_evaluare_si_interventie_pe_specializari_CPCP.pdf",
		},
		{
			label: {
				ro: "Disability Rights California: Înțelegerea evaluărilor psiho-educaționale",
				en: "Disability Rights California: Understanding psycho-educational evaluations",
			},
			href: "https://www.disabilityrightsca.org/publications/understanding-psycho-educational-evaluations",
		},
		{
			label: { ro: "Psizone: QEEG și mapping cerebral", en: "Psizone: QEEG and brain mapping" },
			href: "https://psizone.ro/qeeg-mapping-cerebral/",
		},
		{
			label: {
				ro: "Asociația Psihologilor din România: Ghid pentru serviciile psihologice online (confidențialitatea datelor)",
				en: "Association of Psychologists of Romania: Guide to online psychological services (data confidentiality)",
			},
			href: "https://www.copsi.ro/images/APR_Ghid_privind_telepsihologia.pdf",
		},
		{
			label: {
				ro: "CDC: Despre ADHD (nu există un singur test)",
				en: "CDC: About ADHD (there is no single test)",
			},
			href: "https://www.cdc.gov/adhd/about/index.html",
		},
	],
	provenance: [
		"https://copsi.ro/images/files/dosare/1.10._Ghid_Competente_de_evaluare_si_interventie_pe_specializari_CPCP.pdf (the result of an evaluation is recorded in an evaluation report handed to the client or relevant third parties; after the evaluation at least one results-presentation session, psychoeducational)",
		"https://www.disabilityrightsca.org/publications/understanding-psycho-educational-evaluations (US guide: typical report sections; standard deviation 15, mean near 100, 85 = one SD below, 70 = two; T-scores mean 50 SD 10; stanines 1-9, 5 average; used only for the general structure and scales, not for US school mechanics)",
		"https://psizone.ro/qeeg-mapping-cerebral/ and apps/psizone-web/src/content/rich/qeeg.ts (report with clinical interpretation and recommendations, explained in person; keep and show to your doctor; first map as reference, re-record under the same conditions and compare)",
		"apps/psizone-web/src/content/rich/hub-adhd.ts (talk to school only with consent; simple adjustments; no medication advice; diagnosis by the specialist doctor)",
		"apps/psizone-web/src/content/visit.ts (re-evaluation: we measure again and show what has changed)",
		"https://www.copsi.ro/images/APR_Ghid_privind_telepsihologia.pdf (protecting client data and dignity of persons)",
		"https://www.cdc.gov/adhd/about/index.html (no single test; similar conditions)",
		"Delivery time, exact report structure and sharing with third parties are not documented in the repo or on psizone.ro, so the text states them as agreed at booking and explained at the meeting, with no promised deadline.",
	],
	seo: {
		title: {
			ro: "Raport evaluare psihologică: ce primești și cum îl citești",
			en: "Psychological evaluation report: what you get | Psizone",
		},
		description: {
			ro: "Ce rapoarte primești după o evaluare psihologică: părțile raportului, cum citești scorurile, discuția de explicare și cum îl folosești la școală sau la medic.",
			en: "What reports you get after a psychological evaluation: its parts, how to read the scores, the explanation meeting and how to use it at school or with a doctor.",
		},
		keywords: {
			ro: [
				"raport evaluare psihologică ce primești",
				"cum citesc un raport de evaluare psihologică",
				"raport psihologic copil școală",
				"scoruri standardizate înțeles",
				"raport QEEG ce conține",
			],
			en: [
				"psychological evaluation report what you get",
				"how to read a psychological evaluation report",
				"psychological report child school",
				"standardised scores explained",
				"QEEG report what it contains",
			],
		},
	},
	faq: [
		{
			q: {
				ro: "Ce conține un raport de evaluare psihologică?",
				en: "What does a psychological evaluation report contain?",
			},
			a: {
				ro: "De obicei motivul evaluării și istoricul, ce instrumente s-au folosit, ce s-a găsit (cognitiv, atenție, comportament, emoții) și recomandările. Structura exactă a raportului nostru ți-o arătăm la discuția de explicare. Dacă s-a făcut o hartă QEEG, ea are un raport propriu, cu interpretare clinică și recomandări.",
				en: "Usually the reason for the evaluation and the background, which instruments were used, what was found (cognitive, attention, behaviour, emotions) and the recommendations. We show you the exact structure of our report at the explanation meeting. If a QEEG map was made, it has its own report, with clinical interpretation and recommendations.",
			},
		},
		{
			q: {
				ro: "Raportul pune un diagnostic?",
				en: "Does the report make a diagnosis?",
			},
			a: {
				ro: "Raportul descrie ce s-a observat și măsurat și ce recomandăm. Un diagnostic medical îl stabilește medicul specialist, iar harta QEEG nu pune singură un diagnostic. CDC notează că nu există un singur test pentru ADHD și că alte cauze pot semăna cu el, de aceea contează evaluarea completă.",
				en: "The report describes what was observed and measured and what we recommend. A medical diagnosis is made by the specialist doctor, and the QEEG map does not make a diagnosis on its own. The CDC notes that there is no single test for ADHD and that other causes can look like it, which is why the full evaluation matters.",
			},
		},
		{
			q: {
				ro: "Cine poate vedea raportul?",
				en: "Who can see the report?",
			},
			a: {
				ro: "Raportul e înmânat clientului sau unor terți relevanți, spune ghidul psihologilor. La noi, nu îl trimitem nimănui fără acordul tău. Dacă îl dai mai departe, tu alegi cui și ce parte, de exemplu doar recomandările pentru școală. Întreabă-ne dacă ai nevoie de o versiune scurtă.",
				en: "The report is handed to the client or to relevant third parties, says the psychologists’ guide. With us, we send it to nobody without your agreement. If you pass it on, you choose to whom and which part, for example only the recommendations for school. Ask us if you need a short version.",
			},
		},
		{
			q: {
				ro: "Pot folosi raportul la școală sau la medic?",
				en: "Can I use the report at school or at the doctor’s?",
			},
			a: {
				ro: "La medic e o informație în plus, nu un diagnostic. La școală depinde de ce cere școala, de aceea întreabă învățătoarea sau consilierul ce document le trebuie. Nu promitem că raportul ține loc de un act oficial. Putem discuta adaptări simple cu școala, doar cu acordul tău.",
				en: "At the doctor’s it is extra information, not a diagnosis. At school it depends on what the school requires, so ask the teacher or counsellor what document they need. We do not promise that the report stands in for an official document. We can discuss simple adjustments with the school, only with your agreement.",
			},
		},
		{
			q: {
				ro: "Cât durează până primesc raportul?",
				en: "How long until I receive the report?",
			},
			a: {
				ro: "Nu dăm un termen fix, pentru că depinde de câte instrumente s-au folosit, de vârstă și de complexitate. Întreabă la programare și la finalul evaluării, iar noi îți spunem ce știm atunci, fără promisiuni. Dacă ai nevoie de raport pentru o dată anume, spune-ne de la programare, ca să știm de la început.",
				en: "We do not give a fixed deadline, because it depends on how many instruments were used, on age and on complexity. Ask when you book and at the end of the evaluation, and we tell you what we know then, with no promises. If you need the report by a particular date, tell us from the booking, so that we know from the start.",
			},
		},
		{
			q: {
				ro: "Ce înseamnă scorurile standardizate din raport?",
				en: "What do the standardised scores in the report mean?",
			},
			a: {
				ro: "Compară performanța cu cea a copiilor de aceeași vârstă. La multe teste psihologice media e aproape de 100 și abaterea standard 15, deci 85 e cu o abatere sub medie. Un scor nu e un verdict, ci o fotografie dintr-o zi, de aceea îl legăm de ce se vede în viața copilului.",
				en: "They compare performance with that of children of the same age. In many psychological tests the mean is close to 100 and the standard deviation 15, so 85 is one deviation below the mean. A score is not a verdict but a photograph from one day, which is why we tie it to what is seen in the child’s life.",
			},
		},
	],
	related: [
		"ce-include-o-evaluare-la-psizone-galati",
		"cum-masuram-progresul-in-terapie",
		"harta-cerebrala-qeeg",
	],
};
