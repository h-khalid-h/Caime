/**
 * An organization's door (R53): the link a customer opens to write to it, and a QR code of it
 * for the door, the receipt and the bio. The code is drawn here as one SVG path (every dark
 * module a square), so the app draws it with no library and a browser saves it as a file.
 */
import { toQR } from 'toqr';

export interface QrPath {
  /** Modules per side; the path's coordinates are in modules. */
  size: number;
  /** The dark modules, as an SVG path ("M0 0h1v1h-1z…"). */
  path: string;
}

export function qrPath(content: string): QrPath {
  // Error correction M: a printed code at a door takes a scuff and still reads.
  const modules = toQR(content, 0);
  const size = Math.round(Math.sqrt(modules.length));
  let path = '';
  for (let y = 0; y < size; y++) {
    // Runs of dark modules on a row are one rectangle: a smaller path.
    let x = 0;
    while (x < size) {
      if (!modules[y * size + x]) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < size && modules[y * size + x + run]) run++;
      path += `M${x} ${y}h${run}v1h-${run}z`;
      x += run;
    }
  }
  return { size, path };
}

/** The code as a standalone SVG file, with a quiet zone of four modules, dark on white. */
export function qrSvg(qr: QrPath, scale = 8): string {
  const quiet = 4;
  const side = (qr.size + quiet * 2) * scale;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="${-quiet} ${-quiet} ${qr.size + quiet * 2} ${qr.size + quiet * 2}" shape-rendering="crispEdges">` +
    `<rect x="${-quiet}" y="${-quiet}" width="${qr.size + quiet * 2}" height="${qr.size + quiet * 2}" fill="#fff"/>` +
    `<path d="${qr.path}" fill="#000"/></svg>`
  );
}
