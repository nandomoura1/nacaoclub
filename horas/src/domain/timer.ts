/**
 * Cronômetro de aula (TV do box). Regra pura: dado o timer programado e o tempo
 * decorrido desde o "Iniciar" (descontadas as pausas), diz o que a TV mostra.
 * A TV calcula a partir do horário de início guardado no servidor — se a rede oscila,
 * o tempo não atrasa.
 */

export type TimerKind = 'FOR_TIME' | 'AMRAP' | 'EMOM' | 'INTERVAL' | 'COUNTDOWN';

export interface TimerConfig {
  kind: TimerKind;
  /** FOR_TIME: time cap (0 = sem cap). AMRAP/COUNTDOWN: duração. */
  durationSec: number;
  /** EMOM: duração de cada minuto/intervalo. INTERVAL: tempo de trabalho. */
  workSec: number;
  /** INTERVAL: descanso. */
  restSec: number;
  /** EMOM/INTERVAL: quantidade de rounds. */
  rounds: number;
  /** Contagem antes de começar ("3, 2, 1, vai!"). */
  leadInSec: number;
  /** Nome que aparece na TV (ex.: "WOD", "Tabata"). */
  label: string;
}

export const TIMER_KINDS: { id: TimerKind; label: string; hint: string }[] = [
  { id: 'FOR_TIME', label: 'For Time', hint: 'Conta para cima até o time cap.' },
  { id: 'AMRAP', label: 'AMRAP', hint: 'Contagem regressiva: o máximo de rounds no tempo.' },
  { id: 'EMOM', label: 'EMOM', hint: 'A cada X segundos, por N rounds.' },
  { id: 'INTERVAL', label: 'Tabata / intervalado', hint: 'Trabalho e descanso por N rounds (Tabata = 20s/10s × 8).' },
  { id: 'COUNTDOWN', label: 'Regressivo', hint: 'Contagem regressiva simples (descanso, prancha, etc.).' },
];

export const kindLabel = (k: TimerKind) => TIMER_KINDS.find((t) => t.id === k)?.label ?? k;

const clampInt = (n: unknown, min: number, max: number, dflt: number) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : dflt;
};

/** Normaliza o que vem da tela (limites sensatos para aula). */
export function normalizeTimer(raw: Partial<TimerConfig> & { kind: TimerKind }): TimerConfig {
  const kind = TIMER_KINDS.some((t) => t.id === raw.kind) ? raw.kind : 'COUNTDOWN';
  return {
    kind,
    durationSec: clampInt(raw.durationSec, kind === 'FOR_TIME' ? 0 : 5, 3 * 3600, 600),
    workSec: clampInt(raw.workSec, 5, 3600, kind === 'EMOM' ? 60 : 20),
    restSec: clampInt(raw.restSec, 0, 3600, 10),
    rounds: clampInt(raw.rounds, 1, 200, kind === 'EMOM' ? 10 : 8),
    leadInSec: clampInt(raw.leadInSec, 0, 30, 10),
    label: String(raw.label ?? '').trim().slice(0, 40) || kindLabel(kind),
  };
}

/** Duração total do treino (sem a contagem inicial). null = For Time sem cap. */
export function timerTotalSec(c: TimerConfig): number | null {
  switch (c.kind) {
    case 'FOR_TIME': return c.durationSec > 0 ? c.durationSec : null;
    case 'AMRAP': case 'COUNTDOWN': return c.durationSec;
    case 'EMOM': return c.workSec * c.rounds;
    case 'INTERVAL': return (c.workSec + c.restSec) * c.rounds - c.restSec;
  }
}

export type Phase = 'READY' | 'LEAD' | 'WORK' | 'REST' | 'DONE';
export interface Frame {
  phase: Phase;
  /** Número grande na TV (mm:ss, ou h:mm:ss acima de 1 h; na contagem inicial, só os segundos). */
  clock: string;
  round: number | null;
  rounds: number | null;
  /** Texto curto embaixo do relógio ("Round 3 de 10", "Descanso", "TIME CAP"). */
  caption: string;
  /** 0–1 do trecho atual (barra de progresso). */
  progress: number;
}

export function fmtClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const mm = String(m).padStart(h ? 2 : 2, '0'), ss = String(r).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * O que a TV mostra com `elapsedMs` decorridos desde o Iniciar (null = ainda não iniciado).
 * Contagens regressivas arredondam para cima (mostra 0:01 até o último segundo acabar).
 */
export function timerFrame(c: TimerConfig, elapsedMs: number | null): Frame {
  const total = timerTotalSec(c);
  if (elapsedMs === null) {
    const show = c.kind === 'FOR_TIME' ? 0 : c.kind === 'EMOM' || c.kind === 'INTERVAL' ? c.workSec : c.durationSec;
    const rounds = c.kind === 'EMOM' || c.kind === 'INTERVAL' ? c.rounds : null;
    return { phase: 'READY', clock: fmtClock(show), round: null, rounds, caption: describeTimer(c), progress: 0 };
  }
  const lead = c.leadInSec * 1000;
  if (elapsedMs < lead) {
    return { phase: 'LEAD', clock: String(Math.ceil((lead - elapsedMs) / 1000)), round: null, rounds: null, caption: 'Prepare-se', progress: elapsedMs / lead };
  }
  const t = (elapsedMs - lead) / 1000;
  const up = (sec: number) => fmtClock(sec);
  const down = (sec: number) => fmtClock(Math.ceil(sec - 1e-9));
  if (total !== null && t >= total) {
    return { phase: 'DONE', clock: c.kind === 'FOR_TIME' ? up(total) : '00:00', round: null, rounds: null, caption: c.kind === 'FOR_TIME' || c.kind === 'AMRAP' ? 'TIME CAP' : 'Fim!', progress: 1 };
  }
  switch (c.kind) {
    case 'FOR_TIME':
      return { phase: 'WORK', clock: up(t), round: null, rounds: null, caption: total ? `Time cap ${fmtClock(total)}` : 'For Time', progress: total ? t / total : 0 };
    case 'AMRAP': case 'COUNTDOWN':
      return { phase: 'WORK', clock: down(c.durationSec - t), round: null, rounds: null, caption: c.kind === 'AMRAP' ? `AMRAP ${fmtClock(c.durationSec)}` : c.label, progress: t / c.durationSec };
    case 'EMOM': {
      const round = Math.floor(t / c.workSec) + 1;
      const within = t - (round - 1) * c.workSec;
      return { phase: 'WORK', clock: down(c.workSec - within), round, rounds: c.rounds, caption: `Round ${round} de ${c.rounds}`, progress: within / c.workSec };
    }
    case 'INTERVAL': {
      const cycle = c.workSec + c.restSec;
      const round = Math.floor(t / cycle) + 1;
      const within = t - (round - 1) * cycle;
      if (within < c.workSec) return { phase: 'WORK', clock: down(c.workSec - within), round, rounds: c.rounds, caption: `Trabalho · round ${round} de ${c.rounds}`, progress: within / c.workSec };
      return { phase: 'REST', clock: down(cycle - within), round, rounds: c.rounds, caption: `Descanso · próximo: round ${round + 1}`, progress: (within - c.workSec) / c.restSec };
    }
  }
}

/** Resumo curto ("AMRAP 12:00", "EMOM 10 × 1:00", "Tabata 8 × 0:20/0:10"). */
export function describeTimer(c: TimerConfig): string {
  switch (c.kind) {
    case 'FOR_TIME': return c.durationSec ? `For Time · cap ${fmtClock(c.durationSec)}` : 'For Time · sem cap';
    case 'AMRAP': return `AMRAP ${fmtClock(c.durationSec)}`;
    case 'COUNTDOWN': return `${c.label} ${fmtClock(c.durationSec)}`;
    case 'EMOM': return `EMOM ${c.rounds} × ${fmtClock(c.workSec)}`;
    case 'INTERVAL': return `${c.label} ${c.rounds} × ${fmtClock(c.workSec)}/${fmtClock(c.restSec)}`;
  }
}

/**
 * Sugere o timer a partir de um bloco do treino ("AMRAP 12'", "EMOM 10", "For time · cap 15",
 * "Tabata"). Sem pista clara → null (o professor programa à mão).
 */
export function suggestTimer(b: { kind?: string; title: string | null; format: string | null; timeCapMin: number | null; durationMin: number | null; content?: string | null }): TimerConfig | null {
  const text = [b.format, b.title, (b.content ?? '').split('\n').slice(0, 3).join(' ')].filter(Boolean).join(' ').toLowerCase();
  const num = (re: RegExp) => { const m = text.match(re); return m ? Number(m[1]) : null; };
  const label = b.kind === 'WOD' ? 'WOD' : (b.title ?? '').slice(0, 40);
  if (/tabata/.test(text)) return normalizeTimer({ kind: 'INTERVAL', workSec: 20, restSec: 10, rounds: 8, label: 'Tabata' });
  if (/amrap/.test(text)) {
    const min = num(/amrap\s*(?:de\s*)?(\d{1,3})/) ?? b.timeCapMin ?? b.durationMin;
    return min ? normalizeTimer({ kind: 'AMRAP', durationSec: min * 60, label: label || 'AMRAP' }) : null;
  }
  if (/e\d?mom|every\s+minute/.test(text)) {
    const every = num(/e(\d)mom/) ?? 1;
    const min = num(/e\d?mom\s*(?:de\s*|x\s*)?(\d{1,3})/) ?? b.timeCapMin ?? b.durationMin;
    return min ? normalizeTimer({ kind: 'EMOM', workSec: every * 60, rounds: Math.max(1, Math.floor(min / every)), label: label || 'EMOM' }) : null;
  }
  if (/for\s*time|por\s*tempo|rft|rounds?\s+for\s+time/.test(text) || b.timeCapMin) {
    const cap = b.timeCapMin ?? num(/cap\s*(?:de\s*)?(\d{1,3})/);
    return normalizeTimer({ kind: 'FOR_TIME', durationSec: (cap ?? 0) * 60, label: label || 'For Time' });
  }
  return null;
}

// ── Estado do timer de uma TV (guardado no banco) ─────────────

export interface TimerState {
  config: TimerConfig;
  /** ms epoch do Iniciar; null = programado, esperando Iniciar. */
  startedAt: number | null;
  /** ms epoch da pausa em andamento. */
  pausedAt: number | null;
  /** Soma das pausas já encerradas. */
  pausedMs: number;
  /** Cronômetro em tela cheia (WOD pequeno). */
  full: boolean;
  /** Muda a cada comando (a TV usa para tocar o bipe de início etc.). */
  rev: number;
}

export function elapsedOf(s: TimerState, now: number): number | null {
  if (s.startedAt === null) return null;
  return Math.max(0, (s.pausedAt ?? now) - s.startedAt - s.pausedMs);
}

export type TimerCommand =
  | { type: 'program'; config: TimerConfig }
  | { type: 'start' } | { type: 'pause' } | { type: 'resume' } | { type: 'reset' }
  | { type: 'full'; on: boolean } | { type: 'clear' };

/** Aplica um comando do controle (celular do professor). `null` = sem timer na TV. */
export function applyTimer(s: TimerState | null, cmd: TimerCommand, now: number): TimerState | null {
  if (cmd.type === 'clear') return null;
  if (cmd.type === 'program') return { config: cmd.config, startedAt: null, pausedAt: null, pausedMs: 0, full: s?.full ?? false, rev: (s?.rev ?? 0) + 1 };
  if (!s) return null;
  const rev = s.rev + 1;
  switch (cmd.type) {
    case 'start': return { ...s, startedAt: now, pausedAt: null, pausedMs: 0, rev };
    case 'pause': return s.startedAt !== null && s.pausedAt === null ? { ...s, pausedAt: now, rev } : s;
    case 'resume': return s.pausedAt !== null ? { ...s, pausedMs: s.pausedMs + (now - s.pausedAt), pausedAt: null, rev } : s;
    case 'reset': return { ...s, startedAt: null, pausedAt: null, pausedMs: 0, rev };
    case 'full': return { ...s, full: cmd.on, rev };
  }
}
