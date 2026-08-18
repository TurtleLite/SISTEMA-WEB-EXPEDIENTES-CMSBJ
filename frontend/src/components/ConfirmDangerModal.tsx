import { useState } from 'react'
import { AlertTriangle, X as XIcon } from 'lucide-react'

interface ConfirmDangerModalProps {
  title: string
  message: React.ReactNode
  confirmWord?: string
  confirmLabel?: string
  loading?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDangerModal({
  title,
  message,
  confirmWord = 'ELIMINAR',
  confirmLabel = 'Eliminar',
  loading = false,
  onCancel,
  onConfirm,
}: ConfirmDangerModalProps) {
  const [typed, setTyped] = useState('')
  const ok = typed.trim().toUpperCase() === confirmWord.toUpperCase()

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-[#E4E8EE]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-50 rounded-xl text-red-500 shrink-0">
              <AlertTriangle size={22} />
            </div>
            <div className="min-w-0">
              <h3 className="font-serif text-lg font-bold text-[#1E2A32] leading-tight">{title}</h3>
            </div>
            <button onClick={onCancel} className="ml-auto p-1 text-[#7A8694] hover:text-[#3F4D58] hover:bg-[#EEF1F5] rounded-lg transition-colors duration-200 shrink-0">
              <XIcon size={18} />
            </button>
          </div>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div className="text-sm text-[#3F4D58] leading-relaxed">{message}</div>
          <div>
            <label className="block text-xs font-semibold text-[#7A8694] uppercase tracking-wider mb-1.5">
              Escriba <span className="text-red-500 font-bold">{confirmWord}</span> para confirmar
            </label>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && ok && !loading) onConfirm() }}
              autoFocus
              placeholder={confirmWord}
              className="w-full px-3 py-2.5 border border-[#E4E8EE] rounded-xl text-sm focus:ring-2 focus:ring-red-200 focus:border-red-400 transition-all duration-200 uppercase"
            />
          </div>
        </div>
        <div className="px-6 py-4 bg-[#F7F8FA] flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-[#3F4D58] hover:bg-[#EEF1F5] rounded-xl transition-all duration-200"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={!ok || loading}
            className="px-5 py-2.5 rounded-xl text-sm font-medium bg-red-500 text-white hover:bg-red-600 shadow-sm transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Eliminando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
