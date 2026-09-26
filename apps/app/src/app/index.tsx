import { themes } from '@caishy/brand';
import { SPHERE_DEFS } from '@caishy/core';
import { Text, View } from 'react-native';

export default function Index() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: themes.light.canvas,
      }}
    >
      <Text style={{ color: themes.light.ink }}>Caishy · {SPHERE_DEFS.family.label}</Text>
    </View>
  );
}
