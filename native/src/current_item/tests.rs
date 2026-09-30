//! CurrentItem regression tests. Semantics unchanged from the pre-split
//! `current_item.rs` module; only the import surface differs.

use super::decode::{
    DecodedImage, ImageAdmissionPolicy, MAX_ENCODED_FILE_BYTES, MAX_ERROR_CHARS, OpenError,
    admits_encoded_len, decode_alloc_len, metadata_error, open_decoded, prepare_for_admission,
    proxy_resource_size, proxy_size_holds_policy, read_encoded_bounded, take_bounded, wic,
};
use super::publication::{
    BrowseSnapshot, ObservationBoundary, OpenIntent, RequestPhase, error_event, loading_event,
    ready_event,
};
use super::*;
use serde_json::Value;

fn event_values(v: &Value) {
    // Bounded-semantic guard: svc events carry only small strings and
    // integers — never arrays, never bulk payloads.
    let text = v.to_string();
    assert!(text.len() <= 1024, "svc event too large: {text}");
    let obj = v.as_object().unwrap();
    for (k, val) in obj {
        assert!(
            val.is_string() || val.is_i64() || val.is_u64() || val.is_boolean() || val.is_null(),
            "field {k} is not a bounded scalar"
        );
    }
}

#[test]
fn svc_events_are_bounded_scalars() {
    let browse = BrowseSnapshot {
        index: Some(1),
        count: 5,
        can_previous: true,
        can_next: true,
    };
    event_values(&loading_event(1, OpenIntent::Refresh, "a.jpg", &browse));
    event_values(&ready_event(
        2, "a.jpg", 3, 1920, 1080, 1920, 1080, true, &browse,
    ));
    event_values(&error_event(
        3,
        OpenIntent::NewItem,
        &OpenError::Decode("x".repeat(500).into()),
        &browse,
    ));
    event_values(&error_event(
        4,
        OpenIntent::Refresh,
        &OpenError::Admission("y".repeat(500).into()),
        &browse,
    ));
    // File names cap on the same channel as error text.
    event_values(&loading_event(
        5,
        OpenIntent::NewItem,
        &"x".repeat(500),
        &browse,
    ));
    // The intent is the observer's preserve-vs-replace policy input and
    // must be on the wire exactly for the request-lifecycle events.
    assert_eq!(
        loading_event(6, OpenIntent::Refresh, "a", &browse)["intent"],
        "refresh"
    );
    assert_eq!(
        error_event(7, OpenIntent::NewItem, &OpenError::MissingPath, &browse)["intent"],
        "new-item"
    );
    assert!(
        ready_event(8, "a", 1, 2, 3, 2, 3, true, &browse)
            .get("intent")
            .is_none()
    );
}

#[test]
fn error_messages_are_capped() {
    let long = OpenError::Decode("x".repeat(500));
    let msg = long.message();
    assert!(msg.chars().count() <= MAX_ERROR_CHARS + 1);
}

#[test]
fn ordinary_decodes_prepare_as_the_decoder_plane_verbatim() {
    // The ordinary path must prepare the decoder's plane at full source
    // resolution — never a copy, never a resample, never a pow2 envelope
    // (the old path box-shrank 1153x1198 into a 512 envelope).
    for (w, h) in [(1153u32, 1198u32), (1024u32, 1024u32), (1u32, 1u32)] {
        let decode = DecodedImage {
            width: w,
            height: h,
            rgba: vec![17u8; (w * h * 4) as usize],
        };
        let source_ptr = decode.rgba.as_ptr();
        let prepared = prepare_for_admission(decode, &ImageAdmissionPolicy::portable_default());
        assert_eq!(
            (prepared.width, prepared.height),
            (w, h),
            "{w}x{h} is ordinary and must keep source geometry"
        );
        // Preparation moves the decode; the heap plane publication will
        // move into PocketJS is still this one allocation.
        assert!(std::ptr::eq(prepared.rgba.as_ptr(), source_ptr));
    }
}

/// Corrective-2 MAJOR-3 lock (rewritten after adversarial review): the
/// production path is apply_exif_orientation → prepare_for_admission →
/// source/resource/fullResolution. A hand-built already-O DecodedImage
/// would be tautological; this walks the real EXIF transform first so a
/// S/O mixup in open()'s formula fails the test.
#[cfg(windows)]
#[test]
fn exif_oriented_decode_keeps_full_resolution_in_o_space() {
    // Storage 2x3; EXIF 6 rotates 90° CW → O is 3x2.
    let (sw, sh) = (2usize, 3usize);
    let plane = vec![9u8; sw * sh * 4];
    let (ow, oh, oriented) = wic::apply_exif_orientation(sw as u32, sh as u32, &plane, 6);
    assert_eq!((ow, oh), (3, 2), "EXIF 6 must swap into O extent");
    let decode = DecodedImage {
        width: ow,
        height: oh,
        rgba: oriented,
    };
    let source_w = decode.width;
    let source_h = decode.height;
    let image = prepare_for_admission(decode, &ImageAdmissionPolicy::portable_default());
    let resource_w = image.width;
    let resource_h = image.height;
    let full_resolution = source_w == resource_w && source_h == resource_h;
    assert_eq!((source_w, source_h), (3, 2), "source is O, not S");
    assert_eq!((resource_w, resource_h), (3, 2));
    assert!(
        full_resolution,
        "full-res EXIF-6 must not be demoted to Proxy by S/O mixup"
    );
}

#[test]
fn giant_decodes_prepare_as_fitted_planes() {
    // One axis above the portable admission ceiling (8192): the resource is
    // box-fitted into the admission limit, bounded, never rejected, and
    // still large enough that fit-to-window display is GPU minification
    // of real pixels. The fill is channel-asymmetric so the oracle also
    // pins the output byte order: every fitted pixel must come out
    // R,G,B,A — a B,G,R,A emission would read as swapped constants.
    let (w, h) = (20000u32, 100u32);
    let mut rgba = vec![0u8; (w * h * 4) as usize];
    for px in rgba.chunks_exact_mut(4) {
        px.copy_from_slice(&[17, 34, 51, 255]);
    }
    let decode = DecodedImage {
        width: w,
        height: h,
        rgba,
    };
    let policy = ImageAdmissionPolicy::portable_default();
    let res = prepare_for_admission(decode, &policy);
    assert_eq!(res.width, 8192);
    assert_eq!(res.height, (100 * 8192 + w / 2) / w);
    assert!(res.width <= pocketjs_core::NATIVE_TEX_MAX_DIM);
    assert_eq!(res.rgba.len(), (res.width * res.height * 4) as usize);
    for px in res.rgba.chunks_exact(4) {
        assert_eq!(px, &[17, 34, 51, 255], "box-fit output must stay R,G,B,A");
    }
}

#[test]
fn admission_case_a_device_8192_giant_is_proxy() {
    // CASE A: device max dimension = 8192, source 8256×5504 → proxy.
    let policy = ImageAdmissionPolicy::from_usable_image_capability(8192);
    let decode = DecodedImage {
        width: 8256,
        height: 5504,
        rgba: vec![20u8; (8256u64 * 5504u64 * 4) as usize],
    };
    let source = (decode.width, decode.height);
    let res = prepare_for_admission(decode, &policy);
    let full = source == (res.width, res.height);
    assert!(!full, "8256 must not claim full resolution on an 8192 device");
    assert!(res.width <= 8192 && res.height <= 8192);
    assert!(res.rgba.len() == (res.width * res.height * 4) as usize);
}

#[test]
fn admission_case_b_device_allows_8256_exact_full_resolution() {
    // CASE B: device max dimension >= 8256 and product budgets allow → exact.
    let policy = ImageAdmissionPolicy::from_usable_image_capability(16384);
    let decode = DecodedImage {
        width: 8256,
        height: 5504,
        rgba: vec![20u8; (8256u64 * 5504u64 * 4) as usize],
    };
    let source_ptr = decode.rgba.as_ptr();
    let res = prepare_for_admission(decode, &policy);
    assert_eq!((res.width, res.height), (8256, 5504));
    assert!(std::ptr::eq(res.rgba.as_ptr(), source_ptr), "full path must move, not copy");
    let full_resolution = res.width == 8256 && res.height == 5504;
    assert!(full_resolution);
}

#[test]
fn admission_case_c_pixel_budget_rejects_never_false_full() {
    // CASE C: dimension fits device, but product pixel budget rejects → proxy
    // or bounded rejection. NEVER falsely fullResolution.
    let mut policy = ImageAdmissionPolicy::from_usable_image_capability(16384);
    policy.max_resource_pixels = 1_000_000; // far below 8256×5504
    assert!(!policy.admits_exact(8256, 5504));
    let decode = DecodedImage {
        width: 8256,
        height: 5504,
        rgba: vec![20u8; (8256u64 * 5504u64 * 4) as usize],
    };
    let res = prepare_for_admission(decode, &policy);
    let full = res.width == 8256 && res.height == 5504;
    assert!(!full, "budget rejection must never claim full resolution");
    assert!(res.width <= 16384 && res.height <= 16384);
    let pixels = res.width as u64 * res.height as u64;
    assert!(
        pixels <= policy.max_resource_pixels,
        "proxy must stay within product pixel budget ({pixels} > {})",
        policy.max_resource_pixels
    );
}

#[test]
fn admission_case_d_exact_on_supported_boundary() {
    // CASE D: source exactly on the supported dimension boundary → exact
    // when other budgets permit.
    let policy = ImageAdmissionPolicy::from_usable_image_capability(8256);
    let decode = DecodedImage {
        width: 8256,
        height: 1,
        rgba: vec![1u8; 8256 * 4],
    };
    let res = prepare_for_admission(decode, &policy);
    assert_eq!((res.width, res.height), (8256, 1));
    // One pixel past the boundary on either axis becomes proxy.
    let over = DecodedImage {
        width: 8257,
        height: 1,
        rgba: vec![1u8; 8257 * 4],
    };
    let proxied = prepare_for_admission(over, &policy);
    assert!(proxied.width <= 8256 && (proxied.width, proxied.height) != (8257, 1));
}

#[test]
fn admission_case_e_normal_1254_stays_full_resolution() {
    // CASE E: ordinary control image remains full-resolution under both
    // portable and raised-capability policies.
    for dim in [pocketjs_core::NATIVE_TEX_MAX_DIM, 16384] {
        let policy = ImageAdmissionPolicy::from_usable_image_capability(dim);
        let decode = DecodedImage {
            width: 1254,
            height: 1254,
            rgba: vec![3u8; 1254 * 1254 * 4],
        };
        let source_ptr = decode.rgba.as_ptr();
        let res = prepare_for_admission(decode, &policy);
        assert_eq!((res.width, res.height), (1254, 1254), "dim={dim}");
        assert!(std::ptr::eq(res.rgba.as_ptr(), source_ptr), "dim={dim}");
        assert!(res.width == 1254 && res.height == 1254);
    }
}

#[test]
fn admission_case_f_malformed_dimensions_stay_bounded() {
    // CASE F: decode guard still rejects absurd containers before allocation.
    assert!(decode_alloc_len(65535, 65535).is_err());
    assert!(decode_alloc_len(1, 1).is_ok());
    // Zero / empty prepared inputs stay bounded (no panic).
    let policy = ImageAdmissionPolicy::from_usable_image_capability(16384);
    let empty = DecodedImage {
        width: 0,
        height: 0,
        rgba: Vec::new(),
    };
    let res = prepare_for_admission(empty, &policy);
    // Malformed empty input does not claim full-resolution geometry.
    assert!((res.width, res.height) != (0, 0) || res.rgba.is_empty());
    assert!(res.rgba.len() <= 4);
    // Product CPU guard remains part of every device-derived policy.
    assert_eq!(
        ImageAdmissionPolicy::from_usable_image_capability(16384).max_resource_pixels,
        80_000_000
    );
}

/// MINOR-2: max_resource_pixels is a strict invariant after proxy derivation.
/// Historical counterexample: sqrt+round on both axes produced
/// 113×8854 = 1,000,502 > 1,000,000.
#[test]
fn proxy_pixel_budget_counterexample_113x8858_stays_invariant() {
    let (src_w, src_h) = (113u32, 8858u32);
    let max_dim = 16384u32;
    let max_pixels = 1_000_000u64;

    // Document the historical invalid output from independent axis round().
    let bad_scale = ((max_pixels as f64) / ((src_w as f64) * (src_h as f64))).sqrt();
    let bad_cw = ((src_w as f64 * bad_scale).round() as u32).clamp(1, max_dim);
    let bad_ch = ((src_h as f64 * bad_scale).round() as u32).clamp(1, max_dim);
    let bad_product = bad_cw as u64 * bad_ch as u64;
    // The old derivation can overshoot; if a given float rounding happens not
    // to, the new function must still hold the invariant.
    if bad_product > max_pixels {
        assert!(
            !proxy_size_holds_policy(bad_cw, bad_ch, max_dim, max_pixels),
            "historical counterexample should violate the budget ({bad_cw}x{bad_ch}={bad_product})"
        );
    }

    let (cw, ch) = proxy_resource_size(src_w, src_h, max_dim, max_pixels);
    assert!(
        proxy_size_holds_policy(cw, ch, max_dim, max_pixels),
        "corrected size {cw}x{ch}={} must satisfy dim<={max_dim} and pixels<={max_pixels}",
        cw as u64 * ch as u64
    );
    assert!(cw <= max_dim && ch <= max_dim);
    assert!(cw as u64 * ch as u64 <= max_pixels);

    // End-to-end prepare_for_admission must publish the same invariant.
    let mut policy = ImageAdmissionPolicy::from_usable_image_capability(max_dim);
    policy.max_resource_pixels = max_pixels;
    let decode = DecodedImage {
        width: src_w,
        height: src_h,
        rgba: vec![20u8; (src_w as usize) * (src_h as usize) * 4],
    };
    let res = prepare_for_admission(decode, &policy);
    assert!(
        proxy_size_holds_policy(res.width, res.height, max_dim, max_pixels),
        "prepared proxy {}x{} violated policy",
        res.width,
        res.height
    );
    assert_ne!(
        (res.width, res.height),
        (src_w, src_h),
        "113x8858 exceeds 1MP budget and must not claim full resolution"
    );
    assert_eq!(res.rgba.len(), (res.width * res.height * 4) as usize);
}

#[test]
fn proxy_pixel_budget_exactly_on_budget_case() {
    // Dimension fits, pixel budget binds exactly.
    let (src_w, src_h) = (20u32, 20u32); // 400 px
    let max_dim = 8192u32;
    let max_pixels = 100u64;
    let (cw, ch) = proxy_resource_size(src_w, src_h, max_dim, max_pixels);
    assert!(proxy_size_holds_policy(cw, ch, max_dim, max_pixels));
    assert_eq!(cw as u64 * ch as u64, max_pixels, "ideal exact-budget landing is 10x10");
    assert_eq!((cw, ch), (10, 10));
}

#[test]
fn proxy_dimension_bound_only_case() {
    // Pixel budget does not bind; dimension ceiling does.
    let (src_w, src_h) = (200u32, 50u32);
    let max_dim = 100u32;
    let max_pixels = 1_000_000_000u64;
    let (cw, ch) = proxy_resource_size(src_w, src_h, max_dim, max_pixels);
    assert!(proxy_size_holds_policy(cw, ch, max_dim, max_pixels));
    assert_eq!((cw, ch), (100, 25));
    assert!(cw as u64 * ch as u64 <= max_pixels);
}

#[test]
fn proxy_exact_capability_8256_path_unchanged() {
    // Raised-capability full-res path: no proxy, exact source geometry.
    let policy = ImageAdmissionPolicy::from_usable_image_capability(16384);
    assert!(policy.admits_exact(8256, 5504));
    // Helper still returns a legal size if used; exact path never calls it.
    let (cw, ch) = proxy_resource_size(8256, 5504, 16384, policy.max_resource_pixels);
    assert!(proxy_size_holds_policy(cw, ch, 16384, policy.max_resource_pixels));
    assert_eq!((cw, ch), (8256, 5504), "under both budgets helper keeps source size");
}

#[test]
fn proxy_pixel_budget_invariant_holds_across_fuzz_sizes() {
    let cases = [
        (1u32, 1u32, 16384u32, 1u64),
        (113, 8858, 16384, 1_000_000),
        (8256, 5504, 8192, 80_000_000),
        (8256, 5504, 16384, 1_000_000),
        (7, 99999, 64, 10_000),
        (4096, 4096, 2048, 100_000),
        (100, 1, 50, 10),
        (1, 100, 50, 10),
        (333, 777, 300, 50_000),
        (12345, 12, 8192, 40_000),
    ];
    for (w, h, dim, pixels) in cases {
        let (cw, ch) = proxy_resource_size(w, h, dim, pixels);
        assert!(
            proxy_size_holds_policy(cw, ch, dim, pixels),
            "invariant broken for {w}x{h} dim={dim} pixels={pixels} -> {cw}x{ch}={}",
            cw as u64 * ch as u64
        );
        if w as u64 * h as u64 <= pixels && w <= dim && h <= dim {
            // Exact-admissible sources are not proxied by prepare; helper
            // still reports a legal size at or above a floor fit.
            assert!(cw >= 1 && ch >= 1);
        }
    }
}

#[test]
fn decoded_allocation_becomes_the_pocketjs_record_backing() {
    // Ownership oracle at the real publication seam: the Vec this side
    // holds before publish is the very allocation PocketJS stores after
    // it — upload_owned_rgba8 moves it, and the live record's pixels are
    // observable at the original pointer through Ui::texture. Equal
    // contents alone would not prove the move.
    let surface = UiSurface::new((96.0, 64.0));
    fn expected_byte(i: usize) -> u8 {
        (i % 251) as u8
    }
    let image = DecodedImage {
        width: 33,
        height: 17,
        rgba: (0..33 * 17 * 4).map(expected_byte).collect(),
    };
    let source_ptr = image.rgba.as_ptr();

    let mut item = CurrentItem::new();
    let browse = BrowseSnapshot::none();
    item.publish(
        &surface,
        request_phase(),
        1,
        OpenIntent::NewItem,
        "oracle.png".to_string(),
        image,
        33,
        17,
        true,
        &browse,
    );
    let handle = item
        .live_handle()
        .expect("admission accepts the moved plane");
    surface.with_ui(|ui| {
        let view = ui.texture(handle).expect("live PocketJS record");
        assert_eq!((view.w, view.h), (33, 17));
        assert!(view.linear, "publication admits bilinear sampling");
        // Allocation identity: the record's bytes ARE the decoded Vec's
        // heap allocation — moved, not copied.
        assert!(
            std::ptr::eq(view.pixels.as_ptr(), source_ptr),
            "PocketJS record must own the decoder's original allocation"
        );
        for (i, b) in view.pixels.iter().enumerate() {
            assert_eq!(*b, expected_byte(i), "byte {i} changed across the move");
        }
    });
    item.retire(request_phase());
    assert_eq!(item.live_handle(), None);
    // Removal is a Product transition only: the plane stays resolvable
    // until the observation boundary, then frees exactly there.
    assert_eq!(item.pending_releases(), 1);
    surface.with_ui(|ui| assert!(ui.texture(handle).is_some()));
    item.release_superseded(&surface, ObservationBoundary::after_guest_frame());
    assert_eq!(item.pending_releases(), 0);
    surface.with_ui(|ui| assert!(ui.texture(handle).is_none()));
}

fn plane(w: u32, h: u32) -> DecodedImage {
    DecodedImage {
        width: w,
        height: h,
        rgba: vec![7u8; (w * h * 4) as usize],
    }
}

/// Tests simulate the request phase (boot / input processing) — the
/// only phase where `open`/`retire` are legal.
fn request_phase() -> RequestPhase {
    RequestPhase::before_guest_frame()
}

#[test]
fn superseded_publication_survives_until_the_observation_boundary() {
    // THE temporal contract (CORRECTIVE-1): after a successful refresh
    // commit the old publication must stay resolvable until a guest
    // observation boundary has installed the new binding. Committing
    // between guest.frame and render must never free a handle the
    // current DrawList can still resolve.
    let surface = UiSurface::new((96.0, 64.0));
    let mut item = CurrentItem::new();
    let browse = BrowseSnapshot::none();
    item.publish(
        &surface,
        request_phase(),
        1,
        OpenIntent::NewItem,
        "a.png".into(),
        plane(4, 4),
        4,
        4,
        true,
        &browse,
    );
    let a = item.live_handle().expect("first publication");
    item.publish(
        &surface,
        request_phase(),
        2,
        OpenIntent::Refresh,
        "b.png".into(),
        plane(8, 8),
        8,
        8,
        true,
        &browse,
    );
    let b = item.live_handle().expect("refresh commit");
    assert_ne!(a, b);
    // Before the boundary: the publication is already the candidate,
    // but the superseded handle is still resolvable in Core.
    assert_eq!(item.pending_releases(), 1);
    surface.with_ui(|ui| {
        assert!(
            ui.texture(a).is_some(),
            "old must stay resolvable before the observation boundary"
        );
        assert!(ui.texture(b).is_some());
    });
    item.release_superseded(&surface, ObservationBoundary::after_guest_frame());
    assert_eq!(item.pending_releases(), 0);
    surface.with_ui(|ui| {
        assert!(ui.texture(a).is_none(), "old freed exactly at the boundary");
        assert!(ui.texture(b).is_some(), "new publication stays live");
    });
}

#[test]
fn new_item_failure_release_waits_for_the_observation_boundary() {
    // Real Product error path (missing file → NewItem failure → retire):
    // the replaced publication stays resolvable until the observation
    // boundary — the guest may still render it while the error event is
    // in flight, so the same deferred rule applies to error replacement,
    // not only to successful ready replacement.
    let surface = UiSurface::new((96.0, 64.0));
    let mut item = CurrentItem::new();
    let browse = BrowseSnapshot::none();
    item.publish(
        &surface,
        request_phase(),
        1,
        OpenIntent::NewItem,
        "a.png".into(),
        plane(4, 4),
        4,
        4,
        true,
        &browse,
    );
    let a = item.live_handle().expect("publication live");
    item.open(
        &surface,
        request_phase(),
        Path::new("Z:/definitely/not/here.jpg"),
        OpenIntent::NewItem,
    );
    assert_eq!(
        item.live_handle(),
        None,
        "new-item failure replaces the publication"
    );
    assert_eq!(item.pending_releases(), 1);
    surface.with_ui(|ui| {
        assert!(
            ui.texture(a).is_some(),
            "old stays resolvable until the guest observes the error"
        );
    });
    item.release_superseded(&surface, ObservationBoundary::after_guest_frame());
    assert_eq!(item.pending_releases(), 0);
    surface.with_ui(|ui| assert!(ui.texture(a).is_none()));
}

#[test]
fn two_commits_before_one_boundary_release_every_superseded() {
    // Legal worst case: several publications commit inside one input
    // phase, before any guest frame observes any of them. Every
    // superseded handle must survive until the single next boundary and
    // release there — no leak, no slot growth across rounds.
    let surface = UiSurface::new((96.0, 64.0));
    let mut item = CurrentItem::new();
    let browse = BrowseSnapshot::none();
    item.publish(
        &surface,
        request_phase(),
        1,
        OpenIntent::NewItem,
        "a.png".into(),
        plane(4, 4),
        4,
        4,
        true,
        &browse,
    );
    let a = item.live_handle().expect("first publication");
    let mut steady_slots: Option<usize> = None;
    for round in 0..2u64 {
        item.publish(
            &surface,
            request_phase(),
            10 + round,
            OpenIntent::Refresh,
            "b.png".into(),
            plane(8, 8),
            8,
            8,
            true,
            &browse,
        );
        let b = item.live_handle().expect("round commit b");
        item.publish(
            &surface,
            request_phase(),
            20 + round,
            OpenIntent::Refresh,
            "c.png".into(),
            plane(16, 16),
            16,
            16,
            true,
            &browse,
        );
        let c = item.live_handle().expect("round commit c");
        assert_ne!(b, c, "round {round}");
        // a (from the warm-up) is superseded only in round 0; b and c
        // chain per round: two pending, all resolvable before the
        // boundary.
        assert_eq!(item.pending_releases(), 2, "round {round}");
        surface.with_ui(|ui| {
            if round == 0 {
                assert!(ui.texture(a).is_some());
            }
            assert!(ui.texture(b).is_some());
            assert!(ui.texture(c).is_some());
        });
        item.release_superseded(&surface, ObservationBoundary::after_guest_frame());
        assert_eq!(item.pending_releases(), 0, "round {round}");
        let slots = surface.with_ui(|ui| {
            assert!(ui.texture(b).is_none(), "round {round}: superseded freed");
            assert!(ui.texture(c).is_some(), "round {round}: publication live");
            ui.texture_slot_count()
        });
        // The native half of the guest binding oracle: after a coalesced
        // commit batch the LIVE handle is the batch's final candidate —
        // the publication a guest turn reconciles its binding to — and
        // every intermediate candidate is gone.
        assert_eq!(
            item.live_handle(),
            Some(c),
            "round {round}: final candidate is the publication"
        );
        match steady_slots {
            Some(s) => assert_eq!(
                s, slots,
                "round {round}: slot count stable across commit/boundary rounds"
            ),
            None => steady_slots = Some(slots),
        }
    }
}

#[cfg(windows)]
fn wic_encode_jpeg(width: u32, height: u32) -> Vec<u8> {
    use windows::Win32::Foundation::HGLOBAL;
    use windows::Win32::Graphics::Imaging::{
        CLSID_WICImagingFactory, GUID_ContainerFormatJpeg, GUID_WICPixelFormat32bppBGRA,
        IWICImagingFactory, WICBitmapEncoderNoCache,
    };
    use windows::Win32::System::Com::StructuredStorage::CreateStreamOnHGlobal;
    use windows::Win32::System::Com::{
        CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx,
        STREAM_SEEK_SET,
    };

    // SAFETY: test-only JPEG encode helper. Invariants:
    // - CoInitializeEx joins the MTA (S_FALSE = already joined, both fine);
    //   factory/stream/encoder/frame are COM locals that outlive every use
    //   below and release on drop.
    // - CreateStreamOnHGlobal with fDeleteOnRelease=true transfers the
    //   HGLOBAL to the stream.
    // - All buffer arguments (WritePixels pixel slice, Read target) are
    //   live, correctly sized slices/pointers for the duration of each
    //   call: Read is given a 1 MiB buffer and a matching length.
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED).ok();
        let factory: IWICImagingFactory =
            CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER).unwrap();
        let stream = CreateStreamOnHGlobal(HGLOBAL::default(), true).unwrap();
        let encoder = factory
            .CreateEncoder(&GUID_ContainerFormatJpeg, std::ptr::null())
            .unwrap();
        encoder
            .Initialize(&stream, WICBitmapEncoderNoCache)
            .unwrap();
        let mut frame_slot: Option<windows::Win32::Graphics::Imaging::IWICBitmapFrameEncode> = None;
        let mut props_slot: Option<windows::Win32::System::Com::StructuredStorage::IPropertyBag2> =
            None;
        encoder
            .CreateNewFrame(&mut frame_slot, &mut props_slot)
            .unwrap();
        let frame = frame_slot.unwrap();
        let props = props_slot.unwrap();
        frame.Initialize(&props).unwrap();
        frame.SetSize(width, height).unwrap();
        let mut format = GUID_WICPixelFormat32bppBGRA;
        frame.SetPixelFormat(&mut format).unwrap();
        let mut pixels = vec![0u8; width as usize * height as usize * 4];
        for y in 0..height {
            for x in 0..width {
                let at = (y * width + x) as usize * 4;
                pixels[at] = (x * 255 / width.max(1)) as u8;
                pixels[at + 2] = (y * 255 / height.max(1)) as u8;
                pixels[at + 3] = 255;
            }
        }
        frame
            .WritePixels(height, (width * 4) as u32, &pixels)
            .unwrap();
        frame.Commit().unwrap();
        encoder.Commit().unwrap();
        stream
            .Seek(0, STREAM_SEEK_SET, None)
            .ok()
            .expect("seek to start");
        let mut buf = vec![0u8; 1 << 20];
        let mut read = 0u32;
        stream
            .Read(buf.as_mut_ptr().cast(), buf.len() as u32, Some(&mut read))
            .ok()
            .expect("read encoded stream");
        buf.truncate(read as usize);
        buf
    }
}

#[cfg(windows)]
#[test]
fn exif_orientation_materializes_all_eight_semantic_cases() {
    // 2x3 asymmetric fixture: pixel A at (0,0), B at (1,0), C at (0,2).
    // Each EXIF case must place A at a distinct, predictable destination.
    let (w, h) = (2usize, 3usize);
    let mut rgba = vec![0u8; w * h * 4];
    let put = |rgba: &mut [u8], x: usize, y: usize, r: u8, g: u8, b: u8| {
        let i = (y * w + x) * 4;
        rgba[i] = r;
        rgba[i + 1] = g;
        rgba[i + 2] = b;
        rgba[i + 3] = 255;
    };
    put(&mut rgba, 0, 0, 255, 0, 0); // A red top-left
    put(&mut rgba, 1, 0, 0, 255, 0); // B green top-right
    put(&mut rgba, 0, 2, 0, 0, 255); // C blue bottom-left

    let at = |buf: &[u8], ow: usize, x: usize, y: usize| -> (u8, u8, u8) {
        let i = (y * ow + x) * 4;
        (buf[i], buf[i + 1], buf[i + 2])
    };

    // 1 normal
    let (ow, oh, o) = wic::apply_exif_orientation(2, 3, &rgba, 1);
    assert_eq!((ow, oh), (2, 3));
    assert_eq!(at(&o, 2, 0, 0), (255, 0, 0));

    // 2 mirror H: A → (1,0)
    let (ow, _oh, o) = wic::apply_exif_orientation(2, 3, &rgba, 2);
    assert_eq!(at(&o, ow as usize, 1, 0), (255, 0, 0));
    assert_eq!(at(&o, ow as usize, 0, 0), (0, 255, 0));

    // 3 rotate 180: A → (1,2)
    let (ow, oh, o) = wic::apply_exif_orientation(2, 3, &rgba, 3);
    assert_eq!((ow, oh), (2, 3));
    assert_eq!(at(&o, 2, 1, 2), (255, 0, 0));

    // 4 mirror V: A → (0,2)
    let (ow, _oh, o) = wic::apply_exif_orientation(2, 3, &rgba, 4);
    assert_eq!(at(&o, ow as usize, 0, 2), (255, 0, 0));

    // 5 transpose: A → (0,0), extent 3x2
    let (ow, oh, o) = wic::apply_exif_orientation(2, 3, &rgba, 5);
    assert_eq!((ow, oh), (3, 2));
    assert_eq!(at(&o, 3, 0, 0), (255, 0, 0));
    // Distinguish 5 from 7: B (encoded 1,0) → (0,1) under transpose
    assert_eq!(at(&o, 3, 0, 1), (0, 255, 0));

    // 6 rotate 90 CW: A → (2,0) in 3x2
    let (ow, oh, o) = wic::apply_exif_orientation(2, 3, &rgba, 6);
    assert_eq!((ow, oh), (3, 2));
    assert_eq!(at(&o, 3, 2, 0), (255, 0, 0));

    // 7 transverse: A → (2,1); B → (2,0) — opposite of 5 for B
    let (ow, oh, o) = wic::apply_exif_orientation(2, 3, &rgba, 7);
    assert_eq!((ow, oh), (3, 2));
    assert_eq!(at(&o, 3, 2, 1), (255, 0, 0));
    assert_eq!(at(&o, 3, 2, 0), (0, 255, 0));

    // 8 rotate 270 CW: A → (0,1)
    let (ow, oh, o) = wic::apply_exif_orientation(2, 3, &rgba, 8);
    assert_eq!((ow, oh), (3, 2));
    assert_eq!(at(&o, 3, 0, 1), (255, 0, 0));
}

#[test]
fn wic_decodes_a_real_jpeg_roundtrip() {
    let bytes = wic_encode_jpeg(64, 48);
    let decoded = decode_wic(&bytes).expect("decode WIC-encoded JPEG");
    assert_eq!(decoded.width, 64);
    assert_eq!(decoded.height, 48);
    assert_eq!(decoded.rgba.len(), 64 * 48 * 4);
}

#[cfg(windows)]
#[test]
fn wic_rejects_garbage_and_missing_paths_stay_bounded() {
    let garbage = decode_wic(&[0x00, 0x01, 0x02, 0x03, 0xFF, 0xEE]);
    assert!(matches!(garbage, Err(OpenError::Decode(_))));
    let missing = open_decoded(Path::new("Z:/definitely/not/here.jpg"));
    assert!(matches!(missing, Err(OpenError::MissingPath)));
}

#[cfg(windows)]
#[test]
fn initial_open_succeeds_and_publishes_at_source_resolution() {
    // Real PocketJS surface, CPU-side, driven through the real open path
    // (explicit file → WIC → native texture → svc events): proves the
    // ownership invariant without QuickJS GC or a GPU.
    let surface = UiSurface::new((96.0, 64.0));
    let jpg_a = std::env::temp_dir().join("picoview-lgp-initial.jpg");
    std::fs::write(&jpg_a, wic_encode_jpeg(32, 16)).unwrap();

    let mut item = CurrentItem::new();
    item.open(&surface, request_phase(), &jpg_a, OpenIntent::NewItem);
    let first = item
        .live_handle()
        .expect("first open publishes a live texture");
    surface.with_ui(|ui| assert!(ui.texture(first).is_some()));

    // End-to-end oracle through the real open path: the core-stored
    // resource must equal the WIC decode byte for byte — full source
    // resolution, RGBA order intact, bilinear admission flag set. A
    // resample, envelope shrink, or channel swizzle anywhere on the
    // open path breaks this. (The internal representation tag behind
    // the record is PocketJS's own contract; PicoView asserts observable
    // behavior, not the tag.)
    let expected = open_decoded(&jpg_a).expect("oracle redecode");
    surface.with_ui(|ui| {
        let view = ui.texture(first).expect("live texture view");
        assert_eq!((view.w, view.h), (expected.width, expected.height));
        assert!(
            view.linear,
            "fit-to-window display needs bilinear admission"
        );
        assert_eq!(&view.pixels[..expected.rgba.len()], &expected.rgba[..]);
    });

    // Source dimensions match resource for ordinary images.
    let (sw, sh) = item
        .live_source_dimensions()
        .expect("source dims published");
    assert_eq!((sw, sh), (32, 16));

    // An initial failure leaves no publication: no live resource, and
    // the corrupt candidate's decode error is bounded.
    let bad = std::env::temp_dir().join("picoview-lgp-initial-bad.jpg");
    std::fs::write(&bad, [0u8; 64]).unwrap();
    let mut fresh = CurrentItem::new();
    fresh.open(&surface, request_phase(), &bad, OpenIntent::NewItem);
    assert_eq!(fresh.live_handle(), None);
    fresh.open(&surface, request_phase(), &jpg_a, OpenIntent::NewItem);
    assert!(
        fresh.live_handle().is_some(),
        "open succeeds after a failed open"
    );

    let _ = std::fs::remove_file(&jpg_a);
    let _ = std::fs::remove_file(&bad);
}

#[cfg(windows)]
#[test]
fn command_open_from_empty_start_anchors_browse_session() {
    // Open File… / CLI path after a no-image boot must still produce a
    // directory browse session so Previous/Next work (WINDOWS-SHELL-UI-POLISH-1).
    let surface = UiSurface::new((96.0, 64.0));
    let dir = std::env::temp_dir().join("picoview-shell-open-browse");
    std::fs::create_dir_all(&dir).unwrap();
    let jpg = dir.join("anchor.jpg");
    let jpg2 = dir.join("neighbor.jpg");
    std::fs::write(&jpg, wic_encode_jpeg(16, 16)).unwrap();
    std::fs::write(&jpg2, wic_encode_jpeg(16, 16)).unwrap();

    let mut item = CurrentItem::new();
    assert!(item.browse().is_none());
    item.handle_command(&surface, request_phase(), Command::Open(jpg.clone()));
    assert!(
        item.live_handle().is_some(),
        "open publishes after empty start"
    );
    {
        let browse = item.browse().expect("Open anchors BrowseSession");
        assert!(browse.count() >= 2, "directory listing includes neighbors");
    }
    // Neighbor navigation is available after the Open File path.
    let navigated = item.handle_command(&surface, request_phase(), Command::Next)
        || item.handle_command(&surface, request_phase(), Command::Previous);
    assert!(navigated, "browse session enables Previous/Next after Open");

    let _ = std::fs::remove_file(&jpg);
    let _ = std::fs::remove_file(&jpg2);
    let _ = std::fs::remove_dir_all(&dir);
}

#[cfg(windows)]
#[test]
fn replacement_success_admits_candidate_before_releasing_old() {
    let surface = UiSurface::new((96.0, 64.0));
    let jpg_a = std::env::temp_dir().join("picoview-lgp-repl-a.jpg");
    let jpg_b = std::env::temp_dir().join("picoview-lgp-repl-b.jpg");
    std::fs::write(&jpg_a, wic_encode_jpeg(32, 16)).unwrap();
    std::fs::write(&jpg_b, wic_encode_jpeg(64, 64)).unwrap();

    let mut item = CurrentItem::new();
    item.open(&surface, request_phase(), &jpg_a, OpenIntent::NewItem);
    let first = item.live_handle().expect("first open publishes");
    item.open(&surface, request_phase(), &jpg_b, OpenIntent::NewItem);
    let second = item.live_handle().expect("second open publishes");
    assert_ne!(first, second);
    // The commit swapped the publication, but the superseded resource is
    // still resolvable: a guest frame that has not yet observed the new
    // ready event can still resolve the old handle.
    assert_eq!(item.pending_releases(), 1);
    surface.with_ui(|ui| {
        assert!(
            ui.texture(first).is_some(),
            "old stays resolvable until the observation boundary"
        );
        assert!(ui.texture(second).is_some(), "candidate is the publication");
    });
    item.release_superseded(&surface, ObservationBoundary::after_guest_frame());
    // Exactly one live publication after the boundary, no GC involvement.
    surface.with_ui(|ui| {
        assert!(ui.texture(first).is_none(), "old logical resource released");
        assert!(ui.texture(second).is_some(), "candidate is the publication");
    });

    let _ = std::fs::remove_file(&jpg_a);
    let _ = std::fs::remove_file(&jpg_b);
}

#[cfg(windows)]
#[test]
fn corrupt_new_item_failure_deliberately_replaces_the_publication() {
    // PRD §2.10: navigating to a corrupt NEW item may publish an error
    // item instead of preserving the previous image. This is the
    // deliberate counterpart of the refresh policy — not a regression.
    let surface = UiSurface::new((96.0, 64.0));
    let jpg = std::env::temp_dir().join("picoview-lgp-newitem.jpg");
    std::fs::write(&jpg, wic_encode_jpeg(32, 16)).unwrap();
    let bad = std::env::temp_dir().join("picoview-lgp-newitem-bad.jpg");
    std::fs::write(&bad, [0u8; 64]).unwrap();

    let mut item = CurrentItem::new();
    item.open(&surface, request_phase(), &jpg, OpenIntent::NewItem);
    let first = item.live_handle().expect("publication live");
    item.open(&surface, request_phase(), &bad, OpenIntent::NewItem);
    assert_eq!(
        item.live_handle(),
        None,
        "new-item failure replaces the publication"
    );
    // The replaced publication stays resolvable until the observation
    // boundary — the guest may still render it while the error event is
    // in flight.
    assert_eq!(item.pending_releases(), 1);
    surface.with_ui(|ui| assert!(ui.texture(first).is_some()));
    item.release_superseded(&surface, ObservationBoundary::after_guest_frame());
    surface.with_ui(|ui| assert!(ui.texture(first).is_none()));

    // A directory path fails as NotAFile, not MissingPath or a panic.
    item.open(&surface, request_phase(), &jpg, OpenIntent::NewItem);
    assert!(item.live_handle().is_some());
    let dir = std::env::temp_dir();
    item.open(&surface, request_phase(), &dir, OpenIntent::NewItem);
    assert_eq!(item.live_handle(), None);
    assert_eq!(item.pending_releases(), 1);
    item.release_superseded(&surface, ObservationBoundary::after_guest_frame());
    assert_eq!(item.pending_releases(), 0);

    let _ = std::fs::remove_file(&jpg);
    let _ = std::fs::remove_file(&bad);
}

#[cfg(windows)]
#[test]
fn refresh_decode_failure_keeps_last_good_published() {
    // The core last-good property (PRD §2.10, SPEC §7): when the
    // refresh candidate fails to decode, the old publication stays
    // current and its logical resource stays live.
    let surface = UiSurface::new((96.0, 64.0));
    let jpg_a = std::env::temp_dir().join("picoview-lgp-refdec-a.jpg");
    let jpg_b = std::env::temp_dir().join("picoview-lgp-refdec-b.jpg");
    std::fs::write(&jpg_a, wic_encode_jpeg(32, 16)).unwrap();
    std::fs::write(&jpg_b, wic_encode_jpeg(48, 48)).unwrap();
    let bad = std::env::temp_dir().join("picoview-lgp-refdec-bad.jpg");
    std::fs::write(&bad, [0u8; 64]).unwrap();

    let mut item = CurrentItem::new();
    item.open(&surface, request_phase(), &jpg_a, OpenIntent::NewItem);
    let first = item.live_handle().expect("publication live");

    item.open(&surface, request_phase(), &bad, OpenIntent::Refresh);
    assert_eq!(
        item.live_handle(),
        Some(first),
        "refresh decode failure must not touch the last-good resource"
    );
    assert_eq!(
        item.pending_releases(),
        0,
        "a refresh failure queues no pending retirement"
    );
    surface.with_ui(|ui| {
        let view = ui.texture(first).expect("last-good stays live");
        assert_eq!((view.w, view.h), (32, 16));
    });

    // A later successful refresh recovers normally: the candidate is the
    // publication, the old stays resolvable until the boundary.
    item.open(&surface, request_phase(), &jpg_b, OpenIntent::Refresh);
    let second = item.live_handle().expect("refresh success publishes");
    assert_ne!(first, second);
    assert_eq!(item.pending_releases(), 1);
    surface.with_ui(|ui| assert!(ui.texture(first).is_some()));
    item.release_superseded(&surface, ObservationBoundary::after_guest_frame());
    surface.with_ui(|ui| assert!(ui.texture(first).is_none()));

    let _ = std::fs::remove_file(&jpg_a);
    let _ = std::fs::remove_file(&jpg_b);
    let _ = std::fs::remove_file(&bad);
}

#[cfg(windows)]
#[test]
fn refresh_admission_failure_keeps_last_good_and_leaks_nothing() {
    // Smallest real mechanism, no dependency injection: publish a
    // crafted plane the real Core admission rejects (zero-width), once
    // as a Refresh and once as a NewItem. The refresh must preserve the
    // publication; the new-item failure deliberately replaces it.
    let surface = UiSurface::new((96.0, 64.0));
    let jpg = std::env::temp_dir().join("picoview-lgp-refadm.jpg");
    std::fs::write(&jpg, wic_encode_jpeg(32, 16)).unwrap();

    let mut item = CurrentItem::new();
    item.open(&surface, request_phase(), &jpg, OpenIntent::NewItem);
    let first = item.live_handle().expect("publication live");
    let slots_after_open = surface.with_ui(|ui| ui.texture_slot_count());

    let rejected = DecodedImage {
        width: 0,
        height: 0,
        rgba: Vec::new(),
    };
    let browse = BrowseSnapshot::none();
    item.publish(
        &surface,
        request_phase(),
        99,
        OpenIntent::Refresh,
        "rejected.png".into(),
        rejected,
        0,
        0,
        false,
        &browse,
    );
    assert_eq!(
        item.live_handle(),
        Some(first),
        "refresh admission failure must keep the last-good live"
    );
    assert_eq!(
        item.pending_releases(),
        0,
        "a refresh admission failure queues no pending retirement"
    );
    surface.with_ui(|ui| {
        assert!(ui.texture(first).is_some());
        assert_eq!(
            ui.texture_slot_count(),
            slots_after_open,
            "a rejected candidate allocates no resource"
        );
    });

    item.publish(
        &surface,
        request_phase(),
        100,
        OpenIntent::NewItem,
        "rejected.png".into(),
        DecodedImage {
            width: 0,
            height: 0,
            rgba: Vec::new(),
        },
        0,
        0,
        false,
        &browse,
    );
    assert_eq!(
        item.live_handle(),
        None,
        "new-item admission failure deliberately replaces the publication"
    );
    // Replacement removes the publication; the physical release waits
    // for the observation boundary.
    assert_eq!(item.pending_releases(), 1);
    surface.with_ui(|ui| assert!(ui.texture(first).is_some()));
    item.release_superseded(&surface, ObservationBoundary::after_guest_frame());
    surface.with_ui(|ui| assert!(ui.texture(first).is_none()));

    let _ = std::fs::remove_file(&jpg);
}

#[cfg(windows)]
#[test]
fn refresh_success_swaps_publication_and_releases_old() {
    let surface = UiSurface::new((96.0, 64.0));
    let jpg_a = std::env::temp_dir().join("picoview-lgp-refsuc-a.jpg");
    let jpg_b = std::env::temp_dir().join("picoview-lgp-refsuc-b.jpg");
    std::fs::write(&jpg_a, wic_encode_jpeg(32, 16)).unwrap();
    std::fs::write(&jpg_b, wic_encode_jpeg(64, 64)).unwrap();

    let mut item = CurrentItem::new();
    item.open(&surface, request_phase(), &jpg_a, OpenIntent::NewItem);
    let first = item.live_handle().expect("publication live");

    // The candidate is admitted while the old resource is still live
    // (transient two-resource overlap), then the commit swaps and the
    // superseded old stays resolvable until the observation boundary.
    // Observable end state: exactly one publication, and it is the
    // candidate.
    item.open(&surface, request_phase(), &jpg_b, OpenIntent::Refresh);
    let second = item.live_handle().expect("refresh success publishes");
    assert_ne!(first, second);
    assert_eq!(item.pending_releases(), 1);
    surface.with_ui(|ui| {
        assert!(
            ui.texture(first).is_some(),
            "old resolvable until the boundary — no stale-handle hole window"
        );
        assert!(ui.texture(second).is_some(), "candidate is the publication");
        let view = ui.texture(second).unwrap();
        assert_eq!((view.w, view.h), (64, 64));
    });
    item.release_superseded(&surface, ObservationBoundary::after_guest_frame());
    surface.with_ui(|ui| {
        assert!(ui.texture(first).is_none(), "old released at the boundary");
        assert!(ui.texture(second).is_some());
    });

    let _ = std::fs::remove_file(&jpg_a);
    let _ = std::fs::remove_file(&jpg_b);
}

#[cfg(windows)]
#[test]
fn repeated_publication_cycles_stay_bounded() {
    // Mixed refresh/new-item success and failure cycles: every branch
    // must settle. The core slot count is the leak oracle — once warm,
    // free-list reuse keeps it flat; any abandoned handle would grow it.
    let surface = UiSurface::new((96.0, 64.0));
    let jpg_a = std::env::temp_dir().join("picoview-lgp-cyc-a.jpg");
    let jpg_b = std::env::temp_dir().join("picoview-lgp-cyc-b.jpg");
    std::fs::write(&jpg_a, wic_encode_jpeg(32, 16)).unwrap();
    std::fs::write(&jpg_b, wic_encode_jpeg(40, 40)).unwrap();
    let bad = std::env::temp_dir().join("picoview-lgp-cyc-bad.jpg");
    std::fs::write(&bad, [0u8; 64]).unwrap();

    let mut item = CurrentItem::new();
    item.open(&surface, request_phase(), &jpg_a, OpenIntent::NewItem);
    // Warm the alloc/free cycle once (including one observation-boundary
    // release) so the slot count is at its steady value before the leak
    // oracle starts measuring.
    item.open(&surface, request_phase(), &jpg_b, OpenIntent::Refresh);
    item.release_superseded(&surface, ObservationBoundary::after_guest_frame());
    let steady_slots = surface.with_ui(|ui| ui.texture_slot_count());

    let rejected = || DecodedImage {
        width: 0,
        height: 0,
        rgba: Vec::new(),
    };
    let browse = BrowseSnapshot::none();
    for cycle in 0..6u64 {
        item.open(&surface, request_phase(), &jpg_b, OpenIntent::Refresh);
        let live = item.live_handle().expect("cycle leaves a publication");
        let pending_after_commit = item.pending_releases();
        item.open(&surface, request_phase(), &bad, OpenIntent::Refresh);
        assert_eq!(
            item.live_handle(),
            Some(live),
            "cycle {cycle}: refresh failure preserves"
        );
        item.publish(
            &surface,
            request_phase(),
            1000 + cycle,
            OpenIntent::Refresh,
            "r".into(),
            rejected(),
            0,
            0,
            false,
            &browse,
        );
        assert_eq!(
            item.live_handle(),
            Some(live),
            "cycle {cycle}: admission failure preserves"
        );
        assert_eq!(
            item.pending_releases(),
            pending_after_commit,
            "cycle {cycle}: refresh failures queue no pending retirement"
        );
        item.publish(
            &surface,
            request_phase(),
            2000 + cycle,
            OpenIntent::NewItem,
            "r".into(),
            rejected(),
            0,
            0,
            false,
            &browse,
        );
        assert_eq!(
            item.live_handle(),
            None,
            "cycle {cycle}: new-item failure replaces"
        );
        // One guest observation boundary per commit batch (the runtime
        // runs it after every tick): the removed publication frees
        // exactly here, never earlier.
        item.release_superseded(&surface, ObservationBoundary::after_guest_frame());
        assert_eq!(
            item.pending_releases(),
            0,
            "cycle {cycle}: the boundary drains the pending state fully"
        );
        item.open(&surface, request_phase(), &jpg_a, OpenIntent::NewItem);
        let next = item
            .live_handle()
            .expect("cycle {cycle}: recovery publishes");
        assert_ne!(next, live, "superseded handle must not be handed out again");
        item.release_superseded(&surface, ObservationBoundary::after_guest_frame());
        surface.with_ui(|ui| {
            assert!(ui.texture(live).is_none());
            assert_eq!(
                ui.texture_slot_count(),
                steady_slots,
                "cycle {cycle}: no slot growth"
            );
        });
    }

    let _ = std::fs::remove_file(&jpg_a);
    let _ = std::fs::remove_file(&jpg_b);
    let _ = std::fs::remove_file(&bad);
}

#[test]
fn decode_dimensions_are_capped_before_allocation() {
    assert!(decode_alloc_len(65535, 65535).is_err());
    assert!(decode_alloc_len(1, 1).is_ok());
    // Just inside the cap is accepted (80 Mpx RGBA = 320 MB).
    assert_eq!(
        decode_alloc_len(10000, 8000).unwrap(),
        10000usize * 8000usize * 4
    );
}

#[test]
fn texture_key_hint_is_the_shared_wire_literal() {
    // The guest binding module OWNS key derivation (guest/binding.ts
    // `TEXTURE_KEY`); native carries the same literal as a hint. Each side
    // pins its own constant (machine-readable, no cross-language
    // source-text matching): this is the native half, guest/binding.test.ts
    // holds the guest half.
    assert_eq!(TEXTURE_KEY_HINT, "picoview-current");
}

#[cfg(windows)]
#[test]
fn live_corpus_follows_installed_device_capability() {
    // OPT-IN live corpus evidence (post-release normalization C7): real
    // Windows decode of a giant + control fixture under (1) portable default
    // policy and (2) raised device capability. Explicit env contract —
    // point PICOVIEW_LIVE_CORPUS at a directory containing the two fixture
    // files below. A fresh clone without the variable runs NO corpus test
    // and reports the skip loudly; it never silently pretends the corpus
    // ran. Does not claim interactive 1:1 button clicks; those fall out of
    // publication.fullResolution via the unchanged guest gate.
    use crate::current_item::decode_policy_for_device;
    let Some(corpus) = std::env::var_os("PICOVIEW_LIVE_CORPUS") else {
        eprintln!(
            "SKIP live corpus test: opt-in by setting PICOVIEW_LIVE_CORPUS to a \
             directory containing the giant JPEG and control PNG fixtures"
        );
        return;
    };
    let corpus = PathBuf::from(corpus);
    let giant = corpus.join("001R0E0aly1i50ph1thhjj66dc48w1l102.jpg");
    let control = corpus.join("153fcfe9-d06a-411e-98b5-3fb62a77afc3.png");
    if !giant.is_file() || !control.is_file() {
        panic!(
            "PICOVIEW_LIVE_CORPUS={} is set but fixture files are missing \
             (expected the 8256x5504 JPEG and the control PNG)",
            corpus.display()
        );
    }
    let surface = UiSurface::new((96.0, 64.0));

    // Portable default (pre-fix policy class): giant becomes proxy.
    let mut portable = CurrentItem::new();
    portable.set_admission_policy(decode_policy_for_device(8192));
    surface.with_ui(|ui| ui.set_image_max_texture_dim(8192));
    portable.open(&surface, request_phase(), giant.as_path(), OpenIntent::NewItem);
    let handle = portable.live_handle().expect("giant open publishes under portable policy");
    surface.with_ui(|ui| {
        let view = ui.texture(handle).expect("portable giant resource");
        assert!(view.w <= 8192 && view.h <= 8192);
        assert_ne!(
            (view.w, view.h),
            (8256, 5504),
            "portable 8192 ceiling must not claim exact 8256×5504"
        );
    });

    // Raised created-device capability: giant admits at exact source size.
    let surface2 = UiSurface::new((96.0, 64.0));
    surface2.with_ui(|ui| {
        assert_eq!(ui.image_max_texture_dim(), pocketjs_core::NATIVE_TEX_MAX_DIM);
        ui.set_image_max_texture_dim(16384);
        assert_eq!(ui.image_max_texture_dim(), 16384);
    });
    let mut capable = CurrentItem::new();
    capable.set_admission_policy(decode_policy_for_device(16384));
    capable.open(&surface2, request_phase(), giant.as_path(), OpenIntent::NewItem);
    let ghandle = capable.live_handle().expect("giant open publishes under device capability");
    let (sw, sh) = capable
        .live_source_dimensions()
        .expect("source dims published");
    surface2.with_ui(|ui| {
        let view = ui.texture(ghandle).expect("capable giant resource");
        assert_eq!(
            (view.w, view.h),
            (sw, sh),
            "resource must equal source when capability allows"
        );
        assert_eq!((view.w, view.h), (8256, 5504), "source is the 8256×5504 corpus JPEG");
        assert!(view.linear);
    });
    // fullResolution derivation: source==resource ⇒ guest can100 stays true.
    assert_eq!((sw, sh), (8256, 5504));

    // Control PNG remains full resolution under both policies.
    for dim in [8192u32, 16384u32] {
        let s = UiSurface::new((96.0, 64.0));
        s.with_ui(|ui| ui.set_image_max_texture_dim(dim));
        let mut item = CurrentItem::new();
        item.set_admission_policy(decode_policy_for_device(dim));
        item.open(&s, request_phase(), control.as_path(), OpenIntent::NewItem);
        let h = item.live_handle().expect("control open publishes");
        let (cw, ch) = item.live_source_dimensions().unwrap();
        s.with_ui(|ui| {
            let view = ui.texture(h).expect("control resource");
            assert_eq!((view.w, view.h), (1254, 1254), "dim={dim}");
            assert_eq!((cw, ch), (1254, 1254));
        });
    }
}

// decode_wic is cfg-gated; re-export for tests.
#[cfg(windows)]
use super::decode::wic::decode_wic;

// --- Encoded-length admission boundary (corrective-1) ------------------------

#[test]
fn encoded_length_admission_boundary_is_limit_inclusive() {
    // The predicate is testable without a 1 GiB fixture: it is pure over the
    // byte length. limit-1 and the limit itself are admitted; limit+1 is
    // rejected before any read/allocation happens.
    assert!(admits_encoded_len(
        MAX_ENCODED_FILE_BYTES - 1,
        MAX_ENCODED_FILE_BYTES
    ));
    assert!(admits_encoded_len(
        MAX_ENCODED_FILE_BYTES,
        MAX_ENCODED_FILE_BYTES
    ));
    assert!(!admits_encoded_len(
        MAX_ENCODED_FILE_BYTES + 1,
        MAX_ENCODED_FILE_BYTES
    ));
    // Far over the cap is rejected, and the two caps are independent: byte
    // size and decoded pixel dimensions never imply each other.
    assert!(!admits_encoded_len(u64::MAX, MAX_ENCODED_FILE_BYTES));
}

// --- Same-handle bounded encoded read (corrective-2) -------------------------

#[test]
fn encoded_reader_admits_up_to_limit_and_rejects_above() {
    // The read bound at tiny scale, through the real reader (probe → open →
    // take → read → check), not just the pure predicate. limit-1 and limit
    // pass; limit+1 is rejected. No cap-sized fixture is needed.
    const LIMIT: u64 = 16;
    let mut cases = Vec::new();
    for len in [LIMIT - 1, LIMIT, LIMIT + 1] {
        let path = std::env::temp_dir().join(format!("picoview-enc-bounded-{len}.bin"));
        std::fs::write(&path, vec![0u8; len as usize]).unwrap();
        cases.push((path, len));
    }
    for (path, len) in &cases {
        let result = read_encoded_bounded(path, LIMIT);
        if *len <= LIMIT {
            let bytes = result.unwrap_or_else(|e| panic!("{len} bytes must be admitted: {e:?}"));
            assert_eq!(bytes.len() as u64, *len);
        } else {
            assert!(
                matches!(result, Err(OpenError::Open(_))),
                "{len} bytes must be rejected over a {LIMIT}-byte limit"
            );
        }
        let _ = std::fs::remove_file(path);
    }
}

#[test]
fn encoded_reader_overread_is_capped_at_limit_plus_one() {
    // Proof the reader itself is bounded — not only the length predicate:
    // a file far larger than the limit yields at most limit + 1 bytes from
    // the read, so the transient allocation cannot exceed cap + 1 no matter
    // how large the file grows after the size probe.
    const LIMIT: u64 = 16;
    let path = std::env::temp_dir().join("picoview-enc-bounded-huge.bin");
    std::fs::write(&path, vec![0xAB; (LIMIT + 1000) as usize]).unwrap();

    let mut file = std::fs::File::open(&path).unwrap();
    let taken = take_bounded(&mut file, LIMIT).unwrap();
    assert_eq!(taken.len() as u64, LIMIT + 1);
    assert_eq!(taken[0], 0xAB);

    // And through the production entry point the same file is rejected, so
    // growth between probe and read can never land over-cap bytes in memory.
    assert!(matches!(
        read_encoded_bounded(&path, LIMIT),
        Err(OpenError::Open(_))
    ));
    let _ = std::fs::remove_file(&path);
}

#[test]
fn metadata_error_maps_only_not_found_to_missing_path() {
    use std::io::ErrorKind;
    // A genuine not-found is the "path does not exist" category.
    assert_eq!(
        metadata_error(&std::io::Error::from(ErrorKind::NotFound)),
        OpenError::MissingPath
    );
    // Any other I/O failure keeps its message under the readable-error
    // category instead of masquerading as a missing file.
    let denied = metadata_error(&std::io::Error::from(ErrorKind::PermissionDenied));
    assert!(matches!(denied, OpenError::Open(_)));
    assert!(!denied.message().is_empty());
}
