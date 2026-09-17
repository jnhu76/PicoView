// Framework-level binding oracle (PICOVIEW-LAST-GOOD-PUBLICATION-1
// CORRECTIVE-2). Run: `bun test guest/`.
//
// `binding.test.ts` proves the reconciliation policy purely; this file proves
// the MECHANISM it depends on against the real pinned PocketJS framework at
// the lock revision, not a mock of it: `registerTexture` / `setProp("src")` /
// `setSrc` are the actual framework functions (the same ones the compiled
// bundle calls), driven with a recording host ops.
//
// Two framework facts make the guest binding a real safety boundary:
//   1. a mounted Image resolves its handle through the key→handle map at
//      render time, and
//   2. `setProp` skips an unchanged value, so a src string that did not
//      change re-resolves NOTHING — the node keeps its old handle.
// The old per-ready-event flip could therefore end a batch on the mounted
// key and leave the node bound to a superseded handle.
import { beforeEach, expect, test } from "bun:test";
import { installHost, type Host, type HostOps } from "@pocketjs/framework/host";
import {
  createElement,
  registerTexture,
  resetTextures,
  setProp,
  type NodeMirror,
} from "@pocketjs/framework/octane/renderer";
import { reconcileBinding, textureKeyFor, type BoundPublication } from "./binding.ts";

let calls: Array<[string, number, number]> = [];
let nextNode = 1;

function installRecordingHost(): Host {
  const ops = {
    createNode: () => nextNode++,
    insertChild: () => {},
    setImage: (node: number, handle: number) => {
      calls.push(["setImage", node, handle]);
    },
  } as unknown as HostOps;
  const host: Host = { ops, kind: "injected", target: "test", strict: false };
  installHost(host);
  return host;
}

/** The framework's `src` delta: `prev` is what the previous render set. */
function renderSrc(image: NodeMirror, src: string, prev?: string): void {
  setProp(image, "src", src, prev);
}

beforeEach(() => {
  calls = [];
  nextNode = 1;
  installRecordingHost();
  resetTextures();
});

test("an unchanged src does not re-resolve the mounted handle", () => {
  // The hazard, at the real framework: the key→handle map moved to the new
  // publication but the node was not re-rendered with a different src.
  const image = createElement("image");
  registerTexture(textureKeyFor(0), 11); // A
  renderSrc(image, textureKeyFor(0), undefined);
  expect(calls).toEqual([["setImage", image.id, 11]]);
  calls = [];

  registerTexture(textureKeyFor(0), 33); // map now says C under the same key
  renderSrc(image, textureKeyFor(0), textureKeyFor(0)); // unchanged src
  expect(calls).toEqual([]); // no re-resolution: the node still resolves A
});

test("a flipped slot re-resolves the node to the reconciled publication", () => {
  const image = createElement("image");
  let bound: BoundPublication | null = null;
  let renderedSrc: string | undefined;

  // Frame N: publication A commits; the binding is established and rendered.
  let recon = reconcileBinding(bound, { generation: 1, handle: 11 });
  if (recon.register) registerTexture(recon.register.key, recon.register.handle);
  bound = recon.binding;
  renderSrc(image, textureKeyFor(bound!.slot), renderedSrc);
  renderedSrc = textureKeyFor(bound!.slot);
  expect(calls).toEqual([["setImage", image.id, 11]]);
  calls = [];

  // Frame N+1: TWO publications collapsed into one turn (B then C). One
  // reconciliation against the final publication: one flip, one register.
  recon = reconcileBinding(bound, { generation: 3, handle: 33 });
  expect(recon.changed).toBe(true);
  if (recon.register) registerTexture(recon.register.key, recon.register.handle);
  bound = recon.binding;
  const nextSrc = textureKeyFor(bound!.slot);
  expect(nextSrc).not.toBe(renderedSrc); // the src string really does change
  renderSrc(image, nextSrc, renderedSrc);

  // The mounted node re-resolved to C, not to the intermediate B, and not
  // back to A on the wrapped slot.
  expect(calls).toEqual([["setImage", image.id, 33]]);
  expect(bound).toEqual({ generation: 3, handle: 33, slot: 1 });
});

test("a full image node unmount/remount cycle is always a fresh src", () => {
  // Verdict leaves "image" (new-item loading), then a new publication
  // arrives: the Image remounts, and a fresh mount applies its src even if
  // the key string happens to repeat. The binding reset makes the next
  // binding start from slot 0 with its own registration.
  const first = createElement("image");
  registerTexture(textureKeyFor(0), 11);
  renderSrc(first, textureKeyFor(0), undefined);
  calls = [];

  const before = reconcileBinding({ generation: 1, handle: 11, slot: 0 }, null);
  expect(before).toEqual({ binding: null, register: null, changed: true });

  const after = reconcileBinding(null, { generation: 4, handle: 44 });
  expect(after).toEqual({
    binding: { generation: 4, handle: 44, slot: 0 },
    register: { key: textureKeyFor(0), handle: 44 },
    changed: true,
  });
  registerTexture(after.register!.key, after.register!.handle);

  const remounted = createElement("image"); // fresh node: prev is undefined
  renderSrc(remounted, textureKeyFor(after.binding!.slot), undefined);
  expect(calls).toEqual([["setImage", remounted.id, 44]]);
});
