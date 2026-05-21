import { useState, useCallback } from 'react'
import type { Sequence, Review } from '@/shared/schemas'

export interface SequenceSummary {
  id: string
  titre: string
  niveau: string
  theme: string
  createdAt: string
  seanceCount: number
}

export function useSequenceStore() {
  const [savedList, setSavedList] = useState<SequenceSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/sequences')
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      setSavedList(data.sequences ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }, [])

  const save = useCallback(async (sequence: Sequence, review?: Review | null): Promise<string | null> => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sequence, review }),
      })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      await refresh()
      return data.id
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
      return null
    } finally {
      setLoading(false)
    }
  }, [refresh])

  const load = useCallback(async (id: string): Promise<{ sequence: Sequence; review: Review | null } | null> => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/sequences/${id}`)
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      const data = await res.json()
      return data
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const remove = useCallback(async (id: string): Promise<boolean> => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/sequences/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`Erreur ${res.status}`)
      await refresh()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
      return false
    } finally {
      setLoading(false)
    }
  }, [refresh])

  return { savedList, loading, error, refresh, save, load, remove }
}
