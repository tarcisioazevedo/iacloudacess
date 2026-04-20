import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  lastEvent: any | null;
}

const SocketContext = createContext<SocketContextType>({ socket: null, isConnected: false, lastEvent: null });

export function useSocket() {
  return useContext(SocketContext);
}

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { token, profile } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<any>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!token || !profile) return;

    const s = io(window.location.origin, {
      auth: { token },
      query: { schoolId: profile.schoolId || '' },
      transports: ['websocket', 'polling'],
    });

    s.on('connect', () => setIsConnected(true));
    s.on('disconnect', () => setIsConnected(false));
    s.on('access:new', (data) => setLastEvent(data));

    socketRef.current = s;

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [token, profile]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, isConnected, lastEvent }}>
      {children}
    </SocketContext.Provider>
  );
}
