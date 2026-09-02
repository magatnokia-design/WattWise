# Shutting WattWise down without leaving a bill

The counterpart to `FRESH-MACHINE.md`. That one rebuilds this project from
nothing; this one takes it back to nothing.

**Do not run any of this before the final defence**, and think twice before a
portfolio demo. Step 4 onwards is irreversible and leaves the app signing in to
an account that measures and controls nothing.

---

## What actually costs money

Most of the stack is free and stays free. Only three things bill, and one of
them keeps billing after the Hub is unplugged - which is the whole reason this
file exists.

| | Cost | Stops when |
|---|---|---|
| **Artifact Registry** (`gcf-artifacts`) | **per GB/month, forever** | you delete the repository - **not** when you delete the functions |
| **Cloud Scheduler** | 3 jobs free, then ~$0.10/job/month. There are **6**. | the scheduled functions are deleted |
| Cloud Functions / Firestore | per invocation and per read-write | the Hub stops posting |
| Firebase Auth | free | — |
| GitHub repos + Actions | free (public repos) | — |
| Vercel (Hobby) | free | — |
| Brevo SMTP | free tier | — |
| **wattwise.site** | **annual, at Namecheap** | you let it lapse - diarise the renewal date |

The container images are the trap. Every deploy of all 27 functions pushes a new
image, they accumulate, and deleting the functions does **not** delete them.

---

## Run it as a script

`scripts/shutdown-firebase.ps1` does steps 3, 4 and 6 below. It is written to
be usable from the file alone, with no help and no memory of this project.

```powershell
# Prints the plan and changes nothing. Safe to run any time.
.scriptsshutdown-firebase.ps1

# For real. Asks you to type the project id first.
.scriptsshutdown-firebase.ps1 -Execute
```

It deliberately stops short of Artifact Registry, Cloud Storage and the plan
change, because those need `gcloud` and it is not installed here. The script
prints the console links for them at the end. **Step 5 below is the one that
keeps billing if you skip it.**

## The order, and why it is this order

Consumers before producers, so nothing spends the shutdown retrying against
something that has already gone.

### 1. Unplug the Hub

The single biggest lever and completely reversible. No telemetry means almost
no invocations and almost no Firestore writes, so the bill falls to near zero
on its own. **If you only ever do one step, do this one.**

Wi-Fi credentials live in NVS, so the Hub keeps them. To clear them too, hold
BOOT on boot (see `hub-provisioning`).

### 2. Keep what the capstone needs

Once the functions are gone you cannot regenerate a statement, so save the
evidence first:

- Email yourself each month's statement PDF (Settings -> Monthly Statements ->
  **Email me this statement**) while `sendInvoiceEmail` still exists.
- Export usage from the History screen for the CSV.
- Screenshot Analytics and Compare Usage.
- In the console, **Firestore -> Import/Export** writes a full backup to a
  Cloud Storage bucket. Download it, then delete the bucket - it bills as
  storage while it sits there.

### 3. Delete the email extension

It is a function plus a Secret Manager entry, and it must go before the
`mail` collection it watches.

```powershell
firebase ext:uninstall firestore-send-email
```

### 4. Delete the functions

This also removes their Cloud Run services and all six Cloud Scheduler jobs.

```powershell
# One at a time is slow but safe. The region is not optional.
firebase functions:delete updateOutletMetrics --region asia-southeast1 --force
```

Faster: **Firebase console -> Build -> Functions**, select all, delete. 27 of
them. Everything stops working from here on.

### 5. Delete the container images - the step people miss

**Google Cloud console -> Artifact Registry**, project `wattwise-fe394`.
Delete the **`gcf-artifacts`** repository in `asia-southeast1`.

Without this you keep paying for image storage every month with no functions
running and nothing to show for it.

While you are there, **Cloud Storage** holds `gcf-sources-*` buckets with the
deployed source archives. Delete those too.

### 6. Firestore

Delete the `users` collection (or the whole database) once the export in step 2
is safely downloaded. Storage under 1 GiB is free, so this is tidiness rather
than cost - your data is a few thousand small documents.

### 7. Vercel and the domain

Vercel Hobby is free, so the web client can simply stay up. It will show the
landing page and fail to sign anyone in, which is harmless. Delete the project
if you would rather it not be reachable.

**wattwise.site renews annually at Namecheap and is the one real recurring
cost left.** Decide before the renewal date; that is a calendar reminder, not a
console step.

### 8. Only now, the plan

With nothing deployed, **Spark is safe**. Firebase console -> gear ->
**Usage and billing** -> Details & settings -> **Modify plan** -> Spark.

Doing this *before* the steps above breaks all 27 functions instantly and
silently, which is why it is last rather than first.

### 9. Or: delete the project

The clean, absolute version. Firebase console -> Project settings ->
**Delete project**. Removes functions, images, Firestore, scheduler and
buckets in one action, and nothing can bill afterwards.

There is a ~30 day grace period before it is permanent. It also destroys the
`wattwise-fe394` project id for good, so take the export in step 2 first.

---

## Before you do any of it

Set a budget alert now, so you learn about a surprise from an email rather than
from a card statement:

**Google Cloud console -> Billing -> Budgets & alerts -> Create budget.**
A $5 monthly budget alerting at 50/90/100% is plenty for a project this size.

Keep it in place through the defence too. It is the protection that costs
nothing and breaks nothing.
