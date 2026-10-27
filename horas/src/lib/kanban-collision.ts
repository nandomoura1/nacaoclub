import { closestCorners, pointerWithin, type CollisionDetection } from '@dnd-kit/core';

/**
 * Onde o cartão cai: o que está debaixo do ponteiro vence (um cartão, ou a
 * coluna — mesmo vazia). Só fora de qualquer coluna usa a proximidade dos
 * cantos. Sem isso, uma coluna vazia ao lado de uma cheia "perdia" o cartão
 * para o vizinho e ele voltava para a origem.
 */
export const kanbanCollision: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  if (within.length) {
    const cards = within.filter((c) => !String(c.id).startsWith('col:'));
    return cards.length ? cards : within;
  }
  return closestCorners(args);
};
