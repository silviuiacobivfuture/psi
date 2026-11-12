import type { ArticleInput } from "../../../schema";

export const article: ArticleInput = {
	slug: "semne-de-dislexie-la-copil",
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
		ro: "Semne de dislexie la copil: ce observi la grădiniță și în clasa I",
		en: "Signs of dyslexia in a child: what to notice in kindergarten and first grade",
	},
	standfirst: {
		ro: "La grădiniță: rime greu de prins, litere care nu rămân în minte, cuvinte pronunțate „bebelușește”. În clasa I: citit lent și șovăielnic, cuvinte ghicite după imagine, litere inversate. Dislexia nu ține de inteligență. Dacă semnele rămân, cere o evaluare logopedică și psihologică.",
		en: "In kindergarten: rhymes that are hard to catch, letters that will not stay in mind, words pronounced in baby talk. In first grade: slow, hesitant reading, words guessed from pictures, reversed letters. Dyslexia has nothing to do with intelligence. If the signs stay, ask for a speech and psychological evaluation.",
	},
	cover: {
		src: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Parent_helps_child_with_homework_during_afternoon_study_session_at_home.jpg/1280px-Parent_helps_child_with_homework_during_afternoon_study_session_at_home.jpg",
		alt: {
			ro: "Un adult arată cu degetul într-un caiet deschis pe o masă de lemn, iar un copil urmărește pagina.",
			en: "An adult points a finger at an open workbook on a wooden table while a child follows the page.",
		},
		width: 1280,
		height: 1917,
	},
	body: [
		{
			type: "p",
			text: {
				ro: "Probabil te întrebi dacă e leneș, dacă nu se concentrează sau dacă ceva mai profund se află în spatele faptului că citește greu. Nu știm de aici, și nici nu ar fi corect să ghicim. Putem spune însă ce semne merită observate la grădiniță și în clasa I și ce faci după. Dislexia nu are legătură cu inteligența, iar un copil care citește greu nu e un copil care nu vrea. Mai jos găsești semnele, drumul unei evaluări și ce ajută acasă.",
				en: "You probably wonder whether he is lazy, whether he cannot concentrate, or whether something deeper lies behind how hard reading is for him. We cannot know from here, and it would not be fair to guess. What we can say is which signs are worth noticing in kindergarten and first grade, and what to do next. Dyslexia has nothing to do with intelligence, and a child who reads with difficulty is not a child who does not want to. Below are the signs, the path of an evaluation and what helps at home.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce este dislexia, pe înțelesul unui părinte?",
				en: "What is dyslexia, in plain words?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Centrul pentru Dislexie de la Universitatea Yale o descrie ca o dificultate neașteptată de a învăța să citești: neașteptată, pentru că restul copilului pare să meargă bine. Copilul înțelege povestea pe care i-o citești, glumește, construiește, dar când vine vorba de legat literele de sunete, ceva se împotmolește. Nu e o problemă de vedere, iar a „citi mai mult” nu o rezolvă singur.",
				en: "The Yale Center for Dyslexia describes it as an unexpected difficulty in learning to read: unexpected, because the rest of the child seems to be doing well. He understands the story you read to him, makes jokes, builds things, but when it comes to linking letters with sounds, something gets stuck. It is not a problem of eyesight, and “reading more” does not fix it on its own.",
			},
		},
		{
			type: "h2",
			text: { ro: "Ce semne se văd la grădiniță?", en: "What signs show up in kindergarten?" },
		},
		{
			type: "p",
			text: {
				ro: "La grădiniță nu se pune niciun diagnostic, dar câteva observații merită notate. Centrul de la Yale enumeră pentru anii preșcolari:",
				en: "No diagnosis is made in kindergarten, but a few observations are worth noting. For the pre-school years the Yale Center lists:",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "greutate în a învăța cântecele și poeziile cu rimă;",
					en: "trouble learning nursery rhymes;",
				},
				{
					ro: "dificultate în a învăța și a ține minte numele literelor;",
					en: "difficulty learning and remembering letter names;",
				},
				{
					ro: "nu recunoaște literele din propriul nume;",
					en: "does not recognise the letters in his own name;",
				},
				{
					ro: "pronunță greșit cuvinte familiare sau vorbește tot „bebelușește”;",
					en: "mispronounces familiar words or keeps using baby talk;",
				},
				{
					ro: "nu observă rimele („pisică” și „mică” sună la fel la final);",
					en: "does not notice rhyming patterns;",
				},
				{
					ro: "în familie, cineva a avut greutăți la citit sau la scris.",
					en: "a family history of reading or spelling difficulties.",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "Ghidul logopedic pentru educatoare al CJRAE Mureș, un material românesc, adaugă un semn din zona vorbirii: începutul târziu al vorbitului, pronunție care se corectează greu, cuvinte lungi sau necunoscute care încurcă limba. Același ghid precizează un lucru important: existența unora dintre aceste simptome nu înseamnă neapărat că un copil va fi dislexic. Sunt semne care cer atenție, nu un verdict. Cu cât le vezi mai devreme și cu cât copilul primește sprijin mai devreme, cu atât școala va fi, de regulă, mai ușoară.",
				en: "The speech therapy guide for kindergarten teachers from CJRAE Mureș, a Romanian resource, adds signs from the speech side: starting to talk late, pronunciation that is hard to correct, long or unfamiliar words that tangle the tongue. The same guide makes an important point: having some of these symptoms does not necessarily mean a child will be dyslexic. They are signs that call for attention, not a verdict. The earlier you notice them and the earlier the child gets support, the easier school tends to be.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum arată în clasa I: citit lent, litere inversate?",
				en: "What does it look like in first grade: slow reading, reversed letters?",
			},
		},
		{
			type: "p",
			text: {
				ro: "În clasa I lucrurile se văd mai clar, pentru că citirea devine tema zilei. Yale amintește: erori de citire care nu au legătură cu literele (spune „câine” când vede poza unui câine, deși cuvântul scris e altul), nu înțelege că un cuvânt se poate rupe în părți, nu reușește să silabisească cuvinte simple ca „mac” sau „sac”, nu leagă literele de sunete. NHS adaugă citit sub nivelul așteptat, citit hotărât lent și șovăielnic cu voce tare, scris neîngrijit cu multe greșeli și greutăți de organizare a temelor.",
				en: "In first grade things show more clearly, because reading becomes the subject of the day. Yale lists reading errors unconnected to the letters (saying “puppy” on seeing a picture of a dog, whatever the written word is), not understanding that words can be broken into parts, being unable to sound out simple words like “cat” or “map”, not connecting letters with sounds. The NHS adds reading below the expected level, slow and hesitant reading aloud, messy writing with many spelling mistakes and trouble planning schoolwork.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Inversările de litere (b cu d, p cu q) sunt cele mai cunoscute și cele mai înțelese greșit. Ele apar la mulți copii care abia învață literele. Nu e un semn în sine; contează dacă se adună cu alte lucruri și dacă rămân. Observă și ce spune copilul: „Mi se strică litera când trebuie să citesc.” Yale notează că unii copii se plâng că citirea e grea sau că „dispare” când vine momentul să citească. Frustrarea, iar nu lenea, e adesea explicația.",
				en: "Letter reversals (b for d, p for q) are the best known and the most misunderstood. They appear in many children who are only just learning letters. They are not a sign in themselves; what matters is whether they come with other things and whether they stay. Listen to what the child says too: “The letters go funny when I have to read.” Yale notes that some children complain that reading is hard or that it “disappears” when it is time to read. Frustration, not laziness, is often the explanation.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Are dislexia legătură cu inteligența?",
				en: "Does dyslexia have anything to do with intelligence?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Nu. NHS scrie simplu că dislexia nu afectează inteligența. Yale adaugă că ea nu stinge creativitatea și ingeniozitatea, iar printre punctele tari din primii ani de școală amintește curiozitatea, imaginația, înțelegerea bună a poveștilor citite cu voce tare și plăcerea pentru puzzle-uri.",
				en: "No. The NHS states plainly that dyslexia does not affect intelligence. Yale adds that it does not dampen creativity and ingenuity, and among the strengths of the early school years it lists curiosity, imagination, good comprehension of stories read aloud and enjoyment of puzzles.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Asta contează pentru ce spui copilului. Un copil care aude „nu te străduiești” își pierde încrederea mai repede decât capacitatea de a citi. O replică mai bună: „Citirea e grea pentru tine acum. Nu înseamnă că ești mai puțin deștept. O să găsim împreună un drum.”",
				en: "This matters for what you say to him. A child who hears “you’re not trying” loses confidence faster than he gains skill in reading. A better line: “Reading is hard for you right now. That does not mean you are less clever. We will find a way together.”",
			},
		},
		{
			type: "h2",
			text: { ro: "Ce nu este dislexia?", en: "What dyslexia is not" },
		},
		{
			type: "p",
			text: {
				ro: "Nu e lene, nu e „mofturi” și nu e rezultatul unei familii care n-a citit destul. Nu e o problemă de vedere sau de auz, deși acestea trebuie excluse: NHS spune că medicul de familie nu poate diagnostica dislexia, dar poate verifica alte cauze, cum ar fi problemele de auz, și poate recomanda o verificare a vederii. Nu e nici un semn care, singur, să decidă ceva: NICHD arată că semnele nu stabilesc singure o dificultate de învățare și că doar un specialist o poate diagnostica.",
				en: "It is not laziness, not “fussing” and not the result of a family that did not read enough. It is not a problem of sight or hearing, although those have to be ruled out: the NHS says a GP cannot diagnose dyslexia but can check for other causes, such as hearing problems, and may suggest an eye test. Nor is any single sign decisive on its own: NICHD notes that signs alone do not establish a learning disability and that only a professional can diagnose one.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Iar dacă acasă se vorbesc două limbi, nu grăbi concluzia. NICHD recomandă ca evaluările pentru copiii bilingvi să țină seama de aceste diferențe. Spune-i specialistului ce limbi aude copilul și în ce proporție.",
				en: "And if two languages are spoken at home, do not rush to conclusions. NICHD recommends that assessments of bilingual children take such differences into account. Tell the specialist which languages the child hears, and how much of each.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum arată evaluarea: logoped, psiholog, medic",
				en: "What the evaluation looks like: speech therapist, psychologist, doctor",
			},
		},
		{
			type: "p",
			text: {
				ro: "Nu există un test unic. NHS spune că o evaluare completă o face de obicei un psiholog educațional sau un cadru didactic specializat, nu un medic. Logopedul are un rol natural, pentru că pronunția, auzul fonematic (să deosebești sunetele vorbirii) și limbajul stau la baza cititului. Din motive practice, ai nevoie să vezi tabloul întreg: un logoped care ascultă limbajul și un psiholog care se uită la restul abilităților, atenție, memorie și învățare.",
				en: "There is no single test. The NHS says a full assessment is usually carried out by an educational psychologist or a specialist teacher, not a doctor. The speech therapist has a natural role, because pronunciation, phonemic hearing (telling speech sounds apart) and language underlie reading. In practice you need the whole picture: a speech therapist who listens to language and a psychologist who looks at the other abilities, attention, memory and learning.",
			},
		},
		{
			type: "p",
			text: {
				ro: "La Psizone, logopedul și psihologii lucrează în același centru, în Galați, deci pot compara observațiile despre același copil. Evaluarea începe cu o discuție cu părinții și cu ce documente aveți deja (de la școală, de la medic), continuă cu observație și instrumente alese după vârstă și se încheie cu recomandări explicate. Nu promitem dinainte un diagnostic: spunem ce am văzut și ce urmează. Dacă bănuim o problemă medicală de auz sau de vedere, te trimitem la medic.",
				en: "At Psizone, the speech therapist and the psychologists work in the same centre, in Galați, so they can compare observations about the same child. The evaluation starts with a conversation with the parents and whatever documents you already have (from school, from the doctor), continues with observation and instruments chosen for age, and ends with recommendations that are explained. We do not promise a diagnosis in advance: we say what we saw and what comes next. If we suspect a medical problem of hearing or vision, we send you to a doctor.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce sprijin primește copilul la școală?",
				en: "What support does the child get at school?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Prima persoană cu care vorbești este învățătoarea: ce vede în clasă, cum merg lectura, scrisul, temele. Întreabă școala ce servicii de sprijin există, inclusiv prin centrul județean de resurse și asistență educațională (CJRAE), din care provine și ghidul citat mai sus. NHS descrie, ca abordări care ajută, materiale vizuale sau tehnologie și lucrul în grupuri mici sau individual. Gândește-te la ceva practic: mai mult timp la citit, instrucțiuni date și pe scurt și în scris, notițe care nu-l penalizează pentru ortografie.",
				en: "The first person to talk to is the teacher: what she sees in class, how reading, writing and homework are going. Ask the school what support services exist, including through the county centre for educational resources and assistance (CJRAE), the body behind the guide cited above. The NHS describes visual aids or technology and small-group or one-to-one teaching as helpful approaches. Think practical: more time to read, instructions given briefly and in writing, marking that does not penalise him for spelling.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce le spui educatoarei sau învățătoarei?",
				en: "What do you say to the kindergarten or primary teacher?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Mergi cu observații, nu cu etichete. În loc de „cred că are dislexie”, încearcă: „Acasă observ că nu ține minte literele și evită cărțile. Voi ce vedeți la clasă? Când citește cu voce tare, ce se întâmplă?” Așa deschizi o conversație, iar ea poate răspunde cu exemple, nu cu o părere. Cere un exemplu concret: un caiet, o fișă, o notiță. Un adult care vede copilul zilnic, alături de tine, face din semnele vagi un tablou.",
				en: "Go with observations, not labels. Instead of “I think he has dyslexia”, try: “At home I notice he does not remember letters and avoids books. What do you see in class? When he reads aloud, what happens?” That opens a conversation, and she can answer with examples, not an opinion. Ask for something concrete: a notebook, a worksheet, a note. An adult who sees the child every day, together with you, turns vague signs into a picture.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Dacă ești tu educatoarea sau învățătoarea și ai citit până aici, un lucru contează mai mult decât orice: nu îl pune pe copil să citească cu voce tare în fața clasei dacă nu s-a oferit el. Poți să-i dai textul din timp, să-i lași timp suplimentar, să-i spui în privat ce ai observat. Copiii cu dificultăți de citit învață repede să se ascundă, iar asta se vede în comportament, nu în note.",
				en: "If you are the kindergarten or primary teacher and have read this far, one thing matters above all: do not make the child read aloud in front of the class if he has not offered. You can give him the text in advance, allow extra time, tell him privately what you have noticed. Children with reading difficulties quickly learn to hide, and it shows in behaviour, not in marks.",
			},
		},
		{
			type: "h2",
			text: { ro: "Cum citești acasă fără stres?", en: "How do you read at home without stress?" },
		},
		{
			type: "p",
			text: {
				ro: "E 20:30, e obosit, iar cartea de citire stă deschisă ca un reproș. Nu încerca atunci. Alege un moment în care amândoi sunteți în largul vostru și citește tu cu voce tare: povestea rămâne un loc de plăcere, iar creierul lui aude cum sună limba. Cărțile cu rimă și jocurile cu sunete (care cuvinte încep ca „mașină”?) pregătesc terenul fără să cheme la examen.",
				en: "It is 8.30 in the evening, he is tired, and the reading book lies open like a reproach. Do not try then. Choose a moment when you are both at ease and read aloud yourself: the story stays a place of pleasure, and his brain hears how the language sounds. Books with rhymes and sound games (which words begin like “mum”?) prepare the ground without calling him to an exam.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Când el citește, citiți pe rând: tu o propoziție, el una. Dacă greșește, ajută-l fără să-l corectezi apăsat: „Hai să mai încercăm cuvântul ăsta.” Laudă efortul („ai stat cu el până a ieșit”), nu doar rezultatul. NHS recomandă acasă încrederea în sine, învățatul făcut distractiv și mișcarea fizică. Nu-l compara cu alți copii și nu spune „doar mai exersează”.",
				en: "When he reads, take turns: one sentence from you, one from him. If he makes a mistake, help without correcting heavily: “Let’s try that word again.” Praise the effort (“you stayed with it until it came”), not only the result. The NHS recommends building confidence, making learning fun and encouraging physical activity at home. Do not compare him with other children and do not say “just practise more”.",
			},
		},
		{
			type: "h2",
			text: { ro: "Când ceri evaluarea?", en: "When do you ask for an evaluation?" },
		},
		{
			type: "p",
			text: {
				ro: "Nu e nevoie să aștepți până când copilul „rămâne în urmă”. Cere o evaluare dacă mai multe dintre semnele de mai sus se țin lanț, dacă ele persistă în ciuda sprijinului de la școală, dacă copilul evită citirea sau spune că „e prost”. NHS recomandă o evaluare formală dacă un copil continuă să se chinuie, în ciuda ajutorului suplimentar din școală. Dacă ești în dubiu, poți începe cu ce ți se pare simplu: o discuție cu învățătoarea și una cu un logoped.",
				en: "You do not need to wait until the child “falls behind”. Ask for an evaluation if several of the signs above come together, if they persist despite support at school, if the child avoids reading or says he is “stupid”. The NHS recommends a formal assessment if a child still struggles despite extra support at school. If you are unsure, start with what seems simple: a talk with the teacher and one with a speech therapist.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pasul următor: programează o evaluare logopedică și psihologică pe psizone.ro și spune-ne ce ai observat. Prima discuție e despre voi, nu despre diagnostic.",
				en: "Next step: book a speech and psychological evaluation on psizone.ro and tell us what you have noticed. The first conversation is about you, not about a diagnosis.",
			},
		},
	],
	sources: [
		{
			label: { ro: "NHS: dislexia", en: "NHS: dyslexia" },
			href: "https://www.nhs.uk/conditions/dyslexia/",
		},
		{
			label: {
				ro: "Yale Center for Dyslexia and Creativity: semnele dislexiei",
				en: "Yale Center for Dyslexia and Creativity: signs of dyslexia",
			},
			href: "https://dyslexia.yale.edu/dyslexia/signs-of-dyslexia/",
		},
		{
			label: {
				ro: "NICHD: semnele tulburărilor de citire și evaluarea",
				en: "NICHD: signs of reading disorders and assessment",
			},
			href: "https://www.nichd.nih.gov/health/topics/learning/conditioninfo/signs",
		},
		{
			label: {
				ro: "NIDCD: tulburarea de limbaj în dezvoltare (probleme de citire)",
				en: "NIDCD: developmental language disorder (reading problems)",
			},
			href: "https://www.nidcd.nih.gov/health/developmental-language-disorder",
		},
		{
			label: {
				ro: "CJRAE Mureș: Ghid metodic logopedic pentru cadrele didactice din învățământul preșcolar",
				en: "CJRAE Mureș: speech therapy methods guide for pre-school teachers (Romanian)",
			},
			href: "https://www.edums.ro/resurseeducationale/files/prescolar/romana/!Z2018-2020/Ghid%20logopedic%20pentru%20educatoare%20-%20Echipa%20C.J.R.A.E.%20Mure%C8%99.pdf",
		},
		{
			label: { ro: "Psizone", en: "Psizone" },
			href: "https://psizone.ro",
		},
	],
	provenance: [
		"https://www.nhs.uk/conditions/dyslexia/ (opened 2026-11-12): general signs, does not affect intelligence, GP checks hearing/vision, educational psychologist, school SENCO, support at home and school",
		"https://dyslexia.yale.edu/dyslexia/signs-of-dyslexia/ (opened 2026-11-12): preschool and kindergarten/first-grade signs, definition, strengths",
		"https://www.nichd.nih.gov/health/topics/learning/conditioninfo/signs (opened 2026-11-12): general signs, signs alone do not establish a disability, bilingual assessment",
		"CJRAE Mureș guide, dyslexia section (opened 2026-11-12): preschool predisposition signs, symptoms are not a verdict, earlier support",
		"apps/psizone-web/src/content/rich/aba-speech.ts (LOGOPEDIE) and packages/content/src/articles/library/psizone/ce-include-o-evaluare-la-psizone-galati.ts: Psizone evaluation steps, speech therapists and psychologists in the same centre",
		"Cover: Wikimedia Commons, “Parent helps child with homework during afternoon study session at home.jpg”, by Shixart1985, CC BY 2.0",
	],
	seo: {
		title: {
			ro: "Semne de dislexie la copil: grădiniță și clasa I",
			en: "Signs of dyslexia in children: kindergarten and first grade",
		},
		description: {
			ro: "Semne de dislexie la copil la grădiniță și în clasa I, cum se face evaluarea, ce sprijin există la școală și cum citești acasă fără stres.",
			en: "Signs of dyslexia in children in kindergarten and first grade, how evaluation works, what support exists at school and how to read at home without stress.",
		},
		keywords: {
			ro: [
				"semne de dislexie la copil",
				"dislexie clasa I",
				"dislexie la grădiniță",
				"copilul citește greu",
				"evaluare dislexie",
				"dislexie și inteligență",
			],
			en: [
				"signs of dyslexia in children",
				"dyslexia first grade",
				"dyslexia kindergarten signs",
				"child struggles to read",
				"dyslexia assessment",
			],
		},
	},
	faq: [
		{
			q: {
				ro: "Care sunt primele semne de dislexie la un copil mic?",
				en: "What are the first signs of dyslexia in a small child?",
			},
			a: {
				ro: "La grădiniță: greutate în a învăța cântece și poezii cu rimă, în a ține minte numele literelor, în a recunoaște literele din propriul nume, pronunție „bebelușească” prelungită și istoric familial de greutăți la citit. Sunt semne de observat, nu un diagnostic: doar un specialist poate stabili ceva.",
				en: "In kindergarten: trouble learning nursery rhymes, remembering letter names, recognising the letters in his own name, baby talk that goes on, and a family history of reading difficulties. These are signs to watch, not a diagnosis: only a professional can decide anything.",
			},
		},
		{
			q: {
				ro: "Copilul meu inversează literele. Înseamnă dislexie?",
				en: "My child reverses letters. Does that mean dyslexia?",
			},
			a: {
				ro: "Nu neapărat. Inversările apar la mulți copii care abia învață literele. Contează dacă se adună cu alte semne (citit lent, greutate în a lega literele de sunete, ortografie foarte neregulată) și dacă rămân în timp. Dacă te îngrijorează, discută cu învățătoarea și cere o evaluare.",
				en: "Not necessarily. Reversals appear in many children who are only just learning letters. What matters is whether they come with other signs (slow reading, trouble linking letters to sounds, very irregular spelling) and whether they last. If you are worried, talk to the teacher and ask for an evaluation.",
			},
		},
		{
			q: {
				ro: "Dislexia înseamnă că e mai puțin inteligent?",
				en: "Does dyslexia mean he is less intelligent?",
			},
			a: {
				ro: "Nu. NHS spune că dislexia nu afectează inteligența. Un copil cu dislexie poate înțelege perfect o poveste citită cu voce tare, poate fi curios și imaginativ. Dificultatea e în a lega literele de sunete și a citi curent, nu în capacitatea de a gândi.",
				en: "No. The NHS says dyslexia does not affect intelligence. A child with dyslexia may understand a story read aloud perfectly and may be curious and imaginative. The difficulty lies in linking letters to sounds and reading fluently, not in the ability to think.",
			},
		},
		{
			q: {
				ro: "Cine poate evalua un copil pentru dislexie?",
				en: "Who can evaluate a child for dyslexia?",
			},
			a: {
				ro: "Nu medicul de familie, care poate doar verifica alte cauze, cum sunt auzul și vederea. NHS spune că o evaluare completă o face de obicei un psiholog educațional sau un cadru didactic specializat. În practică ajută o echipă: logoped și psiholog, plus învățătoarea, care vede copilul zilnic.",
				en: "Not a family doctor, who can only check other causes, such as hearing and vision. The NHS says a full assessment is usually carried out by an educational psychologist or a specialist teacher. In practice a team helps: speech therapist and psychologist, plus the teacher, who sees the child every day.",
			},
		},
		{
			q: {
				ro: "Ce pot face acasă ca să-l ajut?",
				en: "What can I do at home to help?",
			},
			a: {
				ro: "Citește tu cu voce tare, alege cărți cu rimă, joacă jocuri cu sunete și citiți pe rând, fără corectări apăsate. Laudă efortul și păstrează citirea ca moment plăcut, nu ca temă care întinde nervii. NHS recomandă încrederea în sine, învățatul distractiv și mișcarea fizică. Acasă sprijini, nu înlocuiești un specialist.",
				en: "Read aloud yourself, choose books with rhymes, play sound games and take turns reading, without heavy correction. Praise effort and keep reading a pleasant moment, not homework that frays nerves. The NHS recommends building confidence, making learning fun and encouraging physical activity. At home you support, you do not replace a specialist.",
			},
		},
	],
	related: [
		"disgrafia-copilul-scrie-urat",
		"copilul-nu-se-concentreaza-la-teme",
		"pregatirea-pentru-clasa-pregatitoare",
		"cand-mergem-la-logoped",
	],
};
