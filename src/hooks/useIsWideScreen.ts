import { useWindowDimensions } from 'react-native';
import { useHydrated } from './useHydrated';

export const WIDE_BREAKPOINT = 900;

export const useIsWideScreen = () => {
  const { width } = useWindowDimensions();
  const hydrated = useHydrated();
  return hydrated && width >= WIDE_BREAKPOINT;
};
