import { HEART_PATH, ICON_MARK, WORDMARK } from '@caime/brand/generated/wordmark';
import { palette } from '@caime/brand/tokens';
import { tr } from '@caime/core/i18n';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';
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
      accessibilityLabel={tr('Caime')}
    >
      <Path d={WORDMARK.letters} fill={color ?? (t.scheme === 'dark' ? '#FFFFFF' : t.c.ink)} />
      <Path d={HEART_PATH} transform={WORDMARK.heartTransform} fill={heartColor} />
    </Svg>
  );
}

/** The icon mark, the heart with a face: the same drawing as the favicon and the web app icon. */
export function IconMark({ size = 20 }: { size?: number }) {
  const m = ICON_MARK;
  return (
    <Svg width={size} height={size} viewBox={m.viewBox} accessible={false}>
      <Path d={HEART_PATH} transform={m.heartTransform} fill={palette.caimePink} />
      {m.eyes.map((e) => (
        <Ellipse key={`e${e.cx}`} cx={e.cx} cy={e.cy} rx={e.rx} ry={e.ry} fill="#FFFFFF" />
      ))}
      {m.glints.map((g) => (
        <Circle key={`g${g.cx}`} cx={g.cx} cy={g.cy} r={g.r} fill="#FFFFFF" />
      ))}
      <Path
        d={m.smile}
        stroke="#FFFFFF"
        strokeWidth={m.smileWidth}
        fill="none"
        strokeLinecap="round"
      />
      {m.cheeks.map((c) => (
        <Ellipse
          key={`c${c.cx}`}
          cx={c.cx}
          cy={c.cy}
          rx={c.rx}
          ry={c.ry}
          fill="#FFFFFF"
          opacity={m.cheekOpacity}
        />
      ))}
    </Svg>
  );
}
