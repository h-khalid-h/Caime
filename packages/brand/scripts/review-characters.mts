import sharp from 'sharp';
import { CHARACTERS, characterSvg, EXPRESSIONS } from '../src/characters.ts';

const cells: string[] = [];
const size = 200;
for (const [i, c] of CHARACTERS.entries()) {
  cells.push(
    `<g transform="translate(${i * size} 0)">${characterSvg(c, { accents: true }).replace('<svg', `<svg width="${size}" height="${size}"`)}</g>`,
  );
}
for (const [i, e] of EXPRESSIONS.entries()) {
  cells.push(
    `<g transform="translate(${i * size} ${size + 20})">${characterSvg('caishy', { expression: e, accents: true }).replace('<svg', `<svg width="${size}" height="${size}"`)}</g>`,
  );
}
const w = Math.max(CHARACTERS.length, EXPRESSIONS.length) * size;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${2 * size + 20}"><rect width="100%" height="100%" fill="#FAF8FC"/>${cells.join('')}</svg>`;
await sharp(Buffer.from(svg)).png().toFile(process.argv[2]);
console.log('rendered');
