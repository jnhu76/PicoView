# Coverage gate — worker-10 (cluster logic-correctness)

| Pass prefix | Bug class                  | Outcome                                                                                                            |
|-------------|----------------------------|--------------------------------------------------------------------------------------------------------------------|
| ORDEQHASH   | ord-eq-hash                | cleared (seed `impl…(Ord|Eq|Hash)…for`: zero manual impls; all 13 `#[derive(PartialEq/Eq)]` internally consistent, no hand/derive split) |
| TRAITADV    | adversarial-trait          | cleared (bounds are `IntoIterator<Item=String>`/`impl Fn` only; no trait output feeds an `unsafe` sink — the 4 unsafe sites take no trait-bounded values) |
| CLOSUREPANIC| closure-panic              | cleared (no `ptr::read`/`ptr::write`/`drop_in_place`; both `catch_unwind(AssertUnwindSafe)` sites wrap whole worker bodies with no half-moved unsafe scaffold) |
| FLOATEDGE   | float-edge                 | cleared (seed `f32|f64`: geometry/logging/wheel only; `proxy_resource_size` derives scale from `.max(1)`-guarded integers, no NaN/Inf reaches an index/length cast) |
| STRCMP      | string-comparison          | cleared (extension allowlist uses exact match on `to_ascii_lowercase`d ext; no substring predicate gates a decision; no case-mixing across one value class) |
| SERFIELDS   | serialize-struct-mismatch  | cleared (no `serialize_struct`/`serialize_tuple`/`serialize_seq`/`serialize_map` calls anywhere in the crate)       |
| NONDET      | nondeterminism             | cleared (only `HashSet` use is a count-only test assertion; `fnv1a64` draw hash iterates an ordered draw list; no HashMap iteration feeds determinism-sensitive state) |
| KEYMUT      | collection-key-mutation    | cleared (no `peek_mut`/`RefCell`/`Cell` in scope; blits cache is `Weak::ptr_eq` identity-keyed with an inert payload, keys never mutated in place) |
