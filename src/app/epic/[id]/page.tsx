import { supabase } from '@/utils/supabase'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function EpicDetail({ params }: { params: { id: string } }) {
  const { id } = await params;

  // Fetch the Epic
  const { data: epic } = await supabase
    .from('AgentTask')
    .select('*')
    .eq('id', id)
    .single()

  if (!epic) {
    return <div className="p-8 text-white">Epic not found.</div>
  }

  // Fetch sub-tasks (where parent_task_id = epic id)
  const { data: subTasks } = await supabase
    .from('AgentTask')
    .select('*')
    .eq('parent_task_id', id)
    .order('created_at', { ascending: true })
    
  const tasks = subTasks || []
  const allTaskIds = [id, ...tasks.map((t: any) => t.id)]

  // Fetch logs related to the epic OR any of its subtasks
  const { data: logs } = await supabase
    .from('AgentLog')
    .select('*')
    .in('task_id', allTaskIds)
    .order('created_at', { ascending: false })
    .limit(100)

  const logList = logs || []

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8 font-sans flex flex-col md:flex-row gap-8">
      <div className="w-full md:w-2/3 space-y-8">
        <header className="border-b border-zinc-800 pb-6">
          <div className="flex items-center gap-4 mb-4">
            <Link href="/" className="text-zinc-500 hover:text-white transition-colors">
              ← Back to Dashboard
            </Link>
            <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${
              epic.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20' :
              epic.status === 'PENDING' ? 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/20' :
              'bg-blue-500/10 text-blue-400 ring-blue-500/20'
            }`}>
              {epic.status}
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Epic: {epic.id.split('-')[0]}</h1>
          <p className="text-zinc-300 mt-2 text-lg">{epic.task_payload}</p>
        </header>

        <div>
          <h2 className="text-xl font-semibold mb-4 text-zinc-200">Sub-Agents Flow</h2>
          <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/50">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-800 bg-zinc-900/80">
                <tr>
                  <th className="px-4 py-3 font-medium text-zinc-300">Agent</th>
                  <th className="px-4 py-3 font-medium text-zinc-300">Status</th>
                  <th className="px-4 py-3 font-medium text-zinc-300">Output / Feedback</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {tasks.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-zinc-500">
                      Jarvis hasn't assigned this to the Scrum Master yet.
                    </td>
                  </tr>
                ) : (
                  tasks.map((task: any) => (
                    <tr key={task.id} className="hover:bg-zinc-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full bg-indigo-500/10 px-2 py-1 text-xs font-medium text-indigo-400 ring-1 ring-inset ring-indigo-500/20">
                          {task.agent_id}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                          task.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20' :
                          task.status === 'PENDING' ? 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/20' :
                          task.status === 'IN_PROGRESS' ? 'bg-blue-500/10 text-blue-400 ring-blue-500/20' :
                          task.status === 'NEEDS_HELP' ? 'bg-amber-500/10 text-amber-400 ring-amber-500/20' :
                          'bg-red-500/10 text-red-400 ring-red-500/20'
                        }`}>
                          {task.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-300 text-xs max-w-md break-words whitespace-pre-wrap">
                        {task.human_feedback ? `Feedback: ${task.human_feedback}` : task.output_data?.result || "Waiting..."}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Live Terminal for this Epic */}
      <div className="w-full md:w-1/3 flex flex-col bg-[#0d0d0d] rounded-xl border border-zinc-800 overflow-hidden h-[80vh]">
        <div className="bg-zinc-900 border-b border-zinc-800 px-4 py-3 flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
          <span className="ml-2 text-xs text-zinc-400 font-mono tracking-wider">EPIC_TERMINAL</span>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs flex flex-col-reverse">
          {logList.map((log: any) => (
            <div key={log.id} className="text-zinc-300 flex items-start">
              <span className="text-zinc-600 mr-2 shrink-0">{new Date(log.created_at).toLocaleTimeString([], { hour12: false })}</span>
              <span className="text-indigo-400 mr-2 shrink-0">[{log.agent_id.toUpperCase()}]</span>
              <span className="break-words">{log.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
