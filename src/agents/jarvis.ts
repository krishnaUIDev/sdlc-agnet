import { GoogleGenAI, Type } from '@google/genai';
import { supabase } from '../utils/supabase';
import "dotenv/config";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const JARVIS_SYSTEM_PROMPT = `
You are Jarvis, the lead orchestration agent for a software development team. 
You receive high-level requirements (Epics) from the human CEO.
Your ONLY job is to take the CEO's request, flesh out the details into a robust Epic payload, and delegate it exclusively to the 'scrum_master' agent using the createAgentTask tool.
Do not assign tasks to anyone else. The Scrum Master will handle the breakdown.
`;

// Tool definition for Gemini
const createAgentTaskTool = {
  name: 'createAgentTask',
  description: 'Creates a new task for a specialist agent in the database.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      agentId: {
        type: Type.STRING,
        description: "The ID of the agent to assign this task to. Must ALWAYS be 'scrum_master'.",
      },
      priorityScore: {
        type: Type.NUMBER,
        description: "The priority score for the task (Impact * Confidence / Effort). Scale 0.0 - 10.0.",
      },
      payload: {
        type: Type.STRING,
        description: "A detailed stringified JSON object or markdown text describing the task to be done.",
      }
    },
    required: ["agentId", "priorityScore", "payload"],
  }
};

export async function runJarvis() {
  console.log("Starting Jarvis Orchestration Cycle...");

  try {
    // 1. Fetch pending Epic submitted by the CEO
    const { data: epics, error: fetchError } = await supabase
      .from('AgentTask')
      .select('*')
      .eq('agent_id', 'jarvis')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true })
      .limit(1);

    if (fetchError) throw fetchError;

    if (!epics || epics.length === 0) {
      console.log("No new epics from the CEO. Jarvis is standing by.");
      return;
    }

    const epic = epics[0];
    console.log(`CEO submitted Epic: "${epic.task_payload}"`);

    // Mark as IN_PROGRESS
    await supabase.from('AgentTask').update({ status: 'IN_PROGRESS' }).eq('id', epic.id);

    // Call Gemini to hand it off to the Scrum Master
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { role: 'user', parts: [{ text: `The CEO requested: "${epic.task_payload}". Create an Epic task for the Scrum Master.` }] }
      ],
      config: {
        systemInstruction: JARVIS_SYSTEM_PROMPT,
        tools: [{ functionDeclarations: [createAgentTaskTool] }],
        temperature: 0.2,
      }
    });

    if (response.functionCalls && response.functionCalls.length > 0) {
      for (const call of response.functionCalls) {
        if (call.name === 'createAgentTask' && call.args) {
          const args = call.args as { agentId: string, priorityScore: number, payload: string };
          // Override agentId to always be Scrum Master since we changed architecture
          const assignedAgent = 'scrum_master'; 

          console.log(`Jarvis is assigning Epic to [${assignedAgent}]...`);
          
          const { error } = await supabase.from('AgentTask').insert([{
            agent_id: assignedAgent,
            priority_score: args.priorityScore,
            status: 'PENDING',
            task_payload: args.payload,
            parent_task_id: epic.id // Link it back to the CEO's original request!
          }]);

          if (error) console.error("Failed to insert task:", error);
        }
      }
      
      // Mark original epic as COMPLETED
      await supabase.from('AgentTask').update({ status: 'COMPLETED' }).eq('id', epic.id);
      console.log("Jarvis successfully processed the Epic and handed it to the Scrum Master.");
      
    } else {
      console.log("Jarvis didn't think this required Scrum Master attention.");
      await supabase.from('AgentTask').update({ status: 'NEEDS_REVIEW', output_data: { response: response.text } }).eq('id', epic.id);
    }
  } catch (error) {
    console.error("Jarvis failed:", error);
  }
}

// If run directly
if (require.main === module) {
  runJarvis();
}
