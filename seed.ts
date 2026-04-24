import { db } from './src/config/firebase';
const defaultPricingPlans = [
  {
    name: 'Basic',
    price: '$15',
    description: 'Ideal para pequeños negocios que están empezando.',
    features: [
      'Respuestas 24/7 con IA',
      'Base de conocimiento ilimitada',
      'Configuración en 5 minutos',
      '1 Bot activo',
    ],
    color: 'from-blue-500/20 to-indigo-500/10 border-blue-500/20 text-blue-400',
    buttonColor: 'bg-white/5 hover:bg-white/10 text-white border-white/10',
  },
  {
    name: 'Pro',
    price: '$29',
    popular: true,
    description: 'Para empresas que necesitan automatización avanzada.',
    features: [
      'Todo lo del plan Basic',
      'API de comunicación (REST)',
      'Responde audios',
      'Integraciones con sistemas',
    ],
    color: 'from-[#25d366]/20 to-teal-500/10 border-[#25d366]/40 text-[#25d366]',
    buttonColor: 'bg-[#25d366] hover:bg-[#20c55d] text-black',
  },
  {
    name: 'Premium',
    price: '$39',
    description: 'La solución completa para agencias y grandes equipos.',
    features: [
      'Todo lo del plan Pro',
      'Múltiples bots (Multi-número)',
      'Gestión de equipos',
      'Soporte prioritario 1-a-1',
    ],
    color: 'from-violet-500/20 to-purple-500/10 border-violet-500/20 text-violet-400',
    buttonColor: 'bg-white/5 hover:bg-white/10 text-white border-white/10',
  },
];
db.doc('platform/plans').set({ plans: defaultPricingPlans }).then(() => {
  console.log('Plans seeded successfully!');
  process.exit(0);
}).catch(console.error);
