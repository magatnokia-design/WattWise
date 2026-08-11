/**
 * Deep links into the WattWise web client (https://www.wattwise.site).
 *
 * Phone-only, like `theme.js`: the web client has no reason to link to itself.
 * It is not part of the set of files kept byte-identical across the two repos.
 *
 * The app and the website are two views of the same Firebase account, and each
 * is better at different work. The phone owns anything you do standing next to
 * the outlet - toggling, pairing the ESP32, safety cutoff, the monthly budget.
 * The website is better for the data-heavy work: wide charts, and typing rate
 * figures off a paper bill.
 *
 * These links exist to point at the second group. They never gate a feature:
 * every screen that shows one still works completely on the phone, because a
 * user standing in their apartment may not have a laptop. The banner says
 * "easier on a bigger screen", never "go to the web to see this".
 *
 * Paths are verified against the web client's router (`src/App.jsx`), where all
 * of these are top-level routes. A path that stops existing there lands the user
 * on the web app's NotFound page, so keep them in step.
 */
export const WEB_APP_URL = 'https://www.wattwise.site';

export const WEB_APP_LINKS = {
  analytics: `${WEB_APP_URL}/analytics`,
  comparison: `${WEB_APP_URL}/comparison`,
  history: `${WEB_APP_URL}/history`,
  settings: `${WEB_APP_URL}/settings`,
};

export default WEB_APP_LINKS;
