import { useState, useEffect, useRef, useMemo } from 'react'
import { listsApi } from '../services/api'
import { useNotification } from '../contexts/NotificationContext'
import { ListRecord } from '../types'
import { HONDURAS_DEPARTAMENTOS, TIPO_LOCALIDAD_OPTIONS } from '../constants'
import { normalizeText, titleCase } from '../utils/format'
import { CheckCircle2, Circle, ChevronDown, ChevronRight, Stethoscope, User, Home, FileText, Activity, ClipboardList, FlaskConical, Syringe, UserCircle } from 'lucide-react'

interface ColumnDef {
  key: string
  label: string
  type: string
  optional?: boolean
}

interface Section {
  title: string
  icon: React.ReactNode
  fields: ColumnDef[]
}

export const SECTIONS: Section[] = [
  {
    title: 'Datos Personales',
    icon: <User size={18} />,
    fields: [
      { key: 'especialidad', label: 'Especialidad', type: 'text' },
      { key: 'nombre', label: 'Nombre / First Name', type: 'text' },
      { key: 'apellido', label: 'Apellido / Last Name', type: 'text' },
      { key: 'sexo', label: 'Sexo / Sex', type: 'text' },
      { key: 'edad', label: 'Age / Edad', type: 'number' },
      { key: 'identidad', label: 'Nº Identidad', type: 'text' },
      { key: 'expediente', label: 'Nº Expediente', type: 'text' },
      { key: 'persona_responsable', label: 'Persona Responsable', type: 'text' },
      { key: 'albergue', label: 'Albergue', type: 'text' },
      { key: 'perfil', label: 'Perfil', type: 'text' },
      { key: 'telefono', label: 'Teléfono', type: 'text' },
      { key: 'telefono2', label: 'Teléfono 2', type: 'text' },
      { key: 'telefono3', label: 'Teléfono 3', type: 'text' },
    ],
  },
  {
    title: 'Domicilio',
    icon: <Home size={18} />,
    fields: [
      { key: 'departamento', label: 'Departamento', type: 'text' },
      { key: 'municipio', label: 'Municipio', type: 'text' },
      { key: 'tipo_localidad', label: 'Tipo de Localidad', type: 'text' },
      { key: 'localidad', label: 'Localidad', type: 'text' },
    ],
  },
  {
    title: 'Historia de Enfermedad Actual',
    icon: <FileText size={18} />,
    fields: [
      { key: 'historia_enfermedad', label: 'Historia de Enfermedad Actual (mín. 5 caracteres)', type: 'text' },
    ],
  },
  {
    title: 'Antecedentes Médicos',
    icon: <ClipboardList size={18} />,
    fields: [
      { key: 'enfermedades_previas', label: 'Enfermedades Anteriores', type: 'text' },
      { key: 'cirugias_previas', label: 'Cirugías Anteriores', type: 'text' },
      { key: 'alergias', label: 'Alergias', type: 'text' },
      { key: 'otros_antecedentes', label: 'Otros Antecedentes', type: 'text' },
    ],
  },
  {
    title: 'Signos Vitales',
    icon: <Activity size={18} />,
    fields: [
      { key: 'presion_arterial', label: 'P.A. / B.P. (mmHg)', type: 'text' },
      { key: 'fc', label: 'F.C. (lpm)', type: 'text' },
      { key: 'pulso', label: 'Pulso (lpm)', type: 'text' },
      { key: 'temperatura', label: 'T° (°C)', type: 'text' },
      { key: 'fr', label: 'F.R. (rpm)', type: 'text' },
      { key: 'peso', label: 'Peso / Weight (kg)', type: 'text' },
      { key: 'talla', label: 'Talla (mts)', type: 'text' },
      { key: 'bmi', label: 'B.M.I. (kg/mts²)', type: 'text' },
    ],
  },
  {
    title: 'Examen Físico',
    icon: <FlaskConical size={18} />,
    fields: [
      { key: 'examen_fisico', label: 'Examen Físico', type: 'text' },
    ],
  },
  {
    title: 'Diagnóstico',
    icon: <Syringe size={18} />,
    fields: [
      { key: 'diagnostico', label: 'Diagnóstico (mín. 5 caracteres)', type: 'text' },
      { key: 'criticidad', label: 'Criticidad Clínica', type: 'text' },
    ],
  },
  {
    title: 'Médico',
    icon: <UserCircle size={18} />,
    fields: [
      { key: 'nombre_medico', label: 'Nombre del Médico', type: 'text' },
    ],
  },
]

const FIELD_UNITS: Record<string, string> = {
  presion_arterial: 'mmHg',
  fc: 'lpm',
  fr: 'rpm',
  pulso: 'lpm',
  temperatura: '°C',
}

const MIN_TEXT_LENGTH = 5

const CAPITALIZE_FIRST_KEYS = new Set(['historia_enfermedad', 'examen_fisico', 'enfermedades_previas', 'cirugias_previas', 'alergias', 'otros_antecedentes'])

const capitalizeFirst = (val: string): string =>
  val ? val.charAt(0).toUpperCase() + val.slice(1) : val

const todayHonduras = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Tegucigalpa' }).format(new Date())

const parseNumber = (val: any): number | null => {
  if (val === undefined || val === null) return null
  const cleaned = String(val).replace(/,/g, '.').replace(/[^0-9.]/g, '').trim()
  if (!cleaned) return null
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

const calcularBMI = (peso: any, talla: any): string => {
  const kg = parseNumber(peso)
  const m = parseNumber(talla)
  if (!kg || !m || kg <= 0 || m <= 0) return ''
  return (kg / (m * m)).toFixed(2)
}

const formatearTalla = (raw: string): string => {
  const digits = raw.replace(/[^0-9]/g, '').slice(0, 4)
  if (!digits) return ''
  if (digits.length === 1) return digits
  return digits.slice(0, 1) + '.' + digits.slice(1)
}

const criticidadEnabled = (data: Record<string, any>): boolean =>
  String(data.diagnostico || '').trim().length >= MIN_TEXT_LENGTH

function isSectionComplete(section: Section, data: Record<string, any>): boolean {
  return section.fields.every((f) => {
    if (f.optional) return true
    if (f.key === 'criticidad' && !criticidadEnabled(data)) return true
    const val = data[f.key]
    return val !== undefined && val !== null && String(val).trim() !== ''
  })
}

function totalFieldsFrom(sections: Section[]): number {
  return sections.reduce((acc, s) => acc + s.fields.length, 0)
}

function filledFields(data: Record<string, any>): number {
  return Object.values(data).filter((v) => v !== undefined && v !== null && String(v).trim() !== '').length
}

interface DraftData {
  data: Record<string, any>
  customEspecialidad?: boolean
}

const DRAFT_PREFIX = 'expediente_draft'

const draftKey = (listId: string, recordId?: string): string =>
  `${DRAFT_PREFIX}_${listId}_${recordId || 'nuevo'}`

const readDraft = (key: string): DraftData | null => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

const writeDraft = (key: string, data: Record<string, any>, customEspecialidad: boolean): void => {
  try {
    localStorage.setItem(key, JSON.stringify({ data, customEspecialidad, savedAt: Date.now() }))
  } catch { /* almacenamiento lleno o no disponible */ }
}

const clearDraft = (key: string): void => {
  try { localStorage.removeItem(key) } catch { /* ignore */ }
}

const hasContent = (data: Record<string, any>): boolean =>
  Object.values(data).some((v) => v !== undefined && v !== null && String(v).trim() !== '')

interface Props {
  listId: string
  role?: string
  medicoName?: string
  onClose: () => void
  onSaved: () => void
  editingRecord?: ListRecord
}

function filterSections(role?: string): Section[] {
  if (role === 'medico') {
    return SECTIONS.map((s) => {
      if (s.title === 'Médico') {
        return { ...s, fields: s.fields.filter((f) => ['nombre_medico'].includes(f.key)) }
      }
      return s
    })
  }
  return SECTIONS
}

const FULL_WIDTH_KEYS = new Set(['historia_enfermedad', 'examen_fisico', 'diagnostico'])

interface LocalidadOption {
  localidad: string
  tipo: string
  count: number
}

export function ExpedienteForm({ listId, role, medicoName, onClose, onSaved, editingRecord }: Props) {
  const sections = filterSections(role)
  const draftKeyStr = draftKey(listId, editingRecord?.id ? String(editingRecord.id) : undefined)
  const [data, setData] = useState<Record<string, any>>(() => {
    const base = editingRecord?.data ? { ...editingRecord.data } : {}
    if (!base.nombre_medico && medicoName) base.nombre_medico = medicoName
    const draft = readDraft(draftKeyStr)
    if (draft?.data && hasContent(draft.data)) {
      return { ...base, ...draft.data }
    }
    return base
  })
  const [expanded, setExpanded] = useState<string>(sections.length > 0 ? sections[0].title : '')
  const [saving, setSaving] = useState(false)
  const [especialidades, setEspecialidades] = useState<string[]>([])
  const [customEspecialidad, setCustomEspecialidad] = useState<boolean>(() => {
    const draft = readDraft(draftKeyStr)
    return !!draft?.customEspecialidad
  })
  const [localidades, setLocalidades] = useState<LocalidadOption[]>([])
  const [localidadMatch, setLocalidadMatch] = useState<LocalidadOption | null>(null)
  const [confirmCopy, setConfirmCopy] = useState<{ numero: string; propuesta: string } | null>(null)
  const { toast, confirm } = useNotification()

  useEffect(() => {
    listsApi.getEspecialidades(listId).then((res) => {
      if (Array.isArray(res.data)) {
        setEspecialidades(res.data)
        const v = editingRecord?.data?.especialidad
        if (v && !res.data.includes(v)) setCustomEspecialidad(true)
      }
    }).catch(() => {})
  }, [listId])

  useEffect(() => {
    listsApi.getLocalidades(listId).then((res) => {
      if (Array.isArray(res.data)) setLocalidades(res.data)
    }).catch(() => {})
  }, [listId])

  useEffect(() => {
    if (editingRecord && (data.peso || data.talla)) {
      const imc = calcularBMI(data.peso, data.talla)
      if (imc) setValue('bmi', imc)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingRecord])

  const originalRef = useRef<Record<string, any>>(editingRecord?.data ? { ...editingRecord.data } : {})
  const dataRef = useRef(data)
  dataRef.current = data
  const customEspRef = useRef(customEspecialidad)
  customEspRef.current = customEspecialidad
  const dirtyRef = useRef(false)

  const dirty = useMemo(
    () => JSON.stringify(data) !== JSON.stringify(originalRef.current),
    [data]
  )
  dirtyRef.current = dirty

  useEffect(() => {
    const draft = readDraft(draftKeyStr)
    if (draft?.data && hasContent(draft.data)) {
      toast('Se restauró el borrador guardado automáticamente: sus datos están a salvo.', 'info')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (saving) return
    if (!hasContent(data) && !customEspecialidad) return
    const t = setTimeout(() => {
      writeDraft(draftKeyStr, data, customEspecialidad)
    }, 300)
    return () => clearTimeout(t)
  }, [data, customEspecialidad, draftKeyStr, saving])

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      writeDraft(draftKeyStr, dataRef.current, customEspRef.current)
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [draftKeyStr])

  useEffect(() => {
    const lastHashRef = { current: window.location.hash }
    let allowLeave = false
    let reverting = false
    const onHashChange = async () => {
      if (reverting) {
        reverting = false
        return
      }
      if (allowLeave) return
      if (!dirtyRef.current) return
      const ok = await confirm('Tiene datos sin guardar en el formulario de expediente. ¿Salir de todos modos?')
      if (ok) {
        allowLeave = true
        clearDraft(draftKeyStr)
      } else {
        reverting = true
        window.location.hash = lastHashRef.current
      }
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [draftKeyStr])

  const handleClose = async () => {
    if (dirty) {
      const ok = await confirm('Hay datos sin guardar en el formulario de expediente. ¿Desea salir y descartar el borrador?')
      if (!ok) return
    }
    clearDraft(draftKeyStr)
    onClose()
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        void handleClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty])

  const allComplete = sections.every((s) => isSectionComplete(s, data))

  const setValue = (key: string, value: any) => {
    setData((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'perfil') next['estatus'] = value
      return next
    })
  }

  const toggleSection = (title: string) => {
    setExpanded((prev) => (prev === title ? '' : title))
  }

  const handleLocalidadChange = (value: string) => {
    const titled = titleCase(value)
    setValue('localidad', titled)
    const normalized = normalizeText(titled)
    if (!normalized) {
      setLocalidadMatch(null)
      return
    }
    const match = localidades.find((l) => normalizeText(l.localidad) === normalized) || null
    setLocalidadMatch(match)
    if (match) setValue('tipo_localidad', match.tipo)
  }

  const handleSubmit = async () => {
    if (!allComplete || saving) return
    const diag = String(data.diagnostico || '').trim()
    const hist = String(data.historia_enfermedad || '').trim()
    if (diag.length < MIN_TEXT_LENGTH) {
      toast(`El diagnóstico debe tener al menos ${MIN_TEXT_LENGTH} caracteres`, 'error')
      return
    }
    if (hist.length < MIN_TEXT_LENGTH) {
      toast(`La historia de enfermedad actual debe tener al menos ${MIN_TEXT_LENGTH} caracteres`, 'error')
      return
    }
    setSaving(true)
    try {
      const numero = String(data.expediente || '').trim()
      if (!editingRecord && numero) {
        try {
          const res = await listsApi.copyNumber(listId, numero)
          if (Number(res.data?.count || 0) > 0) {
            setConfirmCopy({ numero, propuesta: String(res.data?.expediente || '') })
            return
          }
        } catch { /* si falla la consulta, se guarda sin confirmación */ }
      }
      await performSave()
    } finally {
      setSaving(false)
    }
  }

  const performSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      const payload = { ...data }
      if (!editingRecord) payload.fecha_elaboracion = todayHonduras()
      if (!payload.nombre_medico && medicoName) payload.nombre_medico = medicoName
      if (editingRecord) {
        await listsApi.updateRecord(listId, editingRecord.id, { data: payload })
        toast('Expediente actualizado correctamente', 'success')
      } else {
        await listsApi.createRecord(listId, { data: payload })
        toast('Expediente creado correctamente', 'success')
      }
      clearDraft(draftKeyStr)
      onSaved()
      onClose()
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Error al guardar el expediente', 'error')
    } finally {
      setSaving(false)
    }
  }

  const total = totalFieldsFrom(sections)
  const filled = filledFields(data)
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0

  return (
    <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white w-screen h-screen flex flex-col overflow-hidden">
        <div className="px-5 py-3 border-b border-[#E3E6EB] flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{editingRecord ? 'Editar Expediente Médico' : 'Nuevo Expediente Médico'}</h2>
            <p className="text-sm text-slate-500 mt-1">{editingRecord ? 'Modifique los campos necesarios' : 'Complete todas las secciones para crear el registro'}</p>
          </div>
          <div className="flex items-center gap-3">
            {dirty && (
              <span className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-3 py-1">
                <CheckCircle2 size={13} />
                Borrador guardado automáticamente
              </span>
            )}
            <button onClick={() => void handleClose()} title="Cerrar" className="p-2 hover:bg-slate-100 rounded-lg text-slate-400">
              ✕
            </button>
          </div>
        </div>

        <div className="px-5 pt-2 shrink-0">
          <div className="flex items-center gap-3 mb-1">
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#6E7B91] rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-sm font-medium text-slate-600 min-w-[4rem] text-right">
              {filled}/{total}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {sections.map((s) => {
              const done = isSectionComplete(s, data)
              return (
                <span
                  key={s.title}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                    done ? 'bg-slate-100 text-slate-600' : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {done ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                  {s.title}
                </span>
              )
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 h-0 px-5 pb-3 space-y-2">
          {sections.map((section) => {
            const done = isSectionComplete(section, data)
            const isOpen = expanded === section.title
            return (
              <div key={section.title} className="border border-[#E3E6EB] rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection(section.title)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                    done ? 'bg-slate-50' : 'bg-slate-50'
                  } hover:brightness-95`}
                >
                  <span className={done ? 'text-slate-500' : 'text-slate-400'}>
                    {done ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                  </span>
                  <span className="text-slate-500">{section.icon}</span>
                  <span className={`flex-1 font-medium text-sm ${done ? 'text-slate-700' : 'text-slate-700'}`}>
                    {section.title}
                  </span>
                  <span className="text-xs text-slate-400">
                    {section.fields.filter((f) => {
                      if (f.key === 'criticidad' && !criticidadEnabled(data)) return false
                      const v = data[f.key]
                      return v !== undefined && v !== null && String(v).trim() !== ''
                    }).length}/{section.fields.filter((f) => !(f.key === 'criticidad' && !criticidadEnabled(data))).length}
                  </span>
                  {isOpen ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                </button>
                {isOpen && (
                  <div className="px-4 py-3 grid grid-cols-1 lg:grid-cols-2 gap-x-4 gap-y-3 bg-white">
                    {section.fields.map((field) => (
                      <div key={field.key} className={FULL_WIDTH_KEYS.has(field.key) ? 'lg:col-span-2' : ''}>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          {field.label}
                        </label>
                        {field.key === 'especialidad' ? (
                          customEspecialidad ? (
                            <div className="space-y-2">
                              <input
                                type="text"
                                value={data[field.key] || ''}
                                onChange={(e) => {
                                  const cleaned = e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, '').toUpperCase()
                                  setValue(field.key, cleaned)
                                }}
                                placeholder="Escriba la especialidad"
                                className="w-full px-3 py-2 border border-[#E3E6EB] rounded-lg text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-400"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const v = data.especialidad
                                  if (v && !especialidades.includes(v)) setValue('especialidad', '')
                                  setCustomEspecialidad(false)
                                }}
                                className="text-xs text-[#5F6B80] hover:text-[#3F4650] font-medium"
                              >
                                ← Volver a seleccionar de la lista
                              </button>
                            </div>
                          ) : (
                            <select
                              value={data[field.key] || ''}
                              onChange={(e) => {
                                const v = e.target.value
                                if (v === '__otro__') {
                                  setCustomEspecialidad(true)
                                } else {
                                  setValue(field.key, v)
                                }
                              }}
                              className="w-full px-3 py-2 border border-[#E3E6EB] rounded-lg text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-400"
                            >
                              <option value="">Seleccione una especialidad...</option>
                              {especialidades.map((esp) => (
                                <option key={esp} value={esp}>{esp}</option>
                              ))}
                              <option value="__otro__">Otro (escribir manualmente)...</option>
                            </select>
                          )
                        ) : field.key === 'criticidad' ? (
                          criticidadEnabled(data) ? (
                            <select
                              value={data[field.key] || ''}
                              onChange={(e) => setValue(field.key, e.target.value)}
                              className="w-full px-3 py-2 border border-[#E3E6EB] rounded-lg text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-400"
                            >
                              <option value="">Seleccione...</option>
                              <option value="Baja">Baja</option>
                              <option value="Media">Media</option>
                              <option value="Alta">Alta</option>
                            </select>
                          ) : (
                            <div className="px-3 py-2 rounded-lg bg-slate-50 border border-dashed border-[#E3E6EB] text-xs text-slate-500">
                              Complete primero el diagnóstico (mínimo 5 caracteres) para asignar la criticidad clínica.
                            </div>
                          )
                        ) : field.key === 'sexo' ? (
                          <select
                            value={data[field.key] || ''}
                            onChange={(e) => setValue(field.key, e.target.value)}
                            className="w-full px-3 py-2 border border-[#E3E6EB] rounded-lg text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-400"
                          >
                            <option value="">Seleccione...</option>
                            <option value="M">M</option>
                            <option value="F">F</option>
                          </select>
                        ) : field.key === 'edad' ? (() => {
                          const edadStr = data.edad || ''
                          const edadParts = typeof edadStr === 'string' ? edadStr.match(/^(\d+)\s*([am])$/) : null
                          const edadNum = edadParts ? edadParts[1] : (typeof edadStr === 'string' ? edadStr : '')
                          const edadUnit = edadParts ? edadParts[2] : 'a'
                          return (
                            <div className="flex gap-2">
                              <input
                                type="number"
                                value={edadNum}
                                onChange={(e) => {
                                  const n = e.target.value
                                  setValue('edad', n === '' ? '' : `${n} ${edadUnit}`)
                                }}
                                className="flex-1 px-3 py-2 border border-[#E3E6EB] rounded-lg text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-400"
                              />
                              <select
                                value={edadUnit}
                                onChange={(e) => {
                                  const u = e.target.value
                                  setValue('edad', edadNum === '' ? '' : `${edadNum} ${u}`)
                                }}
                                className="w-28 px-3 py-2 border border-[#E3E6EB] rounded-lg text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-400"
                              >
                                <option value="a">Años</option>
                                <option value="m">Meses</option>
                              </select>
                            </div>
                          )
                        })() : field.key === 'perfil' ? (
                          <select
                            value={data[field.key] || ''}
                            onChange={(e) => setValue(field.key, e.target.value)}
                            className="w-full px-3 py-2 border border-[#E3E6EB] rounded-lg text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-400"
                          >
                            <option value="">Seleccione...</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                          </select>
                        ) : field.key === 'albergue' ? (
                          <select
                            value={data[field.key] || ''}
                            onChange={(e) => setValue(field.key, e.target.value)}
                            className="w-full px-3 py-2 border border-[#E3E6EB] rounded-lg text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-400"
                          >
                            <option value="">Seleccione...</option>
                            <option value="Si">Si</option>
                            <option value="No">No</option>
                          </select>
                        ) : field.key === 'estatus_cirugia' ? (
                          <select
                            value={data[field.key] || ''}
                            onChange={(e) => setValue(field.key, e.target.value)}
                            className="w-full px-3 py-2 border border-[#E3E6EB] rounded-lg text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-400"
                          >
                            <option value="">Seleccione...</option>
                            <option value="En espera">En espera</option>
                            <option value="Reprogramar">Reprogramar</option>
                            <option value="Cancelado">Cancelado</option>
                            <option value="Fuera de perfil San Benito">Fuera de perfil San Benito</option>
                            <option value="Operado">Operado</option>
                            <option value="No apto para cirugía">No apto para cirugía</option>
                          </select>
                        ) : field.key === 'expediente' ? (
                          <div>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={data[field.key] || ''}
                              onChange={(e) => setValue(field.key, e.target.value.replace(/\D/g, '').slice(0, 10))}
                              placeholder="Solo números"
                              className="w-full px-3 py-2 border border-[#E3E6EB] rounded-lg text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-400"
                            />
                            <p className="mt-1 text-[11px] text-slate-400">
                              {editingRecord
                                ? 'No se puede modificar al editar.'
                                : 'Llene el número manualmente (solo números). Si ya existe, el sistema agrega la copia (1), (2)... como nueva intervención.'}
                            </p>
                          </div>
                        ) : field.key === 'identidad' ? (
                          <input
                            type="text"
                            value={data[field.key] || ''}
                            onChange={(e) => {
                              const digits = e.target.value.replace(/\D/g, '').slice(0, 13)
                              let formatted = ''
                              if (digits.length > 0) formatted = digits.slice(0, 4)
                              if (digits.length > 4) formatted += '-' + digits.slice(4, 8)
                              if (digits.length > 8) formatted += '-' + digits.slice(8, 13)
                              setValue(field.key, formatted)
                            }}
                            placeholder="0000-0000-00000"
                            className="w-full px-3 py-2 border border-[#E3E6EB] rounded-lg text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-400"
                          />
                        ) : field.key.startsWith('telefono') ? (
                          <input
                            type="text"
                            value={data[field.key] || ''}
                            onChange={(e) => {
                              const digits = e.target.value.replace(/\D/g, '').slice(0, 8)
                              let formatted = ''
                              if (digits.length > 0) formatted = digits.slice(0, 4)
                              if (digits.length > 4) formatted += '-' + digits.slice(4, 8)
                              setValue(field.key, formatted)
                            }}
                            placeholder="0000-0000"
                            className="w-full px-3 py-2 border border-[#E3E6EB] rounded-lg text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-400"
                          />
                        ) : field.key === 'presion_arterial' ? (
                          <input
                            type="text"
                            value={data[field.key] || ''}
                            onChange={(e) => {
                              const cleaned = e.target.value.replace(/[^0-9/]/g, '')
                              const parts = cleaned.split('/')
                              const left = (parts[0] || '').slice(0, 3)
                              const right = (parts[1] || '').slice(0, 3)
                              let formatted = left
                              if (right || cleaned.includes('/')) formatted += '/' + right
                              setValue(field.key, formatted)
                            }}
                            placeholder="000/000"
                            className="w-full px-3 py-2 border border-[#E3E6EB] rounded-lg text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-400"
                          />
                        ) : field.key === 'peso' ? (
                          <div className="relative">
                            <input
                              type="text"
                              value={(data[field.key] || '').replace(/\s*kg$/, '')}
                              onChange={(e) => {
                                const cleaned = e.target.value.replace(/[^0-9.,]/g, '')
                                const v = cleaned ? `${cleaned} kg` : ''
                                setValue('peso', v)
                                setValue('bmi', calcularBMI(v, data.talla))
                              }}
                              placeholder="0 kg"
                              className="w-full px-3 py-2 pr-10 border border-[#E3E6EB] rounded-lg text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-400"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">kg</span>
                          </div>
                        ) : field.key === 'talla' ? (
                          <div className="relative">
                            <input
                              type="text"
                              value={(data[field.key] || '').replace(/\s*mts$/, '')}
                              onChange={(e) => {
                                const v = formatearTalla(e.target.value)
                                const withUnit = v ? `${v} mts` : ''
                                setValue('talla', withUnit)
                                setValue('bmi', calcularBMI(data.peso, withUnit))
                              }}
                              placeholder="0.00 mts"
                              className="w-full px-3 py-2 pr-10 border border-[#E3E6EB] rounded-lg text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-400"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">mts</span>
                            <p className="mt-1 text-[11px] text-slate-400">
                              El punto decimal se coloca automáticamente (ej. escribir 184 → 1.84)
                            </p>
                          </div>
                        ) : field.key === 'bmi' ? (
                          <div className="relative">
                            <input
                              type="text"
                              value={data[field.key] || ''}
                              readOnly
                              disabled
                              title="Se calcula automáticamente con peso y talla"
                              placeholder="Se calcula al llenar Peso y Talla"
                              className="w-full px-3 py-2 pr-14 border border-[#E3E6EB] rounded-lg text-sm bg-slate-50 text-slate-500 focus:ring-2 focus:ring-slate-300 focus:border-slate-400 disabled:cursor-not-allowed"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none whitespace-nowrap">
                              kg/mts²
                            </span>
                          </div>
                        ) : field.key === 'nombre' || field.key === 'apellido' || field.key === 'persona_responsable' ? (
                          <textarea
                            rows={1}
                            value={data[field.key] || ''}
                            onChange={(e) => {
                              const val = e.target.value
                              const titleCased = titleCase(val)
                              setValue(field.key, titleCased)
                            }}
                            className="w-full px-3 py-2 border border-[#E3E6EB] rounded-lg text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-400 resize-none"
                          />
                        ) : field.key === 'departamento' ? (
                          <select
                            value={data[field.key] || ''}
                            onChange={(e) => {
                              const v = e.target.value
                              setValue('departamento', v)
                              if (v && !(HONDURAS_DEPARTAMENTOS[v] || []).includes(data.municipio)) {
                                setValue('municipio', '')
                              }
                            }}
                            className="w-full px-3 py-2 border border-[#E3E6EB] rounded-lg text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-400"
                          >
                            <option value="">Seleccione el departamento...</option>
                            {Object.keys(HONDURAS_DEPARTAMENTOS).map((d) => (
                              <option key={d} value={d}>{d}</option>
                            ))}
                          </select>
                        ) : field.key === 'municipio' ? (
                          <select
                            value={data[field.key] || ''}
                            onChange={(e) => setValue('municipio', e.target.value)}
                            disabled={!data.departamento}
                            className="w-full px-3 py-2 border border-[#E3E6EB] rounded-lg text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-400"
                          >
                            <option value="">{data.departamento ? 'Seleccione el municipio...' : 'Seleccione primero un departamento'}</option>
                            {(HONDURAS_DEPARTAMENTOS[data.departamento] || []).map((m) => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                        ) : field.key === 'tipo_localidad' ? (
                          <select
                            value={data[field.key] || ''}
                            onChange={(e) => setValue('tipo_localidad', e.target.value)}
                            className="w-full px-3 py-2 border border-[#E3E6EB] rounded-lg text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-400"
                          >
                            <option value="">Seleccione el tipo...</option>
                            {TIPO_LOCALIDAD_OPTIONS.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        ) : field.key === 'localidad' ? (
                          <div>
                            <input
                              type="text"
                              list="localidades-sugeridas"
                              value={data[field.key] || ''}
                              onChange={(e) => handleLocalidadChange(e.target.value)}
                              placeholder="Escriba la localidad o seleccione una existente"
                              className="w-full px-3 py-2 border border-[#E3E6EB] rounded-lg text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-400"
                            />
                            <datalist id="localidades-sugeridas">
                              {localidades.map((l) => (
                                <option key={`${l.localidad}-${l.tipo}`} value={l.localidad}>
                                  {l.localidad}{l.tipo ? ` (${l.tipo})` : ''}
                                </option>
                              ))}
                            </datalist>
                            {localidadMatch && (
                              <div className="mt-1.5 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                                <span>
                                  Ya existe la localidad <b>"{localidadMatch.localidad}"</b>
                                  {localidadMatch.tipo ? ` (${localidadMatch.tipo})` : ''}. Se usará la existente.
                                </span>
                              </div>
                            )}
                          </div>
                        ) : field.key === 'nombre_medico' ? (
                          <input
                            type="text"
                            value={data[field.key] || medicoName || ''}
                            readOnly
                            disabled
                            title="El nombre del médico se asigna automáticamente según el usuario"
                            className="w-full px-3 py-2 border border-[#E3E6EB] rounded-lg text-sm bg-slate-50 text-slate-600 disabled:cursor-not-allowed"
                          />
                        ) : FIELD_UNITS[field.key] ? (
                          <div className="relative">
                            <input
                              type="text"
                              value={data[field.key] || ''}
                              onChange={(e) => setValue(field.key, e.target.value)}
                              placeholder="0"
                              className="w-full px-3 py-2 pr-12 border border-[#E3E6EB] rounded-lg text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-400"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none whitespace-nowrap">
                              {FIELD_UNITS[field.key]}
                            </span>
                          </div>
                        ) : field.type === 'date' ? (
                          <input
                            type="date"
                            value={data[field.key] || ''}
                            onChange={(e) => setValue(field.key, e.target.value)}
                            className="w-full px-3 py-2 border border-[#E3E6EB] rounded-lg text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-400"
                          />
                        ) : field.type === 'number' ? (
                          <input
                            type="number"
                            value={data[field.key] ?? ''}
                            onChange={(e) => setValue(field.key, e.target.value === '' ? '' : Number(e.target.value))}
                            className="w-full px-3 py-2 border border-[#E3E6EB] rounded-lg text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-400"
                          />
                        ) : (
                          <textarea
                            rows={field.key === 'domicilio' || field.key === 'historia_enfermedad' || field.key === 'examen_fisico' || field.key === 'diagnostico' ? 3 : 1}
                            value={data[field.key] || ''}
                            onChange={(e) => setValue(field.key, CAPITALIZE_FIRST_KEYS.has(field.key) ? capitalizeFirst(e.target.value) : e.target.value)}
                            className="w-full px-3 py-2 border border-[#E3E6EB] rounded-lg text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-400 resize-none"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="px-5 py-3 border-t border-[#E3E6EB] flex items-center justify-between shrink-0">
          <button
            onClick={() => void handleClose()}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!allComplete || saving}
            className={`px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${
              allComplete && !saving
                ? 'bg-slate-500 text-white hover:bg-slate-600 shadow-sm'
                : 'bg-slate-100 text-slate-300 cursor-not-allowed'
            }`}
          >
            {saving ? 'Guardando...' : allComplete ? (editingRecord ? 'Guardar Cambios' : 'Crear Expediente') : `Complete todas las secciones`}
          </button>
        </div>
      </div>

      {confirmCopy && (
        <div className="fixed inset-0 z-[60] bg-slate-900/30 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="font-serif text-lg font-bold text-[#3F4650] mb-3">Confirmación de expediente existente</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              El número de expediente <b>{confirmCopy.numero}</b> ya existe en el sistema:
            </p>
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
              Se guardará como copia: <b>{confirmCopy.propuesta}</b>
            </div>
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">
              ¿Esta atención será una nueva intervención del mismo paciente? Si es así, el expediente se creará como copia del expediente original.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setConfirmCopy(null)
                  clearDraft(draftKeyStr)
                  onClose()
                }}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200"
              >
                No, salir
              </button>
              <button
                onClick={() => {
                  setConfirmCopy(null)
                  void performSave()
                }}
                className="px-5 py-2.5 rounded-lg text-sm font-medium bg-slate-500 text-white hover:bg-slate-600 shadow-sm"
              >
                Sí, continuar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}