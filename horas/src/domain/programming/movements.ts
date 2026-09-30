/**
 * Dicionário de movimentos do CrossFit da Nação: nome canônico, modalidade
 * (G ginástica · W levantamento/barra · M monoestrutural · O objetos: KB, DB,
 * medball, sandbag, trenó), família e — para barra — a carga "moderada" de
 * referência (Rx masculino, kg) usada para classificar leve/moderada/pesada.
 *
 * A ordem importa: as regras mais específicas vêm primeiro e "consomem" o
 * trecho casado (ex.: "burpee pull-up" não conta também como "pull-up").
 */
export type Modality = 'G' | 'W' | 'M' | 'O';
export type Family =
  | 'squat' | 'hinge' | 'press' | 'snatch' | 'clean' | 'jerk' | 'olympic-other'
  | 'pull' | 'push' | 'core' | 'inverted' | 'burpee' | 'jump' | 'lunge'
  | 'run' | 'row' | 'bike' | 'ski' | 'rope' | 'carry' | 'swing' | 'medball' | 'other';

export interface MovementDef {
  id: string;
  name: string;
  modality: Modality;
  family: Family;
  /** Carga moderada de referência (kg, Rx masculino) para barra. */
  refKg?: number;
  re: RegExp;
}

const m = (id: string, name: string, modality: Modality, family: Family, re: RegExp, refKg?: number): MovementDef =>
  ({ id, name, modality, family, re, refKg });

export const MOVEMENTS: MovementDef[] = [
  // ── Compostos que precisam vir antes das partes ────────────────────────
  m('man-maker', 'Man maker', 'O', 'burpee', /man[- ]?makers?/i),
  m('burpee-pull-up', 'Burpee pull-up', 'G', 'burpee', /burpee[s]?[- ]pull[- ]?ups?/i),
  m('burpee-box-jump', 'Burpee box jump over', 'G', 'burpee', /burpee[s]? box jump[s]?( over)?|bbjo/i),
  m('burpee-over-bar', 'Burpee over bar', 'G', 'burpee', /(lateral |bar[- ]facing )?burpee[s]? over (the )?(bar|barbell)|bar[- ]facing burpees?|\bbob\b|\bbfb\b/i),
  m('burpee-broad-jump', 'Burpee broad jump', 'G', 'burpee', /burpee[s]? broad jump/i),
  m('db-burpee', 'Burpee com DB', 'O', 'burpee', /(burpee[s]? over (the )?(db|dumbbell|dumbell|sand ?bag|ktb|kb))|db burpee|double db burpees?|dumbbell burpee|db burpee step[- ]?over/i),
  m('squat-thrust', 'Meio sugado (squat thrust)', 'G', 'burpee', /meio[- ]sugados?|squat thrusts?|half burpees?/i),
  m('burpee', 'Burpee', 'G', 'burpee', /burpees?|up[- ]downs?|sugados?/i),
  m('broad-jump', 'Broad jump', 'G', 'jump', /broad jumps?|salto horizontal/i),
  m('jump-squat', 'Jump squat', 'G', 'jump', /jump squats?|squat jumps?|agachamento com salto/i),
  m('jumping-jack', 'Polichinelo / jumping jack', 'G', 'jump', /jump(ing)? jacks?|polichinelos?/i),
  m('box-jump-over', 'Box jump over', 'G', 'jump', /box[- ]jump[- ]?overs?|\bbjo\b/i),
  m('box-jump', 'Box jump', 'G', 'jump', /box[- ]?jumps?|seated box jump/i),
  m('sdhp', 'Sumo deadlift high pull', 'W', 'olympic-other', /sumo deadlift high[- ]pulls?|\bsdhp\b/i, 34),
  m('db-snatch', 'DB snatch', 'O', 'snatch', /(alt(ernating)?\.? )?(hang )?(single[- ]arm )?(db|dumbbell|dumbell)s? (hang )?snatch(es)?|db snatches|dumbbell snatches/i),
  m('db-clean-jerk', 'DB clean and jerk / press', 'O', 'clean', /(db|dumbbell|dumbell)s? hang clean (and|&|to) (jerk|press|overhead)|single[- ]arm (db|dumbbell) hang clean and jerk|db hang clean and press/i),
  m('db-squat-clean', 'DB squat clean', 'O', 'clean', /(double )?(db|dumbbell|dumbell)s? (squat |hang power |hang )?clean/i),
  m('db-thruster', 'DB thruster', 'O', 'squat', /(double[- ])?(db|dumbbell|dumbell)s? thrusters?/i),
  m('db-press', 'DB press / push press', 'O', 'press', /(double[- ])?(db|dumbbell|dumbell)s? (push )?press(es)?|single[- ]arm (db )?push press|single[- ]db push press|db bench press|arnold press|db push jerk|single[- ]db push jerk|plate (push )?press/i),
  m('db-sto', 'DB shoulder to overhead', 'O', 'press', /(db|dumbbell)s? shoulder[- ]to[- ]overheads?/i),
  m('db-deadlift', 'DB/KB deadlift', 'O', 'hinge', /(db|dumbbell|kb|ktb|kettlebell)s? deadlifts?/i),
  m('devil-press', 'Devil press', 'O', 'burpee', /devil'?s? press(es)?/i),
  m('db-lunge', 'Lunge com carga (DB/KB/sandbag)', 'O', 'lunge', /(db|dumbbell|dumbell|kb|ktb|kettlebell|sand ?bag|plate|oh plate|double[- ]db|front[- ]rack)[^;]*lunges?|oh walking lunges?|overhead walking lunges?/i),
  m('barbell-lunge', 'Barbell lunge', 'W', 'lunge', /barbell (oh |overhead |front[- ]rack |back[- ]rack )?(walking )?lunges?|front[- ]rack (reverse )?lunges?|back[- ]rack (reverse )?lunges?/i, 43),
  m('step-up', 'Step-up / step-over (com carga)', 'O', 'lunge', /step[- ]?(ups?|overs?)|step up/i),
  m('goblet-squat', 'Goblet squat / DB squat', 'O', 'squat', /goblet squats?|(db|dumbbell|kb|ktb) (front )?squats?/i),
  m('kb-swing', 'Kettlebell swing', 'O', 'swing', /(american |russian |heavy russian |kb |ktb |kettlebell )(kettlebell |kb |ktb )?swings?|\bkbs\b|kettlebell swings?|ktb swings?|kb swings?/i),
  m('kb-sdhp', 'KB sumo deadlift high pull', 'O', 'olympic-other', /(kb|ktb|kettlebell) sdhp/i),
  m('carry', 'Carry (farmer / OH / suitcase)', 'O', 'carry', /farm(er)?s?[- ]?(carry|walk|hold)|suitcase carry|oh (plate )?(carry|walk)|overhead (plate )?(carry|walk)|front[- ]rack (carry|farm|hold)|front rack carry|bear hug/i),
  m('sled-pull', 'Sled pull', 'O', 'carry', /sled pulls?|puxada (de |do )?tren[óo]/i),
  m('sled', 'Sled push', 'O', 'carry', /sled/i),
  m('wall-ball', 'Wall ball', 'O', 'medball', /wall[- ]?balls?( shots?)?/i),
  m('medball-other', 'Medball (clean, run, slam)', 'O', 'medball', /med[- ]?ball|slam ball|sand ?bag (clean|press)/i),
  m('sandbag', 'Sandbag', 'O', 'other', /sand ?bag/i),

  // ── Levantamento olímpico e força (barra) ─────────────────────────────
  m('clean-and-jerk', 'Clean and jerk', 'W', 'clean', /(power |squat |hang |hang power )?clean (and|&) jerks?|\bc ?& ?j\b|\bhcj\b|clean and jerk/i, 61),
  m('squat-snatch', 'Squat snatch', 'W', 'snatch', /(hang |high hang |low hang )?squat snatch(es)?|hang squat snatch/i, 43),
  m('power-snatch', 'Power snatch', 'W', 'snatch', /(hang |high hang )?power snatch(es)?|touch[- ]and[- ]go power snatch/i, 43),
  m('snatch', 'Snatch (complexos e variações)', 'W', 'snatch', /\bsnatch(es)?\b(?! (deadlift|pull|high pull|balance|push press|grip|complex))|muscle snatch|snatch balance|snatch pull|snatch high pull|snatch deadlift/i, 43),
  m('squat-clean', 'Squat clean', 'W', 'clean', /(hang |high hang |low hang )?squat cleans?|hang squat cleans?/i, 61),
  m('power-clean', 'Power clean', 'W', 'clean', /(hang |high hang )?power cleans?/i, 61),
  m('clean', 'Clean (complexos e variações)', 'W', 'clean', /\bcleans?\b(?! (deadlift|pull|high pull))|muscle clean|clean pull|clean high pull|cluster/i, 61),
  m('stoh', 'Shoulder to overhead', 'W', 'jerk', /shoulder[- ]to[- ]overheads?|\bstoh\b|\bs2oh\b|\bsto\b/i, 52),
  m('push-jerk', 'Push jerk', 'W', 'jerk', /push jerks?/i, 61),
  m('split-jerk', 'Split jerk', 'W', 'jerk', /split jerks?/i, 61),
  m('jerk', 'Jerk', 'W', 'jerk', /\bjerks?\b/i, 61),
  m('thruster', 'Thruster', 'W', 'squat', /thrusters?/i, 43),
  m('ohs', 'Overhead squat', 'W', 'squat', /overhead squats?|over head squats?|\bohs\b/i, 43),
  m('front-squat', 'Front squat', 'W', 'squat', /front squats?/i, 61),
  m('back-squat', 'Back squat', 'W', 'squat', /back squats?/i, 84),
  m('push-press', 'Push press', 'W', 'press', /push press(es)?/i, 52),
  m('shoulder-press', 'Shoulder press', 'W', 'press', /shoulder press(es)?|strict press|z[- ]press|bench press/i, 43),
  m('deadlift', 'Deadlift', 'W', 'hinge', /(romanian |hand[- ]release |sumo )?deadlifts?|\bstiffs?\b/i, 100),
  m('good-morning', 'Good morning', 'W', 'hinge', /good morning/i, 43),
  m('curtis-p', 'Curtis P complex', 'W', 'clean', /curtis[- ]?p/i, 34),

  // ── Ginástica ─────────────────────────────────────────────────────────
  m('horizontal-row', 'Remada (TRX, argola, DB, barra)', 'G', 'pull', /remadas?|(trx|ring|argola) rows?|plank rows?/i),
  m('ring-muscle-up', 'Ring muscle-up', 'G', 'pull', /ring muscle[- ]ups?|\brmu\b/i),
  m('bar-muscle-up', 'Bar muscle-up', 'G', 'pull', /bar muscle[- ]ups?|\bbmu\b|bar m\.?u/i),
  m('muscle-up', 'Muscle-up', 'G', 'pull', /muscle[- ]ups?|\bmu\b/i),
  m('c2b', 'Chest-to-bar', 'G', 'pull', /chest[- ]to[- ]bar( pull[- ]?ups?)?|\bc2b\b|\bctb\b/i),
  m('rope-climb', 'Rope climb', 'G', 'pull', /(legless |leg less )?rope climbs?|legless|leg less/i),
  m('pull-up', 'Pull-up', 'G', 'pull', /(strict |kipping |weighted |jumping |butterfly |heavy strict )?pull[- ]?ups?|chin[- ]ups?|ring rows?/i),
  m('t2b', 'Toes-to-bar', 'G', 'core', /toes[- ]to[- ]bars?|\bt2b\b|\bttb\b/i),
  m('k2e', 'Knees-to-elbows / knee raise', 'G', 'core', /knees?[- ]to[- ]elbows?|\bkte\b|knee raises?|knees? to chest|leg raises?|feet raises?/i),
  m('hspu', 'Handstand push-up', 'G', 'inverted', /handstand push[- ]?ups?|hand stand push[- ]?ups?|\bhspu\b|pike push[- ]?ups?/i),
  m('hs-walk', 'Handstand walk / wall walk', 'G', 'inverted', /handstand walk|hand stand walk|\bhsw\b|wall walks?/i),
  m('dip', 'Dip', 'G', 'push', /(ring |box |strict )?dips?\b|tr[ií]ceps mergulho|mergulho/i),
  m('push-up', 'Push-up', 'G', 'push', /push[- ]?ups?|hand[- ]release|flex[ãa]o(?! plantar)( de bra[çc]os?)?/i),
  m('pistol', 'Pistol / single-leg squat', 'G', 'squat', /pistols?|single[- ]leg squats?|b[uú]lgaro|bulgarian split/i),
  m('air-squat', 'Air squat', 'G', 'squat', /air squats?|\bsquats?\b/i),
  m('lunge', 'Lunge (peso corporal)', 'G', 'lunge', /lunges?|afundos?/i),
  m('mountain-climber', 'Escalador / mountain climber', 'G', 'core', /mountain climbers?|escaladore?s?/i),
  m('bird-dog', 'Perdigueiro / bird dog', 'G', 'core', /perdigueiros?|bird[- ]dogs?/i),
  m('glute-bridge', 'Elevação pélvica / hip thrust', 'G', 'hinge', /eleva[çc][ãa]o (de )?pelve|eleva[çc][ãa]o p[ée]lvica|glute bridges?|hip thrusts?/i),
  m('sit-up', 'Sit-up / V-up / GHD', 'G', 'core', /\babd(ominal)?\b[^;]*|(abmat |ghd |synchronized |synchro |turkish )?sit[- ]?ups?|v[- ]?ups?|back extensions?|tuck[- ]?ups?/i),
  m('core-hold', 'Core isométrico (hollow, L-sit, prancha)', 'G', 'core', /hollow|l[- ]sit|plank|prancha|superman|flutter|russian twist|pallof|leg pike/i),

  // ── Monoestruturais ───────────────────────────────────────────────────
  m('double-under', 'Double-under / crossover', 'M', 'rope', /double[- ]?unders?|\bdu\b|d\.u\.?|crossovers?|cross over/i),
  m('single-under', 'Single-under', 'M', 'rope', /single[- ]?unders?|\bsu\b|s\.u\.?/i),
  m('shuttle-run', 'Shuttle run', 'M', 'run', /shuttle runs?/i),
  m('run', 'Corrida', 'M', 'run', /\brun\b|running|\bmile\b|\d+ ?m (run|sprint)|sprint|\bjog\b|corrida|tiro|trote/i),
  m('row', 'Remo', 'M', 'row', /\brow(ing)?\b(?! for load)|remo/i),
  m('bike', 'Bike', 'M', 'bike', /bike|echo|assault/i),
  m('ski', 'Ski', 'M', 'ski', /\bski\b|skierg/i),
];

export const MOVEMENT = Object.fromEntries(MOVEMENTS.map((d) => [d.id, d])) as Record<string, MovementDef>;

/** "pull-ups" em "barbell row", "bent over row" etc. não são remo. */
const NOT_ROW = /(barbell|bent over|renegade|ring|plate|db|dumbbell|kb|ktb|double db|supinated|low bar|unilateral|upright|trx|serrote) rows?/gi;

/**
 * Movimentos presentes num trecho de texto (um item de lista). Cada regra
 * consome o trecho casado, então compostos não contam em dobro.
 */
export function detectMovements(text: string): MovementDef[] {
  // Remada com implemento é padrão de puxada horizontal, não o ergômetro.
  let t = ` ${text.toLowerCase().replace(NOT_ROW, ' remada ')} `;
  const found: MovementDef[] = [];
  for (const def of MOVEMENTS) {
    const re = new RegExp(def.re.source, 'gi');
    if (re.test(t)) {
      found.push(def);
      t = t.replace(new RegExp(def.re.source, 'gi'), ' ');
    }
  }
  return found;
}

/**
 * Carga Rx masculina (kg) citada no trecho: "kg: 43/61", "29/43kg", "(35/50 kg)",
 * "95/135lb", "135/95 lb". Pega o maior número do par (masculino) e converte lb.
 */
export function detectLoadKg(text: string): number | null {
  const t = text.toLowerCase().replace(',', '.');
  const kg = t.match(/kg:?\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*kg/);
  if (kg) {
    const [a, b] = kg[1] ? [kg[1], kg[2]] : [kg[3], kg[4]];
    return Math.max(Number(a), Number(b));
  }
  const lb = t.match(/(\d+)\s*\/\s*(\d+)\s*lbs?\b/);
  if (lb) return Math.round(Math.max(Number(lb[1]), Number(lb[2])) * 0.4536);
  return null;
}

export type LoadClass = 'leve' | 'moderada' | 'pesada' | 'muito pesada';

/** Carga relativa à referência moderada do movimento. */
export function classifyLoad(def: MovementDef, kg: number): LoadClass | null {
  if (!def.refKg) return null;
  const r = kg / def.refKg;
  if (r < 0.8) return 'leve';
  if (r <= 1.15) return 'moderada';
  if (r <= 1.5) return 'pesada';
  return 'muito pesada';
}
