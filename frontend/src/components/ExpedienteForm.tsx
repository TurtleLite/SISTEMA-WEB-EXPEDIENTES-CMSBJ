import { useState, useEffect, useRef, useMemo, Fragment } from 'react'
import { listsApi } from '../services/api'
import { useNotification } from '../contexts/NotificationContext'
import { ListRecord } from '../types'
import { HONDURAS_DEPARTAMENTOS, TIPO_LOCALIDAD_OPTIONS } from '../constants'
import ScrollSelect from './ScrollSelect'
import LocalidadInput from './LocalidadInput'
import { normalizeText, titleCase } from '../utils/format'
import { CheckCircle2, ChevronDown, ChevronRight, Stethoscope, User, Home, FileText, Activity, ClipboardList, FlaskConical, Syringe, UserCircle } from 'lucide-react'
import { NacimientoField } from './NacimientoField'

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
  compact?: boolean
}

export const SECTIONS: Section[] = [
  {
    title: 'Datos Personales',
    icon: <User size={18} />,
fields: [
      { key: 'nombre', label: 'Nombre / First Name', type: 'text' },
      { key: 'apellido', label: 'Apellido / Last Name', type: 'text' },
      { key: 'expediente', label: 'Nº Expediente', type: 'text' },
      { key: 'identidad', label: 'Nº Identidad', type: 'text' },
      { key: 'fecha_nacimiento', label: 'Fecha de Nacimiento', type: 'date' },
      { key: 'edad', label: 'Age / Edad', type: 'number' },
      { key: 'sexo', label: 'Sexo', type: 'text' },
      { key: 'especialidad', label: 'Especialidad', type: 'text' },
      { key: 'perfil', label: 'Perfil', type: 'text' },
      { key: 'telefono', label: 'Teléfono', type: 'text' },
      { key: 'telefono2', label: 'Teléfono 2', type: 'text' },
      { key: 'telefono3', label: 'Teléfono 3', type: 'text' },
      { key: 'persona_responsable', label: 'Persona Responsable', type: 'text' },
      { key: 'albergue', label: 'Albergue', type: 'text' },
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
    compact: true,
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
      { key: 'compensado', label: 'Compensado (Sí, No)', type: 'text' },
      { key: 'observacion_compensado', label: 'Observación (Obligatorio si no está compensado)', type: 'text' },
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

const calcularEdadDesdeFechaNacimiento = (fechaNacimiento: string | null | undefined): string => {
  if (!fechaNacimiento) return ''
  let iso = fechaNacimiento
  if (fechaNacimiento.includes('/')) {
    const parts = fechaNacimiento.split('/')
    if (parts.length !== 3) return ''
    let mm = parts[0].padStart(2, '0')
    let dd = parts[1].padStart(2, '0')
    const yyyy = parts[2]
    if (yyyy.length !== 4) return ''
    let m = parseInt(mm, 10)
    let day = parseInt(dd, 10)
    // Si mes > 12, asumir formato DD/MM/YYYY e intercambiar
    if (m > 12) {
      const temp = mm
      mm = dd
      dd = temp
      m = parseInt(mm, 10)
      day = parseInt(dd, 10)
    }
    if (m < 1 || m > 12) return ''
    if (day < 1 || day > 31) return ''
    iso = `${yyyy}-${mm}-${dd}`
  }
  const hoy = new Date(todayHonduras() + 'T00:00:00')
  const nac = new Date(iso + 'T00:00:00')
  if (isNaN(nac.getTime())) return ''
  const years = hoy.getFullYear() - nac.getFullYear()
  const months = hoy.getMonth() - nac.getMonth()
  const days = hoy.getDate() - nac.getDate()
  let totalMonths = years * 12 + months + (days < 0 ? -1 : 0)
  if (totalMonths < 0) return ''
  if (totalMonths < 12) return `${totalMonths} m`
  return `${years} a`
}

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

const parseMedico = (raw: string): { title: string; name: string } => {
  const m = (raw || '').match(/^(Dr\.|Dra\.)\s*(.*)$/)
  return m ? { title: m[1], name: m[2] } : { title: 'Dr.', name: raw || '' }
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

const clinicalDisabled = (key: string, data: Record<string, any>): boolean =>
  (key === 'criticidad' || key === 'compensado') && !criticidadEnabled(data)

const OBS_COMPENSADO_KEY = 'observacion_compensado'

const compensadoObsRequired = (data: Record<string, any>): boolean =>
  String(data.compensado || '').trim() === 'No'

const compensadoObsSatisfied = (data: Record<string, any>): boolean =>
  !compensadoObsRequired(data) || String(data[OBS_COMPENSADO_KEY] || '').trim() !== ''

const compensadoObsMissing = (data: Record<string, any>): boolean =>
  !compensadoObsSatisfied(data)

function isSectionComplete(section: Section, data: Record<string, any>): boolean {
  return section.fields.every((f) => {
    if (f.optional) return true
    if (clinicalDisabled(f.key, data)) return true
    if (f.key === OBS_COMPENSADO_KEY) return compensadoObsSatisfied(data)
    const val = data[f.key]
    if (f.key === 'fecha_nacimiento') {
      const s = String(val || '').trim()
      if (!s) return false
      if (s.includes('/')) {
        const d = s.replace(/\D/g, '')
        if (d.length !== 8) return false
        const mm = d.slice(0, 2), dd = d.slice(2, 4), yyyy = d.slice(4, 8)
        const m = parseInt(mm, 10), day = parseInt(dd, 10), y = parseInt(yyyy, 10)
        if (m < 1 || m > 12 || day < 1 || day > 31 || y < 1900 || y > 2100) return false
        const iso = `${yyyy}-${mm}-${dd}`
        const date = new Date(iso + 'T00:00:00')
        if (isNaN(date.getTime()) || date.getMonth() + 1 !== m || date.getDate() !== day) return false
        return true
      }
      return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00').getTime())
    }
    return val !== undefined && val !== null && String(val).trim() !== ''
  })
}

function totalFieldsFrom(sections: Section[], data: Record<string, any>): number {
  return sections.reduce((acc, s) => acc + s.fields.filter((f) => !f.optional && !clinicalDisabled(f.key, data) && !(f.key === OBS_COMPENSADO_KEY && !compensadoObsRequired(data))).length, 0)
}

function filledFields(sections: Section[], data: Record<string, any>): number {
  return sections.reduce((acc, s) => {
    for (const f of s.fields) {
      if (f.optional) continue
      if (f.key === OBS_COMPENSADO_KEY) {
        if (!compensadoObsRequired(data)) continue
        if (compensadoObsSatisfied(data)) acc++
        continue
      }
      if (clinicalDisabled(f.key, data)) continue
      if (f.key === 'fecha_nacimiento') {
        const s = String(data[f.key] || '').trim()
        if (!s) continue
        let valid = false
        if (s.includes('/')) {
          const d = s.replace(/\D/g, '')
          if (d.length === 8) {
            const mm = d.slice(0, 2), dd = d.slice(2, 4), yyyy = d.slice(4, 8)
            const m = parseInt(mm, 10), day = parseInt(dd, 10), y = parseInt(yyyy, 10)
            if (m >= 1 && m <= 12 && day >= 1 && day <= 31 && y >= 1900 && y <= 2100) {
              const iso = `${yyyy}-${mm}-${dd}`
              const date = new Date(iso + 'T00:00:00')
              if (!isNaN(date.getTime()) && date.getMonth() + 1 === m && date.getDate() === day) valid = true
            }
          }
        } else {
          valid = /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00').getTime())
        }
        if (valid) acc++
        continue
      }
      const v = data[f.key]
      if (v !== undefined && v !== null && String(v).trim() !== '') acc++
    }
    return acc
  }, 0)
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

const formatAgo = (iso: string): string => {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (diff < 60000) return 'hace un momento'
  if (diff < 3600000) return `hace ${Math.floor(diff / 60000)} min`
  if (diff < 86400000) return `hace ${Math.floor(diff / 3600000)} h`
  return `hace ${Math.floor(diff / 86400000)} días`
}

const validateDates = (data: Record<string, any>): string | null => {
  const hoy = new Date(todayHonduras() + 'T00:00:00')
  const fechaRaw = String(data.fecha_elaboracion || '').trim()
  if (fechaRaw) {
    const f = new Date(fechaRaw + 'T00:00:00')
    if (isNaN(f.getTime())) return 'La fecha de elaboración no es válida (formato AAAA-MM-DD)'
    if (f > hoy) return 'La fecha de elaboración no puede ser posterior a hoy'
    if (f < new Date('1950-01-01T00:00:00')) return 'La fecha de elaboración es demasiado antigua (antes de 1950)'
  }
  const edadRaw = String(data.edad || '').trim()
  if (edadRaw) {
    const m = edadRaw.match(/^(\d{1,3})\s*([am]?)$/)
    if (m) {
      const n = parseInt(m[1], 10)
      const unidad = m[2] || 'a'
      if (unidad === 'm' && (n < 0 || n > 12)) return 'Edad en meses inválida (debe ser 0-12)'
      if (unidad === 'a' && n > 120) return 'La edad no puede ser mayor de 120 años'
      if (unidad === 'a' && n === 0) return 'La edad no puede ser 0 años'
    }
  }
  return null
}

interface Props {
  listId: string
  role?: string
  medicoName?: string
  onClose: () => void
  onSaved: () => void
  editingRecord?: ListRecord
  expectedUpdatedAt?: string | null
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

const STAGE_LABELS: Record<string, string> = {
  'Datos Personales': 'Identificación',
  'Historia de Enfermedad Actual': 'Evaluación clínica',
  'Diagnóstico': 'Diagnóstico y cierre',
}

interface LocalidadOption {
  localidad: string
  tipo: string
  departamento: string
  municipio: string
  count: number
}

export function ExpedienteForm({ listId, role, medicoName, onClose, onSaved, editingRecord, expectedUpdatedAt }: Props) {
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
  const [conflict, setConflict] = useState<{ message: string; who?: string } | null>(null)
  const conflictRef = useRef(false)
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

  // calcular edad automáticamente cuando la fecha de nacimiento cambia
  // esto cubre: digitación completa (ISO), cambios de mask a ISO, y limpieza
  useEffect(() => {
    if (!data.fecha_nacimiento) {
      setData((prev) => {
        if (prev.edad) return { ...prev, edad: '' }
        return prev
      })
      return
    }
    const edad = calcularEdadDesdeFechaNacimiento(data.fecha_nacimiento)
    setData((prev) => {
      const currentEdad = prev.edad
      if (edad && edad !== currentEdad) return { ...prev, edad }
      if (!edad && currentEdad) return { ...prev, edad: '' }
      return prev
    })
  }, [data.fecha_nacimiento])

  useEffect(() => {
    if (editingRecord && (data.peso || data.talla)) {
      const imc = calcularBMI(data.peso, data.talla)
      if (imc) setValue('bmi', imc)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingRecord])

  const dataRef = useRef<Record<string, any>>(data)
  dataRef.current = data
  const customEspRef = useRef(customEspecialidad)
  customEspRef.current = customEspecialidad
  const dirtyRef = useRef(false)

  const dirty = useMemo(
    () => JSON.stringify(data) !== JSON.stringify(dataRef.current),
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
      if (key === 'fecha_nacimiento') {
        next['edad'] = calcularEdadDesdeFechaNacimiento(value)
      }
      return next
    })
  }

  const toggleSection = (title: string) => {
    const next = expanded === title ? '' : title
    setExpanded(next)
    if (next) {
      const i = sections.findIndex((s) => s.title === next)
      requestAnimationFrame(() => {
        document.getElementById(`form-section-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }

  const goToSection = (i: number) => {
    const s = sections[i]
    if (!s) return
    setExpanded(s.title)
    requestAnimationFrame(() => {
      document.getElementById(`form-section-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const onSectionBodyKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter') return
    const t = e.target as HTMLElement
    if (t.tagName !== 'INPUT' && t.tagName !== 'SELECT') return
    if (t.tagName === 'INPUT' && t.hasAttribute('readonly')) return
    e.preventDefault()
    const body = t.closest('[data-section-body]') as HTMLElement | null
    if (!body) return
    const fields = Array.from(body.querySelectorAll<HTMLElement>('input:not(:disabled):not([readonly]), select:not(:disabled)'))
    const idx = fields.indexOf(t)
    const next = fields[idx + 1]
    if (next) {
      next.focus()
    } else {
      return
    }
  }

  useEffect(() => {
    const i = sections.findIndex((s) => s.title === expanded)
    if (i === -1) return
    const t = setTimeout(() => {
      const el = document.getElementById(`form-section-${i}`)
      const first = el?.querySelector<HTMLElement>('input:not(:disabled):not([readonly]), select:not(:disabled)')
      first?.focus()
    }, 60)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, role])

  const localidadesFiltradas = localidades.filter(
    (l) => l.departamento === data.departamento && l.municipio === data.municipio
  )

  const handleLocalidadChange = (value: string) => {
    const titled = titleCase(value)
    setValue('localidad', titled)
    const normalized = normalizeText(titled)
    if (!normalized) {
      setLocalidadMatch(null)
      return
    }
    const match = localidadesFiltradas.find((l) => normalizeText(l.localidad) === normalized) || null
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
    const fechaErr = validateDates(data)
    if (fechaErr) {
      toast(fechaErr, 'error')
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

  const performSave = async (force = false) => {
    if (saving && !force) return
    setSaving(true)
    try {
      const payload = { ...data }
      if (payload.fecha_nacimiento && String(payload.fecha_nacimiento).includes('/')) {
        const raw = String(payload.fecha_nacimiento)
        const d = raw.replace(/\D/g, '')
        if (d.length === 8) {
          const mm = d.slice(0, 2)
          const dd = d.slice(2, 4)
          const yyyy = d.slice(4, 8)
          payload.fecha_nacimiento = `${yyyy}-${mm}-${dd}`
        }
      }
      if (!editingRecord && !payload.fecha_elaboracion) payload.fecha_elaboracion = todayHonduras()
      if (!payload.nombre_medico && medicoName) payload.nombre_medico = medicoName
      if (editingRecord) {
        const body: any = { data: payload }
        if (!force && expectedUpdatedAt) body.expected_updated_at = expectedUpdatedAt
        await listsApi.updateRecord(listId, editingRecord.id, body)
        toast('Expediente actualizado correctamente', 'success')
      } else {
        await listsApi.createRecord(listId, { data: payload })
        toast('Expediente creado correctamente', 'success')
      }
      clearDraft(draftKeyStr)
      onSaved()
      onClose()
    } catch (err: any) {
      if (err.response?.status === 409) {
        const detail = err.response.data?.detail
        setConflict({
          message: typeof detail === 'string' ? detail : (detail?.message || 'Este expediente fue modificado por otra persona.'),
          who: typeof detail === 'object' && detail ? detail.updated_by_name : undefined,
        })
        conflictRef.current = false
        return
      }
      toast(err.response?.data?.detail || 'Error al guardar el expediente', 'error')
    } finally {
      setSaving(false)
    }
  }

  const total = totalFieldsFrom(sections, data)
  const filled = filledFields(sections, data)
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0

  return (
    <div className="fixed inset-0 bg-[#0F172A]/30 backdrop-blur-sm flex flex-col items-center justify-center z-50 p-4">
      <div className="bg-[#F7F8FA] w-full h-full max-w-full flex flex-col overflow-y-auto overflow-x-hidden rounded-xl shadow-xl my-4">
        <div className="px-6 py-4 border-b border-[#E4E8EE] flex items-center justify-between shrink-0 bg-white">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#0F766E] text-white flex items-center justify-center shrink-0">
              <Stethoscope size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="text-[17px] font-bold text-[#1E2A32] tracking-tight leading-none truncate">{editingRecord ? 'Editar Expediente Médico' : 'Nuevo Expediente Médico'}</h2>
              <p className="text-xs text-[#5F6C79] mt-0.5 truncate">
                {editingRecord
                  ? editingRecord.updated_at
                    ? `Modifique los campos necesarios · Editado ${formatAgo(editingRecord.updated_at)}`
                    : 'Modifique los campos necesarios'
                  : 'Complete todas las secciones para crear el registro'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {dirty && (
              <span className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-3 py-1">
                <CheckCircle2 size={13} />
                Borrador guardado automáticamente
              </span>
            )}
            <button onClick={() => void handleClose()} title="Cerrar" className="p-2 hover:bg-[#EEF1F5] rounded-lg text-[#7A8694]">
              ✕
            </button>
          </div>
        </div>

        <div className="px-8 pt-4 pb-3 shrink-0 bg-white border-b border-[#E4E8EE] space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1 bg-[#EEF1F5] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#0F766E] rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-[#3F4D58] min-w-[3rem] text-right">
              {pct}%
            </span>
            <span className="text-[0.625rem] text-[#7A8694] hidden sm:inline">{filled}/{total} campos</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 px-8 py-2 border-b border-[#E4E8EE] bg-white">
            {sections.map((s, i) => {
              const done = isSectionComplete(s, data)
              const active = expanded === s.title
              return (
                <button
                  key={s.title}
                  type="button"
                  onClick={() => goToSection(i)}
                  className={`shrink-0 flex items-center gap-1.5 py-3 text-xs font-medium border-b-2 -mb-px tracking-wide transition-colors duration-150 ${active ? 'border-[#0F766E] text-[#0F766E]' : done ? 'border-transparent text-[#5F6C79]' : 'border-transparent text-[#8E9AA6] hover:text-[#1E2A32]'}`}
                  title={s.title}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium leading-none shrink-0 border ${active ? 'bg-[#0F766E] text-white border-[#0F766E]' : done ? 'bg-white text-[#5F6C79] border-[#D5DBE3]' : 'bg-white text-[#8E9AA6] border-[#E4E8EE]'}`}>
                    {done ? <CheckCircle2 size={11} /> : String(i + 1)}
                  </span>
                  <span className="max-w-[110px] truncate hidden sm:inline">{s.title}</span>
                  <span className="sm:hidden">{String(i + 1)}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex-1 min-h-0 px-6 md:px-8 py-4 bg-[#F5F7FA] flex justify-center overflow-y-auto overflow-x-hidden"><div className="w-full flex flex-col gap-2">
          {sections.map((section, sIdx) => {
            const done = isSectionComplete(section, data)
            const isOpen = expanded === section.title
            const stageLabel = STAGE_LABELS[section.title]
            return (
              <Fragment key={section.title}>
                <div id={`form-section-${sIdx}`} className={`${isOpen ? 'block' : 'hidden'} bg-white border border-[#D5DBE3] rounded-lg overflow-visible flex flex-col mb-1`}>
                  <div
                    className={`w-full flex items-center gap-3 px-6 py-4 text-left rounded-t-lg min-h-[52px] ${isOpen ? 'bg-white border-b border-[#EEF1F5]' : 'bg-transparent'}`}
                  >
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${done ? 'bg-[#0F766E] text-white' : 'bg-[#EEF1F5] text-[#5F6C79]'}`}>
                      {done ? <CheckCircle2 size={15} /> : <span className="text-xs font-bold">{String(sIdx + 1).padStart(2, '0')}</span>}
                    </span>
                    <span className="text-[#5F6C79] shrink-0">{section.icon}</span>
                  <span className={`flex-1 font-medium text-sm ${done ? 'text-[#2B3A45]' : 'text-[#2B3A45]'}`}>
                    {section.title}
                  </span>
                  <span className="text-xs text-[#7A8694]">
                    {section.fields.filter((f) => {
                      if (f.optional) return false
                      if (f.key === OBS_COMPENSADO_KEY && !compensadoObsRequired(data)) return false
                      if (clinicalDisabled(f.key, data)) return false
                      const v = data[f.key]
                      return v !== undefined && v !== null && String(v).trim() !== ''
                    }).length}/{section.fields.filter((f) => !f.optional && !clinicalDisabled(f.key, data) && !(f.key === OBS_COMPENSADO_KEY && !compensadoObsRequired(data))).length}
                  </span>
                  {isOpen ? <ChevronDown size={16} className="text-[#7A8694] opacity-30" /> : <ChevronRight size={16} className="text-[#7A8694] opacity-30" />}
                </div>
                {isOpen && (
                  <Fragment>
                  <div data-section-body onKeyDown={onSectionBodyKeyDown} className={`px-6 md:px-8 py-5 md:py-6 grid gap-x-6 md:gap-x-8 gap-y-4 content-start flex-none overflow-visible ${section.title === 'Domicilio' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4 bg-white' : section.compact ? 'grid-cols-2 md:grid-cols-4 bg-white' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 bg-white'} rounded-b-lg`}>
                    {section.fields.map((field) => {
                      if (field.key === 'telefono2' || field.key === 'telefono3') return null
                      if (field.key === OBS_COMPENSADO_KEY) return null
                      if (field.key === 'telefono') {
                        const phones = section.fields.filter((f) => f.key.startsWith('telefono'))
                        return (
                          <div key="telefonos" className={section.compact ? '' : 'md:col-span-2 lg:col-span-3'}>
                            <div className="grid grid-cols-3 gap-x-4 gap-y-3">
                              {phones.map((p) => (
                                <div key={p.key}>
                                  <label className="block text-sm font-medium text-[#2B3A45] mb-1">
                                    {p.label}
                                  </label>
                                  <input
                                    type="text"
                                    value={data[p.key] || ''}
                                    onChange={(e) => {
                                      const digits = e.target.value.replace(/\D/g, '').slice(0, 8)
                                      let formatted = ''
                                      if (digits.length > 0) formatted = digits.slice(0, 4)
                                      if (digits.length > 4) formatted += '-' + digits.slice(4, 8)
                                      setValue(p.key, formatted)
                                    }}
                                    placeholder="0000-0000"
                                    className="w-full px-4 py-3 border border-[#D5DBE3] rounded-lg text-sm bg-white focus:ring-1 focus:ring-[#0F766E] focus:border-[#0F766E] transition-colors"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      }
                      return (
                      <div key={field.key} className={FULL_WIDTH_KEYS.has(field.key) ? 'md:col-span-2 lg:col-span-3' : ''}>
                        <label className={`block text-sm font-medium mb-1 ${field.key === 'compensado' && compensadoObsMissing(data) ? 'text-red-700' : 'text-[#2B3A45]'}`}>
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
                                className="w-full px-4 py-3 border border-[#D5DBE3] rounded-lg text-sm bg-white focus:ring-1 focus:ring-[#0F766E] focus:border-[#0F766E] transition-colors"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const v = data.especialidad
                                  if (v && !especialidades.includes(v)) setValue('especialidad', '')
                                  setCustomEspecialidad(false)
                                }}
                                className="text-xs text-[#115E59] hover:text-[#1E2A32] font-medium"
                              >
                                ← Volver a seleccionar de la lista
                              </button>
                            </div>
                          ) : (
                            <ScrollSelect
                              value={data[field.key] || ''}
                              onChange={(v) => {
                                if (v === '__otro__') {
                                  setCustomEspecialidad(true)
                                } else {
                                  setValue(field.key, v)
                                }
                              }}
                              options={[
                                ...especialidades.map((esp) => ({ value: esp, label: esp })),
                                { value: '__otro__', label: 'Otro (escribir manualmente)...' },
                              ]}
                              placeholder="Seleccione una especialidad..."
                            />
                          )
                        ) : field.key === 'criticidad' ? (
                          criticidadEnabled(data) ? (
                            <select
                              value={data[field.key] || ''}
                              onChange={(e) => setValue(field.key, e.target.value)}
                              className="w-full px-4 py-3 border border-[#D5DBE3] rounded-lg text-sm bg-white focus:ring-1 focus:ring-[#0F766E] focus:border-[#0F766E] transition-colors"
                            >
                              <option value="">Seleccione...</option>
                              <option value="Baja">Baja</option>
                              <option value="Media">Media</option>
                              <option value="Alta">Alta</option>
                            </select>
                          ) : (
                            <div className="px-3 py-2 rounded-lg bg-[#F7F8FA] border border-dashed border-[#E4E8EE] text-xs text-[#5F6C79]">
                              Complete primero el diagnóstico (mínimo 5 caracteres) para asignar la criticidad clínica.
                            </div>
                          )
                        ) : field.key === 'compensado' ? (
                          criticidadEnabled(data) ? (
                            <div className={`rounded-lg border overflow-hidden transition-colors ${compensadoObsMissing(data) ? 'border-red-400' : 'border-[#E4E8EE]'} focus-within:ring-2 focus-within:ring-[#8E9AA6] focus-within:border-[#5F6C79]`}>
                              <select
                                value={data[field.key] || ''}
                                onChange={(e) => setValue(field.key, e.target.value)}
                                className={`w-full px-3 py-2 text-sm bg-white outline-none ${compensadoObsRequired(data) ? 'text-red-700 font-semibold' : 'text-[#2B3A45]'}`}
                              >
                                <option value="">Seleccione...</option>
                                <option value="Sí">Sí</option>
                                <option value="No">No</option>
                              </select>
                              <div className={`border-t ${compensadoObsMissing(data) ? 'border-red-300' : 'border-[#E4E8EE]'}`}>
                                <label className="block px-3 pt-2 text-xs font-medium text-[#5F6C79]">
                                  Observación (Obligatorio si no está compensado)
                                </label>
                                <textarea
                                  rows={2}
                                  data-obs-compensado
                                  value={data[OBS_COMPENSADO_KEY] || ''}
                                  onChange={(e) => setValue(OBS_COMPENSADO_KEY, capitalizeFirst(e.target.value))}
                                  placeholder={compensadoObsRequired(data) ? 'Escriba el motivo por el cual no está compensado...' : 'Opcional'}
                                  className={`w-full px-3 py-2 text-sm resize-none outline-none bg-white ${compensadoObsMissing(data) ? 'bg-red-50/40' : ''}`}
                                />
                                {compensadoObsMissing(data) && (
                                  <p className="px-3 pb-2 text-xs text-red-600 font-medium">
                                    Escriba el motivo porque el paciente no está compensado.
                                  </p>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="px-3 py-2 rounded-lg bg-[#F7F8FA] border border-dashed border-[#E4E8EE] text-xs text-[#5F6C79]">
                              Complete primero el diagnóstico (mínimo 5 caracteres) para indicar si está compensado.
                            </div>
                          )
                        ) : field.key === 'sexo' ? (
                          <div className="flex gap-2">
                            {(['M', 'F'] as const).map((v) => (
                              <button
                                key={v}
                                type="button"
                                onClick={() => setValue(field.key, data[field.key] === v ? '' : v)}
                                className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${data[field.key] === v ? 'bg-[#0F766E] text-white border-[#0F766E]' : 'bg-white text-[#2B3A45] border-[#D5DBE3] hover:border-[#0F766E] hover:text-[#0F766E]'}`}
                              >
                                {v}
                              </button>
                            ))}
                          </div>
                        ) : field.key === 'edad' ? (() => {
                          const edadCalculada = calcularEdadDesdeFechaNacimiento(data.fecha_nacimiento)
                          const edadStr = edadCalculada || data.edad || ''
                          const edadParts = typeof edadStr === 'string' ? edadStr.match(/^(\d+)\s*([am])$/) : null
                          const edadNum = edadParts ? edadParts[1] : (typeof edadStr === 'string' ? edadStr : '')
                          const edadUnit = edadParts ? edadParts[2] : 'a'
                          return (
                            <div className="flex items-center gap-2 px-3 py-2 bg-[#F7F8FA] border border-[#E4E8EE] rounded-lg">
                              <span className="text-sm font-medium text-[#2B3A45]">{edadNum || '—'}</span>
                              <span className="text-xs text-[#7A8694]">({edadUnit === 'm' ? 'meses' : 'años'})</span>
                            </div>
                          )
                        })() : field.key === 'perfil' ? (
                          <select
                            value={data[field.key] || ''}
                            onChange={(e) => setValue(field.key, e.target.value)}
                            className="w-full px-4 py-3 border border-[#D5DBE3] rounded-lg text-sm bg-white focus:ring-1 focus:ring-[#0F766E] focus:border-[#0F766E] transition-colors"
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
                            className="w-full px-4 py-3 border border-[#D5DBE3] rounded-lg text-sm bg-white focus:ring-1 focus:ring-[#0F766E] focus:border-[#0F766E] transition-colors"
                          >
                            <option value="">Seleccione...</option>
                            <option value="Si">Si</option>
                            <option value="No">No</option>
                          </select>
                        ) : field.key === 'estatus_cirugia' ? (
                          <select
                            value={data[field.key] || ''}
                            onChange={(e) => setValue(field.key, e.target.value)}
                            className="w-full px-4 py-3 border border-[#D5DBE3] rounded-lg text-sm bg-white focus:ring-1 focus:ring-[#0F766E] focus:border-[#0F766E] transition-colors"
                          >
                            <option value="">Seleccione...</option>
                            <option value="En lista">En lista</option>
                            <option value="En espera">En espera</option>
                            <option value="Reprogramar">Reprogramar</option>
                            <option value="Cancelado">Cancelado</option>
                            <option value="Fuera de perfil San Benito">Fuera de perfil San Benito</option>
                            <option value="Operado">Operado</option>
                            <option value="No apto para cirugía">No apto para cirugía</option>
                            <option value="No se presentó">No se presentó</option>
                          </select>
                        ) : field.key === 'expediente' ? (
                          <div>
                            <input
                              type="text"
                              inputMode="numeric"
                              value={data[field.key] || ''}
                              onChange={(e) => setValue(field.key, e.target.value.replace(/\D/g, '').slice(0, 10))}
                              placeholder="Solo números"
                              className="w-full px-4 py-3 border border-[#D5DBE3] rounded-lg text-sm bg-white focus:ring-1 focus:ring-[#0F766E] focus:border-[#0F766E] transition-colors"
                            />
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
                            className="w-full px-4 py-3 border border-[#D5DBE3] rounded-lg text-sm bg-white focus:ring-1 focus:ring-[#0F766E] focus:border-[#0F766E] transition-colors"
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
                            className="w-full px-4 py-3 border border-[#D5DBE3] rounded-lg text-sm bg-white focus:ring-1 focus:ring-[#0F766E] focus:border-[#0F766E] transition-colors"
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
                            className="w-full px-4 py-3 border border-[#D5DBE3] rounded-lg text-sm bg-white focus:ring-1 focus:ring-[#0F766E] focus:border-[#0F766E] transition-colors"
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
                              className="w-full px-3 py-2 pr-10 border border-[#E4E8EE] rounded-lg text-sm focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79]"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7A8694] text-sm pointer-events-none">kg</span>
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
                              className="w-full px-3 py-2 pr-10 border border-[#E4E8EE] rounded-lg text-sm focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79]"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7A8694] text-sm pointer-events-none">mts</span>
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
                              className="w-full px-3 py-2 pr-14 border border-[#E4E8EE] rounded-lg text-sm bg-[#F7F8FA] text-[#5F6C79] focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] disabled:cursor-not-allowed"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7A8694] text-sm pointer-events-none whitespace-nowrap">
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
                            className={`w-full px-3 py-2 border border-[#E4E8EE] rounded-lg text-sm focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] resize-none ${(field.key as string) === 'examen_fisico' || (field.key as string) === 'diagnostico' || (field.key as string) === 'historia_enfermedad' ? 'min-h-[160px]' : ['enfermedades_previas','cirugias_previas','alergias','otros_antecedentes'].includes(field.key as string) ? 'min-h-[110px]' : ''}`}
                          />
                        ) : field.key === 'departamento' ? (
                          <ScrollSelect
                            value={data[field.key] || ''}
                            onChange={(v) => {
                              setValue('departamento', v)
                              if (v && !(HONDURAS_DEPARTAMENTOS[v] || []).includes(data.municipio)) {
                                setValue('municipio', '')
                                setValue('localidad', '')
                                setValue('tipo_localidad', '')
                                setLocalidadMatch(null)
                              }
                            }}
                            options={Object.keys(HONDURAS_DEPARTAMENTOS).map((d) => ({ value: d, label: d }))}
                            placeholder="Seleccione el departamento..."
                          />
                        ) : field.key === 'municipio' ? (
                          <ScrollSelect
                            value={data[field.key] || ''}
                            onChange={(v) => {
                              setValue('municipio', v)
                              setValue('localidad', '')
                              setValue('tipo_localidad', '')
                              setLocalidadMatch(null)
                            }}
                            disabled={!data.departamento}
                            options={(HONDURAS_DEPARTAMENTOS[data.departamento] || []).map((m) => ({ value: m, label: m }))}
                            placeholder={data.departamento ? 'Seleccione el municipio...' : 'Seleccione primero un departamento'}
                          />
                        ) : field.key === 'tipo_localidad' ? (
                          <select
                            value={data[field.key] || ''}
                            onChange={(e) => setValue('tipo_localidad', e.target.value)}
                            className="w-full px-4 py-3 border border-[#D5DBE3] rounded-lg text-sm bg-white focus:ring-1 focus:ring-[#0F766E] focus:border-[#0F766E] transition-colors"
                          >
                            <option value="">Seleccione el tipo...</option>
                            {TIPO_LOCALIDAD_OPTIONS.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        ) : field.key === 'localidad' ? (
                          <div>
                            <LocalidadInput
                              value={data[field.key] || ''}
                              onChange={handleLocalidadChange}
                              options={localidadesFiltradas}
                              disabled={!data.departamento || !data.municipio}
                              placeholder={data.departamento && data.municipio
                                ? 'Escriba o seleccione la localidad'
                                : 'Seleccione primero departamento y municipio'}
                            />
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
                          (role === 'medico' || role === 'direccion_medica') ? (
                            <input
                              type="text"
                              value={data[field.key] || medicoName || ''}
                              readOnly
                              disabled
                              title="El nombre del médico se asigna automáticamente según el usuario"
                              className="w-full px-3 py-2 border border-[#E4E8EE] rounded-lg text-sm bg-[#F7F8FA] text-[#3F4D58] disabled:cursor-not-allowed"
                            />
                          ) : (role === 'carga_px' || role === 'direccion') ? (
                            <div className="flex gap-2">
                              <select
                                value={parseMedico(data[field.key] || '').title}
                                onChange={(e) => {
                                  const name = parseMedico(data[field.key] || '').name
                                  setValue(field.key, `${e.target.value} ${name}`.trim())
                                }}
                                className="w-24 px-2 py-2 border border-[#E4E8EE] rounded-lg text-sm focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] bg-white"
                              >
                                <option value="Dr.">Dr.</option>
                                <option value="Dra.">Dra.</option>
                              </select>
                              <input
                                type="text"
                                value={parseMedico(data[field.key] || '').name}
                                onChange={(e) => {
                                  const title = parseMedico(data[field.key] || '').title
                                  const raw = e.target.value
                                  const capped = raw.replace(/\b\w/g, (c) => c.toUpperCase())
                                  setValue(field.key, `${title} ${capped}`.trim())
                                }}
                                placeholder="Nombre del médico"
                                className="flex-1 px-3 py-2 border border-[#E4E8EE] rounded-lg text-sm focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79]"
                              />
                            </div>
                          ) : (
                            <input
                              type="text"
                              value={data[field.key] || ''}
                              readOnly
                              disabled
                              title="Sin permiso para editar el nombre del médico"
                              className="w-full px-3 py-2 border border-[#E4E8EE] rounded-lg text-sm bg-[#F7F8FA] text-[#3F4D58] disabled:cursor-not-allowed"
                            />
                          )
                        ) : FIELD_UNITS[field.key] ? (
                          <div className="relative">
                            <input
                              type="text"
                              value={data[field.key] || ''}
                              onChange={(e) => setValue(field.key, e.target.value)}
                              placeholder="0"
                              className="w-full px-3 py-2 pr-12 border border-[#E4E8EE] rounded-lg text-sm focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79]"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7A8694] text-sm pointer-events-none whitespace-nowrap">
                              {FIELD_UNITS[field.key]}
                            </span>
                          </div>
                        ) : field.key === 'fecha_nacimiento' ? (
                          <NacimientoField value={data.fecha_nacimiento || ''} onChange={(v: string) => setValue('fecha_nacimiento', v)} />
                        ) : field.type === 'date' ? (
                          <input
                            type="date"
                            value={data[field.key] || ''}
                            onChange={(e) => setValue(field.key, e.target.value)}
                            className="w-full px-4 py-3 border border-[#D5DBE3] rounded-lg text-sm bg-white focus:ring-1 focus:ring-[#0F766E] focus:border-[#0F766E] transition-colors"
                          />
                        ) : field.type === 'number' ? (
                          <input
                            type="number"
                            value={data[field.key] ?? ''}
                            onChange={(e) => setValue(field.key, e.target.value === '' ? '' : Number(e.target.value))}
                            className="w-full px-4 py-3 border border-[#D5DBE3] rounded-lg text-sm bg-white focus:ring-1 focus:ring-[#0F766E] focus:border-[#0F766E] transition-colors"
                          />
                        ) : (
                          <textarea
                            rows={field.key === 'examen_fisico' || field.key === 'diagnostico' || field.key === 'historia_enfermedad' ? 5 : ['enfermedades_previas','cirugias_previas','alergias','otros_antecedentes'].includes(field.key as string) ? 3 : 1}
                            value={data[field.key] || ''}
                            onChange={(e) => setValue(field.key, CAPITALIZE_FIRST_KEYS.has(field.key) ? capitalizeFirst(e.target.value) : e.target.value)}
                            className={`w-full px-3 py-2 border border-[#E4E8EE] rounded-lg text-sm focus:ring-2 focus:ring-[#8E9AA6] focus:border-[#5F6C79] resize-none ${(field.key as string) === 'examen_fisico' || (field.key as string) === 'diagnostico' || (field.key as string) === 'historia_enfermedad' ? 'min-h-[160px]' : ['enfermedades_previas','cirugias_previas','alergias','otros_antecedentes'].includes(field.key as string) ? 'min-h-[110px]' : ''}`}
                          />
                        )}
                      </div>
                      )
                    })}
                  </div>
                  <div className="px-4 pb-4 flex items-center justify-between gap-3">
                    {sIdx > 0 ? (
                      <button
                        type="button"
                        onClick={() => goToSection(sIdx - 1)}
                        className="px-3.5 py-2 text-sm text-[#3F4D58] hover:bg-[#EEF1F5] rounded-lg border border-[#E4E8EE] transition-colors"
                      >
                        ← Anterior
                      </button>
                    ) : (
                      <span />
                    )}
                    {sIdx < sections.length - 1 ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (section.title === 'Diagnóstico' && compensadoObsMissing(data)) {
                            toast('Debe escribir la observación porque el paciente no está compensado', 'error')
                            return
                          }
                          goToSection(sIdx + 1)
                        }}
                        className="px-4 py-2 text-sm font-medium text-white bg-[#0F766E] hover:bg-[#115E59] rounded-lg transition-colors"
                      >
                        Siguiente sección →
                      </button>
                    ) : (
                      <span className="text-xs text-[#7A8694] text-right">
                        Última sección · guarde al terminar
                      </span>
                    )}
                  </div>
                  </Fragment>
                )}
              </div>
            </Fragment>
          )})}
        </div></div>

        <div className="px-6 py-3.5 border-t border-[#E4E8EE] flex items-center justify-between shrink-0 bg-white">
          <button
            onClick={() => void handleClose()}
            className="px-4 py-2 text-sm text-[#3F4D58] hover:bg-[#EEF1F5] rounded-lg border border-[#E4E8EE]"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!allComplete || saving}
            className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${allComplete && !saving
                ? 'bg-[#0F766E] text-white hover:bg-[#115E59] shadow-sm'
                : 'bg-[#EEF1F5] text-[#8E9AA6] cursor-not-allowed'}`}
          >
            {saving ? 'Guardando...' : allComplete ? (editingRecord ? 'Guardar Cambios' : 'Crear Expediente') : `Complete todas las secciones`}
          </button>
        </div>
      </div>

      {confirmCopy && (
        <div className="fixed inset-0 z-[60] bg-[#0F172A]/30 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="font-serif text-lg font-bold text-[#1E2A32] mb-3">Confirmación de expediente existente</h3>
            <p className="text-sm text-[#3F4D58] leading-relaxed">
              El número de expediente <b>{confirmCopy.numero}</b> ya existe en el sistema:
            </p>
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
              Se guardará como copia: <b>{confirmCopy.propuesta}</b>
            </div>
            <p className="mt-3 text-sm text-[#3F4D58] leading-relaxed">
              ¿Esta atención será una nueva intervención del mismo paciente? Si es así, el expediente se creará como copia del expediente original.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setConfirmCopy(null)
                  clearDraft(draftKeyStr)
                  onClose()
                }}
                className="px-4 py-2 text-sm text-[#3F4D58] hover:bg-[#EEF1F5] rounded-lg border border-[#D5DBE3]"
              >
                No, salir
              </button>
              <button
                onClick={() => {
                  setConfirmCopy(null)
                  void performSave()
                }}
                className="px-5 py-2.5 rounded-lg text-sm font-medium bg-[#0F766E] text-white hover:bg-[#115E59] shadow-sm"
              >
                Sí, continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {conflict && (
        <div className="fixed inset-0 z-[70] bg-[#0F172A]/30 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="font-serif text-lg font-bold text-[#1E2A32] mb-3">No se pudo guardar</h3>
            <p className="text-sm text-[#3F4D58] leading-relaxed">
              {conflict.message}
              {conflict.who && (
                <span className="block mt-1 text-xs text-[#5F6C79]">Última edición por: <b>{conflict.who}</b></span>
              )}
            </p>
            <p className="mt-3 text-sm text-[#3F4D58] leading-relaxed">
              Si sobrescribe, sus cambios reemplazarán la versión actual del expediente.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <button
                onClick={() => {
                  setConflict(null)
                  onClose()
                }}
                className="w-full px-4 py-2.5 text-sm font-medium bg-[#0F766E] text-white rounded-xl hover:bg-[#115E59] transition-all duration-200"
              >
                Salir y ver el expediente actualizado
              </button>
              <button
                onClick={() => {
                  setConflict(null)
                  void performSave(true)
                }}
                className="w-full px-4 py-2.5 text-sm font-medium bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all duration-200"
              >
                Sobrescribir de todas formas
              </button>
              <button
                onClick={() => setConflict(null)}
                className="w-full px-4 py-2 text-sm text-[#3F4D58] hover:bg-[#EEF1F5] rounded-xl transition-all duration-200"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
