-- Migration: Create AgentTask Table
-- Description: The single source of truth for autonomous agents.

CREATE TABLE IF NOT EXISTS "AgentTask" (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id text NOT NULL,
  status text NOT NULL,
  priority_score float DEFAULT 0.0,
  task_payload jsonb NOT NULL,
  output_data jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Optional: Add an index on status and agent_id to speed up polling
CREATE INDEX IF NOT EXISTS "idx_agenttask_status" ON "AgentTask"(status);
CREATE INDEX IF NOT EXISTS "idx_agenttask_agent_id" ON "AgentTask"(agent_id);
