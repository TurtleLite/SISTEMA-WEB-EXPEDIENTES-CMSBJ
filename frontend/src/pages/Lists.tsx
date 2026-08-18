import { useState, useEffect } from 'react'
import { listsApi } from '../services/api'
import { ListDefinition, TrashedList } from '../types'
import { useAuth } from '../contexts/AuthContext'
import { useNotification } from '../contexts/NotificationContext'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, Upload, Eye, Shield, RotateCcw } from 'lucide-react'
import { ConfirmDangerModal } from '../components/ConfirmDangerModal'

export function Lists() {
  const [lists, setLists] = useState<ListDefinition[]>([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', columns: [{ key: '', label: '', type: 'text' }] })
  const { user } = useAuth()
  const { toast } = useNotification()
  const navigate = useNavigate()
  const [deleteTarget, setDeleteTarget] = useState<ListDefinition | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showTrash, setShowTrash] = useState(false)
  const [trash, setTrash] = useState<TrashedList[]>([])
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [trashRecords, setTrashRecords] = useState<{ id: string; data: Record<string, any>; deleted_at: string }[]>([])
  const [trashListId, setTrashListId] = useState<string | null>(null)

  const loadLists = async () => {
    try {
      const res = await listsApi.list()
      setLists(res.data)
    } catch (err) { console.error(err) }
  }

  useEffect(() => { loadLists() }, [])

  const loadTrash = async () => {
    try {
      const res = await listsApi.trashLists()
      setTrash(res.data)
    } catch { toast('Error al cargar la papelera', 'error') }
  }

  const addColumn = () => {
    setForm({ ...form, columns: [...form.columns, { key: '', label: '', type: 'text' }] })
  }

  const removeColumn = (idx: number) => {
    setForm({ ...form, columns: form.columns.filter((_, i) => i !== idx) })
  }

  const updateColumn = (idx: number, field: string, value: string) => {
    const cols = [...form.columns]
    cols[idx] = { ...cols[idx], [field]: value }
    if (field === 'label' && !cols[idx].key) {
      cols[idx].key = value.toLowerCase().replace(/\s+/g, '_')
    }
    setForm({ ...form, columns: cols })
  }

  const handleCreate = async () => {
    try {
      await listsApi.create({
        name: form.name,
        description: form.description,
        columns_config: form.columns,
      })
      setShowModal(false)
      setForm({ name: '', description: '', columns: [{ key: '', label: '', type: 'text' }] })
      loadLists()
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Error al crear lista', 'error')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await listsApi.delete(deleteTarget.id)
      setDeleteTarget(null)
      loadLists()
      toast('Lista enviada a la papelera (se eliminará definitivamente en 15 días)', 'success')
    } catch (err) { toast('Error al eliminar', 'error') }
    finally { setDeleting(false) }
  }

  const handleRestoreList = async (listId: string) => {
    setRestoringId(listId)
    try {
      const res = await listsApi.restoreList(listId)
      toast(res.data?.message || 'Lista restaurada', 'success')
      await loadTrash()
      await loadLists()
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Error al restaurar', 'error')
    } finally { setRestoringId(null) }
  }

  const openTrashRecords = async (listId: string) => {
    setTrashListId(listId)
    setTrashRecords([])
    try {
      const res = await listsApi.trashRecords(listId)
      setTrashRecords(res.data)
    } catch { toast('Error al cargar los expedientes de la papelera', 'error') }
  }

  const handleRestoreRecord = async (recordId: string) => {
    if (!trashListId) return
    setRestoringId(recordId)
    try {
      const res = await listsApi.restoreRecord(trashListId, recordId)
      toast(res.data?.message || 'Expediente restaurado', 'success')
      await openTrashRecords(trashListId)
      await loadTrash()
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Error al restaurar', 'error')
    } finally { setRestoringId(null) }
  }

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="font-serif text-2xl font-bold text-[#1E2A32]">Listas Personalizables</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const firstList = lists[0]
              if (firstList) navigate(`/lists/${firstList.id}`)
            }}
            className="flex items-center gap-1.5 bg-white border border-[#E4E8EE] text-[#2B3A45] px-4 py-2 rounded-xl hover:bg-[#EEF1F5] shadow-sm hover:shadow-md transition-all duration-200  text-sm font-medium"
          >
            <Eye size={16} />
            Ver registros
          </button>
          {user?.role === 'admin' && (
            <>
              <button
                onClick={() => { setShowTrash(true); loadTrash() }}
                className="flex items-center gap-1.5 bg-white border border-[#E4E8EE] text-[#2B3A45] px-4 py-2 rounded-xl hover:bg-[#EEF1F5] shadow-sm hover:shadow-md transition-all duration-200  text-sm font-medium"
                title="Expedientes y listas eliminados (restaurables por 15 días)"
              >
                <RotateCcw size={16} />
                Papelera
              </button>
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-1.5 bg-[#0F766E] text-white px-4 py-2 rounded-xl hover:bg-[#115E59] shadow-sm hover:shadow-md transition-all duration-200  text-sm font-medium"
              >
                <Plus size={16} />
                Nueva Lista
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {lists.map((list) => (
          <div key={list.id} className="bg-white rounded-xl shadow-sm border border-[#E4E8EE] p-6 hover:shadow-md hover:border-[#E4E8EE] transition-all duration-200">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-[#1E2A32]">{list.name}</h3>
                {list.is_system && (
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-[#EEF1F5] text-[#3F4D58] rounded-full text-xs font-medium">
                    <Shield size={12} />
                    Sistema
                  </span>
                )}
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => navigate(`/lists/${list.id}`)}
                  className="p-1.5 hover:bg-[#EEF1F5] rounded-lg text-[#5F6C79] transition-all duration-200"
                  title="Ver registros"
                >
                  <Eye size={16} />
                </button>
                {user?.role === 'admin' && (
                  <button onClick={() => setDeleteTarget(list)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500 transition-all duration-200" title="Eliminar (va a la papelera por 15 días)">
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
            {list.description && (
              <p className="text-sm text-[#5F6C79] mb-3">{list.description}</p>
            )}
            <button
              onClick={() => navigate(`/lists/${list.id}`)}
              className="text-sm text-[#5F6C79] hover:text-[#2B3A45] font-medium transition-colors duration-200"
            >
              Ver registros →
            </button>
          </div>
        ))}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-[#0F172A]/20 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl px-5 py-3 w-[95vw] max-w-5xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <h2 className="font-serif text-lg font-bold mb-4 text-[#1E2A32]">Nueva Lista Personalizable</h2>            <div className="space-y-3">
              <input
                placeholder="Nombre de la lista"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2.5 border border-[#E4E8EE] rounded-xl text-sm focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
              />
              <input
                placeholder="Descripción (opcional)"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2.5 border border-[#E4E8EE] rounded-xl text-sm focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
              />
              <div className="border border-[#E4E8EE] rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-[#2B3A45]">Columnas</span>
                  <button onClick={addColumn} className="text-xs text-[#5F6C79] hover:text-[#2B3A45] transition-colors duration-200">
                    + Agregar columna
                  </button>
                </div>
                {form.columns.map((col, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <input
                      placeholder="Etiqueta"
                      value={col.label}
                      onChange={(e) => updateColumn(idx, 'label', e.target.value)}
                      className="flex-1 px-2 py-1.5 border border-[#E4E8EE] rounded-lg text-sm focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
                    />
                    <select
                      value={col.type}
                      onChange={(e) => updateColumn(idx, 'type', e.target.value)}
                      className="px-2 py-1.5 border border-[#E4E8EE] rounded-lg text-sm focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] transition-all duration-200"
                    >
                      <option value="text">Texto</option>
                      <option value="number">Número</option>
                      <option value="date">Fecha</option>
                    </select>
                    <button onClick={() => removeColumn(idx)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-[#3F4D58] hover:bg-[#EEF1F5] rounded-xl transition-all duration-200">
                Cancelar
              </button>
              <button onClick={handleCreate} className="px-4 py-2 text-sm bg-[#0F766E] text-white rounded-xl hover:bg-[#115E59] shadow-sm hover:shadow-md transition-all duration-200 font-medium">
                Crear Lista
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDangerModal
          title={`Eliminar "${deleteTarget.name}"`}
          message={
            <span>
              La lista y <b>todos sus registros</b> se enviarán a la papelera.
              Podrá restaurarlos durante <b>15 días</b>; después se eliminarán definitivamente.
            </span>
          }
          loading={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void handleDelete()}
        />
      )}

      {showTrash && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowTrash(false)}>
          <div className="bg-white rounded-2xl w-[95vw] max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#E4E8EE] shrink-0">
              <h2 className="font-serif text-lg font-bold text-[#1E2A32]">
                {trashListId ? 'Expedientes en la papelera' : 'Papelera (15 días)'}
              </h2>
              <div className="flex items-center gap-2">
                {trashListId && (
                  <button onClick={() => setTrashListId(null)} className="text-sm text-[#5F6C79] hover:text-[#2B3A45] hover:bg-[#EEF1F5] rounded-lg px-2 py-1 transition-colors duration-200">
                    ← Volver
                  </button>
                )}
                <button onClick={() => setShowTrash(false)} className="text-[#7A8694] hover:text-[#3F4D58] text-xl leading-none p-1 rounded-full hover:bg-[#EEF1F5]">×</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 p-5 space-y-2">
              {trashListId ? (
                trashRecords.length === 0 ? (
                  <p className="text-sm text-[#7A8694] text-center py-8">No hay expedientes en la papelera de esta lista</p>
                ) : (
                  trashRecords.map((r) => (
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
                        onClick={() => void handleRestoreRecord(r.id)}
                        disabled={restoringId === r.id}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[#115E59] bg-white border border-[#E4E8EE] rounded-xl hover:bg-[#EEF1F5] transition-all duration-200 disabled:opacity-50 shrink-0"
                      >
                        <RotateCcw size={14} />
                        {restoringId === r.id ? 'Restaurando...' : 'Restaurar'}
                      </button>
                    </div>
                  ))
                )
              ) : trash.length === 0 ? (
                <p className="text-sm text-[#7A8694] text-center py-8">La papelera está vacía</p>
              ) : (
                trash.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 bg-[#F7F8FA] border border-[#E4E8EE] rounded-xl">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#1E2A32] truncate">{t.name}</p>
                      <p className="text-xs text-[#7A8694]">
                        {t.records_in_trash} registro(s) · eliminada {new Date(t.deleted_at).toLocaleString('es-HN')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => void openTrashRecords(t.id)}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[#3F4D58] bg-white border border-[#E4E8EE] rounded-xl hover:bg-[#EEF1F5] transition-all duration-200"
                      >
                        <Eye size={14} />
                        Ver
                      </button>
                      <button
                        onClick={() => void handleRestoreList(t.id)}
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
      )}
    </div>
  )
}
