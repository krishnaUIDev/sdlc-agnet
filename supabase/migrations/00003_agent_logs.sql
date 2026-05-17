-- Migration: Create AgentLogs Table
-- Description: Stores live execution logs and errors for every agent action.

CREATE TABLE IF NOT EXISTS "AgentLog" (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid REFERENCES "AgentTask"(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  level text NOT NULL DEFAULT 'info', -- 'info', 'warn', 'error'
  message text NOT NULL,
  details jsonb, -- Stack traces or API responses
  created_at timestamp with time zone DEFAULT now()
);

-- Index for quickly grabbing the logs for a specific task
CREATE INDEX IF NOT EXISTS "idx_agentlog_task_id" ON "AgentLog"(task_id);
