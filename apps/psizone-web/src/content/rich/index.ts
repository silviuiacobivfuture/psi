import { ADHD } from "./hub-adhd";
import { ADULTS } from "./hub-anxiety";
import { AUTISM } from "./hub-autism";
import { SENSORY_HUB } from "./hub-sensory";
import { SPEECH } from "./hub-speech";
import { TEENS } from "./hub-teens";
import { COUPLE, ONCOLOGY, STROKE } from "./hubs-adults";
import { SPORT } from "./hubs-sport";
import { EQ_SYNC, NEUROFEEDBACK, QEEG, TMS } from "./methods-neuro";
import { ABA, LOGOPEDIE, PSIHOTERAPIE, SENSORY } from "./methods-therapies";
import type { RichPage } from "./types";

/** Rich method pages by method id (`content/methods.ts`); a method without one keeps its draft layout. */
export const RICH_METHODS: Readonly<Record<string, RichPage>> = {
	"evaluare-qeeg": QEEG,
	neurofeedback: NEUROFEEDBACK,
	tms: TMS,
	"eq-sync": EQ_SYNC,
	aba: ABA,
	logopedie: LOGOPEDIE,
	psihoterapie: PSIHOTERAPIE,
	"integrare-neurosenzoriala": SENSORY,
};

/** Rich hub pages by hub id (`content/hubs.ts`); the other hubs keep the hub layout. */
export const RICH_HUBS: Readonly<Record<string, RichPage>> = {
	autism: AUTISM,
	adhd: ADHD,
	sensory: SENSORY_HUB,
	speech: SPEECH,
	teens: TEENS,
	adults: ADULTS,
	couple: COUPLE,
	stroke: STROKE,
	oncology: ONCOLOGY,
	sport: SPORT,
};
