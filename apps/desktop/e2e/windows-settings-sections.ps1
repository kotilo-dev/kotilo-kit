# Settings 1.1.1: start_hidden = false opens the full window at launch -> Genel, Kısayollar (record a new
# global shortcut, then use it to open the palette), Pano algılama, Gizlilik, Hakkında -> language switch.
# Same safety rules as windows.ps1: isolated %APPDATA%, keys only while our window owns the foreground,
# clipboard restored afterwards. Buttons go through UI Automation. Screenshots go to -Out.
param(
  [string]$Exe,
  [string]$Out = (Join-Path $env:TEMP "kit-e2e-settings-sections")
)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force $Out | Out-Null
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class W5 {
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  public static void Down(byte vk) { keybd_event(vk, 0, 0, UIntPtr.Zero); }
  public static void Up(byte vk) { keybd_event(vk, 0, 2, UIntPtr.Zero); }
  public static void Tap(byte vk) { Down(vk); Up(vk); }
  public static uint FgPid() { uint p; GetWindowThreadProcessId(GetForegroundWindow(), out p); return p; }
}
"@
[W5]::SetProcessDPIAware() | Out-Null

function Snap([string]$name) {
  # never capture someone else's window
  if ([W5]::FgPid() -ne $proc.Id) { throw "E2E_ABORT: Kit lost the foreground before $name" }
  $r = New-Object W5+RECT
  [W5]::GetWindowRect([W5]::GetForegroundWindow(), [ref]$r) | Out-Null
  $bmp = New-Object System.Drawing.Bitmap ($r.Right - $r.Left), ($r.Bottom - $r.Top)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($r.Left, $r.Top, 0, 0, $bmp.Size)
  $bmp.Save((Join-Path $Out $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  "SNAP $name $($r.Right - $r.Left)x$($r.Bottom - $r.Top)"
}
function Ours { [W5]::FgPid() -eq $proc.Id }
function Combo([byte[]]$mods, [byte]$key) { foreach ($m in $mods) { [W5]::Down($m) }; [W5]::Tap($key); [array]::Reverse($mods); foreach ($m in $mods) { [W5]::Up($m) } }
$CTRL = 0x11; $SHIFT = 0x10; $ALT = 0x12; $ESC = 0x1B

function Find([string]$name) {
  $root = [System.Windows.Automation.AutomationElement]::FromHandle([W5]::GetForegroundWindow())
  $cond = New-Object System.Windows.Automation.PropertyCondition ([System.Windows.Automation.AutomationElement]::NameProperty), $name
  $el = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
  if ($null -eq $el) { throw "UIA: '$name' not found" }
  $el
}
function Press([string]$name) {
  $el = Find $name
  foreach ($p in @([System.Windows.Automation.InvokePattern]::Pattern, [System.Windows.Automation.TogglePattern]::Pattern)) {
    $obj = $null
    if ($el.TryGetCurrentPattern($p, [ref]$obj)) {
      if ($obj -is [System.Windows.Automation.InvokePattern]) { $obj.Invoke() } else { $obj.Toggle() }
      return
    }
  }
  throw "UIA: '$name' has no invoke/toggle pattern"
}

$appdata = Join-Path $Out "appdata"
$cfgDir = Join-Path $appdata "kotilo\kit"
New-Item -ItemType Directory -Force $cfgDir | Out-Null
"[general]`nlocale = `"tr`"`nstart_hidden = false`n[clipboard]`ndetect = true`n[theme]`nid = `"catppuccin-mocha`"`nfollow_system = false`n[recent]`nids = [`"jwt`", `"base64`"]`nused = [1, 2]`n" | Set-Content -Encoding utf8 (Join-Path $cfgDir "config.toml")

$saved = Get-Clipboard -Raw -ErrorAction SilentlyContinue
$env:APPDATA = $appdata
$proc = Start-Process -FilePath $Exe -PassThru
Start-Sleep -Seconds 5

try {
  # start_hidden = false: the full window is up without pressing anything
  if (-not (Ours)) { "E2E_FAIL: full window not shown at launch (start_hidden = false)"; return }
  "OK start_hidden=false shows the full window"
  Press "Ayarlar"; Start-Sleep -Milliseconds 600
  Press "Genel"; Start-Sleep -Milliseconds 400; Snap "general.png"
  Press "Kısayollar"; Start-Sleep -Milliseconds 400; Snap "shortcuts.png"

  # record Ctrl+Alt+J: focus the button, start recording, press the combo on it
  $btn = Find "Değiştir"; $btn.SetFocus(); Press "Değiştir"; Start-Sleep -Milliseconds 300
  Snap "shortcuts-recording.png"
  if (-not (Ours)) { "E2E_ABORT: lost focus"; return }
  Combo @($CTRL, $ALT) 0x4A; Start-Sleep -Milliseconds 600
  Snap "shortcuts-recorded.png"
  $cfg = Get-Content -Raw (Join-Path $cfgDir "config.toml")
  if ($cfg -notmatch 'hotkey = "Ctrl\+Alt\+J"') { "E2E_FAIL: hotkey not saved"; $cfg; return }
  "OK hotkey saved as Ctrl+Alt+J"

  # the new shortcut opens the palette right away, the old one no longer does
  Combo @($CTRL, $ALT) 0x4A; Start-Sleep -Milliseconds 700
  Snap "palette-new-hotkey.png"
  $r = New-Object W5+RECT; [W5]::GetWindowRect([W5]::GetForegroundWindow(), [ref]$r) | Out-Null
  $w = $r.Right - $r.Left
  "palette width $w"
  [W5]::Tap($ESC); Start-Sleep -Milliseconds 400

  Press "Pano algılama"; Start-Sleep -Milliseconds 400; Snap "clipboard.png"
  Press "Gizlilik"; Start-Sleep -Milliseconds 400; Snap "privacy.png"
  Press "Hakkında"; Start-Sleep -Milliseconds 400; Snap "about.png"
  Press "Genel"; Start-Sleep -Milliseconds 300
  Press "English"; Start-Sleep -Milliseconds 600; Snap "general-en.png"
  $cfg = Get-Content -Raw (Join-Path $cfgDir "config.toml")
  $cfg
  if ($cfg -match 'locale = "en"') { "E2E_PASS: settings sections, live hotkey, start_hidden, language" } else { "E2E_FAIL: locale not saved" }
} finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  if ($null -ne $saved) { Set-Clipboard -Value $saved }
}
