import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};
const getClientSnapshot = () => new Date().toISOString().slice(0, 10);
const getServerSnapshot = () => null;

export const useTodayISO = (): string | null =>
  useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
