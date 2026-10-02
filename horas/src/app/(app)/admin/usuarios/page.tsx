import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/card';
import { can } from '@/server/auth/authz';
import { requirePrincipal } from '@/server/auth/session';
import { listRolesAndAreas, listUsers } from '@/server/services/user-service';
import { prisma } from '@/server/db';
import { UsersClient, type UserRow } from './UsersClient';

export const metadata: Metadata = { title: 'Usuários' };

export default async function UsuariosPage() {
  const principal = await requirePrincipal();
  if (!can(principal, 'admin.users')) redirect('/hoje');

  const [users, { roles, areas }, teachers] = await Promise.all([
    listUsers(principal), listRolesAndAreas(principal),
    prisma.teacher.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, email: true } }),
  ]);

  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    active: u.active,
    mustChangePassword: u.mustChangePassword,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    roleKeys: u.roles.map((r) => r.role.key),
    areaIds: u.areaScopes.map((s) => s.areaId),
    teacherId: u.teacher?.id ?? null,
    teacherName: u.teacher?.name ?? null,
    isSelf: u.id === principal.id,
  }));

  return (
    <>
      <PageHeader
        title="Usuários"
        description="Quem acessa o sistema, com qual papel e sobre quais áreas."
      />
      <UsersClient
        users={rows}
        roles={roles.map((r) => ({ key: r.key, name: r.name, description: r.description ?? '' }))}
        areas={areas.map((a) => ({ id: a.id, name: a.name, color: a.color }))}
        teachers={teachers.map((t) => ({ id: t.id, name: t.name, email: t.email }))}
      />
    </>
  );
}
