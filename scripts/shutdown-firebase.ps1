<#
  WattWise - tear the cloud side down and stop it billing.

  Written 2 Sep 2026 so this can be done WITHOUT Claude, from this file alone.
  Read docs/SHUTDOWN.md for the reasoning; this is the executable half.

  DESTRUCTIVE AND IRREVERSIBLE. It deletes all 27 Cloud Functions
  and the email extension. Afterwards the app still signs in and still shows
  stored data, but measures nothing and controls nothing.

  DO NOT RUN BEFORE THE FINAL DEFENCE.

  Dry run (default - prints the plan, changes nothing):
      .shutdown-firebase.ps1

  For real:
      .shutdown-firebase.ps1 -Execute

  What this script CANNOT do, because it needs gcloud (not installed on this
  machine) - do these by hand in the console afterwards. Step 5 is the one that
  keeps costing money if you skip it:
    * Artifact Registry  -> delete the 'gcf-artifacts' repository
    * Cloud Storage      -> delete the 'gcf-sources-*' buckets
    * Billing plan       -> switch to Spark (LAST, never first)
#>

param(
  [switch]$Execute,
  [string]$Project = 'wattwise-fe394',
  [string]$Region  = 'asia-southeast1'
)

$ErrorActionPreference = 'Continue'

$functions = @(
  'updateOutletMetrics',
  'ackDeviceCommand',
  'getDeviceCommand',
  'processOutletToggle',
  'clearAutoDetection',
  'registerApplianceProfile',
  'finalizeInvoice',
  'repriceDailyRollups',
  'deleteAccount',
  'removeApplianceProfile',
  'renameApplianceProfile',
  'linkDeviceToAccount',
  'checkUserExistsByEmail',
  'sendPasswordResetEmail',
  'sendVerificationEmail',
  'sendInvoiceEmail',
  'processDailyRollup',
  'processMonthlyInvoice',
  'checkScheduledTimers',
  'markStaleDeviceCommands',
  'checkPushReceipts',
  'normalizePowerSafetyThresholds',
  'handleBudgetAlerts',
  'handleSafetyAlerts',
  'handleDeviceCommandEmails',
  'handleDailyReceiptEmails',
  'handlePushNotifications'
)

function Step($n, $text) { Write-Host "`n[$n] $text" -ForegroundColor Cyan }
function Note($text)      { Write-Host "    $text" -ForegroundColor DarkGray }

Write-Host "WattWise shutdown - project $Project, region $Region"
Write-Host "$($functions.Count) functions + 1 extension"

if (-not $Execute) {
  Write-Host "`nDRY RUN. Nothing will be changed." -ForegroundColor Yellow
  Write-Host "Re-run with -Execute to actually delete.`n" -ForegroundColor Yellow
}

# ---------------------------------------------------------------- 0. save first
Step 0 'BEFORE YOU RUN THIS - none of it can be regenerated afterwards'
Note 'Email yourself every monthly statement PDF (Settings -> Monthly Statements)'
Note 'Export usage to CSV from the History screen'
Note 'Firestore -> Import/Export in the console, then DOWNLOAD the bucket'
Note 'Unplug the Hub - that alone takes the running cost to near zero'

if ($Execute) {
  Write-Host "`nType the project id to confirm you have done the above:" -ForegroundColor Red
  $typed = Read-Host '  project id'
  if ($typed -ne $Project) {
    Write-Host 'Did not match. Nothing was changed.' -ForegroundColor Green
    exit 1
  }
}

# ------------------------------------------------------------- 1. the extension
Step 1 'Uninstall the email extension (a function plus a stored secret)'
Note 'firebase ext:uninstall firestore-send-email'
if ($Execute) { firebase ext:uninstall firestore-send-email --project $Project --force }

# -------------------------------------------------------------- 2. the functions
Step 2 "Delete all $($functions.Count) functions (also removes their Cloud Run services and all 6 Cloud Scheduler jobs)"
foreach ($fn in $functions) {
  Note "firebase functions:delete $fn --region $Region"
  if ($Execute) {
    firebase functions:delete $fn --region $Region --project $Project --force
  }
}

# --------------------------------------------------------------- 3. firestore
Step 3 'Delete Firestore data (only after your export is downloaded)'
Note 'firebase firestore:delete --all-collections'
if ($Execute) {
  Write-Host '    Delete all Firestore data too? (y/N)' -ForegroundColor Yellow
  if ((Read-Host '    ') -eq 'y') {
    firebase firestore:delete --all-collections --project $Project --force
  } else {
    Note 'Skipped. Storage under 1 GiB is free, so this is tidiness not cost.'
  }
}

# ------------------------------------------------------- 4. what is left by hand
Step 4 'BY HAND IN THE CONSOLE - the CLI cannot do these without gcloud'
Write-Host ''
Write-Host '  a) Artifact Registry   <- THE ONE THAT KEEPS BILLING' -ForegroundColor Yellow
Note    "console.cloud.google.com/artifacts?project=$Project"
Note    "delete the 'gcf-artifacts' repository in $Region"
Note    'Deleting the functions does NOT delete their container images.'
Write-Host ''
Write-Host '  b) Cloud Storage' -ForegroundColor Yellow
Note    "console.cloud.google.com/storage/browser?project=$Project"
Note    "delete the 'gcf-sources-*' buckets, and any Firestore export bucket"
Write-Host ''
Write-Host '  c) Billing plan - LAST, never first' -ForegroundColor Yellow
Note    "console.firebase.google.com/project/$Project/usage/details"
Note    'Modify plan -> Spark. Safe only once nothing above is deployed.'
Write-Host ''
Write-Host '  d) Or skip a-c entirely: delete the whole project' -ForegroundColor Yellow
Note    "console.firebase.google.com/project/$Project/settings/general"
Note    'Removes everything at once. ~30 day grace period, then permanent.'
Write-Host ''
Write-Host '  e) wattwise.site renews annually at Namecheap.' -ForegroundColor Yellow
Note    'No console cancels this - put the renewal date in a calendar.'

Write-Host ''
if ($Execute) {
  Write-Host 'Done. Finish steps 4a-4c or the images keep billing.' -ForegroundColor Green
} else {
  Write-Host 'Dry run complete. Nothing was changed.' -ForegroundColor Green
}
