import { supabase } from '@/utils/supabase'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

async function createEpic(formData: FormData) {
  'use server'
  const feature = formData.get('feature') as string
  if (!feature) return

  await supabase.from('AgentTask').insert([{
    agent_id: 'jarvis',
    status: 'PENDING',
    priority_score: 10.0,
    task_payload: feature,
  }])
  
  // The Realtime Daemon will automatically pick this up via WebSockets!
  revalidatePath('/')
}

export default async function Dashboard() {
    // Fetch only top-level epics
    const { data: tasks, error } = await supabase
      .from('AgentTask')
      .select('*')
      .is('parent_task_id', null)
      .order('created_at', { ascending: false })
  
    // Fetch logs globally for the terminal
    const { data: logs, error: logError } = await supabase
      .from('AgentLog')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
  
    if (error) console.error("Error fetching tasks:", error)
    if (logError) console.error("Error fetching logs:", logError)
  
    const taskList = tasks || []
    const logList = logs || []
  
    return (
      <div className="min-h-screen bg-zinc-950 text-white p-8 font-sans">
        <div className="max-w-6xl mx-auto space-y-8">
          <header className="border-b border-zinc-800 pb-6">
            <h1 className="text-3xl font-bold tracking-tight">SDLC Agent Dashboard</h1>
            <p className="text-zinc-400 mt-1">Single source of truth for all autonomous tasks.</p>
          </header>
  
          {/* New Epic Submission Card */}
          <div className="bg-[#0d0d0d] border border-zinc-800 rounded-xl p-6 shadow-2xl">
            <h2 className="text-xl font-semibold mb-4 text-zinc-200">Submit New Epic</h2>
            <form action={createEpic} className="flex flex-col gap-4">
              <textarea 
                name="feature"
                placeholder="Paste all feature requirements, user stories, and acceptance criteria here..." 
                className="bg-zinc-900 border border-zinc-700 text-white rounded-lg px-4 py-3 w-full h-32 resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                required
              />
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-zinc-400 font-medium">Attach Reference File:</label>
                  <input 
                    type="file" 
                    name="reference_file"
                    className="text-sm text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-zinc-800 file:text-white hover:file:bg-zinc-700"
                  />
                </div>
                <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 py-3 rounded-lg transition-colors w-full md:w-auto shadow-lg shadow-indigo-500/20">
                  Launch Autonomous Agents →
                </button>
              </div>
            </form>
          </div>
  
          <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/50">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-800 bg-zinc-900/80">
                <tr>
                  <th className="px-4 py-3 font-medium text-zinc-300">Epic ID</th>
                  <th className="px-4 py-3 font-medium text-zinc-300">Description</th>
                  <th className="px-4 py-3 font-medium text-zinc-300">Status</th>
                  <th className="px-4 py-3 font-medium text-zinc-300">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {taskList.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                      No Epics found. Submit one to start the swarm!
                    </td>
                  </tr>
                ) : (
                  taskList.map((task: any) => (
                    <tr key={task.id} className="hover:bg-zinc-800/50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs">
                        <Link href={`/epic/${task.id}`} className="text-indigo-400 hover:text-indigo-300 hover:underline">
                          {task.id.split('-')[0]} ↗
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-zinc-300 truncate max-w-[200px]" title={task.task_payload}>
                        {task.task_payload}
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
                      <td className="px-4 py-3 text-zinc-500">{new Date(task.created_at).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
  
        {/* Live Terminal / Activity Feed */}
        <div className="w-full md:w-1/3 flex flex-col bg-[#0d0d0d] rounded-xl border border-zinc-800 overflow-hidden h-[80vh]">
          <div className="bg-zinc-900 border-b border-zinc-800 px-4 py-3 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span className="ml-2 text-xs text-zinc-400 font-mono tracking-wider">LIVE_ACTIVITY_FEED</span>
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
