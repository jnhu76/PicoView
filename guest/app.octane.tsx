import { useRef, useState } from "octane";
import { Text, View, Image } from "@pocketjs/framework/octane/components";
import { registerTexture } from "@pocketjs/framework/octane/renderer";
import { getOps } from "@pocketjs/framework/host";
import { useFrame } from "@pocketjs/framework/octane/lifecycle";
import {
  displayVerdict,
  initialObserverState,
  reduceObserver,
  type ObserverState,
  type Publication,
} from "./observer.ts";

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

const TEXTURE_KEY = "picoview-current";

// The texture key flips per publication commit: setProp skips an unchanged
// src, so a mounted Image only re-resolves its handle when the key string
// changes. Two alternating keys keep the framework key→handle map bounded.
function textureKeyFor(slot: 0 | 1): string {
  return `${TEXTURE_KEY}-${slot}`;
}

function fit(
  publication: Publication,
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
  // folds per svc line: one frame's svcPoll batch applies all its lines in
  // order. The tick counter only schedules the re-render.
  const item = useRef<ObserverState>(initialObserverState());
  const revision = useRef(0);
  const [, setRevision] = useState(0);
  // Bind slot whose handle is registered under its texture key. Two slots
  // total; rebinding on a newer publication implicitly supersedes the old.
  const registeredSlot = useRef<number>(-1);

  useFrame(() => {
    const ops = getOps();
    const poll = ops.svcPoll;
    if (!poll) return;
    // svcPoll batches complete newline-terminated JSON lines per call.
    for (;;) {
      const batch = poll.call(ops);
      if (batch === undefined) break;
      let changed = false;
      for (const line of batch.split("\n")) {
        if (!line) continue;
        let v: Parameters<typeof reduceObserver>[1];
        try {
          v = JSON.parse(line);
        } catch {
          continue;
        }
        if (!v || typeof v !== "object") continue;
        const next = reduceObserver(item.current, v);
        if (next === item.current) continue;
        item.current = next;
        changed = true;
        // Register the new publication's handle before the re-render flush:
        // setSrc resolves the key against this map during the flush.
        const publication = next.publication;
        if (publication && publication.bindSlot !== registeredSlot.current) {
          registerTexture(textureKeyFor(publication.bindSlot), publication.handle);
          registeredSlot.current = publication.bindSlot;
        }
      }
      if (changed) {
        revision.current += 1;
        setRevision(revision.current);
      }
    }
  });

  const state = item.current;
  const verdict = displayVerdict(state);
  const publication = state.publication;
  const request = state.request;
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
        {verdict === "image" && box && publication ? (
          <Image
            src={textureKeyFor(publication.bindSlot)}
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
