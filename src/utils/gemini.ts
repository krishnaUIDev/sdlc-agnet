import "dotenv/config";
import { GoogleGenAI } from '@google/genai';

let aiInstance: GoogleGenAI | null = null;

function getAiClient() {
  if (!aiInstance) {
    if (!process.env.GEMINI_API_KEY) {
      console.warn("[GEMINI] Warning: GEMINI_API_KEY is not set in environment variables!");
    }
    aiInstance = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return aiInstance;
}

/**
 * Calls Gemini with automatic retry on 429 rate limit errors.
 * Retries up to 3 times with exponential backoff.
 */
export async function callGemini(
  prompt: string,
  systemInstruction: string,
  options?: {
    tools?: any[];
    temperature?: number;
    forceToolUse?: boolean; // When true, Gemini MUST call a tool (cannot respond with text)
  }
) {
  const maxRetries = 3;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await getAiClient().models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          systemInstruction,
          tools: options?.tools,
          toolConfig: options?.forceToolUse
            ? { functionCallingConfig: { mode: 'ANY' as any } }
            : undefined,
          temperature: options?.temperature ?? 0.3,
        },
      });
      return response;
    } catch (error: any) {
      const is429 = error?.status === 429 || error?.message?.includes('429');

      if (is429 && attempt < maxRetries) {
        // Parse retry delay from error or use exponential backoff
        const waitMs = (attempt + 1) * 10_000; // 10s, 20s, 30s
        console.warn(`[GEMINI] Rate limited (429). Retrying in ${waitMs / 1000}s... (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }

      throw error; // Re-throw if not retryable or exhausted retries
    }
  }

  throw new Error('Exhausted all retries');
}
