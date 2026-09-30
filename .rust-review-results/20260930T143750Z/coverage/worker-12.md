# Coverage gate — worker-12 (cluster resource-handling)

| Pass prefix | Bug class          | Outcome                                                                                                                   |
|-------------|--------------------|---------------------------------------------------------------------------------------------------------------------------|
| RAWFD       | raw-fd-lifecycle   | filed: RAWFD-001                                                                                                          |
| DROPSKIP    | destructor-skip    | cleared (seed `mem::forget|ManuallyDrop|process::exit`: no forget/ManuallyDrop in crate; sole `process::exit(2)` is in examples/gpu_cap_probe.rs:47 with no live value holding a meaningful Drop, diagnostic example only) |
