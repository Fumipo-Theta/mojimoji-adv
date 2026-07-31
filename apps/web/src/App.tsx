import { useEffect, useMemo } from 'react';
import { DisplayScreen } from './screens/DisplayScreen.js';
import { ScannerScreen } from './screens/ScannerScreen.js';
import { createBus, readSessionConfig } from './session.js';

export function App() {
  const config = useMemo(() => readSessionConfig(), []);
  const bus = useMemo(() => createBus(config), [config]);

  useEffect(() => () => bus.close(), [bus]);

  if (config.role === 'scanner') {
    return <ScannerScreen bus={bus} room={config.room} recognizerId={config.recognizerId} />;
  }
  return (
    <DisplayScreen
      bus={bus}
      room={config.room}
      solo={config.role === 'solo'}
      recognizerId={config.recognizerId}
    />
  );
}
