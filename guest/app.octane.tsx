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
  error?: string;
  viewport?: { w: number; h: number };
}

function fit(item: CurrentItemState): { w: number; h: number } | null {
  if (item.status !== "ready" || !item.viewport || !item.width || !item.height) return null;
  const availW = Math.max(32, item.viewport.w - 32);
  const availH = Math.max(32, item.viewport.h - 64);
  // Fit-to-window minification of the full-resolution native resource. The
  // resource keeps the source resolution (the old pow2 <=512 envelope is
  // gone), so this scale is GPU minification of real pixels; V1 has no
  // zoom/100% semantics, and the pixels are intact for when it does.
  const s = Math.min(1, availW / item.width, availH / item.height);
  if (!(s > 0)) return null;
  return {
    w: Math.max(1, Math.floor(item.width * s)),
    h: Math.max(1, Math.floor(item.height * s)),
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
          Partial<Record<"g" | "handle" | "width" | "height" | "w" | "h", number>>;
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
  const cur = item.current;
  return (
    <View class="w-full h-full flex-col bg-slate-900">
      <View class="flex-row items-center justify-between px-4 py-2 bg-slate-900">
        <Text class="text-sm text-white font-bold">PicoView</Text>
        {cur.name ? <Text class="text-xs text-slate-400">{cur.name}</Text> : null}
      </View>
      <View class="flex-1 flex-col items-center justify-center bg-slate-800 overflow-hidden">
        {box ? (
          <Image
            src={TEXTURE_KEY}
            class="overflow-hidden"
            style={{ width: box.w, height: box.h }}
          />
        ) : cur.status === "loading" ? (
          <Text class="text-sm text-slate-400">{`Opening ${cur.name ?? "image"}…`}</Text>
        ) : cur.status === "error" ? (
          <Text class="text-sm text-red-400">{cur.error ?? "Could not open image"}</Text>
        ) : cur.status === "ready" ? (
          <Text class="text-sm text-slate-400">Preparing image…</Text>
        ) : (
          <Text class="text-sm text-slate-400">No image open</Text>
        )}
      </View>
      <View class="flex-row items-center justify-between px-4 py-1 bg-slate-900">
        <Text class="text-xs text-slate-500">
          {cur.status === "error" ? "Error" : cur.status === "loading" ? "Opening…" : "Ready"}
        </Text>
        {cur.status === "ready" && cur.width ? (
          <Text class="text-xs text-slate-500">{`${cur.width} x ${cur.height}`}</Text>
        ) : null}
      </View>
    </View>
  );
}
