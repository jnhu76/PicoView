import { useRef, useState } from "octane";
import { Text, View, Image } from "@pocketjs/framework/octane/components";
import { registerTexture } from "@pocketjs/framework/octane/renderer";
import { getOps } from "@pocketjs/framework/host";
import { useFrame } from "@pocketjs/framework/octane/lifecycle";
import {
  focusNode,
  hitFocusable,
  pressNode,
  setActiveNode,
} from "@pocketjs/framework/input";
import {
  displayVerdict,
  initialObserverState,
  type ObserverState,
} from "./observer.ts";
import { textureKeyFor, type BoundPublication } from "./binding.ts";
import { runGuestTurn } from "./turn.ts";
import { cmdPrevious, cmdNext, cmdRefresh } from "./commands.ts";
import { imageViewport, pointInImageViewport } from "./shell_layout.ts";
import {
  publicationViewKeyFrom,
  reconcileViewForPublication,
  type PublicationViewKey,
} from "./view_state.ts";
import {
  actualSize,
  fitView,
  flipHorizontal,
  flipVertical,
  initialViewTransform,
  panBy,
  pocketImageStyle,
  resetForNewPublication,
  resetView,
  rotateLeft,
  rotateRight,
  setDpiScale,
  zoomAt,
  zoomIn,
  zoomLabel,
  zoomOut,
  type OrientedImage,
  type ViewTransform,
} from "./view_transform.ts";
import { createPointerPress } from "./pointer_press.ts";

// PicoView viewer shell (PICOVIEW-VIEW-GEOMETRY-CORRECTIVE-1).
//
// All Fit / zoom / pan / rotate / flip geometry goes through
// guest/view_transform.ts. The image viewport comes from shell_layout.ts —
// never magic -16/-80 deductions. DPI arrives as viewport.dpi from the host.
// Pointer and wheel events are host-forwarded (desktop host parity).

type PointerDrag = {
  active: boolean;
  lastX: number;
  lastY: number;
};

export default function App() {
  const item = useRef<ObserverState>(initialObserverState());
  const revision = useRef(0);
  const [, setRevision] = useState(0);
  const binding = useRef<BoundPublication | null>(null);
  const viewRef = useRef<ViewTransform>(initialViewTransform());
  const [viewState, setViewState] = useState<ViewTransform>(initialViewTransform());
  const viewKey = useRef<PublicationViewKey | null>(null);
  const drag = useRef<PointerDrag>({ active: false, lastX: 0, lastY: 0 });
  const wheelAcc = useRef(0);
  // MAJOR-2: svc mouse is not onPress. Wire PocketJS hit→press so toolbar
  // ToolButtons work with a real Windows mouse (keyboard stays on shortcuts).
  const pointerPress = useRef(
    createPointerPress({
      hit: (x, y) => hitFocusable(x, y),
      active: (node) => {
        if (node) {
          focusNode(node as never);
          setActiveNode(node as never);
        }
      },
      press: (node) => {
        if (node) pressNode(node as never);
      },
      clearActive: () => setActiveNode(null),
    }),
  );

  useFrame(() => {
    const ops = getOps();
    const poll = ops.svcPoll;
    if (!poll) return;
    const outcome = runGuestTurn(
      { observer: item.current, binding: binding.current },
      () => poll.call(ops),
    );
    item.current = outcome.state.observer;
    binding.current = outcome.state.binding;
    if (outcome.register) {
      registerTexture(outcome.register.key, outcome.register.handle);
    }

    const st = item.current;
    const pub = st.publication;
    const vpRaw = st.viewport;
    const dpi = vpRaw?.dpi && vpRaw.dpi > 0 ? vpRaw.dpi : 1;
    const winW = vpRaw?.w ?? 960;
    const winH = vpRaw?.h ?? 640;
    const vp = imageViewport(winW, winH);
    const img: OrientedImage = {
      width: pub ? pub.resourceWidth || pub.sourceWidth : 0,
      height: pub ? pub.resourceHeight || pub.sourceHeight : 0,
    };
    const hasImage = img.width > 0 && img.height > 0;

    // Keep DPI as an explicit view fact (does not reset zoom).
    if (viewRef.current.dpiScale !== dpi) {
      viewRef.current = setDpiScale(viewRef.current, dpi);
      setViewState(viewRef.current);
    }

    const nextKey = publicationViewKeyFrom(item.current);
    const action = reconcileViewForPublication(viewKey.current, nextKey);
    if (action === "reset") {
      viewRef.current = hasImage
        ? resetForNewPublication(img, vp, dpi)
        : initialViewTransform(dpi);
      setViewState(viewRef.current);
    } else if (action === "revalidate" && hasImage) {
      viewRef.current = fitView(img, vp, viewRef.current);
      setViewState(viewRef.current);
    }
    viewKey.current = nextKey;

    const apply = (fn: (s: ViewTransform) => ViewTransform) => {
      const next = fn(viewRef.current);
      viewRef.current = next;
      setViewState(next);
    };
    const applyView = (next: ViewTransform) => {
      viewRef.current = next;
      setViewState(next);
    };

    const canImage = displayVerdict(st) === "image" && hasImage;
    const can100 = pub?.fullResolution === true;

    // --- keyboard ---
    for (const e of outcome.keyEvents) {
      const k = typeof e.k === "string" ? e.k : "";
      const ctrl = !!(e.cmd || e.ctl);
      switch (k) {
        case "left":
          if (st.browse.canPrevious) cmdPrevious();
          break;
        case "right":
          if (st.browse.canNext) cmdNext();
          break;
        case "r":
          if (!ctrl && pub) cmdRefresh();
          break;
        case "f5":
          if (pub) cmdRefresh();
          break;
        case "0":
          if (canImage) applyView(fitView(img, vp, viewRef.current));
          break;
        case "1":
          if (canImage && can100) applyView(actualSize(viewRef.current));
          break;
        case "=":
        case "+":
          if (canImage) applyView(zoomIn(img, vp, viewRef.current));
          break;
        case "-":
          if (canImage) applyView(zoomOut(img, vp, viewRef.current));
          break;
      }
    }

    // --- pointer drag pan + toolbar onPress ---
    for (const e of outcome.mouseEvents) {
      const x = typeof e.x === "number" ? e.x : 0;
      const y = typeof e.y === "number" ? e.y : 0;
      const down = e.d === true;
      const cancel = e.cancel === true;
      // Feed the shared press authority first (toolbar / any focusable).
      // Host Focused(false) sends cancel:true — drop press WITHOUT onPress.
      if (cancel) {
        pointerPress.current.cancel();
        drag.current.active = false;
        continue;
      }
      pointerPress.current.update({ x, y, down });
      const inCanvas = pointInImageViewport(vp, x, y);
      // Drag-pan only from the image canvas — never from a toolbar press.
      if (down && !drag.current.active && inCanvas && canImage) {
        drag.current = { active: true, lastX: x, lastY: y };
      }
      if (!down) {
        drag.current.active = false;
      }
      if (drag.current.active && canImage) {
        const dx = x - drag.current.lastX;
        const dy = y - drag.current.lastY;
        drag.current.lastX = x;
        drag.current.lastY = y;
        if (dx !== 0 || dy !== 0) {
          applyView(panBy(img, vp, viewRef.current, dx, dy));
        }
      }
    }

    // --- wheel zoom (coalesce high-res deltas) ---
    if (canImage) {
      let acc = wheelAcc.current;
      for (const e of outcome.scrollEvents) {
        const dy = typeof e.dy === "number" ? e.dy : 0;
        acc += dy;
      }
      // 24 logical units ≈ one notch (host LineDelta * 24).
      const NOTCH = 24;
      if (Math.abs(acc) >= NOTCH) {
        const steps = Math.trunc(acc / NOTCH);
        acc -= steps * NOTCH;
        const last = outcome.scrollEvents[outcome.scrollEvents.length - 1];
        const fx = typeof last?.x === "number" ? last.x : vp.x + vp.width / 2;
        const fy = typeof last?.y === "number" ? last.y : vp.y + vp.height / 2;
        // Prefer pointer over canvas if present in last mouse; else center.
        let focusX = vp.x + vp.width / 2;
        let focusY = vp.y + vp.height / 2;
        const lastMouse = outcome.mouseEvents[outcome.mouseEvents.length - 1];
        if (lastMouse && typeof lastMouse.x === "number") {
          focusX = lastMouse.x;
          focusY = typeof lastMouse.y === "number" ? lastMouse.y : focusY;
        } else if (typeof last?.x === "number") {
          focusX = fx;
          focusY = fy;
        }
        let next = viewRef.current;
        for (let i = 0; i < Math.abs(steps); i++) {
          const stepped =
            steps > 0
              ? zoomIn(img, vp, next)
              : zoomOut(img, vp, next);
          // Re-anchor each step at the pointer.
          next = zoomAt(img, vp, next, focusX, focusY, stepped.productZoom);
        }
        applyView(next);
      }
      wheelAcc.current = acc;
    }

    if (outcome.render || outcome.keyEvents.length || outcome.mouseEvents.length || outcome.scrollEvents.length) {
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
  const dpi = viewport?.dpi && viewport.dpi > 0 ? viewport.dpi : 1;
  const winW = viewport?.w ?? 960;
  const winH = viewport?.h ?? 640;
  const vp = imageViewport(winW, winH);
  const img: OrientedImage = {
    width: publication ? publication.resourceWidth || publication.sourceWidth : 0,
    height: publication ? publication.resourceHeight || publication.sourceHeight : 0,
  };
  const canImage = verdict === "image" && img.width > 0;
  const can100 = publication?.fullResolution === true;
  const style = canImage
    ? pocketImageStyle(img, viewState, vp)
    : null;
  const zoomText = zoomLabel(viewState, {
    fullResolution: publication?.fullResolution === true,
    hasImage: canImage,
  });

  const shownName =
    verdict === "image"
      ? publication?.name
      : verdict === "loading" || verdict === "error"
        ? request?.name
        : undefined;
  const posText =
    browse.count > 0 && browse.index !== null
      ? `${browse.index + 1} / ${browse.count}`
      : "";
  const dimText = publication
    ? `${publication.sourceWidth} × ${publication.sourceHeight}`
    : "";

  const apply = (fn: (s: ViewTransform) => ViewTransform) => {
    const next = fn(viewRef.current);
    viewRef.current = next;
    setViewState(next);
  };

  return (
    <View class="w-full h-full flex-col bg-[#1e1e1e]">
      {/* Title — height frozen in SHELL_CHROME.titleH */}
      <View class="flex-row items-center px-3 bg-[#252526]" style={{ height: 36 }}>
        <Text class="text-sm font-bold text-[#f0f0f0]">PicoView</Text>
        <View class="flex-1 items-center justify-center overflow-hidden">
          <Text class="text-sm text-[#a0a0a0]">
            {shownName ? (posText ? `${shownName} (${posText})` : shownName) : ""}
          </Text>
        </View>
        <View class="w-12" />
      </View>

      {/* Toolbar — height frozen in SHELL_CHROME.toolbarH */}
      <View class="flex-row items-center px-2 bg-[#252526]" style={{ height: 64 }}>
        <ToolBtn label="Prev" disabled={!browse.canPrevious} onPress={() => cmdPrevious()} />
        <ToolBtn label="Next" disabled={!browse.canNext} onPress={() => cmdNext()} />
        <Sep />
        <ToolBtn label="−" disabled={!canImage} onPress={() => apply(s => zoomOut(img, vp, s))} />
        <Text class="text-xs text-[#f0f0f0] w-14 text-center">{zoomText}</Text>
        <ToolBtn label="+" disabled={!canImage} onPress={() => apply(s => zoomIn(img, vp, s))} />
        <Sep />
        <ToolBtn label="Fit" disabled={!canImage} onPress={() => apply(s => fitView(img, vp, s))} />
        <ToolBtn
          label="1:1"
          disabled={!canImage || !can100}
          onPress={() => apply(s => actualSize(s))}
        />
        <Sep />
        <ToolBtn
          label="RotL"
          disabled={!canImage}
          onPress={() => apply(s => ({ ...s, orientation: rotateLeft(s.orientation) }))}
        />
        <ToolBtn
          label="RotR"
          disabled={!canImage}
          onPress={() => apply(s => ({ ...s, orientation: rotateRight(s.orientation) }))}
        />
        <ToolBtn
          label="FlipH"
          disabled={!canImage}
          onPress={() => apply(s => ({ ...s, orientation: flipHorizontal(s.orientation) }))}
        />
        <ToolBtn
          label="FlipV"
          disabled={!canImage}
          onPress={() => apply(s => ({ ...s, orientation: flipVertical(s.orientation) }))}
        />
        <ToolBtn
          label="Reset"
          disabled={!canImage}
          onPress={() => apply(s => resetView(img, vp, s))}
        />
        <Sep />
        <ToolBtn
          label="Refresh"
          disabled={!publication}
          onPress={() => cmdRefresh()}
        />
      </View>

      {/* Image canvas — geometry always matches imageViewport() */}
      <View class="flex-1 bg-[#111111] overflow-hidden">
        {verdict === "image" && bound && style ? (
          <Image
            src={textureKeyFor(bound.slot)}
            style={{
              posType: 1,
              insetL: Math.round(style.insetL - vp.x),
              insetT: Math.round(style.insetT - vp.y),
              width: Math.round(style.width),
              height: Math.round(style.height),
              rotate: style.rotate,
              scaleX: style.scaleX,
              scaleY: style.scaleY,
              originX: style.originX,
              originY: style.originY,
            }}
          />
        ) : verdict === "image" ? (
          <View class="flex-1 flex-col items-center justify-center">
            <Text class="text-sm text-[#a0a0a0]">Preparing image...</Text>
          </View>
        ) : verdict === "loading" ? (
          <View class="flex-1 flex-col items-center justify-center">
            <Text class="text-sm text-[#a0a0a0]">
              {`Opening ${request?.name ?? "image"}...`}
            </Text>
          </View>
        ) : verdict === "error" ? (
          <View class="flex-1 flex-col items-center justify-center">
            <Text class="text-sm text-[#f0f0f0]">Could not open this image</Text>
            <Text class="text-xs text-[#a0a0a0]">
              {request?.error ?? "The file may be corrupted or not supported."}
            </Text>
          </View>
        ) : (
          <View class="flex-1 flex-col items-center justify-center">
            <Text class="text-sm text-[#a0a0a0]">Open an image to get started</Text>
          </View>
        )}
      </View>

      {/* Status — height frozen in SHELL_CHROME.statusH */}
      <View class="flex-row items-center px-3 bg-[#252526] gap-3" style={{ height: 28 }}>
        {dimText ? <Text class="text-xs text-[#a0a0a0]">{dimText}</Text> : null}
        {publication ? (
          <Text
            class={
              publication.fullResolution
                ? "text-xs text-[#a0a0a0]"
                : "text-xs text-amber-400"
            }
          >
            {publication.fullResolution ? "Full resolution" : "Proxy"}
          </Text>
        ) : null}
        <View class="flex-1" />
        {canImage ? <Text class="text-xs text-[#a0a0a0]">{zoomText}</Text> : null}
        <Text class="text-xs text-[#a0a0a0]">{`dpi ${dpi}`}</Text>
        {posText ? <Text class="text-xs text-[#a0a0a0]">{posText}</Text> : null}
      </View>
    </View>
  );
}

function ToolBtn({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const off = disabled === true;
  return (
    <View
      class={
        off
          ? "px-2 py-1 rounded"
          : "px-2 py-1 rounded focus:bg-[#1e1e1e] active:bg-[#1e1e1e]"
      }
      onPress={off ? undefined : onPress}
      focusable={!off}
    >
      <Text class={off ? "text-xs text-zinc-600" : "text-xs text-[#f0f0f0]"}>
        {label}
      </Text>
    </View>
  );
}

function Sep() {
  return <View class="w-px h-4 mx-1 bg-[#3a3a3a]" />;
}
