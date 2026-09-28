import { HEART_PATH, WORDMARK } from '@caime/brand/generated/wordmark';
import { palette } from '@caime/brand/tokens';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/theme/theme';

/** The Caime wordmark: Nunito Black letters, the heart as the dot of the i. */
export function Wordmark({
  height = 32,
  color,
  heartColor = palette.caimePink,
}: {
  height?: number;
  color?: string;
  heartColor?: string;
}) {
  const t = useTheme();
  const width = (WORDMARK.width / WORDMARK.height) * height;
  return (
    <Svg
      width={width}
      height={height}
      viewBox={WORDMARK.viewBox}
      accessibilityRole="image"
      accessibilityLabel="Caime"
    >
      <Path d={WORDMARK.letters} fill={color ?? (t.scheme === 'dark' ? '#FFFFFF' : t.c.ink)} />
      <Path d={HEART_PATH} transform={WORDMARK.heartTransform} fill={heartColor} />
    </Svg>
  );
}

export function HeartMark({
  size = 20,
  color = palette.caimePink,
}: {
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Path d={HEART_PATH} fill={color} />
    </Svg>
  );
}
