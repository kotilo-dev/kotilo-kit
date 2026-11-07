# Settings › Appearance (K3): full window -> "Ayarlar" -> theme card -> compact + radius 4 + opacity 70 -> palette.
# Same safety rules as windows.ps1: isolated %APPDATA%, keys only while our window owns the foreground,
# clipboard restored afterwards. Buttons are pressed through UI Automation (WebView2 exposes the
# accessibility tree), so no screen coordinates. Screenshots go to -Out; config.toml is checked at the end.
param(
  [string]$Exe,
  [string]$Out = (Join-Path $env:TEMP "kit-e2e-settings"),
  [string]$Locale = "tr"
)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force $Out | Out-Null
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class W4 {
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
[W4]::SetProcessDPIAware() | Out-Null

function Snap([string]$name) {
  $r = New-Object W4+RECT
  [W4]::GetWindowRect([W4]::GetForegroundWindow(), [ref]$r) | Out-Null
  $bmp = New-Object System.Drawing.Bitmap ($r.Right - $r.Left), ($r.Bottom - $r.Top)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($r.Left, $r.Top, 0, 0, $bmp.Size)
  $bmp.Save((Join-Path $Out $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  "SNAP $name $($r.Right - $r.Left)x$($r.Bottom - $r.Top)"
}
function Ours { [W4]::FgPid() -eq $proc.Id }
function Combo([byte[]]$mods, [byte]$key) { foreach ($m in $mods) { [W4]::Down($m) }; [W4]::Tap($key); [array]::Reverse($mods); foreach ($m in $mods) { [W4]::Up($m) } }
function TypeText([string]$s) { foreach ($ch in $s.ToUpper().ToCharArray()) { [W4]::Tap([byte][char]$ch); Start-Sleep -Milliseconds 20 } }
$CTRL = 0x11; $SHIFT = 0x10; $ENTER = 0x0D; $ESC = 0x1B

# Find a control by accessible name inside the foreground window and invoke/toggle/select it.
function Press([string]$name) {
  $root = [System.Windows.Automation.AutomationElement]::FromHandle([W4]::GetForegroundWindow())
  $cond = New-Object System.Windows.Automation.PropertyCondition ([System.Windows.Automation.AutomationElement]::NameProperty), $name
  $el = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
  if ($null -eq $el) { throw "UIA: '$name' not found" }
  foreach ($p in @([System.Windows.Automation.InvokePattern]::Pattern, [System.Windows.Automation.TogglePattern]::Pattern, [System.Windows.Automation.SelectionItemPattern]::Pattern)) {
    $obj = $null
    if ($el.TryGetCurrentPattern($p, [ref]$obj)) {
      if ($obj -is [System.Windows.Automation.InvokePattern]) { $obj.Invoke() }
      elseif ($obj -is [System.Windows.Automation.TogglePattern]) { $obj.Toggle() }
      else { $obj.Select() }
      return
    }
  }
  throw "UIA: '$name' has no invoke/toggle/select pattern"
}
function SetRange([string]$name, [double]$value) {
  $root = [System.Windows.Automation.AutomationElement]::FromHandle([W4]::GetForegroundWindow())
  $byName = New-Object System.Windows.Automation.PropertyCondition ([System.Windows.Automation.AutomationElement]::NameProperty), $name
  $slider = New-Object System.Windows.Automation.PropertyCondition ([System.Windows.Automation.AutomationElement]::ControlTypeProperty), ([System.Windows.Automation.ControlType]::Slider)
  $el = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, (New-Object System.Windows.Automation.AndCondition $byName, $slider))
  if ($null -eq $el) { throw "UIA: slider '$name' not found" }
  $el.GetCurrentPattern([System.Windows.Automation.RangeValuePattern]::Pattern).SetValue($value)
}

$appdata = Join-Path $Out "appdata"
$cfgDir = Join-Path $appdata "kotilo\kit"
New-Item -ItemType Directory -Force $cfgDir | Out-Null
"[general]`nlocale = `"$Locale`"`n[clipboard]`ndetect = true`n[theme]`nid = `"catppuccin-mocha`"`nfollow_system = false`n" | Set-Content -Encoding utf8 (Join-Path $cfgDir "config.toml")

$saved = Get-Clipboard -Raw -ErrorAction SilentlyContinue
Set-Clipboard -Value "SGVsbG8="
$env:APPDATA = $appdata
$proc = Start-Process -FilePath $Exe -PassThru
Start-Sleep -Seconds 5

try {
  Combo @($CTRL, $SHIFT) 0x4B; Start-Sleep -Milliseconds 500
  if (-not (Ours)) { "E2E_ABORT: palette not focused"; return }
  TypeText "base64"; Start-Sleep -Milliseconds 200
  Combo @($CTRL) $ENTER; Start-Sleep -Milliseconds 1200
  if (-not (Ours)) { "E2E_ABORT: full window not focused"; return }
  Press "Ayarlar"; Start-Sleep -Milliseconds 600
  Snap "settings-mocha.png"
  Press "Nord nord"; Start-Sleep -Milliseconds 600
  Snap "settings-nord.png"
  Press "Kompakt yoğunluk"; SetRange "Köşe yarıçapı" 4; SetRange "Palette opaklığı" 70; SetRange "Boyut" 15
  Start-Sleep -Milliseconds 600
  Snap "settings-tweaked.png"
  if (-not (Ours)) { "E2E_ABORT: lost focus"; return }
  [W4]::Tap($ESC); Start-Sleep -Milliseconds 400
  Snap "full-after.png"
  Combo @($CTRL, $SHIFT) 0x4B; Start-Sleep -Milliseconds 700
  Snap "palette-after.png"
  [W4]::Tap($ESC); Start-Sleep -Milliseconds 300
  $cfg = Get-Content -Raw (Join-Path $cfgDir "config.toml")
  $cfg
  $ok = ($cfg -match 'id = "nord"') -and ($cfg -match 'compact = true') -and ($cfg -match 'radius = 4') -and ($cfg -match 'palette_opacity = 70') -and ($cfg -match 'size = 15')
  if ($ok) { "E2E_PASS: settings -> nord card -> compact/radius/opacity/size persisted" } else { "E2E_FAIL: config.toml not updated" }
} finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  if ($null -ne $saved) { Set-Clipboard -Value $saved }
}
