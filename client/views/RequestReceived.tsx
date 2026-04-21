import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Clock, ArrowLeft } from 'lucide-react';

const RequestReceived: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#080810] flex flex-col items-center justify-center p-6 text-white overflow-hidden relative">
      {/* Background decoration */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#25d366]/5 rounded-full blur-[120px] -z-10" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-violet-600/5 rounded-full blur-[120px] -z-10" />

      <div className="w-full max-w-lg bg-[#12121a]/80 backdrop-blur-xl border border-white/5 rounded-3xl p-10 shadow-2xl text-center relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-24 bg-[#25d366]/10 rounded-full blur-[60px]" />
        
        <div className="relative z-10">
          <div className="w-20 h-20 bg-[#25d366]/15 border border-[#25d366]/30 rounded-2xl flex items-center justify-center mx-auto mb-8 animate-bounce-slow">
            <CheckCircle className="w-10 h-10 text-[#25d366]" />
          </div>

          <h1 className="text-3xl font-bold mb-4 bg-clip-text text-transparent bg-linear-to-r from-white to-gray-400">
            ¡Solicitud Recibida!
          </h1>
          
          <p className="text-gray-400 text-lg mb-8 leading-relaxed">
            Hemos recibido tu solicitud de acceso correctamente. Nuestro equipo revisará tus datos y te contactará por WhatsApp para activar tu cuenta.
          </p>

          <div className="flex items-center gap-3 justify-center mb-10 text-sm font-medium text-[#25d366] bg-[#25d366]/10 py-3 px-6 rounded-2xl border border-[#25d366]/20">
            <Clock className="w-4 h-4" />
            Tiempo estimado de respuesta: &lt; 24h
          </div>

          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 text-slate-400 hover:text-white font-semibold text-base transition-all duration-200 group"
          >
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            Volver al inicio
          </button>
        </div>
      </div>

      <div className="mt-8 text-slate-600 text-sm">
        ¿Tienes dudas? <a href="https://wa.me/584127575904" className="text-[#25d366] hover:underline">Contáctanos por WhatsApp</a>
      </div>
    </div>
  );
};

export default RequestReceived;
