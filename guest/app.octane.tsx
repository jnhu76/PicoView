import { useRef, useState } from "octane";
import { Image, Text, View, type NodeMirror } from "@pocketjs/framework/octane/components";
import { useFrame } from "@pocketjs/framework/octane/lifecycle";
import { getOps } from "@pocketjs/framework/octane";

// PicoView A3 architecture proof guest — first real JPEG through the
// native image seam.
//
// This guest is the CONTROL PLANE of the A3 vertical slice. It sends one
// bounded file-request intent at a time — {t:"a3open",req,path} — and
// receives ONLY bounded semantic state back:
//   {t:"a3img",req,handle,w,h,orient}   success: bind and present
//   {t:"a3error",req,code}              bounded failure: record, continue
// The host reads/decodes the file with Windows Imaging Component and
// registers the plane through the A2 seam (register_native_texture). No
// encoded byte and no decoded pixel ever enters this realm: the largest
// object here is the numeric handle, the dimensions, and a status string.
//
// Request pacing: strictly sequential — the next file is requested only
// after the previous request resolves, so every result correlates to
// exactly one guest intent. Errors do not wedge the walk: the error is
// recorded and the next request proceeds.

const A3_SERVICE = "picoview-a3";

interface A3ManifestMsg {
  t: "a3manifest";
  files: string[];
}

interface A3ImgMsg {
  t: "a3img";
  req: string;
  handle: number;
  w: number;
  h: number;
  orient: number;
}

interface A3ErrorMsg {
  t: "a3error";
  req: string;
  code: string;
}

type A3Msg = A3ManifestMsg | A3ImgMsg | A3ErrorMsg;

interface A3Svc {
  poll(): A3Msg[];
  send(line: Record<string, unknown>): void;
}

function connectA3(): A3Svc | null {
  const ops = getOps();
  if (!ops.svcOpen || !ops.svcPoll || !ops.svcSend || !ops.svcOpen(A3_SERVICE)) return null;
  const poll = ops.svcPoll.bind(ops);
  const send = ops.svcSend.bind(ops);
  return {
    poll() {
      const batch = poll();
      if (!batch) return [];
      const events: A3Msg[] = [];
      for (const line of batch.split("\n")) {
        if (line === "") continue;
        try {
          events.push(JSON.parse(line) as A3Msg);
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

function fileName(path: string): string {
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return cut >= 0 ? path.slice(cut + 1) : path;
}

export default function PicoViewGuest() {
  const [info, setInfo] = useState("A3: waiting for manifest…");
  const mainRef = useRef<NodeMirror | null>(null);
  const thumbRef = useRef<NodeMirror | null>(null);
  const state = useRef({
    svc: null as A3Svc | null,
    files: [] as string[],
    next: 0,
    pending: false,
    currentPath: "",
    boundHandle: -1,
    ok: 0,
    failed: 0,
    done: false,
  });

  useFrame(() => {
    const s = state.current;
    if (!s.svc) s.svc = connectA3();
    const svc = s.svc;
    if (!svc) return;

    for (const msg of svc.poll()) {
      if (msg.t === "a3manifest") {
        s.files = msg.files;
        setInfo(`A3: manifest — ${msg.files.length} file request(s) queued`);
      } else if (msg.t === "a3img") {
        s.ok += 1;
        s.pending = false;
        s.boundHandle = msg.handle;
        if (mainRef.current) getOps().setImage(mainRef.current.id, msg.handle);
        if (thumbRef.current) getOps().setImage(thumbRef.current.id, msg.handle);
        setInfo(
          `A3: ${msg.req} bound handle=${msg.handle} ${msg.w}x${msg.h} orient=${msg.orient} (${fileName(s.currentPath)})`,
        );
        svc.send({ t: "a3ack", req: msg.req, bound: "main+thumb" });
      } else if (msg.t === "a3error") {
        s.failed += 1;
        s.pending = false;
        setInfo(`A3: ${msg.req} error code=${msg.code} (${fileName(s.currentPath)}) — bounded failure, walk continues`);
        svc.send({ t: "a3ack", req: msg.req, error: msg.code });
      }
    }

    // Sequential guest intent: request the next file once the previous
    // request resolved (success or bounded error).
    if (!s.pending && s.next < s.files.length) {
      const req = `r${s.next + 1}`;
      s.currentPath = s.files[s.next];
      svc.send({ t: "a3open", req, path: s.currentPath });
      s.next += 1;
      s.pending = true;
    } else if (!s.pending && s.files.length > 0 && !s.done && s.next >= s.files.length) {
      s.done = true;
      setInfo(
        `A3: walk complete — ${s.ok} presented, ${s.failed} bounded error(s); QuickJS held only handles, numbers, strings`,
      );
    }
  });

  return (
    <View class="w-full h-full flex-col bg-slate-900">
      <View class="flex-row items-center justify-between px-4 py-2 bg-slate-900">
        <Text class="text-sm text-white font-bold">PicoView</Text>
        <Text class="text-xs text-slate-400">Architecture A3 — first JPEG / WIC</Text>
      </View>
      <View class="flex-1 overflow-hidden bg-slate-800">
        {/* MAIN image: the WIC-decoded, natively oriented resource composed
            through an ordinary layout box (clipped by the overflow-hidden
            stage), exactly as in A2 — one seam, no second image path. */}
        <Image
          nodeRef={(node: NodeMirror | null) => {
            mainRef.current = node;
            if (node && state.current.boundHandle >= 0) {
              getOps().setImage(node.id, state.current.boundHandle);
            }
          }}
          style={{ posType: 1, insetL: -80, insetT: -40, width: 880, height: 495 }}
        />
        {/* Thumbnail: the SAME texture at a second, much smaller scale. */}
        <Image
          nodeRef={(node: NodeMirror | null) => {
            thumbRef.current = node;
            if (node && state.current.boundHandle >= 0) {
              getOps().setImage(node.id, state.current.boundHandle);
            }
          }}
          style={{ posType: 1, insetR: 16, insetB: 16, width: 120, height: 68 }}
        />
        {/* Z-order badge: an ordinary opaque UI element painted ABOVE the
            image (later sibling in painter order). */}
        <View
          class="bg-slate-900 border border-slate-600"
          style={{ posType: 1, insetL: 16, insetT: 12, width: 300, height: 36 }}
        >
          <Text class="text-xs text-white"> WIC decode — native plane, JS holds a handle </Text>
        </View>
      </View>
      <View class="flex-row items-center justify-between px-4 py-1 bg-slate-900 border-t border-slate-700">
        <Text class="text-xs text-slate-400">{info}</Text>
        <Text class="text-xs text-slate-500">QuickJS is a control plane — no pixel payloads</Text>
      </View>
    </View>
  );
}
