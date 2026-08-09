$input | Out-Null
$json = $input | ConvertFrom-Json -ErrorAction SilentlyContinue
$path = $json.tool_input.file_path
if ($path -and $path -match "functions[\\/]") {
    Write-Host "Running lint + test on functions change..."
    Push-Location functions
    npm run lint
    npm test
    Pop-Location
}
