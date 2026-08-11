# Cross-client verification

Two claims the project rests on have never been tested. Neither can be checked
from code - both need the phone and a browser side by side, signed into the same
account, with the ESP32 powered.

Written 2026-08-11. Run these after the next EAS build.

---

## 1. A toggle made in the browser reaches the relay and the phone

**What it proves:** that the poll-based `device_commands` flow is genuinely
client-agnostic - that the ESP32 has no idea which client wrote the command it
picked up. This is the premise of having a web client at all.

**Setup:** ESP32 powered and on wi-fi. Phone on the Dashboard. Browser at
`https://www.wattwise.site`, same account, Dashboard.

| # | Do | Expect |
|---|---|---|
| 1 | Toggle `outlet1` **on** in the browser | Relay clicks audibly |
| 2 | Watch the phone without touching it | Card flips to on within ~1 s |
| 3 | Watch the browser | Stays on - does not flicker back |
| 4 | Toggle `outlet1` **off** on the **phone** | Relay clicks; browser follows |
| 5 | Settings → device, either client | `Last command ack: Executed` |

**Step 3 is the one that matters.** Telemetry arrives roughly once a second and
carries the outlet's *reported* state. If the `pendingStatus` /
`pendingStatusUntilMs` guard set by `processOutletToggle` were not working, the
switch would revert on screen a moment after being flipped, before the ESP32
polls its command. A brief flicker there is a real bug, not a rendering
artifact.

**If the relay does not click:** check `users/{uid}/device_commands` in the
Firestore console for a document created at that moment. A document present
with no ack means the device is not polling - that is a device problem. No
document at all means the callable never wrote one - that is an app problem.

---

## 2. A month's bill matches between the two clients

**What it proves:** that the three copies of `calculatePelcoIIIBill` agree in
practice, not just in principle.

**This test is now narrower than it was.** `functions/test/billingParity.test.js`
runs the phone's and the web's copies against the Functions copy over nine input
cases - the four real PELCO III sample bills plus edges - and asserts identical
output. The arithmetic is covered.

What remains untested is whether **both clients feed those functions the same
input**: the same kWh total, the same supply rates, the same month boundary. So
this is a data-plumbing check, not a maths check.

| # | Do | Expect |
|---|---|---|
| 1 | Phone → Analytics, note the month's total kWh | - |
| 2 | Browser → Analytics, same month | Same kWh, to 2 dp |
| 3 | Note the estimated bill on both | Same peso figure, to the centavo |
| 4 | Settings → rates, both clients | Same generation rate stored |

**A mismatch in step 2 but not step 4 means the kWh aggregation differs** -
look at the month-boundary handling and whether one client is including a
partial day the other excludes. **A mismatch in step 4** means the clients are
reading different rate documents, and the bill difference is a symptom.

Run `npm run verify:functions` first. If the parity test fails, stop - the
copies have drifted and no amount of UI comparison will explain it.

---

## 3. The invoice PDF, before 1 September

`processMonthlyInvoice` fires 00:20 Manila on the 1st and is the only path that
sends a base64 PDF attachment through Brevo. It has never run against the live
transport.

`sendInvoiceEmail` exists to rehearse it. It calls `processInvoiceForUser` - the
exact function the scheduled job calls, at the same 512 MiB memory ceiling - so
a pass here is evidence about the real job rather than about a parallel copy.

From `functions/`:

```powershell
firebase functions:shell
```

then, with your own uid from Firebase Console → Authentication:

```
sendInvoiceEmail({ billingMonth: '2026-07' }, { auth: { uid: 'YOUR_UID' } })
```

**Expect:** a returned `pdfBytes` figure, and the statement in your inbox with
`WattWise-2026-07.pdf` attached and openable.

**If nothing arrives**, the newest document in the top-level `mail` collection
carries a `delivery` object naming the SMTP error. `delivery.state` of `ERROR`
with a size complaint means the attachment exceeded what Brevo accepts, and the
700 KB cap in `mailQueue.js` needs lowering.

**`failed-precondition: No energy was recorded`** is not a failure of the mail
path - it means that month has no `history_daily` documents. Pick a month the
device was actually running.
