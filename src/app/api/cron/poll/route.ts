import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabase';

// This endpoint can be triggered by Vercel Cron or a local script
export async function GET(request: Request) {
  try {
    // Find all PENDING tasks
    const { data: pendingTasks, error } = await supabase
      .from('AgentTask')
      .select('*')
      .eq('status', 'PENDING')
      .order('priority_score', { ascending: false });

    if (error) {
      throw error;
    }

    if (!pendingTasks || pendingTasks.length === 0) {
      return NextResponse.json({ message: 'No pending tasks found.' });
    }

    console.log(`Found ${pendingTasks.length} pending tasks to dispatch.`);

    // Mock Dispatch Example: Update the first task to IN_PROGRESS
    const { data: dispatchedTask, error: updateError } = await supabase
      .from('AgentTask')
      .update({ status: 'IN_PROGRESS' })
      .eq('id', pendingTasks[0].id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({ 
      message: 'Tasks polled successfully', 
      dispatched: dispatchedTask 
    });

  } catch (error: any) {
    console.error('Error polling tasks:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
