import type { ArticleInput } from "../../../schema";

export const article: ArticleInput = {
	slug: "rutina-zilnica-pentru-copilul-cu-adhd",
	brand: "psizone",
	topic: "adhd",
	backlogNo: null,
	status: "draft",
	kind: "health",
	aiDrafted: true,
	draftedAt: "2026-11-12",
	author: null,
	reviewer: null,
	title: {
		ro: "Rutina zilnică pentru copilul cu ADHD: dimineața, după-amiaza, seara",
		en: "Daily routine for a child with ADHD: morning, afternoon, evening",
	},
	standfirst: {
		ro: "Rutina ajută pentru că îi ia copilului din cap o parte din deciziile zilei. Pornește de la un program vizual pe perete, pași mici dimineața, o pauză înainte de teme, avertizări înainte de schimbări și o seară liniștită. Alege o singură schimbare pe săptămână. Nu va ieși perfect.",
		en: "Routine helps because it takes some of the day’s decisions out of the child’s head. Start with a visual schedule on the wall, small steps in the morning, a break before homework, warnings before changes and a quiet evening. Choose one change a week. It will not go perfectly.",
	},
	cover: {
		src: "https://upload.wikimedia.org/wikipedia/commons/c/c7/Hot_air_balloon_%28Unsplash%29.jpg",
		alt: {
			ro: "Un balon cu aer cald plutește deasupra unui lac liniștit, în ceața dimineții, cu reflexia lui în apă.",
			en: "A hot air balloon floats above a still lake in the morning mist, its reflection in the water.",
		},
		width: null,
		height: null,
	},
	body: [
		{
			type: "p",
			text: {
				ro: "E 7:25, un pantof lipsește, ghiozdanul nu e făcut, iar tu ai spus „încalță-te” de patru ori. Probabil te întrebi de ce o dimineață simplă devine în fiecare zi un șir de certuri, și dacă tu faci ceva greșit. Nu faci. Răspunsul scurt: o rutină previzibilă, cu pași mici și vizibili, scade numărul deciziilor și al ordinelor pe zi. Nu vindecă nimic și nu va merge perfect, dar poate face zilele mai ușoare pentru amândoi. Mai jos găsești o zi-model pe care o poți adapta, și o promisiune: începi cu o singură schimbare.",
				en: "It is 7:25, one shoe is missing, the school bag is not packed, and you have said “put your shoes on” four times. You may wonder why a simple morning turns into a string of quarrels every day, and whether you are doing something wrong. You are not. The short answer: a predictable routine, with small visible steps, lowers the number of decisions and orders in a day. It does not cure anything and it will not go perfectly, but it can make days easier for both of you. Below you will find a sample day you can adapt, and a promise: you begin with one change.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "De ce ajută rutina un copil cu ADHD?",
				en: "Why does routine help a child with ADHD?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pentru că ADHD, spune CDC, înseamnă dificultăți de a te concentra și de a-ți controla impulsurile. Când ziua are o formă pe care o știe, copilul nu trebuie să inventeze, la fiecare pas, ce urmează. CDC recomandă, în terapia comportamentală, ca sarcinile care se petrec zilnic să urmeze același program în fiecare zi, de la trezire până la culcare, iar obiectele personale să stea mereu în același loc, ca să fie mai greu de pierdut.",
				en: "Because ADHD, says the CDC, means difficulty concentrating and controlling impulses. When the day has a shape he knows, the child does not have to invent, at every step, what comes next. In behaviour therapy the CDC recommends that tasks that happen every day follow the same schedule each day, from waking to bedtime, and that belongings always stay in the same place, so they are harder to lose.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Serviciul britanic de sănătate adaugă lucruri la îndemână: instrucțiuni simple, date pe rând, cu voce calmă, o listă de făcut la vedere, laudă când îi iese bine sau un tabel cu recompense, activități fizice plăcute și somn regulat. Nu am găsit în sursele deschise un studiu care să spună cât de mult ajută o anumită rutină, așa că nu promitem rezultate. Ce spunem e atât: sunt lucruri recomandate și rezonabile, și le poți încerca fără risc.",
				en: "The UK health service adds things within reach: simple instructions given one at a time in a calm voice, a to-do list somewhere visible, praise when he does well or a reward chart, enjoyable physical activities and regular sleep. I did not find in the open sources a study saying how much a particular routine helps, so we promise no results. What we say is only this: these are recommended, reasonable things, and you can try them at no risk.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum arată dimineața, cu pași vizuali?",
				en: "What does the morning look like, with visual steps?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Un copil care aude „pregătește-te de școală” aude de fapt zece sarcini într-una. Împarte-le. CDC recomandă să rupi sarcinile complicate în pași mai mici, iar serviciul britanic, să scrii o listă de făcut într-un loc ușor de văzut. Pentru dimineață, o listă de cinci-șase pași, cu desene dacă e mic, poate arăta așa:",
				en: "A child who hears “get ready for school” in fact hears ten tasks at once. Divide them. The CDC recommends breaking complicated tasks into smaller steps, and the UK service recommends writing a to-do list somewhere easy to see. For the morning, a list of five or six steps, with drawings if he is small, might look like this:",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "Mă trezesc, merg la baie și mă spăl pe față.",
					en: "I wake up, go to the bathroom and wash my face.",
				},
				{
					ro: "Mă îmbrac cu hainele pregătite de seara trecută.",
					en: "I dress in the clothes laid out the night before.",
				},
				{
					ro: "Mănânc micul dejun, fără ecran.",
					en: "I eat breakfast, no screen.",
				},
				{
					ro: "Mă spăl pe dinți.",
					en: "I brush my teeth.",
				},
				{
					ro: "Îmi iau ghiozdanul de la locul lui și încalț pantofii.",
					en: "I take my school bag from its place and put on my shoes.",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "Hainele pregătite din seara dinainte și ghiozdanul făcut tot atunci îi scot dimineții câteva decizii. Iar în loc de „Hai odată!”, poți spune: „Uită-te pe listă. Ce urmează?” Copilul se uită la perete, nu la tine, și vă certați cu un lucru mai puțin.",
				en: "Clothes laid out the evening before and the bag packed then take several decisions out of the morning. And instead of “Come on!” you can say: “Look at the list. What comes next?” The child looks at the wall, not at you, and you have one less thing to quarrel about.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "De ce o pauză după școală, înainte de teme?",
				en: "Why a break after school, before homework?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Un copil care a ținut atenția opt ore în bancă nu mai are mult de dat. Serviciul de sănătate pentru copii din Vestul Australiei recomandă să lași copilul să fie activ înainte să stea nemișcat, și să faci pauze scurte între activități. Pe înțeles: gustare, apă, jumătate de oră afară sau în cameră, apoi temele. Nu e o răsplată, e încărcarea bateriei.",
				en: "A child who has held his attention for eight hours at a desk has not much left to give. The Western Australia child health service recommends letting the child be active before sitting still, and taking short breaks between activities. In plain terms: a snack, water, half an hour outside or in his room, then homework. It is not a reward, it is recharging the battery.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pentru temele în sine, serviciul britanic recomandă intervale de 15–20 de minute cu pauză între ele. Alege un loc liniștit, ordonat, cu televizorul închis și telefonul în altă cameră, tot din recomandările australiene. Și un timer sau un ceas la vedere, ca să știe că după acest interval vine o pauză, nu o alta la nesfârșit.",
				en: "For homework itself, the UK service recommends slots of 15 to 20 minutes with a break between them. Choose a quiet, uncluttered place, with the television off and the phone in another room, also from the Australian recommendations. And a timer or a clock in view, so he knows that after this slot comes a break, not another stretch without end.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum e seara: lumini, ecrane și culcare?",
				en: "What about the evening: lights, screens and bedtime?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Serviciul britanic recomandă somn regulat, iar Organizația Mondială a Sănătății dă pentru copiii mici ore de somn (10–13 ore la 3–4 ani) și cere ore regulate de culcare și trezire. Pentru copiii mai mari nu am găsit o cifră pe care s-o pot susține, deci nu o inventez. Ce poți face e să păstrezi aceeași oră de culcare, cu o jumătate de oră de liniștire înainte.",
				en: "The UK service recommends regular sleep, and the World Health Organization gives hours of sleep for young children (10 to 13 hours at ages 3 to 4) and asks for regular bed and waking times. For older children I did not find a figure I can support, so I do not invent one. What you can do is keep the same bedtime, with half an hour of winding down before it.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Ce înseamnă „liniștire”: lumină mai slabă în casă, baie sau duș, pregătit ghiozdanul și hainele, o poveste citită sau povestită împreună. OMS spune că, atunci când stau liniștiți, copiii se bucură de citit și povestit cu un adult. Ecranele: pentru copiii sub 5 ani, OMS recomandă cel mult o oră pe zi, iar mai puțin e mai bine; pentru cei mai mari nu am o cifră susținută de surse. Regula practică: telefonul și tableta stau în altă cameră la ora de culcare, iar seara nu se termină cu un joc.",
				en: "What “winding down” means: lower light in the house, a bath or shower, the bag and clothes prepared, a story read or told together. The WHO says that when sitting quietly, children benefit from reading and storytelling with an adult. Screens: for children under 5 the WHO recommends no more than an hour a day, and less is better; for older ones I have no figure backed by sources. The practical rule: phone and tablet stay in another room at bedtime, and the evening does not end with a game.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum faci tranzițiile mai ușoare, cu avertizări?",
				en: "How do you make transitions easier, with warnings?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Multe izbucniri apar între două lucruri: de la joc la masă, de la tablet la baie. Serviciul australian notează că unui copil îi poate fi greu să oprească o activitate plăcută ca să treacă la alta. Un avertisment înainte ajută: „Mai ai cinci minute, apoi ne spălăm pe mâini.” Apoi: „Încă două minute.” La final, ceasul sună sau tu spui calm: „Gata, e timpul.”",
				en: "Many outbursts happen between two things: from play to dinner, from tablet to bath. The Australian service notes that a child may find it hard to stop an enjoyable activity in order to switch to another. A warning beforehand helps: “You have five more minutes, then we wash our hands.” Then: “Two more minutes.” At the end, the clock rings or you say calmly: “That is it, it is time.”",
			},
		},
		{
			type: "quote",
			text: {
				ro: "Nu-i cere copilului să se oprească pe loc. Dă-i timp să se desprindă.",
				en: "Do not ask the child to stop on the spot. Give him time to let go.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Aceeași idee ține pentru tine. Nu comunica o schimbare din cealaltă cameră. Mergi lângă el, spune-i numele, așteaptă să se uite la tine și abia apoi spune ce urmează. Dacă încă nu se mișcă, repetă aceeași frază, fără să ridici vocea. Sună banal, și poate fi cel mai greu lucru din zi.",
				en: "The same idea holds for you. Do not announce a change from the other room. Go next to him, say his name, wait until he looks at you and only then say what comes next. If he still does not move, repeat the same sentence without raising your voice. It sounds trivial, and it may be the hardest thing in the day.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Un exemplu din după-amiază: e 16:10, el intră pe ușă și aruncă ghiozdanul. Nu începe cu „Ai teme?”. Începe cu o gustare și o întrebare simplă: „Cum a fost? Vrei să te miști puțin înainte?” Zece-cincisprezece minute mai târziu, tema e mai ușor de pornit, iar tu ai evitat prima ceartă a serii.",
				en: "An afternoon example: it is 16:10, he walks in and drops his bag. You do not begin with “Do you have homework?”. You begin with a snack and a simple question: “How was it? Do you want to move a bit first?” Ten or fifteen minutes later, homework is easier to start, and you have avoided the first quarrel of the evening.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum faci un program vizual pe perete?",
				en: "How do you make a visual schedule on the wall?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Nu ai nevoie de nimic scump: o coală mare, markere, hârtie lipită. Important e ca programul să fie la înălțimea copilului, într-un loc pe care îl vede des, scris sau desenat de voi doi împreună. Câteva principii:",
				en: "You need nothing expensive: a big sheet, markers, paper stuck on. What matters is that the schedule is at the child’s height, somewhere he sees often, written or drawn by the two of you together. A few principles:",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "Trei coloane, dimineața, după-amiaza, seara, cu cinci sau șase pași cel mult în fiecare.",
					en: "Three columns, morning, afternoon, evening, with five or six steps at most in each.",
				},
				{
					ro: "Pași scurți, la forma de „fac ceva”: „Mă spăl pe dinți”, nu „Igienă”.",
					en: "Short steps, in “I do something” form: “I brush my teeth”, not “Hygiene”.",
				},
				{
					ro: "Un desen sau un simbol lângă fiecare, dacă nu citește încă bine.",
					en: "A drawing or symbol beside each, if he does not yet read well.",
				},
				{
					ro: "Un loc unde bifează sau mută un magnet când a terminat un pas.",
					en: "A place to tick or move a magnet when he finishes a step.",
				},
				{
					ro: "Un spațiu liber pentru „ce am făcut bine azi”: CDC recomandă un tabel de obiective și recompense pentru progres.",
					en: "A free space for “what I did well today”: the CDC recommends a chart of goals and rewards for progress.",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "Schimbați programul împreună când nu mai merge. Un program care nu mai e adaptat devine o altă sursă de ceartă. Dacă o rutină foarte strictă îl neliniștește mai tare decât îl ajută, nu o forța: spune specialistului ce ai observat.",
				en: "Change the schedule together when it stops working. A schedule that is no longer adapted becomes another source of quarrels. If a very strict routine worries him more than it helps, do not force it: tell the specialist what you noticed.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "De ce un singur obiectiv pe săptămână?",
				en: "Why one goal a week?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pentru că tu ești la fel de obosit ca el. CDC spune că obiectivele să fie realiste, pentru că pașii mici contează. Alege una dintre cele de mai sus, de pildă hainele pregătite seara, și ține-te de ea o săptămână. Abia apoi adaugi altceva. Zece schimbări odată înseamnă zece lucruri de uitat, pentru voi amândoi.",
				en: "Because you are as tired as he is. The CDC says goals should be realistic, because small steps matter. Choose one of the above, for example clothes laid out in the evening, and stick to it for a week. Only then add something else. Ten changes at once means ten things to forget, for both of you.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Spune-i și lui, pe scurt: „Săptămâna asta încercăm un singur lucru: hainele pregătite seara. Dacă merge, mă bucur. Dacă nu, încercăm din nou.” Și laudă încercarea, nu doar rezultatul: serviciul australian recomandă să lauzi copilul și când nu a terminat, pentru că a încercat.",
				en: "Tell him too, briefly: “This week we try one thing: clothes laid out in the evening. If it works, I will be glad. If not, we try again.” And praise the attempt, not only the result: the Australian service recommends praising the child even when he did not finish, because he tried.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce faci în zilele proaste?",
				en: "What do you do on bad days?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Vor veni. O noapte proastă, o notă mică, o zi de ploaie, o mutare, o boală: rutina se rupe. Atunci nu începi iar de la zero și nu te pedepsești. Reduci. Păstrezi două-trei puncte fixe, de pildă masa și ora de culcare, și lași restul. CDC recomandă să nu certi, să nu strigi și să nu lovești, ci să folosești instrucțiuni eficiente, pauze de calmare sau retragerea unor privilegii, aplicate consecvent. În zilele proaste, cea mai bună consecvență e una blândă.",
				en: "They will come. A bad night, a low mark, a rainy day, a move, an illness: the routine breaks. Then you do not begin again from zero, and you do not punish yourself. You reduce. You keep two or three fixed points, for example the meal and bedtime, and let go of the rest. The CDC recommends that you do not scold, yell or spank, but use effective instructions, time-outs or removal of privileges, applied consistently. On bad days, the best consistency is a gentle one.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Și când ești tu epuizat, e în regulă. Ți-e greu pentru că e greu, nu pentru că ești un părinte slab. Dacă după câteva săptămâni dificultățile rămân aceleași, merită o discuție cu un specialist. La Psizone, în Galați, evaluarea nu se oprește la un singur instrument: include chestionare standardizate, teste cognitive și de atenție, observație comportamentală și, unde ajută, QEEG. Orice decizie despre medicație ține de medicul specialist.",
				en: "And when you are the one who is exhausted, that is fine. It is hard because it is hard, not because you are a weak parent. If after a few weeks the difficulties stay the same, a conversation with a specialist is worthwhile. At Psizone in Galați, the evaluation does not stop at a single instrument: it includes standardised questionnaires, cognitive and attention tests, behavioural observation and, where it helps, QEEG. Any decision about medication belongs with the specialist doctor.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pasul următor: alege acum o singură schimbare, poate hainele pregătite din seara dinainte, scrie-o pe o foaie și lipește-o pe perete.",
				en: "Your next step: choose one change now, perhaps clothes laid out the evening before, write it on a sheet and stick it on the wall.",
			},
		},
	],
	sources: [
		{
			label: {
				ro: "CDC: terapia comportamentală și instruirea părinților în ADHD",
				en: "CDC: behaviour therapy and parent training for ADHD",
			},
			href: "https://www.cdc.gov/adhd/treatment/behavior-therapy.html",
		},
		{
			label: {
				ro: "NHS: ADHD, cum trăiești cu el",
				en: "NHS: ADHD, living with it",
			},
			href: "https://www.nhs.uk/conditions/attention-deficit-hyperactivity-disorder-adhd/living-with/",
		},
		{
			label: {
				ro: "NHS: ADHD, tratament și sprijin",
				en: "NHS: ADHD, treatment and support",
			},
			href: "https://www.nhs.uk/conditions/attention-deficit-hyperactivity-disorder-adhd/treatment/",
		},
		{
			label: {
				ro: "CAHS Vestul Australiei: concentrare și atenție (joc și învățare 5)",
				en: "CAHS Western Australia: concentration and attention (Play and Learning 5)",
			},
			href: "https://www.cahs.health.wa.gov.au/-/media/HSPs/CAHS/Documents/Community-Health/ChildDevelopment/Play-and-Learning-5-concentration-and-attention.pdf",
		},
		{
			label: {
				ro: "OMS: pentru a crește sănătoși, copiii trebuie să stea mai puțin și să se joace mai mult",
				en: "WHO: to grow up healthy, children need to sit less and play more",
			},
			href: "https://www.who.int/news/item/24-04-2019-to-grow-up-healthy-children-need-to-sit-less-and-play-more",
		},
		{
			label: { ro: "CDC: despre ADHD", en: "CDC: about ADHD" },
			href: "https://www.cdc.gov/adhd/about/index.html",
		},
	],
	provenance: [
		"https://www.cdc.gov/adhd/treatment/behavior-therapy.html (same schedule every day from wake-up to bedtime; belongings in one place; break complicated tasks into smaller steps; chart of goals with praise or rewards; realistic small-step goals; instead of scolding, yelling or spanking, effective directions, time-outs, removal of privileges)",
		"https://www.nhs.uk/conditions/attention-deficit-hyperactivity-disorder-adhd/living-with/ (15 to 20 minute slots; simple instructions one at a time in a calm voice; visible to-do list; praise or reward chart; enjoyable physical activity; regular sleep)",
		"https://www.nhs.uk/conditions/attention-deficit-hyperactivity-disorder-adhd/treatment/ (same advice; medicines started and monitored by a specialist)",
		"https://www.cahs.health.wa.gov.au/-/media/HSPs/CAHS/Documents/Community-Health/ChildDevelopment/Play-and-Learning-5-concentration-and-attention.pdf (active before sitting still; short breaks between activities; quiet uncluttered space, TV off; praise having a go; read via pdftotext)",
		"https://cahs.health.wa.gov.au/Our-services/Community-Health/Child-Development-Service/Neurodiversity/Attention-regulation-concentration/What-is-attention-regulation-and-concentration (hard to stop an enjoyable activity to switch to another)",
		"https://www.who.int/news/item/24-04-2019-to-grow-up-healthy-children-need-to-sit-less-and-play-more (sleep 10 to 13 hours at ages 3 to 4 with regular sleep and wake-up times; screen time no more than 1 hour at 2 to 4, less is better; reading and storytelling with a caregiver when sedentary)",
		"https://www.cdc.gov/adhd/about/index.html (ADHD: trouble focusing, controlling impulsive behaviour)",
		"apps/psizone-web/src/content/rich/hub-adhd.ts (evaluation instruments at Psizone)",
		"The sample day, the script lines and the evening wind-down are illustrative, written by the drafter; no source studies a particular routine",
	],
	seo: {
		title: {
			ro: "Rutina copil cu ADHD: dimineața, după-amiaza, seara",
			en: "Daily routine for a child with ADHD: a sample day",
		},
		description: {
			ro: "Rutina unui copil cu ADHD, pe zi: pași vizuali dimineața, pauză înainte de teme, avertizări la tranziții, seara fără ecrane și un obiectiv pe săptămână.",
			en: "A daily routine for a child with ADHD: visual steps in the morning, a break before homework, warnings at transitions, screen-free evenings and one goal a week.",
		},
		keywords: {
			ro: [
				"rutina copil cu ADHD",
				"program zilnic copil cu ADHD",
				"program vizual pentru copil",
				"dimineți dificile copil ADHD",
				"copil cu ADHD seara culcare",
				"tranziții copil ADHD",
			],
			en: [
				"daily routine for child with ADHD",
				"ADHD child morning routine",
				"visual schedule for children",
				"difficult mornings ADHD child",
				"ADHD child bedtime routine",
				"transitions ADHD child",
			],
		},
	},
	faq: [
		{
			q: {
				ro: "De ce ajută rutina un copil cu ADHD?",
				en: "Why does routine help a child with ADHD?",
			},
			a: {
				ro: "Un program previzibil scade numărul deciziilor și al ordinelor pe zi. CDC recomandă ca sarcinile zilnice să urmeze același program de la trezire la culcare, iar obiectele să stea mereu în același loc. Nu am găsit studii despre cât de mult ajută o anumită rutină, deci nu promitem rezultate.",
				en: "A predictable schedule lowers the number of decisions and orders in a day. The CDC recommends that daily tasks follow the same schedule from waking to bedtime and that belongings stay in the same place. I did not find studies on how much a particular routine helps, so we promise no results.",
			},
		},
		{
			q: {
				ro: "Cum fac un program vizual?",
				en: "How do I make a visual schedule?",
			},
			a: {
				ro: "O coală mare, trei coloane (dimineața, după-amiaza, seara) și cinci-șase pași scurți în fiecare, scriși sau desenați împreună cu copilul, la înălțimea lui. Adaugă un loc unde bifează sau mută un magnet. Schimbați-l când nu mai merge. Serviciul britanic de sănătate recomandă o listă de făcut la vedere.",
				en: "A big sheet, three columns (morning, afternoon, evening) and five or six short steps in each, written or drawn with the child, at his height. Add a place where he ticks or moves a magnet. Change it when it stops working. The UK health service recommends a to-do list somewhere visible.",
			},
		},
		{
			q: {
				ro: "Cât timp ar trebui să dureze temele?",
				en: "How long should homework last?",
			},
			a: {
				ro: "Serviciul britanic de sănătate recomandă intervale de 15–20 de minute cu o pauză între ele, nu o oră fără oprire. Înainte de temă ajută o pauză activă, după recomandarea unui serviciu de sănătate australian. Dacă temele durează mult peste ce ar trebui, în ciuda efortului, spune-i învățătoarei și specialistului.",
				en: "The UK health service recommends slots of 15 to 20 minutes with a break between, not an hour straight. An active break before homework helps, according to an Australian health service. If homework lasts far beyond what it should despite his effort, tell the teacher and the specialist.",
			},
		},
		{
			q: {
				ro: "Cum îl ajut să treacă mai ușor de la o activitate la alta?",
				en: "How can I help him switch more easily between activities?",
			},
			a: {
				ro: "Dă un avertisment înainte: „Mai ai cinci minute, apoi masa.” Apoi: „Încă două minute.” Mergi lângă el, spune-i numele, așteaptă să se uite la tine, apoi spune ce urmează. Un serviciu australian notează că unui copil îi poate fi greu să oprească o activitate plăcută. Nu ridica vocea.",
				en: "Give a warning beforehand: “Five more minutes, then dinner.” Then: “Two more minutes.” Go next to him, say his name, wait until he looks at you, then say what comes next. An Australian service notes that a child may find it hard to stop an enjoyable activity. Do not raise your voice.",
			},
		},
		{
			q: {
				ro: "Ce fac dacă rutina nu merge sau ziua e proastă?",
				en: "What if the routine does not work or the day is bad?",
			},
			a: {
				ro: "Nu începe de la zero. Păstrează două-trei puncte fixe, de pildă masa și ora de culcare, și lasă restul. Revino a doua zi la același pas mic. CDC recomandă să nu certi, să nu strigi și să nu lovești, ci consecvență blândă. Dacă dificultățile rămân săptămâni la rând, discută cu un specialist.",
				en: "Do not start again from zero. Keep two or three fixed points, for example the meal and bedtime, and let go of the rest. Return the next day to the same small step. The CDC recommends that you do not scold, yell or spank, but be gently consistent. If the difficulties stay for weeks, talk to a specialist.",
			},
		},
	],
	related: [
		"somnul-copilului-cu-adhd",
		"strategii-scolare-pentru-copilul-cu-adhd",
		"copilul-nu-se-concentreaza-la-teme",
		"copilul-cu-adhd-care-explodeaza-emotional",
	],
};
