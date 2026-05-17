import { GoogleGenAI, Type } from '@google/genai';
import { supabase } from '../utils/supabase';
import "dotenv/config";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const JARVIS_SYSTEM_PROMPT = `
You are Jarvis, the lead orchestration agent for a SaaS business with a goal to reach $50K MRR. 
You do not execute tasks directly. Your job is to analyze the current business context, identify the highest leverage opportunities, and delegate tasks to specialist agents ('seo', 'product', 'dev', 'social').

Rules:
1. Before creating a task, think carefully about the current business priority.
2. Every task you create MUST include a priority score (Impact * Confidence / Effort, typically ranging from 0.0 to 10.0).
3. Use the 'createAgentTask' tool to assign tasks to specific agents with clear, structured payloads.
4. Keep the payloads detailed but actionable.
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
        description: "The ID of the agent to assign this task to. Must be one of: 'seo', 'product', 'dev', 'social'.",
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

  const currentContext = "We are currently at $10k MRR. Our organic traffic is flat month-over-month. We released a new feature last week but adoption is low. We need to push SEO and product UX improvements.";

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { role: 'user', parts: [{ text: currentContext }] }
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
          const { agentId, priorityScore, payload } = args;

          console.log(`Jarvis is creating a task for [${agentId}] with priority ${priorityScore}`);
          
          const { error } = await supabase.from('AgentTask').insert([{
            agent_id: agentId,
            priority_score: priorityScore,
            status: 'PENDING',
            task_payload: payload,
          }]);

          if (error) {
            console.error("Failed to insert task into Supabase:", error);
          }
        }
      }
      console.log("Jarvis finished delegating tasks.");
    } else {
      console.log("Jarvis decided no new tasks were needed right now.");
      console.log("Jarvis response:", response.text);
    }
  } catch (error) {
    console.error("Jarvis failed:", error);
  }
}

// If run directly
if (require.main === module) {
  runJarvis();
}
