/**
 * Seed de DESENVOLVIMENTO.
 *
 * Regra do brief (seção 65): nenhum dado real. Tudo aqui é fictício e os
 * identificadores externos usam o prefixo SEED-/MOCK- para que jamais sejam
 * confundidos com dados vindos do Tecnofit.
 *
 * O seed é idempotente: rodar de novo não duplica nada.
 */
import { PrismaClient, type Role } from '@prisma/client';
import { hashPassword } from '../src/server/auth/password';

const prisma = new PrismaClient();

// Senha padrão apenas para ambiente local. Em produção os usuários são
// criados pelo ADMIN com senha própria.
const SENHA_DEV = 'nacao@2026';

const CATRACAS = [
  { name: 'Catraca Principal', location: 'Recepção', modalityLabel: null, ext: 'MOCK-AP-01' },
  { name: 'Catraca Nação Fit', location: 'Academia', modalityLabel: 'Nação Fit', ext: 'MOCK-AP-02' },
  { name: 'Catraca Futevôlei', location: 'Arena de Areia', modalityLabel: 'Futevôlei', ext: 'MOCK-AP-03' },
  { name: 'Catraca Beach Tennis', location: 'Arena de Areia', modalityLabel: 'Beach Tennis', ext: 'MOCK-AP-04' },
  { name: 'Catraca Tênis', location: 'Quadras', modalityLabel: 'Tênis', ext: 'MOCK-AP-05' },
  { name: 'Catraca Kids', location: 'Nação Kids', modalityLabel: 'Nação Kids', ext: 'MOCK-AP-06' },
];

async function main() {
  console.log('Semeando ambiente de desenvolvimento…\n');

  // ---------- Catracas ----------
  // Os IDs externos aqui casam com os do MockTecnofitProvider, o que faz o
  // poller resolver a catraca corretamente já na primeira execução.
  const catracas = [];
  for (const [i, c] of CATRACAS.entries()) {
    const catraca = await prisma.turnstile.upsert({
      where: { tecnofitAccessPointId: c.ext },
      create: {
        tecnofitAccessPointId: c.ext,
        name: c.name,
        location: c.location,
        modalityLabel: c.modalityLabel,
        displayOrder: i,
      },
      update: { name: c.name, location: c.location, modalityLabel: c.modalityLabel },
    });
    catracas.push(catraca);
  }
  console.log(`  ${catracas.length} catracas`);

  // ---------- Usuários ----------
  const senhaHash = await hashPassword(SENHA_DEV);

  const usuarios: Array<{ nome: string; email: string; papel: Role; catracaPadrao?: string }> = [
    { nome: 'Ana Administradora', email: 'admin@nacaoclub.dev', papel: 'ADMIN' },
    { nome: 'Gabriel Gestor', email: 'gestor@nacaoclub.dev', papel: 'GESTOR' },
    {
      nome: 'André Professor',
      email: 'professor@nacaoclub.dev',
      papel: 'PROFESSOR',
      catracaPadrao: 'Catraca Futevôlei',
    },
  ];

  for (const u of usuarios) {
    const padrao = u.catracaPadrao ? catracas.find((c) => c.name === u.catracaPadrao) : null;

    const user = await prisma.user.upsert({
      where: { email: u.email },
      create: {
        name: u.nome,
        email: u.email,
        passwordHash: senhaHash,
        role: u.papel,
        defaultTurnstileId: padrao?.id ?? null,
      },
      update: { name: u.nome, role: u.papel, defaultTurnstileId: padrao?.id ?? null },
    });

    // O professor enxerga só a catraca dele mais a arena de areia —
    // exatamente o cenário que o controle de permissão precisa provar.
    if (u.papel === 'PROFESSOR') {
      const autorizadas = catracas.filter((c) =>
        ['Catraca Futevôlei', 'Catraca Beach Tennis'].includes(c.name),
      );
      for (const c of autorizadas) {
        await prisma.userTurnstilePermission.upsert({
          where: { userId_turnstileId: { userId: user.id, turnstileId: c.id } },
          create: { userId: user.id, turnstileId: c.id },
          update: {},
        });
      }
    }
  }
  console.log(`  ${usuarios.length} usuários`);

  console.log('\nPronto. Credenciais de desenvolvimento:\n');
  for (const u of usuarios) {
    console.log(`  ${u.papel.padEnd(9)} ${u.email}  senha: ${SENHA_DEV}`);
  }
  console.log('\nOs alunos e eventos de catraca chegam pelo provider mock,');
  console.log('assim que o dashboard for aberto e o poller iniciar.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
