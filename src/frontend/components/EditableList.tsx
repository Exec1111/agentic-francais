'use client'

import { useState } from 'react'
import { Plus, Trash2, GripVertical, Pencil, Check, X } from 'lucide-react'
import { cn } from '@/shared/utils'

interface EditableListProps {
  items: string[]
  onUpdate: (index: number, value: string) => void
  onAdd: (value: string) => void
  onRemove: (index: number) => void
  bulletColor?: string
  placeholder?: string
  addLabel?: string
}

export function EditableList({
  items,
  onUpdate,
  onAdd,
  onRemove,
  bulletColor = 'text-blue-500',
  placeholder = 'Nouvel élément...',
  addLabel = 'Ajouter',
}: EditableListProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [adding, setAdding] = useState(false)
  const [addDraft, setAddDraft] = useState('')

  const startEdit = (index: number) => {
    setEditingIndex(index)
    setEditDraft(items[index])
  }

  const saveEdit = () => {
    if (editingIndex !== null && editDraft.trim()) {
      onUpdate(editingIndex, editDraft.trim())
    }
    setEditingIndex(null)
  }

  const cancelEdit = () => {
    setEditingIndex(null)
    setEditDraft('')
  }

  const handleAdd = () => {
    if (addDraft.trim()) {
      onAdd(addDraft.trim())
      setAddDraft('')
      setAdding(false)
    }
  }

  return (
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="group flex items-baseline gap-2">
          <span className={cn('shrink-0', bulletColor)}>•</span>

          {editingIndex === i ? (
            <div className="flex-1 flex items-center gap-1">
              <input
                type="text"
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit()
                  if (e.key === 'Escape') cancelEdit()
                }}
                autoFocus
                className="flex-1 bg-gray-950 border border-primary-500/50 rounded px-2 py-0.5 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
              />
              <button onClick={saveEdit} className="p-0.5 text-green-400 hover:text-green-300">
                <Check className="h-3 w-3" />
              </button>
              <button onClick={cancelEdit} className="p-0.5 text-gray-500 hover:text-gray-300">
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <div className="flex-1 flex items-center gap-1 group">
              <span
                className="flex-1 text-sm text-gray-400 cursor-pointer rounded px-1 -mx-1 hover:bg-gray-800/50 transition-colors"
                onClick={() => startEdit(i)}
              >
                {item}
                <Pencil className="inline-block h-2.5 w-2.5 ml-1 opacity-0 group-hover:opacity-40 transition-opacity" />
              </span>
              <button
                onClick={() => onRemove(i)}
                className="p-0.5 text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Supprimer"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      ))}

      {adding ? (
        <div className="flex items-center gap-1 ml-4">
          <input
            type="text"
            value={addDraft}
            onChange={(e) => setAddDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd()
              if (e.key === 'Escape') { setAdding(false); setAddDraft('') }
            }}
            placeholder={placeholder}
            autoFocus
            className="flex-1 bg-gray-950 border border-dashed border-gray-700 rounded px-2 py-0.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500/50"
          />
          <button onClick={handleAdd} className="p-0.5 text-green-400 hover:text-green-300">
            <Check className="h-3 w-3" />
          </button>
          <button onClick={() => { setAdding(false); setAddDraft('') }} className="p-0.5 text-gray-500 hover:text-gray-300">
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1 ml-4 text-xs text-gray-600 hover:text-primary-400 transition-colors"
        >
          <Plus className="h-3 w-3" />
          {addLabel}
        </button>
      )}
    </div>
  )
}
