import { themes } from '@caime/brand/tokens';
import { tr } from '@caime/core/i18n';
import { Image } from 'expo-image';
import Download from 'lucide-react-native/icons/download';
import ShareIcon from 'lucide-react-native/icons/share';
import X from 'lucide-react-native/icons/x';
import { useEffect, useId, useRef, useState } from 'react';
import { Modal, Platform, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mediaHeaders, mediaUrl } from '@/api/client';
import { useRtl } from '@/lib/direction';
import { useReduceMotion } from '@/lib/motion';
import { openFile } from '@/lib/openFile';
import { Direction } from '@/ui/Direction';
import { Chevron, ChevronBack } from '@/ui/directional';
import { IconButton } from '@/ui/IconButton';
import { Text } from '@/ui/Text';
import { ToastHost, toast, useToastLayers } from '@/ui/Toast';
import { closePhotos, usePhotoViewer } from './viewer';

/** Dark whatever the scheme, as a photo is looked at everywhere; its words and buttons light. */
const INK = themes.dark.canvas;
const LIGHT = themes.dark.text;
/** How far a finger moves sideways before it's a swipe to the next one, not a tap. */
const SWIPE = 48;

/**
 * A message's photos (or an album's), full screen and inside Caime (R88): drawn from the
 * preview at once and the cleaned original as it arrives, with the session a phone's browser
 * wouldn't have. One at a time: a swipe, the arrows or the keyboard's arrow keys go to the next
 * (the other way round in a layout that runs right to left), a pinch zooms on an iPhone, and
 * Escape, Android's back or the close button puts it away. Saved through the browser on the
 * web, through the system's sheet on a phone.
 */
export function PhotoViewer({ host }: { host: string }) {
  const { files, index, host: shownIn } = usePhotoViewer();
  const open = files.length > 0 && shownIn === host;
  const f = files[index];
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const rtl = useRtl();
  const reduceMotion = useReduceMotion();
  const [zoomed, setZoomed] = useState(false);
  // What's said while it's open (a save that failed) is said over it, not on the screen beneath.
  const layer = useId();
  useEffect(() => {
    if (!open) return;
    const { enter, leave } = useToastLayers.getState();
    enter(layer);
    return () => leave(layer);
  }, [open, layer]);
  const go = (step: number) => {
    const next = index + step;
    if (next < 0 || next >= files.length) return;
    setZoomed(false);
    usePhotoViewer.setState({ index: next });
  };
  // On the web the keyboard moves and closes it, as Android's back closes it.
  useEffect(() => {
    if (!open || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePhotos();
      else if (e.key === 'ArrowRight') go(rtl ? -1 : 1);
      else if (e.key === 'ArrowLeft') go(rtl ? 1 : -1);
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });
  const start = useRef<number | null>(null);
  if (!f || !open) return null;
  const many = files.length > 1;
  const save = () =>
    void openFile(f, { save: true }).catch((e: Error) => toast(e.message, { tone: 'danger' }));
  const headers = mediaHeaders();
  const picture = (
    <Image
      source={{ uri: mediaUrl(f.url) ?? undefined, headers }}
      placeholder={f.previewUrl ? { uri: mediaUrl(f.previewUrl) ?? undefined, headers } : null}
      placeholderContentFit="contain"
      contentFit="contain"
      transition={reduceMotion ? 0 : 120}
      accessibilityLabel={f.name}
      accessible
      accessibilityRole="image"
      style={{ width: window.width, height: window.height - insets.top - insets.bottom - 112 }}
      testID="photo-viewer-image"
    />
  );
  return (
    <Modal
      visible={open}
      animationType={reduceMotion ? 'none' : 'fade'}
      onRequestClose={closePhotos}
      statusBarTranslucent
    >
      <Direction>
        <View
          accessibilityViewIsModal
          style={{ flex: 1, backgroundColor: INK, paddingTop: insets.top }}
          testID="photo-viewer"
        >
          <View
            style={{
              height: 56,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 6,
              gap: 4,
            }}
          >
            <IconButton icon={X} label={tr('Close')} color={LIGHT} onPress={closePhotos} />
            <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
              <Text variant="label" numberOfLines={1} style={{ color: LIGHT }} auto>
                {f.name}
              </Text>
              {many ? (
                <Text
                  variant="caption"
                  style={{ color: themes.dark.textSecondary }}
                  testID="photo-viewer-count"
                >
                  {tr('{done} of {length}', { done: index + 1, length: files.length })}
                </Text>
              ) : null}
            </View>
            <IconButton
              icon={Platform.OS === 'web' ? Download : ShareIcon}
              label={Platform.OS === 'web' ? tr('Download') : tr('Share')}
              color={LIGHT}
              onPress={save}
              testID="photo-viewer-save"
            />
          </View>
          <View
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
            // A sideways swipe goes to the next or the previous, unless they're zoomed in.
            onTouchStart={(e) => {
              start.current = e.nativeEvent.touches.length === 1 ? e.nativeEvent.pageX : null;
            }}
            onTouchEnd={(e) => {
              if (start.current === null || zoomed) return;
              const moved = e.nativeEvent.pageX - start.current;
              start.current = null;
              if (Math.abs(moved) < SWIPE) return;
              // A finger moving towards the start of the line brings the next one.
              go(moved < 0 !== rtl ? 1 : -1);
            }}
          >
            {Platform.OS === 'ios' ? (
              <ScrollView
                key={f.id}
                maximumZoomScale={4}
                minimumZoomScale={1}
                centerContent
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                onScroll={(e) => setZoomed(e.nativeEvent.zoomScale > 1.01)}
                scrollEventThrottle={64}
              >
                {picture}
              </ScrollView>
            ) : (
              picture
            )}
            {many ? (
              <>
                <IconButton
                  icon={ChevronBack}
                  label={tr('Previous')}
                  color={LIGHT}
                  size={28}
                  disabled={index === 0}
                  onPress={() => go(-1)}
                  style={{ position: 'absolute', start: 8 }}
                  testID="photo-viewer-previous"
                />
                <IconButton
                  icon={Chevron}
                  label={tr('Next')}
                  color={LIGHT}
                  size={28}
                  disabled={index === files.length - 1}
                  onPress={() => go(1)}
                  style={{ position: 'absolute', end: 8 }}
                  testID="photo-viewer-next"
                />
              </>
            ) : null}
          </View>
          <View style={{ height: 56 + insets.bottom }} />
        </View>
        <ToastHost layer={layer} />
      </Direction>
    </Modal>
  );
}
