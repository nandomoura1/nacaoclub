import type { Student } from '@prisma/client';
import type { Prisma, StudentStatus } from '@prisma/client';
import { prisma } from '@/server/db/prisma';
import { logger } from '@/lib/logger';
import { getTecnofitProvider, type TecnofitStudent } from '@/server/tecnofit';

/**
 * Projeção local do aluno.
 *
 * O Tecnofit continua sendo a fonte oficial. Guardamos localmente apenas o
 * necessário para: (a) mostrar o card em menos de dois segundos, mesmo se a
 * API estiver lenta, e (b) relacionar notas e eventos a uma entidade estável.
 *
 * Campos financeiros, CPF e endereço não são replicados — princípio da
 * minimização (LGPD, seção 40 do brief).
 */

/** Janela de frescor da projeção. Abaixo disso não incomodamos a API. */
const STALE_AFTER_MS = 15 * 60 * 1000;

function toStatus(s: TecnofitStudent['status']): StudentStatus {
  switch (s) {
    case 'ACTIVE': return 'ACTIVE';
    case 'INACTIVE': return 'INACTIVE';
    case 'SUSPENDED': return 'SUSPENDED';
    default: return 'UNKNOWN';
  }
}

export const StudentService = {
  /** Cria ou atualiza a projeção a partir de um payload já normalizado. */
  async upsertFromTecnofit(remote: TecnofitStudent): Promise<Student> {
    const data = {
      fullName: remote.fullName,
      firstName: remote.firstName ?? null,
      photoUrl: remote.photoUrl ?? null,
      status: toStatus(remote.status),
      planName: remote.planName ?? null,
      modalities: remote.modalities ?? [],
      memberSince: remote.memberSince ?? null,
      planExpiresAt: remote.planExpiresAt ?? null,
      syncedAt: new Date(),
      rawSnapshot: (remote.raw ?? null) as Prisma.InputJsonValue,
    };

    return prisma.student.upsert({
      where: { tecnofitStudentId: remote.externalId },
      create: { tecnofitStudentId: remote.externalId, ...data },
      update: data,
    });
  },

  /**
   * Garante que exista uma projeção para o ID externo.
   *
   * Se a API falhar e já tivermos o aluno em banco, devolvemos a projeção
   * antiga em vez de derrubar a ingestão — um card levemente desatualizado
   * é infinitamente melhor que nenhum card.
   */
  async ensureByExternalId(externalId: string): Promise<Student | null> {
    const local = await prisma.student.findUnique({ where: { tecnofitStudentId: externalId } });

    const isFresh = local?.syncedAt && Date.now() - local.syncedAt.getTime() < STALE_AFTER_MS;
    if (isFresh) return local;

    try {
      const remote = await getTecnofitProvider().getStudent(externalId);
      if (remote) return await this.upsertFromTecnofit(remote);
    } catch (err) {
      logger.warn('Falha ao buscar aluno no Tecnofit; usando projeção local', {
        externalId,
        error: (err as Error).message,
      });
    }

    if (local) return local;

    // Sem dado local nem remoto: registramos um esqueleto para não perder o
    // evento de catraca. O nome fica explicitamente marcado como pendente,
    // nunca inventado.
    logger.warn('Aluno desconhecido — projeção mínima criada', { externalId });
    return prisma.student.create({
      data: {
        tecnofitStudentId: externalId,
        fullName: `Aluno não identificado (${externalId})`,
        status: 'UNKNOWN',
      },
    });
  },

  async getById(id: string): Promise<Student | null> {
    return prisma.student.findUnique({ where: { id } });
  },

  /**
   * Busca global (seção 29). Procura primeiro na projeção local, que é
   * instantânea, e complementa com a API quando o resultado é magro.
   * CPF nunca é critério nem retorno.
   */
  async search(query: string, limit = 20): Promise<Student[]> {
    const q = query.trim();
    if (q.length < 2) return [];

    const local = await prisma.student.findMany({
      where: {
        OR: [
          { fullName: { contains: q, mode: 'insensitive' } },
          { tecnofitStudentId: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ lastSeenAt: 'desc' }, { fullName: 'asc' }],
      take: limit,
    });

    if (local.length >= 5) return local;

    try {
      const remote = await getTecnofitProvider().searchStudents(q, limit);
      const merged = [...local];
      for (const r of remote) {
        if (merged.some((m) => m.tecnofitStudentId === r.externalId)) continue;
        merged.push(await this.upsertFromTecnofit(r));
      }
      return merged.slice(0, limit);
    } catch (err) {
      logger.warn('Busca remota indisponível; resultado apenas local', {
        error: (err as Error).message,
      });
      return local;
    }
  },
};
