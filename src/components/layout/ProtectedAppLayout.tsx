import AppShell from './AppShell';
import { SocketProvider } from '../../contexts/SocketContext';

export default function ProtectedAppLayout() {
  return (
    <SocketProvider>
      <AppShell />
    </SocketProvider>
  );
}
