ALTER TABLE "evaluations"
ADD COLUMN "pixels_per_cm" DOUBLE PRECISION;

CREATE TABLE "score_override_audit" (
    "id" UUID NOT NULL,
    "evaluation_id" UUID NOT NULL,
    "trait_name" TEXT NOT NULL,
    "previous_score" INTEGER NOT NULL,
    "final_score" INTEGER NOT NULL,
    "override_reason" TEXT NOT NULL,
    "changed_by" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "score_override_audit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "score_override_audit_evaluation_id_trait_name_changed_at_idx"
ON "score_override_audit"("evaluation_id", "trait_name", "changed_at");

ALTER TABLE "score_override_audit"
ADD CONSTRAINT "score_override_audit_evaluation_id_fkey"
FOREIGN KEY ("evaluation_id") REFERENCES "evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "score_override_audit"
ADD CONSTRAINT "score_override_audit_changed_by_fkey"
FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
