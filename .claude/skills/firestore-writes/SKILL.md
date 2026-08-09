---
name: firestore-writes
description: Use whenever proposing a data write, whether from the client app or backend, to check if it should go through Cloud Functions instead of a direct Firestore write.
---

Firestore security rules in this project are locked and deployed. The client
app must NEVER write directly to Firestore for anything beyond the narrow
fields explicitly allowed in firestore.rules (e.g. outlet applianceName/
outletNumber/lastUpdated, notification read status).

All meaningful writes (outlet control, telemetry, command dispatch, resets)
go through a Cloud Function. If a bug or feature seems to need a new direct
client write, the correct fix is a new or modified Cloud Function, not a
security rules change or a client-side write. Flag this explicitly rather
than silently working around it.
