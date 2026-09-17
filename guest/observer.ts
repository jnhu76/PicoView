// Pure Current Item observer state (PICOVIEW-LAST-GOOD-PUBLICATION-1
// + PICOVIEW-REAL-VIEWER-TRAIN-1).
//
// The native CurrentItem stays the single Product publication authority; this
// module is the guest's bounded observation of it. It deliberately splits the
// old flat `status` record — the conflation of request progress with
// publication existence was the last-good bug — into two facets:
//
//   - publication: the last-good ready item. It stays bound and rendered
//     while a refresh of the same item is loading or has failed (PRD §2.10,
//     SPEC §7).
//   - request: progress/failure of the in-flight open request, carrying the
//     Product intent that selects the failure policy.
//
// Failure policy (PRD §2.10): a refresh failure preserves the publication; a
// new-item failure deliberately clears it (a corrupt new item publishes an
// error item instead). Zero imports: the reducer must stay testable without
// the framework (`bun test guest/observer.test.ts`).
//
// REAL-VIEWER-TRAIN-1 additions:
//   - browse: directory navigation state (index, count, canPrev, canNext)
//   - capability: source vs resource dimensions, fullResolution truth

export type OpenIntent = "new-item" | "refresh";

/** The last-good published item — a pure Product fact. It deliberately
 *  carries NO view-binding mechanics: how a mounted Image re-resolves this
 *  handle (texture keys, slots) is a rendering-realization concern owned
 *  by guest/binding.ts, because native commits and rendered bindings are
 *  different commit domains (several publications can collapse into one
 *  guest turn). */
export interface Publication {
  generation: number;
  handle: number;
  /** Source dimensions (before any resource-level downsampling). */
  sourceWidth: number;
  sourceHeight: number;
  /** Resource dimensions (after admission; may differ from source for giant images). */
  resourceWidth: number;
  resourceHeight: number;
  /** True when source and resource dimensions are equal (full resolution available). */
  fullResolution: boolean;
  name?: string;
}

export interface RequestObservation {
  generation: number;
  intent: OpenIntent;
  status: "loading" | "error";
  name?: string;
  error?: string;
}

/** Directory navigation state. */
export interface BrowseState {
  index: number | null;
  count: number;
  canPrevious: boolean;
  canNext: boolean;
}

export interface ObserverState {
  publication: Publication | null;
  request: RequestObservation | null;
  /** Highest request generation accepted. Native emits one generation per
   *  open: loading then its terminal ready/error share that generation. */
  seenGeneration: number;
  /** True once a terminal event (ready/error) closed seenGeneration; a
   *  same-generation event after the terminal is stale and never wins. */
  seenClosed: boolean;
  viewport?: { w: number; h: number };
  /** Browse state (directory navigation). */
  browse: BrowseState;
}

export function initialObserverState(): ObserverState {
  return {
    publication: null,
    request: null,
    seenGeneration: 0,
    seenClosed: false,
    browse: { index: null, count: 0, canPrevious: false, canNext: false },
  };
}

/** Loosely-typed wire form (svc events arrive as parsed JSON lines). */
export interface SvcLine {
  t?: unknown;
  status?: unknown;
  g?: unknown;
  intent?: unknown;
  name?: unknown;
  error?: unknown;
  handle?: unknown;
  sourceWidth?: unknown;
  sourceHeight?: unknown;
  resourceWidth?: unknown;
  resourceHeight?: unknown;
  fullResolution?: unknown;
  width?: unknown;
  height?: unknown;
  browseIndex?: unknown;
  browseCount?: unknown;
  canPrevious?: unknown;
  canNext?: unknown;
  w?: unknown;
  h?: unknown;
  /** Keyboard key events from the desktop host (REAL-VIEWER-TRAIN-1). */
  k?: unknown;
  cmd?: unknown;
  ctl?: unknown;
}

function isGeneration(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Unknown intent narrows to "new-item": preservation must be deliberate,
 *  never the accidental default for a malformed event. */
function asIntent(v: unknown): OpenIntent {
  return v === "refresh" ? "refresh" : "new-item";
}

/** Extract browse state from a svc event line. */
function extractBrowse(v: SvcLine): Partial<BrowseState> {
  const browse: Partial<BrowseState> = {};
  if (isNumber(v.browseIndex)) browse.index = v.browseIndex;
  else if (v.browseIndex === null) browse.index = null;
  if (isNumber(v.browseCount)) browse.count = v.browseCount;
  if (typeof v.canPrevious === "boolean") browse.canPrevious = v.canPrevious;
  if (typeof v.canNext === "boolean") browse.canNext = v.canNext;
  return browse;
}

/** Apply one svc event; returns the SAME state reference when nothing
 *  applies. Stale events — older than the highest seen generation, or
 *  trailing a terminal event of the same generation — never win. */
export function reduceObserver(state: ObserverState, v: SvcLine): ObserverState {
  if ((v.t === "hello" || v.t === "resize") && typeof v.w === "number" && typeof v.h === "number") {
    return { ...state, viewport: { w: v.w, h: v.h } };
  }
  if (v.t !== "current-item") return state;
  if (!isGeneration(v.g)) return state;
  if (v.g < state.seenGeneration || (v.g === state.seenGeneration && state.seenClosed)) {
    return state;
  }
  const terminal = v.g === state.seenGeneration && !state.seenClosed;
  const browseUpdate = extractBrowse(v);

  if (
    v.status === "ready" &&
    typeof v.handle === "number"
  ) {
    const sourceWidth = isNumber(v.sourceWidth) ? v.sourceWidth : (isNumber(v.width) ? v.width : 0);
    const sourceHeight = isNumber(v.sourceHeight) ? v.sourceHeight : (isNumber(v.height) ? v.height : 0);
    const resourceWidth = isNumber(v.resourceWidth) ? v.resourceWidth : sourceWidth;
    const resourceHeight = isNumber(v.resourceHeight) ? v.resourceHeight : sourceHeight;
    const fullResolution = typeof v.fullResolution === "boolean" ? v.fullResolution : (sourceWidth === resourceWidth && sourceHeight === resourceHeight);
    return {
      publication: {
        generation: v.g,
        handle: v.handle,
        sourceWidth,
        sourceHeight,
        resourceWidth,
        resourceHeight,
        fullResolution,
        name: typeof v.name === "string" ? v.name : undefined,
      },
      request: null,
      seenGeneration: v.g,
      seenClosed: true,
      viewport: state.viewport,
      browse: { ...state.browse, ...browseUpdate },
    };
  }
  if (v.status === "loading") {
    if (terminal) return state;
    return {
      ...state,
      seenGeneration: v.g,
      seenClosed: false,
      request: {
        generation: v.g,
        intent: asIntent(v.intent),
        status: "loading",
        name: typeof v.name === "string" ? v.name : undefined,
      },
      browse: { ...state.browse, ...browseUpdate },
    };
  }
  if (v.status === "error") {
    const intent = asIntent(v.intent);
    // PRD §2.10: a refresh failure preserves the last-good publication; a
    // new-item failure deliberately publishes the error item instead.
    const publication = intent === "refresh" ? state.publication : null;
    return {
      ...state,
      publication,
      seenGeneration: v.g,
      seenClosed: true,
      request: {
        generation: v.g,
        intent,
        status: "error",
        error: typeof v.error === "string" ? v.error : undefined,
      },
      browse: { ...state.browse, ...browseUpdate },
    };
  }
  return state;
}

export type DisplayVerdict = "image" | "loading" | "error" | "empty";

/** What facet wins the main content area. A refresh never displaces the
 *  publication (its loading/error surface in the status area); a new-item
 *  request does displace it. */
export function displayVerdict(s: ObserverState): DisplayVerdict {
  const r = s.request;
  if (r && r.intent === "new-item") {
    if (r.status === "loading") return "loading";
    if (r.status === "error") return "error";
  }
  if (s.publication) return "image";
  if (r?.status === "loading") return "loading";
  if (r?.status === "error") return "error";
  return "empty";
}
