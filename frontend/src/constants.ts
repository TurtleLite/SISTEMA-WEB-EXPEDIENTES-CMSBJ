export interface RoleMeta {
  label: string
  badge: string
  gradient: string
  permissions: string[]
}

export const ROLE_META: Record<string, RoleMeta> = {
  admin: {
    label: 'Administrador',
    badge: 'bg-black text-white border-black',
    gradient: 'from-black to-black',
    permissions: [
      'Expedientes (solo consultar)',
      'Localidades y Especialidades (crear, editar, eliminar)',
      'Usuarios',
      'Sesiones y Auditoría',
    ],
  },
  direccion: {
    label: 'Dirección',
    badge: 'bg-teal-100 text-teal-800 border-teal-200',
    gradient: 'from-[#0F766E] to-[#115E59]',
    permissions: [
      'Expedientes (ver, editar, eliminar)',
      'Reportes, Listados y Estatus',
    ],
  },
  direccion_medica: {
    label: 'Dirección Médica',
    badge: 'bg-sky-100 text-sky-800 border-sky-200',
    gradient: 'from-sky-600 to-sky-800',
    permissions: [
      'Expedientes (ver, editar, eliminar)',
      'Reportes, Listados y Estatus',
    ],
  },
  medico: {
    label: 'Médico',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    gradient: 'from-emerald-600 to-emerald-800',
    permissions: [
      'Expedientes (ver, crear)',
      'Editar solo expedientes propios',
      'Exportar expedientes',
    ],
  },
  carga_px: {
    label: 'Carga Px',
    badge: 'bg-amber-100 text-amber-800 border-amber-200',
    gradient: 'from-amber-500 to-amber-700',
    permissions: [
      'Expedientes (ver, crear)',
      'Editar solo expedientes propios',
      'Nombre del médico a mano (libre)',
    ],
  },
  ofthalmologia: {
    label: 'Oftalmología',
    badge: 'bg-violet-100 text-violet-800 border-violet-200',
    gradient: 'from-violet-500 to-violet-700',
    permissions: [
      'Inicio, Mi Perfil y Reportes',
    ],
  },
}

export const roleLabel = (role?: string) => ROLE_META[role || '']?.label || 'Usuario'

export const TIPO_LOCALIDAD_OPTIONS = ['Aldea', 'Barrio', 'Colonia', 'Caserío']

export const HONDURAS_DEPARTAMENTOS: Record<string, string[]> = {
  'Atlántida': ['La Ceiba', 'El Porvenir', 'Tela', 'Jutiapa', 'La Masica', 'San Francisco', 'Arizona', 'Esparta'],
  'Choluteca': ['Choluteca', 'Apacilagua', 'Concepción de María', 'Duyure', 'El Corpus', 'El Triunfo', 'Marcovia', 'Morolica', 'Namasigüe', 'Orocuina', 'Pespire', 'San Antonio de Flores', 'San Isidro', 'San José', 'San Marcos de Colón', 'Santa Ana de Yusguare'],
  'Colón': ['Trujillo', 'Balfate', 'Iriona', 'Limón', 'Sabá', 'Santa Fe', 'Santa Rosa de Aguán', 'Sonaguera', 'Tocoa', 'Bonito Oriental'],
  'Comayagua': ['Comayagua', 'Ajuterique', 'El Rosario', 'Esquías', 'Humuya', 'La Libertad', 'Lamaní', 'La Trinidad', 'Lejamaní', 'Meámbar', 'Minas de Oro', 'Ojos de Agua', 'San Jerónimo', 'San José de Comayagua', 'San José del Potrero', 'San Luis', 'San Sebastián', 'Siguatepeque', 'Villa de San Antonio', 'Las Lajas', 'Taulabé'],
  'Copán': ['Santa Rosa de Copán', 'Cabañas', 'Concepción', 'Copán Ruinas', 'Corquín', 'Cucuyagua', 'Dolores', 'Dulce Nombre', 'El Paraíso', 'Florida', 'La Jigua', 'La Unión', 'Nueva Arcadia', 'San Agustín', 'San Antonio', 'San Jerónimo', 'San José', 'San Juan de Opoa', 'San Nicolás', 'San Pedro', 'Santa Rita', 'Trinidad de Copán', 'Veracruz'],
  'Cortés': ['San Pedro Sula', 'Choloma', 'Omoa', 'Pimienta', 'Potrerillos', 'Puerto Cortés', 'San Antonio de Cortés', 'San Francisco de Yojoa', 'San Manuel', 'Santa Cruz de Yojoa', 'Villanueva', 'La Lima'],
  'El Paraíso': ['Yuscarán', 'Alauca', 'Danlí', 'El Paraíso', 'Güinope', 'Jacaleapa', 'Liure', 'Morocelí', 'Oropolí', 'Potrerillos', 'San Antonio de Flores', 'San Lucas', 'San Matías', 'Soledad', 'Teupasenti', 'Texiguat', 'Vado Ancho', 'Yauyupe', 'Trojes'],
  'Francisco Morazán': ['Distrito Central', 'Alubarén', 'Cedros', 'Curarén', 'El Porvenir', 'Guaimaca', 'La Libertad', 'La Venta', 'Lepaterique', 'Maraita', 'Marale', 'Nueva Armenia', 'Ojojona', 'Orica', 'Reitoca', 'Sabanagrande', 'San Antonio de Oriente', 'San Buenaventura', 'San Ignacio', 'Cantarranas', 'San Miguelito', 'Santa Ana', 'Santa Lucía', 'Talanga', 'Tatumbla', 'Valle de Ángeles', 'Villa de San Francisco', 'Vallecillo'],
  'Gracias a Dios': ['Puerto Lempira', 'Brus Laguna', 'Ahuas', 'Juan Francisco Bulnes', 'Villeda Morales', 'Wampusirpe'],
  'Intibucá': ['La Esperanza', 'Camasca', 'Colomoncagua', 'Concepción', 'Dolores', 'Intibucá', 'Jesús de Otoro', 'Magdalena', 'Masaguara', 'San Antonio', 'San Isidro', 'San Juan', 'San Marcos de la Sierra', 'San Miguel Guancapla', 'Santa Lucía', 'Yamaranguila', 'San Francisco de Opalaca'],
  'Islas de la Bahía': ['Roatán', 'Guanaja', 'José Santos Guardiola', 'Utila'],
  'La Paz': ['La Paz', 'Aguanqueterique', 'Cabañas', 'Cane', 'Chinacla', 'Guajiquiro', 'Lauterique', 'Marcala', 'Mercedes de Oriente', 'Opatoro', 'San Antonio del Norte', 'San José', 'San Juan', 'San Pedro de Tutule', 'Santa Ana', 'Santa Elena', 'Santa María', 'Santiago de Puringla', 'Yarula'],
  'Lempira': ['Gracias', 'Belén', 'Candelaria', 'Cololaca', 'Erandique', 'Gualcince', 'Guarita', 'La Campa', 'La Iguala', 'Las Flores', 'La Unión', 'La Virtud', 'Lepaera', 'Mapulaca', 'Piraera', 'San Andrés', 'San Francisco', 'San Juan Guarita', 'San Manuel Colohete', 'San Rafael', 'San Sebastián', 'Santa Cruz', 'Talgua', 'Tambla', 'Tomalá', 'Valladolid', 'Virginia', 'San Marcos de Caiquín'],
  'Ocotepeque': ['Ocotepeque', 'Belén Gualcho', 'Concepción', 'Dolores Merendón', 'Fraternidad', 'La Encarnación', 'La Labor', 'Lucerna', 'Mercedes', 'San Fernando', 'San Francisco del Valle', 'San Jorge', 'San Marcos', 'Santa Fe', 'Sensenti', 'Sinuapa'],
  'Olancho': ['Juticalpa', 'Campamento', 'Catacamas', 'Concordia', 'Dulce Nombre de Culmí', 'El Rosario', 'Esquipulas del Norte', 'Gualaco', 'Guarizama', 'Guata', 'Guayape', 'Jano', 'La Unión', 'Mangulile', 'Manto', 'Salamá', 'San Esteban', 'San Francisco de Becerra', 'San Francisco de la Paz', 'Santa María del Real', 'Silca', 'Yocón', 'Patuca'],
  'Santa Bárbara': ['Santa Bárbara', 'Arada', 'Atima', 'Azacualpa', 'Ceguaca', 'Concepción del Norte', 'Concepción del Sur', 'Chinda', 'El Níspero', 'Gualala', 'Ilama', 'Las Vegas', 'Macuelizo', 'Naranjito', 'Nuevo Celilac', 'Nueva Frontera', 'Petoa', 'Protección', 'Quimistán', 'San Francisco de Ojuera', 'San José de las Colinas', 'San Luis', 'San Marcos', 'San Nicolás', 'San Pedro Zacapa', 'San Vicente Centenario', 'Santa Rita', 'Trinidad'],
  'Valle': ['Nacaome', 'Alianza', 'Amapala', 'Aramecina', 'Caridad', 'Goascorán', 'Langue', 'San Francisco de Coray', 'San Lorenzo'],
  'Yoro': ['Yoro', 'Arenal', 'El Negrito', 'El Progreso', 'Jocón', 'Morazán', 'Olanchito', 'Santa Rita', 'Sulaco', 'Victoria', 'Yorito'],
}