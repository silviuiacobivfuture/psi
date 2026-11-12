import type { ArticleInput } from "../../../schema";

export const article: ArticleInput = {
	slug: "confidentialitatea-in-terapie",
	brand: "psizone",
	topic: "psihoterapie",
	backlogNo: null,
	status: "draft",
	kind: "health",
	aiDrafted: true,
	draftedAt: "2026-11-12",
	author: null,
	reviewer: null,
	title: {
		ro: "Confidențialitatea în terapie: ce rămâne între noi",
		en: "Confidentiality in therapy: what stays between us",
	},
	standfirst: {
		ro: "Ce spui într-o ședință rămâne, în principiu, între tine și psiholog: legea îi cere asta. Există limite, pe care un psiholog serios ți le spune de la început, iar la copii și adolescenți se stabilește dinainte ce află părinții. Întreabă la prima ședință și cere răspunsul pe înțelesul tău.",
		en: "What you say in a session stays, in principle, between you and the psychologist: the law requires it. There are limits, which a serious psychologist tells you about at the outset, and with children and teenagers it is agreed in advance what the parents will be told. Ask at the first session and ask for the answer in plain words.",
	},
	body: [
		{
			type: "p",
			text: {
				ro: "Va afla cineva ce spun în terapie? În principiu, nu. Legea română spune că confidențialitatea actului psihologic este protejată prin lege și este o obligație a oricărui psiholog. Dar „în principiu” ascunde câteva limite, iar ele merită să fie spuse clar, înainte să începi, nu după ce ai spus tot.",
				en: "Will anyone find out what I say in therapy? In principle, no. Romanian law says that the confidentiality of the psychological act is protected by law and is an obligation of every psychologist. But “in principle” hides a few limits, and they deserve to be stated clearly before you begin, not after you have said everything.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Poate te temi de lucruri concrete: ca mama să nu afle ce îi spui psihologului despre ea, ca șeful să nu primească o hârtie, ca partenerul să nu citească o notiță. Sunt temeri bune, iar un cabinet care le ia în serios te va lăsa să le pui pe toate, pe rând.",
				en: "You may fear concrete things: that your mother will not find out what you say about her to the psychologist, that your boss will not receive a piece of paper, that your partner will not read a note. These are good fears, and a practice that takes them seriously will let you put them all, one at a time.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce este privat, concret?",
				en: "What is private, concretely?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Tot ce spui în ședință, tot ce se desprinde din evaluări și tot ce scrie psihologul despre tine în dosar. Nu pleacă din cabinet la o rudă, la un angajator sau la o școală doar pentru că cineva întreabă. Asta înseamnă confidențialitate: informația ta circulă numai cu acordul tău sau în cazurile limitate pe care le explicăm mai jos.",
				en: "Everything you say in a session, everything that comes out of the assessments and everything the psychologist writes about you in your file. It does not leave the room to a relative, an employer or a school just because someone asks. That is what confidentiality means: your information travels only with your agreement, or in the limited cases we explain below.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Gândește-te la o scenă simplă. E sâmbătă, mama îl duce pe băiatul ei de cincisprezece ani la prima ședință și, pe drum, îl întreabă: „Ce i-ai spus?” Răspunsul corect al adolescentului este: „Asta rămâne între mine și psiholog.” Iar răspunsul corect al mamei: „Bine, am încredere.” Dacă cabinetul a explicat dinainte regulile, scena aceasta nu mai e o încercare, ci un lucru obișnuit.",
				en: "Picture a simple scene. It is Saturday, a mother takes her fifteen-year-old son to the first session and on the way asks him: “What did you tell them?” The right answer from the teenager is: “That stays between me and the psychologist.” And the right answer from the mother: “All right, I trust it.” If the practice has explained the rules beforehand, this scene is no longer a test but an ordinary thing.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Un psiholog poate discuta cazuri cu un coleg sau cu supervizorul său, ca să lucreze mai bine. Codul etic al Asociației Americane de Psihologie prevede că la astfel de consultări nu dezvăluie informații care ar permite identificarea ta, decât în măsura necesară. E un lucru bun de știut și un lucru bun de întrebat: „Vă consultați cu cineva despre cazurile dumneavoastră și cum îmi protejați identitatea?”",
				en: "A psychologist may discuss cases with a colleague or with their supervisor, so as to work better. The American Psychological Association’s ethics code provides that in such consultations they do not disclose information that would identify you, beyond what is necessary. It is good to know and good to ask: “Do you consult anyone about your cases, and how do you protect my identity?”",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Care sunt limitele confidențialității?",
				en: "What are the limits of confidentiality?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Legea care reglementează profesia de psiholog (Legea 213/2004) spune că confidențialitatea este protejată prin lege, dar textul pe care l-am deschis nu enumeră excepțiile, ele ținând de alte reglementări. Nu vom inventa aici o listă. Ce putem spune, pe baza codului etic al Asociației Americane de Psihologie, este tiparul general al excepțiilor, aflat în multe țări.",
				en: "The law governing the profession (Law 213/2004) says that confidentiality is protected by law, but the text we opened does not list the exceptions, which belong to other regulations. We will not invent a list here. What we can say, on the basis of the American Psychological Association’s ethics code, is the general pattern of exceptions found in many countries.",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "Cu acordul tău: informația poate fi dezvăluită dacă ai consimțit (sau o persoană îndreptățită legal, în numele tău).",
					en: "With your consent: information may be disclosed if you have agreed (or a legally authorised person on your behalf).",
				},
				{
					ro: "Când legea o cere: dezvăluirea fără acordul tău are loc numai în măsura impusă sau permisă de lege.",
					en: "When the law requires it: disclosure without your consent happens only as mandated or permitted by law.",
				},
				{
					ro: "Pentru a proteja pe cineva de un rău: pe tine, psihologul sau alți oameni.",
					en: "To protect someone from harm: you, the psychologist or others.",
				},
				{
					ro: "Pentru a obține plata serviciilor, la minimul necesar pentru acest scop.",
					en: "To obtain payment for services, limited to the minimum necessary for that purpose.",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "Ultimul punct înseamnă, în practică, că dacă o terță parte plătește (o asigurare, de pildă), poate fi nevoie să i se transmită ceva. Întreabă ce anume, înainte. Aceeași sursă cere psihologului să discute limitele confidențialității de la început, iar la servicii prin mijloace electronice să te informeze despre riscurile pentru intimitate. Dacă nu o face, întreabă tu.",
				en: "The last point means, in practice, that if a third party pays (an insurer, for example), something may need to be passed on. Ask what exactly, beforehand. The same source requires the psychologist to discuss the limits of confidentiality at the outset, and for services by electronic means to inform you of the risks to privacy. If they do not, you ask.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Dacă tu sau cineva apropiat sunteți în pericol imediat, sunați la 112. Iar dacă în ședință spui ceva ce pare să indice un pericol pentru tine sau pentru altcineva, un psiholog serios îți va spune deschis ce simte că trebuie să facă și de ce, în loc să acționeze pe la spate. Merită să întrebi de la început cum procedează într-o astfel de situație.",
				en: "If you or someone close to you is in immediate danger, call 112. And if in a session you say something that seems to point to a danger to yourself or to someone else, a serious psychologist will tell you openly what they feel they must do and why, rather than acting behind your back. It is worth asking from the start how they proceed in such a situation.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum funcționează confidențialitatea cu un minor și cu părinții?",
				en: "How does confidentiality work with a minor and the parents?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Aici e nevoie de cea mai multă finețe, pentru că două nevoi legitime se întâlnesc. Părintele răspunde de copil și are nevoie să știe ce se întâmplă. Copilul, mai ales adolescentul, nu va vorbi dacă bănuiește că fiecare cuvânt ajunge acasă. Codul etic al Asociației Americane de Psihologie cere ca limitele confidențialității să fie discutate, în măsura posibilului, și cu persoanele care nu pot da singure consimțământul, nu doar cu reprezentanții lor legali.",
				en: "This calls for the most delicacy, because two legitimate needs meet. The parent is responsible for the child and needs to know what is happening. The child, especially the teenager, will not speak if they suspect every word reaches home. The American Psychological Association’s ethics code requires the limits of confidentiality to be discussed, as far as feasible, also with persons who cannot give consent themselves, not only with their legal representatives.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Academia Americană de Pediatrie, în declarația ei din 2024 privind confidențialitatea în îngrijirea adolescenților, spune că aceasta este esențială pentru o îngrijire de calitate și că poate modela experiența și rezultatele îngrijirii. Declarația se referă la sănătatea adolescenților în general și la legislația americană; nu e o regulă pentru România. Ideea, însă, se traduce bine: adolescentul care se simte în siguranță vorbește.",
				en: "The American Academy of Pediatrics, in its 2024 policy statement on confidentiality in the care of adolescents, says that confidentiality is central to high-quality care and can shape care experiences and health outcomes. The statement concerns adolescent health in general and US law; it is not a rule for Romania. The idea, however, translates well: a teenager who feels safe speaks.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Cum arată, practic, un acord bun? La început, într-o discuție comună, psihologul, adolescentul și părintele stabilesc ce află părinții: de pildă, cum merg ședințele, ce obiective urmăriți, dacă apar riscuri, și nu detaliile a ceea ce spune copilul. Poți spune ca părinte: „Nu am nevoie să aflu fiecare cuvânt, vreau doar să știu dacă e în siguranță și ce pot face eu acasă.” Dacă pui această frază în cabinet, adolescentul o aude și se relaxează.",
				en: "What does a good agreement look like in practice? At the start, in a joint conversation, the psychologist, the teenager and the parent agree on what the parents will learn: for example, how the sessions are going, what goals you are pursuing, whether risks appear, and not the details of what the child says. As a parent you can say: “I do not need to know every word, I only want to know that they are safe and what I can do at home.” If you say this in the room, the teenager hears it and relaxes.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Întreabă cum se hotărăște ce intră în această categorie la vârsta copilului tău și cum se schimbă acordul pe măsură ce el crește. Nu avem o regulă legală de la care să plecăm: depinde de legea și de normele în vigoare și de cabinet, iar un psiholog îți poate spune ce se aplică.",
				en: "Ask how it is decided what falls into this category at your child’s age and how the agreement changes as they grow. We have no legal rule to start from: it depends on the law and norms in force and on the practice, and a psychologist can tell you what applies.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Angajatori, asigurători, dosare: ce se întâmplă cu hârtiile?",
				en: "Employers, insurers, records: what happens to the paperwork?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Un angajator nu are acces la ce spui în terapie. Dacă îți cere o adeverință, întrebarea e: ce anume scrie în ea? Ai dreptul să ceri să știi, înainte să semnezi, ce informație pleacă și către cine. O adeverință care atestă că ai urmat ședințe e altceva decât un raport care descrie ce ai spus.",
				en: "An employer has no access to what you say in therapy. If they ask you for a certificate, the question is: what exactly is written in it? You have the right to know, before you sign, what information leaves and for whom. A certificate stating that you attended sessions is different from a report describing what you said.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Aceeași logică se aplică asigurătorilor și școlii. Cere un consimțământ în scris pentru orice transmitere, cu mențiunea clară a conținutului. Raportul tehnic al Academiei Americane de Pediatrie arată cât de mult afectează cerințele de facturare și tehnologiile în schimbare confidențialitatea; acolo e vorba de contextul american, dar problema e universală: orice document care pleacă într-o altă mână trebuie să fie hotărât de tine, sau de cel care răspunde legal de tine.",
				en: "The same logic applies to insurers and the school. Ask for written consent for any transmission, with a clear statement of its content. The American Academy of Pediatrics’ technical report shows how much billing requirements and changing technology affect confidentiality; it concerns the American context, but the problem is universal: any document that leaves for another hand should be decided by you, or by whoever is legally responsible for you.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Întreabă și unde se păstrează dosarul, cât timp și cine are acces la el în cabinet. Răspunsul trebuie să fie scurt și clar. Dacă te trimit la „așa se face” fără explicații, mai insistă o dată.",
				en: "Ask too where the file is kept, for how long and who has access to it in the practice. The answer should be short and clear. If you are told “that is how it is done” without explanation, press once more.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cuplu, familie, grup: cine știe ce?",
				en: "Couple, family, group: who knows what?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Când vin mai multe persoane, apare o întrebare nouă: cine este „clientul”? Codul etic al Asociației Americane de Psihologie cere psihologului să clarifice de la început care dintre persoane sunt clienți și ce relație are cu fiecare, inclusiv ce se întâmplă cu informațiile obținute. Într-un grup, el descrie la început rolurile și limitele confidențialității.",
				en: "When several people attend, a new question arises: who is the “client”? The American Psychological Association’s ethics code requires the psychologist to clarify at the outset which of the individuals are clients and what relationship they have with each, including what happens with the information obtained. In a group, they describe at the outset the roles and the limits of confidentiality.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Practic, într-o terapie de cuplu întreabă: „Dacă îi spun ceva separat, rămâne între noi sau poate ajunge la partener?” Este exact tipul de regulă care trebuie fixată înainte, nu după. Într-un grup, ceilalți participanți nu sunt legați de aceleași obligații profesionale ca psihologul, deci cere să se stabilească o regulă a grupului: ce se spune acolo rămâne acolo.",
				en: "In practice, in couple therapy ask: “If I tell you something separately, does it stay between us or can it reach my partner?” This is exactly the kind of rule that must be fixed beforehand, not afterwards. In a group, the other participants are not bound by the same professional obligations as the psychologist, so ask for a group rule to be agreed: what is said there stays there.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum protejezi intimitatea într-o ședință online?",
				en: "How do you protect privacy in an online session?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Cabinetul controlează propriul spațiu, dar tu controlezi pe al tău. Alege un loc în care nu te aude nimeni, folosește căști, un aparat al tău și o conexiune de încredere, iar dacă nu ai un loc liniștit acasă, spune-i psihologului: se poate găsi un compromis (o oră la care ești singur, o plimbare cu căștile, o ședință la cabinet).",
				en: "The practice controls its own space, but you control yours. Choose a place where no one can hear you, use headphones, a device of your own and a trustworthy connection, and if you have no quiet place at home, tell the psychologist: a compromise can be found (an hour when you are alone, a walk with headphones, a session at the practice).",
			},
		},
		{
			type: "p",
			text: {
				ro: "Aceeași sursă cere psihologului să te informeze despre riscurile pentru intimitate la serviciile prin mijloace electronice. Întreabă ce platformă folosește, dacă ședința se înregistrează (în principiu, nu fără acordul tău) și ce faci dacă se întrerupe conexiunea.",
				en: "The same source requires the psychologist to inform you of the privacy risks of services delivered by electronic means. Ask which platform they use, whether the session is recorded (in principle, not without your agreement) and what to do if the connection drops.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce întrebi la prima ședință?",
				en: "What do you ask at the first session?",
			},
		},
		{
			type: "p",
			text: {
				ro: "NIMH îți propune chiar întrebarea: ședințele sunt confidențiale, cum este asigurată confidențialitatea și există limite? Pune-o în prima jumătate de oră, înainte să spui lucruri grele. Un psiholog care îți răspunde cu calm, concret și fără să se grăbească îți arată deja cât de serios ia secretul.",
				en: "The NIMH proposes the very question: are the meetings confidential, how is confidentiality assured and are there limits? Ask it in the first half hour, before you say heavy things. A psychologist who answers calmly, concretely and without hurrying is already showing you how seriously they take secrecy.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Un singur pas: scrie-ți trei întrebări despre ce rămâne privat și ia-le cu tine. La Psizone poți programa o evaluare pe psizone.ro și le poți pune acolo, în prima discuție.",
				en: "One step: write down three questions about what stays private and take them with you. At Psizone you can book an evaluation at psizone.ro and put them there, in the first conversation.",
			},
		},
	],
	sources: [
		{
			label: {
				ro: "Legea 213/2004 privind exercitarea profesiei de psiholog (art. 4: confidențialitatea)",
				en: "Law 213/2004 on practising as a psychologist (art. 4: confidentiality)",
			},
			href: "http://legislatie.just.ro/Public/DetaliiDocument/52375",
		},
		{
			label: {
				ro: "APA: Codul etic al psihologilor (4.02, 4.05, 10.01 - 10.03)",
				en: "APA: Ethical Principles of Psychologists (4.02, 4.05, 10.01 - 10.03)",
			},
			href: "https://www.apa.org/ethics/code/ethics-code-2017.pdf",
		},
		{
			label: {
				ro: "NIMH: psihoterapii (întrebări despre confidențialitate)",
				en: "NIMH: psychotherapies (questions about confidentiality)",
			},
			href: "https://www.nimh.nih.gov/health/topics/psychotherapies",
		},
		{
			label: {
				ro: "AAP (2024): confidențialitatea în îngrijirea adolescenților, declarație de politică",
				en: "AAP (2024): confidentiality in the care of adolescents, policy statement",
			},
			href: "https://pubmed.ncbi.nlm.nih.gov/38646690/",
		},
		{
			label: {
				ro: "AAP (2024): confidențialitatea în îngrijirea adolescenților, raport tehnic",
				en: "AAP (2024): confidentiality in the care of adolescents, technical report",
			},
			href: "https://pubmed.ncbi.nlm.nih.gov/38646698/",
		},
		{
			label: { ro: "Psizone: serviciile centrului", en: "Psizone: the centre’s services" },
			href: "https://psizone.ro",
		},
	],
	provenance: [
		"http://legislatie.just.ro/Public/DetaliiDocument/52375 (Law 213/2004, Art. 4(2): confidențialitatea actului psihologic este protejată prin lege și este o obligație a oricărui psiholog; the page does not list exceptions and has no provisions on minors)",
		"https://www.apa.org/ethics/code/ethics-code-2017.pdf (4.02 discuss limits of confidentiality at the outset, also with persons legally incapable of consent and their representatives, and risks of electronic services; 4.05 disclosure with consent, as mandated or permitted by law, to protect from harm, to obtain payment (minimum necessary); 4.06 consultations; 10.01 informed consent incl. fees and third parties; 10.02 couples/families: clarify who the clients are; 10.03 groups: describe roles and limits of confidentiality). US professional code, cited as a general pattern, not as Romanian law.",
		"https://www.nimh.nih.gov/health/topics/psychotherapies (ask: are meetings confidential, how assured, limits)",
		"PMID 38646690 and PMID 38646698 (Chung et al., Pediatrics 153(5), 2024: AAP policy statement and technical report on confidentiality in the care of adolescents; US legal context)",
		"https://psizone.ro (fetched 2026-11-12: confidentiality is not described on the page; the text makes no claim about Psizone's own confidentiality procedures)",
		"docs/brands/writing-voice.md",
	],
	seo: {
		title: {
			ro: "Confidențialitate psiholog: ce rămâne între noi și ce limite are",
			en: "Therapist confidentiality: what stays private, and its limits",
		},
		description: {
			ro: "Confidențialitate la psiholog și secret profesional: ce e privat, care sunt limitele, cum funcționează cu minorii și părinții, la angajator, asigurări și online.",
			en: "Therapist confidentiality explained: what is private, the limits, how it works with minors and parents, employers, insurers, couples and online sessions.",
		},
		keywords: {
			ro: [
				"confidențialitate psiholog secret profesional",
				"secretul profesional al psihologului",
				"confidențialitate terapie adolescenți",
				"află părinții ce spun la psiholog",
				"confidențialitate terapie online",
				"limitele confidențialității",
			],
			en: [
				"therapist confidentiality",
				"what is confidential in therapy",
				"limits of confidentiality",
				"therapy confidentiality teenagers parents",
				"online therapy privacy",
				"will my employer know I see a therapist",
			],
		},
	},
	faq: [
		{
			q: {
				ro: "Poate psihologul să spună părinților ce spune copilul în ședință?",
				en: "Can the psychologist tell parents what the child says in a session?",
			},
			a: {
				ro: "Depinde de acordul stabilit la început, de vârsta copilului și de legea aplicabilă. De obicei, părinții primesc informații despre cum merg ședințele, obiective și riscuri, nu detaliile a ceea ce spune copilul. Întreabă psihologul, la prima discuție, cum procedează și ce se întâmplă dacă apare un risc.",
				en: "It depends on the agreement made at the start, on the child’s age and on the applicable law. Usually parents receive information about how the sessions are going, goals and risks, not the details of what the child says. Ask the psychologist, at the first conversation, how they proceed and what happens if a risk appears.",
			},
		},
		{
			q: {
				ro: "Află angajatorul meu dacă merg la psiholog?",
				en: "Will my employer know if I see a psychologist?",
			},
			a: {
				ro: "Nu de la psiholog, care are obligația confidențialității. Poate afla dacă tu îi spui sau dacă ceri o adeverință. Înainte să semnezi un document, întreabă ce informații conține și către cine pleacă; o confirmare a prezenței este altceva decât un raport despre conținutul ședințelor.",
				en: "Not from the psychologist, who is bound by confidentiality. They can find out if you tell them or if you ask for a certificate. Before you sign a document, ask what information it contains and to whom it goes; a confirmation of attendance is different from a report on the content of sessions.",
			},
		},
		{
			q: {
				ro: "Când poate psihologul să încalce confidențialitatea?",
				en: "When can a psychologist break confidentiality?",
			},
			a: {
				ro: "Codul etic al Asociației Americane de Psihologie, folosit aici ca tipar general, admite dezvăluirea cu acordul tău, când legea o cere sau o permite, pentru a proteja pe cineva de un rău sau pentru plată, în măsura minimă necesară. Excepțiile din România țin de lege; cere psihologului să ți le spună clar.",
				en: "The American Psychological Association’s ethics code, used here as a general pattern, admits disclosure with your consent, where the law requires or permits it, to protect someone from harm or for payment, to the minimum necessary. The exceptions in Romania are set by law; ask the psychologist to state them clearly.",
			},
		},
		{
			q: {
				ro: "Ce rămâne confidențial în terapia de cuplu?",
				en: "What stays confidential in couple therapy?",
			},
			a: {
				ro: "Depinde de regulile fixate la început. Psihologul trebuie să clarifice cine sunt clienții și ce se întâmplă cu informațiile obținute, inclusiv dacă ceva spus separat unuia poate ajunge la celălalt. Întreabă dinainte, ca să nu fii surprins mai târziu.",
				en: "It depends on the rules fixed at the start. The psychologist should clarify who the clients are and what happens to the information obtained, including whether something said separately to one can reach the other. Ask beforehand, so you are not surprised later.",
			},
		},
		{
			q: {
				ro: "Este terapia online la fel de privată?",
				en: "Is online therapy as private?",
			},
			a: {
				ro: "Poate fi, dacă și tu, și psihologul respectați câteva condiții: un loc în care nu te aude nimeni, căști, un aparat și o conexiune de încredere, o platformă despre care ești informat. Codul etic al Asociației Americane de Psihologie cere informarea despre riscurile pentru intimitate. Întreabă și dacă ședința se înregistrează.",
				en: "It can be, if both you and the psychologist respect a few conditions: a place where nobody hears you, headphones, a trustworthy device and connection, and a platform you are informed about. The American Psychological Association’s ethics code requires information about the privacy risks. Also ask whether the session is recorded.",
			},
		},
	],
	related: [
		"prima-sedinta-de-terapie",
		"cand-adolescentul-are-nevoie-de-psiholog",
		"terapie-online-functioneaza-sau-nu",
		"terapia-de-familie-cu-un-copil-in-tratament",
	],
};
