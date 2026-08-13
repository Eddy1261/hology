//! Phase 5R — offline local-data layer (Tauri side).
//!
//! When the gateway process is NOT running, the desktop shell becomes the
//! temporary single writer over the SAME redb files the gateway owns when
//! it is active (`context_store::store::data_dir()`). redb's exclusive file
//! lock makes dual ownership impossible: whichever process opens a store
//! first owns it; the other gets `DatabaseAlreadyOpen`. The frontend only
//! calls these commands while `state.online === false`, so the ownership
//! transition is:
//!
//! ```text
//! gateway running  → gateway owns persistence (HTTP path only)
//! gateway stopped  → desktop owns persistence (this layer)
//! gateway starts   → desktop releases; gateway re-opens the SAME files and
//!                    observes offline-created data (zero migration)
//! ```
//!
//! Security: this layer performs NO token/JWT/entitlement logic. It reads
//! and writes locally owned data only (projects registry, project stores,
//! skill entities). Protected capabilities (connector activation, MCP,
//! marketplace, artifact downloads) are NEVER reachable here — they live in
//! the gateway/auth paths and are unavailable when the gateway is down.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use context_store::{Entity, RelationInput, RememberInput, ScopeFilter, Store};
use serde::Serialize;

/// Mirror of the gateway's `projects/meta.json` sidecar (project_meta.rs).
/// The gateway binary owns that module; the ~40 lines here duplicate the
/// schema so the desktop can operate the same files offline.
/// ponytail: extract project metadata + active-selection sidecar helpers
/// into packages/context-store when a shared module is justified (3rd
/// consumer) — until then the duplicated surface is the smaller change.

pub fn projects_dir() -> PathBuf {
    context_store::store::data_dir().join("projects")
}

fn meta_path(dir: &Path) -> PathBuf {
    dir.join("meta.json")
}

fn active_path(dir: &Path) -> PathBuf {
    dir.join("active.json")
}

fn load_meta(dir: &Path) -> HashMap<String, ProjectMeta> {
    std::fs::read_to_string(meta_path(dir))
        .ok()
        .and_then(|s| serde_json::from_str::<HashMap<String, ProjectMeta>>(&s).ok())
        .unwrap_or_default()
}

fn persist_meta(dir: &Path, meta: &HashMap<String, ProjectMeta>) -> Result<(), String> {
    let tmp = dir.join("meta.json.tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(meta).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    installer::rename_with_retry(&tmp, &meta_path(dir)).map_err(|e| e.to_string())
}

fn load_active(dir: &Path) -> Option<String> {
    std::fs::read_to_string(active_path(dir))
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn persist_active(dir: &Path, project_id: Option<&str>) -> Result<(), String> {
    let tmp = dir.join("active.json.tmp");
    std::fs::write(&tmp, project_id.unwrap_or("")).map_err(|e| e.to_string())?;
    installer::rename_with_retry(&tmp, &active_path(dir)).map_err(|e| e.to_string())
}

#[derive(Clone, Serialize, serde::Deserialize)]
struct ProjectMeta {
    display_name: String,
    created_at: i64,
    updated_at: i64,
}

#[derive(Clone, Serialize)]
pub struct OfflineProject {
    pub id: String,
    pub name: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Clone, Serialize)]
pub struct OfflineSkill {
    pub id: String,
    pub name: String,
    pub content: String,
    pub enabled: bool,
    pub updated: i64,
}

/// Mirror of gateway `project_meta::valid_project_id` — alphanumeric plus
/// `-` `_` `.` (keeps the file path inside the projects dir by construction).
fn valid_project_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
}

/// Reject the reserved internal store ids before any path is built from them.
/// Mirrors the gateway's guard in `projects_create` / `projects_delete`:
/// `projects/desktop.db` is the global skills store, so creating, deleting or
/// activating "desktop" as a project corrupts or destroys it.
fn reject_reserved(project_id: &str) -> Result<(), String> {
    if context_store::store::is_reserved_project_id(project_id) {
        return Err(format!("{project_id} is a reserved internal store, not a project"));
    }
    Ok(())
}

/// A project exists if either the legacy plaintext `<id>.db` or the encrypted
/// `<id>.db.enc` the gateway writes is present.
fn project_file_exists(dir: &std::path::Path, project_id: &str) -> bool {
    dir.join(format!("{project_id}.db")).is_file()
        || dir.join(format!("{project_id}.db.enc")).is_file()
}

fn valid_display_name(name: &str) -> bool {
    let t = name.trim();
    !t.is_empty() && t.chars().count() <= 120
}

/// Mirror of gateway `humanize_id`: `road-design-2026` → `Road Design 2026`.
fn humanize_id(id: &str) -> String {
    id.split(['-', '_', '.'])
        .filter(|s| !s.is_empty())
        .map(|w| {
            let mut c = w.chars();
            match c.next() {
                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn project_from_id(_dir: &Path, meta: &HashMap<String, ProjectMeta>, id: &str) -> OfflineProject {
    let m = meta.get(id);
    let (name, created, updated) = match m {
        Some(m) => (m.display_name.clone(), m.created_at, m.updated_at),
        None => (humanize_id(id), 0, 0),
    };
    OfflineProject { id: id.to_string(), name, created_at: created, updated_at: updated }
}

// --- Projects ---------------------------------------------------------------

/// List local projects from the registry dir + meta.json (offline).
#[tauri::command]
pub fn offline_list_projects() -> Result<Vec<OfflineProject>, String> {
    let dir = projects_dir();
    let meta = load_meta(&dir);
    let mut out: Vec<OfflineProject> = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        // Gateway-managed projects are stored encrypted as `<id>.db.enc`;
        // matching only `.db` hid every one of them from the offline layer.
        let id = name
            .strip_suffix(".db.enc")
            .or_else(|| name.strip_suffix(".db"));
        if let Some(id) = id {
            // `projects/desktop.db` is the GLOBAL skills store, not a project
            // (see context_store::store::RESERVED_PROJECT_IDS). Listing it
            // produced a phantom "Desktop" project that came back after every
            // restart and whose deletion wiped every skill.
            if context_store::store::is_reserved_project_id(id) {
                continue;
            }
            if !out.iter().any(|p| p.id == id) {
                out.push(project_from_id(&dir, &meta, id));
            }
        }
    }
    out.sort_by(|a, b| a.created_at.cmp(&b.created_at).then_with(|| a.id.cmp(&b.id)));
    Ok(out)
}

/// Create a local project (registry .db + optional meta entry). 409-style
/// error if it already exists.
#[tauri::command]
pub fn offline_create_project(
    project_id: String,
    display_name: Option<String>,
) -> Result<(), String> {
    if !valid_project_id(&project_id) {
        return Err("invalid project_id (alphanumeric, '-', '_', '.' only)".into());
    }
    reject_reserved(&project_id)?;
    if let Some(d) = &display_name {
        if !valid_display_name(d) {
            return Err("invalid display_name".into());
        }
    }
    let dir = projects_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{project_id}.db"));
    if path.exists() {
        return Err(format!("project {project_id} already exists"));
    }
    // Creates the redb schema file (same convention the gateway registry
    // scans). The Store handle is dropped immediately — the file is the
    // persisted artifact; the gateway re-opens it on next start.
    Store::open(&path, &project_id).map_err(|e| e.to_string())?;
    if let Some(name) = display_name {
        let now = now_ms();
        let mut meta = load_meta(&dir);
        meta.insert(
            project_id,
            ProjectMeta {
                display_name: name.trim().to_string(),
                created_at: now,
                updated_at: now,
            },
        );
        if let Err(e) = persist_meta(&dir, &meta) {
            // R2: metadata failure must not leave an orphan <id>.db — roll
            // back the just-created store so create is all-or-nothing.
            let _ = std::fs::remove_file(&path);
            return Err(e);
        }
    }
    Ok(())
}

/// Read one local project (registry entry).
#[tauri::command]
pub fn offline_get_project(project_id: String) -> Result<OfflineProject, String> {
    if !valid_project_id(&project_id) {
        return Err("invalid project_id".into());
    }
    let dir = projects_dir();
    if !dir.join(format!("{project_id}.db")).is_file() {
        return Err(format!("project {project_id} not found"));
    }
    Ok(project_from_id(&dir, &load_meta(&dir), &project_id))
}

/// Rename display identity only — project_id and the store file are immutable.
#[tauri::command]
pub fn offline_rename_project(project_id: String, display_name: String) -> Result<(), String> {
    if !valid_project_id(&project_id) {
        return Err("invalid project_id".into());
    }
    if !valid_display_name(&display_name) {
        return Err("invalid display_name".into());
    }
    let dir = projects_dir();
    if !project_file_exists(&dir, &project_id) {
        return Err(format!("project {project_id} not found"));
    }
    let now = now_ms();
    let mut meta = load_meta(&dir);
    let entry = meta.entry(project_id.clone()).or_insert_with(|| ProjectMeta {
        display_name: humanize_id(&project_id),
        created_at: now,
        updated_at: now,
    });
    entry.display_name = display_name.trim().to_string();
    entry.updated_at = now;
    persist_meta(&dir, &meta)
}

/// Delete a local project: remove the store file + meta entry; clear the
/// active selection if it pointed at this project.
#[tauri::command]
pub fn offline_delete_project(project_id: String) -> Result<(), String> {
    // SKPR-006: without this guard the id below is interpolated straight into a
    // filesystem path, so `../..` deletes arbitrary .db files outside the
    // projects directory.
    if !valid_project_id(&project_id) {
        return Err("invalid project_id".into());
    }
    reject_reserved(&project_id)?;
    let dir = projects_dir();
    let plain = dir.join(format!("{project_id}.db"));
    let enc = dir.join(format!("{project_id}.db.enc"));
    if !plain.is_file() && !enc.is_file() {
        return Err(format!("project {project_id} not found"));
    }
    for path in [&plain, &enc] {
        if path.is_file() {
            std::fs::remove_file(path).map_err(|e| e.to_string())?;
        }
    }
    let mut meta = load_meta(&dir);
    meta.remove(&project_id);
    persist_meta(&dir, &meta)?;
    if load_active(&dir).as_deref() == Some(project_id.as_str()) {
        persist_active(&dir, None)?;
    }
    Ok(())
}

#[tauri::command]
pub fn offline_get_active_project() -> Option<String> {
    load_active(&projects_dir())
}

#[tauri::command]
pub fn offline_set_active_project(project_id: String) -> Result<(), String> {
    if !valid_project_id(&project_id) {
        return Err("invalid project_id".into());
    }
    reject_reserved(&project_id)?;
    let dir = projects_dir();
    if !project_file_exists(&dir, &project_id) {
        return Err(format!("project {project_id} not found"));
    }
    persist_active(&dir, Some(&project_id))
}

#[tauri::command]
pub fn offline_clear_active_project() -> Result<(), String> {
    persist_active(&projects_dir(), None)
}

/// Read the locally persisted sessions of a project (offline Project Detail).
/// `context_store::Session` serializes to the same shape as the gateway's
/// SessionInfo (id, project_id, provider, started_at, last_active_at), so the
/// frontend can reuse the session view model unchanged.
#[tauri::command]
pub fn offline_project_sessions(project_id: String) -> Result<Vec<context_store::Session>, String> {
    if !valid_project_id(&project_id) {
        return Err("invalid project_id".into());
    }
    let dir = projects_dir();
    let path = dir.join(format!("{project_id}.db"));
    if !path.is_file() {
        return Err(format!("project {project_id} not found"));
    }
    // Store handle dropped at end of scope → lock released (ownership handoff
    // invariant: the desktop only holds stores while the gateway is down).
    let store = Store::open(&path, &project_id).map_err(|e| e.to_string())?;
    store.list_sessions().map_err(|e| e.to_string())
}

// --- Skills (global desktop.db) ---------------------------------------------

/// Open the GLOBAL store (skills).
///
/// This layer is only supposed to run while the gateway is DOWN: the gateway
/// holds `<data_dir>/projects/desktop.db` open for its entire lifetime
/// (`apps/gateway/src/main.rs`, `AppState::ctx`), and redb takes an exclusive
/// lock, so a second opener is refused by design.
///
/// It is nonetheless reachable whenever `state.online` is stale — the frontend
/// picks the layer from a cached health probe, not from the lock. When that
/// happens the raw redb text ("Database already open...") surfaced as an
/// opaque failure, and only for skills: `offline_create_project` writes a
/// fresh `<id>.db` nobody holds and succeeded in the same session, which made
/// the two look like unrelated bugs. Say what actually happened instead.
fn desktop_store() -> Result<Store, String> {
    Store::open_default("desktop").map_err(|e| {
        let raw = e.to_string();
        if raw.contains("already open") {
            "the AI CONNECT gateway is using the local database — \
             it should be serving this request instead. Wait a moment and retry; \
             if it persists, check the gateway log under <data dir>\\logs\\gateway.log"
                .to_string()
        } else {
            raw
        }
    })
}

/// Live (non-superseded, latest-per-label) skills — mirrors the gateway's
/// `live_skills()`.
fn live_skills(store: &Store) -> Result<Vec<Entity>, String> {
    let entities = store
        .list_entities(ScopeFilter::All, None, 1000, None)
        .map_err(|e| e.to_string())?;
    let mut superseded: std::collections::HashSet<String> = std::collections::HashSet::new();
    for e in &entities {
        if let Ok(rels) = store.list_relations(&e.id) {
            for r in rels {
                if r.relation_type == "supersedes" {
                    superseded.insert(r.to_id);
                }
            }
        }
    }
    let mut by_label: HashMap<String, &Entity> = HashMap::new();
    for e in entities
        .iter()
        .filter(|e| e.r#type == "skill" && !superseded.contains(&e.id))
    {
        match by_label.get(&e.label) {
            Some(cur) if cur.updated_at >= e.updated_at => {}
            _ => {
                by_label.insert(e.label.clone(), e);
            }
        }
    }
    let mut live: Vec<Entity> = by_label.values().map(|e| (*e).clone()).collect();
    live.sort_by(|a, b| a.label.cmp(&b.label));
    Ok(live)
}

#[tauri::command]
pub fn offline_list_skills() -> Result<Vec<OfflineSkill>, String> {
    let store = desktop_store()?;
    Ok(live_skills(&store)?
        .into_iter()
        .map(|e| OfflineSkill {
            id: e.id,
            name: e.label,
            content: e.summary,
            enabled: e.pinned,
            updated: e.updated_at,
        })
        .collect())
}

/// Create (id=None) or update (id=Some → supersede) a local skill — mirrors
/// the gateway's `/internal/skills` upsert semantics.
#[tauri::command]
pub fn offline_upsert_skill(
    id: Option<String>,
    name: String,
    content: String,
    enabled: bool,
) -> Result<String, String> {
    if name.trim().is_empty() {
        return Err("skill name required".into());
    }
    let store = desktop_store()?;
    let relations = match &id {
        Some(old_id) => {
            if store.get_entity(old_id).map_err(|e| e.to_string())?.is_none() {
                return Err(format!("skill {old_id} not found"));
            }
            vec![RelationInput { to_id: old_id.clone(), relation_type: "supersedes".into() }]
        }
        None => vec![],
    };
    store
        .remember(&RememberInput {
            r#type: "skill".into(),
            label: name,
            summary: content,
            source_provider: Some("desktop".into()),
            pin: enabled,
            scope: None,
            relations,
        })
        .map_err(|e| e.to_string())
}

/// Delete a local skill — supersede-with-type-"skill-deleted" (same as the
/// gateway; history preserved, live list filters type=="skill").
#[tauri::command]
pub fn offline_delete_skill(id: String) -> Result<(), String> {
    let store = desktop_store()?;
    let entity = store
        .get_entity(&id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("skill {id} not found"))?;

    // Delete the CURRENT LIVE skill(s) of this label, not just the id passed
    // in — same fix as the gateway's `skills_delete`.
    //
    // Every upsert and toggle mints a NEW entity id, and the UI caches the row
    // it opened, so the id reaching here is routinely superseded. Tombstoning
    // a historical version changes nothing `live_skills` returns: the command
    // succeeded, the list was unchanged, no error surfaced, and the skill was
    // still there after a restart.
    //
    // ALL live entities of the label are tombstoned, not just the newest:
    // `live_skills` is latest-per-label among non-superseded entities, so one
    // tombstone can leave an older sibling live and the skill reappears.
    let targets: Vec<Entity> = live_skills(&store)?
        .into_iter()
        .filter(|e| e.label == entity.label)
        .collect();
    if targets.is_empty() {
        // Already superseded with nothing live under this label — the
        // caller's intent (this skill should be gone) already holds.
        return Ok(());
    }

    for target in targets {
        store
            .remember(&RememberInput {
                r#type: "skill-deleted".into(),
                label: target.label,
                summary: String::new(),
                source_provider: Some("desktop".into()),
                pin: false,
                scope: None,
                relations: vec![RelationInput {
                    to_id: target.id,
                    relation_type: "supersedes".into(),
                }],
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// --- helpers ----------------------------------------------------------------

/// Milliseconds since UNIX epoch (matches gateway now_ms()).
fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// --- Context bridge (Phase C) -----------------------------------------------
//
// Exposes the SAME validated Context Store through the desktop layer while
// the gateway is down. Validation is the SHARED Phase B boundary
// (packages/context-store/src/validate.rs) — never duplicated here; error
// strings are the stable codes (PROJECT_NOT_FOUND, SECRET_LIKE_CONTENT_REJECTED,
// ...). Ownership rule (unchanged): callers only invoke these commands while
// `state.online === false`; redb's exclusive lock rejects a concurrent
// gateway.

#[derive(Serialize, Clone)]
pub struct OfflineContextEntity {
    pub id: String,
    pub r#type: String,
    pub label: String,
    pub summary: String,
    pub scope: Option<String>,
    pub pinned: bool,
    pub updated: i64,
}

fn ctx_entity_view(e: &context_store::Entity) -> OfflineContextEntity {
    OfflineContextEntity {
        id: e.id.clone(),
        r#type: e.r#type.clone(),
        label: e.label.clone(),
        summary: e.summary.clone(),
        scope: e.scope.clone(),
        pinned: e.pinned,
        updated: e.updated_at,
    }
}

/// Open a project store for context ops — same existence rule as the
/// gateway write boundary (no auto-create). Store handle drops at end of
/// scope → lock released (one-owner-at-a-time invariant).
fn open_context_store(project_id: &str) -> Result<context_store::Store, String> {
    if !context_store::validate::valid_project_id(project_id) {
        return Err("INVALID_PROJECT_ID".into());
    }
    let dir = projects_dir();
    let path = dir.join(format!("{project_id}.db"));
    if !path.is_file() {
        return Err("PROJECT_NOT_FOUND".into());
    }
    context_store::Store::open(&path, project_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn offline_context_list(project_id: String) -> Result<Vec<OfflineContextEntity>, String> {
    let store = open_context_store(&project_id)?;
    let entities = store
        .list_entities(context_store::ScopeFilter::All, None, 1000, None)
        .map_err(|e| e.to_string())?;
    Ok(entities.iter().map(ctx_entity_view).collect())
}

#[tauri::command]
pub fn offline_context_get(
    project_id: String,
    entity_id: String,
) -> Result<OfflineContextEntity, String> {
    let store = open_context_store(&project_id)?;
    store
        .get_entity(&entity_id)
        .map_err(|e| e.to_string())?
        .map(|e| ctx_entity_view(&e))
        .ok_or_else(|| "CONTEXT_ENTITY_NOT_FOUND".into())
}

#[tauri::command]
pub fn offline_context_recent(
    project_id: String,
    limit: Option<usize>,
) -> Result<Vec<OfflineContextEntity>, String> {
    let store = open_context_store(&project_id)?;
    let limit = limit.unwrap_or(20).min(1000);
    let mut all = store
        .list_entities(context_store::ScopeFilter::All, None, usize::MAX, None)
        .map_err(|e| e.to_string())?;
    all.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(all.into_iter().take(limit).map(|e| ctx_entity_view(&e)).collect())
}

/// Offline lexical recall — the SAME ranking the gateway now uses, not an
/// approximation of it. The gateway's semantic half is gone (no embedder is
/// bundled and the hybrid path was deleted), so both sides call
/// `context_store::recall` and both keep pinned entities first. The previous
/// `scored_ranked` route shared the gateway's old bug: it dropped pinned-first.
/// Omitted scope = all scopes within the project (matches the gateway default).
#[tauri::command]
pub fn offline_context_recall(
    project_id: String,
    query: String,
    scope: Option<String>,
    max_tokens: Option<usize>,
) -> Result<Vec<OfflineContextEntity>, String> {
    if query.trim().is_empty() {
        return Err("INVALID_QUERY".into());
    }
    let store = open_context_store(&project_id)?;
    let filter = match scope.as_deref() {
        Some("project_only") => context_store::ScopeFilter::ProjectOnly,
        _ => context_store::ScopeFilter::All,
    };
    let max_tokens = max_tokens.unwrap_or(context_store::DEFAULT_MAX_TOKENS);
    let res = context_store::recall(&store, filter, &query, max_tokens).map_err(|e| e.to_string())?;
    Ok(res.entities.iter().map(ctx_entity_view).collect())
}

/// Offline durable write — enforced by the SHARED Phase B validation before
/// Store::remember (project exists, type allow-list, bounds, secret guard,
/// relations). Error strings are the stable codes.
#[tauri::command]
pub fn offline_context_remember(
    project_id: String,
    r#type: String,
    label: String,
    summary: String,
    source_provider: Option<String>,
    pin: Option<bool>,
    scope: Option<String>,
    relations: Option<Vec<serde_json::Value>>,
) -> Result<String, String> {
    context_store::validate::validate_project_exists(&project_id, &context_store::store::data_dir())
        .map_err(|e| e.code.to_string())?;
    context_store::validate::validate_remember_fields(
        &project_id,
        &r#type,
        &label,
        &summary,
        scope.as_deref(),
        source_provider.as_deref(),
    )
    .map_err(|e| e.code.to_string())?;
    if context_store::validate::looks_like_secret(&[
        &label,
        &summary,
        scope.as_deref().unwrap_or(""),
        source_provider.as_deref().unwrap_or(""),
    ]) {
        return Err("SECRET_LIKE_CONTENT_REJECTED".into());
    }
    let mut rels: Vec<context_store::RelationInput> = Vec::new();
    if let Some(list) = relations {
        for r in list {
            let to_id = r
                .get("to_id")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "INVALID_CONTEXT_RELATION".to_string())?;
            let rt = r
                .get("relation_type")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "INVALID_CONTEXT_RELATION".to_string())?;
            rels.push(context_store::RelationInput {
                to_id: to_id.to_string(),
                relation_type: rt.to_string(),
            });
        }
    }
    let store = open_context_store(&project_id)?;
    context_store::validate::validate_relations(&store, &rels)
        .map_err(|e| e.code.to_string())?;
    store
        .remember(&context_store::RememberInput {
            r#type,
            label,
            summary,
            source_provider,
            pin: pin.unwrap_or(false),
            scope,
            relations: rels,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn offline_context_link(
    project_id: String,
    from_id: String,
    to_id: String,
    relation_type: String,
) -> Result<(), String> {
    context_store::validate::validate_project_exists(&project_id, &context_store::store::data_dir())
        .map_err(|e| e.code.to_string())?;
    let store = open_context_store(&project_id)?;
    context_store::validate::validate_link(&store, &from_id, &to_id, &relation_type)
        .map_err(|e| e.code.to_string())?;
    store.link(&from_id, &to_id, &relation_type).map(|_| ()).map_err(|e| e.to_string())
}
