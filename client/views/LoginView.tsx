import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { GoogleAuthProvider, signInWithPopup, getAuth } from 'firebase/auth';

const LoginView: React.FC = () => {
  const { user, status, dbUser, logout, authInstance } = useAuth();
  const navigate = useNavigate();

  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user && status === 'approved') {
      navigate('/saas');
    }
  }, [user, status, navigate]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      if (!authInstance) return setError('Cargando servicios de autenticación... por favor reintenta en un momento.');
      const provider = new GoogleAuthProvider();
      await signInWithPopup(authInstance, provider);
      // El onAuthStateChanged en AuthContext disparará la verificación
    } catch (e: any) {
      setError(e.message || 'Error al iniciar sesión con Google');
      setLoading(false);
    }
  };

  const submitPhone = async () => {
    if (!phone) return setError('Ingresa tu teléfono');
    setLoading(true);
    try {
      const idToken = await user?.getIdToken();
      const res = await fetch('/api/auth/firebase-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, phone }),
      });
      const data = await res.json();
      if (data.ok) {
        window.location.reload();
      } else {
        setError(data.error);
      }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-gray-200 flex items-center justify-center relative overflow-hidden font-inter p-4">
      {/* Background Decorators */}
      <div className="absolute top-1/4 -left-1/4 w-[600px] h-[600px] bg-[#7c5ef5] rounded-full mix-blend-screen filter blur-[150px] opacity-10 animate-pulse-slow"></div>
      <div className="absolute bottom-1/4 -right-1/4 w-[600px] h-[600px] bg-[#25d366] rounded-full mix-blend-screen filter blur-[150px] opacity-10 animate-pulse-slow delay-1000"></div>

      <div className="w-full max-w-md relative z-10">
        <div className="flex justify-center mb-8">
          <img src="/logo.png" alt="Whaibot Logo" className="object-contain" style={{ width: "100px" }} />
        </div>

        <div className="bg-[#12121a]/80 backdrop-blur-xl border border-white/5 rounded-2xl p-8 shadow-2xl">
          {user && status === 'pending' ? (
            <div className="text-center">
              <div className="text-4xl mb-4">⏳</div>
              <h2 className="text-xl font-bold mb-2">Solicitud Recibida</h2>

              {!dbUser?.phone ? (
                <>
                  <p className="text-gray-400 text-sm mb-6">Completa tu teléfono para que podamos contactarte y aprobar tu acceso.</p>

                  <div className="mb-4 text-left">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Teléfono (WhatsApp)</label>
                    <input
                      type="tel"
                      className="w-full bg-[#1a1a26] border border-white/5 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-[#25d366] focus:ring-1 focus:ring-[#25d366] transition-all"
                      placeholder="+54911..."
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>

                  <button
                    onClick={submitPhone}
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-[#25d366] to-[#128c7e] hover:brightness-110 text-black font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-[#25d366]/20 mb-4"
                  >
                    {loading ? 'Guardando...' : 'Guardar Teléfono'}
                  </button>
                </>
              ) : (
                <p className="text-gray-400 text-sm mb-6">Estamos revisando tu acceso. Pronto nos pondremos en contacto al {dbUser.phone}.</p>
              )}

              <button
                onClick={logout}
                className="text-gray-500 hover:text-white text-sm transition-colors py-2"
              >
                Cerrar sesión
              </button>
            </div>
          ) : user && status === 'rejected' ? (
            <div className="text-center">
              <div className="text-4xl mb-4">❌</div>
              <h2 className="text-xl font-bold mb-2 text-red-400">Acceso Denegado</h2>
              <p className="text-gray-400 text-sm mb-6">Tu solicitud no fue aprobada por el administrador.</p>
              <button
                onClick={logout}
                className="text-gray-500 hover:text-white text-sm transition-colors py-2"
              >
                Cerrar sesión
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold mb-1">Bienvenido a Whaibot</h2>
              <p className="text-gray-400 text-sm mb-8">Inicia sesión para gestionar tus bots</p>

              <button
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full bg-white hover:bg-gray-100 text-gray-900 font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-3 transition-all shadow-xl"
              >
                <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5" alt="Google" />
                {loading ? 'Conectando...' : 'Continuar con Google'}
              </button>
            </>
          )}

          {error && <div className="mt-6 text-red-400 text-sm text-center">{error}</div>}
        </div>
      </div>
    </div>
  );
};

export default LoginView;
