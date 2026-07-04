param(
  [string]$BaseUrl = "http://127.0.0.1:8000",
  [string]$AudioPath = ""
)

$RequirementId = "90000000-0000-0000-0000-000000000001"
$TicketId = "91000000-0000-0000-0000-000000000001"

function Invoke-Api {
  param(
    [string]$Name,
    [scriptblock]$Request
  )

  Write-Host "`n=== $Name ==="
  try {
    $result = & $Request
    $result | ConvertTo-Json -Depth 10
  } catch {
    Write-Host "FAILED"
    if ($_.Exception.Response) {
      $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      Write-Host $reader.ReadToEnd()
    } else {
      Write-Host $_.Exception.Message
    }
  }
}

Invoke-Api "GET /api/health" {
  Invoke-RestMethod -Method Get -Uri "$BaseUrl/api/health"
}

Invoke-Api "GET /api/health/db" {
  Invoke-RestMethod -Method Get -Uri "$BaseUrl/api/health/db"
}

if ($AudioPath -and (Test-Path $AudioPath)) {
  Write-Host "`n=== POST /api/transcribe ==="
  curl.exe -s -X POST "$BaseUrl/api/transcribe" -F "file=@$AudioPath"
} else {
  Write-Host "`n=== POST /api/transcribe ==="
  Write-Host "SKIPPED: pass -AudioPath C:\path\to\audio.mp3"
}

Invoke-Api "POST /api/agents/meeting" {
  $body = @{
    requirement_id = $RequirementId
    transcript = "En la reunion del ERP Finanzas necesitamos crear una API de costos, validar la migracion de datos historicos y agregar pruebas QA para conciliacion de inventario."
  } | ConvertTo-Json

  Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/agents/meeting" -ContentType "application/json" -Body $body
}

Invoke-Api "POST /api/agents/assignment" {
  $body = @{
    requirement_id = $RequirementId
  } | ConvertTo-Json

  Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/agents/assignment" -ContentType "application/json" -Body $body
}

Invoke-Api "PATCH /api/tickets/{ticket_id}" {
  $body = @{
    status = "in_progress"
    deadline = "2026-07-15"
  } | ConvertTo-Json

  Invoke-RestMethod -Method Patch -Uri "$BaseUrl/api/tickets/$TicketId" -ContentType "application/json" -Body $body
}

Invoke-Api "POST /api/approve/{requirement_id}" {
  Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/approve/$RequirementId"
}
