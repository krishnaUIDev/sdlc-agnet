import { logActivity } from './utils/logger';
import { supabase } from './utils/supabase';
import { runJarvis } from './agents/jarvis';
import { runScrumMaster } from './agents/scrum_master';
import { runUxAgent } from './agents/ux';
import { runDevAgent } from './agents/dev';
import { runSeoAgent } from './agents/seo';
import { runQaAgent } from './agents/qa';
import { runSecurityAgent } from './agents/security';
import { runReviewAgent } from './agents/review';
import { runDevopsAgent } from './agents/devops';
import { runHelpAgent } from './agents/help';

console.log("🚀 Starting Supabase Realtime Event Daemon...");
console.log("Listening for AgentTask database changes...");

const agentMap: Record<string, () => Promise<void>> = {
  jarvis: runJarvis,
  scrum_master: runScrumMaster,
  ux: runUxAgent,
  dev: runDevAgent,
  seo: runSeoAgent,
  qa: runQaAgent,
  security: runSecurityAgent,
  review: runReviewAgent,
  devops: runDevopsAgent
};

supabase
  .channel('agent-tasks')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'AgentTask' },
    (payload) => handleEvent(payload.new)
  )
  .on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'AgentTask' },
    (payload) => handleEvent(payload.new)
  )
  .subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log("✅ Successfully connected to Supabase Realtime Pub/Sub!");
    }
  });

// Query and process any existing pending tasks at boot
async function checkPendingTasks() {
  console.log("🔍 Checking database for any missed PENDING tasks...");
  try {
    const { data: pendingTasks, error } = await supabase
      .from('AgentTask')
      .select('*')
      .eq('status', 'PENDING');
      
    if (error) throw error;
    
    if (pendingTasks && pendingTasks.length > 0) {
      console.log(`Found ${pendingTasks.length} missed PENDING tasks at startup. Triggering...`);
      for (const task of pendingTasks) {
        handleEvent(task).catch(console.error);
      }
    } else {
      console.log("No missed PENDING tasks found.");
    }
  } catch (err: any) {
    console.error("Failed to check pending tasks at startup:", err.message);
  }
}

checkPendingTasks();

async function handleEvent(record: any) {
  const { id, agent_id, status } = record;

  if (status === 'NEEDS_HELP') {
    await logActivity('daemon', `Task ${id} needs help! Waking up Help Agent...`, id);
    runHelpAgent().catch(console.error);
    return;
  }

  if (status === 'PENDING') {
    await logActivity('daemon', `Task ${id} is PENDING for [${agent_id}]. Triggering agent...`, id);
    
    const runFn = agentMap[agent_id];
    if (runFn) {
      // Fire and forget
      runFn().then(() => {
        logActivity('daemon', `[${agent_id}] successfully finished its cycle.`, id);
      }).catch((err) => {
        logActivity('daemon', `[${agent_id}] failed: ${err.message}`, id);
      });
    } else {
      await logActivity('daemon', `Unknown agent_id: ${agent_id}`, id);
    }
  }
}

// Keep the process alive
setInterval(() => {}, 1000 * 60 * 60);
