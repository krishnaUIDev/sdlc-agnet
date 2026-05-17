import { GoogleGenAI } from '@google/genai';
import { supabase } from '../utils/supabase';
import "dotenv/config";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const QA_PROMPT = `You are the QA Testing Agent. Write a Jest or Playwright test suite for the implemented code.`;

export async function runQaAgent() {
  console.log("Starting QA Agent Cycle...");

  try {
    const { data: tasks, error: fetchError } = await supabase
      .from('AgentTask')
      .select('*')
      .eq('agent_id', 'qa')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true })
      .limit(1);

    if (fetchError || !tasks || tasks.length === 0) {
      console.log("No pending tasks for QA.");
      return;
    }

    const task = tasks[0];
    console.log(`[QA] picked up task: ${task.id}`);

    await supabase.from('AgentTask').update({ status: 'IN_PROGRESS' }).eq('id', task.id);

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: `Execute this task: ${task.task_payload}` }] }],
      config: { systemInstruction: QA_PROMPT, temperature: 0.3 }
    });

    await supabase.from('AgentTask').update({ 
      status: 'COMPLETED', 
      output_data: { result: response.text } 
    }).eq('id', task.id);
    
    console.log(`[QA] finished work!`);

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
    console.error(`Error running qa:`, error);
  }
}

if (require.main === module) runQaAgent();
