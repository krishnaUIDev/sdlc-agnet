import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function resetStuckEpics() {
  const { data } = await supabase
    .from('AgentTask')
    .select('id, status, task_payload')
    .eq('status', 'NEEDS_REVIEW')
    .eq('agent_id', 'jarvis');

  console.log('Stuck epics:', JSON.stringify(data, null, 2));

  if (data && data.length > 0) {
    for (const task of data) {
      await supabase.from('AgentTask').update({ status: 'PENDING' }).eq('id', task.id);
      console.log('✅ Reset task', task.id, 'back to PENDING');
    }
  }
}

resetStuckEpics();
