import { Platform } from 'react-native';

/**
 * Whether a plan is bought here (R120): on the web, and in the desktop app, which is the web. A
 * phone app is the free companion of a paid web service (App Store 3.1.3(f), Google Play's
 * consumption-only apps), so it sells nothing and points nowhere to buy: no price, no Get button,
 * no link to the plans, no billing portal. It still says which plan someone is on and what that
 * includes. An organization's checkout for its own goods and services (R65) is not a plan and
 * stays.
 */
export const sellsHere = Platform.OS === 'web';
