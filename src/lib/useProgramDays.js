import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase.js'

// All program days of the trainer: { byClient: { clientId: [days] }, byId: { dayId: day }, reload }
export function useProgramDays(trainerId) {
  const [v, setV] = useState({ byClient: {}, byId: {} })
  const reload = useCallback(async () => {
    const { data } = await supabase.from('programs').select('client_id, program_days(id, title, focus, position)').eq('trainer_id', trainerId)
    const byClient = {}, byId = {}
    for (const p of data || []) {
      byClient[p.client_id] = (p.program_days || []).sort((a, b) => a.position - b.position)
      for (const d of p.program_days || []) byId[d.id] = d
    }
    setV({ byClient, byId })
  }, [trainerId])
  useEffect(() => { reload() }, [reload])
  return { ...v, reload }
}
