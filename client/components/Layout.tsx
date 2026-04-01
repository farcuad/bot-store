import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Layout: React.FC = () => {
  const { user, status, logout, isAdmin, dbUser } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (status === 'pending' || status === 'rejected') {
    return (
      <div className="min-h-screen bg-[#0a0a0f] text-gray-200 flex items-center justify-center font-inter">
        <div className="bg-[#12121a] p-8 border border-white/10 rounded-2xl max-w-md w-full text-center">
          <h2 className="text-xl font-bold mb-4">Acceso Restringido</h2>
          <p className="text-gray-400 mb-6">Debes tener cuenta aprobada para acceder al panel.</p>
          <button
            onClick={handleLogout}
            className="w-full px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
          >
            Cerrar Sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flexh-screen bg-[#0a0a0f] text-gray-200 font-inter overflow-hidden flex">
      {/* Sidebar */}
      <aside className="w-64 bg-[#12121a] border-r border-white/5 flex flex-col h-screen shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-white/5">
          <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center overflow-hidden shadow-lg mr-3">
            <img src="/whaibot.png" alt="Whaibot SAAS Logo" className="object-contain" style={{ width: "150px" }} />
          </div>
          <span className="font-bold text-lg tracking-tight"> SAAS</span>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <NavLink
            to="/saas"
            end
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive ? 'bg-[#25d366]/10 text-[#25d366] font-medium' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`
            }
          >
            📊 <span className="text-sm">Mis Bots</span>
          </NavLink>

          {isAdmin && (
            <>
              <div className="pt-4 pb-2 px-3 text-[10px] font-bold text-gray-600 uppercase tracking-widest">Admin Global</div>
              <NavLink
                to="/saas/admin"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive ? 'bg-[#7c5ef5]/10 text-[#7c5ef5] font-medium' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`
                }
              >
                ⚙️ <span className="text-sm">Configurar Bots</span>
              </NavLink>
              <NavLink
                to="/saas/users"
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

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 h-screen overflow-y-auto bg-[#0a0a0f] relative">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white rounded-full mix-blend-screen filter blur-[150px] opacity-[0.02] pointer-events-none"></div>
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
