import { supabase } from './supabase';

export async function logActivity(agent_id: string, message: string, task_id?: string) {
  console.log(`[${agent_id.toUpperCase()}] ${message}`);
  
  try {
    await supabase.from('AgentLog').insert([{ 
      agent_id, 
      message, 
      task_id: task_id || null 
    }]);
  } catch (error) {
    console.error("Failed to write to AgentLog table:", error);
  }
}
