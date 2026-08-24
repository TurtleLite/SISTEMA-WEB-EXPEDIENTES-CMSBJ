import { useState, useEffect, useCallback, useRef } from 'react'
import { backupsApi } from '../services/api'
import { useNotification } from '../contexts/NotificationContext'
import { RefreshCw, Download, Trash2, CheckCircle2, Upload, FileSpreadsheet } from 'lucide-react'

interface BackupItem {
  name: string
  size_kb: number
  created_at: string | null
  type?: string
}

const fmt = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('es-HN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function Backups({ embedded = false }: { embedded?: boolean }) {
  const [items, setItems] = useState<BackupItem[]>([])
  const [generating, setGenerating] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { toast, confirm } = useNotification()

  const load = useCallback(async () => {
    try {
      const res = await backupsApi.list()
      setItems(res.data.items || [])
    } catch {
      toast('Error al cargar los respaldos', 'error')
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const handleGenerate = async () => {
    if (generating) return
    setGenerating(true)
    try {
      const res = await backupsApi.generateExcel()
      toast(res.data?.message || 'Respaldo Excel generado correctamente', 'success')
      await load()
    } catch (err: any) {
      toast(err.response?.data?.detail || 'No se pudo generar el respaldo', 'error')
    } finally {
      setGenerating(false)
    }
  }

  const handleDownload = async (b: BackupItem) => {
    try {
      const res = await backupsApi.download(b.name)
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = b.name
      a.click()
      window.URL.revokeObjectURL(url)
    } catch {
      toast('No se pudo descargar el respaldo', 'error')
    }
  }

  const handleRestore = async (file: File | null) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      toast('El respaldo debe ser un archivo Excel .xlsx (tabla general)', 'error')
      return
    }
    const ok = await confirm(
      'Se importarán los expedientes desde la tabla general Excel. Los registros se añadirán (expedientes duplicados se guardan como copia). ¿Deseas continuar?'
    )
    if (!ok) return
    setRestoring(true)
    try {
      const res = await backupsApi.restore(file)
      toast(res.data?.message || 'Respaldo importado correctamente', 'success')
      await load()
    } catch (err: any) {
      toast(err.response?.data?.detail || 'No se pudo importar el respaldo', 'error')
    } finally {
      setRestoring(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleDelete = async (b: BackupItem) => {
    if (!await confirm(`¿Eliminar el respaldo ${b.name}? Esta acción no se puede deshacer.`)) return
    setDeleting(b.name)
    try {
      await backupsApi.delete(b.name)
      toast('Respaldo eliminado', 'success')
      await load()
    } catch {
      toast('No se pudo eliminar el respaldo', 'error')
    } finally {
      setDeleting(null)
    }
  }

  const totalKb = items.reduce((acc, b) => acc + b.size_kb, 0)

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between shrink-0">
        {!embedded ? (
          <h1 className="font-serif text-xl font-bold text-[#1E2A32]">Respaldos</h1>
        ) : (
          <div />
        )}
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => handleRestore(e.target.files?.[0] ?? null)}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={restoring}
            className="flex items-center gap-1.5 px-3 py-2 bg-white text-[#0F766E] border border-[#0F766E] rounded-xl hover:bg-[#F7F8FA] text-sm font-medium transition-all duration-200 disabled:opacity-50"
          >
            <Upload size={14} /> {restoring ? 'Importando...' : 'Importar Excel'}
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#0F766E] text-white rounded-xl hover:bg-[#115E59] text-sm font-medium transition-all duration-200 disabled:opacity-50"
          >
            <FileSpreadsheet size={14} /> {generating ? 'Generando...' : 'Generar respaldo Excel'}
          </button>
        </div>
      </div>

      <div className="shrink-0 flex items-center gap-2 text-[0.6875rem] text-[#7A8694] bg-[#EEF1F5] rounded-lg px-3 py-2">
        <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
        Respaldos en Excel (.xlsx) — tabla general con todos los expedientes. Se generan automáticamente a las 12:00 a. m. Honduras y se conservan los últimos 20.
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-[#E4E8EE] flex flex-col min-h-0 flex-1">
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          <table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#EEF1F5] border-b border-[#E4E8EE]">
                <th className="w-[45%] text-left px-6 py-4 text-xs font-bold text-[#7A8694] uppercase tracking-wider">Archivo</th>
                <th className="w-[20%] text-left px-6 py-4 text-xs font-bold text-[#7A8694] uppercase tracking-wider">Tamaño</th>
                <th className="w-[20%] text-left px-6 py-4 text-xs font-bold text-[#7A8694] uppercase tracking-wider">Generado</th>
                <th className="w-[15%] text-right px-6 py-4 text-xs font-bold text-[#7A8694] uppercase tracking-wider">Acción</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center">
                    <FileSpreadsheet size={26} className="mx-auto mb-2 text-[#D5DBE3]" />
                    <p className="text-sm text-[#7A8694]">
                      {generating ? 'Generando respaldo...' : 'No hay respaldos en Excel. Genera uno con el botón superior.'}
                    </p>
                  </td>
                </tr>
              )}
              {items.map((b) => (
                <tr key={b.name} className="border-b border-[#EEF1F5] transition-all duration-150 hover:bg-[#EEF1F5]">
                  <td className="px-6 py-4 text-sm font-mono text-[#1E2A32] flex items-center gap-2"><FileSpreadsheet size={14} className="text-emerald-600 shrink-0"/>{b.name}</td>
                  <td className="px-6 py-4 text-sm text-[#3F4D58]">{b.size_kb >= 1024 ? `${(b.size_kb / 1024).toFixed(1)} MB` : `${b.size_kb.toFixed(1)} KB`}</td>
                  <td className="px-6 py-4 text-sm text-[#3F4D58]">{fmt(b.created_at)}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleDownload(b)}
                        className="p-1.5 hover:bg-[#EEF1F5] rounded-lg text-[#5F6C79] hover:text-[#0F766E] transition-all duration-200"
                        title="Descargar"
                      >
                        <Download size={15} />
                      </button>
                      <button
                        onClick={() => handleDelete(b)}
                        disabled={deleting === b.name}
                        className="p-1.5 hover:bg-red-100 rounded-lg text-[#5F6C79] hover:text-red-600 transition-all duration-200 disabled:opacity-40"
                        title="Eliminar respaldo"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="shrink-0 border-t border-[#E4E8EE] px-6 py-1.5 flex items-center justify-between">
          <p className="text-[0.625rem] text-[#7A8694]">
            {items.length} respaldo(s) Excel · {(totalKb / 1024).toFixed(1)} MB en total
          </p>
          <button
            onClick={load}
            className="text-[0.625rem] font-medium text-[#5F6C79] hover:text-[#0F766E] flex items-center gap-1"
          >
            <RefreshCw size={11} /> Actualizar
          </button>
        </div>
      </div>
    </div>
  )
}
