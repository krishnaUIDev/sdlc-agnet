import { supabase } from '@/utils/supabase'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const PIPELINE_STEPS = [
  { id: 'scrum_master', label: 'Scrum Master', icon: '📋', description: 'Breaks down epic into sub-tasks' },
  { id: 'ux',           label: 'UX Design',    icon: '🎨', description: 'Wireframes & design system' },
  { id: 'dev',          label: 'Developer',     icon: '💻', description: 'Writes application code' },
  { id: 'seo',          label: 'SEO',           icon: '🔍', description: 'Optimizes for search engines' },
  { id: 'qa',           label: 'QA Testing',    icon: '🧪', description: 'Writes & runs test suites' },
  { id: 'security',     label: 'Security',      icon: '🔒', description: 'OWASP vulnerability audit' },
  { id: 'review',       label: 'Code Review',   icon: '✅', description: 'Final quality gate' },
  { id: 'devops',       label: 'DevOps',        icon: '🚀', description: 'Deploys to production' },
]

type TaskStatus = 'PENDING' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'BLOCKED' | 'NEEDS_HELP' | 'NEEDS_REVIEW' | 'REJECTED'

function getStatusStyle(status: TaskStatus | 'WAITING') {
  const map: Record<string, { bg: string; text: string; ring: string; label: string; pulse?: boolean }> = {
    COMPLETED:    { bg: 'bg-emerald-500/10', text: 'text-emerald-400', ring: 'ring-emerald-500/20', label: '✓ Completed' },
    IN_PROGRESS:  { bg: 'bg-blue-500/10',    text: 'text-blue-400',    ring: 'ring-blue-500/20',    label: '● Running...', pulse: true },
    PENDING:      { bg: 'bg-indigo-500/10',   text: 'text-indigo-400',  ring: 'ring-indigo-500/20',  label: '◎ Queued' },
    BLOCKED:      { bg: 'bg-zinc-500/10',     text: 'text-zinc-500',    ring: 'ring-zinc-500/20',    label: '◻ Blocked' },
    NEEDS_HELP:   { bg: 'bg-amber-500/10',    text: 'text-amber-400',   ring: 'ring-amber-500/20',   label: '? Needs Help' },
    NEEDS_REVIEW: { bg: 'bg-purple-500/10',   text: 'text-purple-400',  ring: 'ring-purple-500/20',  label: '⏸ Needs Review' },
    FAILED:       { bg: 'bg-red-500/10',      text: 'text-red-400',     ring: 'ring-red-500/20',     label: '✕ Failed' },
    REJECTED:     { bg: 'bg-red-500/10',      text: 'text-red-400',     ring: 'ring-red-500/20',     label: '↩ Rejected' },
    WAITING:      { bg: 'bg-zinc-800/30',     text: 'text-zinc-700',    ring: 'ring-zinc-800/30',    label: '… Waiting' },
  }
  return map[status] || map.WAITING
}

function getNodeColor(status: TaskStatus | 'WAITING') {
  const map: Record<string, string> = {
    COMPLETED: 'bg-emerald-500 shadow-emerald-500/30',
    IN_PROGRESS: 'bg-blue-500 shadow-blue-500/40 animate-pulse',
    PENDING: 'bg-indigo-500/80 shadow-indigo-500/20',
    BLOCKED: 'bg-zinc-700',
    NEEDS_HELP: 'bg-amber-500 shadow-amber-500/30 animate-pulse',
    FAILED: 'bg-red-500 shadow-red-500/30',
    REJECTED: 'bg-red-500 shadow-red-500/30',
    NEEDS_REVIEW: 'bg-purple-500 shadow-purple-500/30',
    WAITING: 'bg-zinc-800',
  }
  return map[status] || map.WAITING
}

function getLineColor(status: TaskStatus | 'WAITING') {
  if (status === 'COMPLETED') return 'bg-emerald-500/40'
  if (status === 'IN_PROGRESS') return 'bg-blue-500/30 animate-pulse'
  return 'bg-zinc-800'
}

export default async function EpicDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

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

  // Fetch scrum_master task (direct child)
  const { data: scrumTasks } = await supabase
    .from('AgentTask')
    .select('*')
    .eq('parent_task_id', id)
    .order('created_at', { ascending: true })

  const scrumTask = scrumTasks?.[0]

  // Fetch worker sub-tasks (grandchildren via scrum_master)
  let workerTasks: any[] = []
  if (scrumTask) {
    const { data: workers } = await supabase
      .from('AgentTask')
      .select('*')
      .eq('parent_task_id', scrumTask.id)
      .order('created_at', { ascending: true })
    workerTasks = workers || []
  }

  const allSubTasks = scrumTask ? [scrumTask, ...workerTasks] : []

  // Build a lookup: agent_id -> task
  const taskMap: Record<string, any> = {}
  for (const t of allSubTasks) {
    taskMap[t.agent_id] = t
  }

  // Logs
  const allTaskIds = [id, ...allSubTasks.map((t: any) => t.id)]
  const { data: logs } = await supabase
    .from('AgentLog')
    .select('*')
    .in('task_id', allTaskIds)
    .order('created_at', { ascending: false })
    .limit(100)

  const logList = logs || []

  // Find the currently active step index
  let activeIndex = -1
  for (let i = 0; i < PIPELINE_STEPS.length; i++) {
    const task = taskMap[PIPELINE_STEPS[i].id]
    if (task && (task.status === 'IN_PROGRESS' || task.status === 'NEEDS_HELP')) {
      activeIndex = i
      break
    }
  }

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
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${getStatusStyle(epic.status).bg} ${getStatusStyle(epic.status).text} ${getStatusStyle(epic.status).ring}`}>
                {epic.status}
              </span>
            </div>
            <p className="text-zinc-400 mt-2 text-sm leading-relaxed whitespace-pre-wrap max-w-2xl">{epic.task_payload}</p>
          </div>

          {/* Pipeline Visualization */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Agent Pipeline</h2>
              <span className="text-[10px] text-zinc-600 font-mono">
                {allSubTasks.filter((t: any) => t.status === 'COMPLETED').length}/{PIPELINE_STEPS.length} completed
              </span>
            </div>

            <div className="p-5">
              {PIPELINE_STEPS.map((step, index) => {
                const task = taskMap[step.id]
                const status: TaskStatus | 'WAITING' = task?.status || 'WAITING'
                const style = getStatusStyle(status)
                const nodeColor = getNodeColor(status)
                const isLast = index === PIPELINE_STEPS.length - 1
                const output = task?.output_data?.result || task?.output_data?.error
                const feedback = task?.human_feedback

                return (
                  <div key={step.id} className="flex gap-4">
                    {/* Vertical Timeline */}
                    <div className="flex flex-col items-center">
                      <div className={`w-4 h-4 rounded-full shrink-0 shadow-lg ${nodeColor}`} />
                      {!isLast && (
                        <div className={`w-0.5 flex-1 min-h-[40px] ${getLineColor(status)}`} />
                      )}
                    </div>

                    {/* Step Content */}
                    <div className={`pb-6 flex-1 min-w-0 ${status === 'WAITING' ? 'opacity-40' : ''}`}>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-base">{step.icon}</span>
                        <span className="text-sm font-medium text-zinc-200">{step.label}</span>
                        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${style.bg} ${style.text} ${style.ring}`}>
                          {style.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-600 mb-1">{step.description}</p>

                      {feedback && (
                        <div className="mt-1.5 text-xs bg-amber-500/5 border border-amber-500/10 rounded-lg px-3 py-2 text-amber-300/80">
                          💬 {feedback}
                        </div>
                      )}

                      {status === 'FAILED' && output && (
                        <div className="mt-1.5 text-xs bg-red-500/5 border border-red-500/10 rounded-lg px-3 py-2 text-red-300/80 font-mono">
                          ✕ {output}
                        </div>
                      )}

                      {status === 'COMPLETED' && output && (
                        <details className="mt-1.5 group">
                          <summary className="text-[11px] text-zinc-600 cursor-pointer hover:text-zinc-400 transition-colors select-none">
                            View output →
                          </summary>
                          <pre className="mt-1.5 text-[11px] text-zinc-400 bg-zinc-950 border border-zinc-800 rounded-lg p-3 overflow-x-auto max-h-48 whitespace-pre-wrap">
                            {output}
                          </pre>
                        </details>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
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
