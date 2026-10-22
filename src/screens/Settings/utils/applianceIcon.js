/**
 * A MaterialCommunityIcons name for an appliance, from words in its name - so
 * the Saved appliances list reads at a glance (Oct 2026). Users type these
 * names freely ("Nokia's Fan", "Printer"), so it matches on words and falls
 * back to a plug when nothing fits. Purely decorative: nothing else reads it.
 */
const RULES = [
  [/\b(electric\s*)?fan\b|ceiling/i, 'fan'],
  [/laptop|notebook|macbook/i, 'laptop'],
  [/phone|charger|charging|iphone|android|tablet|ipad/i, 'cellphone-charging'],
  [/\btv\b|television/i, 'television'],
  [/monitor|display|screen/i, 'monitor'],
  [/lamp|light|bulb|\bled\b/i, 'lightbulb-outline'],
  [/speaker|sound|audio|radio/i, 'speaker'],
  [/console|playstation|\bps[45]\b|xbox|switch|game/i, 'gamepad-variant-outline'],
  [/printer/i, 'printer-outline'],
  [/router|modem|wi-?fi/i, 'router-wireless'],
  [/rice|cooker/i, 'pot-steam-outline'],
  [/kettle/i, 'kettle-outline'],
  [/hair|dryer/i, 'hair-dryer-outline'],
  [/purifier|humidifier/i, 'air-purifier'],
];

export const FALLBACK_APPLIANCE_ICON = 'power-plug-outline';

export const applianceIcon = (name) => {
  const text = String(name || '');
  const match = RULES.find(([pattern]) => pattern.test(text));
  return match ? match[1] : FALLBACK_APPLIANCE_ICON;
};

export default applianceIcon;
