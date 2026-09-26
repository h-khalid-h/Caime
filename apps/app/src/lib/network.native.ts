import NetInfo from '@react-native-community/netinfo';

/** Whether the device is online, and when that changes (the web version is network.ts). */
export function onNetworkChange(listener: (online: boolean) => void): () => void {
  return NetInfo.addEventListener((s) => listener(s.isConnected !== false));
}
