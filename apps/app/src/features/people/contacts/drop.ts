/**
 * A contacts file dropped on the sheet, on a desktop's browser (R89): the drop is read here like
 * a picked file. Phones have nothing to drop (drop.native.ts).
 */
import { type RefObject, useEffect, useState } from 'react';
import type { View } from 'react-native';

export function useFileDrop(
  target: RefObject<View | null>,
  onFile: (name: string, text: string) => void,
  enabled: boolean,
): boolean {
  const [over, setOver] = useState(false);
  useEffect(() => {
    const node = target.current as unknown as HTMLElement | null;
    if (!enabled || !node?.addEventListener) return;
    const carriesFiles = (e: DragEvent) => Boolean(e.dataTransfer?.types.includes('Files'));
    const enter = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      setOver(true);
    };
    const leave = (e: DragEvent) => {
      if (!node.contains(e.relatedTarget as Node | null)) setOver(false);
    };
    const drop = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      setOver(false);
      const file = e.dataTransfer?.files[0];
      if (file) void file.text().then((text) => onFile(file.name, text));
    };
    node.addEventListener('dragenter', enter);
    node.addEventListener('dragover', enter);
    node.addEventListener('dragleave', leave);
    node.addEventListener('drop', drop);
    return () => {
      node.removeEventListener('dragenter', enter);
      node.removeEventListener('dragover', enter);
      node.removeEventListener('dragleave', leave);
      node.removeEventListener('drop', drop);
    };
  }, [target, onFile, enabled]);
  return over;
}
