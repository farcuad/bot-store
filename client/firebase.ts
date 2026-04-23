import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

let firebaseApp: any = null;

export async function initFirebase(): Promise<any> {
  if (getApps().length > 0) {
    firebaseApp = getApp();
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
    return getAuth(firebaseApp);
  } catch (error) {
    console.error("Error initializing Firebase:", error);
    return null;
  }
}

export function getAppStorage() {
  if (!firebaseApp) return null;
  return getStorage(firebaseApp);
}
