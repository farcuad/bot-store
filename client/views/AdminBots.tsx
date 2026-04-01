import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Trash2, Play, Square, RotateCcw } from 'lucide-react';

interface Bot {
  botId: string;
  nombre: string;
  status: string;
  ownerUid: string;
  readySince?: number;
  lastError?: string;
}

const API_URL = import.meta.env.VITE_API_URL || '';

export default function AdminBots() {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAdmin) {
      navigate('/saas');
      return;
    }
    loadBots();
  }, [isAdmin]);

  const getHeaders = async () => {
    const token = await user?.getIdToken();
    return { Authorization: `Bearer ${token}` };
  };

  const loadBots = async () => {
    try {
      setLoading(true);
      setError('');
      const headers = await getHeaders();
      // Admin receives ALL bots (backend returns all when req.isAdmin === true)
      const res = await fetch(`${API_URL}/api/saas/bots`, { headers });
      const data = await res.json();
      if (data.ok) {
        setBots(data.data);
      } else {
        setError(data.error || 'Error cargando bots');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const botAction = async (botId: string, action: 'start' | 'stop' | 'restart') => {
    try {
      const headers = await getHeaders();
      await fetch(`${API_URL}/api/saas/bots/${botId}/${action}`, {
        method: 'POST',
        headers,
      });
      loadBots();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const deleteBot = async (botId: string) => {
    if (!confirm(`¿Eliminar el bot "${botId}"? Esta acción no se puede deshacer.`)) return;
    try {
      const headers = await getHeaders();
      await fetch(`${API_URL}/api/saas/bots/${botId}`, { method: 'DELETE', headers });
      loadBots();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      ready: 'bg-green-500/10 text-green-400 border-green-500/20',
      qr: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      error: 'bg-red-500/10 text-red-400 border-red-500/20',
      disconnected: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
      idle: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
    };
    return (
      <span className={`px-2 py-1 text-xs font-bold rounded-full border ${map[status] ?? map.idle}`}>
        {status.toUpperCase()}
      </span>
    );
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate('/saas')} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
          <ArrowLeft className="h-5 w-5 text-gray-400" />
        </button>
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-linear-to-r from-white to-gray-400">
            ⚙️ Configurar Bots
          </h1>
          <p className="text-gray-400 text-sm mt-1">Todos los bots del sistema — vista de administrador</p>
        </div>
        <button
          onClick={loadBots}
          className="ml-auto flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="text-sm">Actualizar</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl mb-6">
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-gray-500">
          <div className="animate-spin text-4xl mb-4">⚕️</div>
          <p>Cargando bots...</p>
        </div>
      ) : (
        <div className="bg-[#12121a] border border-white/5 rounded-2xl overflow-hidden shadow-xl">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-black/20 text-gray-400 text-sm border-b border-white/5">
                <th className="p-4 font-medium">Bot</th>
                <th className="p-4 font-medium">Owner UID</th>
                <th className="p-4 font-medium">Estado</th>
                <th className="p-4 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {bots.map((bot) => (
                <tr key={bot.botId} className="hover:bg-white/[0.02] transition-colors">
                  <td className="p-4">
                    <div className="font-medium text-white">{bot.nombre}</div>
                    <code className="text-xs text-gray-500 bg-black/40 px-2 py-0.5 rounded">{bot.botId}</code>
                  </td>
                  <td className="p-4">
                    <code className="text-xs text-gray-500 font-mono">{bot.ownerUid}</code>
                  </td>
                  <td className="p-4">{statusBadge(bot.status)}</td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-2">
                      {(bot.status === 'idle' || bot.status === 'disconnected' || bot.status === 'error') && (
                        <button
                          onClick={() => botAction(bot.botId, 'start')}
                          title="Iniciar"
                          className="p-2 bg-green-500/10 text-green-400 hover:bg-green-500/20 rounded-lg transition-colors"
                        >
                          <Play className="h-4 w-4" />
                        </button>
                      )}
                      {bot.status === 'ready' && (
                        <button
                          onClick={() => botAction(bot.botId, 'stop')}
                          title="Detener"
                          className="p-2 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 rounded-lg transition-colors"
                        >
                          <Square className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => botAction(bot.botId, 'restart')}
                        title="Reiniciar"
                        className="p-2 bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => deleteBot(bot.botId)}
                        title="Eliminar"
                        className="p-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {bots.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-10 text-center text-gray-400">
                    No hay bots registrados en el sistema.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
