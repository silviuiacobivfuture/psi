import type { ArticleInput } from "../../../schema";

export const article: ArticleInput = {
	slug: "remote-viewing-cia-documente-declasificate",
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
		ro: "Documentele CIA despre remote viewing: ce conțin de fapt",
		en: "The declassified CIA remote viewing files: what they actually contain",
	},
	standfirst: {
		ro: "Dosarele conțin rapoarte de experimente, memorii, protocoale și evaluări, nu dovezi și nici confirmări ale unor puteri. Cel mai cunoscut text este evaluarea din septembrie 1995, care a recomandat închiderea programului. Aici afli unde se află arhiva, cum se citește un dosar birocratic și cum recunoști o citare greșită.",
		en: "The files hold experiment reports, memos, protocols and evaluations, not proof and not confirmation of any powers. The best-known text is the September 1995 evaluation, which recommended closing the programme. Here you learn where the archive lives, how to read a bureaucratic file and how to spot a misquote.",
	},
	cover: {
		src: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Rolling_hills_leading_into_the_Piatra_Craiului_Mountains.jpg/1280px-Rolling_hills_leading_into_the_Piatra_Craiului_Mountains.jpg",
		alt: {
			ro: "Pajiști și copaci tineri la poalele a doi vârfuri stâncoase, cu nori mari deasupra.",
			en: "Meadows and young trees at the foot of two rocky peaks, with large clouds above.",
		},
		width: 1280,
		height: 853,
	},
	body: [
		{
			type: "p",
			text: {
				ro: "Pe scurt: documentele CIA despre remote viewing sunt, în cea mai mare parte, hârtie de birou. Rapoarte despre experimente, note interne, protocoale, evaluări externe, fișe pentru participanți. Ele arată ce a testat un program finanțat de statul american și ce a concluzionat comisia care l-a evaluat. Nu conțin o dovadă că fenomenul există și nici o confirmare, din partea CIA, că ar exista.",
				en: "In short: the CIA’s remote viewing documents are, for the most part, office paper. Experiment reports, internal notes, protocols, outside evaluations, information sheets for participants. They show what a US government-funded programme tested and what the panel that evaluated it concluded. They contain no proof that the phenomenon exists, and no confirmation from the CIA that it does.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Cel mai citat dintre ele este raportul AIR din 29 septembrie 1995, care a recomandat, practic, încheierea programului. Merită citit în original, pentru că aproape tot ce circulă despre el în citate scurte lipsește de context. Pagina aceasta te duce la arhivă, îți arată ce găsești acolo și cum să citești fără să te lași păcălit, de nimeni, nici măcar de entuziasmul tău.",
				en: "The most quoted of them is the AIR report of 29 September 1995, which in effect recommended ending the programme. It is worth reading in the original, because almost everything that circulates about it in short quotes has lost its context. This page takes you to the archive, shows what you find there and how to read without being fooled by anyone, including your own enthusiasm.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Unde se află arhiva și cum o găsești?",
				en: "Where does the archive live, and how do you find it?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Documentele sunt în Sala electronică de lectură a CIA (FOIA Electronic Reading Room), care are pagini de navigare pe colecții, căutare avansată și un ghid de căutare. Colecția care te interesează se numește STARGATE, după numele sub care programul a fost reunit în 1991. Site-ul cere JavaScript activat ca să se afișeze corect, iar fiecare document este un PDF scanat.",
				en: "The documents are in the CIA’s FOIA Electronic Reading Room, which has pages for browsing by collection, an advanced search and a search guide. The collection you want is called STARGATE, after the name under which the programme was brought together in 1991. The site needs JavaScript switched on to display properly, and each document is a scanned PDF.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Fiecare pagină poartă o ștampilă de tipul „Approved For Release 2002/05/22 : CIA-RDP96-00791R000200180006-4”. Numărul de la sfârșit este adresa documentului: caută-l în căutarea avansată și ajungi exact la el. Aceeași ștampilă te ajută să găsești copii în alte arhive publice, cum este Internet Archive. Potrivit Wikipedia, înregistrările Stargate au fost publicate online ca parte a arhivei CREST a CIA în ianuarie 2017. Datele de pe ștampile sunt aprobările de eliberare ale fiecărei copii, nu data scrierii.",
				en: "Every page carries a stamp of the form “Approved For Release 2002/05/22 : CIA-RDP96-00791R000200180006-4”. The number at the end is the document’s address: search for it in the advanced search and you land on exactly that document. The same stamp helps you find copies in other public archives, such as the Internet Archive. According to Wikipedia, the Stargate records were published online as part of the CIA’s CREST archive in January 2017. The dates on the stamps are the release approvals of each copy, not the date of writing.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce tipuri de documente vei găsi?",
				en: "What types of document will you find?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Colecția e amestecată, cum sunt toate arhivele reale. Iată categoriile pe care le vei întâlni, cu mențiunea că am deschis noi înșine primele două, iar celelalte le știm după titlurile din listele arhivei:",
				en: "The collection is mixed, as real archives are. Here are the categories you will meet, with the note that we opened the first two ourselves and know the others from the titles in the archive’s listings:",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "Evaluări de program. Raportul AIR din 1995, „An Evaluation of Remote Viewing: Research and Applications”, cu recenziile a doi experți în interior.",
					en: "Programme evaluations. The 1995 AIR report, “An Evaluation of Remote Viewing: Research and Applications”, with two experts’ reviews inside it.",
				},
				{
					ro: "Analize interne ale armatei. De pildă, nota din 9 iunie 1983 despre procesul Gateway al Institutului Monroe, scrisă de un ofițer pentru comandantul unității sale.",
					en: "Internal army analyses. For example, the memo of 9 June 1983 on The Monroe Institute’s Gateway process, written by an officer for his unit’s commander.",
				},
				{
					ro: "Protocoale și materiale de instruire, cu titluri precum „Remote Viewing Protocols”, o notă din 1984.",
					en: "Protocols and training material, with titles such as “Remote Viewing Protocols”, a 1984 memo.",
				},
				{
					ro: "Documente despre declasificare și despre cei implicați, cum ar fi „CIA Remote Viewing Declassification Q & A” sau fișele de informare pentru participanți.",
					en: "Documents about declassification and the people involved, such as “CIA Remote Viewing Declassification Q & A” or information sheets for participants.",
				},
				{
					ro: "Înregistrări de sesiuni, adică descrierile propriu-zise ale observatorilor.",
					en: "Session records, meaning the viewers’ actual descriptions.",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "Chiar și raportul AIR acoperă doar o parte din ce se află în arhivă. El spune singur că evaluarea componentei de apreciere a informațiilor din străinătate (foreign assessment) a rămas în afara sferei lui. Cu alte cuvinte, nimeni nu a pus un singur raport peste întregul material, iar cine pretinde că „CIA a spus” ceva despre tot dosarul vorbește mai mult decât se poate susține. Fiecare document răspunde la întrebarea pentru care a fost scris, și doar la ea.",
				en: "Even the AIR report covers only part of what the archive holds. It says itself that evaluating the programme’s foreign assessment component was outside its scope. In other words, no single report was ever laid over the whole material, and anyone claiming that “the CIA said” something about the whole file is saying more than can be supported. Each document answers the question it was written for, and only that one.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce evaluări importante conține arhiva?",
				en: "Which notable evaluations does the archive contain?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Cea mai importantă este evaluarea AIR. În iunie 1995, CIA a încredințat Institutului American de Cercetare analiza programului. Raportul, semnat de Mumford, Rose și Goslin, a trecut în revistă aproximativ 80 de publicații și a avut două componente: cercetarea de laborator și folosirea practică în culegerea de informații. Concluzia ei despre laborator e prudentă: un efect semnificativ statistic a fost observat, dar rămâne neclar dacă dovedește un fenomen paranormal. Concluzia despre uz practic e mai tăioasă: niciodată informațiile nu au fost folosite pentru a ghida o operațiune.",
				en: "The most important is the AIR evaluation. In June 1995 the CIA commissioned the American Institutes for Research to analyse the programme. The report, by Mumford, Rose and Goslin, reviewed about 80 publications and had two parts: laboratory research and practical use in intelligence gathering. Its conclusion on the laboratory is cautious: a statistically significant effect was observed, but it remains unclear whether it demonstrates a paranormal phenomenon. Its conclusion on practical use is sharper: the information had never been used to guide an operation.",
			},
		},
		{
			type: "p",
			text: {
				ro: "În interiorul raportului stau recenziile lui Jessica Utts (1 septembrie 1995) și Ray Hyman (11 septembrie 1995), plus răspunsul lui Utts. Ele ajung la concluzii opuse, iar tocmai de aceea sunt o lectură bună: vezi două minți competente argumentând pe aceleași date. Comparația lor, pe larg, este în articolul nostru despre dovezi și critici.",
				en: "Inside the report sit the reviews by Jessica Utts (1 September 1995) and Ray Hyman (11 September 1995), plus Utts’s reply. They reach opposite conclusions, which is exactly why they make good reading: you watch two competent minds argue over the same data. Their comparison, at length, is in our article on the evidence and the critics.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce spune evaluarea scrisă de armată despre Institutul Monroe?",
				en: "What does the army’s assessment of The Monroe Institute say?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Este un document diferit și adesea amestecat cu restul. „Analysis and Assessment of Gateway Process” este o notă din 9 iunie 1983 a locotenent-colonelului Wayne M. McDonnell, comandantul unui detașament, către comandantul unității sale de la Fort Meade. Cuprinde o notă de însoțire, o lucrare de 38 de paragrafe și cinci anexe. Compară procesul Gateway, bazat pe sunetul Hemi-Sync® al The Monroe Institute®, cu hipnoza, meditația transcendentală și biofeedbackul.",
				en: "It is a different document, and often mixed up with the rest. “Analysis and Assessment of Gateway Process” is a memo of 9 June 1983 by Lieutenant Colonel Wayne M. McDonnell, a detachment commander, to the commander of his unit at Fort Meade. It contains a cover note, a paper of 38 paragraphs and five exhibits. It compares the Gateway process, built on the Hemi-Sync® sound of The Monroe Institute®, with hypnosis, transcendental meditation and biofeedback.",
			},
		},
		{
			type: "quote",
			text: {
				ro: "„Există o bază rațională, solidă, în termenii parametrilor științelor fizice, pentru a considera Gateway plauzibil în privința obiectivelor sale esențiale.” LTC Wayne M. McDonnell, 1983 (traducere de noi).",
				en: "“There is a sound, rational basis in terms of physical science parameters for considering Gateway to be plausible in terms of its essential objectives.” LTC Wayne M. McDonnell, 1983.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Atenție la cuvântul ales: „plauzibil”, nu „dovedit”. Textul se sprijină mult pe cărți de popularizare, între ele Stalking the Wild Pendulum de Itzhak Bentov, și pe relatări ale instructorilor, cu o singură trimitere la observații EEG ale unui psihiatru asociat Institutului. Autorul însuși recunoaște că unele părți cer „o doză de intuiție”. Recomandă o abordare pe etape. Nu e o aprobare a armatei sau a CIA, ci analiza unui om, păstrată în dosar.",
				en: "Mind the word chosen: “plausible”, not “proven”. The text leans heavily on popular books, among them Stalking the Wild Pendulum by Itzhak Bentov, and on instructors’ accounts, with a single reference to EEG observations by a psychiatrist associated with the Institute. The author himself says some parts call for “a touch of” intuitive insight. He recommends a phased approach. It is not an endorsement by the army or the CIA, but one man’s analysis, kept in a file.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "În ce limbaj sunt scrise rapoartele?",
				en: "What language are the reports written in?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Într-un limbaj de birou științific, cu cuvinte pe care nu le vei auzi în conversațiile obișnuite. „Beneficiari” (end users) sunt cei care cereau informații. „Investigator principal” e omul care conducea cercetarea. „Far” (beacon) este emițătorul care privește ținta. „Momeli” (decoys) sunt imaginile false puse lângă cea corectă. Hyman notează că investigatorii folosesc „fenomene mentale anormale” pentru ceea ce parapsihologii numesc psi, iar „cogniție anormală” pentru percepția extrasenzorială.",
				en: "In the language of a scientific office, with words you will not hear in ordinary conversation. “End users” are those who requested information. The “principal investigator” is the person running the research. The “beacon” is the sender who looks at the target. “Decoys” are the false pictures placed beside the correct one. Hyman notes that the investigators use “anomalous mental phenomena” for what parapsychologists call psi, and “anomalous cognition” for extrasensory perception.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Observă și prudența frazelor: „rămâne neclar dacă”, „nu a fost demonstrat că”. Cine citește repede ia prudența drept confirmare sau drept respingere, după cum își dorește. Ține minte și că textele sunt scanări trecute printr-o recunoaștere automată a literelor: vei găsi cuvinte desfigurate, rânduri lipsă și semne ciudate. Dacă un citat îți pare ciudat, verifică-l în PDF, nu în textul extras.",
				en: "Notice, too, the caution of the sentences: “it remains unclear whether”, “has not been demonstrated”. A fast reader takes caution for confirmation or for rejection, depending on what they hope for. Remember also that the texts are scans run through automatic letter recognition: you will find mangled words, missing lines and odd marks. If a quote looks strange, check it in the PDF, not in the extracted text.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum citești un dosar birocratic fără să te rătăcești?",
				en: "How do you read a bureaucratic file without getting lost?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Imaginează-ți că ai deschis un PDF de două sute de pagini, într-o seară. Nu începe de la început. Începe așa:",
				en: "Imagine you have opened a two-hundred-page PDF one evening. Do not start at the beginning. Start like this:",
			},
		},
		{
			type: "p",
			text: {
				ro: "O scenă concretă: deschizi raportul AIR și prima pagină nu seamănă cu un titlu de carte, ci cu o foaie de dosar, cu ștampila în colț și numele Institutului American de Cercetare sus. Urmează numele autorilor, apoi data, 29 septembrie 1995. Dacă te oprești aici și ai înțeles cine a scris, când și la ce cerere, ai făcut deja mai mult decât cei mai mulți cititori de citate.",
				en: "A concrete scene: you open the AIR report and the first page looks less like a book title than a file sheet, with the stamp in the corner and the name of the American Institutes for Research at the top. The authors’ names follow, then the date, 29 September 1995. If you stop here and have understood who wrote it, when, and at whose request, you have already done more than most readers of quotes.",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "Citește ștampila și numărul documentului. Ele spun ce ai în față și cum îl regăsești.",
					en: "Read the stamp and the document number. They tell you what you hold and how to find it again.",
				},
				{
					ro: "Caută data, autorul și destinatarul. O notă către un comandant e altceva decât un raport comandat extern.",
					en: "Look for the date, the author and the addressee. A memo to a commander is something other than an externally commissioned report.",
				},
				{
					ro: "Citește rezumatul executiv întâi. La raportul AIR sunt paginile E-1 până la E-4, iar concluziile stau acolo, în câteva puncte.",
					en: "Read the executive summary first. In the AIR report these are pages E-1 to E-4, and the conclusions sit there, in a few points.",
				},
				{
					ro: "Întreabă-te mereu cine vorbește: raportul, un recenzent sau un autor citat. Aici se pierd cele mai multe sensuri.",
					en: "Always ask who is speaking: the report, a reviewer or a quoted author. This is where most meaning is lost.",
				},
				{
					ro: "Abia apoi mergi la capitole și la anexe, cu un creion: notează pagina fiecărui citat pe care vrei să-l folosești.",
					en: "Only then go to the chapters and appendices, with a pencil: note the page of every quote you want to use.",
				},
			],
		},
		{
			type: "h2",
			text: {
				ro: "Cum recunoști o citare virală greșită?",
				en: "How do you recognise a viral misquote?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Nu avem nevoie să urmărim citate anume ca să știm greșelile tipice, pentru că se văd chiar din dosare. Prima: ștampila „Approved For Release” înseamnă că documentul a fost aprobat pentru publicare, nu că cineva a aprobat ce spune el. A doua: o frază din recenzia lui Utts, de pildă că funcționarea psihică este „bine stabilită”, este părerea unei recenzente, nu concluzia CIA. Raportul în care stă ajunge la un „argument convingător” împotriva continuării programului.",
				en: "We do not need to track particular quotes to know the typical mistakes, because they show in the files themselves. First: the “Approved For Release” stamp means the document was approved for publication, not that anyone approved what it says. Second: a sentence from Utts’s review, say that psychic functioning is “well established”, is one reviewer’s view, not the CIA’s conclusion. The report it sits in reaches a “compelling argument” against continuing the programme.",
			},
		},
		{
			type: "p",
			text: {
				ro: "A treia: numele se ciocnesc. Nota despre Gateway folosește „remote viewing” pentru o tehnică din programul Monroe, în care participantul își trimite imaginația printr-un vârtej de energie. Nu e protocolul de laborator de la SRI. A patra: un citat fără număr de document nu e un citat, e un zvon. Iar a cincea: cuvinte ca „plauzibil”, „neclar”, „nu s-a demonstrat” dispar primele când o frază e tăiată pentru o poză.",
				en: "Third: names collide. The Gateway memo uses “remote viewing” for a technique in the Monroe programme, in which the participant sends the imagination through a vortex of energy. It is not the SRI laboratory protocol. Fourth: a quote without a document number is not a quote, it is hearsay. And fifth: words such as “plausible”, “unclear”, “not demonstrated” are the first to vanish when a sentence is cut to fit a picture.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cu ce să începi, de fapt?",
				en: "Where should you actually start?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Cu patru pagini. Deschide raportul AIR cu numărul CIA-RDP96-00791R000200180006-4 și citește rezumatul executiv, de la E-1 la E-4. Vei vedea, în câteva minute, cum arată o concluzie prudentă scrisă de oameni care nu se tem de subiect și nici nu îl ridică în slăvi. Dacă ți se pare că lipsește ceva, probabil lipsește un citat viral, nu un fapt.",
				en: "With four pages. Open the AIR report with the number CIA-RDP96-00791R000200180006-4 and read the executive summary, E-1 to E-4. In a few minutes you will see what a cautious conclusion looks like when it is written by people who neither fear the subject nor exalt it. If something seems to be missing, it is probably a viral quote that is missing, not a fact.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Iar pentru firul istoric de dinainte și de după raport, de la primele experimente până la închidere, citește articolul nostru despre proiectul Stargate, pe scurt.",
				en: "And for the historical thread before and after the report, from the first experiments to the closure, read our short article on the Stargate project.",
			},
		},
	],
	sources: [
		{
			label: {
				ro: "AIR (1995), An Evaluation of Remote Viewing: Research and Applications, copie a documentului publicat de CIA (cu recenziile Utts și Hyman)",
				en: "AIR (1995), An Evaluation of Remote Viewing: Research and Applications, copy of the CIA-released document (with the Utts and Hyman reviews)",
			},
			href: "https://documents3.theblackvault.com/documents/stargate/pdfs/CIA-RDP96-00791R000200180006-4.pdf",
		},
		{
			label: {
				ro: "Armata SUA (1983), Analysis and Assessment of Gateway Process, copie din arhiva CIA",
				en: "US Army (1983), Analysis and Assessment of Gateway Process, copy from the CIA reading-room collection",
			},
			href: "https://archive.org/stream/CIA-RDP96-00788R001700210016-5/CIA-RDP96-00788R001700210016-5_djvu.txt",
		},
		{
			label: {
				ro: "CIA, Sala electronică de lectură FOIA: navigare pe colecții și căutare avansată",
				en: "CIA, FOIA Electronic Reading Room: browse the collections and advanced search",
			},
			href: "https://www.cia.gov/readingroom/",
		},
		{
			label: {
				ro: "Jessica Utts, răspunsul către Ray Hyman (15 septembrie 1995)",
				en: "Jessica Utts, reply to Ray Hyman (15 September 1995)",
			},
			href: "https://ics.uci.edu/~jutts/response.html",
		},
		{
			label: {
				ro: "Ray Hyman (1995), Evaluarea programului „Fenomene mentale anormale”, text găzduit pe pagina lui Utts",
				en: "Ray Hyman (1995), Evaluation of Program on “Anomalous Mental Phenomena”, text hosted on Utts’s page",
			},
			href: "https://www.ics.uci.edu/~jutts/hyman.html",
		},
		{
			label: {
				ro: "Wikipedia: Stargate Project (unitate a armatei SUA), cronologie și publicarea online din 2017",
				en: "Wikipedia: Stargate Project (US Army unit), timeline and the 2017 online release",
			},
			href: "https://en.wikipedia.org/wiki/Stargate_Project_(U.S._Army_unit)",
		},
	],
	provenance: [
		"https://documents3.theblackvault.com/documents/stargate/pdfs/CIA-RDP96-00791R000200180006-4.pdf (AIR, 29 September 1995, stamped Approved For Release 2002/05/22; read as text: contents, executive summary E-1 to E-4, 1995 declassification and June 1995 contract, ~80 publications, Utts review of 1 September 1995, Hyman review of 11 September 1995, Hyman's note on the terms anomalous mental phenomena and anomalous cognition, OCR artefacts in the text layer)",
		"https://archive.org/stream/CIA-RDP96-00788R001700210016-5/CIA-RDP96-00788R001700210016-5_djvu.txt (US Army memo of 9 June 1983, LTC Wayne M. McDonnell, to Commander, US Army Operational Group, Fort Meade; 38 paragraphs and exhibits; stamped Approved For Release 2003/09/10; paragraph 38 conclusion 'plausible'; sources include Bentov's Stalking the Wild Pendulum and Monroe trainers; one reference to Twemlow's EEG observations; the 'remote viewing' passage describes a Gateway technique using an energy bar and a vortex)",
		"https://www.cia.gov/readingroom/ (homepage opened: Browse the Collections, Advanced Search, Search Help, JavaScript notice). The STARGATE collection pages and individual document pages returned only this homepage to our fetcher, so the collection and the document titles named in the list (Remote Viewing Protocols, CIA Remote Viewing Declassification Q & A, participant information sheets) are known from the archive's search-result listings, not from pages we opened. The CIA-RDP numbers are the pointers to the originals",
		"https://en.wikipedia.org/wiki/Stargate_Project_(U.S._Army_unit) (the name Stargate from 1991 consolidation; records published online in the CREST archive in January 2017)",
		"https://ics.uci.edu/~jutts/response.html and https://www.ics.uci.edu/~jutts/hyman.html (the reviewers' positions)",
		"packages/design/brand-books/3-hemi-sync.md and docs/brands/writing-voice.md: voice and claim rules",
		"Cover photo: Rolling hills leading into the Piatra Craiului Mountains, Horia Varlan, Wikimedia Commons, CC BY 2.0, https://commons.wikimedia.org/wiki/File:Rolling_hills_leading_into_the_Piatra_Craiului_Mountains.jpg",
	],
	seo: {
		title: {
			ro: "CIA remote viewing documente declasificate: ce conțin, de fapt",
			en: "CIA remote viewing declassified documents: what they contain",
		},
		description: {
			ro: "Unde se află arhiva CIA despre remote viewing, ce tipuri de documente conține, cum se citește un dosar birocratic și cum recunoști citatele greșite.",
			en: "Where the CIA remote viewing archive lives, what types of document it holds, how to read a bureaucratic file and how to recognise misquotes.",
		},
		keywords: {
			ro: [
				"CIA remote viewing documente declasificate",
				"documente Stargate CIA",
				"arhiva CIA remote viewing",
				"raportul AIR 1995",
				"CIA-RDP96 Gateway Monroe",
				"sala de lectură CIA",
			],
			en: [
				"CIA remote viewing declassified documents",
				"Stargate CIA documents",
				"CIA reading room remote viewing",
				"AIR report 1995",
				"CIA Gateway process Monroe",
				"CIA-RDP96 stargate files",
			],
		},
	},
	faq: [
		{
			q: {
				ro: "Unde pot citi documentele CIA despre remote viewing?",
				en: "Where can I read the CIA’s remote viewing documents?",
			},
			a: {
				ro: "În Sala electronică de lectură FOIA a CIA, în colecția STARGATE. Folosește căutarea avansată și, dacă ai deja un număr de tipul CIA-RDP96-00791R000200180006-4, caută-l direct. Unele documente au copii în arhive publice precum Internet Archive. Verifică întotdeauna textul în PDF, nu în transcrierea automată.",
				en: "In the CIA’s FOIA Electronic Reading Room, in the STARGATE collection. Use the advanced search and, if you already have a number of the form CIA-RDP96-00791R000200180006-4, search for it directly. Some documents have copies in public archives such as the Internet Archive. Always check the text in the PDF, not in the automatic transcription.",
			},
		},
		{
			q: {
				ro: "Confirmă documentele CIA că remote viewing funcționează?",
				en: "Do the CIA documents confirm that remote viewing works?",
			},
			a: {
				ro: "Nu. Raportul AIR din 1995 notează un efect semnificativ statistic în laborator, dar spune că rămâne neclar dacă el dovedește un fenomen paranormal. Pentru uzul practic, raportul spune că informațiile nu au ghidat niciodată o operațiune. Concluzia lui este un argument convingător împotriva continuării programului.",
				en: "No. The 1995 AIR report notes a statistically significant laboratory effect but says it remains unclear whether this demonstrates a paranormal phenomenon. On practical use, it says the information never guided an operation. Its conclusion is a compelling argument against continuing the programme.",
			},
		},
		{
			q: {
				ro: "Ce înseamnă „Approved For Release” pe fiecare pagină?",
				en: "What does “Approved For Release” on every page mean?",
			},
			a: {
				ro: "Înseamnă că acea copie a documentului a fost aprobată pentru publicare, la data din ștampilă, de pildă 2002/05/22. Nu înseamnă că CIA susține cele scrise în el și nici că data este cea a redactării. Numărul CIA-RDP de după ștampilă este adresa documentului în arhivă.",
				en: "It means that copy of the document was approved for publication on the date in the stamp, for instance 2002/05/22. It does not mean the CIA endorses what is written in it, nor that the date is when it was written. The CIA-RDP number after the stamp is the document’s address in the archive.",
			},
		},
		{
			q: {
				ro: "Ce este nota armatei despre procesul Gateway?",
				en: "What is the army memo on the Gateway process?",
			},
			a: {
				ro: "O notă din 9 iunie 1983 a locotenent-colonelului Wayne M. McDonnell către comandantul unității sale de la Fort Meade, despre procesul Gateway al Institutului Monroe. Concluzia ei este că procesul poate fi considerat plauzibil în privința obiectivelor sale. Se sprijină mult pe cărți de popularizare și pe relatări ale instructorilor, deci nu e o dovadă.",
				en: "A memo of 9 June 1983 by Lieutenant Colonel Wayne M. McDonnell to the commander of his unit at Fort Meade, on The Monroe Institute’s Gateway process. Its conclusion is that the process can be considered plausible in terms of its objectives. It leans heavily on popular books and instructors’ accounts, so it is not proof.",
			},
		},
		{
			q: {
				ro: "Cum verific un citat despre remote viewing găsit online?",
				en: "How do I check a remote viewing quote I found online?",
			},
			a: {
				ro: "Cere numărul documentului și pagina. Caută numărul în arhiva CIA și deschide PDF-ul. Verifică cine vorbește: raportul, un recenzent sau un autor citat. Citește fraza dinainte și cea de după, pentru că prudența dispare când o propoziție e tăiată. Dacă nu există număr, nu poți verifica citatul.",
				en: "Ask for the document number and the page. Search the number in the CIA archive and open the PDF. Check who is speaking: the report, a reviewer or a quoted author. Read the sentence before and after, because caution vanishes when a sentence is cut. If there is no number, you cannot verify the quote.",
			},
		},
	],
	related: [
		"proiectul-stargate-istoria-pe-scurt",
		"ce-este-remote-viewing",
		"remote-viewing-dovezi-si-critici",
		"istoria-cercetarii-constiintei",
	],
};
