import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Menu, X, FileText } from 'lucide-react';

const Layout: React.FC = () => {
  const { user, status, logout, isAdmin, dbUser } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Bot selector for Plantillas nav entry
  const [showPlantillasModal, setShowPlantillasModal] = useState(false);
  const [plantillasBots, setPlantillasBots] = useState<{ botId: string; nombre: string }[]>([]);
  const [loadingBots, setLoadingBots] = useState(false);

  const openPlantillasModal = async () => {
    setShowPlantillasModal(true);
    setLoadingBots(true);
    try {
      const token = await user?.getIdToken();
      const res = await fetch('/api/saas/bots', { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      if (data.ok) setPlantillasBots(data.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingBots(false);
    }
  };

  const selectBotForPlantillas = (botId: string) => {
    setShowPlantillasModal(false);
    setSidebarOpen(false);
    navigate(`/bot/${botId}`, { state: { initialTab: 'plantillas' } });
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const closeNav = () => setSidebarOpen(false);

  if (status === 'pending' || status === 'rejected') {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-gray-200 flex items-center justify-center font-inter p-4">
        <div className="bg-[#12121a] p-8 border border-white/10 rounded-2xl max-w-md w-full text-center">
          <h2 className="text-xl font-bold mb-4">Acceso Restringido</h2>
          <p className="text-gray-400 mb-6">Debes tener cuenta aprobada para acceder al panel.</p>
          <button onClick={handleLogout} className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
            Cerrar Sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="h-screen bg-[#0a0a0f] text-gray-200 font-inter flex overflow-hidden">

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-30 lg:hidden" onClick={closeNav} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:relative inset-y-0 left-0 z-40
        w-64 bg-[#12121a] border-r border-white/5 flex flex-col h-screen shrink-0
        transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="h-16 flex items-center px-6 border-b border-white/5">
          <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center overflow-hidden shadow-lg mr-3">
            <img src="/logo.png" alt="Whaibot Logo" className="object-contain" style={{ width: '150px' }} />
          </div>
          <span className="font-bold text-lg tracking-tight"> Whaibot</span>
          <button onClick={closeNav} className="ml-auto lg:hidden p-1 text-gray-500 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <NavLink to="/saas" end onClick={closeNav}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive ? 'bg-[#25d366]/10 text-[#25d366] font-medium' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`
            }
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>
            <span className="text-sm">Mis Bots</span>
          </NavLink>

          <NavLink to="/saas/subscription" onClick={closeNav}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive ? 'bg-[#25d366]/10 text-[#25d366] font-medium' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`
            }
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" /></svg>
            <span className="text-sm">Suscripción</span>
          </NavLink>

          {/* Plantillas button — opens bot-selector modal */}
          <button
            onClick={openPlantillasModal}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-gray-400 hover:bg-[#25d366]/10 hover:text-[#25d366]"
          >
            <FileText className="w-5 h-5" />
            <span className="text-sm">Plantillas</span>
          </button>

          {isAdmin && (
            <>
              <div className="pt-4 pb-2 px-3 text-[10px] font-bold text-gray-600 uppercase tracking-widest">Admin Global</div>
              <NavLink to="/saas/admin" onClick={closeNav}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive ? 'bg-[#7c5ef5]/10 text-[#7c5ef5] font-medium' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`
                }
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688 0-1.37-.247-1.896-.74a.494.494 0 00-.698.006c-.464.475-1.096.734-1.761.734H5.25A2.25 2.25 0 013 13.5v-9A2.25 2.25 0 015.25 2.25h13.5A2.25 2.25 0 0121 4.5v9a2.25 2.25 0 01-2.25 2.25h-.735c-.665 0-1.297-.259-1.761-.734a.494.494 0 00-.698-.006c-.526.493-1.208.74-1.896.74.688 0 1.37.247 1.896.74.316.3.81.3 1.127 0a3.743 3.743 0 00.941-1.321 3.738 3.738 0 001.32-1.32c.492-.527.738-1.209.738-1.897v-9C21 3.172 20.156 2.25 19.124 2.25H4.876C3.844 2.25 3 3.172 3 4.204v9C3 14.332 3.844 15 4.876 15H6a3.75 3.75 0 002.438-.89l.86-.807a.75.75 0 011.026 0l.86.807A3.75 3.75 0 0013.62 15h.736a3.737 3.737 0 001.32 1.32 3.743 3.743 0 00.941 1.321c-.316.3-.81.3-1.127 0-.526-.493-1.208-.74-1.896-.74z" /></svg>
                <span className="text-sm">Configurar Bots</span>
              </NavLink>

              <NavLink to="/saas/admin/subscriptions" onClick={closeNav}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive ? 'bg-[#7c5ef5]/10 text-[#7c5ef5] font-medium' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`
                }
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span className="text-sm">Facturación</span>
              </NavLink>

              <NavLink to="/saas/admin/plans" onClick={closeNav}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive ? 'bg-[#7c5ef5]/10 text-[#7c5ef5] font-medium' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`
                }
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" /></svg>
                <span className="text-sm">Planes</span>
              </NavLink>

              <NavLink to="/saas/users" onClick={closeNav}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive ? 'bg-[#7c5ef5]/10 text-[#7c5ef5] font-medium' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`
                }
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
                <span className="text-sm">Gestión de Usuarios</span>
              </NavLink>
            </>
          )}
        </nav>

        <div className="p-4 border-t border-white/5">
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center overflow-hidden shrink-0">
              {user?.photoURL ? <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" /> : '👤'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{user?.displayName || dbUser?.displayName || 'Usuario'}</div>
              <div className="text-xs text-gray-500 truncate">
                {user?.email || ''}
                {isAdmin && <span className="ml-1 text-purple-400 font-bold">· Admin</span>}
              </div>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 h-screen overflow-y-auto bg-[#0a0a0f] relative min-w-0">
        {/* Mobile topbar */}
        <div className="lg:hidden sticky top-0 z-20 bg-[#0a0a0f]/95 backdrop-blur border-b border-white/5 h-14 flex items-center px-4 gap-3">
          <button onClick={() => setSidebarOpen(true)} className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
            <Menu className="h-5 w-5" />
          </button>
          <div className="w-6 h-6 rounded-md bg-white flex items-center justify-center overflow-hidden">
            <img src="/logo.png" alt="" className="object-contain w-10" />
          </div>
          <span className="font-bold text-sm">Whaibot</span>
        </div>
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white rounded-full mix-blend-screen filter blur-[150px] opacity-[0.02] pointer-events-none" />
        <div className="p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
    {/* ── Plantillas Bot Selector Modal ── */}
    {showPlantillasModal && (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-[#25d366]/10 rounded-xl flex items-center justify-center">
                <FileText className="h-4 w-4 text-[#25d366]" />
              </div>
              <div>
                <h3 className="font-bold text-white text-sm">Plantillas</h3>
                <p className="text-gray-500 text-xs">¿En qué bot quieres gestionar plantillas?</p>
              </div>
            </div>
            <button
              onClick={() => setShowPlantillasModal(false)}
              className="p-1.5 text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {loadingBots ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#25d366]" />
            </div>
          ) : plantillasBots.length === 0 ? (
            <div className="text-center text-gray-500 py-8 text-sm">
              <p>No tienes bots creados aún.</p>
              <button
                onClick={() => { setShowPlantillasModal(false); navigate('/saas'); }}
                className="mt-3 text-[#25d366] hover:underline text-xs"
              >
                Crear mi primer bot →
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {plantillasBots.map(bot => (
                <button
                  key={bot.botId}
                  onClick={() => selectBotForPlantillas(bot.botId)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-black/20 hover:bg-[#25d366]/10 border border-white/5 hover:border-[#25d366]/20 rounded-xl transition-all group"
                >
                  <div className="text-left min-w-0">
                    <div className="text-sm font-medium text-white group-hover:text-[#25d366] transition-colors truncate">{bot.nombre}</div>
                    <div className="text-xs text-gray-600 font-mono truncate">{bot.botId}</div>
                  </div>
                  <FileText className="h-4 w-4 text-gray-600 group-hover:text-[#25d366] shrink-0 transition-colors" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )}
    </>
  );
};

export default Layout;
