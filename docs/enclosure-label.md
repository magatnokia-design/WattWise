# Enclosure label spec

Artwork brief for the stickers applied to the WattWise hardware enclosure.
Written to be handed to a design tool as-is - the copy blocks are final text,
not placeholders.

## The enclosure

ABS junction box, light grey, `200 x 120 x 75 mm` outer.

- Lid: `15 mm` deep, four corner screws
- Base: `60 mm` deep, internal cavity `174 x 76 mm`
- Lid outer face is nominally `200 x 120 mm`

**The lid's flat printable area is smaller than 200 x 120.** These boxes have a
chamfered or radiused edge and four recessed screw wells, and the usable flat
region is what the sticker has to fit. Measure before ordering - see
[What to measure](#what-to-measure). Until then, design to a safe `180 x 100 mm`
with all content inside a `12 mm` margin.

## Three labels, not one

Splitting them keeps each one legible and puts each fact where it is needed.

### Label A - lid top (the main one)

Brand and safety. This is the face people see.

```
WattWise
Smart Energy Monitor

MAX 500 W PER OUTLET  ·  1000 W COMBINED
220-240 V~  60 Hz

Low-voltage appliances only.
Chargers, laptops, fans, TVs, LED lamps, consoles.

DO NOT USE WITH heaters, kettles, irons, hair dryers,
electric stoves or air conditioners.

Indoor use only. Do not open while plugged in.

wattwise.site
```

The wattage line is the most important text on the box after the logo. It should
be the second-largest element - it is the number that stops someone plugging in a
kettle. Set `MAX 500 W PER OUTLET` in the primary green or in near-black; keep
`DO NOT USE WITH` in the warning amber, not red. Red reads as "fault"; this is an
instruction, and the enclosure already uses red nowhere else.

### Label B - socket face

Two small labels, or one strip, beside the physical sockets.

```
OUTLET 1          OUTLET 2
```

Set these large and unambiguous. They are what tie the physical socket to the
name in the app, and every schedule, budget line and cutoff the user reads
depends on the pairing being right.

> **Verify before applying.** Toggle Outlet 1 in the app and note which socket
> actually switches. `CLAUDE.md` and the firmware currently disagree about the
> relay mapping - see [Open question](#open-question) - so do not take either
> document's word for it. The stickers are the last place to discover this.

Optionally add the per-outlet ceiling under each: `max 500 W`.

### Label C - inside the lid

Not on the outside. **The pairing QR encodes the device token**, which
`deviceSecurity.js` accepts as proof of identity on every hardware request.
Printed on an outer face it is readable by anyone who sees the box - including
anyone looking at a photo of it in a presentation slide.

```
Device ID:  ESP32_ROOM_A
[ QR code ]
Scan in WattWise -> Settings -> Link Device

Relay CH1 -> GPIO23     PZEM1 -> RX16 / TX17
Relay CH2 -> GPIO22     PZEM2 -> RX26 / TX27
Relays are active LOW.

Built <month year>
```

QR source: `docs/esp32/qr/ESP32_ROOM_A.svg` (use the SVG, not the PNG - it stays
sharp at any print size). Print it at **20 mm square minimum**; smaller and phone
cameras struggle at an angle.

The pinout line costs nothing here and saves opening a laptop the next time
someone services the box.

## Colours

Straight from `src/constants/colors.js`.

| Role | Hex | Use |
| --- | --- | --- |
| Primary green | `#10B981` | Logo, headings, accents |
| Primary dark | `#059669` | Solid green backgrounds, print-safe green |
| Primary light | `#34D399` | Highlights only, weak on white |
| White | `#FFFFFF` | Background |
| Off-white | `#F9FAFB` | Panel fills |
| Text | `#111827` | Body copy |
| Text dark | `#1F2937` | Subheads |
| Text light | `#6B7280` | Fine print |
| Border | `#E5E7EB` | Rules, dividers |
| Warning amber | `#F59E0B` | The DO NOT USE block |
| Error red | `#EF4444` | Reserve. Do not use on the label |

Chart pair, if the design wants two distinguishable greens: `#047857` and
`#10B981`. Chosen for colour-blind separation, so they hold up for Outlet 1 vs
Outlet 2 colour-coding.

**Print note.** `#10B981` is a saturated RGB green that dulls in CMYK. For solid
green areas use `#059669`, which converts more predictably. If the exact green
matters, ask the printer for a proof, or specify Pantone 3405 C as the nearest
match and let them hit that instead.

The enclosure is light grey, so white sticker stock keeps the app's white
background rather than fighting the box colour.

## Typography

Match the app: a clean geometric sans (Inter, Poppins or similar). Nothing
condensed - this is read at arm's length in poor light.

- `WattWise` wordmark: bold, primary green or near-black
- Wattage line: bold, minimum 14 pt at final print size
- Body: regular, minimum 8 pt
- Never set warnings in italic or below 8 pt

## What to measure

I need these before the artwork can be sized properly. All in mm.

1. **Lid flat area** - the truly flat region on the outer top face, excluding the
   radiused edge. Width and length.
2. **Screw wells** - centre of each screw to the two nearest edges, and the
   diameter of the recess. The sticker either avoids them or gets four holes.
3. **Lid profile** - is the top perfectly flat, or slightly domed or recessed? A
   dome means a large one-piece sticker will wrinkle at the corners.
4. **Socket face** - which face carries the two outlets, the gap between them,
   and the flat space beside or beneath each one.
5. **Cable entry** - where the mains inlet and any gland sit, so no label
   overlaps them.
6. **Anything else on the outside** - LED, switch, vent, mounting tab.

## Open question

`CLAUDE.md` records as a hard constraint:

> `outlet1` -> relay CH2 -> GPIO22. `outlet2` -> relay CH1 -> GPIO23.

The firmware says the opposite at
`docs/esp32/WattWise_ESP32_Relay_Cloud/WattWise_ESP32_Relay_Cloud.ino:38-41`:

> Keep labels one-to-one: outlet1->relay CH1, outlet2->relay CH2.

which resolves to outlet1 -> GPIO23, outlet2 -> GPIO22. The firmware is what is
running, and testing has been consistent with it, so `CLAUDE.md` is likely stale
- plausibly someone conflated the deliberately crossed *PZEM* channel mapping
(`OUTLET_1_PZEM_CHANNEL = 2`) with the relay mapping. Not corrected here on
inference alone.

Settle it empirically: toggle Outlet 1 and watch which socket clicks. Then fix
whichever document is wrong, and print Label B to match.

## Generation brief

Paste this, with the measured dimensions filled in.

> Design a product label for a smart energy monitor enclosure, to be printed on
> white vinyl and applied to a light grey ABS box.
>
> Dimensions: [MEASURED W] x [MEASURED H] mm, all content inside a 12 mm margin,
> avoiding four corner screws at [POSITIONS].
>
> Brand: WattWise, a smart energy monitor for apartment rooms. Visual style is
> minimal - white background, generous space, rounded corners, thin rules. Green
> and white only.
>
> Colours: primary green #10B981, darker green #059669 for solid fills, near
> black #111827 for body text, grey #6B7280 for fine print, #E5E7EB for rules,
> amber #F59E0B for the warning block only. No red.
>
> Typography: clean geometric sans, nothing condensed. Wattage line bold and
> second only to the logo in visual weight.
>
> Content, in this order and hierarchy:
> [paste Label A copy block]
>
> The wattage limits and the DO NOT USE list must be the most legible elements
> after the wordmark. Output as print-ready vector artwork at 300 dpi with 3 mm
> bleed.
