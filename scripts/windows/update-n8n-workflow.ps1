# Update n8n Workflow Script
# This script updates an existing n8n workflow via the REST API

param(
    [string]$WorkflowFile = "n8n-restaurant-workflow.json",
    [string]$N8nUrl = "http://localhost:5678",
    [string]$Username = "admin",
    [string]$Password = "",
    [string]$ApiKey = ""
)

# Get API key from env var or parameter
if (-not $ApiKey) {
    $ApiKey = $env:N8N_API_KEY
}

# Get password from env var, docker-compose default, or prompt
if (-not $Password) {
    $Password = $env:N8N_PASSWORD
}
if (-not $Password) {
    # Default from docker-compose.yml (update this if you changed it)
    $Password = "your_secure_password"
    Write-Host "[INFO] Using default password from docker-compose.yml" -ForegroundColor Yellow
    Write-Host "[INFO] Set `$env:N8N_PASSWORD or pass -Password parameter to use a different password" -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "Updating n8n Workflow..." -ForegroundColor Cyan
Write-Host ""

# Check if workflow file exists
if (-not (Test-Path $WorkflowFile)) {
    Write-Host "[ERROR] Workflow file not found: $WorkflowFile" -ForegroundColor Red
    exit 1
}

# Read workflow JSON
Write-Host "Reading workflow file..." -ForegroundColor Yellow
$workflowJson = Get-Content $WorkflowFile -Raw | ConvertFrom-Json
$workflowName = $workflowJson.name

Write-Host "  Workflow name: $workflowName" -ForegroundColor White

# Determine authentication method
$useApiKey = $false
$session = $null

# Check if API key is available (from parameter or env var)
if ($ApiKey) {
    Write-Host "Using API key authentication..." -ForegroundColor Yellow
    $useApiKey = $true
} elseif ($env:N8N_API_KEY) {
    Write-Host "Using API key from environment variable..." -ForegroundColor Yellow
    $ApiKey = $env:N8N_API_KEY
    $useApiKey = $true
} else {
    # Create a session to get authentication cookie
    Write-Host "Authenticating with username/password..." -ForegroundColor Yellow
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

    try {
        # Try different login endpoints
        $loginEndpoints = @(
            "$N8nUrl/rest/login",
            "$N8nUrl/api/v1/login",
            "$N8nUrl/login"
        )
        
        $loginBody = @{
            email = $Username
            password = $Password
        } | ConvertTo-Json

        $loginHeaders = @{
            "Content-Type" = "application/json"
        }

        $loginSuccess = $false
        foreach ($endpoint in $loginEndpoints) {
            try {
                $loginResponse = Invoke-WebRequest -Uri $endpoint -Method Post -Headers $loginHeaders -Body $loginBody -Session $session -ErrorAction Stop
                Write-Host "  [OK] Authentication successful via $endpoint" -ForegroundColor Green
                $loginSuccess = $true
                break
            } catch {
                # Try next endpoint
                continue
            }
        }
        
        if (-not $loginSuccess) {
            throw "All login endpoints failed"
        }
    } catch {
        Write-Host "[WARNING] Session login failed: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "Will try basic auth as fallback..." -ForegroundColor Yellow
        $session = $null
    }
}

# Get all workflows to find the one we want to update
Write-Host ""
Write-Host "Fetching existing workflows..." -ForegroundColor Yellow
try {
    $headers = @{
        "Content-Type" = "application/json"
    }
    
    if ($useApiKey) {
        $headers["X-N8N-API-KEY"] = $ApiKey
        $response = Invoke-RestMethod -Uri "$N8nUrl/api/v1/workflows" -Method Get -Headers $headers
    } elseif ($session) {
        $response = Invoke-RestMethod -Uri "$N8nUrl/api/v1/workflows" -Method Get -Headers $headers -WebSession $session
    } else {
        # Fallback to basic auth
        $base64AuthInfo = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${Username}:${Password}"))
        $headers["Authorization"] = "Basic $base64AuthInfo"
        $response = Invoke-RestMethod -Uri "$N8nUrl/api/v1/workflows" -Method Get -Headers $headers
    }
    $workflows = $response.data
    
    # Find workflow by name
    $existingWorkflow = $workflows | Where-Object { $_.name -eq $workflowName }
    
    if (-not $existingWorkflow) {
        Write-Host "[ERROR] Workflow '$workflowName' not found in n8n" -ForegroundColor Red
        Write-Host ""
        Write-Host "Available workflows:" -ForegroundColor Yellow
        $workflows | ForEach-Object { Write-Host "  - $($_.name) (ID: $($_.id))" -ForegroundColor White }
        Write-Host ""
        Write-Host "You can either:" -ForegroundColor Yellow
        Write-Host "  1. Import the workflow manually in n8n UI" -ForegroundColor White
        Write-Host "  2. Create it first, then run this script again" -ForegroundColor White
        exit 1
    }
    
    $workflowId = $existingWorkflow.id
    Write-Host "  Found workflow: $workflowName (ID: $workflowId)" -ForegroundColor Green
    
} catch {
    Write-Host "[ERROR] Failed to fetch workflows: $($_.Exception.Message)" -ForegroundColor Red
    
    # Try to get more details about the error
    if ($_.Exception.Response) {
        try {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            Write-Host "Response body: $responseBody" -ForegroundColor Yellow
        } catch {
            # Ignore if we can't read the response
        }
    }
    
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "  1. Make sure n8n is running: docker-compose ps" -ForegroundColor White
    Write-Host "  2. Check URL: $N8nUrl" -ForegroundColor White
    Write-Host "  3. Verify credentials match docker-compose.yml" -ForegroundColor White
    Write-Host "  4. Try accessing n8n in browser: $N8nUrl" -ForegroundColor White
    Write-Host ""
    Write-Host "Note: n8n might require API keys instead of basic auth." -ForegroundColor Yellow
    Write-Host "Check Settings > API in n8n UI to create an API key." -ForegroundColor Yellow
    exit 1
}

# Prepare update payload - use the existing workflow structure and merge updates
Write-Host "Preparing update payload..." -ForegroundColor Yellow

# Get the full existing workflow to preserve all fields
try {
    if ($useApiKey) {
        $getHeaders = @{
            "X-N8N-API-KEY" = $ApiKey
        }
        $existingWorkflowFull = Invoke-RestMethod -Uri "$N8nUrl/api/v1/workflows/$workflowId" -Method Get -Headers $getHeaders
    } elseif ($session) {
        $getHeaders = @{
            "Content-Type" = "application/json"
        }
        $existingWorkflowFull = Invoke-RestMethod -Uri "$N8nUrl/api/v1/workflows/$workflowId" -Method Get -Headers $getHeaders -WebSession $session
    } else {
        $base64AuthInfo = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${Username}:${Password}"))
        $getHeaders = @{
            "Authorization" = "Basic $base64AuthInfo"
            "Content-Type" = "application/json"
        }
        $existingWorkflowFull = Invoke-RestMethod -Uri "$N8nUrl/api/v1/workflows/$workflowId" -Method Get -Headers $getHeaders
    }
    
    # Merge: keep existing workflow structure, update with new nodes/connections
    $existingData = $existingWorkflowFull.data
    
    # Build update payload - preserve all existing fields, update with new data
    $updatePayload = @{
        name = $workflowJson.name
        nodes = $workflowJson.nodes
        connections = $workflowJson.connections
    }
    
    # Preserve important fields from existing workflow
    if ($existingData.active -ne $null) { $updatePayload.active = $existingData.active }
    if ($existingData.settings) { $updatePayload.settings = $existingData.settings }
    if ($existingData.staticData) { $updatePayload.staticData = $existingData.staticData }
    if ($existingData.tags) { $updatePayload.tags = $existingData.tags }
    if ($existingData.pinData) { $updatePayload.pinData = $existingData.pinData }
    
    # Override with values from JSON file if they exist
    if ($workflowJson.settings) { $updatePayload.settings = $workflowJson.settings }
    if ($workflowJson.staticData) { $updatePayload.staticData = $workflowJson.staticData }
    if ($workflowJson.tags) { $updatePayload.tags = $workflowJson.tags }
    
    $updatePayload = $updatePayload | ConvertTo-Json -Depth 100 -Compress:$false
} catch {
    Write-Host "[WARNING] Could not fetch existing workflow details, using minimal payload" -ForegroundColor Yellow
    # Fallback: minimal payload
    $updatePayload = @{
        name = $workflowJson.name
        nodes = $workflowJson.nodes
        connections = $workflowJson.connections
    }
    if ($workflowJson.settings) { $updatePayload.settings = $workflowJson.settings }
    if ($workflowJson.staticData) { $updatePayload.staticData = $workflowJson.staticData }
    if ($workflowJson.tags) { $updatePayload.tags = $workflowJson.tags }
    
    $updatePayload = $updatePayload | ConvertTo-Json -Depth 100
}

# Update the workflow
Write-Host ""
Write-Host "Updating workflow..." -ForegroundColor Yellow

# Debug: Show payload size
$payloadSize = ([System.Text.Encoding]::UTF8.GetByteCount($updatePayload)) / 1KB
Write-Host "  Payload size: $([math]::Round($payloadSize, 2)) KB" -ForegroundColor Gray

try {
    $updateHeaders = @{
        "Content-Type" = "application/json"
    }
    
    if ($useApiKey) {
        $updateHeaders["X-N8N-API-KEY"] = $ApiKey
        $updateResponse = Invoke-RestMethod -Uri "$N8nUrl/api/v1/workflows/$workflowId" -Method Put -Headers $updateHeaders -Body $updatePayload -ErrorAction Stop
    } elseif ($session) {
        $updateResponse = Invoke-RestMethod -Uri "$N8nUrl/api/v1/workflows/$workflowId" -Method Put -Headers $updateHeaders -Body $updatePayload -WebSession $session -ErrorAction Stop
    } else {
        $base64AuthInfo = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${Username}:${Password}"))
        $updateHeaders["Authorization"] = "Basic $base64AuthInfo"
        $updateResponse = Invoke-RestMethod -Uri "$N8nUrl/api/v1/workflows/$workflowId" -Method Put -Headers $updateHeaders -Body $updatePayload -ErrorAction Stop
    }
    
    Write-Host "  [SUCCESS] Workflow updated successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Workflow details:" -ForegroundColor Cyan
    Write-Host "  Name: $($updateResponse.data.name)" -ForegroundColor White
    Write-Host "  ID: $($updateResponse.data.id)" -ForegroundColor White
    Write-Host "  Active: $($updateResponse.data.active)" -ForegroundColor White
    Write-Host ""
    Write-Host "You can view it at: $N8nUrl/workflow/$workflowId" -ForegroundColor Cyan
    
} catch {
    Write-Host "[ERROR] Failed to update workflow: $($_.Exception.Message)" -ForegroundColor Red
    
    # Get detailed error response
    if ($_.Exception.Response) {
        try {
            $errorStream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($errorStream)
            $responseBody = $reader.ReadToEnd()
            Write-Host ""
            Write-Host "Error Response:" -ForegroundColor Yellow
            Write-Host $responseBody -ForegroundColor Red
            Write-Host ""
            
            # Try to parse as JSON for better readability
            try {
                $errorJson = $responseBody | ConvertFrom-Json
                if ($errorJson.message) {
                    Write-Host "Error Message: $($errorJson.message)" -ForegroundColor Red
                }
                if ($errorJson.error) {
                    Write-Host "Error Details: $($errorJson.error)" -ForegroundColor Red
                }
            } catch {
                # Not JSON, that's fine
            }
        } catch {
            Write-Host "Could not read error response" -ForegroundColor Yellow
        }
    }
    
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "  - Check if workflow JSON structure matches n8n's expected format" -ForegroundColor White
    Write-Host "  - Verify all node IDs and connections are valid" -ForegroundColor White
    Write-Host "  - Try importing manually in n8n UI to see if there are validation errors" -ForegroundColor White
    
    exit 1
}

Write-Host ""
Write-Host "Done! ✅" -ForegroundColor Green

