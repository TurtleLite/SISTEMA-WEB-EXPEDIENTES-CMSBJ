import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { User, Lock, Loader2 } from 'lucide-react'
import { PasswordInput } from '../components/PasswordInput'

export function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      navigate('/dashboard')
    } catch (err: any) {
      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        setError('El servidor tardó demasiado en responder (puede estar arrancando). Espere unos segundos e intente de nuevo.')
      } else if (!err.response) {
        setError('No se pudo conectar con el servidor. Verifique su conexión a internet e intente de nuevo.')
      } else {
        setError(err.response?.data?.detail || 'Error al iniciar sesión')
      }
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-white">
      <div className="hidden lg:flex flex-col justify-between w-[55%] bg-gradient-to-br from-[#0B2A26] via-[#0F3832] to-[#115E59] p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)', backgroundSize: '22px 22px' }} />
        <div className="relative text-center">
          <div className="bg-white rounded-xl shadow-md shadow-black/20 w-fit mx-auto p-5">
            <img src="/logo_sbj.png" alt="Logo San Benito José" className="w-52 h-auto" />
          </div>
          <p className="mt-10 text-[11px] font-semibold text-[#5EEAD4] uppercase tracking-[0.32em]">
            Centro Médico San Benito José
          </p>
          <h1 className="font-serif text-4xl text-white mt-4 leading-tight">
            Sistema Web
            <span className="block text-2xl font-normal mt-1 text-white/90">
              Gestión de Expedientes Médicos
            </span>
          </h1>
          <p className="mt-8 text-xs text-white/50 max-w-sm mx-auto leading-relaxed">
            Plataforma institucional para el registro, control y consulta de expedientes de pacientes.
          </p>
        </div>

        <div className="relative text-center text-xs text-white/40">
          © {new Date().getFullYear()} TurtleLite · Centro Médico San Benito José
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 bg-[#F7F8FA]">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-xl shadow-[#0B2A26]/5 border border-[#E4E8EE] p-8">
          <div className="lg:hidden text-center mb-10">
            <div className="bg-white rounded-lg shadow-md w-fit mx-auto p-4">
              <img src="/logo_sbj.png" alt="Logo San Benito José" className="w-36 h-auto" />
            </div>
            <h1 className="font-serif text-2xl text-[#1E2A32] mt-5">
              Sistema Web
              <span className="block text-lg font-normal mt-1 text-[#1E2A32]">
                Gestión de Expedientes Médicos
              </span>
            </h1>
          </div>

          <h2 className="font-serif text-2xl text-[#1E2A32]">Iniciar sesión</h2>
          <p className="text-sm text-[#5F6C79] mt-1.5 mb-8">
            Ingrese sus credenciales para continuar.
          </p>

          {error && (
            <div className="bg-red-50 text-red-700 px-4 py-3 rounded-md text-sm mb-5 border border-red-100">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-[#1E2A32] mb-1.5">Usuario</label>
              <div className="relative">
                <User size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A8694]" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loading}
                  className="w-full pl-9 pr-3 py-2.5 border border-[#E4E8EE] rounded-md text-sm bg-white focus:border-[#0F766E] focus:ring-2 focus:ring-[#0F766E]/15 outline-none transition-all duration-200 disabled:bg-[#F7F8FA] disabled:text-[#7A8694]"
                  placeholder="Nombre de usuario"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1E2A32] mb-1.5">Contraseña</label>
              <div className="relative">
                <Lock size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A8694]" />
                <PasswordInput
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="w-full pl-9 py-2.5 border border-[#E4E8EE] rounded-md text-sm bg-white focus:border-[#0F766E] focus:ring-2 focus:ring-[#0F766E]/15 outline-none transition-all duration-200 disabled:bg-[#F7F8FA] disabled:text-[#7A8694]"
                  placeholder="Contraseña"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#0F766E] text-white rounded-md text-sm font-semibold shadow-sm hover:bg-[#115E59] transition-colors duration-150 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Iniciando sesión…
                </>
              ) : (
                'Iniciar sesión'
              )}
            </button>
          </form>
          </div>

          <p className="mt-6 text-center text-xs text-[#7A8694]">
            ¿Olvidó su contraseña? Contacte al administrador del sistema.
          </p>
        </div>
      </div>
    </div>
  )
}
