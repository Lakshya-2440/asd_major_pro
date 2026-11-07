-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('typer', 'supervisor', 'admin');

-- CreateEnum
CREATE TYPE "Species" AS ENUM ('cattle', 'buffalo');

-- CreateEnum
CREATE TYPE "EvaluationStatus" AS ENUM ('draft', 'pending_analysis', 'analyzed', 'failed_quality', 'confirmed', 'synced');

-- CreateEnum
CREATE TYPE "ViewType" AS ENUM ('side', 'rear', 'front');

-- CreateEnum
CREATE TYPE "BpaSyncStatus" AS ENUM ('pending', 'synced', 'failed');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'typer',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "animals" (
    "id" UUID NOT NULL,
    "tag_id" TEXT NOT NULL,
    "species" "Species" NOT NULL,
    "breed" TEXT NOT NULL,
    "owner_name" TEXT,
    "village" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "animals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluations" (
    "id" UUID NOT NULL,
    "animal_id" UUID NOT NULL,
    "evaluator_id" UUID NOT NULL,
    "status" "EvaluationStatus" NOT NULL DEFAULT 'draft',
    "overall_score" DOUBLE PRECISION,
    "pipeline_version" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "images" (
    "id" UUID NOT NULL,
    "evaluation_id" UUID NOT NULL,
    "view_type" "ViewType" NOT NULL DEFAULT 'side',
    "file_path" TEXT NOT NULL,
    "quality_flags" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "landmarks" (
    "id" UUID NOT NULL,
    "evaluation_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "estimated_pos" JSONB NOT NULL,
    "corrected_pos" JSONB,
    "confidence" DOUBLE PRECISION,

    CONSTRAINT "landmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurements" (
    "id" UUID NOT NULL,
    "evaluation_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,

    CONSTRAINT "measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trait_scores" (
    "id" UUID NOT NULL,
    "evaluation_id" UUID NOT NULL,
    "trait_name" TEXT NOT NULL,
    "ai_score" INTEGER NOT NULL,
    "final_score" INTEGER NOT NULL,
    "override_reason" TEXT,

    CONSTRAINT "trait_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bpa_sync" (
    "id" UUID NOT NULL,
    "evaluation_id" UUID NOT NULL,
    "status" "BpaSyncStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "synced_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bpa_sync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "animals_tag_id_key" ON "animals"("tag_id");

-- CreateIndex
CREATE INDEX "animals_tag_id_idx" ON "animals"("tag_id");

-- CreateIndex
CREATE INDEX "evaluations_animal_id_idx" ON "evaluations"("animal_id");

-- CreateIndex
CREATE INDEX "evaluations_evaluator_id_idx" ON "evaluations"("evaluator_id");

-- CreateIndex
CREATE INDEX "evaluations_status_created_at_idx" ON "evaluations"("status", "created_at");

-- CreateIndex
CREATE INDEX "images_evaluation_id_idx" ON "images"("evaluation_id");

-- CreateIndex
CREATE UNIQUE INDEX "landmarks_evaluation_id_name_key" ON "landmarks"("evaluation_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "measurements_evaluation_id_name_key" ON "measurements"("evaluation_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "trait_scores_evaluation_id_trait_name_key" ON "trait_scores"("evaluation_id", "trait_name");

-- CreateIndex
CREATE INDEX "bpa_sync_evaluation_id_created_at_idx" ON "bpa_sync"("evaluation_id", "created_at");

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_evaluator_id_fkey" FOREIGN KEY ("evaluator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "images" ADD CONSTRAINT "images_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landmarks" ADD CONSTRAINT "landmarks_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trait_scores" ADD CONSTRAINT "trait_scores_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bpa_sync" ADD CONSTRAINT "bpa_sync_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

