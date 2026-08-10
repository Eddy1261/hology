; AI CONNECT Windows uninstall policy:
; - Normal/silent uninstall preserves user-local data.
; - Interactive uninstall asks whether to delete local application data.
; - "No" keeps data; "Yes" removes only AI CONNECT's app-specific
;   roaming/local data directories.
;
; There are TWO distinct data roots, and the destructive branch must cover
; both or it deletes nothing the user cares about:
;
;   1. %LOCALAPPDATA%\aiconnect  — the RUNTIME state root. This is
;      `context_store::store::data_dir()` (packages/context-store/src/store.rs),
;      which `spawn_gateway` passes to the sidecar as AICONNECT_DATA_DIR
;      (apps/desktop/src-tauri/src/lib.rs). It holds connectors\, projects\,
;      skills\, leases\, logs\ and vault.key — i.e. every installed connector,
;      every project and every skill.
;   2. %APPDATA%\app.aiconnect.desktop and %LOCALAPPDATA%\app.aiconnect.desktop
;      — the Tauri app_data_dir: the persisted session record and the
;      diagnostic logs written by the `diag` command.
;
; This hook previously removed only (2). Because the gateway's startup
; reconciliation (`load_installed`) rebuilds its inventory from (1), every
; "deleted" connector reappeared on the next install — which read as a broken
; delete rather than a wrong uninstall path.
;
; Known limitation: if AICONNECT_DATA_DIR was overridden in the environment,
; the runtime root is elsewhere and NSIS cannot resolve it. This hook covers
; the default location only.

!macro NSIS_HOOK_PREUNINSTALL
  ; Stop the gateway sidecar first, on EVERY uninstall path including the
  ; silent update path. It is a child process of the app, not of the
  ; installer, and it holds the redb store files open — leaving it running
  ; makes the RMDir /r below fail part-way and leaves a half-deleted store.
  nsExec::Exec 'taskkill /F /T /IM gateway.exe'
  Pop $0
  nsExec::Exec 'taskkill /F /T /IM mcp-stdio-bridge.exe'
  Pop $0

  ; Never delete user data from a silent uninstall/update path.
  IfSilent done

  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 \
    "AI CONNECT will be uninstalled from this computer.$\r$\n$\r$\nKeep your local AI CONNECT data (projects, installed MCP connectors, skills, context, and other local application data)?$\r$\n$\r$\nClick Yes to keep your data.$\r$\nClick No to permanently delete the local AI CONNECT data from this device." \
    IDYES done

  ; Destructive choice: remove only AI CONNECT's app-specific directories.
  ; This does not touch Supabase/cloud account data.
  RMDir /r "$LOCALAPPDATA\aiconnect"
  RMDir /r "$APPDATA\app.aiconnect.desktop"
  RMDir /r "$LOCALAPPDATA\app.aiconnect.desktop"

done:
!macroend
