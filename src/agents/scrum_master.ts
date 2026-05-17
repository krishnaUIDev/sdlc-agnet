import { Type } from '@google/genai';
import { callGemini } from '../utils/gemini';
import { supabase } from '../utils/supabase';
import "dotenv/config";

const SCRUM_SYSTEM_PROMPT = `
You are the Scrum Master Agent for an autonomous SDLC team.
You receive high-level 'Epics' from Jarvis. Your job is to break these Epics down into a sequential, dependent chain of specialist sub-tasks.

You should dynamically select ONLY the necessary specialist agents based on the type of Epic:
1. UX Design (agent_id: 'ux') - ONLY include if there is a user interface, visual layout, theme, or screen design required. EXCLUDE for backend, databases, APIs, cron jobs, background tasks, or scripts.
2. Development (agent_id: 'dev') - Always include.
3. SEO Optimization (agent_id: 'seo') - ONLY include if it is a public-facing website/webpage that needs search engine visibility, meta-tags, or indexing. EXCLUDE for internal apps, APIs, login-locked pages, or backend services.
4. QA & Testing (agent_id: 'qa') - Always include.
5. Security Audit (agent_id: 'security') - Always include.
6. Code Review (agent_id: 'review') - Always include.
7. Deployment (agent_id: 'devops') - Always include.

CRITICAL: If the Epic description is a backend change, database change, schema update, cron job, worker script, API endpoint, or anything OTHER THAN a visual User Interface change, you MUST SKIP the UX Design agent (agent_id: 'ux'). Starting directly with the 'dev' agent is mandatory in these cases.

Build the sequential dependency chain using the 'createSubTasks' tool in the correct execution order (e.g. ux -> dev -> seo -> qa -> security -> review -> devops, or dev -> qa -> security -> review -> devops if UX/SEO are excluded).
`;

const createSubTasksTool = {
  name: 'createSubTasks',
  description: 'Creates multiple sub-tasks assigned to different specialist agents.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      tasks: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            agentId: { type: Type.STRING, description: "Must be 'ux', 'dev', 'seo', 'qa', 'security', 'review', or 'devops'" },
            payload: { type: Type.STRING, description: "Detailed instructions for this specific agent." }
          },
          required: ["agentId", "payload"]
        }
      }
    },
    required: ["tasks"],
  }
};

export async function runScrumMaster() {
  console.log("Starting Scrum Master Cycle...");

  try {
    const { data: epics, error: fetchError } = await supabase
      .from('AgentTask')
      .select('*')
      .eq('agent_id', 'scrum_master')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true })
      .limit(1);

    if (fetchError) throw fetchError;
    if (!epics || epics.length === 0) {
      console.log("No pending epics. Scrum Master resting.");
      return;
    }

    const epic = epics[0];
    console.log(`Scrum Master breaking down Epic: "${epic.task_payload}"`);

    await supabase.from('AgentTask').update({ status: 'IN_PROGRESS' }).eq('id', epic.id);

    const response = await callGemini(
      `Break down this Epic dynamically, generating only the necessary sequential subtasks: ${epic.task_payload}`,
      SCRUM_SYSTEM_PROMPT,
      {
        tools: [{ functionDeclarations: [createSubTasksTool] }],
        temperature: 0.2,
        forceToolUse: true,
      }
    );

    if (response.functionCalls && response.functionCalls.length > 0) {
      for (const call of response.functionCalls) {
        if (call.name === 'createSubTasks' && call.args && Array.isArray(call.args.tasks)) {
          let previousTaskId: string | null = null;
          const sprintPlan: string[] = [];
          
          // Insert tasks sequentially to build the dependency chain
          for (let i = 0; i < call.args.tasks.length; i++) {
            const t = call.args.tasks[i];
            console.log(`Assigning sub-task to [${t.agentId}]...`);
            sprintPlan.push(`${i + 1}. [${t.agentId}] ${t.payload.substring(0, 120)}`);
            
            const response = await supabase.from('AgentTask').insert([{
              agent_id: t.agentId,
              status: previousTaskId ? 'BLOCKED' : 'PENDING', // Only the first task starts PENDING
              task_payload: t.payload,
              parent_task_id: epic.id,
              depends_on_task_id: previousTaskId,
              priority_score: epic.priority_score
            }]).select().single();

            const insertedTask = response.data as any;
            const error = response.error;

            if (error) {
              console.error("Failed to insert sub-task:", error);
            } else {
              previousTaskId = insertedTask.id; // Next task depends on this one!
            }
          }

          // Save sprint plan summary to scrum master's output
          await supabase.from('AgentTask').update({ 
            status: 'COMPLETED', 
            output_data: { result: `Sprint Plan (${call.args.tasks.length} tasks):\n${sprintPlan.join('\n')}` }
          }).eq('id', epic.id);
          console.log("Scrum Master successfully planned the sprint!");
        }
      }
      
    } else {
      console.log("Scrum Master failed to use the createSubTasks tool. Response:", response.text);
      await supabase.from('AgentTask').update({ status: 'FAILED', output_data: { error: 'Gemini did not call the createSubTasks tool', response: response.text } }).eq('id', epic.id);
    }
  } catch (error: any) {
    console.error("Scrum Master crashed:", error);
    // Try to mark the task as FAILED in the DB with the error message
    try {
      const { data: pending } = await supabase.from('AgentTask').select('id').eq('agent_id', 'scrum_master').eq('status', 'IN_PROGRESS').limit(1);
      if (pending && pending[0]) {
        await supabase.from('AgentTask').update({ status: 'FAILED', output_data: { error: error.message || String(error) } }).eq('id', pending[0].id);
      }
    } catch (_) {}
  }
}

if (require.main === module) runScrumMaster();
