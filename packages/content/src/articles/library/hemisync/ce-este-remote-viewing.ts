import type { ArticleInput } from "../../../schema";

export const article: ArticleInput = {
	slug: "ce-este-remote-viewing",
	brand: "hemisync",
	topic: "explorarea-constiintei",
	backlogNo: null,
	status: "draft",
	kind: "editorial",
	aiDrafted: true,
	draftedAt: "2026-11-12",
	author: null,
	reviewer: null,
	title: {
		ro: "Ce este remote viewing-ul, pe înțeles",
		en: "What is remote viewing, plainly explained",
	},
	standfirst: {
		ro: "Remote viewing este o practică structurată: o persoană, „viewerul”, încearcă să descrie un loc sau o imagine pe care nu le poate cunoaște prin mijloace obișnuite, iar descrierea e comparată apoi cu ținta. A fost testată în laboratoare și în programe militare. Rezultatele rămân disputate.",
		en: "Remote viewing is a structured practice: a person, the “viewer”, tries to describe a place or picture they cannot know by ordinary means, and the description is then compared with the target. It was tested in laboratories and military programmes. The results remain disputed.",
	},
	cover: {
		src: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Transf%C4%83g%C4%83r%C4%83%C8%99an_%2815283502929%29.jpg/1280px-Transf%C4%83g%C4%83r%C4%83%C8%99an_%2815283502929%29.jpg",
		alt: {
			ro: "Un drum de munte care se pierde în ceață, în alb-negru, cu o siluetă mică la marginea parapetului.",
			en: "A mountain road vanishing into fog, in black and white, with a small figure at the edge of the parapet.",
		},
		width: 1280,
		height: 853,
	},
	body: [
		{
			type: "p",
			text: {
				ro: "Remote viewing, în traducere liberă „vedere de la distanță”, este o practică în care o persoană, numită viewer, încearcă să descrie ceva ce nu poate vedea și nu poate ști prin simțuri obișnuite: un loc, o fotografie, un obiect. Notează sau desenează impresiile pe o foaie, iar altcineva verifică, apoi, cât de bine se potrivesc cu ținta. Pe scurt, asta e tot. Restul este felul în care s-a încercat să se facă acest lucru cinstit.",
				en: "Remote viewing is a practice in which a person, called a viewer, tries to describe something they cannot see and cannot know through ordinary senses: a place, a photograph, an object. They write or draw their impressions on a sheet, and someone else then checks how well they match the target. In short, that is all. The rest is how people tried to do this honestly.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Nu luăm partea nimănui aici. Spunem cum arată un protocol, ce înseamnă termenii, de unde vine practica, cine a testat-o și ce a concluzionat. Despre ce se pretinde și ce s-a arătat vorbim separat, la sfârșit.",
				en: "We take nobody’s side here. We say what a protocol looks like, what the terms mean, where the practice comes from, who tested it and what they concluded. What is claimed and what was shown we treat separately, at the end.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce este remote viewing-ul, într-o singură frază?",
				en: "What is remote viewing, in a single sentence?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Raportul din 1995 al Institutelor Americane pentru Cercetare (AIR), cerut de CIA, îl definește simplu: capacitatea de a descrie locuri pe care nu le-ai vizitat. O sinteză enciclopedică spune același lucru, adăugând că ar fi vorba de impresii despre un subiect îndepărtat sau nevăzut, percepute cu mintea. Ambele definiții descriu o pretenție, nu un fapt dovedit; de aceea contează protocolul cu care se verifică.",
				en: "The 1995 report by the American Institutes for Research (AIR), commissioned by the CIA, defines it simply: the ability to describe locations one has not visited. An encyclopaedic overview says the same, adding that it concerns impressions about a distant or unseen subject, sensed with the mind. Both definitions describe a claim, not a proven fact; that is why the protocol used to check it matters.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum arată un protocol, pas cu pas?",
				en: "What does a protocol look like, step by step?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Raportul AIR descrie cel mai des întâlnit experiment de laborator. Îl poți urmări ca pe o mică piesă în cinci acte.",
				en: "The AIR report describes the most common laboratory experiment. You can follow it as a small play in five acts.",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "Se stabilește dinainte un set de ținte, de pildă cinci fotografii (în studiile recente, fotografii din National Geographic).",
					en: "A set of targets is fixed in advance, for instance five photographs (in the recent studies, National Geographic photographs).",
				},
				{
					ro: "Ținta se alege la întâmplare, astfel încât fiecare variantă să aibă aceleași șanse. Viewerul nu știe care e.",
					en: "The target is picked at random so that every option has the same chance. The viewer does not know which.",
				},
				{
					ro: "Viewerul descrie și desenează ce „percepe”. Uneori e ajutat de un monitor, care îi pune întrebări, dar care e și el orb față de răspuns.",
					en: "The viewer describes and draws what he or she “perceives”. Sometimes a monitor helps, asking questions, but the monitor is also blind to the answer.",
				},
				{
					ro: "Un judecător care nu știe ținta primește descrierea și cele cinci imagini și le ordonează după asemănare, de la 1 la 5.",
					en: "A judge who does not know the target receives the description and the five pictures and ranks them by similarity, from 1 to 5.",
				},
				{
					ro: "Rangul ținței reale este scorul. Din întâmplare, ținta ar primi fiecare rang cu aceeași probabilitate; hit-urile peste șansă sunt ceea ce se caută.",
					en: "The rank of the real target is the score. By chance, the target would receive each rank with equal likelihood; hits beyond chance are what is looked for.",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "Ca să-l simți, încearcă o versiune de acasă, doar pentru a înțelege mecanismul. Un prieten alege la întâmplare una din cinci fotografii, o închide într-un plic opac și pleacă. Tu stai la o masă și scrii ce îți vine în minte, apoi desenezi. Un al treilea om, care nu a văzut nimic, primește foaia și cele cinci fotografii și spune care i se pare cea mai asemănătoare. Nu dovedește nimic, dar te lasă să vezi cât de ușor ne păcălim singuri dacă o etapă lipsește.",
				en: "To get the feel of it, try a version at home, only to understand the mechanism. A friend picks one of five photographs at random, seals it in an opaque envelope and leaves. You sit at a table and write what comes to mind, then draw. A third person, who has seen nothing, receives the sheet and the five photographs and says which seems most similar. It proves nothing, but it lets you see how easily we fool ourselves if a step is missing.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Cum arată o foaie de impresii? Fără mister: câteva rânduri scurte și schițe. „Ceva lung și orizontal. Apă? Mișcare. Albastru, gri. Un sunet îndepărtat. Senzație de spațiu deschis.” Apoi un desen cu două linii și un val. Judecătorul se uită la foaie și la cele cinci fotografii și caută, cinstit, care se potrivește mai bine. Aici se vede și dificultatea: o descriere vagă se potrivește cu mai multe imagini, iar decizia ține de cel care citește.",
				en: "What does a sheet of impressions look like? Without mystery: a few short lines and sketches. “Something long and horizontal. Water? Movement. Blue, grey. A distant sound. A feeling of open space.” Then a drawing of two lines and a wave. The judge looks at the sheet and at the five photographs and honestly searches for the better fit. Here the difficulty shows too: a vague description fits several pictures, and the decision rests with whoever reads.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "De ce contează ținta oarbă și feedbackul?",
				en: "Why do blind targets and feedback matter?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Fiecare etapă „oarbă” există ca să înlăture o explicație obișnuită. Raportul AIR amintește două greșeli din cercetările timpurii: o eroare statistică în felul în care erau clasate ținte deja judecate, și indicii care puteau produce hit-uri fără nicio abilitate paranormală, cum ar fi timpul necesar pentru a ajunge la fiecare loc. Cercetătorii David Marks și Richard Kammann au reluat experimentele de la Stanford și au găsit în notițele judecătorilor mențiuni despre ținte anterioare și date ale sesiunilor, care puteau explica ratele mari de succes.",
				en: "Every “blind” step exists to remove an ordinary explanation. The AIR report recalls two flaws in the early research: a statistical error in how already-judged targets were ranked, and cues that could produce hits without any paranormal ability, such as the time needed to reach each location. Researchers David Marks and Richard Kammann tried to replicate the Stanford experiments and found in the judges’ notes references to earlier targets and session dates that could explain the high success rates.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Feedbackul e mai delicat. În majoritatea experimentelor, viewerul află până la urmă răspunsul corect. Jessica Utts, statisticiană chemată de AIR ca să prezinte punctul de vedere favorabil, notează că aceasta face greu de exclus precogniția, adică ideea că viewerul „vede” de fapt momentul viitor în care va primi răspunsul. În operațiuni reale, spune raportul, viewerii nu pot primi feedback, iar condițiile din laborator nu se aplică.",
				en: "Feedback is more delicate. In most experiments the viewer eventually learns the correct answer. Jessica Utts, the statistician AIR brought in to present the favourable view, notes that this makes it hard to rule out precognition, the idea that the viewer is really “seeing” the future moment of receiving the answer. In real operations, the report says, viewers cannot be given feedback, and the laboratory conditions do not apply.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Cu cinci ținte, dacă totul se petrece din întâmplare, ținta reală ar ajunge pe locul întâi în una din cinci încercări, în medie. Un efect real ar însemna, în timp, mai multe hit-uri decât atât. De aici vine toată statistica: nu o sesiune spectaculoasă, ci multe sesiuni, notate la fel, cu ținte alese la fel. O poveste frumoasă dintr-o seară nu face un rezultat.",
				en: "With five targets, if everything happens by chance, the real target would land in first place in one attempt in five, on average. A real effect would mean, over time, more hits than that. This is where all the statistics come from: not one spectacular session, but many sessions, scored the same way, with targets chosen the same way. A good story from one evening does not make a result.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cine e viewerul, monitorul și „taskerul”?",
				en: "Who is the viewer, the monitor and the “tasker”?",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "Viewerul: persoana care descrie ținta, în scris și în desen.",
					en: "The viewer: the person who describes the target, in writing and in drawing.",
				},
				{
					ro: "Monitorul: cel care stă lângă viewer, pune întrebări neutre și ține sesiunea în ordine. În experimentele bune, nici el nu știe ținta.",
					en: "The monitor: the one who sits beside the viewer, asks neutral questions and keeps the session in order. In good experiments, he or she does not know the target either.",
				},
				{
					ro: "Emițătorul (sau „beacon”): în variantele timpurii, o persoană care călătorea la un loc și se uita la el în timp ce viewerul îl descria.",
					en: "The sender (or “beacon”): in the early variants, a person who travelled to a place and looked at it while the viewer described it.",
				},
				{
					ro: "Judecătorul: persoana care nu știe ținta și compară descrierea cu mai multe variante.",
					en: "The judge: the person who does not know the target and compares the description with several options.",
				},
				{
					ro: "Taskerul: persoana sau instituția care pune întrebarea. Raportul AIR vorbește despre viewerii „însărcinați” (tasked) cu răspunsuri la întrebările agențiilor și despre „utilizatorii finali”.",
					en: "The tasker: the person or institution that poses the question. The AIR report speaks of viewers “tasked” with answering agencies’ questions, and of “end users”.",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "Vocabularul variază între laboratoare și programe. Am păstrat termenii pe care documentele deschise de noi îi susțin; în unele cercuri se folosesc și alții.",
				en: "Vocabulary varies between laboratories and programmes. We kept the terms that the documents we opened support; in some circles others are used too.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "De unde vine practica?",
				en: "Where does the practice come from?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Povestea începe la începutul anilor 1970, la Stanford Research Institute, azi SRI International, în California. Raportul AIR spune că un program guvernamental de cercetare a funcționat acolo până în 1989, iar din anul următor a fost preluat de Science Applications International Corporation (SAIC), sub conducerea lui Edwin May. Fizicienii Russell Targ și Harold Puthoff au fost figurile principale ale perioadei SRI. Targ spune că expresia „remote viewing” i-a fost sugerată de Ingo Swann în decembrie 1971.",
				en: "The story begins in the early 1970s at the Stanford Research Institute, today SRI International, in California. The AIR report says a government research programme ran there until 1989, and from the following year it moved to Science Applications International Corporation (SAIC), under Edwin May. The physicists Russell Targ and Harold Puthoff were the main figures of the SRI period. Targ says the phrase “remote viewing” was suggested to him by Ingo Swann in December 1971.",
			},
		},
		{
			type: "p",
			text: {
				ro: "În 1974, Targ și Puthoff au publicat în revista Nature lucrarea „Information transmission under conditions of sensory shielding”, care a atras atenția și a stârnit critici. Iar în anii 1970, interesul serviciilor de informații a transformat o curiozitate de laborator într-un program. Istoria acelui program o spunem în articolul despre proiectul Stargate.",
				en: "In 1974, Targ and Puthoff published in the journal Nature the paper “Information transmission under conditions of sensory shielding”, which drew attention and stirred criticism. And in the 1970s, the interest of intelligence services turned a laboratory curiosity into a programme. The history of that programme we tell in the article on Project Stargate.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce se pretinde și ce s-a arătat?",
				en: "What is claimed, and what has been shown?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pretenția: unii oameni pot descrie ținte pe care nu le pot ști prin simțurile obișnuite. Raportul AIR a pus ambele jumătăți ale discuției față în față. Cei doi experți, Utts, favorabilă interpretării paranormale, și Raymond Hyman, sceptic, au căzut de acord că în experimentele de laborator s-a obținut un efect statistic semnificativ: hit-urile apar mai des decât din întâmplare.",
				en: "The claim: some people can describe targets they cannot know through ordinary senses. The AIR report set both halves of the discussion face to face. The two experts, Utts, favourable to the paranormal interpretation, and Raymond Hyman, a sceptic, agreed that a statistically significant effect had been obtained in the laboratory experiments: hits occur more often than chance.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Contează cât de larg a fost examenul. Panelul a trecut în revistă aproximativ 80 de lucrări, multe dintre ele rezumate ale unor serii întregi de experimente, și s-a oprit în special asupra celor care dădeau cea mai puternică dovadă și asupra celor care corectau greșelile vechi. Raportul spune că cele două recenzii, a lui Utts și a lui Hyman, sunt de o calitate excepțională: una a fost numită cea mai bună apărare a cercetării parapsihologice, cealaltă una din cele mai clare expuneri ale poziției sceptice.",
				en: "It matters how broad the examination was. The panel reviewed approximately 80 publications, many of them summaries of whole series of experiments, and paid special attention to those that gave the strongest evidence and those that corrected earlier mistakes. The report says the two reviews, Utts’s and Hyman’s, are of exceptional quality: one was called the best defence of parapsychological research its reader had seen, the other one of the clearest statements of the sceptical position.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Dezacordul a fost despre cauză. Hyman a spus că un efect semnificativ statistic poate avea multe surse și că explicațiile concurente nu au fost eliminate; Utts a crezut că au fost. Concluzia AIR: nu s-a demonstrat clar că cauza ar fi un fenomen paranormal, între altele pentru că au fost folosiți mereu aceiași viewer, același judecător și aceleași fotografii. Iar în operațiuni, informația a fost vagă, inconsistentă și niciodată folosită pentru a ghida o acțiune.",
				en: "The disagreement was about cause. Hyman said a statistically significant effect can have many sources and that competing explanations had not been eliminated; Utts believed they had. The AIR conclusion: it had not been clearly shown that the cause was a paranormal phenomenon, among other reasons because the same viewers, the same judge and the same photographs were used throughout. And in operations the information was vague, inconsistent and never used to guide an action.",
			},
		},
		{
			type: "p",
			text: {
				ro: "În limbajul sintezelor enciclopedice, remote viewing-ul e considerat o pseudoștiință, iar nu există dovezi științifice acceptate că ar fi posibil. Cele două afirmații, a AIR și a sintezelor, pot fi ținute minte împreună: un efect statistic în câteva experimente, o cauză nedemonstrată și nicio utilitate operațională.",
				en: "In the language of encyclopaedic overviews, remote viewing is considered a pseudoscience, and there is no accepted scientific evidence that it is possible. The AIR statement and the overviews can be remembered together: a statistical effect in a few experiments, an undemonstrated cause and no operational use.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Ce poți păstra, indiferent de părerea ta despre pretenție, este disciplina: să separi ce ai observat de ce ai interpretat, să notezi înainte să afli răspunsul, să ceri cuiva care nu știe să judece. Sunt obiceiuri bune pentru orice exercițiu de atenție, de la o sesiune de meditație la o seară cu prietenii și cinci fotografii.",
				en: "What you can keep, whatever you think of the claim, is the discipline: to separate what you observed from what you interpreted, to write before you learn the answer, to ask someone who does not know to judge. These are good habits for any attention exercise, from a meditation session to an evening with friends and five photographs.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Unde ne duce asta?",
				en: "Where does this leave us?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Remote viewing-ul e o practică cu un protocol clar și cu o istorie documentată. Faptul că a fost studiat serios nu înseamnă că a fost confirmat, iar faptul că nu a fost confirmat nu înseamnă că e ridicol de studiat. Dacă te interesează povestea programului din spatele lui, citește „Proiectul Stargate: istoria pe scurt”.",
				en: "Remote viewing is a practice with a clear protocol and a documented history. That it was studied seriously does not mean it was confirmed, and that it was not confirmed does not mean it is ridiculous to study. If the story of the programme behind it interests you, read “Project Stargate: a short history”.",
			},
		},
	],
	sources: [
		{
			label: {
				ro: "AIR, 1995: „An Evaluation of the Remote Viewing Program” (CIA Reading Room)",
				en: "AIR, 1995: “An Evaluation of the Remote Viewing Program” (CIA Reading Room)",
			},
			href: "https://www.cia.gov/readingroom/print/304501",
		},
		{
			label: {
				ro: "Targ și Puthoff, 1974, Nature: Information transmission under conditions of sensory shielding (PubMed)",
				en: "Targ and Puthoff, 1974, Nature: Information transmission under conditions of sensory shielding (PubMed)",
			},
			href: "https://pubmed.ncbi.nlm.nih.gov/4423858/",
		},
		{
			label: {
				ro: "Remote viewing, fișă enciclopedică (definiție, Swann, critica lui Marks și Kammann)",
				en: "Remote viewing, encyclopaedia entry (definition, Swann, the Marks and Kammann critique)",
			},
			href: "https://en.wikipedia.org/wiki/Remote_viewing",
		},
		{
			label: {
				ro: "Proiectul Stargate (unitatea armatei SUA), fișă enciclopedică (cronologie)",
				en: "Stargate Project (US Army unit), encyclopaedia entry (timeline)",
			},
			href: "https://en.wikipedia.org/wiki/Stargate_Project_(U.S._Army_unit)",
		},
	],
	provenance: [
		"https://www.cia.gov/readingroom/print/304501 (AIR draft report, 22 Sept 1995, text read from the PDF copy; Executive Summary, Ch.1 Background and History, Ch.3 Utts and Hyman exchange)",
		"AIR report, Ch.3 Utts section 3.1: viewer, monitor blind to the answer, sender, feedback and precognition; SRI until 1989, SAIC from 1990 under Edwin May",
		"https://pubmed.ncbi.nlm.nih.gov/4423858/ (Targ and Puthoff, Nature, 1974, title and journal)",
		"https://en.wikipedia.org/wiki/Remote_viewing (definition; Swann, December 1971, per Targ; Marks and Kammann; scientific consensus)",
		"https://en.wikipedia.org/wiki/Stargate_Project_(U.S._Army_unit) (timeline)",
		"Cover image: Sergey Norin, “Transfăgărășan (15283502929)”, Wikimedia Commons, CC BY 2.0, https://commons.wikimedia.org/wiki/File:Transf%C4%83g%C4%83r%C4%83%C8%99an_(15283502929).jpg",
		"docs/brands/writing-voice.md and packages/design/brand-books/3-hemi-sync.md (voice, neutral on claims)",
	],
	seo: {
		title: {
			ro: "Ce este remote viewing: definiție, protocol și verdict",
			en: "What is remote viewing: protocol, terms and what was shown",
		},
		description: {
			ro: "Ce este remote viewing-ul: protocolul în cinci pași, ținte oarbe, viewer, monitor și tasker, istoria lui și ce au concluzionat testele din 1995.",
			en: "What remote viewing is: the five-step protocol, blind targets, viewer, monitor and tasker, its history and what the 1995 evaluation concluded.",
		},
		keywords: {
			ro: [
				"ce este remote viewing",
				"remote viewing definiție",
				"remote viewing protocol",
				"viewer monitor tasker",
				"vedere de la distanță",
				"proiectul Stargate",
			],
			en: [
				"what is remote viewing",
				"remote viewing definition",
				"remote viewing protocol",
				"viewer monitor tasker",
				"psychic spies",
				"Stargate project",
			],
		},
	},
	faq: [
		{
			q: {
				ro: "Ce este remote viewing-ul?",
				en: "What is remote viewing?",
			},
			a: {
				ro: "Este o practică în care o persoană, viewerul, încearcă să descrie un loc, o imagine sau un obiect pe care nu le poate cunoaște prin simțurile obișnuite. Notează sau desenează impresiile, iar altcineva compară apoi descrierea cu ținta. Este o pretenție testată în laboratoare, nu un fapt dovedit.",
				en: "It is a practice in which a person, the viewer, tries to describe a place, picture or object they cannot know through ordinary senses. They write or draw impressions, and someone else then compares the description with the target. It is a claim tested in laboratories, not a proven fact.",
			},
		},
		{
			q: {
				ro: "Cum se testează remote viewing-ul?",
				en: "How is remote viewing tested?",
			},
			a: {
				ro: "Se stabilește un set de ținte, de exemplu cinci fotografii, se alege una la întâmplare, iar viewerul o descrie fără s-o cunoască. Un judecător care nu știe ținta ordonează cele cinci imagini după asemănarea cu descrierea. Rangul ținței reale este scorul; se caută hit-uri mai dese decât din întâmplare.",
				en: "A set of targets is fixed, for example five photographs, one is picked at random, and the viewer describes it without knowing it. A judge who does not know the target ranks the five pictures by similarity to the description. The rank of the real target is the score; hits more frequent than chance are sought.",
			},
		},
		{
			q: {
				ro: "Ce concluzie a avut evaluarea din 1995?",
				en: "What did the 1995 evaluation conclude?",
			},
			a: {
				ro: "Raportul AIR, cerut de CIA, a constatat în laborator un efect statistic semnificativ, dar a spus că nu e clar dacă cauza este paranormală, deoarece au fost folosiți aceiași viewer, același judecător și aceleași fotografii. În operațiuni, informația a fost vagă și nu a ghidat nicio acțiune; folosirea în culegerea de informații a fost considerată nejustificată.",
				en: "The AIR report, commissioned by the CIA, found a statistically significant effect in the laboratory but said it was unclear whether the cause was paranormal, since the same viewers, the same judge and the same photographs were used. In operations the information was vague and guided no action; continued use in intelligence gathering was judged not warranted.",
			},
		},
		{
			q: {
				ro: "Ce este un monitor în remote viewing?",
				en: "What is a monitor in remote viewing?",
			},
			a: {
				ro: "Monitorul este persoana care stă lângă viewer, îi pune întrebări neutre și ține sesiunea în ordine. În experimentele bine făcute, nici el nu cunoaște ținta, pentru ca întrebările lui să nu o trădeze. Termenii variază între laboratoare, așa că merită să verifici ce înseamnă într-o sursă anume.",
				en: "The monitor is the person who sits beside the viewer, asks neutral questions and keeps the session in order. In well-run experiments the monitor does not know the target either, so the questions do not give it away. Terms vary between laboratories, so it is worth checking what they mean in a particular source.",
			},
		},
		{
			q: {
				ro: "Este remote viewing-ul același lucru cu Hemi-Sync®?",
				en: "Is remote viewing the same as Hemi-Sync®?",
			},
			a: {
				ro: "Nu. Remote viewing este un protocol de descriere a unei ținte; Hemi-Sync® este o tehnologie audio pentru relaxare și explorarea atenției, ascultată în căști. Cele două au avut contacte istorice, pe care le povestim în articolul despre Stargate, dar nu sunt același lucru, iar Hemi-Sync® nu promite nicio abilitate de acest fel.",
				en: "No. Remote viewing is a protocol for describing a target; Hemi-Sync® is an audio technology for relaxation and exploring attention, heard through headphones. The two had historical contacts, which we tell in the Stargate article, but they are not the same thing, and Hemi-Sync® promises no ability of this kind.",
			},
		},
	],
	related: [
		"proiectul-stargate-istoria-pe-scurt",
		"remote-viewing-dovezi-si-critici",
		"remote-viewing-cia-documente-declasificate",
		"remote-viewing-cum-se-exerseaza",
	],
};
