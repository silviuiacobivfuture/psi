import type { ArticleInput } from "../../../schema";

export const article: ArticleInput = {
	slug: "disgrafia-copilul-scrie-urat",
	brand: "psizone",
	topic: "logopedie",
	backlogNo: null,
	status: "draft",
	kind: "health",
	aiDrafted: true,
	draftedAt: "2026-11-12",
	author: null,
	reviewer: null,
	title: {
		ro: "Copilul scrie urât și obosește: disgrafie sau doar mână grea?",
		en: "Child writes messily and tires fast: dysgraphia or just a slow hand?",
	},
	standfirst: {
		ro: "Scrisul urât singur nu înseamnă disgrafie. Se merită o evaluare când scrisul e greu de citit, lent și epuizant chiar și după exercițiu, iar copilul evită să scrie. Disgrafia nu se stabilește din caiet, ci după o evaluare, și are căi concrete de sprijin, de la prindere la adaptări la clasă.",
		en: "Untidy handwriting alone is not dysgraphia. An assessment is worth considering when writing is hard to read, slow and exhausting even after practice, and the child avoids it. Dysgraphia is not decided from a notebook but after an assessment, and it has concrete support, from grip to adjustments in class.",
	},
	cover: {
		src: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/Crayons_beside_child_coloring_%28Unsplash%29.jpg/1280px-Crayons_beside_child_coloring_%28Unsplash%29.jpg",
		alt: {
			ro: "O cutie galbenă cu creioane colorate în prim-plan, iar în fundal, încețoșat, un copil care colorează.",
			en: "A yellow box of coloured crayons in the foreground and, blurred behind it, a child colouring.",
		},
		width: 1280,
		height: 906,
	},
	body: [
		{
			type: "p",
			text: {
				ro: "E 20:40, temele de la română nu sunt gata, iar el a lăsat creionul pe masă și își scutură mâna. Caietul arată ca după o furtună: litere de mărimi diferite, rânduri care coboară, ștersături până la gaura din foaie. Probabil te întrebi dacă e lene, dacă a luat-o ușor sau dacă ceva nu e în regulă. Răspunsul scurt: scrisul urât singur nu spune nimic. Dar scrisul urât, lent și obositor, la un copil care evită să scrie, merită o privire mai atentă.",
				en: "It is 8.40 pm, the Romanian homework is not finished, and he has put the pencil down and is shaking out his hand. The notebook looks as if a storm has passed over it: letters of different sizes, lines sliding downhill, rubbings-out right through the paper. You are probably wondering whether it is laziness, whether he is taking it lightly, or whether something is wrong. The short answer: untidy writing on its own says nothing. But untidy, slow, tiring writing in a child who avoids writing deserves a closer look.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce e disgrafia și cum arată la un copil de școală?",
				en: "What is dysgraphia and what does it look like in a school-age child?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Disgrafia este un termen larg pentru dificultatea de a comunica în scris. Într-o trecere în revistă publicată în Translational Pediatrics, autorii o descriu ca pe o problemă care poate cuprinde formarea literelor, spațierea, ortografia, controlul fin al mișcării, viteza scrisului, gramatica și compunerea. Nu e o „mână urâtă”, ci un tablou în care scrisul cere unui copil mult mai mult efort decât ar trebui.",
				en: "Dysgraphia is a broad term for difficulty communicating in writing. In a review published in Translational Pediatrics, the authors describe a problem that can cover letter formation, spacing, spelling, fine movement control, writing speed, grammar and composition. It is not an “ugly hand”, but a picture in which writing demands from a child far more effort than it should.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Aceeași lucrare enumeră semne care se văd pe vârste. La preșcolar: priză sau postură stângace, oboseală rapidă la scris, evitarea scrisului și a desenului, litere deformate sau întoarse. La școlar: scris ilizibil, trecere încurcată între scrisul de mână și cel de tipar, greutăți în a găsi cuvintele sau în a le pune pe hârtie. La copiii mai mari: dificultatea de a-și organiza gândurile în scris, deși la oral se exprimă bine.",
				en: "The same paper lists signs by age. In preschoolers: an awkward grip or posture, tiring quickly when writing, avoiding writing and drawing, poorly formed or reversed letters. In school-age children: illegible handwriting, a muddled switch between cursive and print, difficulty finding words or getting them onto paper. In older children: trouble organising thoughts in writing even though they express themselves well out loud.",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "Scrisul e ilizibil chiar și pentru copil, uneori nu mai poate citi ce a scris acum zece minute.",
					en: "The writing is illegible even to the child, who sometimes cannot read what he wrote ten minutes ago.",
				},
				{
					ro: "Obosește repede și se plânge că îl doare mâna după câteva rânduri.",
					en: "He tires quickly and complains that his hand hurts after a few lines.",
				},
				{
					ro: "Scrie foarte încet sau, dimpotrivă, scrie în fugă și apar litere lipsă.",
					en: "He writes very slowly or, the opposite, rushes and letters go missing.",
				},
				{
					ro: "Ocolește scrisul și desenul: „nu vreau”, „mă doare”, „mai târziu”.",
					en: "He avoids writing and drawing: “I don’t want to”, “it hurts”, “later”.",
				},
				{
					ro: "Vorbește bine și știe lecția, dar ce scrie nu seamănă cu ce știe.",
					en: "He speaks well and knows the lesson, but what he writes does not match what he knows.",
				},
			],
		},
		{
			type: "h2",
			text: {
				ro: "Disgrafie sau scris neexersat: cum deosebești?",
				en: "Dysgraphia or lack of practice: how do you tell?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Un copil care scrie puțin și grăbit nu are neapărat o dificultate. Poate că nu a avut încă destulă ocazie să exerseze, poate că e într-o perioadă în care scrisul s-a schimbat de la tipar la cursiv. Diferența stă în persistență și în preț: la scrisul neexersat, câteva săptămâni de scris calm și regulat îl îmbunătățesc vizibil. La o dificultate reală, efortul rămâne mare chiar și când copilul se străduiește și e odihnit.",
				en: "A child who writes little and in a hurry does not necessarily have a difficulty. He may simply not have had enough chance to practise, or he may be in a period when writing has moved from print to cursive. The difference lies in persistence and in cost: with unpractised writing, a few weeks of calm, regular writing visibly improves it. With a real difficulty, the effort stays high even when the child is trying and rested.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Nu poți ști singur, nici nu trebuie. Un cercetător care a studiat copiii cu tulburare de coordonare motorie (DCD) face o distincție utilă: scrisul slab, în care mișcările de scris sunt încă imature, e altceva decât disgrafia, pe care autorul o vede ca pe o tulburare distinctă a controlului motor. Același autor atrage atenția că un test de scris care măsoară doar lizibilitatea și viteza nu e suficient: e nevoie de o examinare mai amplă a dezvoltării.",
				en: "You cannot know alone, and you do not have to. A researcher who studied children with developmental coordination disorder (DCD) makes a useful distinction: poor handwriting, where writing movements are still immature, is not the same as dysgraphia, which the author sees as a distinct disorder of motor control. The same author points out that a writing test measuring only legibility and speed is not enough: a broader examination of development is needed.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce legătură are cu dislexia și cu alte dificultăți?",
				en: "How is it linked to dyslexia and other difficulties?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Se întâlnesc des. Fișa KidsHealth pentru părinți notează că un copil cu disgrafie poate avea și alte dificultăți de învățare care îngreunează citirea, cum e dislexia. Lucrarea din Translational Pediatrics citează că între 30% și 47% dintre copiii cu probleme de scris au și probleme de citit, iar aproximativ jumătate dintre copiii cu DCD au scris afectat.",
				en: "They often come together. The KidsHealth fact sheet for parents notes that a child with dysgraphia may also have other learning difficulties that make reading hard, such as dyslexia. The Translational Pediatrics paper cites that between 30% and 47% of children with writing problems also have reading problems, and that about half of children with DCD have impaired writing.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Asta nu înseamnă că dacă scrie greu, are în mod sigur și dislexie. Înseamnă că, atunci când evaluezi scrisul, e înțelept să te uiți și la citit, la ortografie, la limbaj și la motricitate. Pentru tine, ca părinte, e un motiv bun să spui logopedului și psihologului tot ce observi, nu doar „scrie urât”. Dacă nu ești sigur de semnele dislexiei, găsești detalii în articolul despre dislexie de pe acest site.",
				en: "This does not mean that if he writes with difficulty he certainly has dyslexia too. It means that when you assess writing, it is wise to look at reading, spelling, language and movement as well. For you, as a parent, it is a good reason to tell the speech therapist and the psychologist everything you notice, not just “he writes badly”. If you are unsure about the signs of dyslexia, you will find details in the article about dyslexia on this site.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Motricitate fină și prinderea creionului: ce să urmărești",
				en: "Fine motor skills and pencil grip: what to watch",
			},
		},
		{
			type: "p",
			text: {
				ro: "Un caz frecvent de scris obositor începe în degete și în încheietură. Serviciul național de sănătate din Marea Britanie (NHS) arată că la copiii cu DCD desenul și scrisul sunt de obicei în urma vârstei și că unui copil i se pot adapta instrumentele de scris, de exemplu cu mânere speciale pentru pixuri și creioane. Prinderea creionului e însă un semn secundar: lucrarea de sinteză o menționează, dar nu o consideră criteriul principal.",
				en: "A common case of tiring writing begins in the fingers and the wrist. The UK’s National Health Service (NHS) notes that in children with DCD, drawing and writing are usually behind what is expected for their age, and that a child’s writing tools can be adapted, for example with special grips on pens and pencils. The grip itself is a secondary sign, though: the review mentions it but does not treat it as the main criterion.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Ce poți observa acasă, fără să-l corectezi la fiecare literă: stă aplecat peste foaie sau strânge creionul cu toată mâna? Își sprijină antebrațul sau îl ține în aer? Se schimbă mâna cu care scrie? Notează două-trei scene concrete, cu ora și cu durata („după zece minute s-a oprit”). Un specialist lucrează mult mai bine cu scene decât cu etichete.",
				en: "What you can notice at home, without correcting every letter: does he lean over the page or squeeze the pencil with his whole hand? Does he rest his forearm or hold it in the air? Does he switch writing hands? Note two or three concrete scenes, with the time and the duration (“after ten minutes he stopped”). A specialist works far better with scenes than with labels.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce adaptări poate cere la clasă?",
				en: "What adjustments can you ask for in class?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Aici părinții primesc de obicei cea mai bună veste: unele lucruri se pot schimba de mâine. KidsHealth enumeră, pentru elevii cu disgrafie, hârtie liniată mai lat, cu pătrățele sau cu linii ridicate, un instrument de scris pe care copilul îl găsește comod, un mâner special, răspunsuri orale, un scrib, mai mult timp, tastatura sau programe de transcriere din voce, precum și notițe sau scheme date de profesor. Lucrarea din Translational Pediatrics adaugă împărțirea temelor mari în bucăți mici și notarea separată a conținutului și a ortografiei.",
				en: "This is where parents usually get the best news: some things can change from tomorrow. KidsHealth lists, for pupils with dysgraphia, wider-ruled, squared or raised-line paper, a writing tool the child finds comfortable, a special grip, oral answers, a scribe, extra time, a keyboard or speech-to-text software, and notes or outlines provided by the teacher. The Translational Pediatrics paper adds splitting large assignments into small pieces and marking content and spelling separately.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Poți merge la învățătoare cu o frază simplă: „Observ că scrisul îl costă foarte mult. Putem încerca o foaie cu linii mai late și să-i dăm cinci minute în plus la dictare? Vreau să văd dacă îl ajută.” Nu ceri o etichetă, ci o încercare. În același timp, același articol notează că aceste adaptări nu rezolvă singure dificultățile de planificare și de organizare a ideilor, deci se continuă și exersarea scrisului, cu un scop clar.",
				en: "You can go to the teacher with a simple sentence: “I notice that writing costs him a great deal. Could we try a page with wider lines and give him five extra minutes for dictation? I would like to see whether it helps.” You are not asking for a label, but for a trial. At the same time, the same paper notes that these adjustments do not on their own solve difficulties with planning and organising ideas, so practice with writing continues too, with a clear purpose.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce poți face acasă: exerciții scurte, fără lupte",
				en: "What you can do at home: short exercises, no battles",
			},
		},
		{
			type: "p",
			text: {
				ro: "Nu ai nevoie de caiete speciale. Ai nevoie de puțin, des și fără presiune. Lucrarea citată spune că exersarea scrisului de mână trebuie să continue, iar remedierea combină mișcarea cu ortografia. Cum arată asta într-o seară obișnuită: cinci minute, nu cincisprezece, cu ceva ce amuză. Desenează litere mari în aer cu degetul, apoi în făină sau pe o tavă cu griș, apoi pe hârtie. Alternează cu jocuri care muncesc degetele: plastilină, mărgele de înșirat, cleme de rufe, decupat.",
				en: "You do not need special notebooks. You need a little, often and without pressure. The paper cited says handwriting practice should continue, and that remediation combines movement with spelling. What that looks like on an ordinary evening: five minutes, not fifteen, with something that amuses. Draw large letters in the air with a finger, then in flour or in a tray of semolina, then on paper. Alternate with games that work the fingers: modelling clay, threading beads, clothes pegs, cutting out.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Alege un moment când nu e obosit și nu așteaptă un duel. Oprește-te înainte să apară durerea, nu după. Și lasă temele să se facă, uneori, pe tabletă sau tastatură, dacă școala acceptă: atunci când scrisul de mână îl epuizează, un copil are nevoie să rămână în conținut, nu doar în mușchi. Dacă nu se întâmplă nicio schimbare după câteva săptămâni de exerciții regulate, spune-i specialistului.",
				en: "Choose a moment when he is not tired and no showdown is waiting. Stop before the pain appears, not after. And let some homework be done, now and then, on a tablet or keyboard if the school allows it: when handwriting exhausts a child, he needs to stay with the content, not only with the muscles. If nothing changes after a few weeks of regular exercises, tell the specialist.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cine evaluează și cum arată drumul?",
				en: "Who assesses, and what is the route?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Nu există un singur test de sânge sau de imagine pentru disgrafie. Lucrarea din Translational Pediatrics spune că nu există test medical; medicul face un examen neurologic, caută afecțiuni asociate și trimite mai departe, iar în școli evaluarea o face de obicei o echipă care poate cuprinde terapeuți ocupaționali, logopezi și psihologi educaționali. Pe site-ul NHS, un copil cu semne de dificultăți motorii poate fi trimis la un terapeut ocupațional sau la un pediatru.",
				en: "There is no single blood or imaging test for dysgraphia. The Translational Pediatrics paper says there is no medical test; the doctor does a neurological examination, looks for associated conditions and refers on, and in schools the assessment is usually done by a team that can include occupational therapists, speech therapists and educational psychologists. On the NHS site, a child with signs of motor difficulty can be referred to an occupational therapist or a paediatrician.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Un drum rezonabil: începi cu medicul de familie sau pediatrul, ca să excludă probleme de vedere sau medicale. Apoi, evaluarea psihologică și logopedică privește citirea, scrisul, limbajul și atenția. La Psizone, în Galați, lucrăm cu psihologi și logopezi și cu kinetoterapie pediatrică, atunci când dezvoltarea motorie o cere; în prima discuție ne spui ce observi și stabilim împreună ce are sens să evaluăm.",
				en: "A reasonable route: you start with the family doctor or paediatrician, to rule out vision or medical problems. Then psychological and speech therapy assessment looks at reading, writing, language and attention. At Psizone, in Galați, we work with psychologists and speech therapists, and with paediatric kinesiotherapy when motor development calls for it; in the first conversation you tell us what you notice and we decide together what it makes sense to assess.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce îi spui copilului",
				en: "What you say to your child",
			},
		},
		{
			type: "p",
			text: {
				ro: "Un copil care scrie greu aude des „ai grijă”, „mai frumos”, „iar ai scris de mântuială”. Nu e o frază rea, e doar prea frecventă. Încearcă altceva, într-un moment liniștit: „Am văzut că scrisul te costă mult. Nu e vina ta și nu ești leneș. Vreau să aflu cum te pot ajuta. Vrei să vedem împreună ce ți-ar face mâna mai ușoară?” Frazele de tipul acesta numesc efortul, nu îl judecă.",
				en: "A child who writes with difficulty hears a lot of “be careful”, “neater”, “you’ve rushed it again”. They are not bad phrases, just far too frequent. Try something else, at a quiet moment: “I have seen that writing costs you a lot. It is not your fault and you are not lazy. I want to find out how I can help. Shall we see together what would make your hand’s job easier?” Phrases like this name the effort and do not judge it.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Și lasă-l să știe ce face bine: povestește cu el, desenează, explică verbal. Dacă pare foarte neliniștit sau descurajat din cauza școlii, e un motiv în plus să vorbești cu un psiholog; KidsHealth sugerează tocmai asta, ca părinții să discute opțiuni de consiliere atunci când copilul pare foarte anxios sau trist.",
				en: "And let him know what he does well: talking things through, drawing, explaining aloud. If he seems very worried or discouraged because of school, that is one more reason to talk to a psychologist; KidsHealth suggests exactly this, that families discuss counselling options when a child seems very anxious or down.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Dacă ai de făcut un singur lucru azi: notează trei scene concrete, cu ora și cu durata, apoi programează o evaluare și adu caietele de la clasă. Nu ți se cere să știi ce e, ci doar să arăți ce vezi.",
				en: "If you have just one thing to do today: note three concrete scenes, with the time and the duration, then book an assessment and bring his schoolbooks. You are not asked to know what it is, only to show what you see.",
			},
		},
	],
	sources: [
		{
			label: {
				ro: "Chung, Patel, Nizami: Disorder of written expression and dysgraphia (Translational Pediatrics, 2020)",
				en: "Chung, Patel, Nizami: Disorder of written expression and dysgraphia (Translational Pediatrics, 2020)",
			},
			href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC7082241/",
		},
		{
			label: {
				ro: "KidsHealth: Fișă despre disgrafie",
				en: "KidsHealth: Dysgraphia fact sheet",
			},
			href: "https://kidshealth.org/en/parents/dysgraphia-factsheet.html",
		},
		{
			label: {
				ro: "Vaivre-Douret & Lopez: Semiologia disgrafiei la copiii cu DCD (European Psychiatry, 2025)",
				en: "Vaivre-Douret & Lopez: The semiology of dysgraphia in children with DCD (European Psychiatry, 2025)",
			},
			href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12437469/",
		},
		{
			label: {
				ro: "NHS: Tulburarea de coordonare motorie (dispraxia) la copii",
				en: "NHS: Developmental coordination disorder (dyspraxia) in children",
			},
			href: "https://www.nhs.uk/conditions/developmental-coordination-disorder-dyspraxia/",
		},
		{
			label: {
				ro: "Psizone: serviciile centrului din Galați",
				en: "Psizone: the Galați centre’s services",
			},
			href: "https://psizone.ro",
		},
	],
	provenance: [
		"https://pmc.ncbi.nlm.nih.gov/articles/PMC7082241/ (opened via Europe PMC full text): definition, signs by age, 30-47% co-occurring reading problems, about half of DCD, no medical test, school team, accommodations and modifications",
		"https://kidshealth.org/en/parents/dysgraphia-factsheet.html: signs, accommodations, dyslexia mention, counselling if anxious or down",
		"https://pmc.ncbi.nlm.nih.gov/articles/PMC12437469/: dysgraphia vs poor handwriting in DCD children; legibility-and-speed test is not enough",
		"https://www.nhs.uk/conditions/developmental-coordination-disorder-dyspraxia/: drawing and writing behind age, adapted pens and grips, referral to occupational therapist or paediatrician",
		"https://psizone.ro: psychological and speech therapy services, paediatric kinesiotherapy, Galați",
		"Cover: https://commons.wikimedia.org/wiki/File:Crayons_beside_child_coloring_(Unsplash).jpg (Wikimedia Commons; check the licence on the file page before publication)",
		"docs/brands/writing-voice.md: narrator, claim rules",
	],
	seo: {
		title: {
			ro: "Disgrafia la copii: semne, diferența față de scrisul urât",
			en: "Dysgraphia in children: signs and what helps",
		},
		description: {
			ro: "Disgrafia la copii: semne, diferența dintre disgrafie și scris neexersat, legătura cu dislexia, adaptări la clasă, exerciții acasă și cine evaluează.",
			en: "Dysgraphia in children: signs, how it differs from poor practice, links with dyslexia, classroom adjustments, home exercises and who assesses it.",
		},
		keywords: {
			ro: [
				"disgrafia copii semne",
				"disgrafie la copii",
				"copilul scrie urât",
				"copilul obosește când scrie",
				"disgrafie și dislexie",
				"cum prinde copilul creionul",
				"adaptări la clasă disgrafie",
			],
			en: [
				"dysgraphia in children signs",
				"dysgraphia in children",
				"child writes messily",
				"child tires when writing",
				"dysgraphia and dyslexia",
				"child pencil grip",
				"classroom adjustments dysgraphia",
			],
		},
	},
	faq: [
		{
			q: {
				ro: "Care sunt semnele disgrafiei la un copil de școală?",
				en: "What are the signs of dysgraphia in a school-age child?",
			},
			a: {
				ro: "Scris ilizibil, oboseală rapidă la scris, viteză foarte mică sau scris grăbit cu litere lipsă, evitarea scrisului și a desenului și un decalaj între ce știe și ce scrie. Lucrarea de sinteză din Translational Pediatrics listează și trecerea încurcată între scrisul de mână și tipar. Semnele singure nu stabilesc diagnosticul: e nevoie de o evaluare.",
				en: "Illegible writing, tiring quickly when writing, very slow speed or rushed writing with letters missing, avoiding writing and drawing, and a gap between what he knows and what he writes. The review in Translational Pediatrics also lists a muddled switch between cursive and print. Signs alone do not establish a diagnosis: an assessment is needed.",
			},
		},
		{
			q: {
				ro: "Cum deosebesc disgrafia de un scris neexersat?",
				en: "How do I tell dysgraphia from unpractised writing?",
			},
			a: {
				ro: "Scrisul neexersat se îmbunătățește vizibil cu exercițiu calm și regulat. Într-o dificultate reală, efortul rămâne mare chiar și când copilul se străduiește și e odihnit. Nu e ceva ce stabilești singur din caiet: un test care măsoară doar lizibilitatea și viteza nu e suficient, iar un specialist privește și dezvoltarea motorie.",
				en: "Unpractised writing improves visibly with calm, regular practice. In a real difficulty the effort stays high even when the child is trying and rested. It is not something you decide alone from a notebook: a test that measures only legibility and speed is not enough, and a specialist also looks at motor development.",
			},
		},
		{
			q: {
				ro: "Disgrafia înseamnă și dislexie?",
				en: "Does dysgraphia mean dyslexia too?",
			},
			a: {
				ro: "Nu neapărat, dar se întâlnesc des. KidsHealth notează că un copil cu disgrafie poate avea și alte dificultăți care îngreunează citirea, cum e dislexia, iar o lucrare de sinteză cită că între 30% și 47% dintre copiii cu probleme de scris au și probleme de citit. De aceea evaluarea se uită și la citire și ortografie.",
				en: "Not necessarily, but they often come together. KidsHealth notes that a child with dysgraphia may also have other difficulties that make reading hard, such as dyslexia, and a review cites that between 30% and 47% of children with writing problems also have reading problems. That is why an assessment also looks at reading and spelling.",
			},
		},
		{
			q: {
				ro: "Ce adaptări pot cere la școală?",
				en: "What adjustments can I ask for at school?",
			},
			a: {
				ro: "Hârtie cu linii mai late sau ridicate, un mâner pentru creion, mai mult timp, răspunsuri orale, tastatură sau transcriere din voce, notițe sau scheme date de profesor, teme împărțite în bucăți mici. Cere-le ca pe o încercare, cu un scop clar, nu ca pe o etichetă, și urmărește ce îl ajută.",
				en: "Wider-ruled or raised-line paper, a pencil grip, extra time, oral answers, a keyboard or speech-to-text, notes or outlines from the teacher, homework split into small pieces. Ask for them as a trial, with a clear purpose, not as a label, and watch what helps him.",
			},
		},
		{
			q: {
				ro: "Cine evaluează disgrafia?",
				en: "Who assesses dysgraphia?",
			},
			a: {
				ro: "Nu există un test medical unic. Medicul pediatru sau de familie exclude alte cauze și poate trimite mai departe; evaluarea scrisului, citirii și limbajului o fac psihologul și logopedul, iar în unele sisteme și terapeutul ocupațional. La Psizone începem cu o discuție despre ce observi și hotărâm apoi ce evaluăm.",
				en: "There is no single medical test. The paediatrician or family doctor rules out other causes and can refer on; the assessment of writing, reading and language is done by the psychologist and speech therapist, and in some systems the occupational therapist. At Psizone we begin with a conversation about what you notice and then decide what to assess.",
			},
		},
		{
			q: {
				ro: "Ce fac dacă refuză să scrie?",
				en: "What if he refuses to write?",
			},
			a: {
				ro: "Nu forța o oră întreagă. Scurtează sesiunea, oprește-te înainte de durere, alternează cu jocuri pentru degete și, când școala permite, lasă-l să răspundă oral sau la tastatură. Spune-i că scrisul îl costă mult și că nu e leneș. Dacă refuzul continuă, discută cu un psiholog.",
				en: "Do not force a whole hour. Shorten the session, stop before the pain, alternate with finger games and, when the school allows, let him answer orally or on a keyboard. Tell him that writing costs him a lot and that he is not lazy. If the refusal continues, talk to a psychologist.",
			},
		},
	],
	related: [
		"semne-de-dislexie-la-copil",
		"strategii-scolare-pentru-copilul-cu-adhd",
		"copilul-nu-se-concentreaza-la-teme",
		"pregatirea-pentru-clasa-pregatitoare",
	],
};
