import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Menu, X } from 'lucide-react';

const Layout: React.FC = () => {
  const { user, status, logout, isAdmin, dbUser } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
            📊 <span className="text-sm">Mis Bots</span>
          </NavLink>

          {isAdmin && (
            <>
              <div className="pt-4 pb-2 px-3 text-[10px] font-bold text-gray-600 uppercase tracking-widest">Admin Global</div>
              <NavLink to="/saas/admin" onClick={closeNav}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive ? 'bg-[#7c5ef5]/10 text-[#7c5ef5] font-medium' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`
                }
              >
                ⚙️ <span className="text-sm">Configurar Bots</span>
              </NavLink>
              <NavLink to="/saas/users" onClick={closeNav}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive ? 'bg-[#7c5ef5]/10 text-[#7c5ef5] font-medium' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`
                }
              >
                👥 <span className="text-sm">Gestión de Usuarios</span>
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
  );
};

export default Layout;
