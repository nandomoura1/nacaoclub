import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/server/db';
import { AuthorizationError } from '@/server/errors';
import { contactsPage, importContacts, previewImport, saveContact, setContactActive } from '@/server/services/contacts-service';
import { META, ensureCatalog, hasDb, makeUser } from './helpers';

describe.skipIf(!hasDb)('Contatos', () => {
  let admin: Awaited<ReturnType<typeof makeUser>>;
  let coord: Awaited<ReturnType<typeof makeUser>>;
  let lider: Awaited<ReturnType<typeof makeUser>>;
  let prof: Awaited<ReturnType<typeof makeUser>>;
  let teacherId: string;

  beforeAll(async () => {
    await ensureCatalog();
    await prisma.contact.deleteMany();
    admin = await makeUser('ADMIN');
    coord = await makeUser('COORDENADOR');
    lider = await makeUser('LIDER');
    prof = await makeUser('PROFESSOR');
    teacherId = (await prisma.teacher.create({ data: { name: 'Contato Equipe Teste', phone: '61 97777-1234', team: 'ESCALA' } })).id;
  });
  afterAll(async () => {
    await prisma.contact.deleteMany();
    await prisma.teacher.delete({ where: { id: teacherId } }).catch(() => undefined);
  });

  it('cadastra, edita e desativa (só contacts.edit); professor não vê', async () => {
    await expect(saveContact(coord.principal, { name: 'X', groupName: 'Fornecedores' }, META)).rejects.toBeInstanceOf(AuthorizationError);
    await expect(contactsPage(prof.principal)).rejects.toBeInstanceOf(AuthorizationError);
    const id = await saveContact(admin.principal, { name: 'Loja Teste', groupName: 'Fornecedores', phone: '61 90000-1111' }, META);
    await saveContact(admin.principal, { id, name: 'Loja Teste', groupName: 'Fornecedores', phone: '61 90000-1111', note: 'manhã' }, META);
    expect((await contactsPage(coord.principal)).contacts.find((c) => c.id === id)?.note).toBe('manhã');
    await setContactActive(admin.principal, { id, active: false }, META);
    expect((await contactsPage(coord.principal)).contacts.some((c) => c.id === id)).toBe(false);
    expect((await contactsPage(admin.principal, { inactive: true })).contacts.some((c) => c.id === id)).toBe(true);
    await setContactActive(admin.principal, { id, active: true }, META);
    expect(await prisma.auditLog.count({ where: { entityId: id, entityType: 'contact' } })).toBe(4);
  });

  it('equipe com telefone só para quem tem teacher.view_personal', async () => {
    const c = await contactsPage(coord.principal);
    expect(c.team?.find((t) => t.id === teacherId)?.phone).toBe('61 97777-1234');
    const l = await contactsPage(lider.principal);
    expect(l.team).toBeNull();
    expect(JSON.stringify(l)).not.toContain('97777');
  });

  it('prévia marca o que já existe e o que é da equipe; importa só o confirmado', async () => {
    const p = await previewImport(admin.principal, { text: 'Loja Teste 61 98888-0000\nOutra Pessoa 61 97777-1234\nNovo Fornecedor 61 96666-0000', group: 'Fornecedores' });
    expect(p.rows.map((r) => r.status)).toEqual(['existe', 'equipe', 'novo']);
    await expect(importContacts(lider.principal, { rows: [p.rows[2]!] }, META)).rejects.toBeInstanceOf(AuthorizationError);
    const { status: _s, ...row } = p.rows[2]!;
    expect(await importContacts(admin.principal, { rows: [row] }, META)).toBe(1);
    expect((await contactsPage(admin.principal)).contacts.map((c) => c.name).sort()).toEqual(['Loja Teste', 'Novo Fornecedor']);
  });
});
