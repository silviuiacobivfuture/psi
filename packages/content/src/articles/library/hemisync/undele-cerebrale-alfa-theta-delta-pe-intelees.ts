import type { ArticleInput } from "../../../schema";

export const article: ArticleInput = {
	slug: "undele-cerebrale-alfa-theta-delta-pe-intelees",
	brand: "hemisync",
	topic: "sunet-si-creier",
	backlogNo: null,
	status: "draft",
	kind: "editorial",
	aiDrafted: true,
	draftedAt: "2026-11-12",
	author: null,
	reviewer: null,
	title: {
		ro: "Undele cerebrale: alfa, beta, theta, delta pe înțeles",
		en: "Brain waves: alpha, beta, theta, delta in plain words",
	},
	standfirst: {
		ro: "Un EEG înregistrează activitatea electrică a creierului, iar cercetătorii o împart în benzi: delta (cam 1–4 Hz), theta (4–8), alfa (8–13) și beta (13–30). Fiecare bandă se asociază cu stări obișnuite, de la somn profund la concentrare. Limitele nu sunt fixe, iar sursele nu cad de acord asupra lor.",
		en: "An EEG records the brain’s electrical activity, and researchers sort it into bands: delta (about 1–4 Hz), theta (4–8), alpha (8–13) and beta (13–30). Each band is linked to everyday states, from deep sleep to concentration. The edges are not fixed, and sources do not agree on them.",
	},
	cover: {
		src: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7f/Ciuca%C8%99_Mountains_4.jpg/1280px-Ciuca%C8%99_Mountains_4.jpg",
		alt: {
			ro: "Vârfuri de stâncă cu zăpadă rămasă pe pante, sub nori deschiși la culoare.",
			en: "Rock peaks with leftover snow on the slopes, under pale clouds.",
		},
		width: 1280,
		height: 853,
	},
	body: [
		{
			type: "p",
			text: {
				ro: "Pe scurt: creierul produce tot timpul ritmuri electrice, iar un EEG le grupează pe benzi de frecvență. Cele patru mari sunt delta, theta, alfa și beta. Frecvența se măsoară în hertzi (Hz), adică de câte ori pe secundă se repetă unda. Cu cât numărul e mai mic, cu atât unda e mai lentă, și, în linii mari, cu atât starea e mai aproape de somn.",
				en: "In short: the brain produces electrical rhythms all the time, and an EEG sorts them into frequency bands. The four big ones are delta, theta, alpha and beta. Frequency is measured in hertz (Hz), meaning how many times per second the wave repeats. The lower the number, the slower the wave, and, broadly, the closer the state is to sleep.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Care sunt cele patru benzi principale și ce Hz au?",
				en: "What are the four main bands and what Hz do they cover?",
			},
		},
		{
			type: "p",
			text: {
				ro: "O trecere în revistă despre neurofeedback din 2016 (Marzbani și colegii) dă una dintre cele mai folosite împărțiri. O reținem ca punct de plecare, cu avertismentul că mai jos vedem cum diferă de la o sursă la alta:",
				en: "A 2016 review of neurofeedback (Marzbani and colleagues) gives one of the most widely used divisions. We keep it as a starting point, with the warning that below we see how it differs from source to source:",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "Delta, cam 1–4 Hz: cele mai lente unde. Se asociază cu somnul, în special cu etapele lui adânci.",
					en: "Delta, about 1–4 Hz: the slowest waves. Linked to sleep, especially its deep stages.",
				},
				{
					ro: "Theta, cam 4–8 Hz: unde lente, văzute când cineva e somnoros.",
					en: "Theta, about 4–8 Hz: slow waves, seen when someone is sleepy.",
				},
				{
					ro: "Alfa, cam 8–13 Hz: unde prezente când omul e treaz și relaxat, cu mușchii destinși.",
					en: "Alpha, about 8–13 Hz: waves present when a person is awake and relaxed, with loose muscles.",
				},
				{
					ro: "Beta, cam 13–30 Hz: unde rapide, văzute când omul e atent și alert.",
					en: "Beta, about 13–30 Hz: fast waves, seen when a person is attentive and alert.",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "Mai există gamma, cam 30–100 Hz în aceeași lucrare, dar rămânem la cele patru pe care le întâlnești cel mai des în vorbirea de zi cu zi.",
				en: "There is also gamma, about 30–100 Hz in the same paper, but we stay with the four you meet most often in everyday talk.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce este un EEG, într-o singură frază?",
				en: "What is an EEG, in one sentence?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Potrivit serviciului de sănătate britanic (NHS), un EEG este un test care înregistrează activitatea electrică din creier: electrozi mici se lipesc pe scalp cu o pastă, sunt legați prin fire la un aparat, testul nu doare și durează de obicei cam o oră. Se folosește mai ales pentru epilepsie, dar și pentru unele probleme de somn și pentru inflamația creierului.",
				en: "According to the UK’s National Health Service (NHS), an EEG is a test that records electrical activity in the brain: small metal electrodes are stuck to the scalp with a paste and wired to a machine, the test is painless and usually takes about an hour. It is used mainly for epilepsy, but also for some sleep conditions and for inflammation of the brain.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Ține minte asta când citești despre unde cerebrale în reclame sau pe aplicații: un EEG medical este un instrument clinic, interpretat de specialiști. Benzile sunt un fel de a descrie ce a înregistrat el, nu un tablou de bord al stărilor tale.",
				en: "Keep this in mind when you read about brain waves in adverts or apps: a medical EEG is a clinical instrument, read by specialists. The bands are a way of describing what it recorded, not a dashboard of your states.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum se leagă benzile de ce trăiești într-o zi obișnuită?",
				en: "How do the bands connect to an ordinary day?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Imaginează-ți o zi. La nouă dimineața ești la birou, urmărești un raport, te gândești la ce ai de făcut până la prânz. Aici domină ritmurile rapide: o altă lucrare, despre somn (Zielinski și colegii, 2016), descrie undele beta ca parte din starea de veghe normală, prezente la atenție ridicată, la raționament critic, dar și la gândire neliniștită.",
				en: "Picture a day. At nine in the morning you are at your desk, following a report, thinking about what must be done by lunch. Fast rhythms dominate here: another paper, on sleep (Zielinski and colleagues, 2016), describes beta waves as part of normal waking, present in heightened alertness and critical reasoning, but also in anxious thinking.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Seara, pe canapea, cu ochii închiși, după ce ai oprit ecranul, apare alfa. Aceeași lucrare spune că ritmurile alfa sunt mai pronunțate când ochii sunt închiși și omul e relaxat, și că scad când deschizi ochii. Când începi să aipești, alfa se atenuează, iar spre somn undele încetinesc.",
				en: "In the evening, on the sofa, eyes closed, after you switch off the screen, alpha appears. The same paper says alpha rhythms are more pronounced when the eyes are closed and the person is relaxed, and that they fade when you open your eyes. As you begin to doze, alpha is attenuated, and towards sleep the waves slow down.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Institutul american pentru tulburări neurologice (NINDS) descrie același drum: în prima etapă, când adormi, undele încetinesc față de veghea de zi, în etapa a treia, somnul profund, devin și mai lente, iar în somnul REM activitatea se apropie din nou de cea din veghe. În lucrarea Marzbani, delta, cea mai lentă bandă, este asociată cu somnul profund, iar theta cu somnolența. Nimic spectaculos, doar felul în care arată electric o seară obișnuită.",
				en: "The US National Institute of Neurological Disorders and Stroke (NINDS) describes the same road: in the first stage, as you drift off, brain waves slow from their daytime patterns, in the third stage, deep sleep, they become even slower, and in REM sleep activity comes close again to that of wakefulness. In the Marzbani paper, delta, the slowest band, is linked to deep sleep, and theta to sleepiness. Nothing spectacular, just how an ordinary evening looks electrically.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "De ce se suprapun benzile și de ce nu dau sursele aceleași cifre?",
				en: "Why do the bands overlap, and why do sources give different numbers?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pentru că limitele sunt convenții trasate printr-un spectru continuu. Autorii unei treceri în revistă din Frontiers in Human Neuroscience (Newson și Thiagarajan, 2019) au examinat 184 de studii EEG de repaus și au constatat că ce înseamnă „delta” sau „beta” într-o lucrare nu e neapărat ce înseamnă în alta. Intervalele tipice: delta 1,3–3,5 Hz, theta 4–7,5, alfa 8–13, beta 12,5–30. Dar limitele extreme variau mult: cea mai joasă margine de început a alfa era 6 Hz, iar cea mai înaltă margine de sfârșit 14; delta se întindea până la 6 Hz, beta până la 50.",
				en: "Because the edges are conventions drawn through a continuous spectrum. The authors of a review in Frontiers in Human Neuroscience (Newson and Thiagarajan, 2019) examined 184 resting-state EEG studies and found that what “delta” or “beta” means in one paper is not necessarily what it means in another. The typical ranges: delta 1.3–3.5 Hz, theta 4–7.5, alpha 8–13, beta 12.5–30. But the extremes varied a great deal: the lowest start of alpha was 6 Hz and its highest end 14; delta stretched up to 6 Hz, beta up to 50.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Zielinski și colegii dau alfa „de obicei” la 9–15 Hz și beta la 15–30. Marzbani și colegii dau 8–13 și 13–30. Trei lucrări serioase, trei seturi ușor diferite. Niciuna nu greșește. Newson și Thiagarajan notează chiar că împărțirea pe benzi vine din limitele tehnice ale anilor 1930–40, când nu existau alte metode de analiză, și se întreabă dacă a rămas în uz doar din obișnuință.",
				en: "Zielinski and colleagues give alpha as “typically” 9–15 Hz and beta as 15–30. Marzbani and colleagues give 8–13 and 13–30. Three serious papers, three slightly different sets. None is wrong. Newson and Thiagarajan even note that splitting into bands comes from the technical limits of the 1930s and 1940s, when few other analysis methods existed, and ask whether it has stayed in use simply out of habit.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Mai există un motiv pentru suprapunere: starea unui om este de regulă un amestec, iar când se spune „domină alfa”, se spune care ritm iese în față, nu că celelalte lipsesc.",
				en: "There is another reason for the overlap: a person’s state is usually a mixture, and when we say “alpha dominates”, we say which rhythm comes to the front, not that the others are absent.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum vorbesc programele audio despre unde cerebrale?",
				en: "How do audio programmes talk about brain waves?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pe pagina de tehnologie a Hemi-Sync România există un exemplu simplu: urechea stângă primește un ton de 100 Hz, cea dreaptă unul de 104 Hz, iar creierul percepe diferența, o pulsație de 4 Hz, numită bătaie binaurală. Pagina descrie apoi cum emisferele „se sincronizează” pe această frecvență. Ia-o ca descrierea pe care o dă tehnologia despre ea însăși.",
				en: "On Hemi-Sync România’s technology page there is a simple example: the left ear receives a 100 Hz tone, the right a 104 Hz one, and the brain perceives the difference, a 4 Hz pulse, called a binaural beat. The page then describes how the hemispheres “synchronise” on that frequency. Take it as the technology’s own description of itself.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Trei lucruri merită puse lângă ea. Primul: bătaia se aude, după trecerea în revistă din PLOS ONE din 2023, în intervalul aproximativ 1–30 Hz, adică exact peste benzile EEG. Al doilea: același studiu, Ingendoh și colegii, a găsit 14 lucrări EEG cu rezultate contradictorii, 5 în favoarea ideii că undele creierului urmează sunetul, 8 împotrivă, una mixtă, și spune că întrebarea nu poate fi tranșată încă. Al treilea: 4 Hz stă chiar pe granița dintre delta (1–4) și theta (4–8) în împărțirea lui Marzbani. Un exemplu bun de cât de elastice sunt limitele.",
				en: "Three things are worth setting beside it. First: the beat is audible, according to the 2023 PLOS ONE review, in the range of about 1–30 Hz, which lies right across the EEG bands. Second: the same review, Ingendoh and colleagues, found 14 EEG papers with contradictory results, 5 in favour of brain waves following the sound, 8 against, one mixed, and says the question cannot yet be settled. Third: 4 Hz sits exactly on the border between delta (1–4) and theta (4–8) in Marzbani’s division. A good example of how elastic the edges are.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Nivelurile Focus sunt același lucru cu benzile?",
				en: "Are the Focus levels the same as the bands?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Nu. Nivelurile Focus sunt un sistem al metodei Monroe pentru a numi stări ale conștiinței așa cum se trăiesc: Focus 10 este descris ca „minte trează, corp adormit”, Focus 12 ca „conștientizare extinsă”. Pe pagina Hemi-Sync România despre ele nu apare niciun Hz, nicio bandă delta sau theta. Sunt etichete de experiență, nu intervale de frecvență.",
				en: "No. The Focus levels are a system of the Monroe method for naming states of consciousness as they are lived: Focus 10 is described as “mind awake, body asleep”, Focus 12 as “expanded awareness”. On Hemi-Sync România’s page about them no Hz appears, no delta or theta band. They are labels of experience, not frequency intervals.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pagina spune că sistemul s-a dezvoltat în urma cercetărilor experiențiale și a măsurătorilor activității cerebrale făcute la Institutul Monroe. Răspunsurile frecvente adaugă că numerele nu înseamnă niveluri „mai bune” sau „mai evoluate”. Deci nu căuta un tabel de tipul Focus 10 egal cu theta. Nu l-am găsit în sursele oficiale pe care le-am deschis și nu ar fi onest să-l inventăm.",
				en: "The page says the system was developed from experiential research and measurements of brain activity done at the Monroe Institute. The frequently asked questions add that the numbers do not mean “better” or “more evolved” levels. So do not look for a table that says Focus 10 equals theta. We did not find one in the official sources we opened, and it would not be honest to invent it.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum arată, pentru ascultător, un exercițiu cu bătăi binaurale?",
				en: "What does an exercise with binaural beats look like to the listener?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Nu arată ca un grafic. Arată ca o seară obișnuită: te așezi, pui căștile, închizi ochii. Pe pagina de tehnologie a Hemi-Sync România scrie un lucru practic, important: tonurile sunt joase, pe difuzoarele unui laptop aproape nu se aud, iar efectul binaural nu apare deloc. Ai nevoie de căști cu sunet separat pe stânga și pe dreapta.",
				en: "It does not look like a graph. It looks like an ordinary evening: you sit down, put on headphones, close your eyes. Hemi-Sync România’s technology page states one practical and important thing: the tones are low, on a laptop’s speakers they are almost inaudible, and the binaural effect does not appear at all. You need headphones with separate left and right sound.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Apoi, în exercițiile ghidate, o voce îți spune ce să faci cu atenția: să-ți relaxezi corpul, să urmărești respirația, să rămâi cu o imagine. Pulsul din fundal e doar o parte din ce auzi. Răspunsurile frecvente ale site-ului spun că Hemi-Sync® „invită, nu forțează” creierul și că cel care ascultă păstrează controlul pe tot parcursul exercițiului; poți oricând să deschizi ochii și să te oprești.",
				en: "Then, in guided exercises, a voice tells you what to do with your attention: relax the body, follow the breath, stay with an image. The pulse in the background is only one part of what you hear. The site’s frequently asked questions say that Hemi-Sync® “invites, does not force” the brain, and that the listener keeps control throughout the exercise; you can open your eyes and stop at any time.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce întrebi când un program îți vorbește despre unde cerebrale?",
				en: "What do you ask when a programme talks to you about brain waves?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Cuvintele „alfa”, „theta” sau „delta” apar în multe reclame pentru sunet. Nu e nimic rău în ele, dar e bine să știi ce le stă în spate. Câteva întrebări simple îți arată repede dacă ai în față o explicație sau doar un decor:",
				en: "The words “alpha”, “theta” or “delta” appear in many adverts for sound. There is nothing wrong with them, but it helps to know what stands behind them. A few simple questions quickly show whether you are facing an explanation or only a decoration:",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "Ce înseamnă numărul? E frecvența bătăii, adică diferența dintre cele două tonuri, nu frecvența fiecărui ton.",
					en: "What does the number mean? Is it the beat frequency, the difference between the two tones, and not the frequency of each tone?",
				},
				{
					ro: "Se spune ce se măsoară sau doar ce se simte? „Mă simt calm” e o experiență valoroasă, dar nu e un EEG.",
					en: "Does it say what is measured or only what is felt? “I feel calm” is a valuable experience, but it is not an EEG.",
				},
				{
					ro: "Se numește o sursă, cu autor și an, sau doar „cercetări arată”?",
					en: "Is a source named, with author and year, or only “research shows”?",
				},
				{
					ro: "Se precizează că sunt necesare căști și cine nu ar trebui să asculte?",
					en: "Does it say that headphones are needed and who should not listen?",
				},
			],
		},
		{
			type: "h2",
			text: {
				ro: "Ce simplificări merită privite cu prudență?",
				en: "Which simplifications deserve caution?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Cele mai des întâlnite sunt tabelele de tipul „theta înseamnă creativitate”. Chiar tabelul din lucrarea Marzbani trece sub theta creativitatea și intuiția, dar și depresia, anxietatea și distractibilitatea. Aceeași bandă, stări foarte diferite. Newson și Thiagarajan, uitându-se la 184 de studii pe tulburări psihice, notează că o bandă luată singură nu e o măsură bună pentru a deosebi o tulburare de alta.",
				en: "The most common are tables that say “theta means creativity”. The very table in the Marzbani paper lists, under theta, creativity and insight, but also depression, anxiety and distractibility. The same band, very different states. Newson and Thiagarajan, looking at 184 studies on mental disorders, note that a single band taken alone is not a good measure to tell one disorder from another.",
			},
		},
		{
			type: "p",
			text: {
				ro: "De aici, trei reguli simple. Nu te autodiagnostica după undele cerebrale. Nu lua o bandă drept sinonim cu o stare. Iar când un program promite că „te duce în theta”, întreabă: cine a măsurat, pe câți oameni, față de ce. Pentru povestea ei întreagă, citește și articolul nostru despre studii, unde exact asta facem.",
				en: "From this, three simple rules. Do not diagnose yourself by brain waves. Do not take a band as a synonym for a state. And when a programme promises to “take you into theta”, ask: who measured, on how many people, against what. For the whole story, read our article on the studies, where we do exactly that.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Un singur pas următor: seara asta, stai zece minute cu ochii închiși, fără ecran, și notează în două rânduri cum te simți. Nu ca să-ți măsori undele, ci ca să înveți cum arată, pentru tine, trecerea de la ritmul zilei la cel al serii.",
				en: "One next step: this evening, sit for ten minutes with your eyes closed, no screen, and write two lines on how you feel. Not to measure your waves, but to learn what the passage from the rhythm of the day to that of the evening looks like for you.",
			},
		},
	],
	sources: [
		{
			label: {
				ro: "Marzbani, Marateb, Mansourian, 2016: neurofeedback, o trecere în revistă (benzi EEG)",
				en: "Marzbani, Marateb, Mansourian, 2016: neurofeedback, a comprehensive review (EEG bands)",
			},
			href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4892319/",
		},
		{
			label: {
				ro: "Newson, Thiagarajan, 2019, Frontiers in Human Neuroscience: benzi de frecvență EEG în tulburări psihice",
				en: "Newson, Thiagarajan, 2019, Frontiers in Human Neuroscience: EEG frequency bands in psychiatric disorders",
			},
			href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6333694/",
		},
		{
			label: {
				ro: "Zielinski, McKenna, McCarley, 2016, AIMS Neuroscience: funcțiile și mecanismele somnului",
				en: "Zielinski, McKenna, McCarley, 2016, AIMS Neuroscience: functions and mechanisms of sleep",
			},
			href: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5390528/",
		},
		{
			label: { ro: "NHS: ce este un EEG", en: "NHS: what an EEG is" },
			href: "https://www.nhs.uk/conditions/eeg/",
		},
		{
			label: {
				ro: "NINDS: Brain Basics, înțelegerea somnului",
				en: "NINDS: Brain Basics, understanding sleep",
			},
			href: "https://www.ninds.nih.gov/health-information/public-education/brain-basics/brain-basics-understanding-sleep",
		},
		{
			label: {
				ro: "Ingendoh et al., 2023, PLOS ONE: antrenează bătăile binaurale undele creierului?",
				en: "Ingendoh et al., 2023, PLOS ONE: do binaural beats entrain brain waves?",
			},
			href: "https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0286023",
		},
		{
			label: {
				ro: "Hemi-Sync România: nivelurile Focus",
				en: "Hemi-Sync România: the Focus levels",
			},
			href: "https://www.hemi-sync.ro/nivelurile-focus",
		},
		{
			label: {
				ro: "Hemi-Sync România: tehnologia Hemi-Sync®",
				en: "Hemi-Sync România: Hemi-Sync® technology",
			},
			href: "https://www.hemi-sync.ro/tehnologia",
		},
	],
	provenance: [
		"https://pmc.ncbi.nlm.nih.gov/articles/PMC4892319/ (full text via Europe PMC: delta 1–4, theta 4–8, alpha 8–13, beta 13–30, gamma 30–100; the 'asleep, sleepy, relaxed but awake, alert' summary; Table 1 lists theta with creativity, insight, depression, anxiety, distractibility; 'differences in defining the exact range')",
		"https://pmc.ncbi.nlm.nih.gov/articles/PMC6333694/ (full text via Europe PMC: 184 resting-state studies; Table 2 typical ranges delta 1.3–3.5, theta 4–7.5, alpha 8–13, beta 12.5–30, minimum start and maximum end values; band approach dates from the 1930s–40s; a single band does not distinguish disorders)",
		"https://pmc.ncbi.nlm.nih.gov/articles/PMC5390528/ (full text via Europe PMC: alpha typically 9–15 Hz, pronounced eyes closed, suppressed eyes open, attenuated with drowsiness; beta 15–30 Hz, alertness, critical reasoning, anxious thinking)",
		"https://www.nhs.uk/conditions/eeg/ (opened: records electrical activity, electrodes with sticky paste, painless, about an hour, epilepsy, sleep conditions, encephalitis)",
		"https://www.ninds.nih.gov/health-information/public-education/brain-basics/brain-basics-understanding-sleep (opened: stage 1 waves slow, stage 3 even slower, REM closer to wakefulness)",
		"https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0286023 (opened: beats perceived in about 1–30 Hz; 14 EEG studies, 5 support, 8 contradict, 1 mixed; unsettled)",
		"https://www.hemi-sync.ro/nivelurile-focus (opened: Focus levels as a system from experiential research and brain activity measurements; Focus 10 and 12 descriptions; no Hz given)",
		"https://www.hemi-sync.ro/tehnologia (opened: 100 Hz and 104 Hz example giving a 4 Hz beat; hemispheres synchronise on the resulting frequency)",
		"https://www.hemi-sync.ro/intrebari-frecvente (opened: Focus numbers are not 'better' or 'more evolved' levels)",
		"cover: kallerna, “Ciucaș Mountains 4”, Wikimedia Commons, CC BY-SA 4.0, https://commons.wikimedia.org/wiki/File:Ciuca%C8%99_Mountains_4.jpg (downloaded and viewed: rock peaks with snow under pale clouds, no people; an editor confirms the licence before publication)",
		"docs/brands/writing-voice.md (Hemi-Sync narrator and claim rules)",
	],
	seo: {
		title: {
			ro: "Unde cerebrale alfa beta theta delta: ghid pe înțeles",
			en: "Brain waves alpha beta theta delta: a plain guide",
		},
		description: {
			ro: "Cele patru benzi EEG cu Hz, legate de stări de zi cu zi, de ce sursele dau cifre diferite și de ce nivelurile Focus nu sunt benzi.",
			en: "The four EEG bands with their Hz, tied to everyday states, why sources give different numbers, and why the Focus levels are not bands.",
		},
		keywords: {
			ro: [
				"unde cerebrale alfa beta theta delta",
				"unde cerebrale hz",
				"unde alfa creier",
				"unde theta ce sunt",
				"unde delta somn",
				"EEG benzi de frecvență",
			],
			en: [
				"brain waves alpha beta theta delta",
				"brain wave frequencies hz",
				"what are alpha waves",
				"what are theta waves",
				"delta waves sleep",
				"EEG frequency bands",
			],
		},
	},
	faq: [
		{
			q: {
				ro: "Ce frecvență au undele alfa, beta, theta și delta?",
				en: "What frequency are alpha, beta, theta and delta waves?",
			},
			a: {
				ro: "O împărțire des folosită dă delta 1–4 Hz, theta 4–8, alfa 8–13 și beta 13–30. Alte surse mută limitele: una dă alfa la 9–15 și beta la 15–30. Într-o analiză a 184 de studii, intervalele tipice erau puțin diferite și variau de la o lucrare la alta. Reține cifrele ca repere, nu ca granițe.",
				en: "A widely used division gives delta 1–4 Hz, theta 4–8, alpha 8–13 and beta 13–30. Other sources shift the edges: one gives alpha at 9–15 and beta at 15–30. In an analysis of 184 studies, the typical ranges were slightly different and varied from paper to paper. Keep the numbers as landmarks, not as borders.",
			},
		},
		{
			q: {
				ro: "Ce undă cerebrală apare când ești relaxat?",
				en: "Which brain wave appears when you are relaxed?",
			},
			a: {
				ro: "Alfa se asociază cu starea de veghe relaxată, cu ochii închiși. O lucrare despre somn spune că alfa e mai pronunțată cu ochii închiși și scade când îi deschizi sau când începi să aipești. Pe măsură ce somnul se adâncește, domină ritmurile mai lente. Starea ta e însă un amestec, nu o singură bandă.",
				en: "Alpha is linked to relaxed wakefulness with the eyes closed. A paper on sleep says alpha is more pronounced with the eyes closed and fades when you open them or begin to doze. As sleep deepens, slower rhythms dominate. Your state, however, is a mixture, not a single band.",
			},
		},
		{
			q: {
				ro: "Sunt nivelurile Focus același lucru cu alfa sau theta?",
				en: "Are the Focus levels the same as alpha or theta?",
			},
			a: {
				ro: "Nu. Nivelurile Focus sunt un sistem de etichete pentru stări ale conștiinței în metoda Monroe, de pildă Focus 10, „minte trează, corp adormit”. Paginile oficiale pe care le-am deschis nu asociază niciun număr Focus cu o bandă EEG sau cu un interval în Hz. Orice tabel de acest fel nu vine din ele.",
				en: "No. The Focus levels are a system of labels for states of consciousness in the Monroe method, for instance Focus 10, “mind awake, body asleep”. The official pages we opened do not link any Focus number to an EEG band or a Hz range. Any such table does not come from them.",
			},
		},
		{
			q: {
				ro: "Schimbă sunetele binaurale undele creierului?",
				en: "Do binaural beats change brain waves?",
			},
			a: {
				ro: "Nu e stabilit. O trecere în revistă din 2023, pe 14 studii EEG, a găsit 5 care susțin ideea că undele creierului urmează sunetul, 8 care o contrazic și una mixtă. Eșantioanele erau mici, între 4 și 47 de participanți. Autorii spun că întrebarea nu poate fi tranșată în acest moment.",
				en: "It is not settled. A 2023 review of 14 EEG studies found 5 supporting the idea that brain waves follow the sound, 8 contradicting it and one mixed. The samples were small, between 4 and 47 participants. The authors say the question cannot be settled at this point.",
			},
		},
		{
			q: {
				ro: "Este „theta” unda creativității?",
				en: "Is theta “the creativity wave”?",
			},
			a: {
				ro: "Așa se spune adesea, dar e o simplificare. Un tabel dintr-o lucrare de neurofeedback trece sub theta creativitatea și intuiția, dar și depresia, anxietatea și distractibilitatea. O bandă singură nu spune ce stare ai. Nu te autodiagnostica după undele cerebrale; dacă te îngrijorează ceva, vorbește cu un specialist.",
				en: "People often say so, but it is a simplification. A table in a neurofeedback paper lists, under theta, creativity and insight, but also depression, anxiety and distractibility. A band alone does not say what state you are in. Do not diagnose yourself by brain waves; if something worries you, talk to a professional.",
			},
		},
	],
	related: [
		"cum-functioneaza-hemi-sync-sunete-binaurale",
		"sunete-binaurale-ce-sunt-si-ce-nu-sunt",
		"nivelurile-focus-pe-intelees",
		"hemi-sync-stiinta-ce-spun-studiile",
	],
};
