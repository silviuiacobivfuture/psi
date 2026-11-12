import type { ArticleInput } from "../../../schema";

export const article: ArticleInput = {
	slug: "frecventa-hz-bataie-binaurala-ce-inseamna",
	brand: "eqsync",
	topic: "sunet-si-creier",
	backlogNo: null,
	status: "draft",
	kind: "health",
	aiDrafted: true,
	draftedAt: "2026-11-12",
	author: null,
	reviewer: null,
	title: {
		ro: "Ce înseamnă frecvența în Hz la o bătaie binaurală",
		en: "What the Hz number means on a binaural beat",
	},
	standfirst: {
		ro: "O bătaie binaurală are două numere: tonul de bază (frecvența purtătoare) și bătaia, adică diferența dintre cele două urechi. Cifra din titlul unui clip e, de obicei, bătaia. 200 Hz într-o ureche și 210 Hz în cealaltă dau 10 Hz. O cifră nu e o promisiune.",
		en: "A binaural beat has two numbers: the base tone (the carrier) and the beat, the difference between the two ears. The number in a video title is usually the beat. 200 Hz in one ear and 210 Hz in the other give 10 Hz. A number is not a promise.",
	},
	body: [
		{
			type: "p",
			text: {
				ro: "Când vezi „10 Hz” sau „40 Hz” într-un titlu, cifra e aproape întotdeauna bătaia: diferența dintre tonurile din cele două urechi, nu înălțimea sunetului pe care îl auzi. Mai există un număr, ascuns în descriere: tonul de bază, numit frecvență purtătoare. Dacă în urechea stângă ajunge un ton de 200 Hz, iar în dreapta unul de 210 Hz, bătaia este de 10 Hz. Atât. Restul articolului arată cum citești aceste numere fără să te lași purtat de ele.",
				en: "When you see “10 Hz” or “40 Hz” in a title, the number is almost always the beat: the difference between the tones in the two ears, not the pitch of the sound you hear. There is a second number, hidden in the description: the base tone, called the carrier frequency. If a 200 Hz tone reaches the left ear and a 210 Hz tone the right, the beat is 10 Hz. That is all. The rest of this article shows how to read these numbers without being carried away by them.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Care e diferența dintre frecvența purtătoare și frecvența bătăii?",
				en: "What is the difference between the carrier frequency and the beat frequency?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Hertzul (Hz) măsoară câte vibrații are un sunet într-o secundă. Un ton de 200 Hz vibrează de 200 de ori pe secundă și îl auzi ca pe un sunet destul de jos, cam ca o notă joasă de pian. Acesta e tonul de bază, frecvența purtătoare: el este ce auzi efectiv. E purtătorul, ca un vehicul pe care urcă bătaia.",
				en: "The hertz (Hz) measures how many vibrations a sound has in one second. A 200 Hz tone vibrates 200 times a second and you hear it as a fairly low sound, something like a low piano note. This is the base tone, the carrier: it is what you actually hear. It is the carrier, like a vehicle the beat rides on.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Bătaia, în schimb, nu e un sunet. E o pulsație lentă pe care sistemul tău auditiv o construiește din diferența dintre cele două tonuri. Dacă una dintre urechi primește 200 Hz și cealaltă 210 Hz, diferența este 10 Hz, adică zece pulsații pe secundă. Gândește-te la ele ca la un tremur ușor al volumului, în interiorul capului, nu în cameră.",
				en: "The beat, by contrast, is not a sound. It is a slow pulse that your auditory system builds from the difference between the two tones. If one ear receives 200 Hz and the other 210 Hz, the difference is 10 Hz, ten pulses a second. Think of it as a faint tremor in the volume, inside the head, not in the room.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum calculezi bătaia? Un exemplu pas cu pas",
				en: "How do you calculate the beat? A worked example",
			},
		},
		{
			type: "p",
			text: {
				ro: "Scazi tonul mai mic din cel mai mare. Nu înmulți, nu aduni, nu faci medii. Iată trei exemple:",
				en: "You subtract the lower tone from the higher one. You do not multiply, add or average. Here are three examples:",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "stânga 200 Hz, dreapta 210 Hz: 210 minus 200 = 10 Hz;",
					en: "left 200 Hz, right 210 Hz: 210 minus 200 = 10 Hz;",
				},
				{
					ro: "stânga 250 Hz, dreapta 256 Hz: 256 minus 250 = 6 Hz;",
					en: "left 250 Hz, right 256 Hz: 256 minus 250 = 6 Hz;",
				},
				{
					ro: "stânga 320 Hz, dreapta 355 Hz: 355 minus 320 = 35 Hz, valoare folosită într-un studiu cu pacienți cu boala Parkinson.",
					en: "left 320 Hz, right 355 Hz: 355 minus 320 = 35 Hz, a value used in a study with Parkinson’s disease patients.",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "Observă ceva important: tonul pe care îl auzi (200, 250 sau 320 Hz) nu se schimbă cu cifra bătăii. Poți avea o bătaie de 10 Hz peste o purtătoare de 200 Hz sau de 400 Hz. Cele două numere sunt independente, iar un clip îți spune de obicei doar unul dintre ele.",
				en: "Notice something important: the tone you hear (200, 250 or 320 Hz) does not change with the beat number. You can have a 10 Hz beat over a 200 Hz carrier or a 400 Hz one. The two numbers are independent, and a clip usually tells you only one of them.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce benzi corespund cărei game de bătăi?",
				en: "Which bands map to which beat ranges?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Cifrele bătăii sunt legate de benzile undelor cerebrale, adică ritmurile activității electrice măsurate cu EEG. O trecere în revistă sistematică din 2023 folosește aceste intervale, aproximative, pentru studiile pe care le-a adunat:",
				en: "Beat numbers are tied to brainwave bands, the rhythms of electrical activity measured with EEG. A 2023 systematic review uses these approximate ranges for the studies it gathered:",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "delta: 1–4 Hz;",
					en: "delta: 1–4 Hz;",
				},
				{
					ro: "theta: 5–8 Hz;",
					en: "theta: 5–8 Hz;",
				},
				{
					ro: "alfa: 9–12 Hz;",
					en: "alpha: 9–12 Hz;",
				},
				{
					ro: "beta: 13–30 Hz;",
					en: "beta: 13–30 Hz;",
				},
				{
					ro: "gamma: peste 30 Hz (în analiza aceea, 32–48 Hz).",
					en: "gamma: above 30 Hz (in that analysis, 32–48 Hz).",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "Granițele diferă puțin de la un manual la altul și nu sunt linii drepte în creier. Contează mai ales ordinea: cifre mici pentru ritmuri lente, cifre mari pentru ritmuri rapide. Iar aceste etichete sunt ce folosesc cercetătorii ca să-și organizeze studiile, nu o rețetă: nu înseamnă că un sunet de 6 Hz îți aduce somnul. În cele 14 studii, bătăile în banda theta au fost cele mai folosite (zece studii), iar cele în banda delta apar în trei.",
				en: "The edges differ slightly from one textbook to another, and they are not straight lines in the brain. What matters is mostly the order: small numbers for slow rhythms, big numbers for fast ones. And these labels are what researchers use to organise their studies, not a recipe: they do not mean a 6 Hz sound brings sleep. Across those 14 studies, theta-band beats were the most used (ten studies), and delta-band beats appear in three.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "De ce bătăile merg mai bine la purtătoare joase?",
				en: "Why do beats work best at low carriers?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pentru că sistemul auditiv are limite. Aceeași trecere în revistă din 2023 rezumă trei reguli, pe care le atribuie unor lucrări mai vechi. Prima: tonurile trebuie să fie de cel mult 1000 Hz pentru ca bătaia să apară, fiindcă calea auditivă poate codifica undele doar până în jurul acestei valori. A doua: bătaia pare să se perceapă cel mai bine la purtătoare de aproximativ 400 Hz. A treia: diferența maximă dintre tonuri este de cel mult aproximativ 30 Hz; peste ea, cele două tonuri se aud separat, nu mai formează o bătaie.",
				en: "Because the auditory system has limits. The same 2023 review summarises three rules, which it attributes to older papers. First: the tones must be at most 1000 Hz for the beat to appear, because the auditory pathway can encode waves only up to around that value. Second: the beat seems to be perceived best at carriers of around 400 Hz. Third: the maximum difference between the tones is about 30 Hz; beyond it, the two tones are heard separately and no longer form a beat.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Asta explică de ce studiile folosesc purtătoare joase: 200, 250, 400, 500 Hz. Explică și de ce un titlu cu „40 Hz” merită puțină curiozitate. Peste 30 Hz ești deja la marginea a ceea ce analiza numește pragul de percepție, iar autorii semnalează un studiu care a depășit-o, cu 57,3 Hz. Gamma este, deci, cea mai greu de susținut dintre promisiuni, cel puțin ca bătaie binaurală.",
				en: "That explains why studies use low carriers: 200, 250, 400, 500 Hz. It also explains why a title with “40 Hz” deserves a little curiosity. Above 30 Hz you are already at the edge of what the analysis calls the perception threshold, and the authors point to one study that exceeded it, at 57.3 Hz. Gamma is thus the hardest promise to support, at least as a binaural beat.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "De ce o cifră într-un clip nu este o promisiune?",
				en: "Why is a number on a video not a promise?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Pentru că dovezile nu merg de la cifră la rezultat. Aceeași analiză a găsit 14 studii cu EEG: cinci în acord cu ideea că creierul urmează ritmul, opt contradictorii, unul mixt, cu metode foarte diferite. O meta-analiză din 2019 spune că direcția și mărimea efectului depind de frecvența folosită, de timpul de expunere și de momentul ascultării. Într-un experiment pe 32 de oameni, bătăile de 20 Hz au fost urmate de mai multe cuvinte reținute, iar cele de 5 Hz de mai puține. Aceeași metodă, cifre diferite, efecte în sensuri opuse.",
				en: "Because the evidence does not run from number to result. The same analysis found 14 EEG studies: five in line with the idea that the brain follows the rhythm, eight contradictory, one mixed, with very different methods. A 2019 meta-analysis says the direction and size of the effect depend on the frequency used, the time of exposure and the moment of listening. In an experiment with 32 people, 20 Hz beats were followed by more words remembered and 5 Hz beats by fewer. Same method, different numbers, effects in opposite directions.",
			},
		},
		{
			type: "p",
			text: {
				ro: "Mai e un lucru. Un titlu care promite „10 Hz pentru calm” sau „40 Hz pentru concentrare” îți spune ce vinde, nu ce a fost măsurat. O analiză din 2025 spune despre 40 Hz doar că pare promițător, cu variabilitate individuală și fără standardizare. Cifrele nu sunt rele; sunt incomplete. Fără purtătoare, volum, durată și un martor care să arate că ceva s-a întâmplat, o cifră este o etichetă.",
				en: "There is one more thing. A title promising “10 Hz for calm” or “40 Hz for focus” tells you what is being sold, not what was measured. A 2025 paper says of 40 Hz only that it looks promising, with individual variability and no standardisation. The numbers are not bad; they are incomplete. Without the carrier, the volume, the duration and a control showing that something happened, a number is a label.",
			},
		},
		{
			type: "quote",
			text: {
				ro: "Un număr într-un titlu îți spune ce se vinde. Nu îți spune ce se va întâmpla.",
				en: "A number in a title tells you what is being sold. It does not tell you what will happen.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Ce auzi, de fapt, la o bătaie de 10 Hz?",
				en: "What do you actually hear at a 10 Hz beat?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Auzi două tonuri jos și constante, câte unul în fiecare ureche, și, dacă totul merge, un fel de tremur lent în mijloc, de zece ori pe secundă. La cifre foarte mici, de pildă sub 1 Hz, pulsația se aude mai degrabă ca un val lent, care crește și scade. Dacă nu auzi nimic din toate acestea, verifică mai întâi căștile: stânga trebuie să fie în stânga, iar sunetul să fie stereo, nu mono, fiindcă efectul binaural cere un ton diferit în fiecare ureche. Volumul nu e remediul.",
				en: "You hear two low, steady tones, one in each ear, and, if all goes well, a kind of slow tremor in the middle, ten times a second. At very small numbers, say below 1 Hz, the pulse sounds more like a slow wave that swells and fades. If you hear none of this, check the headphones first: left must be on the left, and the sound must be stereo, not mono, because the binaural effect needs a different tone in each ear. Volume is not the remedy.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Și numerele de tip 432 Hz, sunt același lucru?",
				en: "And numbers like 432 Hz, are they the same thing?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Nu. Un număr ca 432 Hz descrie, de regulă, înălțimea unui ton sau acordajul unei muzici, adică ceva asemănător cu purtătoarea, nu cu bătaia. Nu are nimic de-a face cu diferența dintre urechi și nu îți spune ce face sunetul cu creierul tău. Dacă întâlnești cifra într-un titlu, pune aceeași întrebare ca mai sus: ce este, ce s-a măsurat, față de ce a fost comparat. Avem un articol separat despre această cifră.",
				en: "No. A number like 432 Hz usually describes the pitch of a tone or the tuning of a piece of music, which is closer to the carrier than to the beat. It has nothing to do with the difference between the ears and does not tell you what the sound does to your brain. If you meet the number in a title, ask the same questions as above: what is it, what was measured, what was it compared with. We have a separate article about this figure.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum citești descrierea unei piste?",
				en: "How do you read a track description?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Ia descrierea ca pe o etichetă de aliment: caută ce scrie mic. O descriere serioasă îți dă, în cel mai bun caz, patru lucruri:",
				en: "Read the description like a food label: look for the small print. A serious description gives you, at best, four things:",
			},
		},
		{
			type: "list",
			items: [
				{
					ro: "purtătoarea (în ce ton se aude, de pildă 250 Hz);",
					en: "the carrier (which tone you hear, for instance 250 Hz);",
				},
				{
					ro: "bătaia sau intervalul ei (de pildă 6 Hz, sau o coborâre de la 10 la 6 Hz);",
					en: "the beat or its range (for instance 6 Hz, or a descent from 10 to 6 Hz);",
				},
				{
					ro: "durata și dacă sunetul pornește și se stinge treptat;",
					en: "the duration and whether the sound starts and fades gradually;",
				},
				{
					ro: "ce se promite și dacă apare o trimitere la un studiu real, cu numele cercetătorilor.",
					en: "what is promised and whether it points to a real study, with the researchers’ names.",
				},
			],
		},
		{
			type: "p",
			text: {
				ro: "Dacă purtătoarea lipsește, nu poți verifica nimic. Dacă bătaia depășește 30 Hz, întreabă-te ce anume se aude. Dacă piesa promite „vindecare”, „transformare” sau „rezultate garantate”, închide pagina. Iar dacă ți se cere să ridici volumul „ca să se simtă bătaia”, nu o face: volumul unei conversații liniștite este reperul, iar institutul american pentru surditate spune că sunetele sub 70 dBA sunt puțin probabil să facă rău.",
				en: "If the carrier is missing, you cannot check anything. If the beat exceeds 30 Hz, ask yourself what is actually being heard. If the track promises “cure”, “transformation” or “guaranteed results”, close the page. And if you are told to raise the volume “so you feel the beat”, do not: the volume of a quiet conversation is the guide, and the US deafness institute says sounds at or below 70 dBA are unlikely to cause harm.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Cum se aud, concret, aceste numere în EQ-SYNC?",
				en: "How do these numbers sound, in practice, in EQ-SYNC?",
			},
		},
		{
			type: "p",
			text: {
				ro: "Eșantionul de două minute al programului descrie simplu ce vei auzi: câte un ton jos în fiecare ureche, care se apropie încet. Diferența dintre ele pornește de la 10 pulsații pe secundă și coboară spre 6 în cele două minute. Dedesubt, un sunet de valuri depărtate. Începe în liniște și se stinge la fel. Fără promisiuni, doar numerele spuse pe față. Ai nevoie de căști, pentru că efectul binaural cere un ton diferit în fiecare ureche; EQ-SYNC este un instrument de wellness, nu un dispozitiv medical, și nu este pentru persoanele cu epilepsie sau afecțiuni convulsive.",
				en: "The programme’s two-minute sample describes plainly what you will hear: a low tone in each ear, slowly drawing closer. The difference between them starts at 10 pulses a second and descends towards 6 over the two minutes. Beneath it, the sound of distant waves. It begins quietly and ends the same way. No promises, just the numbers stated openly. You need headphones, because the binaural effect needs a different tone in each ear; EQ-SYNC is a wellness tool, not a medical device, and it is not for people with epilepsy or seizure disorders.",
			},
		},
		{
			type: "h2",
			text: {
				ro: "Pasul următor",
				en: "The next step",
			},
		},
		{
			type: "p",
			text: {
				ro: "Ia un clip pe care l-ai salvat și caută în descriere purtătoarea și bătaia. Scade-le, ca în exemplul cu 200 și 210 Hz. Dacă una dintre cifre lipsește, ai aflat ceva despre clip. Pentru o pistă a cărei descriere îți spune totul pe față, începe cu eșantionul de două minute din programul gratuit EQ-SYNC.",
				en: "Take a clip you have saved and look in its description for the carrier and the beat. Subtract them, as in the 200 and 210 Hz example. If one of the numbers is missing, you have learned something about the clip. For a track whose description tells you everything openly, begin with the two-minute sample in the free EQ-SYNC programme.",
			},
		},
	],
	sources: [
		{
			label: {
				ro: "Ingendoh și colab., 2023: bătăi binaurale și activitatea creierului, trecere în revistă sistematică (PLoS One)",
				en: "Ingendoh et al., 2023: binaural beats and brain activity, systematic review (PLoS One)",
			},
			href: "https://doi.org/10.1371/journal.pone.0286023",
		},
		{
			label: {
				ro: "Garcia-Argibay și colab., 2019: meta-analiză despre cogniție, anxietate și durere (Psychological Research)",
				en: "Garcia-Argibay et al., 2019: meta-analysis on cognition, anxiety and pain (Psychological Research)",
			},
			href: "https://pubmed.ncbi.nlm.nih.gov/30073406/",
		},
		{
			label: {
				ro: "Garcia-Argibay și colab., 2019: bătăi binaurale beta și theta și memoria de lungă durată (Psychological Research)",
				en: "Garcia-Argibay et al., 2019: beta and theta binaural beats and long-term memory (Psychological Research)",
			},
			href: "https://pubmed.ncbi.nlm.nih.gov/29222722/",
		},
		{
			label: {
				ro: "Calvano și colab., 2023: stimulare binaurală la pacienți cu boala Parkinson (Frontiers in Neurology)",
				en: "Calvano et al., 2023: binaural stimulation in patients with Parkinson’s disease (Frontiers in Neurology)",
			},
			href: "https://pubmed.ncbi.nlm.nih.gov/37213909/",
		},
		{
			label: {
				ro: "Fan și colab., 2024: bătăi de 0,25 Hz pe purtătoare de 250 Hz (Scientific Reports)",
				en: "Fan et al., 2024: 0.25 Hz beats on a 250 Hz carrier (Scientific Reports)",
			},
			href: "https://pubmed.ncbi.nlm.nih.gov/39478090/",
		},
		{
			label: {
				ro: "Jiao, 2025: muzică, antrenarea undelor cerebrale și biofeedback (Frontiers in Digital Health)",
				en: "Jiao, 2025: music, brainwave entrainment and biofeedback (Frontiers in Digital Health)",
			},
			href: "https://pubmed.ncbi.nlm.nih.gov/40070544/",
		},
		{
			label: {
				ro: "NIDCD: pierderea auzului cauzată de zgomot",
				en: "NIDCD: noise-induced hearing loss",
			},
			href: "https://www.nidcd.nih.gov/health/noise-induced-hearing-loss",
		},
	],
	provenance: [
		"https://doi.org/10.1371/journal.pone.0286023 (full text via Europe PMC: carrier at most 1000 Hz; best perceived around 400 Hz; maximum difference about 30 Hz; carriers 200-550 Hz in included studies; band ranges delta 1-4, theta 5-8, alpha 9-12, beta 13-30, gamma 32-48 Hz; 57.3 Hz study exceeding threshold; 14 studies: 5 / 8 / 1)",
		"https://pubmed.ncbi.nlm.nih.gov/30073406/ (22 studies; direction and magnitude depend on frequency used, time under exposure and timing)",
		"https://pubmed.ncbi.nlm.nih.gov/29222722/ (32 participants; beta 20 Hz better recall, theta 5 Hz worse recall)",
		"https://pubmed.ncbi.nlm.nih.gov/37213909/ (35 Hz beat, left 320 Hz, right 355 Hz, Parkinson's disease)",
		"https://pubmed.ncbi.nlm.nih.gov/39478090/ (250 Hz carrier, 0.25 Hz beats)",
		"https://pubmed.ncbi.nlm.nih.gov/38629490/ (100 Hz carrier, 0-3 Hz difference)",
		"https://pubmed.ncbi.nlm.nih.gov/40070544/ (gamma 30-100 Hz, 40 Hz promising with variability and lack of standardisation)",
		"https://www.nidcd.nih.gov/health/noise-induced-hearing-loss (70 dBA unlikely to cause loss)",
		"apps/eqsync-web/messages/ro.json: sample_heard (sample starts at 10 pulses per second and descends towards 6 over two minutes), sample_title, hint_sample, faq_1_a, footer_disclaimer",
		"docs/brands/writing-voice.md: claim rules",
	],
	seo: {
		title: {
			ro: "Frecvență Hz bătăi binaurale: purtătoare și bătaie explicate",
			en: "Binaural beat frequency Hz: carrier and beat explained",
		},
		description: {
			ro: "Frecvență Hz la bătăi binaurale: diferența dintre purtătoare și bătaie, exemplul 200 și 210 Hz, benzile undelor și cum citești descrierea unei piste.",
			en: "Binaural beat frequency in Hz: carrier versus beat, the 200 and 210 Hz example, brainwave bands and how to read a track description.",
		},
		keywords: {
			ro: [
				"frecvență Hz bătăi binaurale",
				"frecvență purtătoare bătaie binaurală",
				"cum se calculează bătaia binaurală",
				"bătăi binaurale 10 Hz",
				"bătăi binaurale 40 Hz",
				"benzi unde cerebrale Hz",
			],
			en: [
				"binaural beat frequency Hz",
				"carrier frequency binaural beat",
				"how to calculate a binaural beat",
				"10 Hz binaural beats",
				"40 Hz binaural beats",
				"brainwave bands Hz",
			],
		},
	},
	faq: [
		{
			q: {
				ro: "Ce înseamnă Hz la bătăile binaurale?",
				en: "What does Hz mean for binaural beats?",
			},
			a: {
				ro: "Hertzul măsoară câte vibrații sau pulsații are ceva într-o secundă. La bătăile binaurale apar două cifre: frecvența purtătoare, adică tonul de bază pe care îl auzi, și frecvența bătăii, adică diferența dintre cele două urechi. Cifra din titlul unui clip este, de obicei, bătaia.",
				en: "The hertz measures how many vibrations or pulses something has in a second. Binaural beats involve two numbers: the carrier frequency, the base tone you hear, and the beat frequency, the difference between the two ears. The number in a clip’s title is usually the beat.",
			},
		},
		{
			q: {
				ro: "Cum calculez frecvența unei bătăi binaurale?",
				en: "How do I calculate the frequency of a binaural beat?",
			},
			a: {
				ro: "Scazi tonul mai mic din cel mai mare. Dacă urechea stângă primește 200 Hz, iar cea dreaptă 210 Hz, bătaia este 210 minus 200, adică 10 Hz. Nu se adună și nu se fac medii. Tonul pe care îl auzi rămâne 200 sau 210 Hz.",
				en: "You subtract the lower tone from the higher. If the left ear receives 200 Hz and the right ear 210 Hz, the beat is 210 minus 200, which is 10 Hz. You do not add or average. The tone you hear stays 200 or 210 Hz.",
			},
		},
		{
			q: {
				ro: "Ce frecvență e potrivită pentru calm sau somn?",
				en: "Which frequency suits calm or sleep?",
			},
			a: {
				ro: "Nu există o cifră dovedită. În analiza sistematică pe care o citim, cele mai folosite bătăi au fost cele în banda theta, între 5 și 8 Hz, urmate de delta, între 1 și 4 Hz. Studiile arată rezultate amestecate și diferă de la om la om, deci cifra nu e o promisiune.",
				en: "There is no proven number. In the systematic review we read, the most used beats were in the theta band, between 5 and 8 Hz, followed by delta, between 1 and 4 Hz. Studies show mixed results and differ from person to person, so the number is not a promise.",
			},
		},
		{
			q: {
				ro: "De ce bătăile binaurale folosesc tonuri joase?",
				en: "Why do binaural beats use low tones?",
			},
			a: {
				ro: "O trecere în revistă sistematică spune că tonurile trebuie să fie de cel mult 1000 Hz pentru ca bătaia să apară și că ea se percepe cel mai bine în jur de 400 Hz. Diferența dintre tonuri nu poate depăși aproximativ 30 Hz, altfel urechea le aude separat.",
				en: "A systematic review says the tones must be at most 1000 Hz for the beat to appear and that it is perceived best around 400 Hz. The difference between tones cannot exceed about 30 Hz, otherwise the ear hears them separately.",
			},
		},
		{
			q: {
				ro: "Merită să caut pistele de 40 Hz?",
				en: "Is it worth looking for 40 Hz tracks?",
			},
			a: {
				ro: "Nu există dovezi solide. Peste aproximativ 30 Hz ești la marginea a ceea ce urechea mai percepe ca bătaie, iar o lucrare din 2025 spune doar că 40 Hz pare promițător, cu variabilitate individuală și fără standardizare. Dacă ești curios, ascultă încet și oprește dacă te doare capul.",
				en: "There is no solid evidence. Above about 30 Hz you are at the edge of what the ear still perceives as a beat, and a 2025 paper says only that 40 Hz looks promising, with individual variability and no standardisation. If you are curious, listen quietly and stop if your head hurts.",
			},
		},
		{
			q: {
				ro: "Pot asculta bătăi binaurale fără căști?",
				en: "Can I listen to binaural beats without headphones?",
			},
			a: {
				ro: "Nu, ai nevoie de căști. Efectul binaural depinde de faptul că fiecare ureche primește un ton diferit, iar difuzoarele amestecă tonurile în cameră. Persoanele cu epilepsie sau afecțiuni convulsive nu le folosesc fără acordul medicului.",
				en: "No, you need headphones. The binaural effect depends on each ear receiving a different tone, and speakers mix the tones in the room. People with epilepsy or seizure disorders do not use them without their doctor’s agreement.",
			},
		},
	],
	related: [
		"cum-creeaza-creierul-bataia-binaurala",
		"unde-cerebrale-alfa-beta-theta-delta-gamma",
		"frecventa-432-hz-mit-sau-realitate",
		"ce-sunt-bataile-binaurale",
	],
};
