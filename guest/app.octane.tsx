import { useRef, useState } from "octane";
import { Image, Text, View, type NodeMirror } from "@pocketjs/framework/octane/components";
import { useFrame } from "@pocketjs/framework/octane/lifecycle";
import { getOps } from "@pocketjs/framework/octane";

// PicoView A2 architecture proof guest.
//
// Proves the native image-resource seam: a natively generated 3840x2160
// image resource is registered HOST-SIDE (Ui::register_native_texture) and
// this guest receives ONLY bounded semantic state — {id, handle, w, h} —
// over the existing svc channel. It composes the resource through ordinary
// image nodes (setImage) and the ordinary TEX_QUAD path. No pixel payload
// ever crosses QuickJS: the largest object this realm ever holds is the
// numeric handle plus a status string.
//
// Composition proofs wired into the layout:
//   transform/scaling — the 4K texture is bound to a main image node and a
//     small thumbnail node, both far smaller than the texture;
//   clipping          — the main image node is deliberately LARGER than its
//     overflow-hidden stage, so the core clips it;
//   z-order           — an ordinary opaque badge view is painted above the
//     image, chrome/status bars above both;
//   resize            — the stage is flex-sized, so live window resizes
//     relayout and recompose through the normal viewport path.
//
// Lifetime proof: every announced handle is retained in `keptHandles` for
// the whole session. When the host retires a resource natively, the guest
// still holds the handle — rebinding it must be ignored (deterministic
// absence) and the surviving composition must be untouched. Guest JS
// retention therefore demonstrably does NOT control resource lifetime.

const A2_SERVICE = "picoview-a2";

interface A2ImgMsg {
  t: "a2img";
  id: string;
  handle: number;
  w: number;
  h: number;
}

interface A2RetiredMsg {
  t: "a2retired";
  id: string;
  handle: number;
}

type A2Msg = A2ImgMsg | A2RetiredMsg;

interface A2Svc {
  poll(): A2Msg[];
  send(line: Record<string, unknown>): void;
}

function connectA2(): A2Svc | null {
  const ops = getOps();
  if (!ops.svcOpen || !ops.svcPoll || !ops.svcSend || !ops.svcOpen(A2_SERVICE)) return null;
  const poll = ops.svcPoll.bind(ops);
  const send = ops.svcSend.bind(ops);
  return {
    poll() {
      const batch = poll();
      if (!batch) return [];
      const events: A2Msg[] = [];
      for (const line of batch.split("\n")) {
        if (line === "") continue;
        try {
          events.push(JSON.parse(line) as A2Msg);
        } catch {
          // A malformed line is a host bug; skip it rather than wedge.
        }
      }
      return events;
    },
    send(line) {
      send(JSON.stringify(line));
    },
  };
}

export default function PicoViewGuest() {
  const [info, setInfo] = useState("A2: waiting for native image resource…");
  const mainRef = useRef<NodeMirror | null>(null);
  const thumbRef = useRef<NodeMirror | null>(null);
  const state = useRef({
    svc: null as A2Svc | null,
    // Deferred bindings for the first frames before nodeRef callbacks fire.
    pendingMain: -1,
    pendingThumb: -1,
    // Deliberately retained handles: JS refs do NOT own the resource.
    keptHandles: [] as number[],
  });

  useFrame(() => {
    const s = state.current;
    if (!s.svc) s.svc = connectA2();
    const svc = s.svc;
    if (!svc) return;
    const ops = getOps();

    // Apply bindings that arrived before the image nodes were mounted.
    if (s.pendingMain >= 0 && mainRef.current) {
      ops.setImage(mainRef.current.id, s.pendingMain);
      s.pendingMain = -1;
    }
    if (s.pendingThumb >= 0 && thumbRef.current) {
      ops.setImage(thumbRef.current.id, s.pendingThumb);
      s.pendingThumb = -1;
    }

    for (const msg of svc.poll()) {
      if (msg.t === "a2img") {
        s.keptHandles.push(msg.handle);
        if (mainRef.current) ops.setImage(mainRef.current.id, msg.handle);
        else s.pendingMain = msg.handle;
        if (thumbRef.current) ops.setImage(thumbRef.current.id, msg.handle);
        else s.pendingThumb = msg.handle;
        setInfo(
          `A2: bound ${msg.id} handle=${msg.handle} ${msg.w}x${msg.h} — guest holds ${s.keptHandles.length} handle(s)`,
        );
        svc.send({ t: "a2ack", id: msg.id, handle: msg.handle, bound: "main+thumb" });
      } else if (msg.t === "a2retired") {
        // The host already freed the resource natively. The guest still
        // holds the handle: rebinding it must be silently ignored (stale
        // handles resolve to deterministic absence), and the surviving
        // composition must not change.
        if (mainRef.current) ops.setImage(mainRef.current.id, msg.handle);
        setInfo(
          `A2: host retired ${msg.id} handle=${msg.handle} — stale rebind ignored; composition survives`,
        );
        svc.send({
          t: "a2ack",
          id: msg.id,
          retired: true,
          keptRefs: s.keptHandles.length,
        });
      }
    }
  });

  return (
    <View class="w-full h-full flex-col bg-slate-900">
      <View class="flex-row items-center justify-between px-4 py-2 bg-slate-900">
        <Text class="text-sm text-white font-bold">PicoView</Text>
        <Text class="text-xs text-slate-400">Architecture A2 — native image resource</Text>
      </View>
      <View class="flex-1 overflow-hidden bg-slate-800">
        {/* MAIN image: the native 3840x2160 resource composed through an
            ordinary layout box, deliberately LARGER than this overflow-hidden
            stage (880x495 box, offset -80/-40) — proves transform/scaling and
            clipping in one node. */}
        <Image
          nodeRef={(node: NodeMirror | null) => {
            mainRef.current = node;
          }}
          style={{ posType: 1, insetL: -80, insetT: -40, width: 880, height: 495 }}
        />
        {/* Thumbnail: the SAME texture at a second, much smaller scale. */}
        <Image
          nodeRef={(node: NodeMirror | null) => {
            thumbRef.current = node;
          }}
          style={{ posType: 1, insetR: 16, insetB: 16, width: 120, height: 68 }}
        />
        {/* Z-order badge: an ordinary opaque UI element painted ABOVE the
            image (later sibling in painter order). */}
        <View
          class="bg-slate-900 border border-slate-600"
          style={{ posType: 1, insetL: 16, insetT: 12, width: 260, height: 36 }}
        >
          <Text class="text-xs text-white"> UI element above the native image </Text>
        </View>
      </View>
      <View class="flex-row items-center justify-between px-4 py-1 bg-slate-900 border-t border-slate-700">
        <Text class="text-xs text-slate-400">{info}</Text>
        <Text class="text-xs text-slate-500">QuickJS is a control plane — no pixel payloads</Text>
      </View>
    </View>
  );
}
