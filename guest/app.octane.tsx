import { useRef, useState } from "octane";
import { Text, View, Image } from "@pocketjs/framework/octane/components";
import { registerTexture } from "@pocketjs/framework/octane/renderer";
import { getOps } from "@pocketjs/framework/host";
import { useFrame } from "@pocketjs/framework/octane/lifecycle";
import {
  displayVerdict,
  initialObserverState,
  type ObserverState,
} from "./observer.ts";
import { textureKeyFor, type BoundPublication } from "./binding.ts";
import { runGuestTurn } from "./turn.ts";
import {
  cmdPrevious,
  cmdNext,
  cmdRefresh,
} from "./commands.ts";
import {
  initialViewState,
  resetToFit,
  resetForNewPublication,
  set100Percent,
  zoomIn,
  zoomOut,
  clampPan,
  displayScale,
  effectiveScale,
  reconcileViewForPublication,
  publicationViewKeyFrom,
  type ViewState,
  type ViewGeometry,
  type PublicationViewKey,
} from "./view_state.ts";

// PicoView Real Viewer (PICOVIEW-REAL-VIEWER-TRAIN-1 closeout).
//
// The guest is a bounded observer of native Current Item state. It receives
// svc events carrying only scalars (status, generation, intent, texture
// handle, dimensions, browse state, capability truth, error text); the pixels
// stay in the native texture registry. The observation state is split into
// publication (last-good, stays visible across a refresh's loading/failure)
// and request (progress/failure, carrying the Product intent).
//
// Product commands (Previous/Next/Refresh) are sent to native via svcSend.
// View state (Fit / truthful 1:1 / Zoom) is presentation-only: it changes
// how the image is drawn, not what image is drawn.
//
// Shipped capability on the current PocketJS pin:
//   Previous, Next, Zoom -, Zoom +, Fit, 1:1 (full resolution only), Refresh,
//   keyboard Left/Right/R/0/1/+/-, status (N/total, dimensions, Proxy/Full).
//
// NOT shipped (PocketJS precursor backlog — do not claim as product features):
//   POCKETJS_GAP_INPUT_GESTURES     — wheel zoom, mouse-drag pan
//   POCKETJS_GAP_TEXTURED_2D_TRANSFORM — image rotate, image flip
// Rotate/Flip helpers in view_state.ts stay pure and unwired. This app must
// not emit CSS `transform: "rotate(...)"`; the pinned PocketJS DrawList
// culls rotated Image quads.

function processKeyEvents(
  keyEvents: { k: string; cmd?: boolean; ctl?: boolean }[],
  setView: (fn: (s: ViewState) => ViewState) => void,
  browse: { canPrevious: boolean; canNext: boolean },
  can100: boolean,
  geo: ViewGeometry,
) {
  for (const e of keyEvents) {
    const k = e.k;
    const ctrl = !!(e.cmd || e.ctl);
    switch (k) {
      case "left":
        if (browse.canPrevious) cmdPrevious();
        break;
      case "right":
        if (browse.canNext) cmdNext();
        break;
      case "r":
        if (!ctrl) cmdRefresh();
        break;
      case "0":
        setView(s => resetToFit(s));
        break;
      case "1":
        if (can100) setView(s => clampPan(set100Percent(s), geo.imageW, geo.imageH, geo.viewportW, geo.viewportH));
        break;
      case "=":
      case "+":
        setView(s => clampPan(zoomIn(s, geo), geo.imageW, geo.imageH, geo.viewportW, geo.viewportH));
        break;
      case "-":
        setView(s => clampPan(zoomOut(s, geo), geo.imageW, geo.imageH, geo.viewportW, geo.viewportH));
        break;
    }
  }
}

export default function App() {
  // Current Item observations live in a plain ref that the pure reducer
  // folds per svc line: one frame's svcPoll drain applies every line in
  // order. The tick counter only schedules the re-render.
  const item = useRef<ObserverState>(initialObserverState());
  const revision = useRef(0);
  const [, setRevision] = useState(0);
  // The publication the mounted Image currently resolves to, plus the
  // texture-key slot its src string names. Not Product authority — it
  // remembers a rendering fact only (binding.ts).
  const binding = useRef<BoundPublication | null>(null);
  // View state: presentation-only, not Product authority.
  const viewRef = useRef<ViewState>(initialViewState());
  const [viewState, setViewState] = useState<ViewState>(initialViewState());
  // Last publication identity the view state was reconciled against.
  // Navigation (different browse index/name) resets to Fit; refresh of the
  // same usable geometry preserves view.
  const viewKey = useRef<PublicationViewKey | null>(null);

  useFrame(() => {
    const ops = getOps();
    const poll = ops.svcPoll;
    if (!poll) return;
    // One guest turn: reduce every queued svc batch in order, then commit
    // exactly ONE view binding against the final observed publication.
    const outcome = runGuestTurn(
      { observer: item.current, binding: binding.current },
      () => poll.call(ops),
    );
    item.current = outcome.state.observer;
    binding.current = outcome.state.binding;
    // Register before the re-render flush: setSrc resolves the key there.
    if (outcome.register) registerTexture(outcome.register.key, outcome.register.handle);

    // Reconcile presentation view against publication identity. Smallest
    // guest-side rule keyed by browse position + name + usable geometry.
    // Does not disturb PR #57 binding/lifetime.
    const nextKey = publicationViewKeyFrom(item.current);
    const action = reconcileViewForPublication(viewKey.current, nextKey);
    if (action === "reset") {
      viewRef.current = resetForNewPublication(viewRef.current);
      setViewState(viewRef.current);
    } else if (action === "revalidate") {
      viewRef.current = resetToFit(viewRef.current);
      setViewState(viewRef.current);
    }
    viewKey.current = nextKey;

    // Process key events for keyboard shortcuts.
    if (outcome.keyEvents.length > 0) {
      const st = item.current;
      const pub = st.publication;
      const vp = st.viewport;
      const geo: ViewGeometry = {
        imageW: pub ? (pub.resourceWidth || pub.sourceWidth) : 0,
        imageH: pub ? (pub.resourceHeight || pub.sourceHeight) : 0,
        viewportW: vp?.w ?? 960,
        viewportH: vp?.h ?? 640,
      };
      const keys = outcome.keyEvents
        .filter((e): e is { k: string; cmd?: boolean; ctl?: boolean } =>
          typeof e.k === "string",
        )
        .map(e => ({
          k: e.k as string,
          cmd: typeof e.cmd === "boolean" ? e.cmd : undefined,
          ctl: typeof e.ctl === "boolean" ? e.ctl : undefined,
        }));
      processKeyEvents(
        keys,
        (fn) => {
          const next = fn(viewRef.current);
          viewRef.current = next;
          setViewState(next);
        },
        st.browse,
        pub?.fullResolution === true,
        geo,
      );
    }
    if (outcome.render) {
      revision.current += 1;
      setRevision(revision.current);
    }
  });

  const state = item.current;
  const verdict = displayVerdict(state);
  const publication = state.publication;
  const request = state.request;
  const bound = binding.current;
  const browse = state.browse;
  const viewport = state.viewport;

  // Compute image dimensions for display (resource plane — the admitted
  // representation the guest binds).
  const imgW = publication ? (publication.resourceWidth || publication.sourceWidth) : 0;
  const imgH = publication ? (publication.resourceHeight || publication.sourceHeight) : 0;
  const containerW = viewport?.w ?? 960;
  const containerH = viewport?.h ?? 640;
  const geo: ViewGeometry = {
    imageW: imgW,
    imageH: imgH,
    viewportW: containerW,
    viewportH: containerH,
  };

  // Layout uses the effective displayed scale (Fit materializes for display).
  const effective = effectiveScale(viewState, geo);
  const displayW = Math.max(1, Math.round(imgW * effective));
  const displayH = Math.max(1, Math.round(imgH * effective));
  const zoomText = displayScale(viewState, geo);

  // Image position (centered + pan offset).
  const imgLeft = Math.round((containerW - displayW) / 2 + viewState.panX);
  const imgTop = Math.round((containerH - displayH) / 2 + viewState.panY);

  // Refresh indicator.
  const refreshIndicator =
    verdict === "image" && request
      ? request.status === "loading"
        ? "Refreshing…"
        : "Refresh failed"
      : null;
  const statusText =
    refreshIndicator ??
    (verdict === "error"
      ? "Error"
      : verdict === "loading"
        ? "Opening…"
        : "Ready");
  const shownName =
    verdict === "image"
      ? publication?.name
      : verdict === "loading" || verdict === "error"
        ? request?.name
        : undefined;

  // Position text: "3 / 17"
  const posText = browse.count > 0 && browse.index !== null
    ? `${browse.index + 1} / ${browse.count}`
    : "";

  // Dimension text.
  const dimText = publication
    ? publication.fullResolution
      ? `${publication.sourceWidth} × ${publication.sourceHeight}`
      : `${publication.resourceWidth} × ${publication.resourceHeight} (proxy)`
    : "";

  // Full resolution badge.
  const resBadge = publication
    ? publication.fullResolution ? "Full resolution" : "Proxy"
    : "";

  // Can the user use 1:1? Only when full resolution is available.
  const can100 = publication?.fullResolution === true;

  return (
    <View class="w-full h-full flex-col bg-slate-900">
      {/* Top bar: title + filename + position */}
      <View class="flex-row items-center justify-between px-4 py-2 bg-slate-950">
        <Text class="text-sm text-white font-bold">PicoView</Text>
        {shownName ? (
          <Text class="text-xs text-slate-400 flex-1 text-center">{shownName}</Text>
        ) : null}
        {posText ? (
          <Text class="text-xs text-slate-500">{posText}</Text>
        ) : null}
      </View>

      {/* Image canvas */}
      <View class="flex-1 bg-slate-800 overflow-hidden">
        {verdict === "image" && bound ? (
          <Image
            src={textureKeyFor(bound.slot)}
            style={{
              // PocketJS PROP contract (not CSS): posType Absolute + insets.
              posType: 1,
              insetL: imgLeft,
              insetT: imgTop,
              width: displayW,
              height: displayH,
            }}
          />
        ) : verdict === "image" ? (
          <View class="flex-1 flex-col items-center justify-center">
            <Text class="text-sm text-slate-400">Preparing image…</Text>
          </View>
        ) : verdict === "loading" ? (
          <View class="flex-1 flex-col items-center justify-center">
            <Text class="text-sm text-slate-400">{`Opening ${request?.name ?? "image"}…`}</Text>
          </View>
        ) : verdict === "error" ? (
          <View class="flex-1 flex-col items-center justify-center">
            <Text class="text-sm text-red-400">{request?.error ?? "Could not open image"}</Text>
          </View>
        ) : (
          <View class="flex-1 flex-col items-center justify-center">
            <Text class="text-sm text-slate-400">No image open</Text>
          </View>
        )}
      </View>

      {/* Refresh error bar */}
      {refreshIndicator === "Refresh failed" && request?.error ? (
        <View class="px-4 py-1 bg-slate-950 overflow-hidden">
          <Text class="text-xs text-red-400">{request.error}</Text>
        </View>
      ) : null}

      {/* Toolbar — shipped capability only.
          Rotate/Flip intentionally absent: PocketJS precursor required. */}
      <View class="flex-row items-center justify-center gap-2 px-4 py-2 bg-slate-950">
        <ToolbarButton
          label="‹"
          disabled={!browse.canPrevious}
          onPress={() => cmdPrevious()}
        />
        <ToolbarButton
          label="›"
          disabled={!browse.canNext}
          onPress={() => cmdNext()}
        />
        <Separator />

        <ToolbarButton
          label="−"
          disabled={verdict !== "image"}
          onPress={() => {
            const next = clampPan(zoomOut(viewRef.current, geo), imgW, imgH, containerW, containerH);
            viewRef.current = next;
            setViewState(next);
          }}
        />
        <Text class="text-xs text-slate-300 w-16 text-center">{zoomText}</Text>
        <ToolbarButton
          label="+"
          disabled={verdict !== "image"}
          onPress={() => {
            const next = clampPan(zoomIn(viewRef.current, geo), imgW, imgH, containerW, containerH);
            viewRef.current = next;
            setViewState(next);
          }}
        />
        <Separator />

        <ToolbarButton
          label="Fit"
          disabled={verdict !== "image"}
          onPress={() => {
            const next = resetToFit(viewRef.current);
            viewRef.current = next;
            setViewState(next);
          }}
        />
        <ToolbarButton
          label="1:1"
          disabled={!can100 || verdict !== "image"}
          onPress={() => {
            const next = set100Percent(viewRef.current);
            viewRef.current = next;
            setViewState(clampPan(next, imgW, imgH, containerW, containerH));
          }}
        />
        <Separator />

        <ToolbarButton
          label="↻"
          disabled={verdict !== "image"}
          onPress={() => cmdRefresh()}
        />
      </View>

      {/* Status bar */}
      <View class="flex-row items-center justify-between px-4 py-1 bg-slate-950">
        <Text class="text-xs text-slate-500">{statusText}</Text>
        {dimText ? (
          <Text class="text-xs text-slate-500">{dimText}</Text>
        ) : null}
        {resBadge ? (
          <Text class={publication?.fullResolution ? "text-xs text-slate-500" : "text-xs text-amber-500"}>
            {resBadge}
          </Text>
        ) : null}
        {verdict === "image" ? (
          <Text class="text-xs text-slate-500">{zoomText}</Text>
        ) : null}
      </View>
    </View>
  );
}

// --- Toolbar helpers ---

function ToolbarButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <View
      class={disabled
        ? "px-3 py-1 bg-slate-800 rounded"
        : "px-3 py-1 bg-slate-700 rounded focus:bg-slate-600 active:bg-slate-500"
      }
      onPress={disabled ? undefined : onPress}
      focusable={!disabled}
    >
      <Text class={disabled ? "text-xs text-slate-600" : "text-xs text-white"}>
        {label}
      </Text>
    </View>
  );
}

function Separator() {
  return <View class="w-px h-4 bg-slate-700" />;
}
