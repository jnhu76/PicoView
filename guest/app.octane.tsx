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

// PicoView product shell (ROADMAP V1: Open One Image; last-good publication
// ordering: PICOVIEW-LAST-GOOD-PUBLICATION-1).
//
// The guest is a bounded observer of native Current Item state. It receives
// svc events carrying only scalars (status, generation, intent, texture
// handle, dimensions, error text); the pixels stay in the native texture
// registry ("O(image-bytes) never crosses QuickJS"). The observation state is
// split into publication (last-good, stays visible across a refresh's
// loading/failure) and request (progress/failure, carrying the Product
// intent); see observer.ts. No filesystem, decode, or texture-lifetime
// authority lives here.
//
// Product reduction and view-binding realization are separate commit
// domains (CORRECTIVE-2). A turn may reduce several `ready` events — native
// commits between two frames — but only the FINAL publication of the turn
// can become a rendered binding; binding.ts owns that reconciliation. The
// texture key flips once per rendered publication transition, so a mounted
// Image always re-resolves to the publication the native side currently
// keeps live.

function fit(
  publication: { width: number; height: number },
  viewport?: { w: number; h: number },
): { w: number; h: number } | null {
  if (!viewport) return null;
  const availW = Math.max(32, viewport.w - 32);
  const availH = Math.max(32, viewport.h - 64);
  // Fit-to-window minification of the full-resolution native resource. The
  // resource keeps the source resolution (the old pow2 <=512 envelope is
  // gone), so this scale is GPU minification of real pixels; V1 has no
  // zoom/100% semantics, and the pixels are intact for when it does.
  const s = Math.min(1, availW / publication.width, availH / publication.height);
  if (!(s > 0)) return null;
  return {
    w: Math.max(1, Math.floor(publication.width * s)),
    h: Math.max(1, Math.floor(publication.height * s)),
  };
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

  useFrame(() => {
    const ops = getOps();
    const poll = ops.svcPoll;
    if (!poll) return;
    // One guest turn: reduce every queued svc batch in order, then commit
    // exactly ONE view binding against the final observed publication —
    // never once per ready event, and never once per batch. N collapsed
    // native commits still move the binding at most once, so the rendered
    // src key always names the publication the native side keeps live, and
    // never a superseded handle the observation boundary is about to free.
    const outcome = runGuestTurn(
      { observer: item.current, binding: binding.current },
      () => poll.call(ops),
    );
    item.current = outcome.state.observer;
    binding.current = outcome.state.binding;
    // Register before the re-render flush: setSrc resolves the key there.
    if (outcome.register) registerTexture(outcome.register.key, outcome.register.handle);
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
  const box = publication && verdict === "image" ? fit(publication, state.viewport) : null;
  // A refresh keeps the last-good image on screen; its progress/failure is
  // reported truthfully in the status area without displacing the image.
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
  return (
    <View class="w-full h-full flex-col bg-slate-900">
      <View class="flex-row items-center justify-between px-4 py-2 bg-slate-900">
        <Text class="text-sm text-white font-bold">PicoView</Text>
        {shownName ? <Text class="text-xs text-slate-400">{shownName}</Text> : null}
      </View>
      <View class="flex-1 flex-col items-center justify-center bg-slate-800 overflow-hidden">
        {verdict === "image" && box && bound ? (
          <Image
            src={textureKeyFor(bound.slot)}
            class="overflow-hidden"
            style={{ width: box.w, height: box.h }}
          />
        ) : verdict === "image" ? (
          <Text class="text-sm text-slate-400">Preparing image…</Text>
        ) : verdict === "loading" ? (
          <Text class="text-sm text-slate-400">{`Opening ${request?.name ?? "image"}…`}</Text>
        ) : verdict === "error" ? (
          <Text class="text-sm text-red-400">{request?.error ?? "Could not open image"}</Text>
        ) : (
          <Text class="text-sm text-slate-400">No image open</Text>
        )}
      </View>
      {refreshIndicator === "Refresh failed" && request?.error ? (
        <View class="px-4 py-1 bg-slate-900 overflow-hidden">
          <Text class="text-xs text-red-400">{request.error}</Text>
        </View>
      ) : null}
      <View class="flex-row items-center justify-between px-4 py-1 bg-slate-900">
        <Text class="text-xs text-slate-500">{statusText}</Text>
        {verdict === "image" && publication ? (
          <Text class="text-xs text-slate-500">
            {`${publication.width} x ${publication.height}`}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
