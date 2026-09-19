; PicoView Windows installer (Inno Setup 6).
;
; Conventional machine install to Program Files with Start Menu entry,
; uninstall support, and Open With-capable file association registration.
; The association registration itself is performed by the product binary
; (picoview.exe --register-associations, HKCU, OpenWithProgids only) so the
; registry contract stays in one place — native/src/associations.rs. This
; script deliberately does NOT write its own ProgID/extension keys and does
; NOT change any user default viewer.

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
; NOT marked postinstall. Registered only as a capable handler; defaults
; unchanged. Note: the elevated installer runs this as the installing user,
; so HKCU lands in that user's hive — per-user OpenWith data is
; inherently per-user.
Filename: "{app}\{#AppExe}"; Parameters: "--register-associations"; Flags: runhidden
Filename: "{app}\{#AppExe}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{app}\{#AppExe}"; Parameters: "--unregister-associations"; Flags: runhidden; RunOnceId: "UnregisterAssoc"
