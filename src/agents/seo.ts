import { GoogleGenAI } from '@google/genai';
import { supabase } from '../utils/supabase';
import "dotenv/config";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SEO_SYSTEM_PROMPT = `
You are the SEO Specialist Agent. 
Your goal is to take a task payload (usually a topic or instruction), perform an SEO analysis, and output a highly structured SEO Content Brief.
Your output MUST be a valid JSON object matching this exact structure:
{
  "title": "A highly clickable, keyword-optimized title",
  "targetKeywords": ["keyword1", "keyword2", "keyword3"],
  "metaDescription": "A compelling meta description under 160 characters.",
  "outline": [
    "H2: Introduction",
    "H2: Main Point 1",
    "H3: Sub-point"
  ]
}
Do not return markdown formatting blocks like \`\`\`json. Return ONLY the raw JSON string.
`;

export async function runSeoAgent() {
  console.log("Starting SEO Agent Execution Cycle...");

  try {
    // 1. Fetch the highest priority PENDING task for the SEO agent
    const { data: tasks, error: fetchError } = await supabase
      .from('AgentTask')
      .select('*')
      .eq('agent_id', 'seo')
      .eq('status', 'PENDING')
      .order('priority_score', { ascending: false })
      .limit(1);

    if (fetchError) throw fetchError;

    if (!tasks || tasks.length === 0) {
      console.log("No pending tasks for the SEO Agent. Going back to sleep.");
      return;
    }

    const task = tasks[0];
    console.log(`Picked up Task [${task.id}] with priority ${task.priority_score}`);

    // 2. Mark the task as IN_PROGRESS
    await supabase
      .from('AgentTask')
      .update({ status: 'IN_PROGRESS' })
      .eq('id', task.id);

    // 3. Execute the task using Gemini
    console.log("Generating SEO Content Brief...");
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { role: 'user', parts: [{ text: `Generate an SEO brief based on this payload: ${task.task_payload}` }] }
      ],
      config: {
        systemInstruction: SEO_SYSTEM_PROMPT,
        temperature: 0.3,
      }
    });

    const outputText = response.text || "{}";
    let outputData;
    
    try {
      outputData = JSON.parse(outputText);
    } catch (e) {
      console.warn("Failed to parse JSON, saving raw output instead.");
      outputData = { rawText: outputText };
    }

    // 4. Save the result and mark as NEEDS_REVIEW (Guardrail)
    const { error: updateError } = await supabase
      .from('AgentTask')
      .update({ 
        status: 'NEEDS_REVIEW', 
        output_data: outputData,
        updated_at: new Date().toISOString()
      })
      .eq('id', task.id);

    if (updateError) throw updateError;

    console.log(`Successfully completed Task [${task.id}]. Status marked as NEEDS_REVIEW.`);
    console.log("Output Data:", JSON.stringify(outputData, null, 2));

  } catch (error) {
    console.error("SEO Agent encountered a fatal error:", error);
  }
}

// If run directly
if (require.main === module) {
  runSeoAgent();
}
