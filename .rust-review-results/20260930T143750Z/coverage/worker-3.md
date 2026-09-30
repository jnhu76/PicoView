# Coverage gate — worker-3 (cluster concurrency-locking)

| Pass prefix | Bug class           | Outcome                                                                                                                        |
|-------------|---------------------|--------------------------------------------------------------------------------------------------------------------------------|
| DLOCK       | double-lock-deadlock | cleared (no `Mutex`/`RwLock` instances exist in `native/` — Phase A lock map is empty, nothing to double-lock)                 |
| ABBA        | abba-deadlock        | cleared (lock-acquisition graph has zero nodes; no `.lock()`/`.read()`/`.write()` calls anywhere in `native/src` or examples)  |
| CONDVAR     | condvar-misuse       | cleared (no `Condvar` in the crate; the only cross-thread wake is `EventLoopProxy::send_event`, which has no wait predicate)   |
| CHANSTARVE  | channel-starvation   | cleared (both `sync_channel` endpoints use non-blocking `try_send`/`try_recv`/`try_iter` only — no blocking `recv()`/`send()`; `Wake::Output` retry loop preserves liveness on backpressure) |
| ONCEREENTRY | once-reentrancy      | cleared (three `OnceLock::get_or_init` sites — `product_facts.rs:13`, `product_facts.rs:25`, `main.rs:60`; closures call `parse_env_u32`/`Instant::now`, neither re-enters its cell) |
| REENTRANT   | reentrancy-unsafe    | cleared (no signal registration — `sigaction`/`signal_hook`/`libc::signal`/`nix::sys::signal` all absent; no `extern "C" fn` handlers; no `&Mutex<T>` dynamic-dispatch reentry pattern exists) |
