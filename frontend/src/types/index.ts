export interface User {
  id: string
  username: string
  telefono: string
  full_name: string
  role: 'admin' | 'direccion' | 'direccion_medica' | 'medico' | 'carga_px' | 'oftalmologia'
  is_active: boolean
  locked_until?: string | null
  created_at: string
}

export interface AuthResponse {
  access_token: string
  refresh_token?: string | null
  token_type: string
  user: User
}

export interface ListDefinition {
  id: string
  name: string
  description?: string
  columns_config: ColumnConfig[]
  is_system: boolean
  created_by: string
  created_at: string
}

export interface ColumnConfig {
  key: string
  label: string
  type: string
}

export interface ListRecord {
  id: string
  list_definition_id: string
  data: Record<string, any>
  created_by: string | null
  created_at: string
  updated_at?: string | null
  updated_by?: string | null
  deleted_at?: string | null
}

export interface TrashedList {
  id: string
  name: string
  description?: string
  is_system: boolean
  deleted_at: string
  records_in_trash: number
}

export interface Report {
  id: string
  name: string
  description?: string
  list_definition_id?: string
  filters?: Record<string, any>
  columns_selected?: string[]
  created_by: string
  file_path_excel?: string
  file_path_pdf?: string
  created_at: string
  record_count?: number
  created_by_breakdown?: { full_name: string; count: number }[]
}

export interface Notification {
  id: string
  title: string
  message: string
  sender_user_id?: string | null
  sender_username?: string | null
  target_user_id?: string | null
  target_username?: string | null
  target_role?: string | null
  is_read: boolean
  read_at?: string | null
  created_at: string
}
