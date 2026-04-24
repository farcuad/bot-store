import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useGlassAlert } from 'glass-alert-animation';

const AdminPlans: React.FC = () => {
  const { user } = useAuth();
  const { fire } = useGlassAlert();
  const [jsonVal, setJsonVal] = useState('[]');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/plans').then(r => r.json()).then(d => {
      if(d.ok) setJsonVal(JSON.stringify(d.plans, null, 2));
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    try {
      const parsed = JSON.parse(jsonVal);
      const t = await user?.getIdToken();
      const res = await fetch('/api/plans', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${t}` },
        body: JSON.stringify({ plans: parsed })
      });
      const data = await res.json();
      if(data.ok) fire({ title: 'Éxito', text: 'Planes actualizados', icon: 'success' });
      else fire({ title: 'Error', text: data.error, icon: 'error' });
    } catch(e: any) {
      fire({ title: 'Error', text: 'JSON inválido', icon: 'error' });
    }
  }

  if(loading) return <div className="text-gray-500 text-center py-20">Cargando planes...</div>;

  return (
    <div className="bg-[#12121a] p-6 rounded-2xl border border-white/10">
      <h2 className="text-xl font-bold mb-4 text-white">Administrador de Planes</h2>
      <p className="text-sm text-gray-400 mb-4">
        Edita la estructura JSON de los planes que se muestran en la Landing Page y en la Suscripción.
      </p>
      <textarea 
        className="w-full h-96 bg-[#0a0a12] text-sm font-mono text-[#25d366] p-4 rounded-xl border border-white/10 outline-none focus:border-[#25d366] transition-colors"
        value={jsonVal}
        onChange={e => setJsonVal(e.target.value)}
      />
      <div className="mt-4 flex justify-end">
        <button onClick={handleSave} className="bg-[#25d366] hover:bg-[#20c55d] text-black px-6 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-[#25d366]/20">
          Guardar Cambios
        </button>
      </div>
    </div>
  )
}

export default AdminPlans;
