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
  set100Percent,
  fitScale,
  zoomIn,
  zoomOut,
  panDelta,
  clampPan,
  rotateLeft,
  rotateRight,
  flipHorizontal,
  type ViewState,
  type QuarterTurns,
} from "./view_state.ts";

// PicoView Real Viewer (PICOVIEW-REAL-VIEWER-TRAIN-1).
//
// The guest is a bounded observer of native Current Item state. It receives
// svc events carrying only scalars (status, generation, intent, texture
// handle, dimensions, browse state, capability truth, error text); the pixels
// stay in the native texture registry. The observation state is split into
// publication (last-good, stays visible across a refresh's loading/failure)
// and request (progress/failure, carrying the Product intent).
//
// Product commands (Previous/Next/Refresh) are sent to native via svcSend.
// View state (Fit/100%/Zoom/Pan/Rotate/Flip) is presentation-only: it
// changes how the image is drawn, not what image is drawn.
//
// Keyboard shortcuts are handled through the PocketJS desktop host's
// {"t":"key","k":"<name>","cmd":bool,"ctl":bool} svc messages. The host
// sends these for every key press that doesn't map to a gamepad button.

// --- Keyboard handling via svc key events ---

function processKeyEvents(
  keyEvents: { k: string; cmd?: boolean; ctl?: boolean }[],
  viewRef: { current: ViewState },
  setView: (fn: (s: ViewState) => ViewState) => void,
  browse: { canPrevious: boolean; canNext: boolean },
  can100: boolean,
  containerW: number,
  containerH: number,
  imgW: number,
  imgH: number,
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
        if (can100) setView(s => set100Percent(s));
        break;
      case "=":
      case "+":
        setView(s => zoomIn(s));
        break;
      case "-":
        setView(s => zoomOut(s));
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
    // Process key events for keyboard shortcuts.
    if (outcome.keyEvents.length > 0) {
      const st = item.current;
      const pub = st.publication;
      const vp = st.viewport;
      processKeyEvents(
        outcome.keyEvents,
        viewRef,
        (fn) => {
          const next = fn(viewRef.current);
          viewRef.current = next;
          setViewState(next);
        },
        st.browse,
        pub?.fullResolution === true,
        vp?.w ?? 960,
        vp?.h ?? 640,
        pub ? (pub.resourceWidth || pub.sourceWidth) : 0,
        pub ? (pub.resourceHeight || pub.sourceHeight) : 0,
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

  // Compute image dimensions for display.
  const imgW = publication ? (publication.resourceWidth || publication.sourceWidth) : 0;
  const imgH = publication ? (publication.resourceHeight || publication.sourceHeight) : 0;

  // Compute Fit dimensions for the image element.
  const effectiveScale = viewState.mode === "fit"
    ? fitScale(imgW, imgH, viewport?.w ?? 960, viewport?.h ?? 640, viewState.quarterTurns)
    : viewState.scale;
  const rotated = viewState.quarterTurns % 2 === 1;
  const displayW = rotated ? Math.max(1, Math.round(imgH * effectiveScale)) : Math.max(1, Math.round(imgW * effectiveScale));
  const displayH = rotated ? Math.max(1, Math.round(imgW * effectiveScale)) : Math.max(1, Math.round(imgH * effectiveScale));

  // Zoom display text.
  const zoomText = viewState.mode === "fit"
    ? "Fit"
    : `${Math.round(viewState.scale * 100)}%`;

  // Image position (centered + pan offset).
  const containerW = viewport?.w ?? 960;
  const containerH = viewport?.h ?? 640;
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
              position: "absolute",
              left: imgLeft,
              top: imgTop,
              width: displayW,
              height: displayH,
              ...imageTransform(viewState),
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

      {/* Toolbar */}
      <View class="flex-row items-center justify-center gap-2 px-4 py-2 bg-slate-950">
        {/* Navigation */}
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

        {/* Zoom */}
        <ToolbarButton
          label="−"
          disabled={verdict !== "image"}
          onPress={() => {
            const next = zoomOut(viewRef.current);
            viewRef.current = next;
            setViewState(clampPan(next, imgW, imgH, containerW, containerH));
          }}
        />
        <Text class="text-xs text-slate-300 w-12 text-center">{zoomText}</Text>
        <ToolbarButton
          label="+"
          disabled={verdict !== "image"}
          onPress={() => {
            const next = zoomIn(viewRef.current);
            viewRef.current = next;
            setViewState(clampPan(next, imgW, imgH, containerW, containerH));
          }}
        />
        <Separator />

        {/* Fit / 1:1 */}
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

        {/* Rotate / Flip */}
        <ToolbarButton
          label="↶"
          disabled={verdict !== "image"}
          onPress={() => {
            const next = rotateLeft(viewRef.current);
            viewRef.current = next;
            setViewState(resetToFit(next));
          }}
        />
        <ToolbarButton
          label="↷"
          disabled={verdict !== "image"}
          onPress={() => {
            const next = rotateRight(viewRef.current);
            viewRef.current = next;
            setViewState(resetToFit(next));
          }}
        />
        <ToolbarButton
          label="Flip"
          disabled={verdict !== "image"}
          onPress={() => {
            const next = flipHorizontal(viewRef.current);
            viewRef.current = next;
            setViewState(next);
          }}
        />
        <Separator />

        {/* Refresh */}
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
          <Text class={`text-xs ${publication?.fullResolution ? "text-slate-500" : "text-amber-500"}`}>
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

// Convert ViewState to inline style transform properties.
function imageTransform(state: ViewState): Record<string, number | string> {
  const transforms: string[] = [];
  if (state.flipX) transforms.push("scaleX(-1)");
  if (state.flipY) transforms.push("scaleY(-1)");
  if (state.quarterTurns > 0) {
    transforms.push(`rotate(${state.quarterTurns * 90}deg)`);
  }
  if (transforms.length === 0) return {};
  return { transform: transforms.join(" ") };
}
