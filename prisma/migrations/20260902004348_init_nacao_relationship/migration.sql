-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PROFESSOR', 'GESTOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AccessEventType" AS ENUM ('ENTRY', 'EXIT', 'DENIED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AccessEventSource" AS ENUM ('WEBHOOK', 'POLLING', 'MANUAL', 'SEED');

-- CreateEnum
CREATE TYPE "NoteCategory" AS ENUM ('OBJETIVO', 'PREFERENCIA', 'TREINAMENTO', 'RELACIONAMENTO', 'ATENDIMENTO', 'COMERCIAL', 'EVENTO', 'CONQUISTA', 'FEEDBACK', 'OUTRO');

-- CreateEnum
CREATE TYPE "RelationshipEventType" AS ENUM ('FEEDBACK_POSITIVE', 'FEEDBACK_NEGATIVE', 'CONVERSATION', 'ACHIEVEMENT', 'EVOLUTION', 'ATTENTION', 'GOAL', 'OTHER');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('NEW_STUDENT', 'FIRST_ACCESS', 'LOW_FREQUENCY', 'RETURN_AFTER_ABSENCE', 'PLAN_EXPIRING', 'PLAN_EXPIRED', 'IMPORTANT_NOTE', 'NEW_MODALITY');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'ATTENTION', 'CRITICAL');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'PROFESSOR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "default_turnstile_id" TEXT,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_turnstile_permissions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "turnstile_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_turnstile_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "turnstiles" (
    "id" TEXT NOT NULL,
    "tecnofit_access_point_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "modality_label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "turnstiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "tecnofit_student_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "first_name" TEXT,
    "photo_url" TEXT,
    "status" "StudentStatus" NOT NULL DEFAULT 'UNKNOWN',
    "plan_name" TEXT,
    "modalities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "member_since" TIMESTAMP(3),
    "plan_expires_at" TIMESTAMP(3),
    "synced_at" TIMESTAMP(3),
    "raw_snapshot" JSONB,
    "first_seen_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_events" (
    "id" TEXT NOT NULL,
    "external_event_id" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "turnstile_id" TEXT,
    "event_type" "AccessEventType" NOT NULL DEFAULT 'ENTRY',
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "source" "AccessEventSource" NOT NULL DEFAULT 'POLLING',
    "raw_turnstile_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relationship_notes" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "author_user_id" TEXT NOT NULL,
    "category" "NoteCategory" NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "relationship_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relationship_events" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "RelationshipEventType" NOT NULL,
    "label" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relationship_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "guidance" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "metadata" JSONB,
    "resolved_at" TIMESTAMP(3),
    "acknowledged_at" TIMESTAMP(3),
    "acknowledged_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "old_value" JSONB,
    "new_value" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_state" (
    "id" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "cursor" TEXT,
    "last_run_at" TIMESTAMP(3),
    "last_ok_at" TIMESTAMP(3),
    "last_error" TEXT,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tecnofit_cache" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tecnofit_cache_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "user_turnstile_permissions_turnstile_id_idx" ON "user_turnstile_permissions"("turnstile_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_turnstile_permissions_user_id_turnstile_id_key" ON "user_turnstile_permissions"("user_id", "turnstile_id");

-- CreateIndex
CREATE UNIQUE INDEX "turnstiles_tecnofit_access_point_id_key" ON "turnstiles"("tecnofit_access_point_id");

-- CreateIndex
CREATE INDEX "turnstiles_active_display_order_idx" ON "turnstiles"("active", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "students_tecnofit_student_id_key" ON "students"("tecnofit_student_id");

-- CreateIndex
CREATE INDEX "students_full_name_idx" ON "students"("full_name");

-- CreateIndex
CREATE INDEX "students_last_seen_at_idx" ON "students"("last_seen_at");

-- CreateIndex
CREATE INDEX "students_status_idx" ON "students"("status");

-- CreateIndex
CREATE UNIQUE INDEX "access_events_external_event_id_key" ON "access_events"("external_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "access_events_dedupe_key_key" ON "access_events"("dedupe_key");

-- CreateIndex
CREATE INDEX "access_events_student_id_occurred_at_idx" ON "access_events"("student_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "access_events_turnstile_id_occurred_at_idx" ON "access_events"("turnstile_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "access_events_occurred_at_idx" ON "access_events"("occurred_at" DESC);

-- CreateIndex
CREATE INDEX "relationship_notes_student_id_created_at_idx" ON "relationship_notes"("student_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "relationship_notes_author_user_id_idx" ON "relationship_notes"("author_user_id");

-- CreateIndex
CREATE INDEX "relationship_notes_deleted_at_idx" ON "relationship_notes"("deleted_at");

-- CreateIndex
CREATE INDEX "relationship_events_student_id_created_at_idx" ON "relationship_events"("student_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "relationship_events_user_id_idx" ON "relationship_events"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "alerts_dedupe_key_key" ON "alerts"("dedupe_key");

-- CreateIndex
CREATE INDEX "alerts_student_id_created_at_idx" ON "alerts"("student_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "alerts_resolved_at_severity_idx" ON "alerts"("resolved_at", "severity");

-- CreateIndex
CREATE INDEX "alerts_type_idx" ON "alerts"("type");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "sync_state_resource_key" ON "sync_state"("resource");

-- CreateIndex
CREATE INDEX "tecnofit_cache_expires_at_idx" ON "tecnofit_cache"("expires_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_default_turnstile_id_fkey" FOREIGN KEY ("default_turnstile_id") REFERENCES "turnstiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_turnstile_permissions" ADD CONSTRAINT "user_turnstile_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_turnstile_permissions" ADD CONSTRAINT "user_turnstile_permissions_turnstile_id_fkey" FOREIGN KEY ("turnstile_id") REFERENCES "turnstiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_events" ADD CONSTRAINT "access_events_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_events" ADD CONSTRAINT "access_events_turnstile_id_fkey" FOREIGN KEY ("turnstile_id") REFERENCES "turnstiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationship_notes" ADD CONSTRAINT "relationship_notes_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationship_notes" ADD CONSTRAINT "relationship_notes_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationship_events" ADD CONSTRAINT "relationship_events_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationship_events" ADD CONSTRAINT "relationship_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_acknowledged_by_id_fkey" FOREIGN KEY ("acknowledged_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
