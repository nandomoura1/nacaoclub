-- Contatos (Administração → Contatos): agenda de telefones importantes de fora do cadastro de
-- colaboradores (terceirizados, fornecedores, monitores, serviços). A equipe vem do próprio cadastro.
CREATE TABLE IF NOT EXISTS "contacts" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "group_name" TEXT NOT NULL,
    "company" TEXT,
    "phone" TEXT,
    "phone2" TEXT,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "contacts_active_group_idx" ON "contacts" ("active", "group_name");

INSERT INTO "permissions" ("id", "key", "description")
VALUES (gen_random_uuid(), 'contacts.view', 'Contatos: ver a agenda de telefones importantes (terceirizados, fornecedores, serviços)'),
       (gen_random_uuid(), 'contacts.edit', 'Contatos: cadastrar, editar, importar e desativar contatos da agenda')
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id" FROM "roles" r CROSS JOIN "permissions" p
WHERE (r."key" IN ('ADMIN', 'CONSULTA') AND p."key" IN ('contacts.view', 'contacts.edit'))
   OR (r."key" IN ('COORDENADOR', 'LIDER') AND p."key" = 'contacts.view')
ON CONFLICT DO NOTHING;
