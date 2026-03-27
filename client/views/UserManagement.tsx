import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, Check, X, Users as UsersIcon, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';

interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  plan: string;
  status: string;
  role: string;
  maxBots: number;
  createdAt: string;
}

export default function UserManagement() {
  const { user, dbUser } = useAuth();
  const role = dbUser?.role || 'user';
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

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
      alert('Error cargando usuarios: ' + (e.response?.data?.error || e.message));
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
      alert('Error: ' + (e.response?.data?.error || e.message));
    }
  };

  const rejectUser = async (uid: string) => {
    try {
      const headers = await getHeaders();
      await axios.post(`${API_URL}/api/admin/users/${uid}/reject`, {}, { headers });
      setUsers(users.map(u => u.uid === uid ? { ...u, status: 'rejected' } : u));
    } catch (e: any) {
      alert('Error: ' + (e.response?.data?.error || e.message));
    }
  };

  const updateMaxBots = async (uid: string, maxBots: number) => {
    if (isNaN(maxBots) || maxBots < 0) return;
    try {
      const headers = await getHeaders();
      await axios.patch(`${API_URL}/api/admin/users/${uid}/maxBots`, { maxBots }, { headers });
      setUsers(users.map(u => u.uid === uid ? { ...u, maxBots } : u));
    } catch (e: any) {
      alert('Error: ' + (e.response?.data?.error || e.message));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center space-x-4">
          <button onClick={() => navigate('/saas')} className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
            <ArrowLeft className="h-6 w-6 text-gray-400" />
          </button>
          <div className="p-3 bg-indigo-500/20 text-indigo-400 rounded-lg">
            <Shield className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
              Administración Global
            </h1>
            <p className="text-gray-400 mt-1">Gestión de roles y aprobación de cuentas</p>
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-xl">
          <div className="p-6 border-b border-gray-800 flex items-center justify-between">
            <h2 className="text-xl font-bold flex items-center">
              <UsersIcon className="h-5 w-5 mr-2 text-gray-400" />
              Usuarios Registrados
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-950/50 text-gray-400 text-sm">
                  <th className="p-4 font-medium">Usuario</th>
                  <th className="p-4 font-medium">Email</th>
                  <th className="p-4 font-medium">Plan</th>
                  <th className="p-4 font-medium">Rol</th>
                  <th className="p-4 font-medium">Bots max.</th>
                  <th className="p-4 font-medium">Estado</th>
                  <th className="p-4 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/50">
                {users.map(u => (
                  <tr key={u.uid} className="hover:bg-gray-800/30 transition-colors">
                    <td className="p-4">
                      <div className="font-medium">{u.displayName || 'Sin Nombre'}</div>
                      <div className="text-xs text-gray-500 font-mono mt-0.5">{u.uid}</div>
                    </td>
                    <td className="p-4 text-gray-300">{u.email}</td>
                    <td className="p-4">
                      <span className="bg-blue-500/10 text-blue-400 px-2 py-1 rounded text-xs font-medium border border-blue-500/20">
                        {u.plan?.toUpperCase() || 'FREE'}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium border ${u.role === 'admin' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                        {u.role?.toUpperCase() || 'USER'}
                      </span>
                    </td>
                    {/* Editable maxBots */}
                    <td className="p-4">
                      <input
                        type="number"
                        min={0}
                        defaultValue={u.maxBots ?? 1}
                        onBlur={e => updateMaxBots(u.uid, parseInt(e.target.value, 10))}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        className="w-16 bg-gray-800 border border-gray-700 text-white text-sm text-center rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 flex w-fit items-center space-x-1 rounded-full text-xs font-medium border ${
                        u.status === 'approved' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 
                        u.status === 'rejected' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 
                        'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                      }`}>
                        <div className={`h-1.5 w-1.5 rounded-full ${u.status === 'approved' ? 'bg-green-400' : u.status === 'rejected' ? 'bg-red-400' : 'bg-yellow-400'}`} />
                        <span>{u.status === 'pending' ? 'Pendiente' : u.status === 'approved' ? 'Aprobado' : 'Rechazado'}</span>
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      {u.status === 'pending' && (
                        <div className="flex justify-end space-x-2">
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
                      {u.status !== 'pending' && (
                        <span className="text-gray-500 text-sm">Gestionado</span>
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={7} className="p-8 text-center text-gray-400">No hay usuarios registrados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
