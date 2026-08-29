import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface Toast {
  id: number
  type: 'success' | 'error' | 'info'
  message: string
}

interface ConfirmState {
  message: string
  resolve: (value: boolean) => void
}

interface NotificationContextType {
  toast: (message: unknown, type?: Toast['type']) => void
  confirm: (message: string) => Promise<boolean>
}

const NotificationContext = createContext<NotificationContextType>({} as NotificationContextType)

let nextId = 0

function normalizeMessage(message: unknown): string {
  if (typeof message === 'string') return message
  if (message == null) return ''
  try {
    return JSON.stringify(message)
  } catch {
    return String(message)
  }
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)

  const toast = useCallback((message: unknown, type: Toast['type'] = 'info') => {
    const id = nextId++
    setToasts((prev) => [...prev, { id, type, message: normalizeMessage(message) }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }, [])

  const confirm = useCallback((message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmState({ message, resolve })
    })
  }, [])

  const handleConfirm = (value: boolean) => {
    confirmState?.resolve(value)
    setConfirmState(null)
  }

  return (
    <NotificationContext.Provider value={{ toast, confirm }}>
      {children}

      {toasts.length > 0 && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] flex flex-col items-center gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`px-4 py-3 rounded-lg shadow-md text-sm font-medium text-white max-w-sm animate-slide-in ${
                t.type === 'success' ? 'bg-[#0F766E]' :
                t.type === 'error' ? 'bg-red-400' :
                'bg-[#0F766E]'
              }`}
            >
              {t.message}
            </div>
          ))}
        </div>
      )}

      {confirmState && (
        <div className="fixed inset-0 bg-[#0F172A]/20 backdrop-blur-sm flex items-center justify-center z-[200]">
          <div className="bg-white/90 backdrop-blur-sm rounded-xl px-5 py-3 w-full max-w-sm shadow-xl">
            <p className="text-sm text-[#2B3A45] mb-6">{confirmState.message}</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => handleConfirm(false)}
                className="px-4 py-2 text-sm text-[#3F4D58] hover:bg-[#F7F8FA] rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleConfirm(true)}
                className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </NotificationContext.Provider>
  )
}

export const useNotification = () => useContext(NotificationContext)
