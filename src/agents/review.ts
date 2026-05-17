import { GoogleGenAI } from '@google/genai';
import { supabase } from '../utils/supabase';
import "dotenv/config";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: `Execute this task: ${task.task_payload}` }] }],
      config: { systemInstruction: REVIEW_PROMPT, temperature: 0.3 }
    });

    await supabase.from('AgentTask').update({ 
      status: 'COMPLETED', 
      output_data: { result: response.text } 
    }).eq('id', task.id);
    
    console.log(`[REVIEW] finished work!`);

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

  } catch (error) {
    console.error(`Error running review:`, error);
  }
}

if (require.main === module) runReviewAgent();
