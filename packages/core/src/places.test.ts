import { describe, expect, it } from 'vitest';
import {
  mapsUrl,
  orgPlaceVisible,
  type PlaceParts,
  placeAudienceFor,
  placeLine,
  placeVisible,
} from './places';
import type { Audience, Viewer } from './privacy';

const stranger: Viewer = {
  isSelf: false,
  isConnected: false,
  blocked: false,
  ownerSpheresForViewer: [],
};
const friend: Viewer = { ...stranger, isConnected: true, ownerSpheresForViewer: ['friend'] };
const family: Viewer = { ...stranger, isConnected: true, ownerSpheresForViewer: ['family'] };

describe('places (R92)', () => {
  it('shows a person’s place to whom it’s for, never when limited or blocked', () => {
    const friends: Audience = { kind: 'spheres', spheres: ['friend'] };
    expect(placeVisible(friends, friend)).toBe(true);
    expect(placeVisible(friends, family)).toBe(false);
    expect(placeVisible(friends, stranger)).toBe(false);
    expect(placeVisible({ kind: 'everyone' }, stranger)).toBe(true);
    expect(placeVisible({ kind: 'everyone' }, { ...friend, preset: 'limited' })).toBe(false);
    expect(placeVisible({ kind: 'everyone' }, { ...friend, blocked: true })).toBe(false);
    expect(placeVisible({ kind: 'nobody' }, { ...stranger, isSelf: true })).toBe(true);
  });

  it('under 18, never beyond family (R29)', () => {
    expect(placeAudienceFor({ kind: 'everyone' }, true)).toEqual({
      kind: 'spheres',
      spheres: ['family'],
    });
    expect(placeAudienceFor({ kind: 'connections' }, true)).toEqual({
      kind: 'spheres',
      spheres: ['family'],
    });
    expect(placeAudienceFor({ kind: 'spheres', spheres: ['family', 'friend'] }, true)).toEqual({
      kind: 'spheres',
      spheres: ['family'],
    });
    expect(placeAudienceFor({ kind: 'nobody' }, true)).toEqual({ kind: 'nobody' });
    expect(placeAudienceFor({ kind: 'everyone' }, false)).toEqual({ kind: 'everyone' });
  });

  it('shows an organization’s place to anyone, its customers or its team', () => {
    const visitor = { team: false, customer: false };
    const customer = { team: false, customer: true };
    const team = { team: true, customer: false };
    expect(orgPlaceVisible('everyone', visitor)).toBe(true);
    expect(orgPlaceVisible('customers', visitor)).toBe(false);
    expect(orgPlaceVisible('customers', customer)).toBe(true);
    expect(orgPlaceVisible('team', customer)).toBe(false);
    expect(orgPlaceVisible('team', team)).toBe(true);
  });

  it('writes an address as one line, most particular first, the country by name', () => {
    const p: PlaceParts = {
      country: 'EG',
      city: 'Cairo',
      area: 'Maadi',
      street: '9 Road 233',
      building: 'Building 12',
      floor: '3',
      unit: '7',
      postalCode: '11728',
      directions: 'The green gate',
    };
    expect(placeLine(p, (c) => (c === 'EG' ? 'Egypt' : c))).toBe(
      'Unit 7, Floor 3, Building 12, 9 Road 233, Maadi, Cairo 11728, Egypt',
    );
    expect(
      placeLine({ ...p, city: ' ', area: null, floor: null, unit: null, postalCode: null }),
    ).toBe('Building 12, 9 Road 233, EG');
    expect(mapsUrl({ lat: 29.96, lng: 31.25 })).toBe(
      'https://www.openstreetmap.org/?mlat=29.960000&mlon=31.250000#map=17/29.960000/31.250000',
    );
  });
});
