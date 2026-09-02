# Hub wiring — the authoritative map

Written 1 Sep 2026, after outlet 2's relay channel failed and three hours went
into deciding whether the fault was software, wiring, or the relay. It was the
relay. This file exists so the next person spends three minutes instead.

**The source of truth is the sketch**, `WattWise_ESP32_Relay_Cloud.ino` lines
42-83. This file explains it; it does not replace it. If they ever disagree,
the sketch is right and this file is stale.

---

## The map

| Logical | Relay channel | ESP32 pin | Meter it reads | Meter's ESP32 pins |
|---|---|---|---|---|
| `outlet1` | **CH1** | **GPIO23** | **PZEM 2** | RX 26 / TX 27 |
| `outlet2` | **CH2** | **GPIO22** | **PZEM 1** | RX 16 / TX 17 |

Two things in that table are easy to get backwards, and they are backwards in
*different* ways. Read the next two sections before touching anything.

## 1. Relays are one-to-one. Do not cross them.

`outlet1 -> CH1 -> GPIO23`, `outlet2 -> CH2 -> GPIO22`. No trick, no swap.

This entry read the other way round in `CLAUDE.md` until 15 Aug 2026, when the
running device settled it by printing to serial:

```
[Relay] outlet1 relayCH=1 pin=23 meter=PZEM2 => ON
```

## 2. The PZEM meters ARE crossed, on purpose.

`OUTLET_1_PZEM_CHANNEL = 2` and `OUTLET_2_PZEM_CHANNEL = 1`. The software swap
compensates for the sensor loom being physically crossed on this build.

**Do not "fix" this by uncrossing it in code.** Either cross the wires or cross
the constants, never both and never neither. The symptom of getting it wrong is
specific and quiet: both outlets report plausible voltage, but **each shows the
other's watts.**

Verify with your own eyes, not from memory. At boot the Hub prints a `[MAP]`
line; check it against the loom.

---

## Relay contacts: NO, never NC

The relay has three contact terminals. Only one is correct here:

| Terminal | Closed when | Use it? |
|---|---|---|
| **COM** | always the common pole | yes — feed it |
| **NO** (normally open) | coil **energised** | **yes — outlet lead here** |
| **NC** (normally closed) | coil **at rest** | **no** |

The module is **active LOW**: `digitalWrite(pin, LOW)` energises the coil (ON,
LED lit); `HIGH` releases it (OFF, LED dark).

**The contact must interrupt the LIVE conductor, not the neutral.** Both
outlets share a neutral, so a contact in the neutral leg leaves a return path
through the other outlet and the load keeps running with the relay open. That
is indistinguishable from a welded contact until you trace it.

Wiring to NC instead of NO inverts everything and also destroys the fail-safe:
at rest the outlet would be **live**, so a crashed or unpowered ESP32 would
leave both sockets on. As built, a dead ESP32 leaves both sockets off. Keep it
that way.

---

## Replacing a relay module

Plug and play. **No firmware change, no re-flash, no reconfiguration.**

1. Unplug the Hub from the wall. Not switched off in the app — unplugged.
2. Photograph the existing loom before removing a single wire.
3. Move the wires one at a time, old board to new:
   - `IN1` -> GPIO23, `IN2` -> GPIO22, `VCC` -> 5 V, `GND` -> GND
   - Outlet 1 live: incoming L -> **CH1 COM**, **CH1 NO** -> socket 1
   - Outlet 2 live: incoming L -> **CH2 COM**, **CH2 NO** -> socket 2
   - Neutrals go straight to the sockets, through no contact.
4. Leave the PZEM loom completely alone. It is crossed on purpose (§2) and the
   firmware already compensates.
5. Power up and verify below.

Any 2-channel 5 V opto-isolated module (SRD-05VDC-SL-C) is a drop-in.

---

## Verifying after any wiring work

Connect at **115200 baud** and use the built-in serial commands. `help` lists
them. This needs no re-flash and does not disturb the cloud.

```
status          Relay1/Relay2 position, Wi-Fi, heap
relay1 on|off   drive CH1 directly
relay2 on|off   drive CH2 directly
telemetry       force a post
```

Opening the port asserts DTR/RTS and **reboots the ESP32** unless you disable
both first.

Then, in order:

1. **`status`** — does the reported position match the LEDs?
2. **Click test** — `relay2 on` then `relay2 off`. You should hear the coil
   both times. No click means the coil is not actuating: a dead channel, or
   IN2 not making contact.
3. **Load test** — plug something real into the outlet, switch it off, watch
   the meter. **Do not test with an empty socket.** With no load an outlet
   reads 0 W whether the contact opened or welded shut; that is a null result,
   not a pass.
4. **Cross-check** — with only outlet 1 loaded, confirm the app credits the
   watts to outlet 1. If they land on outlet 2, the PZEM crossing is wrong.

---

## Diagnosing a relay that will not switch off

The backend already detects this: `relayFault.js` compares what the device says
against what the meter measures, and logs `Relay did not open` after 30 s of
current through an outlet commanded off. It never retries — re-driving a welded
contact does not unweld it, and hammering the coil damages the neighbour.

Work down this list; each step eliminates one layer.

| Observation | Conclusion |
|---|---|
| `[Relay] ... => OFF` appears on serial | ESP32 and GPIO are fine |
| LED follows the command | coil driver and IN wire are fine |
| **No click at all** | coil not actuating — dead channel or open IN wire |
| Load runs with coil **energised and released** | contacts not in the load's circuit, or welded |
| Load stops only when unplugged | proves nothing — see the null result above |

To separate a dead channel from a broken wire, jumper **IN2 directly to GND**
(active LOW, so it should click). Clicks on the jumper but not from the ESP32
means the fault is the wire or the header, not the relay.

Voltage is the other discriminator, because the meter sits on the **load side**
of the contact:

| | voltage | power |
|---|---|---|
| relay opened | **0 V** | 0 W |
| relay stuck, load unplugged | **245 V** | 0 W |
