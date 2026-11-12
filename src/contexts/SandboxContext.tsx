'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SANDBOX_COOKIE } from '@/lib/sandboxContext';

interface SandboxContextType {
  isSandbox: boolean;
  enterSandbox: () => void;
  exitSandbox: () => void;
}

const SandboxContext = createContext<SandboxContextType>({
  isSandbox: false,
  enterSandbox: () => {},
  exitSandbox: () => {},
});

export function SandboxProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isSandbox, setIsSandbox] = useState(false);

  useEffect(() => {
    const hasCookie = document.cookie.split(';').some(c => c.trim() === `${SANDBOX_COOKIE}=1`);
    const timer = window.setTimeout(() => setIsSandbox(hasCookie), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const enterSandbox = () => {
    document.cookie = `${SANDBOX_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 7}`;
    setIsSandbox(true);
    router.push('/picks');
    router.refresh();
  };

  const exitSandbox = () => {
    document.cookie = `${SANDBOX_COOKIE}=; path=/; max-age=0`;
    setIsSandbox(false);
    router.push('/admin/sandbox');
    router.refresh();
  };

  return (
    <SandboxContext.Provider value={{ isSandbox, enterSandbox, exitSandbox }}>
      {children}
    </SandboxContext.Provider>
  );
}

export const useSandbox = () => useContext(SandboxContext);
