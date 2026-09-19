; PicoView Windows installer (Inno Setup 6).
;
; Conventional machine install to Program Files with Start Menu entry,
; uninstall support, and Open With-capable file association registration.
; The association registration itself is performed by the product binary
; (picoview.exe --register-associations, HKCU, OpenWithProgids only) so the
; registry contract stays in one place — native/src/associations.rs. This
; script deliberately does NOT write its own ProgID/extension keys and does
; NOT change any user default viewer.
;
; Elevation and per-user registration are deliberately kept separate: the
; installer is elevated for Program Files, but the association registration is
; a per-user HKCU write and is therefore run as the original (launching) user.
; See the [Run] and [UninstallRun] comments for the exact behavior, including
; the alternate-credential case Setup cannot recover from.

#define AppName "PicoView"
#define AppExe "picoview.exe"
; Single version authority: scripts/build-windows-release.ps1 passes
; /DAppVersion from native/Cargo.toml. Standalone ISCC builds fall back to
; the version baked into the release EXE (same Cargo.toml via build.rs).
#ifndef AppVersion
#define AppVersion GetVersionNumbersString(SourcePath + "\..\..\native\target\release\picoview.exe")
#endif

[Setup]
AppId={{A7C3E0C1-2F5B-4A6E-9C4D-8B1D3E5F7A92}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
VersionInfoProductName={#AppName}
VersionInfoProductTextVersion={#AppVersion}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
; Repository declares no user-facing EULA; none shown.
OutputDir=..\..\dist-release
OutputBaseFilename=PicoView-{#AppVersion}-windows-x64-setup
SetupIconFile=..\..\assets\branding\picoview-app.ico
UninstallDisplayIcon={app}\{#AppExe}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible
; The installer itself runs elevated (Program Files). The installed product
; never requires elevation.
PrivilegesRequired=admin
Uninstallable=yes

[Files]
Source: "..\..\native\target\release\picoview.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"; IconFilename: "{app}\{#AppExe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; IconFilename: "{app}\{#AppExe}"; Tasks: desktopicon

[Tasks]
; Windows convention: Start Menu = normal, desktop shortcut = optional.
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Run]
; Register Open With capability (HKCU). Runs silently as part of install;
; NOT marked postinstall. Registered only as a capable handler; no extension
; default is written and no UserChoice value is written.
;
; `runasoriginaluser` is a correctness requirement here, not a style choice.
; Setup itself is elevated (PrivilegesRequired=admin, because it installs to
; Program Files) while the registration target is HKCU, so the two must not
; be conflated:
;
;   normal launch + UAC consent — the entry runs with the credentials of the
;   user who started Setup, which is the intent, and the keys land in that
;   user's own hive. This also covers over-the-shoulder elevation, where the
;   administrator approving the prompt is a different account from the user
;   who launched Setup: registration still lands in the launching user's hive.
;
;   explicit "Run as administrator", or launch from an already-elevated
;   process — Windows does not create a linked un-elevated token on that
;   launch path, so there is no original user identity left to recover and
;   Inno falls back to Setup's own elevated credentials. The keys then land
;   in that administrator's hive. No in-installer workaround is attempted.
;
; The product binary owns the registry contract (native/src/associations.rs);
; this script names no ProgID and no extension key of its own.
Filename: "{app}\{#AppExe}"; Parameters: "--register-associations"; Flags: runhidden runasoriginaluser
Filename: "{app}\{#AppExe}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; The uninstaller is elevated, so this removes the registration belonging to
; the identity performing the uninstall — complete cleanup for the ordinary
; same-user case. Known limitation, recorded rather than redesigned: when the
; install was performed with alternate-credential elevation ("Run as
; administrator", or approved by a different administrator account), the
; install-time HKCU keys were written under the original user, while this
; uninstall runs as that administrator. Cross-user HKCU cleanup is then
; incomplete — the per-user ProgID and OpenWithProgids entries remain in the
; original user's hive, and that account can clear them by running
; `picoview.exe --unregister-associations`. Reaching into another user's hive
; is out of scope for this installer.
Filename: "{app}\{#AppExe}"; Parameters: "--unregister-associations"; Flags: runhidden; RunOnceId: "UnregisterAssoc"
