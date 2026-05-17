-- Migration: Add Feedback column for Human-in-the-loop
-- Description: Allows agents to pause and ask the human for clarification.

ALTER TABLE "AgentTask"
ADD COLUMN human_feedback text;
