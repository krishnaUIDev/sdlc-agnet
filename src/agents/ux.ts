import { Type } from '@google/genai';
import { callGemini } from '../utils/gemini';
import { supabase } from '../utils/supabase';
import "dotenv/config";

const UX_PROMPT = `You are the UX Design Agent. Create a wireframe layout description and CSS/Tailwind recommendations based on the payload.`;

export async function runUxAgent() {
  console.log("Starting UX Agent Cycle...");

  try {
    const { data: tasks, error: fetchError } = await supabase
      .from('AgentTask')
      .select('*')
      .eq('agent_id', 'ux')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true })
      .limit(1);

    if (fetchError || !tasks || tasks.length === 0) {
      console.log("No pending tasks for UX.");
      return;
    }

    const task = tasks[0];
    console.log(`[UX] picked up task: ${task.id}`);

    await supabase.from('AgentTask').update({ status: 'IN_PROGRESS' }).eq('id', task.id);

    const askForHelpTool = {
      name: 'askForHelp',
      description: 'Use this if the requirements are completely missing or extremely ambiguous. Pauses your task and asks the Help Agent for clarification.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING, description: "The exact question you need answered to proceed." }
        },
        required: ["question"]
      }
    };

    let promptText = `Execute this task: ${task.task_payload}`;
    if (task.human_feedback && task.human_feedback.includes('[RESOLUTION]')) {
      promptText += `\n\nPreviously you asked for help. Here is the resolution: ${task.human_feedback}`;
    }

    const response = await callGemini(
      promptText,
      UX_PROMPT,
      {
        tools: [{ functionDeclarations: [askForHelpTool] }],
        temperature: 0.3,
      }
    );

    if (response.functionCalls && response.functionCalls.length > 0) {
      const call = response.functionCalls[0];
      if (call.name === 'askForHelp' && call.args) {
        const question = (call.args as any).question;
        console.log(`[UX] got stuck and asked for help: "${question}"`);
        
        await supabase.from('AgentTask').update({ 
          status: 'NEEDS_HELP', 
          human_feedback: question 
        }).eq('id', task.id);
        
        return; // Pause execution here!
      }
    }

    await supabase.from('AgentTask').update({ 
      status: 'COMPLETED', 
      output_data: { result: response.text } 
    }).eq('id', task.id);
    
    console.log(`[UX] finished work!`);

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
    console.error(`Error running ux:`, error);
    try {
      const { data: stuck } = await supabase.from('AgentTask').select('id').eq('agent_id', 'ux').eq('status', 'IN_PROGRESS').limit(1);
      if (stuck?.[0]) await supabase.from('AgentTask').update({ status: 'FAILED', output_data: { error: error.message || String(error) } }).eq('id', stuck[0].id);
    } catch (_) {}
  }
}

if (require.main === module) runUxAgent();
