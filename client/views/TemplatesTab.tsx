import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useGlassAlert } from 'glass-alert-animation';
import {
  FileText, Plus, Edit2, Trash2, Send, Clock, Users, Image, X,
  CheckSquare, Square, Calendar, RefreshCw, ChevronRight, Zap, Repeat, Upload, Search
} from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getAppStorage } from '../firebase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Template {
  id: string;
  name: string;
  text: string;
  imageUrl?: string | null;
  createdAt?: any;
}

interface WaGroup {
  id: string;
  name: string;
  participantCount: number;
}

interface ContactSession {
  id: string;
  phone: string;
  contactName?: string;
}

interface BroadcastRecord {
  id: string;
  templateSnapshot: { text: string; imageUrl?: string };
  recipients: { contactIds: string[]; groupIds: string[]; status?: boolean };
  schedule: Schedule;
  status: 'pending' | 'sending' | 'done' | 'error' | 'scheduled';
  createdAt?: any;
  lastRun?: any;
  nextRun?: any;
  errorMessage?: string;
}

type ScheduleType = 'now' | 'once' | 'weekly' | 'monthly';

interface Schedule {
  type: ScheduleType;
  datetime?: string;
  daysOfWeek?: number[];
  daysOfMonth?: number[];
  time?: string;
}

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const API_URL = import.meta.env.VITE_API_URL || '';

// ── Helper ────────────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending:   'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    sending:   'bg-blue-500/10 text-blue-400 border-blue-500/20',
    scheduled: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    done:      'bg-[#25d366]/10 text-[#25d366] border-[#25d366]/20',
    error:     'bg-red-500/10 text-red-400 border-red-500/20',
  };
  const labels: Record<string, string> = {
    pending: 'Pendiente', sending: 'Enviando', scheduled: 'Programado', done: 'Enviado', error: 'Error'
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${map[status] || 'bg-gray-500/10 text-gray-400 border-gray-500/20'}`}>
      {labels[status] || status}
    </span>
  );
}

function scheduleLabel(s: Schedule): string {
  if (s.type === 'now') return 'Enviar ahora';
  if (s.type === 'once') return `Una vez: ${s.datetime ? new Date(s.datetime).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' }) : '—'}`;
  if (s.type === 'weekly') {
    const days = (s.daysOfWeek ?? []).map(d => DAY_LABELS[d]).join(', ');
    return `Semanal: ${days} a las ${s.time}`;
  }
  if (s.type === 'monthly') {
    const days = (s.daysOfMonth ?? []).join(', ');
    return `Mensual: días ${days} a las ${s.time}`;
  }
  return '—';
}

function parseDate(val: any): Date | null {
  if (!val) return null;
  if (typeof val === 'object' && '_seconds' in val) return new Date(val._seconds * 1000);
  if (typeof val === 'object' && 'seconds' in val) return new Date(val.seconds * 1000);
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function getUtcStringInTimezone(localDateTimeStr: string, timezone: string): string {
  const [datePart, timePart] = localDateTimeStr.split('T');
  if (!datePart || !timePart) return new Date(localDateTimeStr).toISOString();
  
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  
  const tempDate = new Date(Date.UTC(year, month - 1, day, hours, minutes));
  const parts = tempDate.toLocaleString('en-US', { timeZone: timezone, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false }).match(/\d+/g);
  if (!parts) return tempDate.toISOString();
  
  const [tzMonth, tzDay, tzYear, tzHour, tzMin] = parts.map(Number);
  const tzDate = new Date(Date.UTC(tzYear, tzMonth - 1, tzDay, tzHour, tzMin));
  
  const diffMs = tempDate.getTime() - tzDate.getTime();
  const finalDate = new Date(tempDate.getTime() + diffMs);
  return finalDate.toISOString();
}

// ── Main Component ─────────────────────────────────────────────────────────────

interface Props {
  botNumber: string;
  getHeaders: () => Promise<Record<string, string>>;
  canUseTemplates?: boolean; // undefined = optimistic (show button); false = locked
}

type SendStep = 'recipients' | 'schedule';

export default function TemplatesTab({ botNumber, getHeaders, canUseTemplates = true }: Props) {
  const { fire } = useGlassAlert();

  // ── Templates state
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [tName, setTName] = useState('');
  const [tText, setTText] = useState('');
  const [tImageUrl, setTImageUrl] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [generatingText, setGeneratingText] = useState(false);
  const [aiPreview, setAiPreview] = useState<string | null>(null);

  const [broadcasts, setBroadcasts] = useState<BroadcastRecord[]>([]);
  const [loadingBroadcasts, setLoadingBroadcasts] = useState(true);

  // ── Bot config state
  const [botTimezone, setBotTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [currentTimeStr, setCurrentTimeStr] = useState('');
  const [minDateTime, setMinDateTime] = useState('');

  // ── Send modal state
  const [sendModal, setSendModal] = useState<Template | null>(null);
  const [sendStep, setSendStep] = useState<SendStep>('recipients');
  const [recipientTab, setRecipientTab] = useState<'contacts' | 'groups' | 'status'>('contacts');
  const [contacts, setContacts] = useState<ContactSession[]>([]);
  const [groups, setGroups] = useState<WaGroup[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [schedule, setSchedule] = useState<Schedule>({ type: 'now' });
  const [sending, setSending] = useState(false);
  const [sendToStatus, setSendToStatus] = useState(false);
  const [groupsError, setGroupsError] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');

  // ── Load data
  const loadTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const headers = await getHeaders();
      const res = await axios.get(`${API_URL}/api/saas/bots/${botNumber}/templates`, { headers });
      if (res.data.ok) setTemplates(res.data.data);
    } finally {
      setLoadingTemplates(false);
    }
  }, [botNumber, getHeaders]);

  const loadBroadcasts = useCallback(async () => {
    setLoadingBroadcasts(true);
    try {
      const headers = await getHeaders();
      const res = await axios.get(`${API_URL}/api/saas/bots/${botNumber}/broadcasts`, { headers });
      if (res.data.ok) setBroadcasts(res.data.data);
    } finally {
      setLoadingBroadcasts(false);
    }
  }, [botNumber, getHeaders]);

  useEffect(() => {
    loadTemplates();
    loadBroadcasts();
    // Load timezone
    getHeaders().then(headers => {
      axios.get(`${API_URL}/api/saas/bots/${botNumber}`, { headers }).then(res => {
        if (res.data.ok && res.data.data.timezone) {
          setBotTimezone(res.data.data.timezone);
        }
      }).catch(console.error);
    });
  }, [loadTemplates, loadBroadcasts, botNumber, getHeaders]);

  // Update current time display for scheduling
  useEffect(() => {
    if (sendStep !== 'schedule') return;
    const updateTime = () => {
      const d = new Date();
      // Format display string
      const formatter = new Intl.DateTimeFormat('es-ES', { timeZone: botTimezone, dateStyle: 'long', timeStyle: 'short' });
      setCurrentTimeStr(formatter.format(d) + ` (${botTimezone})`);
      
      // Format min for inputs (YYYY-MM-DDTHH:mm)
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: botTimezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
      const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
      const hour = p.hour === '24' ? '00' : p.hour;
      setMinDateTime(`${p.year}-${p.month}-${p.day}T${hour}:${p.minute}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, [botTimezone, sendStep]);

  // ── Template CRUD
  const openCreate = () => {
    setEditingTemplate(null);
    setTName(''); setTText(''); setTImageUrl('');
    setShowEditor(true);
  };

  const openEdit = (t: Template) => {
    setEditingTemplate(t);
    setTName(t.name); setTText(t.text); setTImageUrl(t.imageUrl || '');
    setShowEditor(true);
  };

  const saveTemplate = async () => {
    if (!tName.trim() || !tText.trim()) return;
    setSavingTemplate(true);
    try {
      const headers = await getHeaders();
      const payload = { name: tName.trim(), text: tText.trim(), imageUrl: tImageUrl.trim() || null };
      if (editingTemplate) {
        await axios.put(`${API_URL}/api/saas/bots/${botNumber}/templates/${editingTemplate.id}`, payload, { headers });
      } else {
        await axios.post(`${API_URL}/api/saas/bots/${botNumber}/templates`, payload, { headers });
      }
      setShowEditor(false);
      loadTemplates();
    } catch (e: any) {
      fire({ title: 'Error', text: e.response?.data?.error || e.message, icon: 'error' });
    } finally {
      setSavingTemplate(false);
    }
  };

  const generateWithAI = async () => {
    if (!tText.trim()) {
      fire({ title: 'Falta la descripción', text: 'Escribe una descripción del mensaje primero para que la IA pueda mejorarla.', icon: 'warning' });
      return;
    }
    setAiPreview(null);
    setGeneratingText(true);
    try {
      const headers = await getHeaders();
      const res = await axios.post(
        `${API_URL}/api/saas/bots/${botNumber}/templates/generate-ai`,
        { description: tText.trim(), name: tName.trim() },
        { headers }
      );
      if (res.data.ok) {
        setAiPreview(res.data.text); // show preview, don't replace yet
      } else {
        fire({ title: 'Error de IA', text: res.data.error, icon: 'error' });
      }
    } catch (e: any) {
      fire({ title: 'Error', text: e.response?.data?.error || e.message, icon: 'error' });
    } finally {
      setGeneratingText(false);
    }
  };

  const acceptAiPreview = () => {
    if (aiPreview) { setTText(aiPreview); setAiPreview(null); }
  };

  const discardAiPreview = () => setAiPreview(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const storage = getAppStorage();
    if (!storage) {
      fire({ title: 'Error', text: 'Firebase Storage no inicializado.', icon: 'error' });
      return;
    }
    setUploadingImage(true);
    try {
      const ext = file.name.split('.').pop();
      const filename = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
      const fileRef = ref(storage, `whaibot/templates/${botNumber}/${filename}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      setTImageUrl(url);
    } catch (error: any) {
      fire({ title: 'Error', text: 'No se pudo subir la imagen: ' + error.message, icon: 'error' });
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  const deleteTemplate = async (t: Template) => {
    const r = await fire({ title: `¿Eliminar "${t.name}"?`, text: 'Esta acción es irreversible.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Eliminar', cancelButtonText: 'Cancelar' });
    if (!r.isConfirmed) return;
    try {
      const headers = await getHeaders();
      await axios.delete(`${API_URL}/api/saas/bots/${botNumber}/templates/${t.id}`, { headers });
      loadTemplates();
    } catch (e: any) {
      fire({ title: 'Error', text: e.message, icon: 'error' });
    }
  };

  // ── Open send modal
  const openSend = async (t: Template) => {
    setSendModal(t);
    setSendStep('recipients');
    setRecipientTab('contacts');
    setSelectedContacts(new Set());
    setSelectedGroups(new Set());
    setSchedule({ type: 'now' });
    setSendToStatus(false);
    setContactSearch('');
    setGroupSearch('');
    setGroupsError('');
    setLoadingRecipients(true);
    try {
      const headers = await getHeaders();
      
      // Load contacts and groups in parallel
      const [cResResult, gResResult] = await Promise.allSettled([
        axios.get(`${API_URL}/api/saas/bots/${botNumber}/sessions`, { headers }),
        axios.get(`${API_URL}/api/saas/bots/${botNumber}/groups`, { headers })
      ]);

      if (cResResult.status === 'fulfilled' && cResResult.value.data.ok) {
        setContacts(cResResult.value.data.data.map((s: any) => ({ id: s.id, phone: s.phone, contactName: s.contactName })));
      }

      if (gResResult.status === 'fulfilled') {
        if (gResResult.value.data.ok) {
          setGroups(gResResult.value.data.data);
        } else {
          setGroupsError(gResResult.value.data.error || 'Error al cargar grupos.');
          setGroups([]);
        }
      } else {
        setGroupsError(gResResult.reason?.response?.data?.error || 'El bot debe estar activo para ver los grupos.');
        setGroups([]);
      }
    } catch (e: any) {
      fire({ title: 'Error', text: e.message, icon: 'error' });
      setSendModal(null);
    } finally {
      setLoadingRecipients(false);
    }
  };

  const closeSend = () => { setSendModal(null); setSending(false); };

  // ── Toggle selection helpers
  const toggleContact = (id: string) => setSelectedContacts(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleGroup = (id: string) => setSelectedGroups(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const totalSelected = selectedContacts.size + selectedGroups.size + (sendToStatus ? 1 : 0);

  const filteredContacts = contacts.filter(c => {
    const q = contactSearch.toLowerCase().trim();
    if (!q) return true;
    const name = (c.contactName || '').toLowerCase();
    const phone = (c.phone || '').toLowerCase();
    return name.includes(q) || phone.includes(q);
  });

  const filteredGroups = groups.filter(g => {
    const q = groupSearch.toLowerCase().trim();
    if (!q) return true;
    return (g.name || '').toLowerCase().includes(q);
  });

  const allFilteredSelected = filteredContacts.length > 0 && filteredContacts.every(c => selectedContacts.has(c.id));

  const toggleAllContacts = () => {
    setSelectedContacts(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredContacts.forEach(c => next.delete(c.id));
      } else {
        filteredContacts.forEach(c => next.add(c.id));
      }
      return next;
    });
  };

  const allFilteredGroupsSelected = filteredGroups.length > 0 && filteredGroups.every(g => selectedGroups.has(g.id));

  const toggleAllGroups = () => {
    setSelectedGroups(prev => {
      const next = new Set(prev);
      if (allFilteredGroupsSelected) {
        filteredGroups.forEach(g => next.delete(g.id));
      } else {
        filteredGroups.forEach(g => next.add(g.id));
      }
      return next;
    });
  };

  // ── Send broadcast
  const sendBroadcast = async () => {
    if (!sendModal || totalSelected === 0) return;
    setSending(true);
    try {
      const headers = await getHeaders();

      let finalSchedule = { ...schedule };
      if (schedule.type === 'once' && schedule.datetime) {
        try {
          finalSchedule.datetime = getUtcStringInTimezone(schedule.datetime, botTimezone);
        } catch (err) {
          console.error("Error ajustando zona horaria:", err);
        }
      }

      const payload = {
        templateId: sendModal.id,
        templateSnapshot: { text: sendModal.text, imageUrl: sendModal.imageUrl || null },
        recipients: {
          contactIds: Array.from(selectedContacts),
          groupIds: Array.from(selectedGroups),
          status: sendToStatus,
        },
        schedule: finalSchedule,
      };
      const res = await axios.post(`${API_URL}/api/saas/bots/${botNumber}/broadcasts`, payload, { headers });
      if (res.data.ok) {
        closeSend();
        loadBroadcasts();
        fire({
          title: schedule.type === 'now' ? '✅ Enviando…' : '📅 Programado',
          text: schedule.type === 'now'
            ? `El mensaje se está enviando a ${totalSelected} destinatario(s).`
            : `Próximo envío: ${res.data.data?.nextRun ? new Date(res.data.data.nextRun).toLocaleString('es') : '—'}`,
          icon: 'success'
        });
      } else {
        fire({ title: 'Error', text: res.data.error, icon: 'error' });
      }
    } catch (e: any) {
      fire({ title: 'Error', text: e.response?.data?.error || e.message, icon: 'error' });
    } finally {
      setSending(false);
    }
  };

  // ── Delete broadcast
  const deleteBroadcast = async (b: BroadcastRecord) => {
    const r = await fire({ title: '¿Eliminar este envío?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Eliminar', cancelButtonText: 'Cancelar' });
    if (!r.isConfirmed) return;
    try {
      const headers = await getHeaders();
      await axios.delete(`${API_URL}/api/saas/bots/${botNumber}/broadcasts/${b.id}`, { headers });
      loadBroadcasts();
    } catch (e: any) {
      fire({ title: 'Error', text: e.message, icon: 'error' });
    }
  };

  // ── Schedule helpers
  const toggleDayOfWeek = (d: number) => setSchedule(s => {
    const days = new Set(s.daysOfWeek ?? []);
    days.has(d) ? days.delete(d) : days.add(d);
    return { ...s, daysOfWeek: Array.from(days) };
  });
  const toggleDayOfMonth = (d: number) => setSchedule(s => {
    const days = new Set(s.daysOfMonth ?? []);
    days.has(d) ? days.delete(d) : days.add(d);
    return { ...s, daysOfMonth: Array.from(days) };
  });

  const canProceedToSchedule = totalSelected > 0;
  const canSend = (() => {
    if (!canProceedToSchedule) return false;
    if (schedule.type === 'now') return true;
    if (schedule.type === 'once') return !!schedule.datetime;
    if (schedule.type === 'weekly') return (schedule.daysOfWeek?.length ?? 0) > 0 && !!schedule.time;
    if (schedule.type === 'monthly') return (schedule.daysOfMonth?.length ?? 0) > 0 && !!schedule.time;
    return false;
  })();

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">

      {/* ── Templates Section ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FileText className="h-5 w-5 text-[#25d366]" />
              Plantillas de Mensaje
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Crea mensajes reutilizables para envíos masivos</p>
          </div>
          {canUseTemplates ? (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 bg-[#25d366]/10 hover:bg-[#25d366]/20 text-[#25d366] border border-[#25d366]/20 px-3 py-2 rounded-xl text-sm font-medium transition-all"
            >
              <Plus className="h-4 w-4" /> Nueva plantilla
            </button>
          ) : (
            <div className="flex items-center gap-2 bg-gray-500/10 border border-gray-500/20 text-gray-500 px-3 py-2 rounded-xl text-sm font-medium cursor-not-allowed" title="Actualiza tu plan para crear plantillas">
              <Plus className="h-4 w-4" />
              <span>Nueva plantilla</span>
              <span className="text-[10px] bg-gray-500/20 px-1.5 py-0.5 rounded-full ml-1">Plan Pro+</span>
            </div>
          )}
        </div>

        {loadingTemplates ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#25d366]" />
          </div>
        ) : templates.length === 0 ? (
          <div className="bg-[#12121a] border border-white/5 border-dashed rounded-2xl p-10 text-center text-gray-500">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No hay plantillas aún</p>
            {canUseTemplates ? (
              <>
                <p className="text-xs mt-1">Crea tu primera plantilla para empezar a enviar mensajes masivos</p>
                <button onClick={openCreate} className="mt-4 text-sm text-[#25d366] hover:underline">
                  Crear plantilla →
                </button>
              </>
            ) : (
              <p className="text-xs mt-1 text-amber-400/70">
                Tu plan actual (Basic) no incluye plantillas. <a href="/saas/subscription" className="underline hover:text-amber-400 font-bold">Actualiza al plan Pro o Premium →</a>
              </p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map(t => (
              <div key={t.id} className="bg-[#12121a] border border-white/5 rounded-2xl p-5 hover:border-white/10 transition-all flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[#25d366]/10 flex items-center justify-center shrink-0">
                      {t.imageUrl ? <Image className="h-4 w-4 text-[#25d366]" /> : <FileText className="h-4 w-4 text-[#25d366]" />}
                    </div>
                    <span className="font-semibold text-white truncate">{t.name}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => openEdit(t)} className="p-1.5 text-gray-500 hover:text-indigo-400 hover:bg-indigo-400/10 rounded-lg transition-colors">
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => deleteTemplate(t)} className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Preview */}
                <div className="flex gap-3">
                  {t.imageUrl && (
                    <img src={t.imageUrl} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0 bg-black/20" onError={e => (e.currentTarget.style.display = 'none')} />
                  )}
                  <p className="text-sm text-gray-400 whitespace-pre-wrap leading-relaxed line-clamp-3 flex-1">{t.text}</p>
                </div>

                <button
                  onClick={() => openSend(t)}
                  className="mt-auto flex items-center justify-center gap-2 w-full bg-[#25d366]/10 hover:bg-[#25d366]/20 text-[#25d366] border border-[#25d366]/20 py-2 rounded-xl text-sm font-medium transition-all"
                >
                  <Send className="h-4 w-4" /> Enviar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Broadcasts Section ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Clock className="h-5 w-5 text-indigo-400" />
              Envíos Programados
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">Historial y envíos recurrentes activos</p>
          </div>
          <button onClick={loadBroadcasts} className="p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
            <RefreshCw className={`h-4 w-4 ${loadingBroadcasts ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loadingBroadcasts ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-400" />
          </div>
        ) : broadcasts.length === 0 ? (
          <div className="bg-[#12121a] border border-white/5 rounded-2xl p-8 text-center text-gray-500 text-sm">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>Aún no hay envíos. Usa el botón <strong className="text-gray-400">Enviar</strong> en una plantilla.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {broadcasts.map(b => (
              <div key={b.id} className="bg-[#12121a] border border-white/5 rounded-xl p-4 flex items-start justify-between gap-4 hover:border-white/10 transition-all">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    {statusBadge(b.status)}
                    <span className="text-xs text-gray-500">{scheduleLabel(b.schedule)}</span>
                  </div>
                  <p className="text-sm text-gray-300 truncate">"{b.templateSnapshot?.text?.slice(0, 80)}{(b.templateSnapshot?.text?.length ?? 0) > 80 ? '…' : ''}"</p>
                  <div className="flex items-center gap-3 text-xs text-gray-600">
                    <span><Users className="h-3 w-3 inline mr-1" />{(b.recipients?.contactIds?.length ?? 0) + (b.recipients?.groupIds?.length ?? 0) + (b.recipients?.status ? 1 : 0)} dest.</span>
                    {b.recipients?.status && <span className="bg-[#25d366]/10 text-[#25d366] px-1.5 py-0.5 rounded text-[10px]">Estado</span>}
                    {b.nextRun && parseDate(b.nextRun) && <span><Clock className="h-3 w-3 inline mr-1" />Próximo: {parseDate(b.nextRun)!.toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}</span>}
                    {b.lastRun && parseDate(b.lastRun) && <span>Último: {parseDate(b.lastRun)!.toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}</span>}
                  </div>
                  {b.errorMessage && <p className="text-xs text-red-400">{b.errorMessage}</p>}
                </div>
                <button onClick={() => deleteBroadcast(b)} className="p-2 text-gray-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors shrink-0">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Template Editor Modal ── */}
      {showEditor && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#12121a] border border-white/10 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white">{editingTemplate ? 'Editar plantilla' : 'Nueva plantilla'}</h3>
              <button onClick={() => setShowEditor(false)} className="p-1.5 text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Nombre de la plantilla</label>
                <input
                  type="text"
                  value={tName}
                  onChange={e => setTName(e.target.value)}
                  placeholder="Ej: Promoción de verano"
                  className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#25d366] focus:ring-1 focus:ring-[#25d366] transition-all"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Mensaje</label>
                  <button
                    type="button"
                    onClick={generateWithAI}
                    disabled={generatingText || !tText.trim()}
                    title={!tText.trim() ? 'Escribe tu mensaje primero para que la IA lo mejore' : 'Mejorar descripción con IA'}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/20 hover:text-violet-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {generatingText ? (
                      <><div className="h-3 w-3 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" /> Generando…</>
                    ) : (
                      <>✨ Generar con IA</>
                    )}
                  </button>
                </div>
                <textarea
                  value={tText}
                  onChange={e => { setTText(e.target.value); setAiPreview(null); }}
                  placeholder="Escribe aquí tu mensaje y luego usa ✨ Generar con IA para mejorarlo…"
                  rows={5}
                  className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#25d366] focus:ring-1 focus:ring-[#25d366] transition-all resize-none"
                />

                {/* AI Preview */}
                {aiPreview && (
                  <div className="mt-3 rounded-xl border border-violet-500/30 bg-violet-500/5 overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-violet-500/20">
                      <span className="text-xs font-semibold text-violet-400 flex items-center gap-1.5">
                        ✨ Sugerencia de la IA — ¿te gusta?
                      </span>
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap px-3 py-3">{aiPreview}</p>
                    <div className="flex gap-2 px-3 pb-3">
                      <button
                        type="button"
                        onClick={acceptAiPreview}
                        className="flex-1 py-2 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 text-xs font-semibold transition-all border border-violet-500/30"
                      >
                        ✅ Usar este texto
                      </button>
                      <button
                        type="button"
                        onClick={discardAiPreview}
                        className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 text-xs font-semibold transition-all border border-white/10"
                      >
                        ✕ Descartar
                      </button>
                    </div>
                  </div>
                )}

                <p className="text-[11px] text-gray-600 mt-1.5">
                  Tip: usa <span className="font-mono text-gray-500">*negrita*</span>,{' '}
                  <span className="font-mono text-gray-500">_cursiva_</span> y emojis — formato nativo WhatsApp 🚀
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">URL de imagen <span className="text-gray-600 normal-case font-normal">(opcional)</span></label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={tImageUrl}
                    onChange={e => setTImageUrl(e.target.value)}
                    placeholder="https://ejemplo.com/imagen.jpg o sube un archivo"
                    className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-white text-sm font-mono focus:outline-none focus:border-[#25d366] focus:ring-1 focus:ring-[#25d366] transition-all"
                  />
                  <label className="cursor-pointer shrink-0 bg-[#25d366]/10 text-[#25d366] px-4 py-3 rounded-xl flex items-center justify-center font-bold text-sm hover:bg-[#25d366]/20 transition-colors">
                    <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={uploadingImage} />
                    {uploadingImage ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  </label>
                </div>
                {tImageUrl && (
                  <div className="mt-2 rounded-xl overflow-hidden border border-white/5 max-h-40 flex items-center justify-center bg-black/20">
                    <img src={tImageUrl} alt="Preview" className="max-h-40 object-contain" onError={e => (e.currentTarget.src = '')} />
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6 justify-end">
              <button onClick={() => setShowEditor(false)} className="px-5 py-2.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors font-medium text-sm">
                Cancelar
              </button>
              <button
                onClick={saveTemplate}
                disabled={!tName.trim() || !tText.trim() || savingTemplate}
                className="flex items-center gap-2 bg-[#25d366] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold px-5 py-2.5 rounded-xl transition-all text-sm"
              >
                {savingTemplate ? <div className="h-4 w-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : null}
                {editingTemplate ? 'Guardar cambios' : 'Crear plantilla'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Send Modal ── */}
      {sendModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#12121a] border border-white/10 rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/5 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#25d366]/10 flex items-center justify-center">
                  <Send className="h-4 w-4 text-[#25d366]" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">{sendModal.name}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <button
                      onClick={() => setSendStep('recipients')}
                      className={`text-xs transition-colors ${sendStep === 'recipients' ? 'text-[#25d366] font-semibold' : 'text-gray-600 hover:text-gray-400'}`}
                    >
                      1. Destinatarios
                    </button>
                    <ChevronRight className="h-3 w-3 text-gray-700" />
                    <button
                      onClick={() => canProceedToSchedule && setSendStep('schedule')}
                      className={`text-xs transition-colors ${sendStep === 'schedule' ? 'text-[#25d366] font-semibold' : 'text-gray-600 hover:text-gray-400'} ${!canProceedToSchedule ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      2. Programar
                    </button>
                  </div>
                </div>
              </div>
              <button onClick={closeSend} className="p-1.5 text-gray-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">

              {/* Step 1: Recipients */}
              {sendStep === 'recipients' && (
                <div className="space-y-4">
                  {/* Message preview */}
                  <div className="bg-[#1a1a28] border border-white/5 rounded-xl p-4 flex gap-3">
                    {sendModal.imageUrl && (
                      <img src={sendModal.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" onError={e => (e.currentTarget.style.display = 'none')} />
                    )}
                    <p className="text-sm text-gray-300 leading-relaxed line-clamp-3">{sendModal.text}</p>
                  </div>

                  {/* Recipient tabs */}
                  <div className="flex gap-1 bg-black/30 rounded-xl p-1">
                    {(['contacts', 'groups', 'status'] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setRecipientTab(tab)}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${recipientTab === tab ? 'bg-[#25d366]/10 text-[#25d366]' : 'text-gray-500 hover:text-white'}`}
                      >
                        {tab === 'contacts' ? <Users className="h-4 w-4" /> : tab === 'groups' ? <span className="text-base">👥</span> : <span className="text-base">📱</span>}
                        {tab === 'contacts' ? `Contactos (${contacts.length})` : tab === 'groups' ? `Grupos (${groups.length})` : `Estados`}
                      </button>
                    ))}
                  </div>

                  {loadingRecipients ? (
                    <div className="flex justify-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#25d366]" />
                    </div>
                  ) : recipientTab === 'contacts' ? (
                    <div className="space-y-3">
                      {contacts.length === 0 ? (
                        <p className="text-center text-gray-600 text-sm py-6">No hay contactos con historial en este bot</p>
                      ) : (
                        <>
                          <div className="relative">
                            <input
                              type="text"
                              placeholder="Buscar contacto por nombre o número..."
                              value={contactSearch}
                              onChange={e => setContactSearch(e.target.value)}
                              className="w-full bg-black/30 border border-white/5 rounded-xl pl-10 pr-4 py-2.5 text-white text-xs placeholder-gray-500 focus:outline-none focus:border-[#25d366] transition-all"
                            />
                            <Search className="absolute left-3.5 top-3 h-4 w-4 text-gray-500" />
                          </div>

                          <button
                            onClick={toggleAllContacts}
                            className="flex items-center gap-2 text-xs text-gray-500 hover:text-white transition-colors"
                          >
                            {allFilteredSelected ? <CheckSquare className="h-4 w-4 text-[#25d366]" /> : <Square className="h-4 w-4" />}
                            {allFilteredSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
                          </button>
                          
                          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 scrollbar-thin">
                            {filteredContacts.length === 0 ? (
                              <p className="text-center text-gray-600 text-xs py-4">No se encontraron contactos</p>
                            ) : (
                              filteredContacts.map(c => (
                                <button
                                  key={c.id}
                                  onClick={() => toggleContact(c.id)}
                                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${selectedContacts.has(c.id) ? 'bg-[#25d366]/10 border border-[#25d366]/20' : 'bg-black/20 border border-white/0 hover:border-white/5'}`}
                                >
                                  {selectedContacts.has(c.id) ? <CheckSquare className="h-4 w-4 text-[#25d366] shrink-0" /> : <Square className="h-4 w-4 text-gray-600 shrink-0" />}
                                  <div className="min-w-0 flex-1">
                                    <div className="text-sm text-white font-medium truncate">{c.contactName || 'Sin alias'}</div>
                                    <div className="text-xs text-gray-500 font-mono">+{c.phone}</div>
                                  </div>
                                </button>
                              ))
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ) : recipientTab === 'groups' ? (
                    <div className="space-y-3">
                      {groupsError ? (
                        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-xs text-yellow-400">{groupsError}</div>
                      ) : groups.length === 0 ? (
                        <p className="text-center text-gray-600 text-sm py-6">No se encontraron grupos</p>
                      ) : (
                        <>
                          <div className="relative">
                            <input
                              type="text"
                              placeholder="Buscar grupo por nombre..."
                              value={groupSearch}
                              onChange={e => setGroupSearch(e.target.value)}
                              className="w-full bg-black/30 border border-white/5 rounded-xl pl-10 pr-4 py-2.5 text-white text-xs placeholder-gray-500 focus:outline-none focus:border-[#25d366] transition-all"
                            />
                            <Search className="absolute left-3.5 top-3 h-4 w-4 text-gray-500" />
                          </div>

                          <button
                            onClick={toggleAllGroups}
                            className="flex items-center gap-2 text-xs text-gray-500 hover:text-white transition-colors"
                          >
                            {allFilteredGroupsSelected ? <CheckSquare className="h-4 w-4 text-[#25d366]" /> : <Square className="h-4 w-4" />}
                            {allFilteredGroupsSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
                          </button>
                          <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 scrollbar-thin">
                            {filteredGroups.length === 0 ? (
                              <p className="text-center text-gray-600 text-xs py-4">No se encontraron grupos</p>
                            ) : (
                              filteredGroups.map(g => (
                                <button
                                  key={g.id}
                                  onClick={() => toggleGroup(g.id)}
                                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${selectedGroups.has(g.id) ? 'bg-[#25d366]/10 border border-[#25d366]/20' : 'bg-black/20 border border-white/0 hover:border-white/5'}`}
                                >
                                  {selectedGroups.has(g.id) ? <CheckSquare className="h-4 w-4 text-[#25d366] shrink-0" /> : <Square className="h-4 w-4 text-gray-600 shrink-0" />}
                                  <div className="min-w-0 flex-1">
                                    <div className="text-sm text-white font-medium truncate">{g.name}</div>
                                    <div className="text-xs text-gray-500">{g.participantCount} participantes</div>
                                  </div>
                                </button>
                              ))
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-4">
                        <div className="flex gap-3">
                          <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                            <span className="text-lg">✨</span>
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-white mb-1">WhatsApp Status</h4>
                            <p className="text-xs text-gray-500 leading-relaxed">
                              Tu mensaje se publicará como una actualización de estado en tu cuenta de WhatsApp. 
                              Tus contactos podrán verlo durante 24 horas.
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => setSendToStatus(!sendToStatus)}
                        className={`w-full flex items-center gap-3 px-4 py-4 rounded-xl text-left transition-all ${sendToStatus ? 'bg-[#25d366]/10 border border-[#25d366]/20' : 'bg-black/20 border border-white/5 hover:border-white/10'}`}
                      >
                        {sendToStatus ? <CheckSquare className="h-5 w-5 text-[#25d366] shrink-0" /> : <Square className="h-5 w-5 text-gray-600 shrink-0" />}
                        <div className="flex-1">
                          <div className="text-sm text-white font-bold">Publicar en mi Estado</div>
                          <div className="text-xs text-gray-500 mt-0.5">Visibilidad: Todos tus contactos</div>
                        </div>
                      </button>
                    </div>
                  )}

                  {totalSelected > 0 && (
                    <div className="bg-[#25d366]/5 border border-[#25d366]/15 rounded-xl px-4 py-2 text-xs text-[#25d366]">
                      {totalSelected} destinatario{totalSelected !== 1 ? 's' : ''} seleccionado{totalSelected !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Schedule */}
              {sendStep === 'schedule' && (
                <div className="space-y-5">
                  {/* Type selector */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {([
                      { type: 'now', icon: Zap, label: 'Ahora' },
                      { type: 'once', icon: Calendar, label: 'Una vez' },
                      { type: 'weekly', icon: Repeat, label: 'Semanal' },
                      { type: 'monthly', icon: Clock, label: 'Mensual' },
                    ] as const).map(({ type, icon: Icon, label }) => (
                      <button
                        key={type}
                        onClick={() => setSchedule({ type })}
                        className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border text-xs font-medium transition-all ${
                          schedule.type === type
                            ? 'bg-[#25d366]/10 border-[#25d366]/30 text-[#25d366]'
                            : 'bg-black/20 border-white/5 text-gray-500 hover:text-white hover:border-white/10'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* Once */}
                  {schedule.type === 'once' && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Fecha y hora</label>
                        <span className="text-xs text-[#25d366] bg-[#25d366]/10 px-2 py-0.5 rounded-md border border-[#25d366]/20">
                          Hora actual: {currentTimeStr}
                        </span>
                      </div>
                      <input
                        type="datetime-local"
                        min={minDateTime}
                        value={schedule.datetime || minDateTime}
                        onChange={e => setSchedule(s => ({ ...s, datetime: e.target.value }))}
                        className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#25d366] focus:ring-1 focus:ring-[#25d366] transition-all"
                      />
                    </div>
                  )}

                  {/* Weekly */}
                  {schedule.type === 'weekly' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Días de la semana</label>
                        <div className="flex gap-2 flex-wrap">
                          {DAY_LABELS.map((label, idx) => (
                            <button
                              key={idx}
                              onClick={() => toggleDayOfWeek(idx)}
                              className={`w-10 h-10 rounded-xl text-xs font-bold transition-all ${
                                (schedule.daysOfWeek ?? []).includes(idx)
                                  ? 'bg-[#25d366] text-black'
                                  : 'bg-black/30 border border-white/5 text-gray-500 hover:text-white'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Hora</label>
                          <span className="text-[10px] text-gray-500">Hora actual: {currentTimeStr.split(' ').pop()}</span>
                        </div>
                        <input
                          type="time"
                          value={schedule.time || ''}
                          onChange={e => setSchedule(s => ({ ...s, time: e.target.value }))}
                          className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#25d366] focus:ring-1 focus:ring-[#25d366] transition-all"
                        />
                      </div>
                    </div>
                  )}

                  {/* Monthly */}
                  {schedule.type === 'monthly' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Días del mes</label>
                        <div className="grid grid-cols-7 gap-1.5">
                          {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                            <button
                              key={d}
                              onClick={() => toggleDayOfMonth(d)}
                              className={`h-8 rounded-lg text-xs font-semibold transition-all ${
                                (schedule.daysOfMonth ?? []).includes(d)
                                  ? 'bg-[#25d366] text-black'
                                  : 'bg-black/30 border border-white/5 text-gray-500 hover:text-white'
                              }`}
                            >
                              {d}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">Hora</label>
                          <span className="text-[10px] text-gray-500">Hora actual: {currentTimeStr.split(' ').pop()}</span>
                        </div>
                        <input
                          type="time"
                          value={schedule.time || ''}
                          onChange={e => setSchedule(s => ({ ...s, time: e.target.value }))}
                          className="w-full bg-black/30 border border-white/5 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#25d366] focus:ring-1 focus:ring-[#25d366] transition-all"
                        />
                      </div>
                    </div>
                  )}

                  {/* Summary */}
                  <div className="bg-[#1a1a28] border border-white/5 rounded-xl px-4 py-3 text-xs text-gray-400 space-y-1">
                    <div><span className="text-gray-600">Destinatarios:</span> {totalSelected} ({selectedContacts.size} contactos, {selectedGroups.size} grupos)</div>
                    <div><span className="text-gray-600">Mensaje:</span> {sendModal.imageUrl ? '📸 Con imagen — ' : ''}{sendModal.text.slice(0, 60)}{sendModal.text.length > 60 ? '…' : ''}</div>
                    <div><span className="text-gray-600">Envío:</span> {scheduleLabel(schedule)}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 pt-4 border-t border-white/5 flex gap-3 justify-between shrink-0">
              {sendStep === 'recipients' ? (
                <>
                  <button onClick={closeSend} className="px-4 py-2.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors text-sm font-medium">Cancelar</button>
                  <button
                    onClick={() => setSendStep('schedule')}
                    disabled={!canProceedToSchedule}
                    className="flex items-center gap-2 bg-[#25d366]/10 hover:bg-[#25d366]/20 text-[#25d366] border border-[#25d366]/20 px-5 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Siguiente <ChevronRight className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setSendStep('recipients')} className="px-4 py-2.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors text-sm font-medium">Atrás</button>
                  <button
                    onClick={sendBroadcast}
                    disabled={!canSend || sending}
                    className="flex items-center gap-2 bg-[#25d366] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold px-5 py-2.5 rounded-xl transition-all text-sm"
                  >
                    {sending ? <div className="h-4 w-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : <Send className="h-4 w-4" />}
                    {schedule.type === 'now' ? 'Enviar ahora' : 'Programar envío'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
