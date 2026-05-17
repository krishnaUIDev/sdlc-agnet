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

  revalidatePath('/')
}

async function deleteEpic(formData: FormData) {
  'use server'
  const epicId = formData.get('epicId') as string
  if (!epicId) return

  // Delete child logs first
  const { data: children } = await supabase
    .from('AgentTask')
    .select('id')
    .eq('parent_task_id', epicId)

  const childIds = children?.map((c: any) => c.id) || []
  const allIds = [epicId, ...childIds]

  // Also get grandchildren (scrum_master's children)
  for (const childId of childIds) {
    const { data: grandchildren } = await supabase
      .from('AgentTask')
      .select('id')
      .eq('parent_task_id', childId)
    if (grandchildren) {
      allIds.push(...grandchildren.map((g: any) => g.id))
    }
  }

  // Delete logs for all related tasks
  await supabase.from('AgentLog').delete().in('task_id', allIds)

  // Delete grandchildren, then children, then epic
  for (const childId of childIds) {
    await supabase.from('AgentTask').delete().eq('parent_task_id', childId)
  }
  await supabase.from('AgentTask').delete().eq('parent_task_id', epicId)
  await supabase.from('AgentTask').delete().eq('id', epicId)

  revalidatePath('/')
}

export default async function Dashboard() {
  // Fetch all epics (Jarvis tasks)
  const { data: tasks } = await supabase
    .from('AgentTask')
    .select('*')
    .eq('agent_id', 'jarvis')
    .order('created_at', { ascending: false })

  // Fetch all tasks in the system to calculate active pipeline status
  const { data: allTasks } = await supabase
    .from('AgentTask')
    .select('id, agent_id, status, parent_task_id')

  const { data: logs } = await supabase
    .from('AgentLog')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  const epicList = tasks || []
  const taskPool = allTasks || []
  const logList = logs || []

  // Helper to calculate the overall progress state of the Epic
  function getEpicAggregateStatus(epic: any): { status: string; stepLabel?: string } {
    if (epic.status === 'PENDING') return { status: 'PENDING' }
    if (epic.status === 'FAILED') return { status: 'FAILED', stepLabel: 'Manager' }
    if (epic.status === 'IN_PROGRESS') return { status: 'IN_PROGRESS', stepLabel: 'Manager' }

    // Find children (Scrum Master task)
    const children = taskPool.filter((t: any) => t.parent_task_id === epic.id)
    const childIds = children.map((c: any) => c.id)

    // Find grandchildren (UX, Dev, QA, etc.)
    const grandchildren = taskPool.filter((t: any) => childIds.includes(t.parent_task_id))

    const subTasks = [...children, ...grandchildren]

    if (subTasks.length === 0) {
      return { status: 'IN_PROGRESS', stepLabel: 'Scrum Master' }
    }

    // Friendly names mapping
    const agentLabels: Record<string, string> = {
      jarvis: 'Manager',
      scrum_master: 'Scrum Master',
      ux: 'UX Design',
      dev: 'Developer',
      seo: 'SEO',
      qa: 'QA Testing',
      security: 'Security',
      review: 'Code Review',
      devops: 'DevOps',
    }

    // Precedence 1: If any subtask is failed/rejected -> FAILED
    const failedTask = subTasks.find((t: any) => t.status === 'FAILED' || t.status === 'REJECTED')
    if (failedTask) {
      return { status: 'FAILED', stepLabel: agentLabels[failedTask.agent_id] || failedTask.agent_id }
    }

    // Precedence 2: If any subtask needs help -> NEEDS_HELP
    const helpTask = subTasks.find((t: any) => t.status === 'NEEDS_HELP')
    if (helpTask) {
      return { status: 'NEEDS_HELP', stepLabel: agentLabels[helpTask.agent_id] || helpTask.agent_id }
    }

    // Precedence 3: If any subtask needs review -> NEEDS_REVIEW
    const reviewTask = subTasks.find((t: any) => t.status === 'NEEDS_REVIEW')
    if (reviewTask) {
      return { status: 'NEEDS_REVIEW', stepLabel: agentLabels[reviewTask.agent_id] || reviewTask.agent_id }
    }

    // Precedence 4: If all subtasks are completed -> COMPLETED
    if (subTasks.every((t: any) => t.status === 'COMPLETED')) {
      return { status: 'COMPLETED' }
    }

    // Precedence 5: If any subtask is active -> IN_PROGRESS
    const activeTask = subTasks.find((t: any) => t.status === 'IN_PROGRESS')
    if (activeTask) {
      return { status: 'IN_PROGRESS', stepLabel: agentLabels[activeTask.agent_id] || activeTask.agent_id }
    }

    // Otherwise, the pipeline is active
    return { status: 'IN_PROGRESS' }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans">
      <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col lg:flex-row gap-6">

        {/* Left Column — Main Content */}
        <div className="flex-1 space-y-6 min-w-0">
          <header>
            <h1 className="text-3xl font-bold tracking-tight">🚀 SDLC Command Center</h1>
            <p className="text-zinc-500 mt-1 text-sm">Submit features. Agents handle the rest.</p>
          </header>

          {/* Epic Submission Card */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">New Epic</h2>
            <form action={createEpic} className="space-y-4">
              <textarea
                name="feature"
                rows={5}
                placeholder={`Describe the feature in detail...\n\nExample:\nAs a user, I want a dark-mode login page with OAuth (Google, GitHub).\nAcceptance criteria:\n- Responsive on mobile\n- Password strength meter\n- Rate limiting on login attempts`}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 font-mono resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                required
              />
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-zinc-500 cursor-pointer hover:text-zinc-300 transition-colors">
                  <span className="inline-flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg px-3 py-2 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                    Attach files
                  </span>
                  <input type="file" name="reference_file" className="hidden" multiple />
                </label>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-all shadow-lg shadow-indigo-500/10 hover:shadow-indigo-500/20"
                >
                  Launch Agents →
                </button>
              </div>
            </form>
          </div>

          {/* Epics Table */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/60">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Epics</h2>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-800/50">
                <tr className="text-zinc-500 text-xs uppercase tracking-wider">
                  <th className="px-5 py-3 font-medium">ID</th>
                  <th className="px-5 py-3 font-medium">Feature</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Created</th>
                  <th className="px-5 py-3 font-medium text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {epicList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-zinc-600 text-sm">
                      No epics yet. Submit one above to start the autonomous pipeline.
                    </td>
                  </tr>
                ) : (
                  epicList.map((task: any) => (
                    <tr key={task.id} className="hover:bg-zinc-800/30 transition-colors group">
                      <td className="px-5 py-3.5 font-mono text-xs">
                        <Link
                          href={`/epic/${task.id}`}
                          className="text-indigo-400 hover:text-indigo-300 transition-colors group-hover:underline"
                        >
                          {task.id.split('-')[0]}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-zinc-300 max-w-xs truncate" title={task.task_payload}>
                        {task.task_payload}
                      </td>
                      <td className="px-5 py-3.5">
                        {(() => {
                          const res = getEpicAggregateStatus(task)
                          return (
                            <div className="flex items-center gap-2">
                              <StatusBadge status={res.status} />
                              {res.stepLabel && (res.status === 'FAILED' || res.status === 'NEEDS_HELP' || res.status === 'NEEDS_REVIEW' || res.status === 'IN_PROGRESS') && (
                                <span className="text-[11px] text-zinc-500 font-mono tracking-tight shrink-0">
                                  ({res.stepLabel})
                                </span>
                              )}
                            </div>
                          )
                        })()}
                      </td>
                      <td className="px-5 py-3.5 text-zinc-600 text-xs text-right tabular-nums">
                        {new Date(task.created_at).toLocaleDateString()} {new Date(task.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <form action={deleteEpic}>
                          <input type="hidden" name="epicId" value={task.id} />
                          <button
                            type="submit"
                            className="text-zinc-700 hover:text-red-400 transition-colors text-xs"
                            title="Delete this epic and all sub-tasks"
                          >
                            ✕
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column — Live Terminal */}
        <div className="w-full lg:w-80 xl:w-96 shrink-0">
          <div className="sticky top-8 rounded-xl border border-zinc-800 bg-[#0a0a0a] overflow-hidden flex flex-col h-[calc(100vh-4rem)]">
            <div className="bg-zinc-900/80 border-b border-zinc-800 px-4 py-2.5 flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/80"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/80"></div>
              <span className="ml-2 text-[10px] text-zinc-500 font-mono tracking-widest uppercase">Live Feed</span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5 font-mono text-[11px] leading-relaxed flex flex-col-reverse">
              {logList.length === 0 ? (
                <p className="text-zinc-700 text-center py-8">Waiting for agent activity...</p>
              ) : (
                logList.map((log: any) => (
                  <div key={log.id} className="flex items-start gap-1.5 text-zinc-400">
                    <span className="text-zinc-700 shrink-0">{new Date(log.created_at).toLocaleTimeString([], { hour12: false })}</span>
                    <span className="text-indigo-500 shrink-0">[{log.agent_id.toUpperCase()}]</span>
                    <span className="break-words">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    COMPLETED: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20',
    PENDING: 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/20',
    IN_PROGRESS: 'bg-blue-500/10 text-blue-400 ring-blue-500/20',
    NEEDS_HELP: 'bg-amber-500/10 text-amber-400 ring-amber-500/20',
    NEEDS_REVIEW: 'bg-purple-500/10 text-purple-400 ring-purple-500/20',
    BLOCKED: 'bg-red-500/10 text-red-400 ring-red-500/20',
    REJECTED: 'bg-red-500/10 text-red-400 ring-red-500/20',
    FAILED: 'bg-red-500/10 text-red-400 ring-red-500/20',
  }
  const cls = styles[status] || 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/20'

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${cls}`}>
      {status}
    </span>
  )
}
