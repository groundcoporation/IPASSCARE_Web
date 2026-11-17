param(
  [Parameter(Mandatory)][string]$Cli,
  [Parameter(Mandatory)][string]$LinkedWorkdir,
  [ValidatePattern('^[0-9a-f]{10}$')][string]$ResumeBatch
)

$ErrorActionPreference='Stop'
$taskRef='msvwhvonafmeycmcvarv'
$taskBase="https://$taskRef.supabase.co"
$taskWorkdir=(Resolve-Path -LiteralPath $LinkedWorkdir).Path
$taskRefPath=Join-Path $taskWorkdir 'supabase/.temp/project-ref'
$taskStage='target'
$taskCreated=0
$taskCredentialFile=$null

try {
  if ((Get-Content -LiteralPath $taskRefPath -Raw).Trim() -cne $taskRef) { throw 'TARGET_MISMATCH' }
  $taskProjects = & $Cli projects list -o json 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'PROJECT_LIST_FAILED' }
  $taskProject = $taskProjects | ConvertFrom-Json | Where-Object { ($_.id -eq $taskRef -or $_.ref -eq $taskRef) -and $_.name -ceq 'IPASSCARE-develop' }
  if (!$taskProject -or $taskProject.status -ne 'ACTIVE_HEALTHY') { throw 'DEVELOP_NOT_HEALTHY' }

  $taskStage='api_keys'
  $taskKeysJson = & $Cli projects api-keys --project-ref $taskRef --reveal -o json 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'KEY_READ_FAILED' }
  $taskKeys = $taskKeysJson | ConvertFrom-Json
  $taskService = @($taskKeys | Where-Object { $_.name -eq 'service_role' })[0].api_key
  $taskAnon = @($taskKeys | Where-Object { $_.name -eq 'anon' })[0].api_key
  if ($taskService -notmatch '^eyJ[^.]+\.[^.]+\.[^.]+$' -or $taskAnon -notmatch '^eyJ[^.]+\.[^.]+\.[^.]+$') { throw 'EXPECTED_LEGACY_KEYS_UNAVAILABLE' }

  if ($ResumeBatch) {
    $taskStage='resume'
    $taskBatch=$ResumeBatch
    $taskCredentialFile=Join-Path $taskWorkdir "IPASSCARE-develop-logins-$taskBatch.json"
    $taskManifest=Get-Content -LiteralPath $taskCredentialFile -Raw | ConvertFrom-Json -AsHashtable
    if ($taskManifest.project -cne 'IPASSCARE-develop' -or $taskManifest.batch -cne $taskBatch -or $taskManifest.accounts.Count -ne 8) { throw 'INVALID_RESUME_MANIFEST' }
    $taskAccounts=$taskManifest.accounts
    $taskPriorSql=Get-Content -LiteralPath (Join-Path $taskWorkdir "develop-smoke-$taskBatch.sql") -Raw
    $taskRows = foreach ($taskAccount in $taskAccounts) {
      if ($taskAccount.role -cnotmatch '^(admin|director-a|director-b|teacher|driver|parent-a|parent-b|parent-pages)$' -or $taskAccount.email -cne "ipass-dev-$taskBatch-$($taskAccount.role)@example.com") { throw 'INVALID_RESUME_MANIFEST' }
      $taskMatch=[regex]::Match($taskPriorSql,"\('$($taskAccount.role)','([0-9a-f-]{36})'::uuid,'$([regex]::Escape($taskAccount.email))'\)")
      if (!$taskMatch.Success) { throw 'INVALID_RESUME_ACCOUNTS' }
      $taskAccount.id=([guid]$taskMatch.Groups[1].Value).ToString()
      "('$($taskAccount.role)','$($taskAccount.id)'::uuid,'$($taskAccount.email)')"
    }
    $taskCreated=8
  } else {
  $taskBatch=[guid]::NewGuid().ToString('N').Substring(0,10)
  $taskAccounts = foreach ($taskSlug in @('admin','director-a','director-b','teacher','driver','parent-a','parent-b','parent-pages')) {
    $taskBytes=[byte[]]::new(24)
    [Security.Cryptography.RandomNumberGenerator]::Fill($taskBytes)
    @{ role=$taskSlug; email="ipass-dev-$taskBatch-$taskSlug@example.com"; password=('D3v!' + [Convert]::ToHexString($taskBytes).ToLowerInvariant()) }
  }
  $taskCredentialFile=Join-Path $taskWorkdir "IPASSCARE-develop-logins-$taskBatch.json"
  @{ project='IPASSCARE-develop'; batch=$taskBatch; accounts=$taskAccounts } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $taskCredentialFile -Encoding utf8NoBOM

  $taskStage='auth_create'
  $taskRows = foreach ($taskAccount in $taskAccounts) {
    $taskUser = Invoke-RestMethod -Method Post -Uri "$taskBase/auth/v1/admin/users" -TimeoutSec 25 -ContentType 'application/json' -Headers @{ apikey=$taskService; Authorization="Bearer $taskService" } -Body (@{
      email=$taskAccount.email; password=$taskAccount.password; email_confirm=$true
      user_metadata=@{ fixture_batch=$taskBatch; test_account=$true }
    } | ConvertTo-Json -Compress)
    [guid]$taskId=[guid]::Empty
    if (![guid]::TryParse([string]$taskUser.id,[ref]$taskId) -or $taskUser.email -cne $taskAccount.email) { throw 'UNEXPECTED_AUTH_RESPONSE' }
    $taskAccount.id=$taskId.ToString()
    $taskCreated++
    "('$($taskAccount.role)','$taskId'::uuid,'$($taskAccount.email)')"
  }
  }

  $taskStage='sample_data'
  $taskExample=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'develop_smoke.sql') -Raw
  $taskSql=$taskExample.Replace('__BATCH__',$taskBatch).Replace('__ACCOUNT_VALUES__',($taskRows -join ','))
  $taskSqlPath=Join-Path $taskWorkdir "develop-smoke-$taskBatch.sql"
  $taskSql | Set-Content -LiteralPath $taskSqlPath -Encoding utf8NoBOM
  if ((Get-Content -LiteralPath $taskRefPath -Raw).Trim() -cne $taskRef) { throw 'TARGET_MISMATCH' }
  $taskRun = & $Cli --workdir $taskWorkdir db query --linked --file $taskSqlPath -o json 2>&1
  if ($LASTEXITCODE -ne 0) {
    # Only a SQLSTATE is safe to output; don't log DB messages or credentials.
    $taskSqlCode = [regex]::Match(($taskRun -join "`n"),'(?i)SQLSTATE[ :]+([0-9A-Z]{5})')
    if ($taskSqlCode.Success) { Write-Output "SQLSTATE: $($taskSqlCode.Groups[1].Value)" }
    throw 'SEED_QUERY_FAILED'
  }

  $taskStage='auth_verify'
  $taskVerified=0
  foreach ($taskAccount in $taskAccounts) {
    $taskSession=Invoke-RestMethod -Method Post -Uri "$taskBase/auth/v1/token?grant_type=password" -TimeoutSec 25 -ContentType 'application/json' -Headers @{ apikey=$taskAnon } -Body (@{ email=$taskAccount.email; password=$taskAccount.password } | ConvertTo-Json -Compress)
    if ($taskSession.user.id -ne $taskAccount.id -or !$taskSession.access_token) { throw 'AUTH_VERIFICATION_FAILED' }
    $taskProfile=Invoke-RestMethod -Method Get -Uri "$taskBase/rest/v1/users?select=role,branch_id&id=eq.$($taskAccount.id)" -TimeoutSec 25 -Headers @{ apikey=$taskAnon; Authorization="Bearer $($taskSession.access_token)" }
    $taskRole=switch -Wildcard ($taskAccount.role) { 'director-*' {'director'} 'parent-*' {'user'} default {$taskAccount.role} }
    $taskBranch=if ($taskAccount.role -in @('director-b','parent-b')) {"devsmoke-$taskBatch-2"} elseif ($taskAccount.role -ne 'admin') {"devsmoke-$taskBatch-1"} else {$null}
    if ($taskProfile.Count -ne 1 -or $taskProfile[0].role -ne $taskRole -or $taskProfile[0].branch_id -ne $taskBranch) { throw 'PROFILE_VERIFICATION_FAILED' }
    $taskVerified++
  }

  @{ result='OK'; project='IPASSCARE-develop'; batch=$taskBatch; accounts=$taskCreated; verified=$taskVerified; branches=2; children=25; credentialFile=$taskCredentialFile } | ConvertTo-Json -Compress
} catch {
  @{ result='STOPPED'; stage=$taskStage; authenticatedAccountsCreated=$taskCreated; credentialFile=$taskCredentialFile; code=if ($_.Exception.Message -cmatch '^[A-Z_]+$') {$_.Exception.Message} else {'REQUEST_FAILED'} } | ConvertTo-Json -Compress
  exit 1
} finally {
  $taskKeys=$null; $taskKeysJson=$null; $taskService=$null; $taskAnon=$null; $taskSession=$null; $taskAccount=$null; $taskAccounts=$null
}
