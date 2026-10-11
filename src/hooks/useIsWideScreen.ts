import { useWindowDimensions } from 'react-native';

export const WIDE_BREAKPOINT = 900;

export const useIsWideScreen = () => {
  const { width } = useWindowDimensions();
  return width >= WIDE_BREAKPOINT;
};
