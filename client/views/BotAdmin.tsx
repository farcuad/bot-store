import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Activity, MessageSquare, Database, AlertCircle, RefreshCw, Edit2, Trash2, Download, Upload, RotateCcw, ScrollText, FileText, Code, BookOpen, Copy, Bell, Plus, X, Search } from 'lucide-react';
import axios from 'axios';
import { useGlassAlert } from 'glass-alert-animation';
import LoadingScreen from '../components/LoadingScreen';
import TemplatesTab from './TemplatesTab';
import { getAppStorage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

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
  nombre?: string;
  texto: string;
  activo: boolean;
  mediaUrl?: string;
  mediaUrls?: string[];
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

interface ApiLog {
  id: string;
  type: string;
  from: string;
  to: string;
  body: string;
  fromMe: string;
  hasMedia: boolean;
  status: string;
  timestamp: any;
}

type Tab = 'stats' | 'respuestas' | 'conversaciones' | 'no_ent' | 'logs' | 'api_logs' | 'plantillas' | 'notificaciones';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'stats',           label: 'Métricas',        icon: Activity },
  { id: 'respuestas',      label: 'Base de Datos',   icon: Database },
  { id: 'conversaciones',  label: 'Conversaciones',  icon: MessageSquare },
  { id: 'no_ent',          label: 'No Entendidos',   icon: AlertCircle },
  { id: 'notificaciones',  label: 'Notificaciones',  icon: Bell },
  { id: 'logs',            label: 'Logs Sistema',    icon: ScrollText },
  { id: 'api_logs',        label: 'Envíos API',      icon: Activity },
  { id: 'plantillas',      label: 'Plantillas',      icon: FileText },
];

const API_URL = import.meta.env.VITE_API_URL || '';

export default function BotAdmin() {
  const { botId } = useParams<{ botId: string }>();
  const botNumber = botId || '';
  const location = useLocation();
  const navigate = useNavigate();
  const initialTab = (location.state as any)?.initialTab as Tab | undefined;
  const [activeTab, setActiveTab] = useState<Tab>(initialTab || 'stats');
  const { user, isAdmin } = useAuth();
  const { fire } = useGlassAlert();

  const [loading, setLoading]           = useState(true);
  const [stats, setStats]               = useState<BotStats | null>(null);
  const [respuestas, setRespuestas]     = useState<RespuestaInfo[]>([]);
  const [sessions, setSessions]         = useState<Session[]>([]);
  const [noEntendidos, setNoEntendidos] = useState<MensajeNoEntendido[]>([]);

  const [editingRes, setEditingRes] = useState<RespuestaInfo | null>(null);
  const [resNombre, setResNombre]   = useState('');
  const [resText, setResText]       = useState('');
  const [resMediaUrls, setResMediaUrls] = useState<string[]>([]);
  const [tempMediaUrl, setTempMediaUrl] = useState('');
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editSessionName, setEditSessionName] = useState('');
  const [sessionSearch, setSessionSearch] = useState('');
  const [clearingSessions, setClearingSessions] = useState(false);

  const importInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  // Logs state
  const [logData, setLogData] = useState<LogData | null>(null);
  const [clearingLogs, setClearingLogs] = useState(false);
  const [logPhoneFilter, setLogPhoneFilter] = useState<string | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // API Logs state
  const [apiLogs, setApiLogs] = useState<ApiLog[]>([]);
  const [apiKey, setApiKey]   = useState<string>('');

  // Bot metadata state
  const [botName, setBotName]           = useState<string>('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [botTimezone, setBotTimezone]   = useState<string>('America/Caracas');
  const [autoResponseEnabled, setAutoResponseEnabled] = useState(true);
  const [togglingAutoResponse, setTogglingAutoResponse] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [togglingDebug, setTogglingDebug] = useState(false);

  // Plan / subscription state
  const [canUseTemplates, setCanUseTemplates] = useState(true); // optimistic default
  const [canUseApi, setCanUseApi]             = useState(true); 
  const [userPlanName, setUserPlanName]     = useState('Basic');

  // Notification triggers state
  const [motivos, setMotivos]             = useState<string[]>([]);
  const [loadingMotivos, setLoadingMotivos] = useState(false);
  const [savingMotivos, setSavingMotivos]   = useState(false);
  const [nuevoMotivo, setNuevoMotivo]       = useState('');
  const [editingMotivoIdx, setEditingMotivoIdx] = useState<number | null>(null);

  const loadBotInfo = async () => {
    try {
      const token = await user?.getIdToken();
      const res = await axios.get<ApiResponse<{ nombre: string; timezone?: string; clientKey?: string; isAutoResponseEnabled?: boolean; debugEnabled?: boolean }>>(`${API_URL}/api/saas/bots/${botNumber}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.data.ok) {
        setBotName(res.data.data.nombre);
        setEditNameValue(res.data.data.nombre);
        if (res.data.data.timezone) {
          setBotTimezone(res.data.data.timezone);
        }
        if (res.data.data.clientKey) {
          setApiKey(res.data.data.clientKey);
        }
        setAutoResponseEnabled(res.data.data.isAutoResponseEnabled !== false);
        setDebugEnabled(!!res.data.data.debugEnabled);
      }
    } catch (e) {
      console.error("Error loading bot meta:", e);
    }
  };

  const toggleAutoResponse = async () => {
    setTogglingAutoResponse(true);
    try {
      const token = await user?.getIdToken();
      const nextValue = !autoResponseEnabled;
      const res = await axios.patch<ApiResponse>(`${API_URL}/api/saas/bots/${botNumber}/auto-response`, 
        { enabled: nextValue },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (res.data.ok) {
        setAutoResponseEnabled(nextValue);
        fire({
          title: nextValue ? 'Bot Activado' : 'Bot Silenciado',
          text: nextValue ? 'El bot ahora responderá automáticamente.' : 'El bot ya no responderá automáticamente, pero seguirá recibiendo mensajes y permitiendo envíos vía API.',
          icon: 'success',
          timer: 3000
        });
      }
    } catch (e: any) {
      fire({
        title: 'Error',
        text: "Error al cambiar estado de auto-respuesta: " + (e.response?.data?.error || e.message),
        icon: 'error'
      });
    } finally {
      setTogglingAutoResponse(false);
    }
  };

  const toggleDebug = async () => {
    setTogglingDebug(true);
    try {
      const token = await user?.getIdToken();
      const nextValue = !debugEnabled;
      const res = await axios.patch<ApiResponse>(`${API_URL}/api/saas/bots/${botNumber}/debug`, 
        { enabled: nextValue },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (res.data.ok) {
        setDebugEnabled(nextValue);
        fire({
          title: nextValue ? 'Captura de logs activada' : 'Captura de logs desactivada',
          text: nextValue ? 'Se registrarán todos los pasos detallados para troubleshooting.' : 'Se ha desactivado el registro detallado para ahorrar espacio.',
          icon: 'success',
          timer: 3000
        });
      }
    } catch (e: any) {
      fire({
        title: 'Error',
        text: "Error al cambiar estado de captura: " + (e.response?.data?.error || e.message),
        icon: 'error'
      });
    } finally {
      setTogglingDebug(false);
    }
  };

  useEffect(() => {
    if (!botId || !user) return;
    loadBotInfo();
  }, [botId, user]);

  useEffect(() => {
    if (!user || isAdmin) return;
    const checkBilling = async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/saas/billing/me', { headers: { 'Authorization': `Bearer ${token}` } });
        const d = await res.json();
        if (d.ok) {
          const status = d.subscription?.status;
          const expiresAt = d.subscription?.expiresAt;
          const now = Math.floor(Date.now() / 1000);
          if (status !== 'active' || (expiresAt && expiresAt <= now)) {
            navigate('/saas/subscription');
          }
          // Capture plan features for conditional UI
          setCanUseTemplates(d.plan?.features?.whatsappTemplates === true);
          setCanUseApi(d.plan?.features?.apiAccess === true);
          setUserPlanName(d.plan?.name || 'Basic');
        }
      } catch (e) {
        console.error(e);
      }
    };
    checkBilling();
  }, [user, isAdmin, navigate]);

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

  const saveTimezone = async (newTz: string) => {
    setBotTimezone(newTz);
    try {
      const token = await user?.getIdToken();
      await axios.put<ApiResponse>(`${API_URL}/api/saas/bots/${botNumber}/timezone`, 
        { timezone: newTz }, 
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
    } catch (e: any) {
      fire({
        title: 'Error',
        text: "Error actualizando país: " + (e.response?.data?.error || e.message),
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
      } else if (activeTab === 'api_logs') {
        const res = await axios.get<ApiResponse<ApiLog[]>>(`${API_URL}/api/saas/bots/${botNumber}/api-logs`, { headers });
        if (res.data.ok) setApiLogs(res.data.data);
      } else if (activeTab === 'notificaciones') {
        await loadMotivos();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // ── Notification Triggers ──────────────────────────────────────────────────

  const loadMotivos = useCallback(async () => {
    if (!botId || !user) return;
    setLoadingMotivos(true);
    try {
      const headers = await getHeaders();
      const res = await axios.get<ApiResponse<string[]>>(`${API_URL}/api/saas/bots/${botNumber}/notificacion-motivos`, { headers });
      if (res.data.ok) setMotivos(res.data.data);
    } catch (e) {
      console.error('Error cargando motivos:', e);
    } finally {
      setLoadingMotivos(false);
    }
  }, [botId, user, botNumber]);

  const saveMotivosList = async (newList: string[]) => {
    setSavingMotivos(true);
    try {
      const headers = await getHeaders();
      await axios.put(`${API_URL}/api/saas/bots/${botNumber}/notificacion-motivos`, { motivos: newList }, { headers });
      setMotivos(newList);
    } catch (e: any) {
      fire({ title: 'Error', text: e.response?.data?.error || e.message, icon: 'error' });
    } finally {
      setSavingMotivos(false);
    }
  };

  const addMotivo = async () => {
    const trimmed = nuevoMotivo.trim();
    if (!trimmed) return;
    
    let newList: string[];
    if (editingMotivoIdx !== null) {
      newList = [...motivos];
      newList[editingMotivoIdx] = trimmed;
      setEditingMotivoIdx(null);
    } else {
      if (motivos.includes(trimmed)) return;
      newList = [...motivos, trimmed];
    }
    
    await saveMotivosList(newList);
    setNuevoMotivo('');
  };

  const removeMotivo = async (index: number) => {
    const newList = motivos.filter((_, i) => i !== index);
    await saveMotivosList(newList);
  };

  const saveMotivos = async () => {
    await saveMotivosList(motivos);
    fire({ title: '✅ Guardado', text: 'Motivos de notificación actualizados correctamente.', icon: 'success' });
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
      const payload = { nombre: resNombre, texto: resText, mediaUrls: resMediaUrls };
      if (editingRes) {
        await axios.put<ApiResponse>(`${API_URL}/api/saas/bots/${botNumber}/respuestas-info/${editingRes.id}`, payload, { headers });
      } else {
        const rid = 'res_' + Math.random().toString(36).substring(2, 9);
        await axios.post<ApiResponse>(`${API_URL}/api/saas/bots/${botNumber}/respuestas-info`, { rid, activo: true, ...payload }, { headers });
      }
      setEditingRes(null);
      setResNombre('');
      setResText('');
      setResMediaUrls([]);
      setTempMediaUrl('');
      loadData();
    } catch (e: any) {
      fire({
        title: 'Error',
        text: 'Error guardando: ' + (e.response?.data?.error || e.message),
        icon: 'error'
      });
    }
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const storage = getAppStorage();
    if (!storage) {
      fire({ title: 'Error', text: 'Firebase Storage no inicializado.', icon: 'error' });
      return;
    }
    setUploadingMedia(true);
    try {
      const ext = file.name.split('.').pop();
      const filename = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
      const fileRef = ref(storage, `whaibot/knowledge/${botNumber}/${filename}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      setResMediaUrls(prev => [...prev, url]);
    } catch (error: any) {
      fire({ title: 'Error', text: 'No se pudo subir la imagen: ' + error.message, icon: 'error' });
    } finally {
      setUploadingMedia(false);
      e.target.value = '';
    }
  };

  const handleAddTempMediaUrl = () => {
    if (tempMediaUrl.trim().startsWith('http')) {
      setResMediaUrls(prev => [...prev, tempMediaUrl.trim()]);
      setTempMediaUrl('');
    } else {
      fire({ title: 'Error', text: 'Por favor, introduce una URL válida (http/https).', icon: 'error' });
    }
  };

  const handleRemoveMediaUrl = (index: number) => {
    setResMediaUrls(prev => prev.filter((_, i) => i !== index));
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

  const handleClearAllSessions = async () => {
    const result = await fire({
      title: '¿Limpiar todas las conversaciones?',
      text: 'Se eliminarán todos los registros de contactos y sus historiales. Los clientes volverán a ser saludados como nuevos contactos la próxima vez que escriban.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, limpiar todo',
      cancelButtonText: 'Cancelar'
    });
    if (!result.isConfirmed) return;

    setClearingSessions(true);
    try {
      const headers = await getHeaders();
      await axios.delete<ApiResponse>(`${API_URL}/api/saas/bots/${botNumber}/sessions`, { headers });
      setSessions([]);
      fire({
        title: 'Conversaciones limpiadas',
        text: 'Se han eliminado todos los registros de sesión exitosamente.',
        icon: 'success',
        timer: 3000
      });
    } catch (e: any) {
      fire({
        title: 'Error',
        text: 'Error limpiando sesiones: ' + (e.response?.data?.error || e.message),
        icon: 'error'
      });
    } finally {
      setClearingSessions(false);
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
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-gray-500 text-xs sm:text-sm font-mono">{botNumber} • Panel de administración</p>
              <span className="text-gray-500 text-xs sm:text-sm">•</span>
              <select
                value={botTimezone}
                onChange={(e) => saveTimezone(e.target.value)}
                className="bg-transparent border border-white/10 rounded-md text-xs sm:text-sm text-gray-400 focus:outline-none focus:border-[#25d366] px-1 py-0.5 max-w-[150px]"
                title="País / Zona horaria del bot"
              >
                <option value="America/Argentina/Buenos_Aires">🇦🇷 Argentina</option>
                <option value="America/La_Paz">🇧🇴 Bolivia</option>
                <option value="America/Sao_Paulo">🇧🇷 Brasil</option>
                <option value="America/Santiago">🇨🇱 Chile</option>
                <option value="America/Bogota">🇨🇴 Colombia</option>
                <option value="America/Costa_Rica">🇨🇷 Costa Rica</option>
                <option value="America/Havana">🇨🇺 Cuba</option>
                <option value="America/Guayaquil">🇪🇨 Ecuador</option>
                <option value="America/El_Salvador">🇸🇻 El Salvador</option>
                <option value="Europe/Madrid">🇪🇸 España</option>
                <option value="America/New_York">🇺🇸 EE.UU. (NY)</option>
                <option value="America/Guatemala">🇬🇹 Guatemala</option>
                <option value="America/Tegucigalpa">🇭🇳 Honduras</option>
                <option value="America/Mexico_City">🇲🇽 México</option>
                <option value="America/Managua">🇳🇮 Nicaragua</option>
                <option value="America/Panama">🇵🇦 Panamá</option>
                <option value="America/Asuncion">🇵🇾 Paraguay</option>
                <option value="America/Lima">🇵🇪 Perú</option>
                <option value="America/Puerto_Rico">🇵🇷 Puerto Rico</option>
                <option value="America/Santo_Domingo">🇩🇴 Rep. Dom.</option>
                <option value="America/Montevideo">🇺🇾 Uruguay</option>
                <option value="America/Caracas">🇻🇪 Venezuela</option>
              </select>
            </div>
          </div>
        </div>
        {/* Action buttons: scrollable row on mobile */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
          <button
            onClick={toggleAutoResponse}
            disabled={togglingAutoResponse}
            className={`shrink-0 flex items-center gap-2 text-sm border px-3 py-2 rounded-xl transition-all ${
              autoResponseEnabled 
                ? 'text-[#25d366] bg-[#25d366]/10 border-[#25d366]/20 hover:bg-[#25d366]/20' 
                : 'text-gray-400 bg-white/5 border-white/10 hover:bg-white/10'
            }`}
            title={autoResponseEnabled ? 'Desactivar auto-respuesta (modo silencio)' : 'Activar auto-respuesta'}
          >
            {togglingAutoResponse ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : autoResponseEnabled ? (
              <>
                <MessageSquare className="h-4 w-4" />
                <span className="whitespace-nowrap">Auto-Respuesta: ON</span>
              </>
            ) : (
              <>
                <X className="h-4 w-4" />
                <span className="whitespace-nowrap">Auto-Respuesta: OFF</span>
              </>
            )}
          </button>
          <button
            onClick={toggleDebug}
            disabled={togglingDebug}
            className={`shrink-0 flex items-center gap-2 text-sm border px-3 py-2 rounded-xl transition-all ${
              debugEnabled 
                ? 'text-amber-400 bg-amber-400/10 border-amber-400/20 hover:bg-amber-400/20' 
                : 'text-gray-400 bg-white/5 border-white/10 hover:bg-white/10'
            }`}
            title={debugEnabled ? 'Desactivar captura de logs detallados' : 'Activar captura de logs detallados'}
          >
            {togglingDebug ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : debugEnabled ? (
              <>
                <Database className="h-4 w-4" />
                <span className="whitespace-nowrap">Capturar Logs: ON</span>
              </>
            ) : (
              <>
                <Database className="h-4 w-4 opacity-50" />
                <span className="whitespace-nowrap">Capturar Logs: OFF</span>
              </>
            )}
          </button>
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
        <LoadingScreen message="Cargando configuración del bot..." />
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
                {respuestas.map(r => {
                  const images = r.mediaUrls && r.mediaUrls.length > 0 ? r.mediaUrls : (r.mediaUrl ? [r.mediaUrl] : []);
                  return (
                    <div key={r.id} className="bg-[#12121a] border border-white/5 rounded-xl p-4 flex items-start gap-4 hover:border-white/10 transition-all">
                      {images.length > 0 && (
                        <div className="shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-black/40 border border-white/5 flex items-center justify-center relative">
                          <img src={images[0]} alt={r.nombre || "Media"} className="w-full h-full object-cover" />
                          {images.length > 1 && (
                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-[2px]">
                              <span className="text-white font-bold text-xs">+{images.length - 1}</span>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="font-bold text-white truncate">{r.nombre || "Sin título"}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${r.activo ? 'bg-[#25d366]/10 text-[#25d366] border-[#25d366]/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                            {r.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed line-clamp-3">{r.texto}</p>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <button onClick={() => { setEditingRes(r); setResNombre(r.nombre || ''); setResText(r.texto); setResMediaUrls(images); }} className="p-2 text-gray-500 hover:text-indigo-400 hover:bg-indigo-400/10 rounded-lg transition-colors" title="Editar"><Edit2 className="h-4 w-4" /></button>
                        <button onClick={() => toggleActiva(r)} className="p-2 text-gray-500 hover:text-yellow-400 hover:bg-yellow-400/10 rounded-lg transition-colors" title="Toggle activo"><Activity className="h-4 w-4" /></button>
                        <button onClick={() => deleteRespuesta(r.id)} className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors" title="Eliminar"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Editor */}
              <div className="bg-[#12121a] border border-white/5 rounded-2xl p-6 h-fit sticky top-6">
                <h3 className="font-bold text-white mb-4">{editingRes ? 'Editar Información' : 'Nueva Información'}</h3>
                <form onSubmit={saveRespuesta} className="space-y-4">
                  {editingRes && <div className="text-xs text-gray-500 font-mono">{editingRes.id}</div>}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Título de la regla</label>
                    <input
                      type="text"
                      value={resNombre}
                      onChange={e => setResNombre(e.target.value)}
                      className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#25d366] focus:ring-1 focus:ring-[#25d366] transition-all"
                      placeholder="Ej: Horarios de atención"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Contenido detallado (Descripción)</label>
                    <textarea
                      value={resText}
                      onChange={e => setResText(e.target.value)}
                      className="w-full h-40 bg-black/30 border border-white/5 rounded-xl p-3 text-white text-sm focus:outline-none focus:border-[#25d366] focus:ring-1 focus:ring-[#25d366] resize-none transition-all"
                      placeholder="Ej: El horario de atención es de 8:00am a 5:00pm, de Lunes a Viernes."
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Imágenes (opcional)</label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={tempMediaUrl}
                        onChange={e => setTempMediaUrl(e.target.value)}
                        placeholder="Pega una URL y presiona '+'"
                        className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-white text-sm font-mono focus:outline-none focus:border-[#25d366] focus:ring-1 focus:ring-[#25d366] transition-all"
                      />
                      <button type="button" onClick={handleAddTempMediaUrl} className="shrink-0 bg-white/10 text-white px-4 py-3 rounded-xl flex items-center justify-center font-bold text-sm hover:bg-white/20 transition-colors">
                        +
                      </button>
                      <label className="cursor-pointer shrink-0 bg-[#25d366]/10 text-[#25d366] px-4 py-3 rounded-xl flex items-center justify-center font-bold text-sm hover:bg-[#25d366]/20 transition-colors">
                        <input type="file" className="hidden" accept="image/*" onChange={handleMediaUpload} disabled={uploadingMedia} />
                        {uploadingMedia ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      </label>
                    </div>
                    {resMediaUrls.length > 0 && (
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        {resMediaUrls.map((url, i) => (
                          <div key={i} className="relative rounded-xl overflow-hidden border border-white/5 h-24 bg-black/40 group flex items-center justify-center">
                            <img src={url} alt={`Preview ${i}`} className="h-full w-full object-cover" onError={e => (e.currentTarget.src = '')} />
                            <button
                              type="button"
                              onClick={() => handleRemoveMediaUrl(i)}
                              className="absolute top-1 right-1 p-1 bg-red-500/80 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-3 pt-2">
                    {editingRes && (
                      <button type="button" onClick={() => { setEditingRes(null); setResNombre(''); setResText(''); setResMediaUrls([]); setTempMediaUrl(''); }} className="px-4 py-2 border border-white/10 hover:bg-white/5 rounded-xl text-sm font-medium transition-colors">
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
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#12121a] border border-white/5 rounded-2xl p-4">
                <div className="relative w-full sm:max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                  <input
                    type="text"
                    value={sessionSearch}
                    onChange={(e) => setSessionSearch(e.target.value)}
                    placeholder="Buscar por nombre o teléfono..."
                    className="w-full bg-black/40 border border-white/5 rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-[#25d366] transition-all"
                  />
                </div>
                <button
                  onClick={handleClearAllSessions}
                  disabled={clearingSessions || sessions.length === 0}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {clearingSessions ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Limpiar todo
                </button>
              </div>

              {sessions.filter(s => {
                const search = sessionSearch.toLowerCase();
                return s.phone.includes(search) || (s.contactName?.toLowerCase().includes(search) ?? false);
              }).length === 0
              ? <Empty icon={MessageSquare} text={sessionSearch ? "No se encontraron conversaciones que coincidan." : "No hay sesiones activas."} />
              : (
                <div className="bg-[#12121a] border border-white/5 rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[500px]">
                    <thead>
                      <tr className="bg-black/20 text-gray-400 text-sm">
                        <th className="p-4 font-medium">Contacto</th>
                        <th className="p-4 font-medium">Estado</th>
                        <th className="p-4 font-medium">Última interacción</th>
                        <th className="p-4 font-medium text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {sessions
                        .filter(s => {
                          const search = sessionSearch.toLowerCase();
                          return s.phone.includes(search) || (s.contactName?.toLowerCase().includes(search) ?? false);
                        })
                        .map(s => (
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
            }</div>
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

          {/* API LOGS */}
          {activeTab === 'api_logs' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-white flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-400" />
                  Registro de Envíos API
                </h3>
                <button
                  onClick={loadData}
                  className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 px-3 py-1.5 rounded-xl transition-all"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Actualizar
                </button>
              </div>
              {(!canUseApi && !isAdmin) && (
                <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-6 text-center">
                  <Code className="h-10 w-10 text-indigo-400 mx-auto mb-3 opacity-50" />
                  <h4 className="text-white font-bold mb-1">Registro de envíos API</h4>
                  <p className="text-sm text-gray-400 mb-4">
                    Tu plan actual ({userPlanName}) no incluye este servicio. Actualiza al plan Pro o Premium →
                  </p>
                  <button 
                    onClick={() => navigate('/saas/subscription')}
                    className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20"
                  >
                    Mejorar mi plan
                  </button>
                </div>
              )}

              {/* API Credentials Card */}
              {(canUseApi || isAdmin) && (
                <div className="bg-[#1a1a2e]/50 border border-white/10 rounded-3xl p-8 backdrop-blur-sm shadow-2xl mb-8">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-2">
                      <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Code className="h-5 w-5 text-indigo-400" />
                        Credenciales de API
                      </h3>
                      <p className="text-sm text-gray-400">
                        Usa estas credenciales para enviar mensajes desde sistemas externos.
                      </p>
                    </div>
                    <button
                      onClick={() => navigate('/saas/api-docs')}
                      className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20"
                    >
                      <BookOpen className="h-4 w-4" />
                      Ver Documentación
                    </button>
                  </div>

                  <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-black/40 border border-white/5 rounded-2xl p-4 flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">x-client-botid</span>
                      <div className="flex items-center justify-between">
                        <code className="text-indigo-400 font-mono text-sm">{botNumber}</code>
                        <button 
                          onClick={() => { navigator.clipboard.writeText(botNumber); fire({ title: 'Copiado', toast: true, position: 'top-end', timer: 2000, icon: 'success' }); }}
                          className="p-2 hover:bg-white/5 rounded-lg transition-all text-gray-500 hover:text-white"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="bg-black/40 border border-white/5 rounded-2xl p-4 flex flex-col gap-1">
                      <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">x-client-key</span>
                      <div className="flex items-center justify-between">
                        <code className="text-indigo-400 font-mono text-sm">{apiKey || 'Cargando...'}</code>
                        <button 
                          onClick={() => { navigator.clipboard.writeText(apiKey); fire({ title: 'Copiado', toast: true, position: 'top-end', timer: 2000, icon: 'success' }); }}
                          className="p-2 hover:bg-white/5 rounded-lg transition-all text-gray-500 hover:text-white"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {apiLogs.length === 0 ? (
                <Empty icon={Activity} text="No hay envíos API registrados." />
              ) : (
                <div className="bg-[#12121a] border border-white/5 rounded-2xl overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#1a1a2e] border-b border-white/5 text-xs uppercase tracking-wider text-gray-500">
                        <th className="px-6 py-4 font-medium">Fecha</th>
                        <th className="px-6 py-4 font-medium">Destino</th>
                        <th className="px-6 py-4 font-medium">Tipo</th>
                        <th className="px-6 py-4 font-medium">Mensaje</th>
                        <th className="px-6 py-4 font-medium">Remitente</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {apiLogs.map(log => {
                        const isGroup = log.to.includes("@g.us");
                        return (
                          <tr key={log.id} className="hover:bg-white/2 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="text-gray-300 text-sm">
                                {log.timestamp ? new Date(log.timestamp._seconds ? log.timestamp._seconds * 1000 : log.timestamp).toLocaleString() : '-'}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs px-2 py-0.5 rounded-full border ${isGroup ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                                  {isGroup ? 'Grupo' : 'Número'}
                                </span>
                                <span className="text-gray-300 text-sm font-mono">{log.to.split('@')[0]}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`text-xs px-2 py-0.5 rounded-full border ${log.hasMedia ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>
                                {log.hasMedia ? 'Con Media' : 'Solo Texto'}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <p className="text-gray-400 text-sm line-clamp-2 max-w-md">{log.body}</p>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="text-gray-300 text-sm">{log.fromMe}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* NOTIFICACIONES */}
          {activeTab === 'notificaciones' && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Bell className="h-5 w-5 text-amber-400" />
                    Motivos de Notificación al Dueño
                  </h2>
                  <p className="text-xs text-gray-500 mt-1 max-w-lg">
                    Configura cuándo el bot debe avisar al dueño del negocio (enviándole un mensaje en WhatsApp). Agrega los escenarios concretos que apliquen a tu negocio. Si la lista está vacía, solo se notificará cuando el cliente pida hablar con un humano.
                  </p>
                </div>
                <button
                  onClick={saveMotivos}
                  disabled={savingMotivos}
                  className="shrink-0 flex items-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                >
                  {savingMotivos
                    ? <RefreshCw className="h-4 w-4 animate-spin" />
                    : <Bell className="h-4 w-4" />}
                  Guardar cambios
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Lista de motivos */}
                <div className="lg:col-span-2 space-y-3">
                  {loadingMotivos ? (
                    <div className="flex justify-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-400" />
                    </div>
                  ) : motivos.length === 0 ? (
                    <div className="bg-[#12121a] border border-white/5 border-dashed rounded-2xl p-10 text-center text-gray-500">
                      <Bell className="h-10 w-10 mx-auto mb-3 opacity-30" />
                      <p className="font-medium">No hay motivos configurados</p>
                      <p className="text-xs mt-1">El bot solo avisará cuando el cliente pida hablar con un humano.</p>
                    </div>
                  ) : (
                    motivos.map((motivo, i) => (
                      <div key={i} className="bg-[#12121a] border border-white/5 rounded-xl px-4 py-3 flex items-center gap-3 hover:border-white/10 transition-all group">
                        <span className="shrink-0 w-6 h-6 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                        <p className="flex-1 text-sm text-gray-300">{motivo}</p>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => { setEditingMotivoIdx(i); setNuevoMotivo(motivo); }}
                            className="p-1.5 text-gray-600 hover:text-amber-400 hover:bg-amber-400/10 rounded-lg transition-colors"
                            title="Editar motivo"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => removeMotivo(i)}
                            className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                            title="Eliminar motivo"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Panel de agregar */}
                <div className="bg-[#12121a] border border-white/5 rounded-2xl p-6 h-fit sticky top-6">
                  <h3 className="font-bold text-white mb-1">{editingMotivoIdx !== null ? 'Editar motivo' : 'Agregar motivo'}</h3>
                  <p className="text-xs text-gray-500 mb-4">Ejemplos: "Cuando el cliente quiera hacer un pedido", "Cuando pida una cotización especial"…</p>
                  <textarea
                    value={nuevoMotivo}
                    onChange={e => setNuevoMotivo(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addMotivo(); } }}
                    placeholder="Describe el motivo de notificación…"
                    rows={4}
                    className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 transition-all resize-none mb-3"
                  />
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={addMotivo}
                      disabled={!nuevoMotivo.trim() || savingMotivos}
                      className="w-full flex items-center justify-center gap-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 px-4 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {savingMotivos ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      {editingMotivoIdx !== null ? 'Actualizar motivo' : 'Agregar a la lista'}
                    </button>
                    {editingMotivoIdx !== null && (
                      <button
                        onClick={() => { setEditingMotivoIdx(null); setNuevoMotivo(''); }}
                        className="w-full py-2 text-xs text-gray-500 hover:text-white transition-colors"
                      >
                        Cancelar edición
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-600 mt-3 text-center">Presiona Enter para agregar rápidamente</p>
                </div>
              </div>

              {/* Info box */}
              <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl px-4 py-3 text-xs text-amber-400/80 flex gap-3 items-start">
                <Bell className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold mb-0.5">¿Cómo funciona?</p>
                  <p>Cuando el bot detecte que el cliente expresa alguno de estos motivos, le responderá amablemente y te enviará un mensaje de aviso a tu WhatsApp (al número del dueño) para que puedas atenderlo.</p>
                </div>
              </div>
            </div>
          )}

          {/* PLANTILLAS */}
          {activeTab === 'plantillas' && (
            <TemplatesTab botNumber={botNumber} getHeaders={getHeaders} canUseTemplates={canUseTemplates || isAdmin} />
          )}

        </div>
      )}
    </div>
  );
}

/* ── End of file ── */
