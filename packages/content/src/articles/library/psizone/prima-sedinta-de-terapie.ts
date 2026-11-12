import type { ArticleInput } from "../../../schema";

export const article: ArticleInput = {
	slug: "prima-sedinta-de-terapie",
	brand: "psizone",
	topic: "psihoterapie",
	backlogNo: 11,
	status: "draft",
	kind: "health",
	aiDrafted: true,
	draftedAt: "2026-11-12",
	author: null,
	reviewer: null,
	title: {
		ro: "Prima ședință de terapie: la ce să te aștepți",
		en: "Your first therapy session: what to expect",
	},
	standfirst: {
		ro: "Prima ședință este o conversație, nu un examen. Psihologul te ascultă, îți explică cum lucrează și ce rămâne confidențial, iar voi doi stabiliți ce vrei să se schimbe. Nu trebuie să spui tot din prima zi și nu trebuie să te hotărăști pe loc dacă continui.",
		en: "The first session is a conversation, not an exam. The psychologist listens, explains how they work and what stays confidential, and the two of you agree what you would like to change. You do not have to say everything on day one, and you do not have to decide on the spot whether to continue.",
	},
	body: [
		{
			type: "p",
			text: {
				ro: "Prima ședință de terapie durează cam cât o discuție lungă la o cafea, doar că cineva are toată atenția îndreptată spre tine. Se vorbește, se ascultă, se pun întrebări, se explică regulile jocului. Nu se pune niciun diagnostic pe loc și nu ți se cere să povestești lucrurile cele mai grele. Dacă la final ai înțeles cum vom lucra și ai simțit că poți vorbi cu omul din fața ta, prima ședință și-a făcut treaba.",
				en: "A first therapy session lasts about as long as a long conversation over coffee, except that someone gives you their whole attention. There is talking, listening, a few questions and an explanation of the ground rules. No diagnosis is handed down on the spot, and nobody asks you to tell the hardest things. If by the end you understand how we will work and you felt you could talk to the person in front of you, the first session has done its job.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Probabil te întrebi dacă o să știi ce să spui. Răspunsul scurt: nu trebuie să știi. Cei mai mulți oameni care vin la noi încep cu „nu știu de unde să încep”, și e un început bun. Hai să parcurgem ora pas cu pas, ca să nu ți-o imaginezi mai înfricoșătoare decât este.",
				en: "You are probably wondering whether you will know what to say. The short answer is that you do not have to. Most people who come to see us begin with “I don’t know where to start”, and that is a perfectly good start. Let us walk through the hour step by step, so that you do not picture it as more frightening than it is.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce pregătești înainte de prima ședință de terapie?",
				en: "What should you prepare before your first therapy session?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Aproape nimic. Gândește-te, în ajun, la un singur lucru: ce te-a făcut să cauți ajutor tocmai acum. Poate e somnul care s-a stricat, poate e o ceartă care se repetă, poate e doar senzația că „nu mai merge ca înainte”. Nu e nevoie să ai un text scris. Un rând pe telefon îți ajunge.",
				en: "Almost nothing. The evening before, think about one thing: what made you look for help right now. Perhaps your sleep has gone, perhaps the same quarrel keeps returning, perhaps it is just a feeling that things “don’t work like they used to”. You do not need a written speech. One line in your phone notes is enough.",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "dacă ai rapoarte medicale, evaluări psihologice vechi sau o listă de medicamente pe care le iei, adu-le; psihologul le citește, dar nu te va sfătui să le schimbi;",
					en: "if you have medical reports, older psychological assessments or a list of the medicines you take, bring them; the psychologist will read them but will not advise you to change them;",
				},
				{
					ro: "două-trei întrebări pentru psiholog, scrise: cum lucrați, cât durează o ședință, cât de des ne vedem;",
					en: "two or three written questions for the psychologist: how do you work, how long is a session, how often do we meet;",
				},
				{
					ro: "dacă vii pentru un copil sau un adolescent, adu și o scurtă istorie: de când s-a schimbat ceva, ce ați încercat deja, cum merge școala;",
					en: "if you come for a child or a teenager, bring a short history: since when something changed, what you have already tried, how school is going;",
				},
				{
					ro: "timp: nu programa o ședință între două ședințe de la serviciu; lasă-ți un sfert de oră de liniște după.",
					en: "time: do not book it between two work meetings; leave yourself a quarter of an hour of quiet afterwards.",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "Cât durează ședința și cât costă se spune la programare, nu pe ușă. Centrul Psizone cere să-l contactezi pentru disponibilitate, durată și tarife, așa că întreabă atunci, ca să nu te surprindă nimic. Ca reper, serviciile publice de consiliere din Anglia notează că o ședință durează de obicei 50 până la 60 de minute; la noi, durata se stabilește la programare.",
				en: "How long the session lasts and what it costs is said when you book, not at the door. The Psizone centre asks you to contact it for availability, duration and fees, so ask then and nothing will take you by surprise. As a reference, the NHS says counselling sessions usually last 50 to 60 minutes; at our centre the length is set when you book.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum arată primele zece minute?",
				en: "What do the first ten minutes look like?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Ajungi, aștepți câteva minute, apoi psihologul te invită într-o cameră liniștită. Nu e cabinetul din filme, cu canapea lungă și creion în mână. Sunt scaune, o masă mică, probabil o cutie cu șervețele, pentru că uneori se plânge, iar asta nu e un semn că ceva a mers prost.",
				en: "You arrive, wait a few minutes, and then the psychologist invites you into a quiet room. It is not the office from the films, with a long couch and a pencil poised. There are chairs, a small table and probably a box of tissues, because sometimes people cry, and that is not a sign that anything has gone wrong.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Psihologul nu începe cu întrebări. Începe cu cadrul. Îți spune cum decurge ședința, cât durează, ce se întâmplă cu ce vorbiți și care sunt limitele confidențialității. Codul deontologic al psihologilor din România cere ca omul să înțeleagă, înainte să înceapă lucrul, scopul activității, beneficiile și riscurile, alternativele, limitele confidențialității, frecvența și costurile, și că poate refuza sau se poate retrage oricând. Dacă ceva din asta nu s-a spus, ai tot dreptul să întrebi.",
				en: "The psychologist does not begin with questions. They begin with the frame. They tell you how the session runs, how long it lasts, what happens to what you say and where the limits of confidentiality lie. The Romanian psychologists’ code of ethics asks that a person understands, before work begins, the purpose of the activity, the benefits and risks, the alternatives, the limits of confidentiality, the frequency and the costs, and that they may refuse or withdraw at any time. If any of that has not been said, you have every right to ask.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Poate suna așa. Psihologul: „Azi mai ales te ascult. Nu trebuie să-mi spui nimic ce nu vrei. Dacă vreau să te opresc sau să te întreb ceva, o fac cu grijă. Și oricând poți spune: «Despre asta nu azi».” Pauză. „Cu ce vrei să începem?”",
				en: "It might sound like this. The psychologist: “Today I mostly listen. You do not have to tell me anything you do not want to. If I want to stop you or ask something, I will do it gently. And at any point you can say: ‘Not about that today.’” A pause. “Where would you like to start?”",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce te întreabă psihologul în prima ședință?",
				en: "What does the psychologist ask in the first session?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Întrebările sunt ale unui om care încearcă să te înțeleagă, nu să te încadreze într-o etichetă. Serviciul public de sănătate din Anglia descrie prima întâlnire exact așa: întrebări despre cum te simți, ce dificultăți ai și cum îți influențează viața. În practică, ele sună cam așa:",
				en: "The questions come from someone trying to understand you, not to fit you into a label. The NHS describes the first appointment in exactly this way: questions about how you feel, what difficulties you have and how they affect your life. In practice they sound something like this:",
			},
		},
		{
			type: "p",
			text: {
				ro: "„Ce te-a adus la noi acum?” „De când te simți așa?” „Ce se schimbă de la o zi la alta?” „Cum dormi, cum mănânci, cum merge munca sau școala?” „Ce ai încercat deja și ce a ajutat, chiar și puțin?” „Cine știe că ai venit?” Și, aproape întotdeauna, ultima: „Cum ți-ar plăcea să fie peste câteva luni?”",
				en: "“What brought you to us now?” “Since when have you felt like this?” “What changes from one day to the next?” “How are you sleeping, eating, getting on at work or school?” “What have you already tried, and what helped even a little?” “Who knows that you have come?” And almost always, the last one: “How would you like things to be in a few months?”",
			},
		},
		{
			type: "p",
			text: {
				ro: "Psihologul poate întreba și despre sănătate, despre medicamentele pe care le iei și despre ce s-a mai încercat la medic sau la alt specialist. Nu ca să te corecteze, ci ca să vadă întregul tablou. Dacă îți cere ceva ce nu ești pregătit să spui, poți răspunde: „Prefer să ajung acolo mai târziu.” Un psiholog bun respectă asta.",
				en: "The psychologist may also ask about your health, any medicines you take and what has already been tried with a doctor or another specialist. Not to correct you, but to see the whole picture. If you are asked for something you are not ready to say, you can answer: “I would rather get there later.” A good psychologist respects that.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce nu ești obligat să spui?",
				en: "What do you not have to share?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Nimic din ce nu vrei să spui în prima zi. Nu ești obligat să povestești copilăria, o relație care a doare, un secret de familie sau un moment de rușine. Terapia se construiește în ritmul tău, iar încrederea vine din faptul că ai fost respectat când ai spus „nu încă”. Nu trebuie nici să arăți „bine”, nici să plângi ca să fii luat în serios.",
				en: "Nothing you do not want to say on the first day. You do not have to recount your childhood, a painful relationship, a family secret or a moment of shame. Therapy is built at your pace, and trust comes from having been respected when you said “not yet”. You do not have to look “fine”, and you do not have to cry to be taken seriously.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Institutul Național de Sănătate Mintală din SUA (NIMH) spune simplu că, în psihoterapie, relația de încredere dintre tine și terapeut este esențială, și îți recomandă să pui întrebări până când ai o imagine clară. Dacă după prima ședință nu ți s-a părut că vă potriviți, e un motiv legitim să mai încerci cu altcineva, nu un eșec al tău.",
				en: "The US National Institute of Mental Health (NIMH) says plainly that in psychotherapy the trusting relationship between you and the therapist is essential, and it encourages you to ask questions until you have a clear picture. If after the first session it did not seem a good match, that is a legitimate reason to try someone else, not a failure of yours.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Dacă vrei să-ți păstrezi un fel de plasă de siguranță, stabilește-o cu psihologul chiar la început. Poți conveni, de pildă, că dacă ți se pare prea mult, ridici mâna sau spui „pauză”, iar discuția se mută pe ceva mai ușor, un detaliu din ziua de azi sau din drumul până la cabinet. Nu e o slăbiciune. E o regulă a camerei, iar regulile de felul acesta fac loc lucrurilor grele mai târziu.",
				en: "If you would like a kind of safety net, agree it with the psychologist right at the start. You can settle, for instance, that if it feels like too much you raise a hand or say “pause”, and the conversation moves to something lighter, a detail from today or from the journey to the centre. That is not weakness. It is a rule of the room, and rules like this make space for the heavier things later.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum se stabilesc obiectivele și planul?",
				en: "How are the goals and the plan set?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Spre sfârșitul ședinței, psihologul îți spune ce a înțeles și te întreabă dacă s-a apropiat de realitate. Apoi voi doi alegeți una-două direcții: „Vreau să pot adormi fără să mă gândesc la mâine” e un obiectiv; „Vreau să nu mă mai cert cu fiul meu de fiecare dată când vorbim despre teme” e altul. Cuvintele sunt ale tale, nu ale manualului.",
				en: "Towards the end of the session the psychologist tells you what they have understood and asks whether it is close to your reality. Then the two of you choose one or two directions: “I want to be able to fall asleep without thinking about tomorrow” is a goal; “I want to stop arguing with my son every time we talk about homework” is another. The words are yours, not the textbook’s.",
			},
		},
		{
			type: "p",
			text: {
				ro: "NIMH îți recomandă să întrebi explicit despre obiectivele terapiei, despre numărul estimat de ședințe, despre cum se măsoară progresul și despre ce se întâmplă dacă nu te simți mai bine. Noi mergem mai departe: arătăm procesul și măsurătoarea, nu aparatul. De obicei, planul exact, adică frecvența și numărul de ședințe, se stabilește după evaluarea inițială, nu înainte, și îl poți revedea pe parcurs. Nu promitem termene și nu promitem rezultate; promitem că vei ști ce facem și de ce.",
				en: "NIMH recommends asking explicitly about the goals of therapy, the expected number of sessions, how progress will be measured and what happens if you are not feeling better. We go a step further: we show the process and the measurement, not the machine. The exact plan, meaning frequency and number of sessions, is usually set after the initial evaluation, not before, and you can revisit it along the way. We do not promise timelines and we do not promise results; we promise that you will know what we are doing and why.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce rămâne confidențial, pe scurt?",
				en: "What stays confidential, in short?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Ce spui în cameră rămâne, în regulă generală, între tine și psiholog. Secretul profesional este o regulă de bază a meseriei. Dar există limite, iar un psiholog serios ți le spune la început, nu după ce ai povestit. NIMH include chiar în lista întrebărilor pe care e bine să le pui: „Există limite ale confidențialității?” Pune-o fără ezitare.",
				en: "What you say in the room stays, as a general rule, between you and the psychologist. Professional secrecy is a basic rule of the profession. But there are limits, and a serious psychologist tells you about them at the start, not after you have told your story. NIMH even includes in its list of questions worth asking: “Are there limits to confidentiality?” Ask it without hesitation.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Cu un copil sau un adolescent, echilibrul e mai fin: părintele are nevoie să știe cum merge terapia, iar tânărul are nevoie de un loc în care poate vorbi liber. Cum se împart aceste lucruri se discută deschis la început, cu amândoi. Dacă tu sau cineva apropiat sunteți în pericol imediat, sunați la 112.",
				en: "With a child or teenager the balance is finer: the parent needs to know how therapy is going, and the young person needs a place to speak freely. How these are shared is discussed openly at the start, with both. If you or someone close to you is in immediate danger, call 112.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce e normal să simți după prima ședință?",
				en: "What is normal to feel after the first session?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Oamenii descriu lucruri diferite. Unii se simt mai ușori, ca după ce au dus ceva greu. Alții sunt obosiți, ca după o zi lungă, pentru că a vorbi deschis cere efort. Unii sunt neliniștiți, pentru că au spus cu voce tare ceva ce țineau în ei. Toate acestea sunt reacții obișnuite. Nu sunt un verdict despre terapie.",
				en: "People describe different things. Some feel lighter, as if they had put down something heavy. Others are tired, as after a long day, because speaking openly takes effort. Some are restless, because they said aloud something they had kept inside. All of these are ordinary reactions. None is a verdict on therapy.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Dă-ți seara liniștită, bea ceva cald, nu te grăbi să iei decizii mari. Dacă a doua zi te apasă ceva ce s-a spus în ședință, notează întrebarea și adu-o data viitoare. Dacă ai probleme de somn sau o stare care se agravează de la o zi la alta, sună la centru și spune-ne, nu aștepta ședința următoare. Terapia nu înlocuiește îngrijirea medicală sau psihiatrică și nu este un serviciu de urgență.",
				en: "Give yourself a quiet evening, have something warm to drink, and do not rush into big decisions. If something said in the session weighs on you the next day, write the question down and bring it next time. If your sleep suffers or a state worsens from one day to the next, call the centre and tell us; do not wait for the next session. Therapy does not replace medical or psychiatric care and is not an emergency service.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Nu ești obligat să decizi dacă continui pe loc. Poți spune: „Mă gândesc și vă dau un răspuns.” Prima ședință e și pentru tine, ca să vezi cum e să vorbești cu acest om și cum lucrează el.",
				en: "You do not have to decide on the spot whether to continue. You can say: “I will think about it and let you know.” The first session is also for you, to see what it is like to talk to this person and how they work.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum programezi prima ședință?",
				en: "How do you book your first session?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Intră pe psizone.ro și apasă „Programează o evaluare”, sau sună de la numerele afișate acolo. Spune în două fraze cine vine (tu, copilul tău, un adolescent) și ce te îngrijorează. Noi îți spunem ce disponibilitate avem, cât durează prima întâlnire și care sunt tarifele. Prima discuție e despre voi, nu despre diagnostic.",
				en: "Go to psizone.ro and press “Programează o evaluare” (book an evaluation), or call the numbers shown there. Say in two sentences who is coming (you, your child, a teenager) and what worries you. We will tell you what availability we have, how long the first meeting lasts and what the fees are. The first conversation is about you, not about a diagnosis.",
			},
		},
	],
	sources: [
		{
			label: {
				ro: "NIMH: Psihoterapii (ce întrebări să pui, obiective, confidențialitate)",
				en: "NIMH: Psychotherapies (what to ask, goals, confidentiality)",
			},
			href: "https://www.nimh.nih.gov/health/topics/psychotherapies",
		},
		{
			label: {
				ro: "NHS: Consiliere (formate, durata ședințelor)",
				en: "NHS: Counselling (formats, session length)",
			},
			href: "https://www.nhs.uk/mental-health/talking-therapies-medicine-treatments/talking-therapies-and-counselling/counselling/",
		},
		{
			label: {
				ro: "NHS: Terapii prin vorbire (cum funcționează, formate)",
				en: "NHS: Talking therapies (how they work, formats)",
			},
			href: "https://www.nhs.uk/mental-health/talking-therapies-medicine-treatments/talking-therapies-and-counselling/nhs-talking-therapies/",
		},
		{
			label: {
				ro: "Asociația Psihologilor din România: Ghid pentru serviciile psihologice online (2022), cu extrasul din Codul deontologic despre consimțământul informat",
				en: "Romanian Psychologists’ Association: guide to online psychological services (2022), quoting the code of ethics on informed consent",
			},
			href: "https://www.copsi.ro/images/APR_Ghid_privind_telepsihologia.pdf",
		},
		{
			label: { ro: "Psizone: serviciile centrului", en: "Psizone: the centre’s services" },
			href: "https://psizone.ro",
		},
	],
	provenance: [
		"https://www.nimh.nih.gov/health/topics/psychotherapies (opened: ask about credentials, goals, number of sessions, how progress is measured, what if not improving, confidentiality and its limits; rapport and trust essential)",
		"https://www.nhs.uk/mental-health/talking-therapies-medicine-treatments/talking-therapies-and-counselling/counselling/ (opened: sessions usually 50 to 60 minutes; counsellors listen without judgement)",
		"https://www.nhs.uk/mental-health/talking-therapies-medicine-treatments/talking-therapies-and-counselling/nhs-talking-therapies/ (opened: in-person, video, phone, online; group or one-to-one)",
		"https://www.copsi.ro/images/APR_Ghid_privind_telepsihologia.pdf (opened: quotes Codul Deontologic, Cap. I, pct. C.2, on what informed consent covers: purpose, benefits and risks, alternatives, limits of confidentiality, frequency, costs, right to withdraw)",
		"https://psizone.ro (opened: contact for availability, duration and fees; 'Programează o evaluare'; interventions set after an initial discussion)",
		"apps/psizone-web/src/content/rich/psychotherapy.ts (frequency and total number set after the initial evaluation; psychotherapy does not replace medical care and is not an emergency service)",
		"The NHS description of what the first appointment asks (how you feel, difficulties, impact on life) comes from the existing draft prima-sedinta-de-terapie-ce-se-intampla.ts, which cites talkworks.dpt.nhs.uk; that page was not re-opened for this draft.",
		"docs/brands/writing-voice.md",
	],
	seo: {
		title: {
			ro: "Prima ședință de terapie: la ce să te aștepți | Psizone",
			en: "First therapy session: what to expect | Psizone",
		},
		description: {
			ro: "Prima ședință de terapie pas cu pas: ce pregătești, ce te întreabă psihologul, ce nu ești obligat să spui, cum se stabilesc obiectivele și cum programezi.",
			en: "Your first therapy session step by step: what to prepare, what the psychologist asks, what you do not have to say, how goals are set and how to book.",
		},
		keywords: {
			ro: [
				"prima ședință de terapie",
				"prima ședință la psiholog",
				"cum decurge prima ședință de psihoterapie",
				"ce întreabă psihologul la prima ședință",
				"ce să aștepți de la terapie",
				"programare psiholog Galați",
			],
			en: [
				"first therapy session what to expect",
				"first session with a psychologist",
				"what happens in the first therapy session",
				"what does a therapist ask in the first session",
				"nervous about therapy",
				"book a psychologist in Galați",
			],
		},
	},
	faq: [
		{
			q: {
				ro: "Cât durează prima ședință de terapie?",
				en: "How long does a first therapy session last?",
			},
			a: {
				ro: "Depinde de loc și de tipul de terapie. Serviciile publice de consiliere din Anglia notează că ședințele durează de obicei între 50 și 60 de minute. La Psizone, durata, disponibilitatea și tarifele se spun la programare, ca să știi exact la ce să te aștepți înainte să vii.",
				en: "It depends on the place and the type of therapy. The NHS notes that counselling sessions usually last between 50 and 60 minutes. At Psizone, the length, availability and fees are given when you book, so you know exactly what to expect before you come.",
			},
		},
		{
			q: {
				ro: "Trebuie să povestesc tot din prima zi?",
				en: "Do I have to tell everything on the first day?",
			},
			a: {
				ro: "Nu. Poți spune doar ce te-a adus și cât vrei să împărtășești. Psihologul nu insistă pe teme pentru care nu ești pregătit, iar încrederea se construiește tocmai pentru că poți spune „nu încă”. Povestea completă se adună în timp, în ritmul tău.",
				en: "No. You can say only what brought you and as much as you want to share. The psychologist does not push on subjects you are not ready for, and trust is built precisely because you can say “not yet”. The full story gathers over time, at your pace.",
			},
		},
		{
			q: {
				ro: "Dacă plâng în timpul ședinței?",
				en: "What if I cry during the session?",
			},
			a: {
				ro: "Nu e o problemă și nu e un semn că ai greșit ceva. Cabinetele au șervețele tocmai pentru asta. Psihologul nu se grăbește să schimbe subiectul și nici nu te forțează să continui. Poți face o pauză, poți respira, poți spune ce ai nevoie. Mulți oameni se simt mai ușor după.",
				en: "That is fine and it does not mean you did anything wrong. Therapy rooms keep tissues for exactly this reason. The psychologist does not rush to change the subject and does not push you to continue. You can pause, breathe and say what you need. Many people feel lighter afterwards.",
			},
		},
		{
			q: {
				ro: "Primesc un diagnostic după prima ședință?",
				en: "Will I get a diagnosis after the first session?",
			},
			a: {
				ro: "De regulă, nu pe loc. Prima ședință servește la a înțelege ce te aduce și ce vrei să schimbi. Dacă e nevoie de o evaluare mai amănunțită, psihologul îți spune ce presupune și cât durează. Un diagnostic psihiatric se discută cu medicul psihiatru, nu într-o primă conversație.",
				en: "Usually not on the spot. The first session is for understanding what brings you and what you want to change. If a more thorough evaluation is needed, the psychologist tells you what it involves and how long it takes. A psychiatric diagnosis is discussed with a psychiatrist, not in a first conversation.",
			},
		},
		{
			q: {
				ro: "Ce spun dacă nu mă simt bine cu psihologul?",
				en: "What do I say if I do not feel comfortable with the psychologist?",
			},
			a: {
				ro: "Poți spune direct: „Nu sunt sigur că ne potrivim.” Un psiholog profesionist nu se supără și te poate ajuta să găsești o altă variantă. NIMH subliniază că încrederea dintre tine și terapeut este esențială, deci nu ești obligat să rămâi într-o relație în care nu te simți în siguranță.",
				en: "You can say it directly: “I’m not sure we are a good match.” A professional psychologist will not take offence and can help you find another option. NIMH stresses that trust between you and the therapist is essential, so you are not obliged to stay in a relationship where you do not feel safe.",
			},
		},
		{
			q: {
				ro: "Pot veni cu cineva la prima ședință?",
				en: "Can I bring someone with me to the first session?",
			},
			a: {
				ro: "Depinde de situație. Pentru un copil sau un adolescent, de obicei vin și părinții, cel puțin la începutul discuției. Pentru un adult, poți spune la programare că ai prefera să fii însoțit și întrebi cum se poate face, ca să nu afli abia în ziua respectivă.",
				en: "It depends on the situation. For a child or a teenager, the parents usually come too, at least for the start of the conversation. For an adult, you can say when booking that you would prefer company and ask how that can work, so you do not find out only on the day.",
			},
		},
	],
	related: [
		"confidentialitatea-in-terapie",
		"cum-alegi-un-psihoterapeut",
		"cat-dureaza-psihoterapia",
		"cand-adolescentul-are-nevoie-de-psiholog",
	],
};
