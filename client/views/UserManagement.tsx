import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Check, X, Users as UsersIcon, ArrowLeft } from 'lucide-react';

import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useGlassAlert } from 'glass-alert-animation';

const API_URL = import.meta.env.VITE_API_URL || '';

interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  // Existing plan field kept for backward compatibility
  plan: string;
  status: string;
  role: string;
  maxBots: number;
  createdAt: string;
  // New subscription object containing optional fields for incremental updates
  subscription?: {
    planId?: string;
    status?: string;
    expiresAt?: number;
  };
}

export default function UserManagement() {
  const { user, dbUser } = useAuth();
  const role = dbUser?.role || 'user';
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { fire } = useGlassAlert();

  useEffect(() => {
    if (role !== 'admin') {
      navigate('/saas');
      return;
    }
    loadUsers();
  }, [role, navigate]);

  const getHeaders = async () => {
    const token = await user?.getIdToken();
    return {
      'Authorization': `Bearer ${token}`,
    };
  };

  // Helper to update subscription plan
  const updatePlan = async (uid: string, planId: string) => {
    try {
      const headers = await getHeaders();
      await axios.patch(`${API_URL}/api/admin/users/${uid}/plan`, { planId }, { headers });
      // Optimistically update UI
      setUsers(prev =>
        prev.map(u => (u.uid === uid ? { ...u, subscription: { ...(u.subscription || {}), planId } } : u))
      );
    } catch (e: any) {
      fire({ title: 'Error', text: e.response?.data?.error || e.message, icon: 'error' });
    }
  };

  // Helper to update subscription expiration (days from now)
  const updateExpiration = async (uid: string, days: number) => {
    if (isNaN(days) || days < 0) return;
    const expiresAt = Math.floor(Date.now() / 1000) + days * 24 * 60 * 60;
    try {
      const headers = await getHeaders();
      await axios.patch(`${API_URL}/api/admin/users/${uid}/plan`, { expiresAt }, { headers });
      setUsers(prev =>
        prev.map(u =>
          u.uid === uid
            ? {
                ...u,
                subscription: { ...(u.subscription || {}), expiresAt },
              }
            : u
        )
      );
    } catch (e: any) {
      fire({ title: 'Error', text: e.response?.data?.error || e.message, icon: 'error' });
    }
  };

  const loadUsers = async () => {
    try {
      setLoading(true);
      const headers = await getHeaders();
      const res = await axios.get(`${API_URL}/api/admin/users`, { headers });
      if (res.data.ok) {
        setUsers(res.data.users);
      }
    } catch (e: any) {
      console.error(e);
      fire({
        title: 'Error',
        text: 'Error cargando usuarios: ' + (e.response?.data?.error || e.message),
        icon: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  const approveUser = async (uid: string) => {
    try {
      const headers = await getHeaders();
      await axios.post(`${API_URL}/api/admin/users/${uid}/approve`, {}, { headers });
      setUsers(users.map(u => u.uid === uid ? { ...u, status: 'approved' } : u));
    } catch (e: any) {
      fire({
        title: 'Error',
        text: (e.response?.data?.error || e.message),
        icon: 'error'
      });
    }
  };

  const rejectUser = async (uid: string) => {
    try {
      const headers = await getHeaders();
      await axios.post(`${API_URL}/api/admin/users/${uid}/reject`, {}, { headers });
      setUsers(users.map(u => u.uid === uid ? { ...u, status: 'rejected' } : u));
    } catch (e: any) {
      fire({
        title: 'Error',
        text: (e.response?.data?.error || e.message),
        icon: 'error'
      });
    }
  };

  const updateMaxBots = async (uid: string, maxBots: number) => {
    if (isNaN(maxBots) || maxBots < 0) return;
    try {
      const headers = await getHeaders();
      await axios.patch(`${API_URL}/api/admin/users/${uid}/maxBots`, { maxBots }, { headers });
      setUsers(users.map(u => u.uid === uid ? { ...u, maxBots } : u));
    } catch (e: any) {
      fire({
        title: 'Error',
        text: (e.response?.data?.error || e.message),
        icon: 'error'
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <button onClick={() => navigate('/saas')} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
          <ArrowLeft className="h-5 w-5 text-gray-400" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-linear-to-r from-indigo-400 to-purple-400">
            Gestión de Usuarios
          </h1>
          <p className="text-gray-400 text-sm mt-1">Roles y aprobación de cuentas</p>
        </div>
      </div>

      <div className="bg-[#12121a] border border-white/5 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 sm:p-6 border-b border-white/5 flex items-center gap-3">
          <UsersIcon className="h-5 w-5 text-gray-400" />
          <h2 className="text-lg font-bold">Usuarios Registrados</h2>
          <span className="ml-auto text-xs text-gray-500">{users.length} usuario(s)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[700px]">
            <thead>
              <tr className="bg-black/20 text-gray-400 text-sm border-b border-white/5">
                <th className="p-4 font-medium">Usuario</th>
                <th className="p-4 font-medium">Email</th>
                <th className="p-4 font-medium">Plan</th>
                <th className="p-4 font-medium">Rol</th>
                <th className="p-4 font-medium">Bots máx.</th>
                <th className="p-4 font-medium">Estado</th>
                <th className="p-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {users.map(u => (
                <tr key={u.uid} className="hover:bg-white/2 transition-colors">
                  <td className="p-4">
                    <div className="font-medium text-white">{u.displayName || 'Sin Nombre'}</div>
                    <div className="text-xs text-gray-500 font-mono mt-0.5 truncate max-w-[150px]">{u.uid}</div>
                  </td>
                  <td className="p-4 text-gray-300 text-sm">{u.email}</td>
                  <td className="p-4">
                    {/* Show subscription plan if available, fallback to legacy plan field */}
                    <span className="bg-blue-500/10 text-blue-400 px-2 py-1 rounded text-xs font-medium border border-blue-500/20">
                      {u.subscription?.planId?.toUpperCase() || u.plan?.toUpperCase() || 'FREE'}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium border ${u.role === 'admin' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                      {u.role?.toUpperCase() || 'USER'}
                    </span>
                  </td>
                  <td className="p-4">
                    <input
                      type="number"
                      min={0}
                      defaultValue={u.maxBots ?? 1}
                      onBlur={e => updateMaxBots(u.uid, parseInt(e.target.value, 10))}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      className="w-16 bg-black/40 border border-white/10 text-white text-sm text-center rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 flex w-fit items-center gap-1.5 rounded-full text-xs font-medium border ${
                      u.status === 'approved' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                      u.status === 'rejected' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                      'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                    }`}>
                      <div className={`h-1.5 w-1.5 rounded-full ${u.status === 'approved' ? 'bg-green-400' : u.status === 'rejected' ? 'bg-red-400' : 'bg-yellow-400'}`} />
                      {u.status === 'pending' ? 'Pendiente' : u.status === 'approved' ? 'Aprobado' : 'Rechazado'}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    {u.status === 'pending' && (
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => approveUser(u.uid)}
                          className="p-1.5 bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-white rounded-lg transition-colors"
                          title="Aprobar"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => rejectUser(u.uid)}
                          className="p-1.5 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-lg transition-colors"
                          title="Rechazar"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                    {/* Admin plan management – visible only for admins */}
                    {role === 'admin' && u.subscription && (
                      <div className="flex flex-col gap-1 mt-2">
                        {/* Plan selector */}
                        <select
                          value={u.subscription?.planId || ''}
                          onChange={e => updatePlan(u.uid, e.target.value)}
                          className="text-sm bg-black/30 text-white rounded px-2 py-1"
                        >
                          <option value="basic">Basic</option>
                          <option value="pro">Pro</option>
                          <option value="premium">Premium</option>
                        </select>
                        {/* Days remaining input */}
                        <input
                          type="number"
                          min={0}
                          defaultValue={
                            Math.max(
                              0,
                              Math.ceil(((u.subscription?.expiresAt ?? 0) * 1000 - Date.now()) / (1000 * 60 * 60 * 24))
                            )
                          }
                          onBlur={e => updateExpiration(u.uid, parseInt(e.target.value, 10))}
                          className="w-16 bg-black/40 border border-white/10 text-white text-sm text-center rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <span className="text-xs text-gray-400">días</span>
                      </div>
                    )}
                    {u.status !== 'pending' && !u.subscription && (
                      <span className="text-gray-600 text-sm">Gestionado</span>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-gray-500">No hay usuarios registrados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
