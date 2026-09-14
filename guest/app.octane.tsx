import { useRef, useState } from "octane";
import { Text, View, Image } from "@pocketjs/framework/octane/components";
import { registerTexture } from "@pocketjs/framework/octane/renderer";
import { getOps } from "@pocketjs/framework/host";
import { useFrame } from "@pocketjs/framework/octane/lifecycle";

// PicoView product shell (ROADMAP V1: Open One Image).
//
// The guest is a bounded observer of native Current Item state. It receives
// svc events carrying only scalars (status, generation, texture handle,
// dimensions, error text); the pixels stay in the native texture registry
// ("O(image-bytes) never crosses QuickJS"). On a ready event the handle is
// bound under a stable key and an <Image> node references it; on error the
// shell stays usable with a bounded message. No filesystem, decode, or
// texture-lifetime authority lives here.

const TEXTURE_KEY = "picoview-current";

interface CurrentItemState {
  generation: number;
  status: "idle" | "loading" | "ready" | "error";
  name?: string;
  handle?: number;
  width?: number;
  height?: number;
  texWidth?: number;
  texHeight?: number;
  error?: string;
  viewport?: { w: number; h: number };
}

function fit(item: CurrentItemState): { cw: number; ch: number; tw: number; th: number } | null {
  if (item.status !== "ready" || !item.viewport || !item.texWidth || !item.texHeight) return null;
  const availW = Math.max(32, item.viewport.w - 32);
  const availH = Math.max(32, item.viewport.h - 64);
  // Fit-to-window minification only, scaled against the pow2 texture
  // envelope. The envelope already IS the native presentation resolution
  // (a large decode is box-downsampled natively), so magnifying it past
  // 1:1 only reproduces blocky texels; V1 has no zoom/100% semantics.
  const s = Math.min(1, availW / item.texWidth, availH / item.texHeight);
  if (!(s > 0)) return null;
  return {
    tw: Math.max(1, Math.floor(item.texWidth * s)),
    th: Math.max(1, Math.floor(item.texHeight * s)),
    // Content extent keeps the decode's aspect ratio; the envelope's
    // transparent padding is cropped here by the clip view.
    cw: Math.max(1, Math.floor((item.width ?? item.texWidth) * s)),
    ch: Math.max(1, Math.floor((item.height ?? item.texHeight) * s)),
  };
}

export default function App() {
  // Current Item observations live in a plain ref that svc events mutate in
  // place: one frame's svcPoll batch applies all its lines sequentially, so
  // per-event setState snapshots would clobber each other. The tick counter
  // only schedules the re-render.
  const item = useRef<CurrentItemState>({ generation: 0, status: "idle" });
  const revision = useRef(0);
  const [, setRevision] = useState(0);
  // Generation whose ready handle is bound under TEXTURE_KEY. One slot, not a
  // growing set: rebinding on a newer generation implicitly supersedes the old.
  const registeredGeneration = useRef(0);

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
        let v: Partial<Record<"t" | "status" | "name" | "error", string>> &
          Partial<Record<"g" | "handle" | "width" | "height" | "texWidth" | "texHeight" | "w" | "h", number>>;
        try {
          v = JSON.parse(line);
        } catch {
          continue;
        }
        if (!v || typeof v !== "object") continue;
        if (v.t === "current-item") {
          // A stale event generation may never publish over a newer one.
          if (typeof v.g === "number" && v.g < item.current.generation) continue;
          if (
            v.status === "ready" &&
            typeof v.handle === "number" &&
            typeof v.g === "number" &&
            registeredGeneration.current !== v.g
          ) {
            registerTexture(TEXTURE_KEY, v.handle);
            registeredGeneration.current = v.g;
          }
          const status =
            v.status === "ready" || v.status === "loading" || v.status === "error"
              ? v.status
              : "error";
          item.current = {
            generation: typeof v.g === "number" ? v.g : item.current.generation,
            status,
            name: v.name,
            handle: v.handle,
            width: v.width,
            height: v.height,
            texWidth: v.texWidth,
            texHeight: v.texHeight,
            error: v.error,
            viewport: item.current.viewport,
          };
          changed = true;
        } else if ((v.t === "hello" || v.t === "resize") && typeof v.w === "number" && typeof v.h === "number") {
          item.current = { ...item.current, viewport: { w: v.w, h: v.h } };
          changed = true;
        }
      }
      if (changed) {
        revision.current += 1;
        setRevision(revision.current);
      }
    }
  });

  const box = fit(item.current);
  const item2 = item.current;
  return (
    <View class="w-full h-full flex-col bg-slate-900">
      <View class="flex-row items-center justify-between px-4 py-2 bg-slate-900">
        <Text class="text-sm text-white font-bold">PicoView</Text>
        {item2.name ? <Text class="text-xs text-slate-400">{item2.name}</Text> : null}
      </View>
      <View class="flex-1 flex-col items-center justify-center bg-slate-800 overflow-hidden">
        {box ? (
          <View
            class="overflow-hidden bg-slate-900"
            style={{ width: box.cw, height: box.ch }}
          >
            <Image
              src={TEXTURE_KEY}
              class="absolute top-0 left-0"
              style={{ width: box.tw, height: box.th }}
            />
          </View>
        ) : item2.status === "loading" ? (
          <Text class="text-sm text-slate-400">{`Opening ${item2.name ?? "image"}…`}</Text>
        ) : item2.status === "error" ? (
          <Text class="text-sm text-red-400">{item2.error ?? "Could not open image"}</Text>
        ) : item2.status === "ready" ? (
          <Text class="text-sm text-slate-400">Preparing image…</Text>
        ) : (
          <Text class="text-sm text-slate-400">No image open</Text>
        )}
      </View>
      <View class="flex-row items-center justify-between px-4 py-1 bg-slate-900">
        <Text class="text-xs text-slate-500">
          {item2.status === "error" ? "Error" : item2.status === "loading" ? "Opening…" : "Ready"}
        </Text>
        {item2.status === "ready" && item2.width ? (
          <Text class="text-xs text-slate-500">{`${item2.width} x ${item2.height}`}</Text>
        ) : null}
      </View>
    </View>
  );
}
