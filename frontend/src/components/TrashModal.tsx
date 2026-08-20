import { useState, useEffect } from 'react'
import { listsApi } from '../services/api'
import { useNotification } from '../contexts/NotificationContext'
import { Eye, RotateCcw } from 'lucide-react'

interface TrashedList {
  id: string
  name: string
  deleted_at: string
  records_in_trash: number
}

interface TrashRecord {
  id: string
  data: Record<string, any>
  deleted_at: string
}

export function TrashModal({ open, onClose, listId, title }: {
  open: boolean
  onClose: () => void
  listId?: string | number | null
  title?: string
}) {
  const [lists, setLists] = useState<TrashedList[]>([])
  const [records, setRecords] = useState<TrashRecord[]>([])
  const [currentListId, setCurrentListId] = useState<string | number | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const { toast } = useNotification()

  useEffect(() => {
    if (!open) return
    setCurrentListId(listId ?? null)
    if (listId) {
      loadRecords(listId)
    } else {
      loadLists()
    }
  }, [open, listId])

  const loadLists = async () => {
    try {
      const res = await listsApi.trashLists()
      setLists(res.data)
      setRecords([])
    } catch { toast('Error al cargar la papelera', 'error') }
  }

  const loadRecords = async (lid: string | number) => {
    setRecords([])
    try {
      const res = await listsApi.trashRecords(lid)
      setRecords(res.data)
    } catch { toast('Error al cargar los expedientes de la papelera', 'error') }
  }

  const openRecords = (lid: string | number) => {
    setCurrentListId(lid)
    loadRecords(lid)
  }

  const restoreList = async (lid: string) => {
    setRestoringId(lid)
    try {
      const res = await listsApi.restoreList(lid)
      toast(res.data?.message || 'Lista restaurada', 'success')
      await loadLists()
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Error al restaurar', 'error')
    } finally { setRestoringId(null) }
  }

  const restoreRecord = async (rid: string) => {
    if (!currentListId) return
    setRestoringId(rid)
    try {
      const res = await listsApi.restoreRecord(currentListId, rid)
      toast(res.data?.message || 'Expediente restaurado', 'success')
      await loadRecords(currentListId)
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Error al restaurar', 'error')
    } finally { setRestoringId(null) }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-[95vw] max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E4E8EE] shrink-0">
          <h2 className="font-serif text-lg font-bold text-[#1E2A32]">
            {currentListId ? 'Expedientes en la papelera' : (title || 'Papelera (15 días)')}
          </h2>
          <div className="flex items-center gap-2">
            {currentListId && !listId && (
              <button onClick={() => setCurrentListId(null)} className="text-sm text-[#5F6C79] hover:text-[#2B3A45] hover:bg-[#EEF1F5] rounded-lg px-2 py-1 transition-colors duration-200">
                ← Volver
              </button>
            )}
            <button onClick={onClose} className="text-[#7A8694] hover:text-[#3F4D58] text-xl leading-none p-1 rounded-full hover:bg-[#EEF1F5]">×</button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 p-5 space-y-2">
          {currentListId ? (
            records.length === 0 ? (
              <p className="text-sm text-[#7A8694] text-center py-8">No hay expedientes en la papelera de esta lista</p>
            ) : (
              records.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3 bg-[#F7F8FA] border border-[#E4E8EE] rounded-xl">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#1E2A32] truncate">
                      {[r.data?.nombre, r.data?.apellido].filter(Boolean).join(' ') || 'Sin nombre'}
                    </p>
                    <p className="text-xs text-[#7A8694]">
                      {r.data?.expediente ? `Exp. ${r.data?.expediente} · ` : ''}
                      {r.data?.diagnostico ? `${String(r.data.diagnostico).slice(0, 60)} · ` : ''}
                      eliminado {new Date(r.deleted_at).toLocaleString('es-HN')}
                    </p>
                  </div>
                  <button
                    onClick={() => void restoreRecord(r.id)}
                    disabled={restoringId === r.id}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[#115E59] bg-white border border-[#E4E8EE] rounded-xl hover:bg-[#EEF1F5] transition-all duration-200 disabled:opacity-50 shrink-0"
                  >
                    <RotateCcw size={14} />
                    {restoringId === r.id ? 'Restaurando...' : 'Restaurar'}
                  </button>
                </div>
              ))
            )
          ) : lists.length === 0 ? (
            <p className="text-sm text-[#7A8694] text-center py-8">La papelera está vacía</p>
          ) : (
            lists.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 bg-[#F7F8FA] border border-[#E4E8EE] rounded-xl">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#1E2A32] truncate">{t.name}</p>
                  <p className="text-xs text-[#7A8694]">
                    {t.records_in_trash} registro(s) · eliminada {new Date(t.deleted_at).toLocaleString('es-HN')}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => void openRecords(t.id)}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[#3F4D58] bg-white border border-[#E4E8EE] rounded-xl hover:bg-[#EEF1F5] transition-all duration-200"
                  >
                    <Eye size={14} />
                    Ver
                  </button>
                  <button
                    onClick={() => void restoreList(t.id)}
                    disabled={restoringId === t.id}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[#115E59] bg-white border border-[#E4E8EE] rounded-xl hover:bg-[#EEF1F5] transition-all duration-200 disabled:opacity-50"
                  >
                    <RotateCcw size={14} />
                    {restoringId === t.id ? 'Restaurando...' : 'Restaurar'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        <p className="px-5 py-3 text-xs text-[#7A8694] border-t border-[#E4E8EE] shrink-0">
          Los expedientes y listas permanecen aquí <b>15 días</b>; después se eliminan definitivamente.
        </p>
      </div>
    </div>
  )
}