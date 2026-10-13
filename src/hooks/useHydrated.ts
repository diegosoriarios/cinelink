import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export const useHydrated = (): boolean =>
  useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
