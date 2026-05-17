import { callGemini } from '../utils/gemini';
import { supabase } from '../utils/supabase';
import "dotenv/config";

const REVIEW_PROMPT = `You are the Review Agent. Evaluate all previous outputs and give a final APPROVED or REJECTED verdict.`;

export async function runReviewAgent() {
  console.log("Starting REVIEW Agent Cycle...");

  try {
    const { data: tasks, error: fetchError } = await supabase
      .from('AgentTask')
      .select('*')
      .eq('agent_id', 'review')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true })
      .limit(1);

    if (fetchError || !tasks || tasks.length === 0) {
      console.log("No pending tasks for REVIEW.");
      return;
    }

    const task = tasks[0];
    console.log(`[REVIEW] picked up task: ${task.id}`);

    await supabase.from('AgentTask').update({ status: 'IN_PROGRESS' }).eq('id', task.id);

    const response = await callGemini(
      `Execute this task: ${task.task_payload}`,
      REVIEW_PROMPT
    );

    await supabase.from('AgentTask').update({ 
      status: 'NEEDS_REVIEW', 
      output_data: { result: response.text } 
    }).eq('id', task.id);
    
    console.log(`[REVIEW] finished work and requested human approval!`);

  } catch (error: any) {
    console.error(`Error running review:`, error);
    try {
      const { data: stuck } = await supabase.from('AgentTask').select('id').eq('agent_id', 'review').eq('status', 'IN_PROGRESS').limit(1);
      if (stuck?.[0]) await supabase.from('AgentTask').update({ status: 'FAILED', output_data: { error: error.message || String(error) } }).eq('id', stuck[0].id);
    } catch (_) {}
  }
}

if (require.main === module) runReviewAgent();
