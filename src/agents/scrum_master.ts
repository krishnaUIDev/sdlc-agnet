import { GoogleGenAI, Type } from '@google/genai';
import { supabase } from '../utils/supabase';
import "dotenv/config";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SCRUM_SYSTEM_PROMPT = `
You are the Scrum Master Agent for an autonomous SDLC team.
You receive high-level 'Epics' from Jarvis. Your job is to break these Epics down into exactly 7 sub-tasks in a strict sequence:
1. UX Design (agent_id: 'ux')
2. Development (agent_id: 'dev')
3. SEO Optimization (agent_id: 'seo')
4. QA & Testing (agent_id: 'qa')
5. Security Audit (agent_id: 'security')
6. Code Review (agent_id: 'review')
7. Deployment (agent_id: 'devops')

Use the 'createSubTasks' tool to generate these 7 tasks.
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

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: `Break down this Epic into exactly 7 subtasks for the full SDLC pipeline: ${epic.task_payload}` }] }],
      config: {
        systemInstruction: SCRUM_SYSTEM_PROMPT,
        tools: [{ functionDeclarations: [createSubTasksTool] }],
        temperature: 0.2,
      }
    });

    if (response.functionCalls && response.functionCalls.length > 0) {
      for (const call of response.functionCalls) {
        if (call.name === 'createSubTasks' && call.args && Array.isArray(call.args.tasks)) {
          let previousTaskId: string | null = null;
          
          // Insert tasks sequentially to build the dependency chain
          for (const t of call.args.tasks) {
            console.log(`Assigning sub-task to [${t.agentId}]...`);
            
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
        }
      }
      
      await supabase.from('AgentTask').update({ status: 'COMPLETED' }).eq('id', epic.id);
      console.log("Scrum Master successfully planned the sprint!");
      
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
