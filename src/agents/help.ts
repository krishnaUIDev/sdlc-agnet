import { callGemini } from '../utils/gemini';
import { supabase } from '../utils/supabase';
import "dotenv/config";

const HELP_PROMPT = `
You are the Resolution Agent (Product Manager). 
One of your worker agents (UX, Dev, QA, etc.) is stuck and has asked a question because they lack requirements.
Your job is to provide a highly logical, best-practice answer to unblock them so they can finish their task.
Do not ask follow up questions. Make an executive decision and provide a clear, direct answer.
`;

export async function runHelpAgent() {
  console.log("Starting Help Agent Cycle...");

  try {
    const { data: tasks, error: fetchError } = await supabase
      .from('AgentTask')
      .select('*')
      .eq('status', 'NEEDS_HELP')
      .order('created_at', { ascending: true })
      .limit(1);

    if (fetchError || !tasks || tasks.length === 0) {
      console.log("No workers need help right now.");
      return;
    }

    const task = tasks[0];
    console.log(`[HELP AGENT] unblocking task ${task.id} for agent ${task.agent_id}...`);

    // The question from the worker is stored in human_feedback (which they wrote before pausing)
    const question = task.human_feedback || "The agent is stuck but didn't provide a question. Please provide general guidance to proceed.";

    const response = await callGemini(
      `The ${task.agent_id} agent asked: "${question}". Provide a resolution.`,
      HELP_PROMPT,
      { temperature: 0.4 }
    );

    // Write the answer back to human_feedback and reset status to PENDING
    await supabase.from('AgentTask').update({ 
      status: 'PENDING', 
      human_feedback: `[RESOLUTION]: ${response.text}` 
    }).eq('id', task.id);
    
    console.log(`[HELP AGENT] provided resolution and woke up the ${task.agent_id} agent!`);

  } catch (error: any) {
    console.error(`Error running Help Agent:`, error);
    try {
      const { data: stuck } = await supabase.from('AgentTask').select('id, agent_id').eq('status', 'NEEDS_HELP').limit(1);
      if (stuck?.[0]) {
        await supabase.from('AgentTask').update({ 
          status: 'FAILED', 
          output_data: { error: `Help Agent failed: ${error.message || String(error)}` } 
        }).eq('id', stuck[0].id);
      }
    } catch (_) {}
  }
}

if (require.main === module) runHelpAgent();
