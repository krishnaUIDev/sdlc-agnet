import { supabase } from '@/utils/supabase'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

async function retryTask(formData: FormData) {
  'use server'
  const taskId = formData.get('taskId') as string
  const epicId = formData.get('epicId') as string
  if (!taskId) return

  await supabase.from('AgentTask').update({
    status: 'PENDING',
    output_data: null,
    human_feedback: null
  }).eq('id', taskId)

  revalidatePath(`/epic/${epicId}`)
}

async function resolveHelpTask(formData: FormData) {
  'use server'
  const taskId = formData.get('taskId') as string
  const resolution = formData.get('resolution') as string
  const epicId = formData.get('epicId') as string
  if (!taskId || !resolution) return

  await supabase.from('AgentTask').update({
    status: 'PENDING',
    human_feedback: `[RESOLUTION]: ${resolution}`
  }).eq('id', taskId)

  revalidatePath(`/epic/${epicId}`)
}

async function approveReviewTask(formData: FormData) {
  'use server'
  const taskId = formData.get('taskId') as string
  const epicId = formData.get('epicId') as string
  if (!taskId) return

  await supabase.from('AgentTask').update({
    status: 'COMPLETED'
  }).eq('id', taskId)

  const { data: dependentTasks } = await supabase
    .from('AgentTask')
    .select('id')
    .eq('depends_on_task_id', taskId)
    .eq('status', 'BLOCKED')

  if (dependentTasks && dependentTasks.length > 0) {
    for (const depTask of dependentTasks) {
      await supabase.from('AgentTask').update({
        status: 'PENDING'
      }).eq('id', depTask.id)
    }
  }

  revalidatePath(`/epic/${epicId}`)
}

async function rejectReviewTask(formData: FormData) {
  'use server'
  const taskId = formData.get('taskId') as string
  const feedback = formData.get('feedback') as string
  const epicId = formData.get('epicId') as string
  if (!taskId || !feedback) return

  await supabase.from('AgentTask').update({
    status: 'REJECTED',
    output_data: { error: `Rejected by human review: ${feedback}` }
  }).eq('id', taskId)

  const { data: reviewTask } = await supabase
    .from('AgentTask')
    .select('parent_task_id')
    .eq('id', taskId)
    .single()

  if (reviewTask?.parent_task_id) {
    const { data: devTask } = await supabase
      .from('AgentTask')
      .select('id')
      .eq('parent_task_id', reviewTask.parent_task_id)
      .eq('agent_id', 'dev')
      .single()

    if (devTask) {
      await supabase.from('AgentTask').update({
        status: 'PENDING',
        output_data: null,
        human_feedback: `[REJECTION FEEDBACK]: ${feedback}`
      }).eq('id', devTask.id)

      const subsequentAgents = ['seo', 'qa', 'security', 'review', 'devops']
      await supabase.from('AgentTask').update({
        status: 'BLOCKED',
        output_data: null,
        human_feedback: null
      }).eq('parent_task_id', reviewTask.parent_task_id)
        .in('agent_id', subsequentAgents)
    }
  }

  revalidatePath(`/epic/${epicId}`)
}

const PIPELINE_STEPS = [
  { id: 'jarvis',       label: 'Manager',      icon: '🤖', description: 'Receives epic and delegates to Scrum Master' },
  { id: 'scrum_master', label: 'Scrum Master',  icon: '📋', description: 'Breaks down epic into sub-tasks' },
  { id: 'ux',           label: 'UX Design',     icon: '🎨', description: 'Wireframes & design system' },
  { id: 'dev',          label: 'Developer',      icon: '💻', description: 'Writes application code' },
  { id: 'seo',          label: 'SEO',            icon: '🔍', description: 'Optimizes for search engines' },
  { id: 'qa',           label: 'QA Testing',     icon: '🧪', description: 'Writes & runs test suites' },
  { id: 'security',     label: 'Security',       icon: '🔒', description: 'OWASP vulnerability audit' },
  { id: 'review',       label: 'Code Review',    icon: '✅', description: 'Final quality gate' },
  { id: 'devops',       label: 'DevOps',         icon: '🚀', description: 'Deploys to production' },
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
  // Include the epic itself as the Jarvis task (since Jarvis IS the root epic task)
  const taskMap: Record<string, any> = {
    jarvis: epic, // The root epic record is Jarvis's task
  }
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
                {Object.values(taskMap).filter((t: any) => t.status === 'COMPLETED').length}/{PIPELINE_STEPS.length} completed
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

                      {status === 'FAILED' && output && (() => {
                        let parsedError = output;
                        let isRateLimit = false;
                        let friendlyMsg = "";
                        
                        try {
                          const obj = typeof output === 'string' ? JSON.parse(output) : output;
                          if (obj.error) {
                            friendlyMsg = obj.error.message || "";
                            isRateLimit = obj.error.status === "RESOURCE_EXHAUSTED" || String(friendlyMsg).includes("429") || String(friendlyMsg).includes("quota");
                            parsedError = JSON.stringify(obj, null, 2);
                          } else if (obj.message) {
                            friendlyMsg = obj.message;
                            parsedError = obj.stack || JSON.stringify(obj, null, 2);
                          }
                        } catch (_) {}

                        return (
                          <div className="mt-2 text-xs border rounded-lg overflow-hidden border-red-500/20 bg-red-500/5">
                            <div className="px-3 py-2 text-red-400 font-medium bg-red-950/20 border-b border-red-500/10 flex items-center gap-1.5">
                              <span>✕</span>
                              <span>
                                {isRateLimit 
                                  ? "Gemini API Quota Exceeded (429 Rate Limit)" 
                                  : "Task Failed"}
                              </span>
                            </div>
                            <div className="p-3 text-red-300/80 leading-relaxed font-sans">
                              {friendlyMsg || (typeof output === 'string' ? output : JSON.stringify(output))}
                              
                              <details className="mt-2 group">
                                <summary className="text-[10px] text-zinc-500 cursor-pointer hover:text-zinc-400 transition-colors select-none">
                                  View diagnostic log →
                                </summary>
                                <pre className="mt-2 text-[10px] text-zinc-400 bg-zinc-950 border border-zinc-800/80 rounded-lg p-2.5 overflow-x-auto max-h-32 font-mono whitespace-pre-wrap">
                                  {parsedError}
                                </pre>
                              </details>
                            </div>
                          </div>
                        );
                      })()}

                      {/* 1. Retry Button for Failed Tasks */}
                      {status === 'FAILED' && task && (
                        <form action={retryTask} className="mt-3">
                          <input type="hidden" name="taskId" value={task.id} />
                          <input type="hidden" name="epicId" value={epic.id} />
                          <button
                            type="submit"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-800 text-zinc-200 border border-zinc-700 hover:border-zinc-600 transition-all cursor-pointer shadow-sm hover:shadow-md"
                          >
                            🔄 Retry Agent
                          </button>
                        </form>
                      )}

                      {/* 2. Interactive Help Response Form */}
                      {status === 'NEEDS_HELP' && task && (
                        <div className="mt-3 p-3.5 border rounded-lg border-amber-500/20 bg-amber-500/5 space-y-2.5">
                          <p className="text-[11px] font-medium text-amber-400">💡 Provide Resolution Details</p>
                          <form action={resolveHelpTask} className="space-y-2">
                            <input type="hidden" name="taskId" value={task.id} />
                            <input type="hidden" name="epicId" value={epic.id} />
                            <textarea
                              name="resolution"
                              rows={2}
                              required
                              placeholder="e.g., Use Outfit font. Integrate Google OAuth only. Keep the layout super compact."
                              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-2 text-[11px] text-zinc-200 placeholder:text-zinc-600 font-sans focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                            />
                            <button
                              type="submit"
                              className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-[10px] font-semibold bg-amber-500 hover:bg-amber-400 active:bg-amber-500 text-zinc-950 transition-colors cursor-pointer shadow-sm"
                            >
                              🚀 Send Resolution & Resume
                            </button>
                          </form>
                        </div>
                      )}

                      {/* 3. Human Release Gate (Approve / Reject) for Needs Review */}
                      {status === 'NEEDS_REVIEW' && task && (
                        <div className="mt-3 p-4 border rounded-xl border-purple-500/20 bg-purple-500/5 space-y-4">
                          <div>
                            <p className="text-xs font-semibold text-purple-400">🛡️ Human Release Gate</p>
                            <p className="text-[10px] text-zinc-500 leading-relaxed mt-0.5">Please review the agent output and decide whether to approve deployment or send the code back to the developer with adjustments.</p>
                          </div>

                          {output && (
                            <details className="group border border-purple-500/10 rounded-lg bg-zinc-950 overflow-hidden" open>
                              <summary className="px-3 py-2 text-[11px] text-purple-300 font-medium cursor-pointer hover:text-purple-200 bg-purple-950/10 border-b border-purple-500/5 select-none">
                                View Review Report
                              </summary>
                              <pre className="text-[10px] text-zinc-300 p-3 overflow-x-auto max-h-40 whitespace-pre-wrap leading-relaxed">
                                {output}
                              </pre>
                            </details>
                          )}

                          <div className="flex flex-col sm:flex-row gap-3 pt-1 border-t border-purple-500/10">
                            {/* Approve */}
                            <form action={approveReviewTask} className="flex-1">
                              <input type="hidden" name="taskId" value={task.id} />
                              <input type="hidden" name="epicId" value={epic.id} />
                              <button
                                type="submit"
                                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-500 text-zinc-950 transition-colors cursor-pointer shadow-sm hover:shadow-md"
                              >
                                ✅ Approve & Deploy
                              </button>
                            </form>

                            {/* Reject / Send back */}
                            <details className="flex-1 group">
                              <summary className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold border border-red-500/20 hover:border-red-500/35 bg-red-500/5 hover:bg-red-500/10 text-red-400 transition-all cursor-pointer shadow-sm select-none">
                                ❌ Reject & Fix
                              </summary>
                              <form action={rejectReviewTask} className="mt-2.5 space-y-2 bg-zinc-950 border border-zinc-800 rounded-lg p-3">
                                <input type="hidden" name="taskId" value={task.id} />
                                <input type="hidden" name="epicId" value={epic.id} />
                                <textarea
                                  name="feedback"
                                  rows={2}
                                  required
                                  placeholder="Provide reason & what the developer should fix..."
                                  className="w-full bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-2 text-[11px] text-zinc-200 placeholder:text-zinc-600 font-sans focus:outline-none focus:ring-1 focus:ring-red-500/50"
                                />
                                <button
                                  type="submit"
                                  className="w-full inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-md text-[10px] font-bold bg-red-500 hover:bg-red-400 active:bg-red-500 text-zinc-950 transition-colors cursor-pointer shadow-sm"
                                >
                                  ↩ Send back to Developer
                                </button>
                              </form>
                            </details>
                          </div>
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
