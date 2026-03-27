import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { initFirebase } from '../firebase';

interface AuthContextType {
  user: User | null;
  dbUser: any | null;
  loading: boolean;
  status: string | null;
  isAdmin: boolean;
  checkUserStatus: (user: User) => Promise<any>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  dbUser: null,
  loading: true,
  status: null,
  isAdmin: false,
  checkUserStatus: async () => ({}),
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [dbUser, setDbUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [authInstance, setAuthInstance] = useState<any>(null);

  useEffect(() => {
    initFirebase().then((auth) => {
      if (!auth) {
        setLoading(false);
        return;
      }
      setAuthInstance(auth);
      
      const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        if (currentUser) {
          setUser(currentUser);
          await checkUserStatus(currentUser);
        } else {
          setUser(null);
          setDbUser(null);
          setStatus(null);
        }
        setLoading(false);
      });
      return () => unsubscribe();
    });
  }, []);

  const checkUserStatus = async (currentUser: User) => {
    try {
      const idToken = await currentUser.getIdToken();
      const r = await fetch('/api/auth/firebase-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      const data = await r.json();
      if (data.ok) {
        setStatus(data.status); // 'approved', 'pending', 'rejected'
        setDbUser(data.profile || data.user);
        return data;
      } else {
        setStatus(null);
        setDbUser(null);
        return { ok: false };
      }
    } catch (e) {
      console.error(e);
      setStatus(null);
      return { ok: false };
    }
  };

  const logout = async () => {
    if (authInstance) {
      await firebaseSignOut(authInstance);
    }
    localStorage.removeItem('saas_token');
    setUser(null);
    setDbUser(null);
    setStatus(null);
  };

  const isAdmin = dbUser?.role === 'admin';

  return (
    <AuthContext.Provider value={{ user, dbUser, loading, status, isAdmin, checkUserStatus, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
