import React from 'react';

interface LoadingScreenProps {
  message?: string;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ message = 'Cargando...' }) => {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-6 w-full animate-in fade-in duration-700">
      <div className="relative">
        {/* Glowing background effect */}
        <div className="absolute inset-0 bg-[#25d366]/20 blur-2xl rounded-full animate-pulse scale-150" />
        
        {/* Bot Logo with custom animation */}
        <div className="relative animate-bounce">
           <img 
            src="/whaibot.png" 
            alt="Whaibot Logo" 
            className="h-20 w-20 object-contain drop-shadow-[0_0_15px_rgba(37,211,102,0.5)]" 
            onError={(e) => {
              // Fallback if image doesn't exist
              e.currentTarget.src = 'https://www.svgrepo.com/show/447201/bot.svg';
            }}
          />
        </div>
      </div>
      
      <div className="flex flex-col items-center gap-2">
        <h3 className="text-white font-bold text-lg tracking-tight animate-pulse">
          Whaibot
        </h3>
        <p className="text-gray-500 text-sm font-medium animate-pulse">
          {message}
        </p>
      </div>

      {/* Modern progress bar indicator */}
      <div className="w-48 h-1 bg-white/5 rounded-full overflow-hidden">
        <div className="h-full bg-linear-to-r from-[#25d366] to-[#128c7e] w-1/2 rounded-full animate-[loading-bar_1.5s_ease-in-out_infinite]" />
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes loading-bar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}} />
    </div>
  );
};

export default LoadingScreen;
