-- Migration: Add parent_task_id to AgentTask
-- Description: Allows the Scrum Master agent to break down Epics into sub-tasks and link them back to the original Epic.

ALTER TABLE "AgentTask"
ADD COLUMN parent_task_id uuid REFERENCES "AgentTask"(id) ON DELETE CASCADE,
ADD COLUMN depends_on_task_id uuid REFERENCES "AgentTask"(id) ON DELETE SET NULL;

-- Add an index to quickly find all sub-tasks for a given Epic
CREATE INDEX IF NOT EXISTS "idx_agenttask_parent_task_id" ON "AgentTask"(parent_task_id);
