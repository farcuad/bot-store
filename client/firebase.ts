import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getFirestore } from 'firebase/firestore';

let firebaseApp: any = null;
export let db: any = null;
let _storageBucket: string | null = null;

export async function initFirebase(): Promise<any> {
  if (getApps().length > 0) {
    firebaseApp = getApp();
    db = getFirestore(firebaseApp);
    return getAuth(firebaseApp);
  }

  try {
    const res = await fetch('/api/firebase-config');
    const cfg = await res.json();
    if (!cfg.apiKey) {
      console.warn("Firebase config not found.");
      return null;
    }
    
    firebaseApp = initializeApp(cfg);
    db = getFirestore(firebaseApp);
    // Guardar el bucket para usarlo explícitamente en getAppStorage()
    _storageBucket = cfg.storageBucket || null;
    return getAuth(firebaseApp);
  } catch (error) {
    console.error("Error initializing Firebase:", error);
    return null;
  }
}

export function getAppStorage() {
  if (!firebaseApp) return null;
  // Pasar el bucket explícitamente para evitar que Firebase use el bucket
  // por defecto del proyecto (whaibot) cuando el env no está configurado.
  if (_storageBucket) {
    return getStorage(firebaseApp, `gs://${_storageBucket}`);
  }
  return getStorage(firebaseApp);
}
