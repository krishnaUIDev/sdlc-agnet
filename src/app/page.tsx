import { supabase } from '@/utils/supabase'

export const dynamic = 'force-dynamic'

export default async function Dashboard() {
  // Fetch tasks
  const { data: tasks, error } = await supabase
    .from('AgentTask')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error("Error fetching tasks:", error)
  }

  const taskList = tasks || []

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex justify-between items-end border-b border-zinc-800 pb-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Agent Dashboard</h1>
            <p className="text-zinc-400 mt-1">Single source of truth for all autonomous tasks.</p>
          </div>
          <div className="text-sm text-zinc-500">
            Live Database View
          </div>
        </header>

        <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/50">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-900/80">
              <tr>
                <th className="px-4 py-3 font-medium text-zinc-300">ID</th>
                <th className="px-4 py-3 font-medium text-zinc-300">Agent</th>
                <th className="px-4 py-3 font-medium text-zinc-300">Status</th>
                <th className="px-4 py-3 font-medium text-zinc-300">Priority</th>
                <th className="px-4 py-3 font-medium text-zinc-300">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {taskList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                    No tasks found. Jarvis needs to get to work!
                  </td>
                </tr>
              ) : (
                taskList.map((task: any) => (
                  <tr key={task.id} className="hover:bg-zinc-800/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                      {task.id.split('-')[0]}
                    </td>
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
                        task.status === 'NEEDS_REVIEW' ? 'bg-amber-500/10 text-amber-400 ring-amber-500/20' :
                        'bg-red-500/10 text-red-400 ring-red-500/20'
                      }`}>
                        {task.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-300">{task.priority_score?.toFixed(2) || 0.0}</td>
                    <td className="px-4 py-3 text-zinc-500">{new Date(task.created_at).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
