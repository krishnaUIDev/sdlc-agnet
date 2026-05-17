import { supabase } from '@/utils/supabase'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    COMPLETED: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20',
    PENDING: 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/20',
    IN_PROGRESS: 'bg-blue-500/10 text-blue-400 ring-blue-500/20',
    NEEDS_HELP: 'bg-amber-500/10 text-amber-400 ring-amber-500/20',
    NEEDS_REVIEW: 'bg-purple-500/10 text-purple-400 ring-purple-500/20',
    BLOCKED: 'bg-red-500/10 text-red-400 ring-red-500/20',
    REJECTED: 'bg-red-500/10 text-red-400 ring-red-500/20',
  }
  const cls = styles[status] || 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/20'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${cls}`}>
      {status}
    </span>
  )
}

const AGENT_ORDER = ['scrum_master', 'ux', 'dev', 'seo', 'qa', 'security', 'review', 'devops']

const AGENT_LABELS: Record<string, { label: string; icon: string }> = {
  scrum_master: { label: 'Scrum Master', icon: '📋' },
  ux: { label: 'UX Design', icon: '🎨' },
  dev: { label: 'Developer', icon: '💻' },
  seo: { label: 'SEO', icon: '🔍' },
  qa: { label: 'QA Testing', icon: '🧪' },
  security: { label: 'Security', icon: '🔒' },
  review: { label: 'Code Review', icon: '✅' },
  devops: { label: 'DevOps', icon: '🚀' },
}

export default async function EpicDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // Fetch the Epic
  const { data: epic } = await supabase
    .from('AgentTask')
    .select('*')
    .eq('id', id)
    .single()

  if (!epic) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-zinc-500 text-lg">Epic not found.</p>
          <Link href="/" className="text-indigo-400 hover:text-indigo-300 text-sm">← Back to Dashboard</Link>
        </div>
      </div>
    )
  }

  // Fetch the scrum_master task (direct child of this epic)
  const { data: scrumTasks } = await supabase
    .from('AgentTask')
    .select('*')
    .eq('parent_task_id', id)
    .order('created_at', { ascending: true })

  const scrumTask = scrumTasks?.[0]

  // Fetch worker sub-tasks (children of the scrum_master task)
  let workerTasks: any[] = []
  if (scrumTask) {
    const { data: workers } = await supabase
      .from('AgentTask')
      .select('*')
      .eq('parent_task_id', scrumTask.id)
      .order('created_at', { ascending: true })
    workerTasks = workers || []
  }

  // Merge scrum_master + workers for display
  const allSubTasks = scrumTask ? [scrumTask, ...workerTasks] : []

  // Collect all task IDs for log filtering
  const allTaskIds = [id, ...allSubTasks.map((t: any) => t.id)]
  const { data: logs } = await supabase
    .from('AgentLog')
    .select('*')
    .in('task_id', allTaskIds)
    .order('created_at', { ascending: false })
    .limit(100)

  const logList = logs || []

  // Sort sub-tasks by AGENT_ORDER
  const sortedTasks = [...allSubTasks].sort((a, b) => {
    const ai = AGENT_ORDER.indexOf(a.agent_id)
    const bi = AGENT_ORDER.indexOf(b.agent_id)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans">
      <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col lg:flex-row gap-6">

        {/* Left Column */}
        <div className="flex-1 space-y-6 min-w-0">
          {/* Header */}
          <div>
            <Link href="/" className="text-zinc-600 hover:text-zinc-300 text-xs uppercase tracking-wider transition-colors">
              ← Dashboard
            </Link>
            <div className="flex items-center gap-3 mt-2">
              <h1 className="text-2xl font-bold tracking-tight">Epic {id.split('-')[0]}</h1>
              <StatusBadge status={epic.status} />
            </div>
            <p className="text-zinc-400 mt-2 text-sm leading-relaxed whitespace-pre-wrap">{epic.task_payload}</p>
          </div>

          {/* Agent Pipeline */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/60">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Agent Pipeline</h2>
            </div>

            {sortedTasks.length === 0 ? (
              <div className="px-5 py-10 text-center text-zinc-600 text-sm">
                Waiting for Jarvis to delegate to the Scrum Master...
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/50">
                {sortedTasks.map((task: any, index: number) => {
                  const meta = AGENT_LABELS[task.agent_id] || { label: task.agent_id, icon: '⚙️' }
                  const output = task.output_data?.result
                  const feedback = task.human_feedback

                  return (
                    <div key={task.id} className="px-5 py-4 hover:bg-zinc-800/20 transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2.5">
                          <span className="text-base">{meta.icon}</span>
                          <span className="text-sm font-medium text-zinc-200">{meta.label}</span>
                          <span className="text-[10px] text-zinc-700 font-mono">{task.id.split('-')[0]}</span>
                        </div>
                        <StatusBadge status={task.status} />
                      </div>

                      {feedback && (
                        <div className="mt-2 text-xs bg-amber-500/5 border border-amber-500/10 rounded-lg px-3 py-2 text-amber-300/80">
                          💬 {feedback}
                        </div>
                      )}

                      {output && (
                        <details className="mt-2 group">
                          <summary className="text-[11px] text-zinc-600 cursor-pointer hover:text-zinc-400 transition-colors select-none">
                            View output →
                          </summary>
                          <pre className="mt-2 text-[11px] text-zinc-400 bg-zinc-950 border border-zinc-800 rounded-lg p-3 overflow-x-auto max-h-64 whitespace-pre-wrap">
                            {output}
                          </pre>
                        </details>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column — Epic Terminal */}
        <div className="w-full lg:w-80 xl:w-96 shrink-0">
          <div className="sticky top-8 rounded-xl border border-zinc-800 bg-[#0a0a0a] overflow-hidden flex flex-col h-[calc(100vh-4rem)]">
            <div className="bg-zinc-900/80 border-b border-zinc-800 px-4 py-2.5 flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/80"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/80"></div>
              <span className="ml-2 text-[10px] text-zinc-500 font-mono tracking-widest uppercase">Epic Terminal</span>
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
