# Coverage gate — worker-11 (cluster static-hygiene)

| Pass prefix | Bug class         | Outcome                                                                                                              |
|-------------|-------------------|----------------------------------------------------------------------------------------------------------------------|
| CARGOLINT   | cargo-lint-config | filed: CARGOLINT-001                                                                                                 |
| MSRV        | msrv-mismatch     | filed: MSRV-001                                                                                                      |
| DEPRECAPI   | deprecated-api    | cleared (seeds `mem::uninitialized`, `core::intrinsics::`/`feature(core_intrinsics)`: zero matches in native/)        |
