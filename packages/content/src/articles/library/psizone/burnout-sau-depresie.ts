import type { ArticleInput } from "../../../schema";

export const article: ArticleInput = {
	slug: "burnout-sau-depresie",
	brand: "psizone",
	topic: "anxietate-depresie",
	backlogNo: 12,
	status: "draft",
	kind: "health",
	aiDrafted: true,
	draftedAt: "2026-11-12",
	author: null,
	reviewer: null,
	title: {
		ro: "Burnout sau depresie? Cum faci diferența",
		en: "Burnout or depression? How to tell the difference",
	},
	standfirst: {
		ro: "Burnout-ul, așa cum îl descrie OMS, vine din stresul cronic de la locul de muncă; depresia nu se oprește la serviciu și cuprinde tot. Se suprapun mult: epuizare, iritare, somn prost. Doar o evaluare le poate despărți. Dacă durează săptămâni, începe cu medicul sau cu o evaluare psihologică.",
		en: "Burnout, as the WHO describes it, comes from chronic stress at work; depression does not stop at the office door and reaches into everything. They overlap a lot: exhaustion, irritability, poor sleep. Only an evaluation can separate them. If it has lasted weeks, start with your doctor or a psychological evaluation.",
	},
	cover: {
		src: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Morning_In_Fundata_%28220922343%29.jpeg/1280px-Morning_In_Fundata_%28220922343%29.jpeg",
		alt: {
			ro: "Dimineață la Fundata: casele și biserica unui sat de munte, în lumina joasă a răsăritului.",
			en: "Morning in Fundata: the houses and church of a mountain village in the low light of sunrise.",
		},
		width: 1280,
		height: 853,
	},
	body: [
		{
			type: "p",
			text: {
				ro: "Duminică seara, ți se strânge stomacul la gândul de luni. Ai încercat un concediu, ai dormit mai mult, și tot nu te simți tu. Acum te întrebi dacă ești „doar obosit de muncă” sau dacă e ceva mai adânc. Răspunsul scurt: nu poți ști singur, iar asta nu e o greșeală a ta. Cele două se aseamănă mult, iar cercetarea însăși le desparte cu greu. Ce poți face este să observi tiparul și să ceri o evaluare.",
				en: "On Sunday evening your stomach tightens at the thought of Monday. You have tried a holiday, you have slept more, and you still do not feel like yourself. Now you wonder whether you are “just worn out by work” or whether it is something deeper. The short answer: you cannot know on your own, and that is not a failing of yours. The two look a great deal alike, and research itself separates them with difficulty. What you can do is notice the pattern and ask for an evaluation.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Mai jos compari, una lângă alta, cum le descriu sursele serioase, vezi unde se suprapun, de ce autodiagnosticul e riscant, ce poate și ce nu poate face odihna și la cine mergi mai întâi. Nu este un test și nu te diagnostichează. Este o hartă simplă pentru o conversație cu un specialist.",
				en: "Below you will compare, side by side, how the serious sources describe each, see where they overlap, why self-diagnosis is risky, what rest can and cannot do, and who to see first. It is not a test and it does not diagnose you. It is a simple map for a conversation with a specialist.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce este burnout-ul și ce nu este?",
				en: "What is burnout, and what is it not?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Organizația Mondială a Sănătății descrie burnout-ul în ICD-11 ca pe un sindrom care rezultă din stres cronic la locul de muncă, care nu a fost gestionat cu succes. Are trei componente: senzația de epuizare sau de energie golită, distanțare mintală de job sau cinism față de el și eficacitate profesională redusă. Esențial este și ce precizează OMS: termenul se referă la fenomene din context profesional și nu ar trebui aplicat experiențelor din alte zone ale vieții.",
				en: "The World Health Organization describes burn-out in ICD-11 as a syndrome resulting from chronic workplace stress that has not been successfully managed. It has three parts: feelings of energy depletion or exhaustion, increased mental distance from your job or negativism and cynicism towards it, and reduced professional efficacy. What the WHO adds matters just as much: the term refers to phenomena in the occupational context and should not be applied to experiences in other areas of life.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Cu alte cuvinte, burnout-ul are o adresă. Se leagă de muncă, de volumul ei, de lipsa controlului, de lipsa recunoașterii, de ritmul care nu te lasă să te refaci. Un om cu burnout poate spune: „Acasă, în weekend, cu prietenii, mă mai găsesc. Dar gândul la birou mă golește.” Nu orice om care spune așa are doar burnout, dar fraza arată cum se simte o stare legată de loc.",
				en: "In other words, burnout has an address. It is tied to work: to its volume, to a lack of control, to a lack of recognition, to a pace that does not let you recover. A person with burnout may say: “At home, at the weekend, with friends, I can still find myself. But the thought of the office empties me.” Not everyone who says this has only burnout, but the sentence shows how a state tied to a place feels.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce este depresia și cum o descriu sursele?",
				en: "What is depression, and how do the sources describe it?",
			},
		},
		{
			type: "p",
			text: {
				ro: "NIMH spune că depresia, numită și tulburare depresivă majoră sau depresie clinică, este mai mult decât tristețea obișnuită și poate da simptome severe care îți afectează cum te simți, cum gândești și cum faci față activităților zilnice. NHS enumeră, la nivel psihologic, dispoziție scăzută persistentă, sentiment de lipsă de speranță, stimă de sine scăzută, vinovăție, iritabilitate, motivație scăzută și puțină plăcere față de viață. La nivel fizic: mișcare sau vorbire mai lentă, schimbări de apetit sau greutate, energie scăzută și somn perturbat. La nivel social: eviți prietenii, lași hobby-urile și apar dificultăți acasă, la serviciu sau în familie.",
				en: "NIMH says depression, also called major depressive disorder or clinical depression, is more than ordinary sadness and can cause severe symptoms that affect how you feel, think and handle daily activities. The NHS lists, on the psychological side, persistent low mood, feeling hopeless, low self-esteem, guilt, irritability, low motivation and little enjoyment of life. On the physical side: moving or speaking more slowly, changes in appetite or weight, low energy and disturbed sleep. On the social side: avoiding friends, neglecting hobbies, and difficulties at home, at work or in family life.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Observă cuvintele „la serviciu” de la sfârșit. Depresia nu ocolește jobul, dar nici nu rămâne acolo. Ea intră în hobby-uri, în relații, în felul în care te vezi. NHS spune că sfatul este să mergi la medic dacă ai simptome de depresie mare parte din zi, în fiecare zi, mai mult de două săptămâni, și notează că o dispoziție scăzută se poate îmbunătăți după un timp scurt. Iar un om poate să nu aibă toate simptomele din listă.",
				en: "Notice the words “at work” at the end. Depression does not skip the job, but it does not stay there either. It enters hobbies, relationships, the way you see yourself. The NHS advises seeing a GP if you have symptoms of depression for most of the day, every day, for more than two weeks, and notes that a low mood may improve after a short time. And a person may well not have every symptom on the list.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Unde se suprapun burnout-ul și depresia?",
				en: "Where do burnout and depression overlap?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Se suprapun în locurile care doare cel mai tare: epuizare, iritabilitate, motivație scăzută, concentrare slabă și somn prost. Dacă ai citit listele de mai sus, ai văzut deja jumătate din tabloul burnout-ului și în descrierea depresiei. De aici vine confuzia: două drumuri diferite pot ajunge la aceeași stare de dimineață, cu aceeași greutate pe piept.",
				en: "They overlap in the places that hurt most: exhaustion, irritability, low motivation, poor concentration and bad sleep. If you read the lists above, you have already seen half the picture of burnout inside the description of depression. That is where the confusion comes from: two different roads can arrive at the same morning, with the same weight on your chest.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Cercetarea e sinceră în privința asta. O sinteză a 92 de studii, publicată în Clinical Psychology Review în 2015 (Bianchi, Schonfeld și Laurent), concluzionează că limita dintre burnout și depresie este conceptual fragilă și că dovezile pentru burnout ca fenomen distinct au fost inconsistente. Autorii arată și de ce: nu există criterii de diagnostic agreate pentru burnout, iar studiile despre burnout nu țin suficient seama de varietatea formelor de depresie. Nu e o veste rea pentru tine. Doar spune că nu trebuie să te simți prost fiindcă nu știi tu ce ai.",
				en: "The research is candid about this. A review of 92 studies, published in Clinical Psychology Review in 2015 (Bianchi, Schonfeld and Laurent), concludes that the line between burnout and depression is conceptually fragile and that the evidence for burnout as a distinct phenomenon has been inconsistent. The authors also say why: there are no agreed diagnostic criteria for burnout, and burnout research gives too little attention to the variety of depressive disorders. This is not bad news for you. It simply says you should not feel foolish for not knowing which one you have.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Burnout sau depresie: o comparație simplă",
				en: "Burnout or depression: a simple comparison",
			},
		},
		{
			type: "p",
			text: {
				ro: "Comparația de mai jos rezumă cum le descriu sursele de mai sus. Citește-o ca pe un set de întrebări pe care ți le pui, nu ca pe un verdict. Un om poate avea și una, și alta.",
				en: "The comparison below summarises how the sources above describe them. Read it as a set of questions to ask yourself, not as a verdict. A person can have both.",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "Unde apare. Burnout: legat de contextul profesional, așa cum îl definește OMS. Depresie: poate cuprinde casa, relațiile, hobby-urile, felul în care te vezi pe tine.",
					en: "Where it shows up. Burnout: tied to the occupational context, as the WHO defines it. Depression: can reach home, relationships, hobbies, the way you see yourself.",
				},
				{
					ro: "Ce se întâmplă în timpul liber. Burnout: distanțarea și golul se leagă de job, iar în afara lui poți avea momente în care te regăsești. Depresie: NHS vorbește despre puțină plăcere față de viață în general și despre renunțarea la hobby-uri.",
					en: "What happens in your free time. Burnout: the distance and emptiness are tied to the job, and outside it you may have moments when you find yourself again. Depression: the NHS speaks of little enjoyment of life in general and of neglecting hobbies.",
				},
				{
					ro: "Cum te vezi pe tine. Burnout: eficacitate profesională redusă și cinism față de muncă. Depresie: NHS include stima de sine scăzută, vinovăția și sentimentul lipsei de speranță.",
					en: "How you see yourself. Burnout: reduced professional efficacy and cynicism about work. Depression: the NHS includes low self-esteem, guilt and feeling hopeless.",
				},
				{
					ro: "Ce dispare. Burnout: energia și apropierea față de muncă. Depresie: pot dispărea și apetitul, somnul, interesul pentru oameni și lucruri.",
					en: "What goes missing. Burnout: energy and closeness to your work. Depression: appetite, sleep and interest in people and things can go missing too.",
				},
				{
					ro: "Cât durează. Burnout: cât durează stresul cronic nerezolvat. Depresie: NHS recomandă consult medical dacă simptomele țin mare parte din zi, în fiecare zi, mai mult de două săptămâni.",
					en: "How long. Burnout: as long as the unresolved chronic stress lasts. Depression: the NHS advises seeing a doctor if symptoms last most of the day, every day, for more than two weeks.",
				},
				{
					ro: "Suprapunerea. Epuizare, iritabilitate, somn prost, concentrare slabă: apar în ambele. De aceea tabelul nu poate decide în locul unui specialist.",
					en: "The overlap. Exhaustion, irritability, poor sleep, poor concentration: they appear in both. That is why a table cannot decide in place of a specialist.",
				},
			],
		},
		{
			type: "h2",
			text: {
				ro: "De ce e riscant să-ți pui singur diagnosticul?",
				en: "Why is it risky to diagnose yourself?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Sunt două riscuri, în direcții opuse. Primul: îți spui „e doar burnout” și amâni, pentru că „burnout” sună a ceva ce se rezolvă cu un concediu. Dacă de fapt ai o depresie, asta înseamnă luni în plus fără sprijin. Al doilea: îți spui „sigur sunt depresiv” și te sperii, deși poate e un stres de muncă care se schimbă dacă se schimbă condițiile. Niciunul nu e vina ta. Ambele pornesc dintr-o etichetă pe care nu ai cum s-o verifici fără întrebări bune, puse de cineva format.",
				en: "There are two risks, in opposite directions. The first: you tell yourself “it is just burnout” and put it off, because “burnout” sounds like something a holiday can fix. If you actually have depression, that means extra months without support. The second: you tell yourself “I must be depressed” and frighten yourself, when it may be work stress that changes if the conditions change. Neither is your fault. Both start from a label you cannot check without good questions asked by someone trained.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Mai e un motiv. Burnout-ul și depresia pot coexista, iar unele simptome fizice, cum ar fi oboseala sau somnul rupt, pot veni și din cauze medicale. De aceea, un consult la medic face parte din răspuns, nu e un pas în plus.",
				en: "There is one more reason. Burnout and depression can coexist, and some physical symptoms, such as tiredness or broken sleep, can also come from medical causes. That is why seeing a doctor is part of the answer, not an extra step.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Odihna ajută? Dar terapia?",
				en: "Does rest help? And therapy?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Odihna contează, iar lipsa ei întreține ambele stări. Dar dacă cauza este un ritm de muncă imposibil, un concediu te recuperează câteva zile și te întoarce în același loc. Dacă ce trăiești este o depresie, odihna singură nu o rezolvă: NIMH numește ca tratamente medicamentele, terapia prin vorbire și stimularea creierului, nu odihna. Încearcă să observi ce se întâmplă în a treia zi de concediu. Dacă greutatea rămâne și acolo, merită să vorbești cu cineva.",
				en: "Rest matters, and a lack of it feeds both states. But if the cause is an impossible work pace, a holiday restores you for a few days and then returns you to the same place. If what you are living through is depression, rest alone does not resolve it: NIMH names medicines, talk therapy and brain stimulation as treatments, not rest. Try noticing what happens on the third day of a holiday. If the weight is still there, it is worth talking to someone.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Ce face terapia? Într-o evaluare la Psizone, psihologul pornește de la ce îți descrie pagina serviciului nostru: o evaluare inițială detaliată, în care se discută simptomele, istoria emoțională și nevoile de acum. Apoi stabilești obiective realiste și lucrezi, după cum se potrivește, cu terapie cognitiv-comportamentală, cu terapie de acceptare și angajament, cu mindfulness și reglare emoțională. Poate însemna, la burnout, și o discuție despre limite, despre ce poți schimba la muncă și ce nu. Nu promitem o durată sau un rezultat. Promitem o hartă clară a ce se întâmplă.",
				en: "What does therapy do? In an evaluation at Psizone, the psychologist starts from what our service page describes: a detailed initial assessment, in which symptoms, emotional history and present needs are discussed. Then you set realistic goals and work, as fits, with cognitive behavioural therapy, acceptance and commitment therapy, mindfulness and emotional regulation. With burnout it may also mean a conversation about boundaries, about what you can change at work and what you cannot. We do not promise a duration or an outcome. We promise a clear map of what is happening.",
			},
		},
		{
			type: "p",
			text: {
				ro: "O precizare onestă: dacă ai simptome de depresie, tratamentul poate include medicamente, iar decizia le aparține medicului psihiatru sau medicului tău. Nu recomandăm și nu oprim nimic.",
				en: "One honest note: if you have symptoms of depression, treatment may include medicines, and that decision belongs to a psychiatrist or your own doctor. We neither recommend nor stop anything.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "La cine mergi mai întâi?",
				en: "Who do you see first?",
			},
		},
		{
			type: "p",
			text: {
				ro: "NHS sfătuiește să mergi la medicul de familie, care poate trimite mai departe către un specialist în sănătate mintală pentru evaluare. Asta e un punct de plecare bun și aici: medicul poate verifica dacă nu există o cauză medicală a oboselii și a somnului prost. Paralel sau după aceea, o evaluare psihologică te ajută să înțelegi tiparul, cu un psiholog care lucrează cu tine prin vorbire. Psihiatrul intră în discuție dacă e vorba de diagnostic psihiatric sau de medicamente. Diferențele dintre psiholog, psihoterapeut și psihiatru sunt explicate într-un articol separat.",
				en: "The NHS advises seeing a GP, who can refer you on to a mental health specialist for assessment. That is a good place to start here too: the doctor can check that there is no medical cause behind the tiredness and poor sleep. Alongside or afterwards, a psychological evaluation helps you understand the pattern, with a psychologist who works with you through talking. A psychiatrist comes in when there is a psychiatric diagnosis or medicine to consider. The differences between a psychologist, a psychotherapist and a psychiatrist are explained in a separate article.",
			},
		},
		{
			type: "quote",
			text: {
				ro: "Burnout-ul este un sindrom care rezultă din stres cronic la locul de muncă, care nu a fost gestionat cu succes. (OMS, ICD-11)",
				en: "Burn-out is a syndrome conceptualized as resulting from chronic workplace stress that has not been successfully managed. (WHO, ICD-11)",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce te face să nu mai amâni?",
				en: "What should stop you putting it off?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Câteva semne merită o discuție fără să mai aștepți: simptomele țin de peste două săptămâni, mare parte din zi; îți e greu să faci lucruri simple acasă; te retragi de la oameni; nu mai găsești plăcere nici în ce îți plăcea; somnul și apetitul s-au schimbat. Acestea apar și în lista NHS pentru depresie. Dacă tu sau cineva apropiat sunteți în pericol imediat, sunați la 112.",
				en: "A few signs deserve a conversation without more waiting: symptoms have lasted over two weeks, for most of the day; simple things at home feel hard; you are withdrawing from people; you find no pleasure even in what you used to like; sleep and appetite have changed. These also appear in the NHS list for depression. If you or someone close to you is in immediate danger, call 112.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Poți veni și fără să știi ce ai. Spune-ne ce se întâmplă, de când și cum arată o zi obișnuită. Atât ne trebuie ca să începem. Prima discuție e despre tine, nu despre diagnostic.",
				en: "You can come even without knowing what you have. Tell us what is going on, since when and what an ordinary day looks like. That is all we need to begin. The first conversation is about you, not a diagnosis.",
			},
		},
	],
	sources: [
		{
			label: {
				ro: "OMS: Burn-out, un fenomen ocupațional (ICD-11)",
				en: "WHO: Burn-out an occupational phenomenon (ICD-11)",
			},
			href: "https://www.who.int/news/item/28-05-2019-burn-out-an-occupational-phenomenon-international-classification-of-diseases",
		},
		{
			label: {
				ro: "NHS: Simptomele depresiei clinice",
				en: "NHS: Symptoms of clinical depression",
			},
			href: "https://www.nhs.uk/mental-health/conditions/clinical-depression/symptoms/",
		},
		{
			label: {
				ro: "NIMH: Depresia",
				en: "NIMH: Depression",
			},
			href: "https://www.nimh.nih.gov/health/topics/depression",
		},
		{
			label: {
				ro: "Bianchi, Schonfeld, Laurent (2015): Burnout-depression overlap: a review",
				en: "Bianchi, Schonfeld, Laurent (2015): Burnout-depression overlap: a review",
			},
			href: "https://academicworks.cuny.edu/cc_pubs/297",
		},
		{
			label: {
				ro: "Psizone: Terapie individuală în anxietate și depresie",
				en: "Psizone: Individual therapy for anxiety and depression",
			},
			href: "https://psizone.ro/terapie-individuala-interventie-in-anxietate-si-depresie/",
		},
	],
	provenance: [
		"https://www.who.int/news/item/28-05-2019-burn-out-an-occupational-phenomenon-international-classification-of-diseases (ICD-11 definition, three dimensions, occupational context only)",
		"https://www.nhs.uk/mental-health/conditions/clinical-depression/symptoms/ (psychological, physical, social symptoms; most of the day every day for more than 2 weeks; low mood may improve after a short time; not everyone has every symptom)",
		"https://www.nimh.nih.gov/health/topics/depression (more than normal sadness; treatments: medication, brain stimulation, talk therapy)",
		"https://academicworks.cuny.edu/cc_pubs/297 (Bianchi, Schonfeld & Laurent 2015, Clinical Psychology Review: 92 studies; conceptually fragile distinction; no agreed criteria for burnout; heterogeneity of depression). Abstract read on the CUNY page; PubMed 25638755 not opened.",
		"https://psizone.ro/terapie-individuala-interventie-in-anxietate-si-depresie/ (detailed initial assessment; realistic goals; CBT, ACT, mindfulness; psychologists; no price or session count given)",
		"NHS depression symptoms page: see a GP if symptoms last most of the day, every day, for more than 2 weeks. The GP-refers-on-to-a-specialist step is from https://www.nhs.uk/mental-health/conditions/social-anxiety/ (fetched; same NHS pathway).",
		"docs/brands/writing-voice.md (voice, 112 sentence); related article psiholog-psihoterapeut-psihiatru-diferente for roles.",
		"Cover: Wikimedia Commons “Morning In Fundata”, reused from existing library covers.",
	],
	seo: {
		title: {
			ro: "Burnout sau depresie: cum faci diferența",
			en: "Burnout or depression: how to tell the difference",
		},
		description: {
			ro: "Burnout sau depresie? Vezi unde se suprapun, ce le deosebește, de ce autodiagnosticul e riscant și la cine mergi mai întâi, într-o comparație simplă.",
			en: "Burnout or depression? See where they overlap, what sets them apart, why self-diagnosis is risky and who to see first, in a simple side-by-side comparison.",
		},
		keywords: {
			ro: [
				"burnout sau depresie",
				"diferența dintre burnout și depresie",
				"burnout simptome",
				"depresie simptome",
				"epuizare la locul de muncă",
				"când merg la psiholog",
			],
			en: [
				"burnout vs depression",
				"difference between burnout and depression",
				"burnout symptoms",
				"depression symptoms",
				"work exhaustion",
				"when to see a psychologist",
			],
		},
	},
	faq: [
		{
			q: {
				ro: "Care este diferența dintre burnout și depresie?",
				en: "What is the difference between burnout and depression?",
			},
			a: {
				ro: "OMS leagă burnout-ul de stresul cronic de la locul de muncă și spune că termenul nu se aplică altor zone ale vieții. Depresia, așa cum o descriu NHS și NIMH, poate cuprinde dispoziția, somnul, apetitul, relațiile și hobby-urile. Simptomele se suprapun mult, de aceea doar o evaluare le poate despărți.",
				en: "The WHO ties burnout to chronic workplace stress and says the term does not apply to other areas of life. Depression, as the NHS and NIMH describe it, can reach mood, sleep, appetite, relationships and hobbies. The symptoms overlap a great deal, so only an evaluation can separate them.",
			},
		},
		{
			q: {
				ro: "Pot avea și burnout, și depresie?",
				en: "Can I have both burnout and depression?",
			},
			a: {
				ro: "Da, e posibil. O sinteză din 2015 a 92 de studii a arătat că distincția dintre cele două e conceptual fragilă și că nu există criterii agreate pentru burnout. De aceea nu te baza pe o etichetă. Contează ce simți, cât durează și cât îți afectează viața.",
				en: "Yes, it is possible. A 2015 review of 92 studies found the distinction between the two conceptually fragile, with no agreed criteria for burnout. So do not lean on a label. What matters is what you feel, how long it lasts and how much it affects your life.",
			},
		},
		{
			q: {
				ro: "Un concediu rezolvă burnout-ul?",
				en: "Does a holiday fix burnout?",
			},
			a: {
				ro: "Odihna ajută, dar dacă cauza e ritmul de muncă, un concediu te poate recupera câteva zile fără să schimbe cauza. Dacă după câteva zile libere greutatea, golul și lipsa plăcerii rămân, merită o discuție cu un specialist, pentru că poate fi mai mult decât oboseala.",
				en: "Rest helps, but if the cause is the pace of work, a holiday may restore you for a few days without changing the cause. If after a few days off the weight, the emptiness and the lack of pleasure remain, a conversation with a specialist is worthwhile, because it may be more than tiredness.",
			},
		},
		{
			q: {
				ro: "După cât timp merg la medic?",
				en: "After how long should I see a doctor?",
			},
			a: {
				ro: "NHS sfătuiește consult dacă ai simptome de depresie mare parte din zi, în fiecare zi, mai mult de două săptămâni. Nu trebuie să aștepți atât: dacă ți-e greu să faci față, poți cere ajutor mai devreme. Dacă tu sau cineva apropiat sunteți în pericol imediat, sunați la 112.",
				en: "The NHS advises seeing someone if you have symptoms of depression for most of the day, every day, for more than two weeks. You do not have to wait that long: if you are struggling to cope, you can ask for help sooner. If you or someone close to you is in immediate danger, call 112.",
			},
		},
		{
			q: {
				ro: "La cine merg mai întâi: medic, psiholog sau psihiatru?",
				en: "Who do I see first: a doctor, a psychologist or a psychiatrist?",
			},
			a: {
				ro: "Un bun început e medicul de familie, care poate verifica cauzele medicale ale oboselii și te poate îndruma. O evaluare psihologică te ajută să înțelegi tiparul și să începi terapia. Psihiatrul intervine dacă se pune problema unui diagnostic psihiatric sau a medicamentelor.",
				en: "A good start is your family doctor, who can check medical causes of tiredness and point you onwards. A psychological evaluation helps you understand the pattern and begin therapy. A psychiatrist comes in if there is a psychiatric diagnosis or medicine to consider.",
			},
		},
		{
			q: {
				ro: "Ce se întâmplă la prima întâlnire la Psizone?",
				en: "What happens at the first meeting at Psizone?",
			},
			a: {
				ro: "Pagina serviciului descrie o evaluare inițială detaliată, în care se discută simptomele, istoria emoțională și nevoile de acum, apoi se stabilesc obiective realiste. Prima discuție e despre tine, nu despre diagnostic. Durata și costul se stabilesc la programare.",
				en: "The service page describes a detailed initial assessment, in which symptoms, emotional history and present needs are discussed, and then realistic goals are set. The first conversation is about you, not a diagnosis. Duration and cost are confirmed when you book.",
			},
		},
	],
	related: [
		"primele-semne-de-depresie-la-adulti",
		"anxietate-generalizata-simptome-si-ajutor",
		"psiholog-psihoterapeut-psihiatru-diferente",
		"insomnie-din-anxietate-ce-faci",
	],
};
