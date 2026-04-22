/// <reference types="vite/client" />

declare module 'glass-alert-animation/styles';

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
