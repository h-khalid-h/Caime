/**
 * The installed web app's manifest (R120), written for whoever installs it, in their language
 * (`siteLanguage`, the site pages' choice): its name and description, the direction its words
 * run, one window that's brought forward rather than opened again (`launch_handler`), shortcuts
 * to the places people go first, a share target that hands what another app shares to `/share`,
 * and the phone apps once a store lists them (`relatedApplications`). The colours are the
 * brand's tokens.
 */
import { palette, themes } from '@caime/brand/tokens';
import { dirOf, type InterfaceLanguage, tr } from '@caime/core/i18n';
import { relatedApplications } from './stores';

export function webManifest(
  language: InterfaceLanguage,
  config: Parameters<typeof relatedApplications>[0],
) {
  const related = relatedApplications(config);
  return {
    id: '/',
    name: 'Caime',
    short_name: 'Caime',
    description: tr('Messaging that understands your relationships.'),
    lang: language,
    dir: dirOf(language),
    start_url: '/',
    scope: '/',
    display: 'standalone',
    launch_handler: { client_mode: ['focus-existing', 'auto'] },
    background_color: themes.light.canvas,
    theme_color: palette.darkPurple,
    categories: ['social', 'productivity', 'business'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: tr('Chats'), url: '/chats', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
      { name: tr('Search'), url: '/search', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
      { name: tr('Actions'), url: '/actions', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
    ],
    share_target: {
      action: '/share',
      method: 'GET',
      params: { title: 'title', text: 'text', url: 'url' },
    },
    ...(related.length
      ? { related_applications: related, prefer_related_applications: false }
      : {}),
  };
}
