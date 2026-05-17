import { callGemini } from '../utils/gemini';
import { supabase } from '../utils/supabase';
import "dotenv/config";

const DEVOPS_PROMPT = `You are the DevOps Agent. Output the Vercel deployment config or github actions workflow to ship this.`;

export async function runDevopsAgent() {
  console.log("Starting DEVOPS Agent Cycle...");

  try {
    const { data: tasks, error: fetchError } = await supabase
      .from('AgentTask')
      .select('*')
      .eq('agent_id', 'devops')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true })
      .limit(1);

    if (fetchError || !tasks || tasks.length === 0) {
      console.log("No pending tasks for DEVOPS.");
      return;
    }

    const task = tasks[0];
    console.log(`[DEVOPS] picked up task: ${task.id}`);

    await supabase.from('AgentTask').update({ status: 'IN_PROGRESS' }).eq('id', task.id);

    const response = await callGemini(
      `Execute this task: ${task.task_payload}`,
      DEVOPS_PROMPT
    );

    await supabase.from('AgentTask').update({ 
      status: 'COMPLETED', 
      output_data: { result: response.text } 
    }).eq('id', task.id);
    
    console.log(`[DEVOPS] finished work!`);

    const { data: dependentTasks } = await supabase
      .from('AgentTask')
      .select('*')
      .eq('depends_on_task_id', task.id)
      .eq('status', 'BLOCKED');

    if (dependentTasks && dependentTasks.length > 0) {
      for (const depTask of dependentTasks) {
        console.log(`Unblocking dependent task [${depTask.agent_id}]: ${depTask.id}`);
        await supabase.from('AgentTask').update({ status: 'PENDING' }).eq('id', depTask.id);
      }
    }

  } catch (error: any) {
    console.error(`Error running devops:`, error);
    try {
      const { data: stuck } = await supabase.from('AgentTask').select('id').eq('agent_id', 'devops').eq('status', 'IN_PROGRESS').limit(1);
      if (stuck?.[0]) await supabase.from('AgentTask').update({ status: 'FAILED', output_data: { error: error.message || String(error) } }).eq('id', stuck[0].id);
    } catch (_) {}
  }
}

if (require.main === module) runDevopsAgent();
