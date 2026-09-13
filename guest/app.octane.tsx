import { useRef, useState } from "octane";
import { Image, Text, View, type NodeMirror } from "@pocketjs/framework/octane/components";
import { useFrame } from "@pocketjs/framework/octane/lifecycle";
import { getOps } from "@pocketjs/framework/octane";

// PicoView A5 architecture proof guest — generation cancellation and
// resource-bounds stress on the native image seam.
//
// Still a strict CONTROL PLANE: it sends bounded view requests
//   {t:"a4open",req,path,fitW,fitH}  viewport-appropriate (Fit) decode
//   {t:"a4open",req,path}            100% / full decode (explicitly degraded
//                                    by the host when it cannot be admitted)
// and receives ONLY bounded semantic state: {t:"a3img",req,handle,w,h,orient,
// mode,nativeW,nativeH} / {t:"a3error",req,code}. No pixel payload ever
// enters this realm.
//
// A5 stress: key "s" fires STRESS_REQUESTS rapid open requests (one per
// frame, cycling the manifest, Fit-sized) WITHOUT waiting for replies, so
// the host's coalescing drain — not a guest gate — is what enforces
// work-in-flight = 1. Replies are counted by kind; the newest requested
// generation must be the final published state (verified host-side from
// the A3EVENT log).
//
// Zoom/pan are pure composition state: the same registered texture is
// re-composed through an ordinary image node whose style box is updated
// reactively. Pointer-anchored zoom keeps the image-space point under the
// pointer fixed; pan is clamped to sane bounds. Every view change reports
// its geometry back as bounded numbers ({t:"a3ack",geom:[bx,by,bw,bh],zoom})
// so the harness can verify the anchor invariant from host logs.
//
// Harness assumptions (test material): the main stage box is the A2/A3
// 880x495 logical box, raster density 2, so Fit requests target 1760x990
// device pixels and 100% means image pixels == device pixels (plane/2).

const A3_SERVICE = "picoview-a3";
const STAGE_W = 880;
const STAGE_H = 495;
const DENSITY = 2;
const STRESS_REQUESTS = 120;
const STRESS_BURST = 5; // arrivals per frame: queue depth the drain must coalesce

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
  mode: string;
  nativeW: number;
  nativeH: number;
}

interface A3ErrorMsg {
  t: "a3error";
  req: string;
  code: string;
}

interface SvcMouseEvent {
  t: "mouse";
  x: number;
  y: number;
  d: boolean;
}

interface SvcScrollEvent {
  t: "scroll";
  dy: number;
}

interface SvcKeyEvent {
  t: "key";
  k: string;
  ctl: boolean;
}

interface SvcResizeEvent {
  t: "resize";
  w: number;
  h: number;
  /** A6: monitor truth that rode along with the transition (96 = 100%). */
  dpi?: number;
  density?: number;
}

type A3Msg =
  | A3ManifestMsg
  | A3ImgMsg
  | A3ErrorMsg
  | SvcMouseEvent
  | SvcScrollEvent
  | SvcKeyEvent
  | SvcResizeEvent;

interface Box {
  bx: number;
  by: number;
  bw: number;
  bh: number;
}

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

/** Contain-fit a plane of (w,h) into the stage, centered. */
function fitBox(w: number, h: number): Box {
  const scale = Math.min(STAGE_W / w, STAGE_H / h);
  const bw = w * scale;
  const bh = h * scale;
  return { bx: (STAGE_W - bw) / 2, by: (STAGE_H - bh) / 2, bw, bh };
}

/** Clamp a box so it stays inside (or fully covers) the stage. */
function clampBox(b: Box): Box {
  const out = { ...b };
  if (out.bw <= STAGE_W) {
    out.bx = Math.min(Math.max(out.bx, 0), STAGE_W - out.bw);
  } else {
    out.bx = Math.min(Math.max(out.bx, STAGE_W - out.bw), 0);
  }
  if (out.bh <= STAGE_H) {
    out.by = Math.min(Math.max(out.by, 0), STAGE_H - out.bh);
  } else {
    out.by = Math.min(Math.max(out.by, STAGE_H - out.bh), 0);
  }
  return out;
}

export default function PicoViewGuest() {
  const [info, setInfo] = useState("A5: waiting for manifest…");
  const mainRef = useRef<NodeMirror | null>(null);
  const [box, setBox] = useState<Box>({ bx: 0, by: 0, bw: STAGE_W, bh: STAGE_H });
  // C3 static-frames declaration: every guest-visible change here is driven
  // by an input event or an A3 service reply (manifest walk, walk keys,
  // clicks, stress bursts) — the frame callback never advances state on its
  // own. Declaring that lets the host park the worker between events; if a
  // self-driven JS animation is ever added, it must retract this first via
  // `getOps().__pocketStaticFrames?.(false)`. Optional call: hosts without
  // the binding keep the continuous tick loop.
  getOps().__pocketStaticFrames?.(true);
  const state = useRef({
    svc: null as A3Svc | null,
    files: [] as string[],
    next: 0,
    pending: false,
    currentPath: "",
    boundHandle: -1,
    planeW: 0,
    planeH: 0,
    // Composition state (zoom/pan) over the bound texture.
    box: { bx: 0, by: 0, bw: STAGE_W, bh: STAGE_H } as Box,
    zoom: 1,
    mode: "fit",
    pointer: { x: STAGE_W / 2, y: STAGE_H / 2 },
    dragging: false,
    acks: 0,
    // A5 stress: rapid requests without a pending gate; replies counted
    // by kind so the host-side coalescing behavior can be verified from
    // the guest-visible outcome alone.
    stress: { sent: 0, imgs: 0, cancelled: 0, others: 0, lastPath: "", done: false },
  });

  useFrame(() => {
    const s = state.current;
    if (!s.svc) s.svc = connectA3();
    const svc = s.svc;
    if (!svc) return;

    const reportGeom = (req: string) => {
      svc.send({
        t: "a3ack",
        req,
        bound: `${s.mode}@${s.zoom.toFixed(3)}`,
        geom: [s.box.bx, s.box.by, s.box.bw, s.box.bh],
        zoom: s.zoom,
      });
      setBox({ ...s.box });
    };

    const applyFit = () => {
      if (s.planeW <= 0) return;
      s.mode = "fit";
      s.zoom = 1;
      s.box = fitBox(s.planeW, s.planeH);
    };

    // A5 stress bookkeeping: count a reply by kind; when every fired
    // request has been answered, report the guest-visible outcome.
    const noteStressReply = (req: string, kind: "img" | "cancelled" | "other") => {
      const st = s.stress;
      if (!req.startsWith("p")) return;
      if (kind === "img") st.imgs += 1;
      else if (kind === "cancelled") st.cancelled += 1;
      else st.others += 1;
      if (st.sent === STRESS_REQUESTS && !st.done &&
          st.imgs + st.cancelled + st.others === st.sent) {
        st.done = true;
        setInfo(
          `A5 stress complete: sent=${st.sent} imgs=${st.imgs} cancelled=${st.cancelled} other=${st.others} final=${fileName(st.lastPath)}`,
        );
      }
    };

    for (const msg of svc.poll()) {
      if (msg.t === "a3manifest") {
        s.files = msg.files;
        setInfo(`A5: manifest — ${msg.files.length} file request(s) queued (Fit first)`);
      } else if (msg.t === "a3img") {
        s.pending = false;
        s.boundHandle = msg.handle;
        s.planeW = msg.w;
        s.planeH = msg.h;
        if (mainRef.current) getOps().setImage(mainRef.current.id, msg.handle);
        if (msg.mode === "full") {
          // 100%: image pixels at device-pixel scale (1:1), pannable.
          s.mode = "full";
          s.zoom = 1;
          s.box = clampBox({ bx: 0, by: 0, bw: s.planeW / DENSITY, bh: s.planeH / DENSITY });
        } else {
          applyFit();
        }
        reportGeom(msg.req);
        noteStressReply(msg.req, "img");
        if (!msg.req.startsWith("p")) {
          setInfo(
            `A5: ${msg.req} ${msg.mode} bound handle=${msg.handle} plane=${msg.w}x${msg.h} native=${msg.nativeW}x${msg.nativeH} (${fileName(s.currentPath)})`,
          );
        }
      } else if (msg.t === "a3error") {
        s.pending = false;
        noteStressReply(msg.req, msg.code === "cancelled" ? "cancelled" : "other");
        if (!msg.req.startsWith("p")) {
          setInfo(`A5: ${msg.req} error code=${msg.code} (${fileName(s.currentPath)}) — bounded, walk continues`);
        }
        svc.send({ t: "a3ack", req: msg.req, error: msg.code });
      } else if (msg.t === "mouse") {
        // Pointer is given in window coordinates; the stage starts below
        // the header bar.
        const px = msg.x;
        const py = msg.y - 40;
        if (msg.d && !s.dragging) {
          s.dragging = true;
        } else if (!msg.d && s.dragging) {
          s.dragging = false;
        }
        if (s.dragging && s.mode !== "fit") {
          s.box.bx += px - s.pointer.x;
          s.box.by += py - s.pointer.y;
          s.box = clampBox(s.box);
          s.acks += 1;
          reportGeom(`pan-${s.acks}`);
        }
        s.pointer = { x: px, y: py };
      } else if (msg.t === "scroll") {
        // Wheel zoom, anchored at the last known pointer position.
        if (s.planeW <= 0) continue;
        const factor = Math.exp((msg.dy / 24) * 0.25);
        zoomAt(s.pointer.x, s.pointer.y, factor);
      } else if (msg.t === "key") {
        const k = msg.k;
        if (k === "f") {
          request("fit", svc);
        } else if (k === "1") {
          request("full", svc);
        } else if (k === "=" || k === "+") {
          zoomAt(s.pointer.x, s.pointer.y, 1.25);
        } else if (k === "-" || k === "_") {
          zoomAt(s.pointer.x, s.pointer.y, 0.8);
        } else if (k === "s" && s.files.length > 0 && !s.stress.sent && !s.stress.done) {
          // A5: fire a rapid burst with no pending gate; the host's
          // coalescing drain enforces work-in-flight = 1.
          s.stress.sent = 1;
          s.stress.lastPath = s.files[0];
          svc.send({
            t: "a4open", req: "p0", path: s.files[0],
            fitW: STAGE_W * DENSITY, fitH: STAGE_H * DENSITY,
          });
          setInfo("A5 stress running: 120 rapid Fit requests…");
        }
      } else if (msg.t === "resize") {
        // A6: a scale transition happened. The guest's stage, image box
        // and zoom/pan state are all logical and need NO recomputation —
        // logical stability across the DPI transition is the proof. Only
        // the monitor truth (dpi/density) is recorded for display; the
        // bound texture (image coordinates) is DPI-independent by design.
        if (msg.dpi !== undefined || msg.density !== undefined) {
          setInfo(
            `A6: scale transition — logical=${msg.w}x${msg.h} dpi=${msg.dpi ?? "?"} density=${msg.density ?? "?"} (composition unchanged, box=(${s.box.bx.toFixed(1)},${s.box.by.toFixed(1)},${s.box.bw.toFixed(1)},${s.box.bh.toFixed(1)}))`,
          );
          svc.send({ t: "a3ack", req: `dpi-${msg.dpi ?? 0}`, bound: `${s.mode}@${s.zoom.toFixed(3)}`, geom: [s.box.bx, s.box.by, s.box.bw, s.box.bh], zoom: s.zoom });
        }
      }
    }

    // Sequential walk: request each file once, Fit-first.
    if (!s.pending && s.next < s.files.length) {
      s.next += 1;
      request("fit", svc);
    }

    // A5 stress: a burst of new requests per frame while the burst is
    // running — several arrivals land in one host drain, and only the
    // host's coalescing keeps decode work at one per drain.
    if (s.stress.sent > 0 && s.stress.sent < STRESS_REQUESTS && s.files.length > 0) {
      for (let b = 0; b < STRESS_BURST && s.stress.sent < STRESS_REQUESTS; b++) {
        const i = s.stress.sent;
        const path = s.files[i % s.files.length];
        s.stress.lastPath = path;
        svc.send({
          t: "a4open", req: `p${i}`, path,
          fitW: STAGE_W * DENSITY, fitH: STAGE_H * DENSITY,
        });
        s.stress.sent += 1;
      }
    }

    function request(mode: "fit" | "full", out: A3Svc) {
      if (s.pending || s.next === 0 || s.next > s.files.length) return;
      const req = `r${s.next}`;
      s.currentPath = s.files[s.next - 1];
      const line =
        mode === "fit"
          ? { t: "a4open", req, path: s.currentPath, fitW: STAGE_W * DENSITY, fitH: STAGE_H * DENSITY }
          : { t: "a4open", req, path: s.currentPath };
      out.send(line);
      s.pending = true;
    }

    function zoomAt(ax: number, ay: number, factor: number) {
      if (s.planeW <= 0) return;
      if (s.mode === "fit") s.mode = "free";
      const nz = Math.min(Math.max(s.zoom * factor, 0.05), 40);
      const f = nz / s.zoom;
      if (f === 1) return;
      // Preserve the image-space point under (ax, ay): u is invariant.
      const u = (ax - s.box.bx) / s.box.bw;
      const v = (ay - s.box.by) / s.box.bh;
      s.box = clampBox({
        bx: ax - u * s.box.bw * f,
        by: ay - v * s.box.bh * f,
        bw: s.box.bw * f,
        bh: s.box.bh * f,
      });
      s.zoom = nz;
      s.acks += 1;
      reportGeom(`zoom-${s.acks}`);
    }
  });

  return (
    <View class="w-full h-full flex-col bg-slate-900">
      <View class="flex-row items-center justify-between px-4 py-2 bg-slate-900">
        <Text class="text-sm text-white font-bold">PicoView</Text>
        <Text class="text-xs text-slate-400">Architecture A6 — Per-Monitor DPI V2</Text>
      </View>
      <View class="flex-1 overflow-hidden bg-slate-800">
        <Image
          nodeRef={(node: NodeMirror | null) => {
            mainRef.current = node;
            if (node && state.current.boundHandle >= 0) {
              getOps().setImage(node.id, state.current.boundHandle);
            }
          }}
          style={{
            posType: 1,
            insetL: box.bx,
            insetT: box.by,
            width: box.bw,
            height: box.bh,
          }}
        />
        <View
          class="bg-slate-900 border border-slate-600"
          style={{ posType: 1, insetL: 16, insetT: 12, width: 300, height: 36 }}
        >
          <Text class="text-xs text-white"> F=Fit 1=100% +/-=zoom drag=pan s=stress </Text>
        </View>
      </View>
      <View class="flex-row items-center justify-between px-4 py-1 bg-slate-900 border-t border-slate-700">
        <Text class="text-xs text-slate-400">{info}</Text>
        <Text class="text-xs text-slate-500">QuickJS is a control plane — no pixel payloads</Text>
      </View>
    </View>
  );
}
