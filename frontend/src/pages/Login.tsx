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
      if (!navigator.onLine) {
        setError('Sin conexión a internet. Verifique su red e intente de nuevo.')
      } else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        setError('El servidor tardó demasiado en responder. El sistema está procesando muchas peticiones, espere 5 segundos e intente de nuevo.')
      } else if ((err as any).isOffline) {
        setError('Sin conexión al servidor. Verifique que tenga internet y que el servidor esté encendido.')
      } else if (!err.response) {
        // Error de red: el funnel de Tailscale o el backend no responde
        const apiUrl = (import.meta as any).env?.VITE_API_URL || ''
        if (apiUrl.includes('tail')) {
          setError('No se pudo conectar con el servidor (Tailscale). Verifique su conexión a internet. Si persiste, avise al administrador que revise la mini PC.')
        } else {
          setError('No se pudo conectar con el servidor. Verifique su conexión a internet e intente de nuevo.')
        }
      } else {
        setError(err.response?.data?.detail || 'Error al iniciar sesión')
      }
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-white">
      <div className="hidden lg:flex flex-col justify-between w-[55%] bg-[#0D9488] p-14">
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="bg-white rounded-xl border border-[#0F766E]/10 px-14 py-9">
            <img src="/logo_sbj.png" alt="Logo San Benito José" className="w-72 h-auto" />
          </div>
          <div className="w-12 h-px bg-white/25 mt-12" />
          <p className="mt-6 text-[0.6875rem] font-semibold text-[#B7F4EC] uppercase tracking-[0.3em]">
            Centro Médico San Benito José
          </p>
          <h1 className="font-serif font-bold text-5xl text-white mt-5 leading-tight tracking-tight">
            Sistema Web
            <span className="block text-[26px] font-bold mt-2 text-white/85">
              Expedientes Médicos
            </span>
          </h1>
        </div>

        <div className="text-center text-xs text-white/55">
          © {new Date().getFullYear()} TurtleLite · Centro Médico San Benito José
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8 bg-[#F7F8FA]">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-lg shadow-[#134E4A]/5 border border-[#E4E8EE] p-10">
          <div className="lg:hidden text-center mb-10">
            <img src="/logo_sbj.png" alt="Logo San Benito José" className="w-44 h-auto mx-auto mb-6" />
            <h1 className="font-serif font-bold text-2xl text-[#1E2A32]">
              Sistema Web
              <span className="block text-lg font-bold mt-1 text-[#1E2A32]">
                Expedientes Médicos
              </span>
            </h1>
          </div>

          <h2 className="font-serif font-bold text-[26px] text-[#1E2A32]">Iniciar sesión</h2>
          <p className="text-sm text-[#5F6C79] mt-2 mb-4">
            Ingrese sus credenciales para continuar.
          </p>
          <div className="w-10 h-0.5 bg-[#14B8A6] rounded-full mb-10" />

          {error && (
            <div className="bg-red-50 text-red-700 px-4 py-3 rounded-md text-sm mb-5 border border-red-100">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-[#1E2A32] mb-2">Usuario</label>
              <div className="relative">
                <User size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7A8694]" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loading}
                  className="w-full pl-10 pr-3.5 py-3 border border-[#E4E8EE] rounded-lg text-sm bg-white focus:border-[#0F766E] focus:ring-2 focus:ring-[#0F766E]/15 outline-none transition-all duration-200 disabled:bg-[#F7F8FA] disabled:text-[#7A8694]"
                  placeholder="Nombre de usuario"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1E2A32] mb-2">Contraseña</label>
              <div className="relative">
                <Lock size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7A8694]" />
                <PasswordInput
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="w-full pl-10 py-3 border border-[#E4E8EE] rounded-lg text-sm bg-white focus:border-[#0F766E] focus:ring-2 focus:ring-[#0F766E]/15 outline-none transition-all duration-200 disabled:bg-[#F7F8FA] disabled:text-[#7A8694]"
                  placeholder="Contraseña"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#0F766E] text-white rounded-lg text-sm font-semibold shadow-sm hover:bg-[#115E59] transition-colors duration-150 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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

          <p className="mt-8 text-center text-xs text-[#7A8694]">
            ¿Olvidó su contraseña? Contacte al administrador del sistema.
          </p>
        </div>
      </div>
    </div>
  )
}
