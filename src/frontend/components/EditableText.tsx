'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Pencil, Check, X } from 'lucide-react'
import { cn } from '@/shared/utils'

interface EditableTextProps {
  value: string
  onSave: (value: string) => void
  className?: string
  inputClassName?: string
  placeholder?: string
  multiline?: boolean
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span'
}

export function EditableText({
  value,
  onSave,
  className,
  inputClassName,
  placeholder = 'Cliquez pour éditer...',
  multiline = false,
  as: Tag = 'span',
}: EditableTextProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const handleSave = useCallback(() => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) {
      onSave(trimmed)
    } else {
      setDraft(value)
    }
    setEditing(false)
  }, [draft, value, onSave])

  const handleCancel = useCallback(() => {
    setDraft(value)
    setEditing(false)
  }, [value])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (!multiline || e.ctrlKey)) {
        e.preventDefault()
        handleSave()
      }
      if (e.key === 'Escape') {
        handleCancel()
      }
    },
    [handleSave, handleCancel, multiline]
  )

  if (editing) {
    const sharedProps = {
      ref: inputRef as any,
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
      onKeyDown: handleKeyDown,
      onBlur: handleSave,
      className: cn(
        'w-full bg-gray-950 border border-primary-500/50 rounded px-2 py-1 text-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500/30',
        inputClassName,
        className
      ),
      placeholder,
    }

    return (
      <div className="flex items-start gap-1 w-full">
        {multiline ? (
          <textarea {...sharedProps} rows={3} />
        ) : (
          <input type="text" {...sharedProps} />
        )}
        <button
          onClick={handleSave}
          className="p-1 text-green-400 hover:text-green-300 shrink-0"
          onMouseDown={(e) => e.preventDefault()}
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleCancel}
          className="p-1 text-gray-500 hover:text-gray-300 shrink-0"
          onMouseDown={(e) => e.preventDefault()}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return (
    <Tag
      className={cn(
        'group cursor-pointer rounded px-1 -mx-1 transition-colors hover:bg-gray-800/50',
        !value && 'text-gray-600 italic',
        className
      )}
      onClick={() => setEditing(true)}
      title="Cliquer pour éditer"
    >
      {value || placeholder}
      <Pencil className="inline-block h-3 w-3 ml-1.5 opacity-0 group-hover:opacity-50 transition-opacity" />
    </Tag>
  )
}
