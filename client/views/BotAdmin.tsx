import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Activity, MessageSquare, Database, AlertCircle, RefreshCw, Edit2, Trash2 } from 'lucide-react';
import axios from 'axios';

interface BotStats {
  mensajes_recibidos?: number;
  mensajes_enviados_ia?: number;
  mensajes_no_entendidos?: number;
  ultima_interaccion?: string;
  total_mensajes?: number;
  usuarios_unicos?: number;
  ultima_actualizacion?: string;
}

interface RespuestaInfo {
  id: string;
  texto: string;
  activo: boolean;
}

interface MensajeNoEntendido {
  id: string;
  mensaje: string;
  timestamp: Date;
  telefono: string;
  revisado: boolean;
}

interface Session {
  id: string;
  phone: string;
  last_interaction: Date;
  estado: string;
}

interface ApiResponse<T = any> {
  ok: boolean;
  data: T;
  error?: string;
}

type Tab = 'stats' | 'respuestas' | 'conversaciones' | 'no_ent';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'stats',          label: 'Métricas',        icon: Activity },
  { id: 'respuestas',     label: 'Base de Datos',   icon: Database },
  { id: 'conversaciones', label: 'Conversaciones',  icon: MessageSquare },
  { id: 'no_ent',         label: 'No Entendidos',   icon: AlertCircle },
];

const API_URL = import.meta.env.VITE_API_URL || '';

export default function BotAdmin() {
  const { botId } = useParams<{ botId: string }>();
  const botNumber = botId || '';
  const [activeTab, setActiveTab] = useState<Tab>('stats');
  const { user } = useAuth();

  const [loading, setLoading]           = useState(true);
  const [stats, setStats]               = useState<BotStats | null>(null);
  const [respuestas, setRespuestas]     = useState<RespuestaInfo[]>([]);
  const [sessions, setSessions]         = useState<Session[]>([]);
  const [noEntendidos, setNoEntendidos] = useState<MensajeNoEntendido[]>([]);

  const [editingRes, setEditingRes] = useState<RespuestaInfo | null>(null);
  const [resText, setResText]       = useState('');

  // Bot metadata state
  const [botName, setBotName]           = useState<string>('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');

  const loadBotInfo = async () => {
    try {
      const token = await user?.getIdToken();
      const res = await axios.get<ApiResponse<{ nombre: string }>>(`${API_URL}/api/saas/bots/${botNumber}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.data.ok) {
        setBotName(res.data.data.nombre);
        setEditNameValue(res.data.data.nombre);
      }
    } catch (e) {
      console.error("Error loading bot meta:", e);
    }
  };

  useEffect(() => {
    if (!botId || !user) return;
    loadBotInfo();
  }, [botId, user]);

  useEffect(() => {
    if (!botId || !user) return;
    loadData();
  }, [botId, activeTab, user]);

  const getHeaders = async () => {
    const token = await user?.getIdToken();
    return {
      'Authorization': `Bearer ${token}`,
      'x-bot-id': botNumber,
    };
  };

  const saveBotName = async () => {
    if (!editNameValue.trim() || editNameValue.trim() === botName) {
      setIsEditingName(false);
      return;
    }
    try {
      const token = await user?.getIdToken();
      await axios.put<ApiResponse>(`${API_URL}/api/saas/bots/${botNumber}/name`, 
        { nombre: editNameValue.trim() }, 
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      setBotName(editNameValue.trim());
      setIsEditingName(false);
    } catch (e: any) {
      alert("Error actualizando nombre: " + (e.response?.data?.error || e.message));
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const headers = await getHeaders();
      if (activeTab === 'stats') {
        const res = await axios.get<ApiResponse<BotStats>>(`${API_URL}/api/saas/bots/${botNumber}/stats`, { headers });
        if (res.data.ok) setStats(res.data.data);
      } else if (activeTab === 'respuestas') {
        const res = await axios.get<ApiResponse<Record<string, RespuestaInfo>>>(`${API_URL}/api/saas/bots/${botNumber}/respuestas-info`, { headers });
        if (res.data.ok) setRespuestas(Object.values(res.data.data));
      } else if (activeTab === 'conversaciones') {
        const res = await axios.get<ApiResponse<Session[]>>(`${API_URL}/api/saas/bots/${botNumber}/sessions`, { headers });
        if (res.data.ok) setSessions(res.data.data);
      } else if (activeTab === 'no_ent') {
        const res = await axios.get<ApiResponse<MensajeNoEntendido[]>>(`${API_URL}/api/saas/bots/${botNumber}/no-entendidos`, { headers });
        if (res.data.ok) setNoEntendidos(res.data.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const saveRespuesta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resText.trim()) return;
    try {
      const headers = await getHeaders();
      if (editingRes) {
        await axios.put<ApiResponse>(`${API_URL}/api/saas/bots/${botNumber}/respuestas-info/${editingRes.id}`, { texto: resText }, { headers });
      } else {
        const rid = 'res_' + Math.random().toString(36).substring(2, 9);
        await axios.post<ApiResponse>(`${API_URL}/api/saas/bots/${botNumber}/respuestas-info`, { rid, texto: resText, activo: true }, { headers });
      }
      setEditingRes(null);
      setResText('');
      loadData();
    } catch (e: any) {
      alert('Error guardando: ' + (e.response?.data?.error || e.message));
    }
  };

  const deleteRespuesta = async (id: string) => {
    if (!confirm('¿Eliminar esta información?')) return;
    try {
      const headers = await getHeaders();
      await axios.delete<ApiResponse>(`${API_URL}/api/saas/bots/${botNumber}/respuestas-info/${id}`, { headers });
      loadData();
    } catch (e: any) { alert('Error: ' + e.message); }
  };

  const toggleActiva = async (r: RespuestaInfo) => {
    try {
      const headers = await getHeaders();
      await axios.put<ApiResponse>(`${API_URL}/api/saas/bots/${botNumber}/respuestas-info/${r.id}`, { activo: !r.activo }, { headers });
      setRespuestas(respuestas.map(x => x.id === r.id ? { ...x, activo: !x.activo } : x));
    } catch (e: any) { alert('Error: ' + e.message); }
  };

  const markRevisado = async (id: string) => {
    try {
      const headers = await getHeaders();
      await axios.patch<ApiResponse>(`${API_URL}/api/saas/bots/${botNumber}/no-entendidos/${id}/revisado`, {}, { headers });
      setNoEntendidos(noEntendidos.map(n => n.id === id ? { ...n, revisado: true } : n));
    } catch (e: any) { alert('Error: ' + e.message); }
  };

  const deleteNoEntendido = async (id: string) => {
    try {
      const headers = await getHeaders();
      await axios.delete<ApiResponse>(`${API_URL}/api/saas/bots/${botNumber}/no-entendidos/${id}`, { headers });
      setNoEntendidos(noEntendidos.filter(n => n.id !== id));
    } catch (e: any) { alert('Error: ' + e.message); }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-0">

      {/* ── Page Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            {isEditingName ? (
              <input
                autoFocus
                type="text"
                value={editNameValue}
                onChange={(e) => setEditNameValue(e.target.value)}
                onBlur={saveBotName}
                onKeyDown={(e) => e.key === 'Enter' ? saveBotName() : e.key === 'Escape' && setIsEditingName(false)}
                className="text-2xl font-bold bg-transparent border-b border-[#25d366] text-white focus:outline-none px-1 py-0 min-w-[250px]"
              />
            ) : (
              <>
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                  {botName || botNumber}
                </h1>
                <button 
                  onClick={() => setIsEditingName(true)} 
                  className="text-gray-500 hover:text-white transition-colors p-1"
                  title="Renombrar bot"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
          <p className="text-gray-500 text-sm mt-0.5 font-mono">{botNumber} • Panel de administración</p>
        </div>
        <button
          onClick={() => { loadBotInfo(); loadData(); }}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 px-4 py-2 rounded-xl transition-all"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {/* ── Horizontal Tab Bar ───────────────────────────────────────── */}
      <div className="flex gap-1 bg-[#12121a] border border-white/5 rounded-2xl p-1.5 mb-6">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 flex-1 justify-center px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === id
                ? 'bg-[#25d366]/10 text-[#25d366] shadow-sm'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Content ──────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-24">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#25d366]" />
        </div>
      ) : (
        <div>
          {/* MÉTRICAS */}
          {activeTab === 'stats' && (
            stats ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Total Mensajes"      value={stats.total_mensajes ?? stats.mensajes_recibidos ?? 0} />
                <StatCard label="Usuarios Únicos"     value={stats.usuarios_unicos ?? 0} />
                <StatCard label="No Entendidos"       value={stats.mensajes_no_entendidos ?? noEntendidos.length} accent="red" />
                <StatCard label="Última Actividad"    value={(stats.ultima_actualizacion || stats.ultima_interaccion) ? new Date(stats.ultima_actualizacion || stats.ultima_interaccion!).toLocaleString() : 'N/A'} isText />
              </div>
            ) : (
              <Empty icon={Activity} text="No hay estadísticas disponibles aún." />
            )
          )}

          {/* BASE DE DATOS */}
          {activeTab === 'respuestas' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Lista */}
              <div className="lg:col-span-2 space-y-3">
                {respuestas.length === 0 && <Empty icon={Database} text="No hay datos en la base de conocimientos." />}
                {respuestas.map(r => (
                  <div key={r.id} className="bg-[#12121a] border border-white/5 rounded-xl p-4 flex items-start gap-4 hover:border-white/10 transition-all">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-xs font-mono text-gray-500">{r.id}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${r.activo ? 'bg-[#25d366]/10 text-[#25d366] border-[#25d366]/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                          {r.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{r.texto}</p>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button onClick={() => { setEditingRes(r); setResText(r.texto); }} className="p-2 text-gray-500 hover:text-indigo-400 hover:bg-indigo-400/10 rounded-lg transition-colors" title="Editar"><Edit2 className="h-4 w-4" /></button>
                      <button onClick={() => toggleActiva(r)} className="p-2 text-gray-500 hover:text-yellow-400 hover:bg-yellow-400/10 rounded-lg transition-colors" title="Toggle activo"><Activity className="h-4 w-4" /></button>
                      <button onClick={() => deleteRespuesta(r.id)} className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors" title="Eliminar"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Editor */}
              <div className="bg-[#12121a] border border-white/5 rounded-2xl p-6 h-fit sticky top-6">
                <h3 className="font-bold text-white mb-4">{editingRes ? 'Editar Información' : 'Nueva Información'}</h3>
                <form onSubmit={saveRespuesta} className="space-y-4">
                  {editingRes && <div className="text-xs text-gray-500 font-mono">{editingRes.id}</div>}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Contenido (Texto con el que la IA se entrenará)</label>
                    <textarea
                      value={resText}
                      onChange={e => setResText(e.target.value)}
                      className="w-full h-40 bg-black/30 border border-white/5 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-[#25d366] focus:ring-1 focus:ring-[#25d366] resize-none transition-all"
                      placeholder="Ej: El horario de atención es de 8:00am a 5:00pm, de Lunes a Viernes."
                      required
                    />
                  </div>
                  <div className="flex gap-3">
                    {editingRes && (
                      <button type="button" onClick={() => { setEditingRes(null); setResText(''); }} className="px-4 py-2 border border-white/10 hover:bg-white/5 rounded-xl text-sm font-medium transition-colors">
                        Cancelar
                      </button>
                    )}
                    <button type="submit" className="flex-1 bg-gradient-to-r from-[#25d366] to-[#128c7e] hover:brightness-110 text-black font-bold px-4 py-2 rounded-xl text-sm transition-all">
                      {editingRes ? 'Guardar Cambios' : 'Añadir a la Base'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* CONVERSACIONES */}
          {activeTab === 'conversaciones' && (
            sessions.length === 0
              ? <Empty icon={MessageSquare} text="No hay sesiones activas." />
              : (
                <div className="bg-[#12121a] border border-white/5 rounded-2xl overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-black/20 text-gray-400 text-sm">
                        <th className="p-4 font-medium">Teléfono</th>
                        <th className="p-4 font-medium">Estado</th>
                        <th className="p-4 font-medium">Última interacción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {sessions.map(s => (
                        <tr key={s.id} className="hover:bg-white/5 transition-colors">
                          <td className="p-4 font-mono text-sm text-gray-300">{s.phone}</td>
                          <td className="p-4">
                            <span className="text-xs px-2 py-1 bg-[#25d366]/10 text-[#25d366] border border-[#25d366]/20 rounded-full">{s.estado || 'Activo'}</span>
                          </td>
                          <td className="p-4 text-sm text-gray-400">
                            {s.last_interaction ? new Date(s.last_interaction).toLocaleString() : 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
          )}

          {/* NO ENTENDIDOS */}
          {activeTab === 'no_ent' && (
            noEntendidos.length === 0
              ? <Empty icon={AlertCircle} text="Excelente, no hay mensajes sin entender pendientes." />
              : (
                <div className="space-y-3">
                  {noEntendidos.map(n => (
                    <div key={n.id} className={`bg-[#12121a] border rounded-xl p-5 flex items-center justify-between transition-all ${n.revisado ? 'border-white/5 opacity-50' : 'border-orange-500/30'}`}>
                      <div>
                        <div className="flex items-center gap-3 mb-1.5">
                          <span className="font-mono text-sm text-indigo-400">{n.telefono}</span>
                          <span className="text-xs text-gray-500">{new Date(n.timestamp).toLocaleString()}</span>
                          {n.revisado
                            ? <span className="text-[10px] px-2 py-0.5 bg-[#25d366]/10 text-[#25d366] rounded-full border border-[#25d366]/20">Revisado</span>
                            : <span className="text-[10px] px-2 py-0.5 bg-orange-500/10 text-orange-400 rounded-full border border-orange-500/20">Pendiente</span>
                          }
                        </div>
                        <p className="text-gray-200 text-sm">"{n.mensaje}"</p>
                      </div>
                      <div className="flex items-center gap-2 ml-4 shrink-0">
                        {!n.revisado && (
                          <button onClick={() => markRevisado(n.id)} className="px-3 py-1.5 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500 hover:text-white rounded-lg text-xs font-medium transition-colors">
                            Marcar Revisado
                          </button>
                        )}
                        <button onClick={() => deleteNoEntendido(n.id)} className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
          )}
        </div>
      )}
    </div>
  );
}

/* ── Helper components ─────────────────────────────────────────────────────── */

function StatCard({ label, value, isText = false, accent = 'green' }: {
  label: string;
  value: string | number;
  isText?: boolean;
  accent?: 'green' | 'red';
}) {
  const color = accent === 'red' ? 'text-red-400' : 'text-[#25d366]';
  return (
    <div className="bg-[#12121a] border border-white/5 rounded-2xl p-6 hover:border-white/10 transition-all">
      <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-3">{label}</p>
      <div className={`font-bold ${isText ? 'text-lg text-gray-300' : `text-3xl ${color}`}`}>{value}</div>
    </div>
  );
}

function Empty({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-500">
      <div className="bg-white/5 rounded-full p-5 mb-4">
        <Icon className="h-8 w-8 text-gray-600" />
      </div>
      <p className="text-sm">{text}</p>
    </div>
  );
}
