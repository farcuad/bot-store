import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Activity, MessageSquare, Database, AlertCircle, RefreshCw, Edit2, Trash2, Download, Upload, RotateCcw, ScrollText } from 'lucide-react';
import axios from 'axios';
import { useGlassAlert } from 'glass-alert-animation';

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
  contactName?: string;
  last_interaction: Date;
  estado: string;
}

interface ApiResponse<T = any> {
  ok: boolean;
  data: T;
  error?: string;
}

interface LogData {
  lines: string[];
  size: number;
}

type Tab = 'stats' | 'respuestas' | 'conversaciones' | 'no_ent' | 'logs';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'stats',          label: 'Métricas',        icon: Activity },
  { id: 'respuestas',     label: 'Base de Datos',   icon: Database },
  { id: 'conversaciones', label: 'Conversaciones',  icon: MessageSquare },
  { id: 'no_ent',         label: 'No Entendidos',   icon: AlertCircle },
  { id: 'logs',           label: 'Logs',            icon: ScrollText },
];

const API_URL = import.meta.env.VITE_API_URL || '';

export default function BotAdmin() {
  const { botId } = useParams<{ botId: string }>();
  const botNumber = botId || '';
  const [activeTab, setActiveTab] = useState<Tab>('stats');
  const { user, isAdmin } = useAuth();
  const { fire } = useGlassAlert();

  const [loading, setLoading]           = useState(true);
  const [stats, setStats]               = useState<BotStats | null>(null);
  const [respuestas, setRespuestas]     = useState<RespuestaInfo[]>([]);
  const [sessions, setSessions]         = useState<Session[]>([]);
  const [noEntendidos, setNoEntendidos] = useState<MensajeNoEntendido[]>([]);

  const [editingRes, setEditingRes] = useState<RespuestaInfo | null>(null);
  const [resText, setResText]       = useState('');

  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editSessionName, setEditSessionName] = useState('');

  const importInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  // Logs state
  const [logData, setLogData] = useState<LogData | null>(null);
  const [clearingLogs, setClearingLogs] = useState(false);
  const [logPhoneFilter, setLogPhoneFilter] = useState<string | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

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
      fire({
        title: 'Error',
        text: "Error actualizando nombre: " + (e.response?.data?.error || e.message),
        icon: 'error'
      });
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

  // ── Logs ──────────────────────────────────────────────────────────────────

  const loadLogs = useCallback(async () => {
    if (!botId || !user) return;
    try {
      const headers = await getHeaders();
      const res = await axios.get<ApiResponse<LogData>>(`${API_URL}/api/saas/bots/${botNumber}/logs`, { headers });
      if (res.data.ok) {
        setLogData(res.data.data);
        setTimeout(() => {
          if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
          }
        }, 50);
      }
    } catch (e) {
      console.error('Error loading logs:', e);
    }
  }, [botId, user, botNumber]);

  useEffect(() => {
    if (activeTab !== 'logs') return;
    loadLogs();
    const interval = setInterval(loadLogs, 10000);
    return () => clearInterval(interval);
  }, [activeTab, loadLogs]);

  const handleClearLogs = async () => {
    const result = await fire({
      title: '¿Limpiar el log del bot?',
      text: 'Se eliminarán todas las entradas del archivo de log.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, limpiar',
      cancelButtonText: 'Cancelar'
    });
    if (!result.isConfirmed) return;

    setClearingLogs(true);
    try {
      const token = await user?.getIdToken();
      await axios.delete(`${API_URL}/api/saas/bots/${botNumber}/logs`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      setLogData({ lines: [], size: 0 });
    } catch (e: any) {
      fire({
        title: 'Error',
        text: 'Error limpiando logs: ' + (e.response?.data?.error || e.message),
        icon: 'error'
      });
    } finally {
      setClearingLogs(false);
    }
  };

  function formatLogLine(line: string): React.ReactNode {
    if (line.includes('📩 MENSAJE de')) {
      return <span className="text-emerald-400">{line}</span>;
    }
    if (line.includes('❌') || line.includes('ERROR')) {
      return <span className="text-red-400">{line}</span>;
    }
    if (line.includes('👤') || line.includes('humana') || line.includes('Humano')) {
      return <span className="text-yellow-400">{line}</span>;
    }
    if (line.includes('✅') || line.includes('listo') || line.includes('🚀')) {
      return <span className="text-blue-400">{line}</span>;
    }
    return <span className="text-gray-400">{line}</span>;
  }

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
      fire({
        title: 'Error',
        text: 'Error guardando: ' + (e.response?.data?.error || e.message),
        icon: 'error'
      });
    }
  };

  const deleteRespuesta = async (id: string) => {
    const result = await fire({
      title: '¿Eliminar esta información?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });
    if (!result.isConfirmed) return;
    try {
      const headers = await getHeaders();
      await axios.delete<ApiResponse>(`${API_URL}/api/saas/bots/${botNumber}/respuestas-info/${id}`, { headers });
      loadData();
    } catch (e: any) { 
      fire({
        title: 'Error',
        text: e.message,
        icon: 'error'
      });
    }
  };

  const toggleActiva = async (r: RespuestaInfo) => {
    try {
      const headers = await getHeaders();
      await axios.put<ApiResponse>(`${API_URL}/api/saas/bots/${botNumber}/respuestas-info/${r.id}`, { activo: !r.activo }, { headers });
      setRespuestas(respuestas.map(x => x.id === r.id ? { ...x, activo: !x.activo } : x));
    } catch (e: any) { 
      fire({
        title: 'Error',
        text: e.message,
        icon: 'error'
      });
    }
  };

  const markRevisado = async (id: string) => {
    try {
      const headers = await getHeaders();
      await axios.patch<ApiResponse>(`${API_URL}/api/saas/bots/${botNumber}/no-entendidos/${id}/revisado`, {}, { headers });
      setNoEntendidos(noEntendidos.map(n => n.id === id ? { ...n, revisado: true } : n));
    } catch (e: any) { 
      fire({
        title: 'Error',
        text: e.message,
        icon: 'error'
      });
    }
  };

  const deleteNoEntendido = async (id: string) => {
    try {
      const headers = await getHeaders();
      await axios.delete<ApiResponse>(`${API_URL}/api/saas/bots/${botNumber}/no-entendidos/${id}`, { headers });
      setNoEntendidos(noEntendidos.filter(n => n.id !== id));
    } catch (e: any) { 
      fire({
        title: 'Error',
        text: e.message,
        icon: 'error'
      });
    }
  };

  const updateSessionStatus = async (sessionId: string, newStatus: string) => {
    try {
      const headers = await getHeaders();
      await axios.patch<ApiResponse>(`${API_URL}/api/saas/bots/${botNumber}/sessions/${encodeURIComponent(sessionId)}`, { estado: newStatus }, { headers });
      setSessions(sessions.map(s => s.id === sessionId ? { ...s, estado: newStatus } : s));
    } catch (e: any) { 
      fire({
        title: 'Error',
        text: e.message,
        icon: 'error'
      });
    }
  };

  const saveSessionName = async (sessionId: string) => {
    const trimmed = editSessionName.trim();
    try {
      const headers = await getHeaders();
      await axios.patch<ApiResponse>(`${API_URL}/api/saas/bots/${botNumber}/sessions/${encodeURIComponent(sessionId)}`, { contactName: trimmed }, { headers });
      setSessions(sessions.map(s => s.id === sessionId ? { ...s, contactName: trimmed || undefined } : s));
      setEditingSessionId(null);
    } catch (e: any) { 
      fire({
        title: 'Error',
        text: e.message,
        icon: 'error'
      });
    }
  };

  const deleteSession = async (sessionId: string, phone: string) => {
    const result = await fire({
      title: `¿Eliminar el registro de +${phone}?`,
      text: 'Se eliminará su sesión. Cuando vuelva a escribir, el bot lo registrará como nuevo contacto.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });
    if (!result.isConfirmed) return;

    try {
      const headers = await getHeaders();
      await axios.delete<ApiResponse>(`${API_URL}/api/saas/bots/${botNumber}/sessions/${encodeURIComponent(sessionId)}`, { headers });
      setSessions(sessions.filter(s => s.id !== sessionId));
    } catch (e: any) { 
      fire({
        title: 'Error',
        text: 'Error eliminando sesión: ' + (e.response?.data?.error || e.message),
        icon: 'error'
      });
    }
  };

  const handleViewMessages = (phone: string) => {
    setLogPhoneFilter(phone);
    setActiveTab('logs');
  };

  const handleClearSession = async () => {
    const result = await fire({
      title: '¿Limpiar la sesión WhatsApp del bot?',
      text: 'Se detendrá el bot y se borrará la sesión de Chrome. Tendrás que escanear el QR nuevamente.\n\nLa configuración, base de datos y sesiones de chat se conservan.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, limpiar sesión',
      cancelButtonText: 'Cancelar'
    });
    if (!result.isConfirmed) return;

    try {
      const token = await user?.getIdToken();
      await axios.post<ApiResponse>(`${API_URL}/api/saas/bots/${botNumber}/clear-session`, {}, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fire({
        title: 'Éxito',
        text: '✅ Sesión limpiada. Reinicia el bot para ver el QR nuevo.',
        icon: 'success'
      });
    } catch (e: any) { 
      fire({
        title: 'Error',
        text: 'Error: ' + (e.response?.data?.error || e.message),
        icon: 'error'
      });
    }
  };

  const handleExport = async () => {
    try {
      const token = await user?.getIdToken();
      const res = await axios.get(`${API_URL}/api/saas/bots/${botNumber}/export`, {
        headers: { 'Authorization': `Bearer ${token}` },
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${botNumber}-export.json`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e: any) { 
      fire({
        title: 'Error',
        text: 'Error exportando: ' + e.message,
        icon: 'error'
      });
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const result = await fire({
      title: `¿Importar configuración desde "${file.name}"?`,
      text: 'Se fusionarán las entradas de la base de conocimientos con las actuales.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, importar',
      cancelButtonText: 'Cancelar'
    });

    if (!result.isConfirmed) {
      e.target.value = '';
      return;
    }

    setImporting(true);
    try {
      const text = await file.text();
      const bundle = JSON.parse(text);
      const token = await user?.getIdToken();
      const res = await axios.post<ApiResponse>(`${API_URL}/api/saas/bots/${botNumber}/import`, bundle, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      if (res.data.ok) {
        fire({
          title: 'Éxito',
          text: `✅ Importación exitosa. ${res.data.data.kbEntries} entrada(s) cargadas.`,
          icon: 'success'
        });
        loadData();
      }
    } catch (e: any) { 
      fire({
        title: 'Error',
        text: 'Error importando: ' + e.message,
        icon: 'error'
      });
    }
    finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-0">

      {/* ── Page Header ──────────────────────────────────────── */}
      <div className="flex flex-col gap-3 mb-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              {isEditingName ? (
                <input
                  autoFocus
                  type="text"
                  value={editNameValue}
                  onChange={(e) => setEditNameValue(e.target.value)}
                  onBlur={saveBotName}
                  onKeyDown={(e) => e.key === 'Enter' ? saveBotName() : e.key === 'Escape' && setIsEditingName(false)}
                  className="text-xl sm:text-2xl font-bold bg-transparent border-b border-[#25d366] text-white focus:outline-none px-1 py-0 min-w-[200px]"
                />
              ) : (
                <>
                  <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
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
            <p className="text-gray-500 text-xs sm:text-sm mt-0.5 font-mono">{botNumber} • Panel de administración</p>
          </div>
        </div>
        {/* Action buttons: scrollable row on mobile */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
          <button
            onClick={() => { loadBotInfo(); loadData(); }}
            className="shrink-0 flex items-center gap-2 text-sm text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 px-3 py-2 rounded-xl transition-all"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </button>
          <button
            onClick={handleClearSession}
            className="shrink-0 flex items-center gap-2 text-sm text-orange-400 hover:text-white bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 px-3 py-2 rounded-xl transition-all"
            title="Elimina la sesión de Chrome para re-escanear el QR sin borrar el bot"
          >
            <RotateCcw className="h-4 w-4" />
            <span className="whitespace-nowrap">Limpiar Sesión</span>
          </button>
          <button
            onClick={handleExport}
            className="shrink-0 flex items-center gap-2 text-sm text-indigo-400 hover:text-white bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 px-3 py-2 rounded-xl transition-all"
            title="Descarga la configuración del bot como JSON"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Exportar</span>
          </button>
          <input ref={importInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
          <button
            onClick={() => importInputRef.current?.click()}
            disabled={importing}
            className="shrink-0 flex items-center gap-2 text-sm text-emerald-400 hover:text-white bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 px-3 py-2 rounded-xl transition-all disabled:opacity-50"
            title="Importa configuración desde un JSON exportado"
          >
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">{importing ? 'Importando…' : 'Importar'}</span>
          </button>
        </div>
      </div>

      {/* ── Horizontal Tab Bar ─────────────────────────────── */}
      <div className="flex gap-1 bg-[#12121a] border border-white/5 rounded-2xl p-1.5 mb-6 overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 shrink-0 sm:flex-1 justify-center px-3 sm:px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
              activeTab === id
                ? 'bg-[#25d366]/10 text-[#25d366] shadow-sm'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
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
                    <button type="submit" className="flex-1 bg-linear-to-r from-[#25d366] to-[#128c7e] hover:brightness-110 text-black font-bold px-4 py-2 rounded-xl text-sm transition-all">
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
                  <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[500px]">
                    <thead>
                      <tr className="bg-black/20 text-gray-400 text-sm">
                        <th className="p-4 font-medium">Teléfono</th>
                        <th className="p-4 font-medium">Estado</th>
                        <th className="p-4 font-medium">Última interacción</th>
                        <th className="p-4 font-medium text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {sessions.map(s => (
                        <tr key={s.id} className="hover:bg-white/5 transition-colors">
                          <td className="p-4 font-mono text-sm text-gray-300">
                            {editingSessionId === s.id ? (
                              <div className="flex flex-col gap-1">
                                <input
                                  autoFocus
                                  value={editSessionName}
                                  onChange={e => setEditSessionName(e.target.value)}
                                  onBlur={() => saveSessionName(s.id)}
                                  onKeyDown={e => e.key === 'Enter' ? saveSessionName(s.id) : e.key === 'Escape' && setEditingSessionId(null)}
                                  className="text-gray-200 font-sans font-medium bg-black/50 border border-[#25d366]/50 rounded px-2 py-0.5 focus:outline-none w-full max-w-[200px]"
                                  placeholder="Alias de contacto"
                                />
                                <span className="text-xs text-gray-500 font-mono">+{s.phone}</span>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-0.5 group">
                                <div className="flex items-center gap-2">
                                  <span className="text-gray-200 font-sans font-medium">{s.contactName || 'Sin Alias'}</span>
                                  <button onClick={() => { setEditingSessionId(s.id); setEditSessionName(s.contactName || ''); }} className="text-gray-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity" title="Editar alias">
                                    <Edit2 className="h-3 w-3" />
                                  </button>
                                </div>
                                <span className="text-xs text-gray-500 font-mono">+{s.phone}</span>
                              </div>
                            )}
                          </td>
                          <td className="p-4">
                            <select
                              value={s.estado || 'bot'}
                              onChange={(e) => updateSessionStatus(s.id, e.target.value)}
                              className={`text-xs px-2 py-1 bg-transparent border rounded-full focus:outline-none cursor-pointer hover:brightness-110 transition-all ${
                                (s.estado || 'bot') === 'bot' 
                                  ? 'text-[#25d366] border-[#25d366]/20 bg-[#25d366]/10' 
                                  : 'text-indigo-400 border-indigo-400/20 bg-indigo-400/10'
                              }`}
                            >
                              <option value="bot" className="bg-[#12121a]">bot</option>
                              <option value="human" className="bg-[#12121a]">human</option>
                            </select>
                          </td>
                          <td className="p-4 text-sm text-gray-400">
                            {s.last_interaction ? new Date(s.last_interaction).toLocaleString() : 'N/A'}
                          </td>
                          <td className="p-4">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleViewMessages(s.phone)}
                                className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-white bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 px-2.5 py-1.5 rounded-lg transition-all whitespace-nowrap"
                                title="Ver mensajes de este número en el log"
                              >
                                <ScrollText className="h-3 w-3" />
                                Ver mensajes
                              </button>
                              <button
                                onClick={() => deleteSession(s.id, s.phone)}
                                className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                title="Eliminar registro de este contacto"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
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

          {/* LOGS */}
          {activeTab === 'logs' && (() => {
            const filteredLines = logPhoneFilter && logData
              ? logData.lines.filter(line => line.includes(logPhoneFilter))
              : (logData?.lines ?? []);
            return (
              <div className="space-y-4">
                {/* Toolbar */}
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 text-sm text-gray-400 flex-wrap">
                    <ScrollText className="h-4 w-4 shrink-0" />
                    <span>
                      {logData
                        ? `${filteredLines.length}${logPhoneFilter ? ` de ${logData.lines.length}` : ''} líneas • ${(logData.size / 1024).toFixed(1)} KB`
                        : 'Cargando...'}
                    </span>
                    {logPhoneFilter ? (
                      <span className="flex items-center gap-1.5 bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 text-xs px-2.5 py-1 rounded-full">
                        Filtrado: +{logPhoneFilter}
                        <button
                          onClick={() => setLogPhoneFilter(null)}
                          className="hover:text-white ml-0.5 leading-none"
                          title="Quitar filtro"
                        >✕</button>
                      </span>
                    ) : (
                      <span className="text-gray-600 text-xs">(auto-refresh cada 10s)</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={loadLogs}
                      className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 px-3 py-1.5 rounded-xl transition-all"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Actualizar
                    </button>
                    {isAdmin && (
                      <button
                        onClick={handleClearLogs}
                        disabled={clearingLogs}
                        className="flex items-center gap-1.5 text-sm text-red-400 hover:text-white bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 px-3 py-1.5 rounded-xl transition-all disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {clearingLogs ? 'Limpiando...' : 'Limpiar Log'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Terminal viewer */}
                <div
                  ref={logContainerRef}
                  className="bg-black rounded-2xl border border-white/10 h-[60vh] overflow-y-auto p-4 font-mono text-xs leading-5 space-y-px"
                  style={{ scrollBehavior: 'smooth' }}
                >
                  {filteredLines.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-600">
                      <ScrollText className="h-10 w-10" />
                      {logPhoneFilter
                        ? <p>No hay mensajes de +{logPhoneFilter} en el log.</p>
                        : <p>No hay entradas en el log todavía.</p>
                      }
                    </div>
                  ) : (
                    filteredLines.map((line, i) => (
                      <div key={i} className="whitespace-pre-wrap break-all">
                        {formatLogLine(line)}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })()}
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
