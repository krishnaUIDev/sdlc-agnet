'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export default function RealtimeRefresher() {
  const router = useRouter()

  useEffect(() => {
    if (!url || !key) {
      console.warn('[RealtimeRefresher] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY — live updates disabled.')
      return
    }

    const supabase = createClient(url, key)

    let reloadTimeout: any = null
    const triggerReload = () => {
      if (reloadTimeout) clearTimeout(reloadTimeout)
      reloadTimeout = setTimeout(() => {
        window.location.reload()
      }, 800) // 800ms debounce to gather simultaneous/rapid event bursts (like multiple logs)
    }

    const channel = supabase
      .channel('ui-refresh')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'AgentTask' },
        () => triggerReload()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'AgentLog' },
        () => triggerReload()
      )
      .subscribe()

    return () => {
      if (reloadTimeout) clearTimeout(reloadTimeout)
      supabase.removeChannel(channel)
    }
  }, [router])

  return null
}
