/**
 * Emergency numbers shown on the Power Safety screen.
 *
 * **Display only. Nothing here is wired to a dialler.** No `tel:` link, no
 * `Linking.openURL`, no press handler - the numbers are rendered as text and
 * nothing else. That is deliberate: a mis-tap that calls the fire service is
 * worse than making someone type eleven digits, and this screen is reached by
 * people scrolling through settings, not only by people in trouble.
 *
 * The numbers are selectable so they can be copied.
 *
 * `911` is the Philippines' national emergency hotline and is correct for any
 * user anywhere in the country. The BFP entry is local to this deployment - if
 * a Hub is ever installed outside Minalin, change it here and nowhere else.
 * This file is copied verbatim between the app and web repos; keep them
 * identical.
 */

export const EMERGENCY_CONTACTS = [
  { label: 'BFP Minalin', number: '0923 532 3026' },
  { label: 'National emergency', number: '911' },
];

/**
 * What to do before calling. Kept beside the numbers rather than in a doc,
 * because the order matters and is easy to get wrong under stress: make it
 * safe if you can, get clear, then call.
 */
export const EMERGENCY_GUIDANCE =
  'Fire, smoke or a burning smell: switch off at the wall only if it is safe '
  + 'to reach, leave the room, then call.';
