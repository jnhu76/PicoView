//! BrowseSession: directory enumeration, deterministic ordering, and
//! navigation for the PicoView viewer.
//!
//! BrowseSession owns the directory listing and current index. It does NOT
//! decode images, own graphics resources, or redefine format/image semantics
//! (ARCHITECTURE §18). Current-image work outranks BrowseSession background
//! work.
//!
//! Ordering: case-insensitive filename sort, then original filename
//! representation, then full path — a stable total order across runs on the
//! same filesystem content.
//!
//! `rebuild()` re-reads the directory and preserves the current path when it
//! still exists. Refreshing the CURRENT IMAGE alone does not rebuild the
//! listing; a directory rebuild is a separate Product operation.

use std::cmp::Ordering;
use std::path::{Path, PathBuf};

/// Supported image extensions (lowercase, without dot). Matches PicoView's
/// current WIC decode capability.
const IMAGE_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "png", "gif", "bmp", "tiff", "tif", "webp", "avif",
];

/// A single candidate in the browse list.
#[derive(Debug, Clone)]
pub struct Candidate {
    /// Absolute path to the image file.
    pub path: PathBuf,
    /// Display name (file name without extension).
    pub name: String,
}

/// The BrowseSession: a directory listing with navigation state.
#[derive(Debug)]
pub struct BrowseSession {
    /// Absolute directory path.
    dir: PathBuf,
    /// Sorted candidates (case-insensitive filename order).
    candidates: Vec<Candidate>,
    /// Current index into `candidates`. None when empty.
    index: Option<usize>,
}

impl BrowseSession {
    /// Create a new BrowseSession for the directory containing `path`.
    /// The initial item is `path` if it passes the image-extension filter;
    /// otherwise the session starts empty.
    pub fn new(path: &Path) -> Self {
        let dir = path.parent().unwrap_or(Path::new(".")).to_path_buf();
        let mut session = Self {
            dir,
            candidates: Vec::new(),
            index: None,
        };
        session.rebuild();
        // Locate the initial path within the enumerated list.
        if let Some(pos) = session.candidates.iter().position(|c| c.path == path) {
            session.index = Some(pos);
        }
        session
    }

    /// Rebuild the candidate list from the current directory contents.
    ///
    /// This is the "Refresh directory" operation — it re-reads the filesystem
    /// but does NOT touch any image decode or graphics resource. Refreshing
    /// the CURRENT IMAGE alone does not imply a directory rebuild; Product
    /// asks for a rebuild only when the listing itself must change.
    pub fn rebuild(&mut self) {
        // Capture the OLD current path BEFORE replacing `candidates`.
        // `index_path()` after the swap names the NEW occupant at that index
        // and cannot recover the previous item.
        let old_path = self.current_path().map(|p| p.to_path_buf());
        let old_index = self.index;
        let entries = read_dir_sorted(&self.dir);
        self.candidates = entries;
        if let Some(path) = old_path {
            if let Some(new_pos) = self.candidates.iter().position(|c| c.path == path) {
                self.index = Some(new_pos);
                return;
            }
        }
        // Item gone (or no prior path): clamp the previous index deterministically.
        match (old_index, self.candidates.is_empty()) {
            (_, true) => self.index = None,
            (Some(idx), false) => self.index = Some(idx.min(self.candidates.len() - 1)),
            (None, false) => self.index = None,
        }
    }

    /// Navigate to the previous item. Returns true if navigation succeeded.
    pub fn previous(&mut self) -> bool {
        if let Some(idx) = self.index {
            if idx > 0 {
                self.index = Some(idx - 1);
                return true;
            }
        }
        false
    }

    /// Navigate to the next item. Returns true if navigation succeeded.
    pub fn next(&mut self) -> bool {
        if let Some(idx) = self.index {
            if idx + 1 < self.candidates.len() {
                self.index = Some(idx + 1);
                return true;
            }
        }
        false
    }

    /// Set the current index directly. Clamps to valid range.
    pub fn goto(&mut self, idx: usize) {
        if self.candidates.is_empty() {
            self.index = None;
        } else {
            self.index = Some(idx.min(self.candidates.len() - 1));
        }
    }

    /// Current path, if any.
    pub fn current_path(&self) -> Option<&Path> {
        self.index
            .and_then(|idx| self.candidates.get(idx))
            .map(|c| c.path.as_path())
    }

    /// Current index (0-based).
    pub fn current_index(&self) -> Option<usize> {
        self.index
    }

    /// Number of candidates.
    pub fn count(&self) -> usize {
        self.candidates.len()
    }

    /// True when there is a previous item.
    pub fn can_previous(&self) -> bool {
        self.index.is_some_and(|idx| idx > 0)
    }

    /// True when there is a next item.
    pub fn can_next(&self) -> bool {
        self.index
            .is_some_and(|idx| idx + 1 < self.candidates.len())
    }

    /// Current item display name.
    pub fn current_name(&self) -> Option<&str> {
        self.index
            .and_then(|idx| self.candidates.get(idx))
            .map(|c| c.name.as_str())
    }

    /// Directory path.
    pub fn dir(&self) -> &Path {
        &self.dir
    }

    fn index_path(&self) -> Option<&PathBuf> {
        self.index
            .and_then(|idx| self.candidates.get(idx))
            .map(|c| &c.path)
    }
}

/// Read a directory and return image candidates in deterministic order.
fn read_dir_sorted(dir: &Path) -> Vec<Candidate> {
    let entries: Vec<Candidate> = match std::fs::read_dir(dir) {
        Ok(rd) => rd
            .filter_map(|e| e.ok())
            .filter_map(|e| {
                let path = e.path();
                if !path.is_file() {
                    return None;
                }
                let ext = path.extension()?.to_str()?.to_ascii_lowercase();
                if !IMAGE_EXTENSIONS.contains(&ext.as_str()) {
                    return None;
                }
                let name = path.file_stem()?.to_str()?.to_string();
                Some(Candidate { path, name })
            })
            .collect(),
        Err(_) => Vec::new(),
    };
    let mut sorted = entries;
    sorted.sort_by(|a, b| compare_candidates(a, b));
    sorted
}

/// Case-insensitive filename ordering with a real deterministic secondary key:
/// 1. lowercased filename (case-fold primary),
/// 2. original filename representation (distinguishes case-fold collisions),
/// 3. full path (ultimate tie-break).
fn compare_candidates(a: &Candidate, b: &Candidate) -> Ordering {
    let name_a = a.path.file_name().unwrap_or_default();
    let name_b = b.path.file_name().unwrap_or_default();
    let lower_a = name_a.to_string_lossy().to_ascii_lowercase();
    let lower_b = name_b.to_string_lossy().to_ascii_lowercase();
    lower_a
        .cmp(&lower_b)
        .then_with(|| name_a.cmp(name_b))
        .then_with(|| a.path.cmp(&b.path))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn make_dir(name: &str, files: &[&str]) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("picoview-browse-{name}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        for f in files {
            fs::write(dir.join(f), b"").unwrap();
        }
        dir
    }

    #[test]
    fn enumerates_image_files_in_deterministic_order() {
        let dir = make_dir(
            "order",
            &["Zebra.jpg", "apple.PNG", "Banana.jpeg", "mango.txt"],
        );
        let session = BrowseSession::new(&dir.join("apple.PNG"));
        assert_eq!(session.count(), 3); // .txt excluded
        assert_eq!(session.current_index(), Some(0)); // apple.PNG is first case-insensitively
        assert_eq!(session.current_name(), Some("apple"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn can_navigate_previous_and_next() {
        let dir = make_dir("nav", &["a.jpg", "b.jpg", "c.jpg"]);
        let mut session = BrowseSession::new(&dir.join("b.jpg"));
        assert_eq!(session.current_index(), Some(1));
        assert!(session.can_previous());
        assert!(session.can_next());
        assert!(session.previous());
        assert_eq!(session.current_index(), Some(0));
        assert!(!session.can_previous());
        assert!(!session.previous());
        assert!(session.next());
        assert!(session.next());
        assert_eq!(session.current_index(), Some(2));
        assert!(!session.can_next());
        assert!(!session.next());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn empty_directory_produces_empty_session() {
        let dir = make_dir("empty", &[]);
        let session = BrowseSession::new(&dir.join("nothing.jpg"));
        assert_eq!(session.count(), 0);
        assert_eq!(session.current_index(), None);
        assert!(!session.can_previous());
        assert!(!session.can_next());
        assert_eq!(session.current_path(), None);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn initial_path_not_in_session_starts_empty() {
        let dir = make_dir("notfound", &["a.jpg"]);
        let session = BrowseSession::new(&dir.join("nope.jpg"));
        assert_eq!(session.count(), 1);
        assert_eq!(session.current_index(), None);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rebuild_resets_index_when_item_disappears() {
        let dir = make_dir("rebuild", &["a.jpg", "b.jpg"]);
        let mut session = BrowseSession::new(&dir.join("a.jpg"));
        assert_eq!(session.current_index(), Some(0));
        fs::remove_file(dir.join("a.jpg")).unwrap();
        session.rebuild();
        assert_eq!(session.count(), 1);
        assert_eq!(session.current_index(), Some(0)); // clamped to b.jpg
        assert_eq!(session.current_name(), Some("b"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn non_image_files_are_excluded() {
        let dir = make_dir("ext", &["a.jpg", "b.txt", "c.PNG", "d.exe"]);
        let session = BrowseSession::new(&dir.join("a.jpg"));
        assert_eq!(session.count(), 2); // a.jpg, c.PNG
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn case_insensitive_ordering_is_stable() {
        let dir = make_dir("case", &["Zebra.jpg", "apple.PNG", "Banana.jpeg"]);
        let session = BrowseSession::new(&dir.join("Banana.jpeg"));
        // Case-insensitive: apple < Banana < Zebra
        let names: Vec<_> = (0..session.count())
            .map(|i| {
                session
                    .candidates
                    .get(i)
                    .map(|c| c.name.as_str())
                    .unwrap_or("")
            })
            .collect();
        assert_eq!(names, vec!["apple", "Banana", "Zebra"]);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn case_fold_collision_ties_break_on_original_name() {
        // Case-fold collisions cannot coexist on default NTFS; compare
        // constructed candidates so the secondary key is still proven.
        let apple = Candidate {
            path: PathBuf::from("C:/t/apple.jpg"),
            name: "apple".into(),
        };
        let apple_cap = Candidate {
            path: PathBuf::from("C:/t/Apple.jpg"),
            name: "Apple".into(),
        };
        let apple_all = Candidate {
            path: PathBuf::from("C:/t/APPLE.jpg"),
            name: "APPLE".into(),
        };
        // Primary key (lowercase) is equal for all three.
        assert_eq!(compare_candidates(&apple, &apple_cap), Ordering::Greater);
        assert_eq!(
            compare_candidates(&apple_cap, &apple_all),
            Ordering::Greater
        );
        assert_eq!(compare_candidates(&apple_all, &apple), Ordering::Less);
        // Full path is the ultimate tie-break when file names are identical.
        let left = Candidate {
            path: PathBuf::from("C:/t/a/x.jpg"),
            name: "x".into(),
        };
        let right = Candidate {
            path: PathBuf::from("C:/t/b/x.jpg"),
            name: "x".into(),
        };
        assert_eq!(compare_candidates(&left, &right), Ordering::Less);
    }

    #[test]
    fn rebuild_preserves_current_when_earlier_file_inserted() {
        let dir = make_dir("preserve", &["a.jpg", "b.jpg"]);
        let mut session = BrowseSession::new(&dir.join("b.jpg"));
        assert_eq!(session.current_name(), Some("b"));
        assert_eq!(session.current_index(), Some(1));
        // Insert aa.jpg (sorts before b.jpg, after a.jpg).
        fs::write(dir.join("aa.jpg"), b"").unwrap();
        session.rebuild();
        assert_eq!(session.count(), 3);
        // Must still be b.jpg — not the new occupant at the old index.
        assert_eq!(session.current_name(), Some("b"));
        assert_eq!(session.current_path(), Some(dir.join("b.jpg").as_path()));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rebuild_clamps_when_current_disappears() {
        let dir = make_dir("clamp", &["a.jpg", "b.jpg", "c.jpg"]);
        let mut session = BrowseSession::new(&dir.join("c.jpg"));
        assert_eq!(session.current_name(), Some("c"));
        fs::remove_file(dir.join("c.jpg")).unwrap();
        session.rebuild();
        assert_eq!(session.count(), 2);
        assert_eq!(session.current_name(), Some("b"));
        let _ = fs::remove_dir_all(&dir);
    }
}
