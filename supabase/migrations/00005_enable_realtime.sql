-- Migration: Enable Realtime for AgentTask
-- Description: Allows Supabase to broadcast INSERT and UPDATE events over WebSockets

ALTER PUBLICATION supabase_realtime ADD TABLE "AgentTask";
