'use server';

import { getPrincipal } from '@/server/auth/session';
import { runAction, type ActionResult } from '@/server/action-result';
import type { TimerState } from '@/domain/timer';
import { commandTimer, timerState } from '@/server/services/tv-service';

type R = ActionResult<{ now: number; timer: TimerState | null }>;
export async function timerCommandAction(screenId: string, cmd: unknown): Promise<R> {
  return runAction(async () => commandTimer(await getPrincipal(), screenId, cmd));
}
export async function timerStateAction(screenId: string): Promise<R> {
  return runAction(async () => timerState(await getPrincipal(), screenId));
}
