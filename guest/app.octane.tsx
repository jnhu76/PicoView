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
import {
  cmdPrevious,
  cmdNext,
  cmdRefresh,
  cmdPickFile,
} from "./commands.ts";
import { ICON_ASSETS, toolSemantic } from "./icons.ts";
import { keyboardIntent } from "./keyboard.ts";
import {
  imageViewport,
  pointInImageViewport,
  SHELL_CHROME,
  wheelFocusPoint,
} from "./shell_layout.ts";
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
  reconcileViewEnvironment,
  resetForNewPublication,
  resetView,
  rotateLeft,
  rotateRight,
  setUserOrientation,
  zoomAt,
  zoomIn,
  zoomLabel,
  zoomOut,
  type OrientedImage,
  type ViewEnvironment,
  type ViewTransform,
} from "./view_transform.ts";
import {
  createPointerPress,
  IDLE_GESTURE,
  classifyGestureOwner,
  nextHeldGesture,
  type HeldGesture,
} from "./pointer_press.ts";

// PicoView product shell — view geometry from PR #61, chrome from PR #60.
//
// All Fit / zoom / pan / rotate / flip geometry goes through
// guest/view_transform.ts. The image viewport comes from shell_layout.ts.
// Icons / Open File / side chevrons are presentation-only chrome.

type PointerDrag = {
  lastX: number;
  lastY: number;
};

function truncateName(name: string | undefined, max = 48): string {
  if (!name) return "";
  if (name.length <= max) return name;
  return name.slice(0, max - 1) + "...";
}

export default function App() {
  const item = useRef<ObserverState>(initialObserverState());
  const revision = useRef(0);
  const [, setRevision] = useState(0);
  const binding = useRef<BoundPublication | null>(null);
  const viewRef = useRef<ViewTransform>(initialViewTransform());
  const [viewState, setViewState] = useState<ViewTransform>(initialViewTransform());
  const viewKey = useRef<PublicationViewKey | null>(null);
  const envKey = useRef<ViewEnvironment | null>(null);
  const drag = useRef<PointerDrag>({ lastX: 0, lastY: 0 });
  const gesture = useRef<HeldGesture>(IDLE_GESTURE);
  // MAJOR-B: last logical pointer known to the guest — survives across turns.
  const lastPointer = useRef({ x: 0, y: 0, known: false });
  const wheelAcc = useRef(0);
  // MAJOR-2: svc mouse is not onPress. Wire PocketJS hit→press so toolbar
  // and side-chevron ToolButtons work with a real Windows mouse.
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

    // MAJOR-A: viewport/DPI are a separate reconciliation layer from
    // publication identity. Fit recomputes; Manual preserves zoom and clamps.
    const env: ViewEnvironment = { viewport: vp, dpiScale: dpi };
    const nextView = reconcileViewEnvironment(
      img,
      envKey.current,
      env,
      viewRef.current,
    );
    if (nextView !== viewRef.current) {
      viewRef.current = nextView;
      setViewState(nextView);
    }
    envKey.current = env;

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
    const shownForKeyboard =
      displayVerdict(st) === "image"
        ? pub?.name
        : displayVerdict(st) === "loading" || displayVerdict(st) === "error"
          ? st.request?.name
          : undefined;
    const canRefreshForKeyboard =
      !!pub || (shownForKeyboard != null && shownForKeyboard !== "");
    for (const e of outcome.keyEvents) {
      const k = typeof e.k === "string" ? e.k : "";
      const ctrl = !!(e.cmd || e.ctl);
      const intent = keyboardIntent(k, {
        ctrl,
        canPrevious: st.browse.canPrevious,
        canNext: st.browse.canNext,
        canRefresh: canRefreshForKeyboard,
        canImage,
        can100,
      });
      switch (intent) {
        case "previous":
          cmdPrevious();
          break;
        case "next":
          cmdNext();
          break;
        case "refresh":
          cmdRefresh();
          break;
        case "open":
          cmdPickFile();
          break;
        case "fit":
          if (canImage) applyView(fitView(img, vp, viewRef.current));
          break;
        case "oneToOne":
          if (canImage && can100) applyView(actualSize(viewRef.current));
          break;
        case "zoomIn":
          if (canImage) applyView(zoomIn(img, vp, viewRef.current));
          break;
        case "zoomOut":
          if (canImage) applyView(zoomOut(img, vp, viewRef.current));
          break;
      }
    }

    // --- pointer drag pan + toolbar/chevron onPress (MAJOR-C ownership) ---
    for (const e of outcome.mouseEvents) {
      const x = typeof e.x === "number" ? e.x : 0;
      const y = typeof e.y === "number" ? e.y : 0;
      const down = e.d === true;
      const cancel = e.cancel === true;
      // Latest logical pointer is authority for later wheel turns (MAJOR-B).
      lastPointer.current = { x, y, known: true };

      if (cancel) {
        pointerPress.current.cancel();
        gesture.current = IDLE_GESTURE;
        continue;
      }

      const claimed = pointerPress.current.update({ x, y, down });
      const inCanvas = pointInImageViewport(vp, x, y);
      const prev = gesture.current;
      gesture.current = nextHeldGesture(prev, { down }, () =>
        classifyGestureOwner({
          claimedFocusable: claimed,
          inImageViewport: inCanvas,
          canImage,
        }),
      );
      const owner = gesture.current.owner;

      // Canvas pan only when THIS down-edge chose canvas. Ownership never
      // transfers toolbar/chevron→canvas / canvas→toolbar while held.
      if (owner === "canvas" && canImage) {
        if (!prev.wasDown || prev.owner !== "canvas") {
          drag.current = { lastX: x, lastY: y };
        } else {
          const dx = x - drag.current.lastX;
          const dy = y - drag.current.lastY;
          drag.current.lastX = x;
          drag.current.lastY = y;
          if (dx !== 0 || dy !== 0) {
            applyView(panBy(img, vp, viewRef.current, dx, dy));
          }
        }
      }
    }

    // Host scroll may carry latest logical pointer; guest also keeps its own
    // persistent pointer so a wheel turn without CursorMoved still anchors.
    for (const e of outcome.scrollEvents) {
      if (typeof e.x === "number" && typeof e.y === "number") {
        lastPointer.current = { x: e.x, y: e.y, known: true };
      }
    }

    // --- wheel zoom (coalesce high-res deltas; MAJOR-B anchor) ---
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
        const focus = wheelFocusPoint(vp, lastPointer.current);
        let next = viewRef.current;
        for (let i = 0; i < Math.abs(steps); i++) {
          const stepped =
            steps > 0
              ? zoomIn(img, vp, next)
              : zoomOut(img, vp, next);
          // Re-anchor each step at the persistent pointer.
          next = zoomAt(img, vp, next, focus.x, focus.y, stepped.productZoom);
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
  const canRefresh = !!publication || (shownName != null && shownName !== "");

  const apply = (fn: (s: ViewTransform) => ViewTransform) => {
    const next = fn(viewRef.current);
    viewRef.current = next;
    setViewState(next);
  };

  return (
    <View class="w-full h-full flex-col bg-[#1e1e1e]">
      {/* No in-app title strip — native window caption owns "PicoView".
          Filename / index stay in the status bar. */}

      {/* Toolbar — icon-first actions only; state stays in the status bar.
          Previous/Next are viewport navigation on the image edges, not here.
          Flex flow only; group gaps are spacer Views, not absolute x hacks. */}
      <View class="flex-row items-center px-2 gap-1 bg-[#252526]" style={{ height: SHELL_CHROME.toolbarH }}>
        <ToolButton
          icon={ICON_ASSETS.open}
          semantic={toolSemantic("open")}
          onPress={() => cmdPickFile()}
        />
        <GroupGap />
        <ToolButton
          icon={ICON_ASSETS.zoomOut}
          semantic={toolSemantic("zoomOut")}
          disabled={!canImage}
          onPress={() => apply(s => zoomOut(img, vp, s))}
        />
        <ToolButton
          icon={ICON_ASSETS.zoomIn}
          semantic={toolSemantic("zoomIn")}
          disabled={!canImage}
          onPress={() => apply(s => zoomIn(img, vp, s))}
        />
        <ToolButton
          icon={ICON_ASSETS.fit}
          semantic={toolSemantic("fit")}
          disabled={!canImage}
          onPress={() => apply(s => fitView(img, vp, s))}
        />
        <ToolButton
          textIcon="1:1"
          semantic={toolSemantic("oneToOne")}
          disabled={!canImage || !can100}
          onPress={() => apply(s => actualSize(s))}
        />
        <GroupGap />
        <ToolButton
          icon={ICON_ASSETS.rotateLeft}
          semantic={toolSemantic("rotateLeft")}
          disabled={!canImage}
          onPress={() =>
            apply(s => setUserOrientation(img, vp, s, rotateLeft(s.orientation)))
          }
        />
        <ToolButton
          icon={ICON_ASSETS.rotateRight}
          semantic={toolSemantic("rotateRight")}
          disabled={!canImage}
          onPress={() =>
            apply(s => setUserOrientation(img, vp, s, rotateRight(s.orientation)))
          }
        />
        <ToolButton
          icon={ICON_ASSETS.flipHorizontal}
          semantic={toolSemantic("flipHorizontal")}
          disabled={!canImage}
          onPress={() =>
            apply(s =>
              setUserOrientation(img, vp, s, flipHorizontal(s.orientation)),
            )
          }
        />
        <ToolButton
          icon={ICON_ASSETS.flipVertical}
          semantic={toolSemantic("flipVertical")}
          disabled={!canImage}
          onPress={() =>
            apply(s =>
              setUserOrientation(img, vp, s, flipVertical(s.orientation)),
            )
          }
        />
        <ToolButton
          icon={ICON_ASSETS.reset}
          semantic={toolSemantic("reset")}
          disabled={!canImage}
          onPress={() => apply(s => resetView(img, vp, s))}
        />
        <GroupGap />
        <ToolButton
          icon={ICON_ASSETS.refresh}
          semantic={toolSemantic("refresh")}
          disabled={!canRefresh}
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
        ) : null}

        {/* Edge navigation only — translucent rest, clearer focus/active.
            Not a toolbar command pair. Geometry never moves between states. */}
        {canImage && (browse.canPrevious || browse.canNext) ? (
          <View class="absolute inset-0 flex-row items-center justify-between px-3">
            {browse.canPrevious ? (
              <View
                class="w-10 h-10 items-center justify-center rounded-full bg-[#00000033] focus:bg-[#00000088] active:bg-[#000000aa]"
                onPress={() => cmdPrevious()}
                focusable
              >
                <Image
                  class="w-4 h-4"
                  src={ICON_ASSETS.previous}
                  style={{ opacity: 0.72 }}
                />
              </View>
            ) : (
              <View class="w-10 h-10" />
            )}
            <View class="flex-1" />
            {browse.canNext ? (
              <View
                class="w-10 h-10 items-center justify-center rounded-full bg-[#00000033] focus:bg-[#00000088] active:bg-[#000000aa]"
                onPress={() => cmdNext()}
                focusable
              >
                <Image
                  class="w-4 h-4"
                  src={ICON_ASSETS.next}
                  style={{ opacity: 0.72 }}
                />
              </View>
            ) : (
              <View class="w-10 h-10" />
            )}
          </View>
        ) : null}

        {/* Overlay only for non-image states. When an image is bound, never
            stack empty/loading/error on top of the publication. */}
        {verdict === "image" && !bound ? (
          <View class="flex-1 flex-col items-center justify-center">
            <Text class="text-sm text-[#a0a0a0]">Preparing image...</Text>
          </View>
        ) : verdict === "loading" ? (
          <View class="flex-1 flex-col items-center justify-center">
            <Text class="text-sm text-[#a0a0a0]">{`Opening ${truncateName(request?.name) || "image"}...`}</Text>
          </View>
        ) : verdict === "error" ? (
          <View class="flex-1 flex-col items-center justify-center gap-3">
            <Image class="w-10 h-10" src={ICON_ASSETS.warn} />
            <Text class="text-base text-[#f0f0f0]">Could not open this image</Text>
            <Text class="text-sm text-[#a0a0a0]">
              {request?.error ?? "The file may be corrupted or not supported."}
            </Text>
            {browse.canPrevious || browse.canNext ? (
              <View class="flex-row gap-2 mt-1">
                {browse.canPrevious ? (
                  <View
                    class="px-4 py-2 rounded bg-[#252526]"
                    onPress={() => cmdPrevious()}
                    focusable
                  >
                    <Text class="text-sm text-[#f0f0f0]">Previous</Text>
                  </View>
                ) : null}
                {browse.canNext ? (
                  <View
                    class="px-4 py-2 rounded bg-sky-600"
                    onPress={() => cmdNext()}
                    focusable
                  >
                    <Text class="text-sm text-[#f0f0f0]">Next</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : verdict === "empty" ? (
          <View class="flex-1 flex-col items-center justify-center gap-3">
            <Image class="w-12 h-12" src={ICON_ASSETS.empty} />
            <Text class="text-base text-[#a0a0a0]">Open an image to get started</Text>
            <View
              class="px-4 py-2 rounded bg-sky-600"
              onPress={() => cmdPickFile()}
              focusable
            >
              <Text class="text-sm text-[#f0f0f0]">Open File...</Text>
            </View>
          </View>
        ) : null}
      </View>

      {/* Status — height frozen in SHELL_CHROME.statusH */}
      <View class="flex-row items-center px-3 bg-[#252526] gap-3" style={{ height: SHELL_CHROME.statusH }}>
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
        {shownName ? (
          <Text class="text-xs text-[#a0a0a0]">{truncateName(shownName, 28)}</Text>
        ) : null}
      </View>
    </View>
  );
}

/** Semantic group spacer inside the toolbar (Flex child, not absolute).
 *  With parent gap-1 (4px), w-2 yields ~12px total between groups. */
function GroupGap() {
  return <View class="w-2 shrink-0" />;
}

/** Icon-first toolbar button. Hit 32×32; glyph/text 16×16; no painted caption. */
function ToolButton({
  icon,
  textIcon,
  semantic,
  disabled,
  onPress,
}: {
  icon?: string;
  /** Compact visual symbol only (currently "1:1"). */
  textIcon?: string;
  /** Semantic name — kept in code/tests; PocketJS has no tooltip primitive. */
  semantic: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const off = disabled === true;
  const shell = off
    ? "w-8 h-8 items-center justify-center rounded overflow-hidden shrink-0"
    : "w-8 h-8 items-center justify-center rounded overflow-hidden shrink-0 focus:bg-[#1e1e1e] active:bg-[#1e1e1e]";
  return (
    <View
      class={shell}
      onPress={off ? undefined : onPress}
      focusable={!off}
    >
      {textIcon ? (
        <Text
          class={
            off
              ? "text-sm font-bold text-zinc-600"
              : "text-sm font-bold text-[#e8e8e8]"
          }
        >
          {textIcon}
        </Text>
      ) : icon ? (
        <Image
          class="w-4 h-4"
          src={icon}
          style={{ opacity: off ? 0.3 : 1 }}
        />
      ) : null}
    </View>
  );
}
