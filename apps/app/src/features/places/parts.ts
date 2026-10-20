/**
 * The places parts (R92), one chunk: the editor, the chips that fill a card, a meeting's or an
 * appointment's Where (M16 F6) and the facts on a profile. Every screen takes them through
 * `lazyPart` from here, so `@caime/core/places` loads once, with the first of them, and never
 * with the app's start.
 */
export { PlaceChips } from './PlaceChips';
export { PlacesSetup } from './PlacesSetup';
export { PlacesSpec } from './PlacesSpec';
export { WherePicker } from './WherePicker';
