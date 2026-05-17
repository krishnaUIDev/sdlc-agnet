import { GoogleGenAI } from '@google/genai';
import { supabase } from '../utils/supabase';
import "dotenv/config";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const AGENT_PROMPTS: Record<string, string> = {
  ux: "You are the UX Design Agent. Create a wireframe layout description and CSS/Tailwind recommendations based on the payload.",
  dev: "You are the Developer Agent. Write the React/Next.js code to implement the UX design and payload requirements.",
  qa: "You are the QA Testing Agent. Write a Jest or Playwright test suite for the implemented code.",
  security: "You are the Security Agent. Review the code/design for OWASP vulnerabilities and output a security report.",
  review: "You are the Review Agent. Evaluate all previous outputs and give a final APPROVED or REJECTED verdict.",
  devops: "You are the DevOps Agent. Output the Vercel deployment config or github actions workflow to ship this."
};

export async function runWorkers() {
  console.log("Starting Worker Agents Cycle...");

  for (const agentId of Object.keys(AGENT_PROMPTS)) {
    try {
      const { data: tasks, error: fetchError } = await supabase
        .from('AgentTask')
        .select('*')
        .eq('agent_id', agentId)
        .eq('status', 'PENDING')
        .order('created_at', { ascending: true })
        .limit(1);

      if (fetchError || !tasks || tasks.length === 0) continue;

      const task = tasks[0];
      console.log(`[${agentId.toUpperCase()} Agent] picked up task: ${task.id}`);

      await supabase.from('AgentTask').update({ status: 'IN_PROGRESS' }).eq('id', task.id);

      // We should ideally fetch the parent epic or previous outputs as context, 
      // but for simplicity we'll just pass the payload.
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: `Execute this task: ${task.task_payload}` }] }],
        config: { systemInstruction: AGENT_PROMPTS[agentId], temperature: 0.3 }
      });

      // Mark this task as COMPLETED
      await supabase.from('AgentTask').update({ 
        status: 'COMPLETED', 
        output_data: { result: response.text } 
      }).eq('id', task.id);
      
      console.log(`[${agentId.toUpperCase()} Agent] finished work!`);

      // UNBLOCK DEPENDENT TASKS
      // Find any task waiting on this one and wake it up
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
      console.error(`Error running ${agentId}:`, error);
    }
  }
}

if (require.main === module) runWorkers();
