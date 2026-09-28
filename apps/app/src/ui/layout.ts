import { breakpoints } from '@caime/brand/tokens';
import { useWindowDimensions } from 'react-native';

export interface Layout {
  width: number;
  height: number;
  /** Below 768: one column, bottom tabs. */
  phone: boolean;
  /** 1024 and up: sidebar, list and detail side by side. */
  desktop: boolean;
  /** 1280 and up: room for the context panel next to a conversation. */
  wide: boolean;
}

export function useLayout(): Layout {
  const { width, height } = useWindowDimensions();
  return {
    width,
    height,
    phone: width < breakpoints.tablet,
    desktop: width >= breakpoints.desktop,
    wide: width >= breakpoints.wide,
  };
}
