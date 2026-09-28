import { Platform } from 'react-native';

/** A name for this phone's device in Settings: what it is, as the phone says. */
export function deviceName(): string {
  if (Platform.OS === 'ios') {
    const idiom = (Platform.constants as { interfaceIdiom?: string }).interfaceIdiom;
    return idiom === 'pad' ? 'Caime on iPad' : 'Caime on iPhone';
  }
  if (Platform.OS === 'android') {
    const model = (Platform.constants as { Model?: string }).Model?.trim();
    return model ? `Caime on ${model}` : 'Caime on Android';
  }
  return 'This device';
}
