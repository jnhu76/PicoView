(() => {
  // framework/src/octane-profiling-stub.ts
  function __profileBeginRender(..._args) {
    return null;
  }
  function __profileEndRender(..._args) {}
  function __profileSchedule(..._args) {}
  function __profileTrackComponent(..._args) {}
  var profiler = {
    start(_options) {},
    stop() {},
    clear() {},
    isActive() {
      return false;
    },
    exportTrace() {
      return {
        events: []
      };
    },
    events() {
      return [];
    }
  };

  // node_modules/octane/dist/universal-core.js
  var UNIVERSAL_PLAN = /* @__PURE__ */ Symbol.for("octane.universal.plan");
  var UNIVERSAL_VALUE = /* @__PURE__ */ Symbol.for("octane.universal.value");
  var UNIVERSAL_LIST = /* @__PURE__ */ Symbol.for("octane.universal.list");
  var UNIVERSAL_COMPONENT = /* @__PURE__ */ Symbol.for("octane.universal.component");
  var UNIVERSAL_COMPONENT_VALUE = /* @__PURE__ */ Symbol.for("octane.universal.component-value");
  var UNIVERSAL_PROPS = /* @__PURE__ */ Symbol.for("octane.universal.props");
  var UNIVERSAL_CHILDREN = /* @__PURE__ */ Symbol.for("octane.universal.children");
  var UNIVERSAL_IF = /* @__PURE__ */ Symbol.for("octane.universal.if");
  var UNIVERSAL_SWITCH = /* @__PURE__ */ Symbol.for("octane.universal.switch");
  var UNIVERSAL_FOR = /* @__PURE__ */ Symbol.for("octane.universal.for");
  var UNIVERSAL_TRY = /* @__PURE__ */ Symbol.for("octane.universal.try");
  var UNIVERSAL_CONTEXT = /* @__PURE__ */ Symbol.for("octane.universal.context");
  var UNIVERSAL_ACTIVITY = /* @__PURE__ */ Symbol.for("octane.universal.activity");
  var UNIVERSAL_KEYED = /* @__PURE__ */ Symbol.for("octane.universal.keyed");
  var UNIVERSAL_PORTAL = /* @__PURE__ */ Symbol.for("octane.universal.portal");
  var UNIVERSAL_RENDERER_REGION = /* @__PURE__ */ Symbol.for("octane.universal.renderer-region");
  var RENDERER_REGION_OWNER = /* @__PURE__ */ Symbol.for("octane.renderer-region.owner");
  var LAZY_COMPONENT = /* @__PURE__ */ Symbol.for("octane.lazy");
  var NO_CHILDREN = /* @__PURE__ */ Symbol("octane.universal.no-children");
  var NO_KEY = /* @__PURE__ */ Symbol("octane.universal.no-key");
  var NO_PENDING_PASSIVE_ERROR = /* @__PURE__ */ Symbol("octane.universal.no-pending-passive-error");
  var UNIVERSAL_TRANSPORT_PROTOCOL_VERSION = 1;
  var UNIVERSAL_LAZY_METADATA = Object.freeze({
    id: "<lazy>",
    target: "universal"
  });
  var EMPTY_BLUEPRINT_EVENTS = /* @__PURE__ */ new Map;
  var EMPTY_BLUEPRINT_HOST_CALLBACKS = /* @__PURE__ */ new Map;
  var EMPTY_COMMITTED_EVENTS = /* @__PURE__ */ new Map;
  var EMPTY_COMMITTED_HOST_CALLBACKS = /* @__PURE__ */ new Map;
  var UNIVERSAL_TREE_PORTAL = 1 << 0;
  var UNIVERSAL_TREE_REGION = 1 << 1;
  var UNIVERSAL_TREE_EVENT = 1 << 2;
  var UNIVERSAL_TREE_LIFECYCLE = 1 << 3;
  var UNIVERSAL_TREE_LOCAL_CALLBACK = 1 << 4;
  var UNIVERSAL_TREE_REF = 1 << 5;
  var UNIVERSAL_TREE_HIDDEN = 1 << 6;
  var CURRENT_ATTEMPT = null;
  var CURRENT_OWNER = null;
  var CURRENT_LAZY_LEAF_OWNER = null;
  var CURRENT_MEMO_CONTEXT_READS = null;
  var SCHEDULED_UNIVERSAL_ROOTS = /* @__PURE__ */ new Set;
  var PENDING_UNIVERSAL_PASSIVE_ROOTS = /* @__PURE__ */ new Set;
  var UNIVERSAL_SYNC_DEPTH = 0;
  var UNIVERSAL_COMMIT_TASK_DEPTH = 0;
  var UNIVERSAL_TRANSITION_DEPTH = 0;
  var UNIVERSAL_ASYNC_TRANSITION_COUNT = 0;
  var UNIVERSAL_DISCRETE_EVENT_DEPTH = 0;
  var UNIVERSAL_TRANSITION_PENDING_COUNT = 0;
  var ACTIVE_UNIVERSAL_TRANSITION_BATCH = null;
  var IN_FLIGHT_UNIVERSAL_TRANSITION_BATCH = null;
  var UNIVERSAL_TRANSITION_LISTENERS = /* @__PURE__ */ new Set;
  var UNIVERSAL_SYNC_DRAIN_LIMIT = 100;
  var NEXT_HOOK_SLOT = 0;
  var NEXT_OWNER_ID = 1;
  var NEXT_UNIVERSAL_ID_ROOT = 1;
  var NEXT_EVENT_ROOT = 1;
  var NEXT_RESOURCE_ROOT = 1;
  var NEXT_PORTAL_ROOT = 1;
  var NEXT_TRANSPORT_ROOT = 1;
  var EVENT_DISPATCHERS = /* @__PURE__ */ new Map;
  var UNIVERSAL_SLOT_STACK = [];
  var EMPTY_UNIVERSAL_TRANSITION_BATCHES = /* @__PURE__ */ new Set;

  class UniversalRendererRegionOwnerBridge {
    constructor(owner, ownerRenderer, childRenderer, component) {
      this.owner = owner;
      this.ownerRenderer = ownerRenderer;
      this.childRenderer = childRenderer;
      this.component = component;
    }
    owner;
    ownerRenderer;
    childRenderer;
    component;
    cell = null;
    get active() {
      return this.cell?.active === true;
    }
    compatible(previous) {
      return previous.owner === this.owner && previous.ownerRenderer === this.ownerRenderer && previous.childRenderer === this.childRenderer && previous.component === this.component;
    }
    activate(previous) {
      if (this.cell?.active === true)
        return this.cell;
      if (previous !== null && this.compatible(previous) && previous.cell?.active === true) {
        this.cell = previous.cell;
        return this.cell;
      }
      this.cell = { active: true, disposing: false, disposers: /* @__PURE__ */ new Set };
      return this.cell;
    }
    lifecycle() {
      return this.cell;
    }
    readContext(context) {
      if (!this.active) {
        throw new Error("A renderer-region owner bridge cannot be read before its host commit.");
      }
      for (let current = this.owner;current !== null; current = current.parent) {
        if (current.contextValues?.has(context))
          return current.contextValues.get(context);
      }
      return this.owner.root.readBridgeContext(context);
    }
    routeError(error) {
      return this.active && routeUniversalOwnerError(this.owner, error);
    }
    routeSuspense(thenable) {
      return this.active && routeUniversalOwnerSuspense(this.owner, thenable);
    }
    registerDispose(dispose) {
      const cell = this.cell;
      if (cell === null || !cell.active || cell.disposing) {
        throw new Error("A renderer-owned child root cannot attach before its universal region commits.");
      }
      if (typeof dispose !== "function") {
        throw new TypeError("A renderer-region disposer must be a function.");
      }
      cell.disposers.add(dispose);
      let registered = true;
      return () => {
        if (!registered)
          return;
        registered = false;
        cell.disposers.delete(dispose);
      };
    }
    deactivate() {
      const cell = this.cell;
      if (cell === null || !cell.active || cell.disposing)
        return;
      cell.active = false;
      cell.disposing = true;
      const disposers = [...cell.disposers];
      cell.disposers.clear();
      for (const dispose of disposers) {
        try {
          dispose();
        } catch (error) {
          if (!routeUniversalOwnerError(this.owner, error))
            console.error(error);
        }
      }
      cell.disposing = false;
    }
  }

  class UniversalSuspense {
    constructor(thenable) {
      this.thenable = thenable;
    }
    thenable;
  }

  class UniversalSuspendedAttemptImpl {
    constructor(root, thenable, component, props, replayEntries, transitionBatches, transitionRender, bridgeContextReads) {
      this.root = root;
      this.thenable = thenable;
      this.component = component;
      this.props = props;
      this.replayEntries = replayEntries;
      this.transitionBatches = transitionBatches;
      this.transitionRender = transitionRender;
      this.bridgeContextReads = bridgeContextReads;
      thenable.then(() => this.settle(), () => this.settle());
    }
    root;
    thenable;
    component;
    props;
    replayEntries;
    transitionBatches;
    transitionRender;
    bridgeContextReads;
    state = "suspended";
    get status() {
      return this.state;
    }
    settle() {
      if (this.state !== "suspended")
        return;
      this.root.finishSuspension(this, true);
    }
    abort(preserveTransitions = false) {
      if (this.state !== "suspended")
        return;
      this.state = "aborted";
      this.root.finishSuspension(this, false, preserveTransitions);
    }
  }
  function assertRendererId(value, label) {
    if (typeof value !== "string" || value.trim() === "") {
      throw new TypeError(`${label} must be a non-empty renderer id.`);
    }
  }
  function normalizeUniversalKey(value) {
    if (value == null)
      return null;
    if (typeof value === "string" || typeof value === "number" || typeof value === "symbol" || typeof value === "bigint") {
      return value;
    }
    throw new TypeError(`Universal keys must be strings, numbers, symbols, or bigints.`);
  }
  function freezePlanNode(node) {
    if (node.kind === "host") {
      if (typeof node.type !== "string" || node.type === "") {
        throw new TypeError("A universal host plan requires a non-empty string type.");
      }
      const props = Object.freeze({ ...node.props ?? {} });
      const bindings = Object.freeze((node.bindings ?? []).map((binding) => Object.freeze([binding[0], binding[1]])));
      const children = Object.freeze((node.children ?? []).map(freezePlanNode));
      return Object.freeze({
        kind: "host",
        type: node.type,
        props,
        bindings,
        ...node.propsSlot === undefined ? null : { propsSlot: node.propsSlot },
        children
      });
    }
    if (node.kind === "range") {
      return Object.freeze({
        kind: "range",
        children: Object.freeze(node.children.map(freezePlanNode))
      });
    }
    if (node.kind === "slot") {
      return Object.freeze({ kind: "slot", slot: node.slot });
    }
    if (node.kind === "component") {
      return Object.freeze({
        kind: "component",
        renderer: node.renderer,
        ...node.component === undefined ? null : { component: node.component },
        ...node.componentSlot === undefined ? null : { componentSlot: node.componentSlot },
        ...node.propsSlot === undefined ? null : { propsSlot: node.propsSlot },
        ...node.keySlot === undefined ? null : { keySlot: node.keySlot },
        children: Object.freeze((node.children ?? []).map(freezePlanNode))
      });
    }
    if (node.kind === "if") {
      return Object.freeze({
        kind: "if",
        conditionSlot: node.conditionSlot,
        then: freezePlanNode(node.then),
        ...node.else === undefined ? null : { else: freezePlanNode(node.else) }
      });
    }
    if (node.kind === "switch") {
      return Object.freeze({
        kind: "switch",
        valueSlot: node.valueSlot,
        cases: Object.freeze(node.cases.map(([value, child]) => Object.freeze([value, freezePlanNode(child)]))),
        ...node.default === undefined ? null : { default: freezePlanNode(node.default) }
      });
    }
    return Object.freeze({
      kind: "text",
      ...node.value === undefined ? null : { value: node.value },
      ...node.slot === undefined ? null : { slot: node.slot }
    });
  }
  function universalPlan(renderer, root) {
    assertRendererId(renderer, "universalPlan renderer");
    return Object.freeze({ $$kind: UNIVERSAL_PLAN, renderer, root: freezePlanNode(root) });
  }
  function universalValue(plan, values = [], key = null) {
    if (plan?.$$kind !== UNIVERSAL_PLAN)
      throw new TypeError("universalValue expected a universal plan.");
    return { $$kind: UNIVERSAL_VALUE, plan, values, key };
  }
  function renderableKey(value) {
    if (value?.$$kind === UNIVERSAL_VALUE) {
      return value.key;
    }
    if (value?.$$kind === UNIVERSAL_KEYED) {
      return value.key;
    }
    if (value?.$$kind === UNIVERSAL_COMPONENT_VALUE) {
      const component = value;
      return component.hasKey ? component.key : null;
    }
    return null;
  }
  function defineUniversalProtoProp(props, value) {
    Object.defineProperty(props, "__proto__", {
      configurable: true,
      enumerable: true,
      value,
      writable: true
    });
  }
  function assignUniversalPropSpread(props, value, canonicalizeHostClass) {
    const source = Object(value);
    const hasOwnProto = Object.prototype.propertyIsEnumerable.call(source, "__proto__");
    const hasOwnClassName = canonicalizeHostClass && Object.prototype.propertyIsEnumerable.call(source, "className");
    if (!hasOwnProto && !hasOwnClassName) {
      Object.assign(props, source);
      return;
    }
    let protoAssigned = false;
    const needsProtoGuard = hasOwnProto && !Object.prototype.hasOwnProperty.call(props, "__proto__");
    if (needsProtoGuard) {
      Object.defineProperty(props, "__proto__", {
        configurable: true,
        set(next) {
          protoAssigned = true;
          defineUniversalProtoProp(props, next);
        }
      });
    }
    if (hasOwnClassName) {
      Object.defineProperty(props, "className", {
        configurable: true,
        set(next) {
          props.class = next;
        }
      });
    }
    try {
      Object.assign(props, source);
    } finally {
      if (needsProtoGuard && !protoAssigned)
        delete props.__proto__;
      if (hasOwnClassName)
        delete props.className;
    }
  }
  function universalProps(entries, children = NO_CHILDREN, canonicalizeHostClass = false) {
    const props = {};
    if (!canonicalizeHostClass) {
      for (const entry of entries) {
        if (entry[0] === "set") {
          if (entry[1] === "__proto__")
            defineUniversalProtoProp(props, entry[2]);
          else
            props[entry[1]] = entry[2];
          continue;
        }
        const spread = entry[1];
        if (spread == null)
          continue;
        assignUniversalPropSpread(props, spread, false);
      }
    } else {
      for (const entry of entries) {
        if (entry[0] === "set") {
          const name = entry[1];
          if (name === "__proto__")
            defineUniversalProtoProp(props, entry[2]);
          else
            props[name === "className" ? "class" : name] = entry[2];
          continue;
        }
        const spread = entry[1];
        if (spread == null)
          continue;
        assignUniversalPropSpread(props, spread, true);
      }
    }
    if (children !== NO_CHILDREN)
      props.children = children;
    const hasKey = Object.prototype.hasOwnProperty.call(props, "key");
    const key = hasKey ? props.key : null;
    if (hasKey)
      delete props.key;
    return {
      $$kind: UNIVERSAL_PROPS,
      props: Object.freeze(props),
      key,
      hasKey,
      hasChildren: Object.prototype.hasOwnProperty.call(props, "children")
    };
  }
  function normalizePropsValue(value) {
    if (value?.$$kind === UNIVERSAL_PROPS) {
      return value;
    }
    return universalProps(value == null ? [] : [["spread", value]]);
  }
  function universalComponent(renderer, component, props = null, key = NO_KEY) {
    assertRendererId(renderer, "universalComponent renderer");
    const normalized = normalizePropsValue(props);
    return {
      $$kind: UNIVERSAL_COMPONENT_VALUE,
      renderer,
      component,
      props: normalized,
      key: key === NO_KEY ? normalized.key : key,
      hasKey: key !== NO_KEY || normalized.hasKey
    };
  }
  function universalChildren(renderer, render) {
    assertRendererId(renderer, "universalChildren renderer");
    if (typeof render !== "function")
      throw new TypeError("universalChildren expected a function.");
    return { $$kind: UNIVERSAL_CHILDREN, renderer, render };
  }
  function isRendererRegion(value) {
    return value?.$$kind === UNIVERSAL_RENDERER_REGION;
  }
  function rendererRegionOwnerBridge(value) {
    if (!isRendererRegion(value))
      return null;
    const bridge = value.props?.[RENDERER_REGION_OWNER];
    return bridge instanceof UniversalRendererRegionOwnerBridge ? bridge : null;
  }
  function defineUniversalComponent(renderer, render, metadata) {
    assertRendererId(renderer, "defineUniversalComponent renderer");
    if (typeof render !== "function")
      throw new TypeError("defineUniversalComponent expected a function.");
    Object.defineProperty(render, UNIVERSAL_COMPONENT, {
      configurable: false,
      enumerable: false,
      value: Object.freeze({ id: renderer, module: metadata?.module, target: "universal" })
    });
    return render;
  }
  function getComponentMetadata(component) {
    const metadata = component?.[UNIVERSAL_COMPONENT];
    if (metadata === undefined) {
      if (component?.[LAZY_COMPONENT] === true)
        return UNIVERSAL_LAZY_METADATA;
      throw new Error("Universal roots accept only compiler-defined universal components.");
    }
    return metadata;
  }
  function identityPathEqual(left, right) {
    if (left.length !== right.length)
      return false;
    for (let index = 0;index < left.length; index++) {
      if (!Object.is(left[index], right[index]))
        return false;
    }
    return true;
  }
  var OWNER_IDENTITY_NEGATIVE_ZERO = /* @__PURE__ */ Symbol("octane.universal.owner-identity.-0");
  function ownerIdentityMapKey(value) {
    return typeof value === "number" && Object.is(value, -0) ? OWNER_IDENTITY_NEGATIVE_ZERO : value;
  }
  function createOwnerIdentityIndex() {
    return { components: /* @__PURE__ */ new Map };
  }
  function readOwnerIdentity(index, component, identityPath, key) {
    let node = index.components.get(component);
    if (node === undefined)
      return;
    for (const segment of identityPath) {
      node = node.children.get(ownerIdentityMapKey(segment));
      if (node === undefined)
        return;
    }
    return node.values?.get(ownerIdentityMapKey(key));
  }
  function writeOwnerIdentity(index, component, identityPath, key, value) {
    const existing = index.components.get(component);
    let node;
    if (existing === undefined) {
      node = { children: /* @__PURE__ */ new Map, values: null };
      index.components.set(component, node);
    } else {
      node = existing;
    }
    for (const segment of identityPath) {
      const segmentKey = ownerIdentityMapKey(segment);
      let child = node.children.get(segmentKey);
      if (child === undefined) {
        child = { children: /* @__PURE__ */ new Map, values: null };
        node.children.set(segmentKey, child);
      }
      node = child;
    }
    node.values ??= /* @__PURE__ */ new Map;
    node.values.set(ownerIdentityMapKey(key), value);
  }
  function createOwnerRecord(root, component, parent, identityPath, key) {
    return {
      root,
      renderer: root.renderer,
      component,
      componentProps: null,
      parent,
      identityPath,
      key,
      id: NEXT_OWNER_ID++,
      rangeKey: /* @__PURE__ */ Symbol("octane.universal.owner-range"),
      hooks: /* @__PURE__ */ new Map,
      effectOrder: [],
      children: [],
      range: null,
      contextValues: null,
      updates: /* @__PURE__ */ new Map,
      isBoundary: false,
      canHandleSuspense: false,
      boundaryError: undefined,
      hasBoundaryError: false,
      boundaryThenable: null,
      visibility: "visible",
      mounted: false,
      disposed: false
    };
  }
  function draftOwner(record, parent, replayPath) {
    return {
      record,
      componentProps: record.componentProps,
      parent,
      replayPath,
      hooks: new Map(record.hooks),
      clonedHooks: /* @__PURE__ */ new Set,
      seenEffects: [],
      children: [],
      claimedChildren: /* @__PURE__ */ new Set,
      childOwnerBuckets: null,
      childClaimCursors: null,
      childReplayOrdinals: null,
      contextValues: record.contextValues === null ? null : new Map(record.contextValues),
      appliedUpdates: /* @__PURE__ */ new Map,
      needsRender: false,
      implicitSlot: 0,
      boundaryError: record.boundaryError,
      hasBoundaryError: record.hasBoundaryError,
      boundaryThenable: record.boundaryThenable,
      isBoundary: record.isBoundary,
      canHandleSuspense: record.canHandleSuspense,
      visibility: parent?.visibility ?? record.visibility
    };
  }
  function childReplayPath(parent, component, identityPath, key) {
    const ordinals = parent.childReplayOrdinals ??= createOwnerIdentityIndex();
    const ordinal = readOwnerIdentity(ordinals, component, identityPath, key) ?? 0;
    writeOwnerIdentity(ordinals, component, identityPath, key, ordinal + 1);
    return [...parent.replayPath, { component, identityPath, key, ordinal }];
  }
  function childOwnerBucket(parent, component, identityPath, key) {
    let buckets = parent.childOwnerBuckets;
    if (buckets === null) {
      buckets = createOwnerIdentityIndex();
      for (const child of parent.record.children) {
        let bucket = readOwnerIdentity(buckets, child.component, child.identityPath, child.key);
        if (bucket === undefined) {
          bucket = [];
          writeOwnerIdentity(buckets, child.component, child.identityPath, child.key, bucket);
        }
        bucket.push(child);
      }
      parent.childOwnerBuckets = buckets;
    }
    return readOwnerIdentity(buckets, component, identityPath, key);
  }
  function claimChildOwner(parent, component, identityPath, key) {
    const attempt = currentAttempt();
    let record;
    const bucket = childOwnerBucket(parent, component, identityPath, key);
    if (bucket !== undefined) {
      const cursors = parent.childClaimCursors ??= createOwnerIdentityIndex();
      let cursor = readOwnerIdentity(cursors, component, identityPath, key) ?? 0;
      while (cursor < bucket.length && parent.claimedChildren.has(bucket[cursor]))
        cursor++;
      record = bucket[cursor];
      writeOwnerIdentity(cursors, component, identityPath, key, cursor + (record === undefined ? 0 : 1));
    }
    record ??= createOwnerRecord(attempt.root, component, parent.record, identityPath, key);
    parent.claimedChildren.add(record);
    const draft = draftOwner(record, parent, childReplayPath(parent, component, identityPath, key));
    parent.children.push(draft);
    attempt.owners.push(draft);
    return draft;
  }
  function activateLazyLeafOwner() {
    const scope = CURRENT_LAZY_LEAF_OWNER;
    const attempt = CURRENT_ATTEMPT;
    if (scope === null || attempt !== scope.attempt || CURRENT_OWNER !== scope.parent && CURRENT_OWNER !== scope.owner) {
      return CURRENT_OWNER;
    }
    const owner = scope.owner ??= claimChildOwner(scope.parent, null, scope.identityPath, scope.key);
    owner.contextValues = null;
    CURRENT_OWNER = owner;
    attempt.owner = owner;
    return owner;
  }
  function readOwnerContext(owner, context, trackMemoRead = true) {
    let value;
    for (let current = owner;current !== null; current = current.parent) {
      if (current.contextValues?.has(context)) {
        value = current.contextValues.get(context);
        if (trackMemoRead)
          CURRENT_MEMO_CONTEXT_READS?.set(context, value);
        return value;
      }
    }
    if (currentAttempt().scope !== null) {
      for (let current = owner?.record.parent ?? null;current !== null; current = current.parent) {
        if (current.contextValues?.has(context)) {
          value = current.contextValues.get(context);
          if (trackMemoRead)
            CURRENT_MEMO_CONTEXT_READS?.set(context, value);
          return value;
        }
      }
    }
    value = currentAttempt().root.readBridgeContext(context);
    if (trackMemoRead)
      CURRENT_MEMO_CONTEXT_READS?.set(context, value);
    return value;
  }
  function executeOwner(owner, build, initialRenderCount = 0) {
    const attempt = currentAttempt();
    const warmPlanCheckpoint = ACTIVE_UNIVERSAL_WARM_PLANS.length;
    let output = [];
    for (let renderCount = initialRenderCount;; renderCount++) {
      ACTIVE_UNIVERSAL_WARM_PLANS.length = warmPlanCheckpoint;
      if (renderCount === 25)
        throw new Error("Too many universal render-phase updates.");
      if (renderCount > 0)
        resetDraftChildren(owner);
      owner.seenEffects = [];
      owner.children = [];
      owner.claimedChildren = /* @__PURE__ */ new Set;
      owner.childClaimCursors = null;
      owner.childReplayOrdinals = null;
      owner.needsRender = false;
      owner.implicitSlot = 0;
      const previousOwner = CURRENT_OWNER;
      const previousAttemptOwner = attempt.owner;
      CURRENT_OWNER = owner;
      attempt.owner = owner;
      const component = owner.record.component;
      if (component !== null)
        __profileTrackComponent(owner.record, component);
      const profileFrame = component === null ? null : __profileBeginRender(owner.record, component, owner.record.mounted);
      let didThrow = false;
      let thrown;
      try {
        output = build();
      } catch (error) {
        didThrow = true;
        thrown = error;
        throw error;
      } finally {
        __profileEndRender(profileFrame, didThrow, thrown);
        ACTIVE_UNIVERSAL_WARM_PLANS.length = warmPlanCheckpoint;
        CURRENT_OWNER = previousOwner;
        attempt.owner = previousAttemptOwner;
      }
      if (!owner.needsRender)
        return output;
    }
  }
  function renderLazyLeafItem(scope, render, item, index, key) {
    const previousScope = CURRENT_LAZY_LEAF_OWNER;
    const previousOwner = CURRENT_OWNER;
    const previousAttemptOwner = scope.attempt.owner;
    const warmPlanCheckpoint = ACTIVE_UNIVERSAL_WARM_PLANS.length;
    scope.key = key;
    scope.owner = null;
    CURRENT_LAZY_LEAF_OWNER = scope;
    let rendered;
    try {
      rendered = render(item, index);
      const owner = scope.owner;
      if (owner?.needsRender) {
        ACTIVE_UNIVERSAL_WARM_PLANS.length = warmPlanCheckpoint;
        executeOwner(owner, () => {
          rendered = render(item, index);
          return [];
        }, 1);
      }
      return rendered;
    } finally {
      ACTIVE_UNIVERSAL_WARM_PLANS.length = warmPlanCheckpoint;
      CURRENT_LAZY_LEAF_OWNER = previousScope;
      CURRENT_OWNER = previousOwner;
      scope.attempt.owner = previousAttemptOwner;
    }
  }
  function ownerRange(owner, children) {
    return [{ kind: "range", key: owner.record.rangeKey, owner: owner.record, children }];
  }
  function componentContext(renderer) {
    return {
      renderer,
      readContext: (context) => readOwnerContext(activateLazyLeafOwner(), context),
      insertionEffect: (create, deps) => enqueueUniversalEffect("insertion", create, deps),
      layoutEffect: (create, deps) => enqueueUniversalEffect("layout", create, deps),
      effect: (create, deps) => enqueueUniversalEffect("passive", create, deps)
    };
  }
  function materializeComponentValue(value, expectedRenderer, path) {
    if (value.renderer !== expectedRenderer) {
      throw new Error(`Universal renderer mismatch: owner ${JSON.stringify(expectedRenderer)} cannot materialize component descriptor ${JSON.stringify(value.renderer)}.`);
    }
    const metadata = getComponentMetadata(value.component);
    if (metadata !== UNIVERSAL_LAZY_METADATA && metadata.id !== expectedRenderer) {
      throw new Error(`Universal renderer mismatch: owner ${JSON.stringify(expectedRenderer)} cannot render nested component ${JSON.stringify(metadata.id)}.`);
    }
    const parent = CURRENT_OWNER;
    if (parent === null)
      throw new Error("A nested universal component requires an owner.");
    const normalized = normalizePropsValue(value.props);
    const owner = claimChildOwner(parent, value.component, path, value.hasKey ? value.key : null);
    const props = { ...normalized.props };
    owner.componentProps = props;
    const nodes = executeOwner(owner, () => {
      const rendered = value.component(props, componentContext(expectedRenderer));
      return materializeValue(rendered, expectedRenderer, null, [...path, "output"]);
    });
    return ownerRange(owner, nodes);
  }
  function materializeScoped(parent, path, key, build, contextValues = null) {
    const attempt = currentAttempt();
    const universalIdCheckpoint = attempt.nextUniversalId;
    const owner = claimChildOwner(parent, null, path, key);
    owner.contextValues = contextValues;
    try {
      const nodes = executeOwner(owner, () => materializeValue(build(), parent.record.renderer, null, [...path, "output"]));
      return ownerRange(owner, nodes);
    } catch (error) {
      attempt.nextUniversalId = universalIdCheckpoint;
      throw error;
    }
  }
  function disposeUncommittedDraft(owner) {
    for (const child of owner.children)
      disposeUncommittedDraft(child);
    if (!owner.record.mounted) {
      owner.record.disposed = true;
      owner.record.componentProps = null;
      owner.record.range = null;
      owner.record.updates.clear();
      for (const hook of owner.hooks.values()) {
        if (hook.kind === "effect-event")
          hook.cell.active = false;
      }
    }
  }
  function resetDraftChildren(owner) {
    for (const child of owner.children)
      disposeUncommittedDraft(child);
    owner.children = [];
    owner.claimedChildren = /* @__PURE__ */ new Set;
    owner.childClaimCursors = null;
    owner.childReplayOrdinals = null;
  }
  function retainCommittedOwnerTree(owner) {
    owner.hooks = new Map(owner.record.hooks);
    owner.seenEffects = [...owner.record.effectOrder];
    owner.contextValues = owner.record.contextValues === null ? null : new Map(owner.record.contextValues);
    owner.children = [];
    owner.claimedChildren = new Set(owner.record.children);
    owner.childClaimCursors = null;
    owner.childReplayOrdinals = null;
    for (const childRecord of owner.record.children) {
      const child = draftOwner(childRecord, owner, childReplayPath(owner, childRecord.component, childRecord.identityPath, childRecord.key));
      owner.children.push(child);
      currentAttempt().owners.push(child);
      retainCommittedOwnerTree(child);
    }
  }
  function findLogicalRange(record, key) {
    if (record.kind === "range" && Object.is(record.key, key))
      return record;
    for (const child of record.children) {
      const match = findLogicalRange(child, key);
      if (match !== null)
        return match;
    }
    return null;
  }
  function blueprintFromLogical(record) {
    if (record.kind === "range") {
      return {
        kind: "range",
        key: record.key,
        ...record.owner === null ? null : { owner: record.owner },
        children: record.children.map(blueprintFromLogical)
      };
    }
    if (record.kind === "portal") {
      markUniversalTreeFeature(UNIVERSAL_TREE_PORTAL);
      return {
        kind: "portal",
        key: record.key,
        target: null,
        registration: record.portalRegistration,
        children: record.children.map(blueprintFromLogical)
      };
    }
    if (record.events.size !== 0)
      markUniversalTreeFeature(UNIVERSAL_TREE_EVENT);
    if (record.lifecycles.size !== 0)
      markUniversalTreeFeature(UNIVERSAL_TREE_LIFECYCLE);
    if (record.localCallbacks.size !== 0) {
      markUniversalTreeFeature(UNIVERSAL_TREE_LOCAL_CALLBACK);
    }
    if (record.ref != null)
      markUniversalTreeFeature(UNIVERSAL_TREE_REF);
    if (record.visibility !== "visible")
      markUniversalTreeFeature(UNIVERSAL_TREE_HIDDEN);
    for (const value of Object.values(record.props)) {
      if (isRendererRegion(value))
        markUniversalTreeFeature(UNIVERSAL_TREE_REGION);
    }
    return {
      kind: "host",
      key: record.key,
      type: record.type,
      props: { ...record.props },
      ref: record.ref,
      owner: record.owner,
      events: new Map(record.events),
      lifecycles: new Map(record.lifecycles),
      localCallbacks: new Map(record.localCallbacks),
      visibility: record.visibility,
      children: record.children.map(blueprintFromLogical)
    };
  }
  function markDraftOwnerSuspenseHidden(owner) {
    owner.visibility = "suspense-hidden";
    for (const child of owner.children)
      markDraftOwnerSuspenseHidden(child);
  }
  function markBlueprintSuspenseHidden(nodes) {
    for (const node of nodes) {
      if (node.kind === "host") {
        node.visibility = "suspense-hidden";
        markUniversalTreeFeature(UNIVERSAL_TREE_HIDDEN);
      }
      markBlueprintSuspenseHidden(node.children);
    }
  }
  function retainCommittedTryArm(owner) {
    if (!owner.record.mounted)
      return null;
    const childRecord = owner.record.children.find((child2) => Object.is(child2.key, "try"));
    if (childRecord === undefined)
      return null;
    const range = findLogicalRange(owner.record.root.rootRecordForRetention(), childRecord.rangeKey);
    if (range === null)
      return null;
    resetDraftChildren(owner);
    const child = draftOwner(childRecord, owner, childReplayPath(owner, childRecord.component, childRecord.identityPath, childRecord.key));
    owner.children.push(child);
    owner.claimedChildren.add(childRecord);
    currentAttempt().owners.push(child);
    retainCommittedOwnerTree(child);
    markDraftOwnerSuspenseHidden(child);
    const nodes = ownerRange(child, range.children.map(blueprintFromLogical));
    markBlueprintSuspenseHidden(nodes);
    return nodes;
  }
  var OWNERLESS_LEAF_PLAN_CACHE = /* @__PURE__ */ new WeakMap;
  function ownerlessLeafHostPlan(plan) {
    const cached = OWNERLESS_LEAF_PLAN_CACHE.get(plan);
    if (cached !== undefined)
      return cached;
    const root = plan.root;
    let host = null;
    if (root.kind === "host" && root.type !== "#text" && root.propsSlot === undefined && (root.children?.length ?? 0) === 0) {
      const names = [
        ...Object.keys(root.props ?? {}),
        ...(root.bindings ?? []).map(([name]) => name)
      ];
      if (!names.some((name) => name === "key" || name === "ref" || name === "children")) {
        host = root;
      }
    }
    OWNERLESS_LEAF_PLAN_CACHE.set(plan, host);
    return host;
  }
  function materializeOwnerlessLeafValue(value, expectedRenderer, compilerLeafProps, owner = CURRENT_OWNER) {
    if (value?.$$kind !== UNIVERSAL_VALUE)
      return null;
    const planValue = value;
    if (planValue.plan.renderer !== expectedRenderer) {
      throw new Error(`Universal renderer mismatch: root expects ${JSON.stringify(expectedRenderer)} but the plan targets ${JSON.stringify(planValue.plan.renderer)}.`);
    }
    if (planValue.key !== null)
      return null;
    const node = ownerlessLeafHostPlan(planValue.plan);
    if (node === null)
      return null;
    const props = { ...node.props ?? {} };
    for (const [name, slot] of node.bindings ?? [])
      props[name] = planValue.values[slot];
    let events = null;
    let lifecycles = null;
    let localCallbacks = null;
    const attempt = currentAttempt();
    for (const name of Object.keys(props)) {
      const handler = props[name];
      if (compilerLeafProps) {
        if (isRendererRegion(handler))
          markUniversalTreeFeature(UNIVERSAL_TREE_REGION);
        props[name] = attempt.root.encodeHostProp(node.type, name, handler);
        continue;
      }
      const lifecycle = attempt.root.classifyLifecycle(name, handler);
      if (lifecycle !== null) {
        delete props[name];
        if (handler == null)
          continue;
        if (typeof handler !== "function") {
          throw new TypeError(`Universal lifecycle prop ${JSON.stringify(name)} for renderer ${JSON.stringify(expectedRenderer)} must be a function, null, or undefined.`);
        }
        (lifecycles ??= /* @__PURE__ */ new Map).set(lifecycle.type, {
          prop: name,
          type: lifecycle.type,
          handler,
          owner: owner.record
        });
        continue;
      }
      const local = attempt.root.classifyLocalCallback(name, handler);
      if (local !== null) {
        delete props[name];
        if (attempt.root.driverCapabilities().localHostCallbacks !== true) {
          throw new Error(`Universal renderer ${JSON.stringify(expectedRenderer)} does not declare the local-host-callback capability.`);
        }
        if (handler == null)
          continue;
        if (typeof handler !== "function") {
          throw new TypeError(`Universal local callback prop ${JSON.stringify(name)} for renderer ${JSON.stringify(expectedRenderer)} must be a function, null, or undefined.`);
        }
        (localCallbacks ??= /* @__PURE__ */ new Map).set(local.type, {
          prop: name,
          type: local.type,
          handler,
          owner: owner.record
        });
        continue;
      }
      const definition = attempt.root.classifyEvent(name);
      if (definition !== null) {
        delete props[name];
        if (handler == null)
          continue;
        if (typeof handler !== "function") {
          throw new TypeError(`Universal event prop ${JSON.stringify(name)} for renderer ${JSON.stringify(expectedRenderer)} must be a function, null, or undefined.`);
        }
        (events ??= /* @__PURE__ */ new Map).set(definition.type, {
          prop: name,
          type: definition.type,
          priority: definition.priority ?? "default",
          handler,
          owner: owner.record
        });
        continue;
      }
      if (isRendererRegion(handler))
        markUniversalTreeFeature(UNIVERSAL_TREE_REGION);
      props[name] = attempt.root.encodeHostProp(node.type, name, handler);
    }
    if (events !== null && events.size !== 0)
      markUniversalTreeFeature(UNIVERSAL_TREE_EVENT);
    if (lifecycles !== null && lifecycles.size !== 0)
      markUniversalTreeFeature(UNIVERSAL_TREE_LIFECYCLE);
    if (localCallbacks !== null && localCallbacks.size !== 0)
      markUniversalTreeFeature(UNIVERSAL_TREE_LOCAL_CALLBACK);
    if (owner.visibility !== "visible")
      markUniversalTreeFeature(UNIVERSAL_TREE_HIDDEN);
    return {
      kind: "host",
      key: null,
      type: node.type,
      props,
      ref: null,
      owner: owner.record,
      events: events ?? EMPTY_BLUEPRINT_EVENTS,
      lifecycles: lifecycles ?? EMPTY_BLUEPRINT_HOST_CALLBACKS,
      localCallbacks: localCallbacks ?? EMPTY_BLUEPRINT_HOST_CALLBACKS,
      visibility: owner.visibility,
      children: []
    };
  }
  function materializeValue(value, expectedRenderer, key, path) {
    if (value == null || value === false || value === true)
      return [];
    if (value?.$$kind === UNIVERSAL_KEYED) {
      const keyed = value;
      const nodes = materializeValue(keyed.value, expectedRenderer, keyed.key, [...path, keyed.key]);
      if (nodes.length === 1)
        nodes[0].key = keyed.key;
      else
        return [{ kind: "range", key: keyed.key, children: nodes }];
      return nodes;
    }
    if (value?.$$kind === UNIVERSAL_LIST) {
      const list = value;
      if (list.values.length === 0 && list.empty !== undefined) {
        return materializeValue(list.empty, expectedRenderer, null, [...path, "empty"]);
      }
      const output = [];
      for (let index = 0;index < list.values.length; index++) {
        const item = list.values[index];
        const itemKey = renderableKey(item);
        output.push(...materializeValue(item, expectedRenderer, itemKey, [...path, "item", itemKey ?? index]));
      }
      return output;
    }
    if (value?.$$kind === UNIVERSAL_VALUE) {
      const planValue = value;
      const nodes = materializePlanValue(planValue, expectedRenderer, path);
      if (key !== null && nodes.length === 1)
        nodes[0].key = key;
      return nodes;
    }
    if (value?.$$kind === UNIVERSAL_COMPONENT_VALUE) {
      const nodes = materializeComponentValue(value, expectedRenderer, path);
      if (key !== null && nodes.length === 1)
        nodes[0].key = key;
      return nodes;
    }
    if (value?.$$kind === UNIVERSAL_CHILDREN) {
      const children = value;
      if (children.renderer !== expectedRenderer) {
        throw new Error(`Universal renderer mismatch: owner ${JSON.stringify(expectedRenderer)} cannot render children for ${JSON.stringify(children.renderer)}.`);
      }
      return materializeValue(children.render(), expectedRenderer, key, [...path, "children"]);
    }
    if (value?.$$kind === UNIVERSAL_PORTAL) {
      const portal = value;
      markUniversalTreeFeature(UNIVERSAL_TREE_PORTAL);
      return [
        {
          kind: "portal",
          key,
          target: portal.target,
          registration: null,
          children: materializeValue(portal.children, expectedRenderer, null, [...path, "portal"])
        }
      ];
    }
    if (value?.$$kind === UNIVERSAL_ACTIVITY) {
      const activity = value;
      if (currentAttempt().root.driverCapabilities().visibility !== true) {
        throw new Error(`Universal renderer ${JSON.stringify(expectedRenderer)} does not declare the visibility capability.`);
      }
      const parent = CURRENT_OWNER;
      if (parent === null)
        throw new Error("Universal Activity requires an owning component.");
      const owner = claimChildOwner(parent, null, [...path, "activity"], null);
      owner.visibility = parent.visibility === "suspense-hidden" ? "suspense-hidden" : parent.visibility === "activity-hidden" || activity.mode === "hidden" ? "activity-hidden" : "visible";
      const nodes = executeOwner(owner, () => materializeValue(activity.body(), expectedRenderer, null, [...path, "activity-output"]));
      const range = ownerRange(owner, nodes);
      return key === null ? range : [{ kind: "range", key, children: range }];
    }
    if (value?.$$kind === UNIVERSAL_IF) {
      const branch = value;
      const body = branch.condition ? branch.then : branch.else;
      if (body === null)
        return [];
      return materializeScoped(CURRENT_OWNER, [...path, "if"], branch.condition ? 1 : 0, body);
    }
    if (value?.$$kind === UNIVERSAL_SWITCH) {
      const branch = value;
      let selected = branch.default;
      let selectedKey = "default";
      for (let index = 0;index < branch.cases.length; index++) {
        if (branch.cases[index][0] === branch.value) {
          selected = branch.cases[index][1];
          selectedKey = index;
          break;
        }
      }
      if (selected === null)
        return [];
      return materializeScoped(CURRENT_OWNER, [...path, "switch"], selectedKey, selected);
    }
    if (value?.$$kind === UNIVERSAL_FOR) {
      const list = value;
      const output = [];
      const keys = /* @__PURE__ */ new Set;
      const compilerLeafProps = list.ownerless && currentAttempt().root.driverCapabilities().compilerLeafProps === true;
      if (list.ownerless && list.compact && currentAttempt().root.canCompactCompilerLeafProps()) {
        const attempt2 = currentAttempt();
        const parent2 = CURRENT_OWNER;
        const lazyOwnerScope2 = {
          attempt: attempt2,
          parent: parent2,
          identityPath: [...path, "for"],
          key: 0,
          owner: null
        };
        const compactKeys = [];
        const compactValues = [];
        let compactOwners = null;
        let compactPlan = null;
        let compactHost = null;
        let compactIndex = 0;
        for (const item of list.items) {
          const itemIndex = compactIndex++;
          const itemKey = list.key(item, itemIndex);
          if (keys.has(itemKey)) {
            throw new Error(`Duplicate universal list key ${String(itemKey)}.`);
          }
          keys.add(itemKey);
          const rendered = renderLazyLeafItem(lazyOwnerScope2, list.render, item, itemIndex, itemKey);
          if (lazyOwnerScope2.owner !== null) {
            (compactOwners ??= [])[itemIndex] = lazyOwnerScope2.owner.record;
          }
          if (rendered?.$$kind !== UNIVERSAL_VALUE) {
            throw new Error("Compact universal lists require one compiler-proven intrinsic leaf host per item.");
          }
          const planValue = rendered;
          if (planValue.plan.renderer !== expectedRenderer) {
            throw new Error(`Universal renderer mismatch: root expects ${JSON.stringify(expectedRenderer)} but the plan targets ${JSON.stringify(planValue.plan.renderer)}.`);
          }
          if (compactPlan !== null && compactPlan !== planValue.plan) {
            throw new Error("Compact universal lists require one stable intrinsic leaf plan per item.");
          }
          const host = compactPlan === null ? ownerlessLeafHostPlan(planValue.plan) : compactHost;
          if (planValue.key !== null || host === null) {
            throw new Error("Compact universal lists require one stable intrinsic leaf plan per item.");
          }
          if (compactPlan === null) {
            compactPlan = planValue.plan;
            compactHost = host;
            if (host.props !== undefined) {
              for (const name of Object.keys(host.props)) {
                if (isRendererRegion(host.props[name])) {
                  markUniversalTreeFeature(UNIVERSAL_TREE_REGION);
                }
              }
            }
          }
          for (const [, slot] of host.bindings ?? []) {
            const binding = planValue.values[slot];
            if (typeof binding === "object" && binding !== null && isRendererRegion(binding)) {
              markUniversalTreeFeature(UNIVERSAL_TREE_REGION);
            }
          }
          compactKeys.push(itemKey);
          compactValues.push(planValue.values);
        }
        if (compactIndex === 0 && list.empty !== null) {
          return materializeScoped(CURRENT_OWNER, [...path, "for-empty"], null, list.empty);
        }
        const owner = parent2;
        if (compactIndex !== 0 && owner.visibility !== "visible") {
          markUniversalTreeFeature(UNIVERSAL_TREE_HIDDEN);
        }
        return [
          {
            kind: "range",
            key: null,
            children: [],
            compactLeafList: {
              host: compactHost,
              keys: compactKeys,
              values: compactValues,
              owner: owner.record,
              owners: compactOwners,
              visibility: owner.visibility,
              props: [],
              propCount: -1
            }
          }
        ];
      }
      const parent = CURRENT_OWNER;
      const attempt = currentAttempt();
      const lazyOwnerScope = compilerLeafProps ? {
        attempt,
        parent,
        identityPath: [...path, "for"],
        key: 0,
        owner: null
      } : null;
      let index = 0;
      for (const item of list.items) {
        const itemIndex = index++;
        const itemKey = list.key(item, itemIndex);
        if (keys.has(itemKey))
          throw new Error(`Duplicate universal list key ${String(itemKey)}.`);
        keys.add(itemKey);
        if (compilerLeafProps) {
          const rendered = renderLazyLeafItem(lazyOwnerScope, list.render, item, itemIndex, itemKey);
          const itemOwner = lazyOwnerScope.owner ?? parent;
          const leaf = materializeOwnerlessLeafValue(rendered, expectedRenderer, compilerLeafProps, itemOwner);
          if (leaf !== null) {
            leaf.key = itemKey;
            output.push(leaf);
            continue;
          }
          const previousOwner = CURRENT_OWNER;
          const previousAttemptOwner = attempt.owner;
          CURRENT_OWNER = itemOwner;
          attempt.owner = itemOwner;
          let nodes;
          try {
            nodes = materializeValue(rendered, expectedRenderer, null, [...path, "for", itemKey]);
          } finally {
            CURRENT_OWNER = previousOwner;
            attempt.owner = previousAttemptOwner;
          }
          if (nodes.length !== 1 || nodes[0].kind !== "host" || nodes[0].key !== null || nodes[0].children.length !== 0) {
            throw new Error("Ownerless universal lists require exactly one intrinsic leaf host per item.");
          }
          nodes[0].key = itemKey;
          output.push(nodes[0]);
        } else {
          output.push(...materializeScoped(parent, [...path, "for"], itemKey, () => list.render(item, itemIndex)));
        }
      }
      if (index === 0 && list.empty !== null) {
        return materializeScoped(CURRENT_OWNER, [...path, "for-empty"], null, list.empty);
      }
      return output;
    }
    if (value?.$$kind === UNIVERSAL_CONTEXT) {
      const provider = value;
      const parent = CURRENT_OWNER;
      const owner = claimChildOwner(parent, null, [...path, "context", provider.context], null);
      owner.contextValues = /* @__PURE__ */ new Map([[provider.context, provider.value]]);
      const nodes = executeOwner(owner, () => {
        const children = provider.children;
        const rendered = typeof children === "function" ? children() : children;
        return materializeValue(rendered, expectedRenderer, null, [...path, "context-output"]);
      });
      return ownerRange(owner, nodes);
    }
    if (value?.$$kind === UNIVERSAL_TRY) {
      const boundary = value;
      const parent = CURRENT_OWNER;
      const owner = claimChildOwner(parent, null, [...path, "try-boundary"], null);
      owner.isBoundary = true;
      owner.canHandleSuspense = boundary.pending !== null;
      let branch = boundary.body;
      let branchKey = "try";
      if (owner.boundaryThenable !== null) {
        if (boundary.pending === null)
          throw new UniversalSuspense(owner.boundaryThenable);
        const retained = retainCommittedTryArm(owner);
        if (retained !== null) {
          if (currentAttempt().root.driverCapabilities().visibility !== true) {
            throw new Error(`Universal renderer ${JSON.stringify(expectedRenderer)} does not declare the visibility capability required by retained Suspense.`);
          }
          const pending = materializeScoped(owner, [...path, "try-arm"], "pending", boundary.pending);
          return ownerRange(owner, [...retained, ...pending]);
        }
        branchKey = "pending";
        branch = boundary.pending;
      } else if (owner.hasBoundaryError) {
        if (boundary.catch === null)
          throw owner.boundaryError;
        const error = owner.boundaryError;
        branchKey = "catch";
        branch = () => boundary.catch(error, () => {
          owner.record.hasBoundaryError = false;
          owner.record.boundaryError = undefined;
          owner.record.root.schedule();
        });
      }
      try {
        const nodes = materializeScoped(owner, [...path, "try-arm"], branchKey, branch);
        return ownerRange(owner, nodes);
      } catch (error) {
        if (error instanceof UniversalSuspense) {
          const retained = retainCommittedTryArm(owner);
          if (retained !== null) {
            if (currentAttempt().transitionRender)
              throw error;
            if (boundary.pending === null)
              throw error;
            if (currentAttempt().root.driverCapabilities().visibility !== true) {
              throw new Error(`Universal renderer ${JSON.stringify(expectedRenderer)} does not declare the visibility capability required by retained Suspense.`);
            }
            currentAttempt().retryThenables.add(error.thenable);
            const pending = materializeScoped(owner, [...path, "try-arm"], "pending", boundary.pending);
            return ownerRange(owner, [...retained, ...pending]);
          }
          currentAttempt().retryThenables.add(error.thenable);
          resetDraftChildren(owner);
          if (boundary.pending === null)
            throw error;
          const nodes2 = materializeScoped(owner, [...path, "try-arm"], "pending", boundary.pending);
          return ownerRange(owner, nodes2);
        }
        if (boundary.catch === null || branchKey === "catch")
          throw error;
        resetDraftChildren(owner);
        owner.hasBoundaryError = true;
        owner.boundaryError = error;
        const nodes = materializeScoped(owner, [...path, "try-arm"], "catch", () => boundary.catch(error, () => {
          owner.record.hasBoundaryError = false;
          owner.record.boundaryError = undefined;
          owner.record.root.schedule();
        }));
        return ownerRange(owner, nodes);
      }
    }
    if (Array.isArray(value)) {
      const output = [];
      const keys = /* @__PURE__ */ new Set;
      for (let index = 0;index < value.length; index++) {
        const item = value[index];
        const itemKey = renderableKey(item);
        if (itemKey !== null) {
          if (keys.has(itemKey))
            throw new Error(`Duplicate universal child key ${String(itemKey)}.`);
          keys.add(itemKey);
        }
        output.push(...materializeValue(item, expectedRenderer, itemKey, [
          ...path,
          itemKey === null ? index : itemKey
        ]));
      }
      return output;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
      const text = currentAttempt().root.textPolicy();
      if (text === "ignore")
        return [];
      if (text === "reject") {
        throw new Error(`Universal renderer ${JSON.stringify(expectedRenderer)} rejects primitive text children.`);
      }
      return [
        {
          kind: "host",
          key,
          type: "#text",
          props: { value: String(value) },
          ref: null,
          owner: CURRENT_OWNER.record,
          events: /* @__PURE__ */ new Map,
          lifecycles: /* @__PURE__ */ new Map,
          localCallbacks: /* @__PURE__ */ new Map,
          visibility: CURRENT_OWNER.visibility,
          children: []
        }
      ];
    }
    throw new TypeError(`Unsupported universal dynamic child ${Object.prototype.toString.call(value)}.`);
  }
  function materializeNode(node, values, renderer, path) {
    if (node.kind === "slot")
      return materializeValue(values[node.slot], renderer, null, [...path, "slot", node.slot]);
    if (node.kind === "text") {
      const value = node.slot === undefined ? node.value ?? "" : values[node.slot];
      return materializeValue(value, renderer, null, [...path, "text"]);
    }
    if (node.kind === "range") {
      const children2 = [];
      for (let index = 0;index < node.children.length; index++) {
        children2.push(...materializeNode(node.children[index], values, renderer, [...path, "range", index]));
      }
      return [{ kind: "range", key: null, children: children2 }];
    }
    if (node.kind === "component") {
      const component = node.component ?? values[node.componentSlot];
      let props2 = node.propsSlot === undefined ? universalProps([]) : normalizePropsValue(values[node.propsSlot]);
      if (node.children !== undefined && node.children.length > 0) {
        const childPlan = universalPlan(renderer, {
          kind: "range",
          children: node.children
        });
        const children2 = universalChildren(renderer, () => universalValue(childPlan, values));
        props2 = universalProps([["spread", props2.props]], children2);
      }
      return materializeComponentValue(universalComponent(node.renderer, component, props2, node.keySlot === undefined ? NO_KEY : values[node.keySlot]), renderer, [...path, "component"]);
    }
    if (node.kind === "if") {
      const selected = values[node.conditionSlot] ? node.then : node.else;
      if (selected === undefined)
        return [];
      const owner = claimChildOwner(CURRENT_OWNER, null, [...path, "if"], values[node.conditionSlot] ? 1 : 0);
      return ownerRange(owner, executeOwner(owner, () => materializeNode(selected, values, renderer, [...path, "if-output"])));
    }
    if (node.kind === "switch") {
      let selected = node.default;
      let selectedKey = "default";
      for (let index = 0;index < node.cases.length; index++) {
        if (node.cases[index][0] === values[node.valueSlot]) {
          selected = node.cases[index][1];
          selectedKey = index;
          break;
        }
      }
      if (selected === undefined)
        return [];
      const owner = claimChildOwner(CURRENT_OWNER, null, [...path, "switch"], selectedKey);
      return ownerRange(owner, executeOwner(owner, () => materializeNode(selected, values, renderer, [...path, "switch-output"])));
    }
    if (node.type === "#text") {
      const text = currentAttempt().root.textPolicy();
      if (text === "ignore")
        return [];
      if (text === "reject") {
        throw new Error(`Universal renderer ${JSON.stringify(renderer)} rejects primitive text children.`);
      }
    }
    const props = { ...node.props ?? {} };
    for (const [name, slot] of node.bindings ?? [])
      props[name] = values[slot];
    let propsValue = null;
    if (node.propsSlot !== undefined) {
      propsValue = normalizePropsValue(values[node.propsSlot]);
      Object.assign(props, propsValue.props);
    }
    const hasKey = propsValue?.hasKey || Object.prototype.hasOwnProperty.call(props, "key");
    const hostKey = normalizeUniversalKey(propsValue?.hasKey ? propsValue.key : hasKey ? props.key : null);
    const ref = Object.prototype.hasOwnProperty.call(props, "ref") ? props.ref : null;
    const dynamicChildren = Object.prototype.hasOwnProperty.call(props, "children") ? props.children : undefined;
    delete props.ref;
    delete props.key;
    delete props.children;
    let events = null;
    let lifecycles = null;
    let localCallbacks = null;
    for (const name of Object.keys(props)) {
      const handler = props[name];
      const lifecycle = currentAttempt().root.classifyLifecycle(name, handler);
      if (lifecycle !== null) {
        delete props[name];
        if (handler == null)
          continue;
        if (typeof handler !== "function") {
          throw new TypeError(`Universal lifecycle prop ${JSON.stringify(name)} for renderer ${JSON.stringify(renderer)} must be a function, null, or undefined.`);
        }
        (lifecycles ??= /* @__PURE__ */ new Map).set(lifecycle.type, {
          prop: name,
          type: lifecycle.type,
          handler,
          owner: CURRENT_OWNER.record
        });
        continue;
      }
      const local = currentAttempt().root.classifyLocalCallback(name, handler);
      if (local !== null) {
        delete props[name];
        if (currentAttempt().root.driverCapabilities().localHostCallbacks !== true) {
          throw new Error(`Universal renderer ${JSON.stringify(renderer)} does not declare the local-host-callback capability.`);
        }
        if (handler == null)
          continue;
        if (typeof handler !== "function") {
          throw new TypeError(`Universal local callback prop ${JSON.stringify(name)} for renderer ${JSON.stringify(renderer)} must be a function, null, or undefined.`);
        }
        (localCallbacks ??= /* @__PURE__ */ new Map).set(local.type, {
          prop: name,
          type: local.type,
          handler,
          owner: CURRENT_OWNER.record
        });
        continue;
      }
      const definition = currentAttempt().root.classifyEvent(name);
      if (definition !== null) {
        delete props[name];
        if (handler == null)
          continue;
        if (typeof handler !== "function") {
          throw new TypeError(`Universal event prop ${JSON.stringify(name)} for renderer ${JSON.stringify(renderer)} must be a function, null, or undefined.`);
        }
        (events ??= /* @__PURE__ */ new Map).set(definition.type, {
          prop: name,
          type: definition.type,
          priority: definition.priority ?? "default",
          handler,
          owner: CURRENT_OWNER.record
        });
        continue;
      }
      if (isRendererRegion(handler))
        markUniversalTreeFeature(UNIVERSAL_TREE_REGION);
      props[name] = currentAttempt().root.encodeHostProp(node.type, name, handler);
    }
    if (events !== null && events.size !== 0)
      markUniversalTreeFeature(UNIVERSAL_TREE_EVENT);
    if (lifecycles !== null && lifecycles.size !== 0)
      markUniversalTreeFeature(UNIVERSAL_TREE_LIFECYCLE);
    if (localCallbacks !== null && localCallbacks.size !== 0)
      markUniversalTreeFeature(UNIVERSAL_TREE_LOCAL_CALLBACK);
    if (ref != null)
      markUniversalTreeFeature(UNIVERSAL_TREE_REF);
    if (CURRENT_OWNER.visibility !== "visible")
      markUniversalTreeFeature(UNIVERSAL_TREE_HIDDEN);
    const children = [];
    if ((node.children?.length ?? 0) > 0) {
      for (let index = 0;index < node.children.length; index++) {
        children.push(...materializeNode(node.children[index], values, renderer, [...path, "host", index]));
      }
    } else if (dynamicChildren !== undefined) {
      children.push(...materializeValue(dynamicChildren, renderer, null, [...path, "host-children"]));
    }
    return [
      {
        kind: "host",
        key: hostKey,
        type: node.type,
        props,
        ref,
        owner: CURRENT_OWNER.record,
        events: events ?? EMPTY_BLUEPRINT_EVENTS,
        lifecycles: lifecycles ?? EMPTY_BLUEPRINT_HOST_CALLBACKS,
        localCallbacks: localCallbacks ?? EMPTY_BLUEPRINT_HOST_CALLBACKS,
        visibility: CURRENT_OWNER.visibility,
        children
      }
    ];
  }
  function materializePlanValue(value, expectedRenderer, path = []) {
    if (value.plan.renderer !== expectedRenderer) {
      throw new Error(`Universal renderer mismatch: root expects ${JSON.stringify(expectedRenderer)} but the plan targets ${JSON.stringify(value.plan.renderer)}.`);
    }
    const nodes = materializeNode(value.plan.root, value.values, expectedRenderer, [...path, "plan"]);
    if (value.key === null)
      return nodes;
    if (nodes.length === 1) {
      nodes[0].key = value.key;
      return nodes;
    }
    return [{ kind: "range", key: value.key, children: nodes }];
  }
  function sameRecordShape(record, blueprint) {
    return record.kind === blueprint.kind && Object.is(record.key, blueprint.key) && (record.kind !== "host" || record.type === blueprint.type);
  }
  function createLogicalRecord(id, blueprint) {
    return {
      id,
      kind: blueprint.kind,
      key: blueprint.key,
      type: blueprint.kind === "host" ? blueprint.type : null,
      props: {},
      ref: null,
      refCleanup: null,
      refAttached: false,
      owner: null,
      events: EMPTY_COMMITTED_EVENTS,
      lifecycles: EMPTY_COMMITTED_HOST_CALLBACKS,
      localCallbacks: EMPTY_COMMITTED_HOST_CALLBACKS,
      visibility: blueprint.kind === "host" ? blueprint.visibility : "visible",
      portalRegistration: null,
      parent: null,
      children: []
    };
  }
  function shallowPropsEqual(left, right, rightCountHint = -1) {
    let leftCount = 0;
    for (const key in left) {
      if (!Object.prototype.hasOwnProperty.call(left, key))
        continue;
      leftCount++;
      if (!Object.prototype.hasOwnProperty.call(right, key) || !Object.is(left[key], right[key])) {
        return false;
      }
    }
    if (rightCountHint >= 0)
      return leftCount === rightCountHint;
    let rightCount = 0;
    for (const key in right) {
      if (Object.prototype.hasOwnProperty.call(right, key))
        rightCount++;
    }
    return leftCount === rightCount;
  }
  function physicalRecords(records) {
    const output = [];
    for (const record of records) {
      if (record.kind === "host")
        output.push(record);
      else if (record.kind === "range")
        output.push(...physicalRecords(record.children));
    }
    return output;
  }
  function physicalDrafts(records) {
    const output = [];
    for (const record of records) {
      if (record.record.kind === "host")
        output.push(record);
      else if (record.record.kind === "range")
        output.push(...physicalDrafts(record.children));
    }
    return output;
  }
  function walkLogical(record, visit) {
    visit(record);
    for (const child of record.children)
      walkLogical(child, visit);
  }
  function walkDraft(record, visit) {
    visit(record);
    for (const child of record.children)
      walkDraft(child, visit);
  }
  function walkDraftPostOrder(record, visit) {
    for (const child of record.children)
      walkDraftPostOrder(child, visit);
    visit(record);
  }
  function logicalTreeFeatures(record) {
    let features = 0;
    walkLogical(record, (current) => {
      if (current.kind === "portal") {
        features |= UNIVERSAL_TREE_PORTAL;
        return;
      }
      if (current.kind !== "host")
        return;
      if (current.events.size !== 0)
        features |= UNIVERSAL_TREE_EVENT;
      if (current.lifecycles.size !== 0)
        features |= UNIVERSAL_TREE_LIFECYCLE;
      if (current.localCallbacks.size !== 0)
        features |= UNIVERSAL_TREE_LOCAL_CALLBACK;
      if (current.ref != null)
        features |= UNIVERSAL_TREE_REF;
      if (current.visibility !== "visible")
        features |= UNIVERSAL_TREE_HIDDEN;
      for (const value of Object.values(current.props)) {
        if (isRendererRegion(value)) {
          features |= UNIVERSAL_TREE_REGION;
          break;
        }
      }
    });
    return features;
  }
  function ownerTreeHasWarmPlan(owner) {
    if (owner.component?.__warm !== undefined)
      return true;
    for (const child of owner.children) {
      if (ownerTreeHasWarmPlan(child))
        return true;
    }
    return false;
  }
  function commonOwnerAncestor(left, right) {
    let leftDepth = 0;
    for (let current = left.parent;current !== null; current = current.parent)
      leftDepth++;
    let rightDepth = 0;
    for (let current = right.parent;current !== null; current = current.parent)
      rightDepth++;
    let a = left;
    let b = right;
    for (;leftDepth > rightDepth; leftDepth--)
      a = a.parent;
    for (;rightDepth > leftDepth; rightDepth--)
      b = b.parent;
    while (a !== null && a !== b) {
      a = a.parent;
      b = b.parent;
    }
    return a;
  }
  function stableLogicalChildren(records, blueprints) {
    if (records.length !== blueprints.length)
      return false;
    for (let index = 0;index < records.length; index++) {
      const record = records[index];
      const blueprint = blueprints[index];
      if (blueprint.kind === "range" && blueprint.compactLeafList !== undefined || !sameRecordShape(record, blueprint) || !stableLogicalChildren(record.children, blueprint.children)) {
        return false;
      }
    }
    return true;
  }
  function collectRemovedPostOrder(record, output) {
    for (const child of record.children)
      collectRemovedPostOrder(child, output);
    if (record.kind === "host")
      output.push(record);
  }
  function detachRef(record, ref = record.ref, refCleanup = record.refCleanup) {
    if (ref == null || !record.refAttached)
      return;
    record.refAttached = false;
    if (refCleanup !== null) {
      if (record.refCleanup === refCleanup)
        record.refCleanup = null;
      refCleanup();
      return;
    }
    const tasks = [];
    const collect = (value) => {
      if (Array.isArray(value)) {
        for (const nested of value)
          collect(nested);
      } else if (typeof value === "function") {
        tasks.push(() => value(null));
      } else if (value !== null && typeof value === "object") {
        tasks.push(() => {
          value.current = null;
        });
      }
    };
    collect(ref);
    runCommitTasks(tasks);
  }
  function attachRef(record, value) {
    const ref = record.ref;
    if (ref == null)
      return;
    record.refAttached = true;
    const cleanupTasks = [];
    const attachTasks = [];
    const collect = (target) => {
      if (Array.isArray(target)) {
        for (const nested of target)
          collect(nested);
      } else if (typeof target === "function") {
        attachTasks.push(() => {
          const cleanupIndex = cleanupTasks.length;
          cleanupTasks.push(() => target(null));
          const cleanup = target(value);
          if (typeof cleanup === "function")
            cleanupTasks[cleanupIndex] = cleanup;
        });
      } else if (target !== null && typeof target === "object") {
        attachTasks.push(() => {
          target.current = value;
          cleanupTasks.push(() => {
            target.current = null;
          });
        });
      }
    };
    collect(ref);
    record.refCleanup = () => runCommitTasks(cleanupTasks);
    runCommitTasks(attachTasks);
  }
  function runCommitTasks(tasks) {
    let hasError = false;
    let firstError;
    UNIVERSAL_COMMIT_TASK_DEPTH++;
    try {
      for (const task of tasks) {
        try {
          task();
        } catch (error) {
          if (!hasError) {
            hasError = true;
            firstError = error;
          }
        }
      }
    } finally {
      UNIVERSAL_COMMIT_TASK_DEPTH--;
    }
    if (hasError)
      throw firstError;
  }
  function depsEqual(left, right) {
    if (left === null || right === null || left.length !== right.length)
      return false;
    for (let index = 0;index < left.length; index++) {
      if (!Object.is(left[index], right[index]))
        return false;
    }
    return true;
  }
  function suspendedOwnerPathEqual(left, right) {
    if (left.length !== right.length)
      return false;
    for (let index = 0;index < left.length; index++) {
      const leftSegment = left[index];
      const rightSegment = right[index];
      if (leftSegment.component !== rightSegment.component || !Object.is(leftSegment.key, rightSegment.key) || leftSegment.ordinal !== rightSegment.ordinal || !identityPathEqual(leftSegment.identityPath, rightSegment.identityPath)) {
        return false;
      }
    }
    return true;
  }
  function isThenable(value) {
    return value !== null && typeof value === "object" && typeof value.then === "function" || typeof value === "function" && typeof value.then === "function";
  }
  function findSuspendedMemo(owner, slot, deps) {
    if (deps === null)
      return null;
    for (const entry of currentAttempt().replayEntries) {
      if (Object.is(entry.slot, slot) && depsEqual(entry.deps, deps) && suspendedOwnerPathEqual(entry.ownerPath, owner.replayPath)) {
        return entry;
      }
    }
    return null;
  }
  function collectSuspendedMemos(attempt) {
    const entries = [];
    for (let ownerIndex = attempt.owners.length - 1;ownerIndex >= 0; ownerIndex--) {
      const owner = attempt.owners[ownerIndex];
      for (const [slot, hook] of owner.hooks) {
        if (hook.kind !== "memo" || hook.deps === null || !isThenable(hook.value) || owner.record.hooks.get(slot) === hook) {
          continue;
        }
        if (entries.some((entry) => Object.is(entry.slot, slot) && suspendedOwnerPathEqual(entry.ownerPath, owner.replayPath))) {
          continue;
        }
        entries.push({
          ownerPath: owner.replayPath,
          slot,
          deps: hook.deps,
          value: hook.value
        });
      }
    }
    return entries;
  }
  function currentAttempt() {
    if (CURRENT_ATTEMPT === null) {
      throw new Error("Universal hooks may only run while a universal component is rendering.");
    }
    return CURRENT_ATTEMPT;
  }
  function markUniversalTreeFeature(feature) {
    currentAttempt().treeFeatures |= feature;
  }
  function resolveHookSlot(slot) {
    currentAttempt();
    const owner = activateLazyLeafOwner();
    if (owner === null) {
      throw new Error("Universal hooks require an active component owner.");
    }
    const own = slot ?? `implicit:${owner.implicitSlot++}`;
    if (UNIVERSAL_SLOT_STACK.length === 0)
      return own;
    let key = "@octane:universal-hook:";
    for (const part of [...UNIVERSAL_SLOT_STACK, own]) {
      const value = typeof part === "symbol" ? `s${part.description?.length ?? 0}:${part.description ?? ""}` : `v${String(part).length}:${String(part)}`;
      key += value;
    }
    return Symbol.for(key);
  }
  function hookSlots(count) {
    const base = NEXT_HOOK_SLOT;
    NEXT_HOOK_SLOT += count;
    return base;
  }
  function withSlot(slot, fn, ...args) {
    UNIVERSAL_SLOT_STACK.push(slot);
    try {
      return fn(...args);
    } finally {
      UNIVERSAL_SLOT_STACK.pop();
    }
  }
  function tickUniversalTransitionCount(delta) {
    UNIVERSAL_TRANSITION_PENDING_COUNT += delta;
    if (UNIVERSAL_TRANSITION_PENDING_COUNT < 0)
      UNIVERSAL_TRANSITION_PENDING_COUNT = 0;
    UNIVERSAL_DISCRETE_EVENT_DEPTH++;
    try {
      for (const listener of [...UNIVERSAL_TRANSITION_LISTENERS])
        listener();
    } finally {
      UNIVERSAL_DISCRETE_EVENT_DEPTH--;
    }
  }
  function settleUniversalTransitionBatch(batch) {
    if (batch.settled)
      return;
    batch.settled = true;
    if (ACTIVE_UNIVERSAL_TRANSITION_BATCH === batch)
      ACTIVE_UNIVERSAL_TRANSITION_BATCH = null;
    if (IN_FLIGHT_UNIVERSAL_TRANSITION_BATCH === batch) {
      IN_FLIGHT_UNIVERSAL_TRANSITION_BATCH = null;
    }
    tickUniversalTransitionCount(-batch.pendingSignals);
  }
  function finishUniversalTransitionRoot(batch, root) {
    if (batch.settled)
      return;
    const rehomePromotion = !batch.promoted && batch.promotionScheduled;
    root.discardTransitionBatch(batch);
    batch.roots.delete(root);
    if (batch.closed && batch.pendingActions === 0 && batch.roots.size === 0) {
      settleUniversalTransitionBatch(batch);
    } else if (rehomePromotion) {
      batch.promotionScheduled = false;
      queueUniversalTransitionPromotion(batch);
    }
  }
  function promoteUniversalTransitionBatch(batch) {
    if (batch.promoted || batch.settled || !batch.closed || batch.pendingActions !== 0)
      return;
    batch.promoted = true;
    const scheduledRoots = /* @__PURE__ */ new Set;
    for (const [owner, bySlot] of batch.updates) {
      if (owner.disposed)
        continue;
      let hasUpdates = false;
      for (const slot of bySlot.keys()) {
        const queue = owner.updates.get(slot);
        if (queue?.batches?.some((queuedBatch) => queuedBatch === batch)) {
          hasUpdates = true;
          break;
        }
      }
      if (!hasUpdates)
        continue;
      if (!scheduledRoots.has(owner.root)) {
        scheduledRoots.add(owner.root);
        owner.root.scheduleTransition(batch);
      }
    }
    batch.updates.clear();
    for (const root of [...batch.roots]) {
      if (!scheduledRoots.has(root))
        finishUniversalTransitionRoot(batch, root);
    }
    if (batch.roots.size === 0)
      settleUniversalTransitionBatch(batch);
  }
  function queueUniversalTransitionPromotion(batch) {
    if (batch.promotionScheduled || batch.promoted || batch.settled || !batch.closed || batch.pendingActions !== 0) {
      return;
    }
    batch.promotionScheduled = true;
    const firstOwner = batch.updates.keys().next().value;
    const promote = () => {
      batch.promotionScheduled = false;
      promoteUniversalTransitionBatch(batch);
    };
    if (firstOwner !== undefined && !firstOwner.disposed) {
      firstOwner.root.__scheduleMicrotask(promote);
      return;
    }
    const scheduler = readGlobalMicrotaskScheduler();
    if (scheduler !== undefined)
      scheduler.call(globalThis, promote);
    else
      Promise.resolve().then(promote);
  }
  function universalTransitionBatchForUpdate() {
    if (UNIVERSAL_TRANSITION_DEPTH > 0)
      return ACTIVE_UNIVERSAL_TRANSITION_BATCH;
    if (UNIVERSAL_DISCRETE_EVENT_DEPTH > 0)
      return null;
    if (UNIVERSAL_ASYNC_TRANSITION_COUNT > 0)
      return IN_FLIGHT_UNIVERSAL_TRANSITION_BATCH;
    return null;
  }
  function stageUniversalTransitionUpdate(batch, owner, slot, kind, value) {
    enqueueUniversalHookUpdate(owner, slot, kind, value, batch);
    batch.roots.add(owner.root);
    let bySlot = batch.updates.get(owner);
    if (bySlot === undefined) {
      bySlot = /* @__PURE__ */ new Map;
      batch.updates.set(owner, bySlot);
    }
    let update = bySlot.get(slot);
    if (update === undefined) {
      update = { kind };
      bySlot.set(slot, update);
    } else if (update.kind !== kind) {
      throw new Error("A universal transition cannot stage incompatible hook updates.");
    }
  }
  function enqueueUniversalHookUpdate(owner, slot, kind, value, batch) {
    let queue = owner.updates.get(slot);
    if (queue === undefined) {
      const hook = owner.hooks.get(slot);
      if (hook?.kind !== kind) {
        throw new Error(`Cannot queue a universal ${kind} update for an inactive hook.`);
      }
      queue = [];
      owner.updates.set(slot, queue);
      if (batch !== null) {
        queue.kind = kind;
        queue.baseState = hook.value;
        queue.batches = [];
      }
    } else if (queue.kind !== undefined && queue.kind !== kind) {
      throw new Error("A universal hook cannot queue incompatible update kinds.");
    }
    if (batch !== null && queue.batches === undefined) {
      const hook = owner.hooks.get(slot);
      if (hook?.kind !== kind) {
        throw new Error(`Cannot queue a universal ${kind} update for an inactive hook.`);
      }
      queue.kind = kind;
      queue.baseState = hook.value;
      queue.batches = new Array(queue.length).fill(null);
    }
    queue.push(value);
    queue.batches?.push(batch);
    queue.rebases?.push(false);
  }
  function scheduleOwner(owner, slot) {
    if (owner.disposed)
      return;
    __profileSchedule(owner, "state", typeof slot === "symbol" || typeof slot === "number" ? slot : undefined);
    owner.root.scheduleOwned(owner);
  }
  function currentDraftOwner() {
    currentAttempt();
    const owner = activateLazyLeafOwner();
    if (owner === null) {
      throw new Error("Universal hooks require an active component owner.");
    }
    return owner;
  }
  function findDraftOwner(record) {
    const attempt = CURRENT_ATTEMPT;
    if (attempt === null)
      return null;
    for (let index = attempt.owners.length - 1;index >= 0; index--) {
      if (attempt.owners[index].record === record)
        return attempt.owners[index];
    }
    return null;
  }
  function applyUniversalHookUpdateQueue(owner, slot, kind, fallback, apply) {
    const queue = owner.record.updates.get(slot);
    if (queue === undefined)
      return fallback;
    if (queue.kind !== undefined && queue.kind !== kind) {
      throw new Error("A universal hook encountered an incompatible queued update kind.");
    }
    const consumed = queue.length;
    const batches = queue.batches;
    let value = batches === undefined ? fallback : queue.baseState;
    if (batches === undefined) {
      for (let index = 0;index < consumed; index++)
        value = apply(value, queue[index]);
      owner.appliedUpdates.set(slot, {
        lane: false,
        queue,
        consumed,
        baseState: value
      });
      return value;
    }
    let baseState = value;
    let skipped = false;
    const remainingValues = [];
    const remainingBatches = [];
    const remainingRebases = [];
    const attempt = currentAttempt();
    for (let index = 0;index < consumed; index++) {
      const update = queue[index];
      const batch = batches[index];
      const included = batch === null || attempt.transitionRender && attempt.transitionBatches.has(batch);
      if (!included) {
        if (!skipped) {
          skipped = true;
          baseState = value;
        }
        remainingValues.push(update);
        remainingBatches.push(batch);
        remainingRebases.push(queue.rebases?.[index] ?? false);
        continue;
      }
      value = apply(value, update);
      if (skipped) {
        remainingValues.push(update);
        remainingBatches.push(null);
        remainingRebases.push(true);
      }
    }
    owner.appliedUpdates.set(slot, {
      lane: true,
      queue,
      consumed,
      baseState: skipped ? baseState : value,
      remainingValues,
      remainingBatches,
      remainingRebases
    });
    return value;
  }
  function cloneStateHook(owner, slot) {
    let hook = owner.hooks.get(slot);
    if (hook?.kind !== "state")
      return;
    if (!owner.clonedHooks.has(slot)) {
      hook = { ...hook };
      owner.hooks.set(slot, hook);
      owner.clonedHooks.add(slot);
      hook.value = applyUniversalHookUpdateQueue(owner, slot, "state", hook.value, (value, update) => typeof update === "function" ? update(value) : update);
    }
    return hook;
  }
  function projectedStateValue(record, slot, fallback) {
    const draft = findDraftOwner(record);
    const draftHook = draft?.hooks.get(slot);
    if (draftHook?.kind === "state")
      return draftHook.value;
    const hook = record.hooks.get(slot);
    const queue = record.updates.get(slot);
    if (queue === undefined)
      return hook?.kind === "state" ? hook.value : fallback;
    let value = queue.batches === undefined ? hook?.kind === "state" ? hook.value : fallback : queue.baseState;
    for (const update of queue) {
      value = typeof update === "function" ? update(value) : update;
    }
    return value;
  }
  function visibleStateValue(record, slot, fallback) {
    const draft = findDraftOwner(record);
    const draftHook = draft?.hooks.get(slot);
    if (draftHook?.kind === "state")
      return draftHook.value;
    const hook = record.hooks.get(slot);
    const queue = record.updates.get(slot);
    if (queue === undefined)
      return hook?.kind === "state" ? hook.value : fallback;
    let value = queue.batches === undefined ? hook?.kind === "state" ? hook.value : fallback : queue.baseState;
    for (let index = 0;index < queue.length; index++) {
      if (queue.batches !== undefined && queue.batches[index] !== null)
        continue;
      const update = queue[index];
      value = typeof update === "function" ? update(value) : update;
    }
    return value;
  }
  function useState(initial, slot) {
    const owner = currentDraftOwner();
    const resolved = resolveHookSlot(slot);
    let hook = cloneStateHook(owner, resolved);
    if (hook?.kind !== "state") {
      const record = owner.record;
      const initialValue = typeof initial === "function" ? initial() : initial;
      hook = {
        kind: "state",
        value: initialValue,
        set(value) {
          if (record.disposed)
            return;
          const draft = findDraftOwner(record);
          if (draft !== null) {
            const live = cloneStateHook(draft, resolved);
            if (live === undefined)
              return;
            const next2 = typeof value === "function" ? value(live.value) : value;
            if (Object.is(next2, live.value))
              return;
            live.value = next2;
            draft.needsRender = true;
            return;
          }
          const transition = universalTransitionBatchForUpdate();
          const previous = transition === null ? visibleStateValue(record, resolved, initialValue) : projectedStateValue(record, resolved, initialValue);
          const next = typeof value === "function" ? value(previous) : value;
          const queue = record.updates.get(resolved);
          const needsUrgentRebase = transition === null && queue?.batches?.some((batch) => batch !== null) === true;
          if (Object.is(next, previous) && !needsUrgentRebase)
            return;
          if (transition !== null) {
            stageUniversalTransitionUpdate(transition, record, resolved, "state", value);
            return;
          }
          enqueueUniversalHookUpdate(record, resolved, "state", value, null);
          scheduleOwner(record, resolved);
        },
        get() {
          return projectedStateValue(record, resolved, initialValue);
        }
      };
      owner.hooks.set(resolved, hook);
      owner.clonedHooks.add(resolved);
    }
    return [hook.value, hook.set, hook.get];
  }
  function enqueueUniversalEffect(phase, create, deps, slot) {
    const owner = currentDraftOwner();
    const resolved = resolveHookSlot(slot);
    const previous = owner.record.hooks.get(resolved);
    const hook = {
      kind: "effect",
      owner: owner.record,
      slot: resolved,
      phase,
      create,
      deps: deps === undefined ? null : deps,
      cleanup: previous?.kind === "effect" ? previous.cleanup : null,
      mounted: previous?.kind === "effect" ? previous.mounted : false,
      previous: previous?.kind === "effect" ? previous : null
    };
    owner.hooks.set(resolved, hook);
    owner.clonedHooks.add(resolved);
    owner.seenEffects.push(hook);
  }
  function useLayoutEffect(create, deps, slot) {
    enqueueUniversalEffect("layout", create, deps, slot);
  }
  function useEffect(create, deps, slot) {
    enqueueUniversalEffect("passive", create, deps, slot);
  }
  function useMemo(compute, deps, slot) {
    const owner = currentDraftOwner();
    const resolved = resolveHookSlot(slot);
    const previous = owner.hooks.get(resolved);
    const normalized = deps === undefined ? null : deps;
    if (previous?.kind === "memo" && depsEqual(previous.deps, normalized))
      return previous.value;
    const replayed = findSuspendedMemo(owner, resolved, normalized);
    if (replayed !== null) {
      const value2 = replayed.value;
      owner.hooks.set(resolved, { kind: "memo", value: value2, deps: normalized });
      owner.clonedHooks.add(resolved);
      return value2;
    }
    const warmed = takeUniversalWarmValue(owner.record.root, resolved, normalized);
    const value = warmed === NO_WARM_VALUE ? compute(...normalized ?? []) : warmed;
    owner.hooks.set(resolved, { kind: "memo", value, deps: normalized });
    owner.clonedHooks.add(resolved);
    return value;
  }
  function useRef(initial, slot) {
    const owner = currentDraftOwner();
    const resolved = resolveHookSlot(slot);
    let hook = owner.hooks.get(resolved);
    if (hook?.kind !== "ref") {
      const record = owner.record;
      const value = {};
      Object.defineProperty(value, "current", {
        enumerable: true,
        get() {
          const draft = findDraftOwner(record);
          const live = draft?.hooks.get(resolved) ?? record.hooks.get(resolved);
          return live?.kind === "ref" ? live.current : initial;
        },
        set(next) {
          const draft = findDraftOwner(record);
          if (draft !== null) {
            let live2 = draft.hooks.get(resolved);
            if (live2?.kind !== "ref")
              return;
            if (!draft.clonedHooks.has(resolved)) {
              live2 = { ...live2 };
              draft.hooks.set(resolved, live2);
              draft.clonedHooks.add(resolved);
            }
            live2.current = next;
            return;
          }
          const live = record.hooks.get(resolved);
          if (live?.kind === "ref")
            live.current = next;
        }
      });
      hook = { kind: "ref", current: initial, value };
      owner.hooks.set(resolved, hook);
      owner.clonedHooks.add(resolved);
    }
    return hook.value;
  }
  var UNIVERSAL_FORM_STATUS = Object.freeze({
    pending: false,
    data: null,
    method: null,
    action: null
  });
  var UNIVERSAL_WARM_CACHES = /* @__PURE__ */ new WeakMap;
  var CURRENT_UNIVERSAL_WARM = null;
  var CURRENT_UNIVERSAL_WARM_CLAIMS = null;
  var ACTIVE_UNIVERSAL_WARM_PLANS = [];
  var NO_WARM_VALUE = /* @__PURE__ */ Symbol("octane.universal.no-warm-value");
  function takeUniversalWarmValue(root, slot, deps) {
    if (deps === null)
      return NO_WARM_VALUE;
    const cache = UNIVERSAL_WARM_CACHES.get(root);
    const entries = cache?.get(slot);
    if (entries === undefined)
      return NO_WARM_VALUE;
    for (let index = 0;index < entries.length; index++) {
      if (!depsEqual(entries[index].deps, deps))
        continue;
      if (!entries[index].available)
        continue;
      entries[index].available = false;
      return entries[index].value;
    }
    return NO_WARM_VALUE;
  }
  function useEffectEvent(fn, slot) {
    const owner = currentDraftOwner();
    const resolved = resolveHookSlot(slot);
    let hook = owner.hooks.get(resolved);
    if (hook?.kind !== "effect-event") {
      const cell = { impl: fn, active: false };
      const value = (...args) => {
        if (!cell.active)
          throw new Error("A universal Effect Event cannot run before commit.");
        return cell.impl(...args);
      };
      hook = { kind: "effect-event", cell, next: fn, value };
    } else {
      hook = { ...hook, next: fn };
    }
    owner.hooks.set(resolved, hook);
    owner.clonedHooks.add(resolved);
    return hook.value;
  }
  function universalShallowEqual(previous, next) {
    if (Object.is(previous, next))
      return true;
    if (previous === null || next === null || typeof previous !== "object" || typeof next !== "object") {
      return false;
    }
    const previousKeys = Object.keys(previous);
    const nextKeys = Object.keys(next);
    if (previousKeys.length !== nextKeys.length)
      return false;
    for (const key of previousKeys) {
      if (!Object.prototype.hasOwnProperty.call(next, key) || !Object.is(previous[key], next[key])) {
        return false;
      }
    }
    return true;
  }
  function createPortal(children, target) {
    return Object.freeze({ $$kind: UNIVERSAL_PORTAL, children, target });
  }
  function runEffectCreate(hook) {
    const cleanup = hook.create(...hook.deps ?? []);
    hook.cleanup = typeof cleanup === "function" ? cleanup : null;
    hook.mounted = true;
  }
  function runEffectCleanup(hook) {
    const cleanup = hook.cleanup;
    hook.cleanup = null;
    hook.mounted = false;
    cleanup?.();
  }
  function routeUniversalOwnerError(owner, error) {
    for (let current = owner.parent;current !== null; current = current.parent) {
      if (!current.isBoundary || current.disposed)
        continue;
      current.boundaryThenable = null;
      current.boundaryError = error;
      current.hasBoundaryError = true;
      current.root.schedule();
      return true;
    }
    return false;
  }
  function routeUniversalOwnerSuspense(owner, thenable) {
    for (let current = owner.parent;current !== null; current = current.parent) {
      if (!current.isBoundary || !current.canHandleSuspense || current.disposed)
        continue;
      current.boundaryThenable = thenable;
      current.boundaryError = undefined;
      current.hasBoundaryError = false;
      const settle = () => {
        if (current.disposed || current.boundaryThenable !== thenable)
          return;
        current.boundaryThenable = null;
        current.root.schedule();
      };
      thenable.then(settle, settle);
      current.root.schedule();
      return true;
    }
    return false;
  }
  function runOwnedEffectCreate(hook) {
    try {
      runEffectCreate(hook);
    } catch (error) {
      if (!routeUniversalOwnerError(hook.owner, error))
        throw error;
    }
  }
  function runOwnedEffectCleanup(hook) {
    try {
      runEffectCleanup(hook);
    } catch (error) {
      if (!routeUniversalOwnerError(hook.owner, error))
        throw error;
    }
  }
  function runOwnedCommit(owner, work) {
    try {
      work();
    } catch (error) {
      if (owner === null || !routeUniversalOwnerError(owner, error))
        throw error;
    }
  }
  function cloneSerializableValue(value, seen = /* @__PURE__ */ new WeakSet) {
    if (value === null || value === undefined || typeof value === "string" || typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
      return value;
    }
    if (typeof value !== "object") {
      throw new TypeError(`Unsupported serializable host value ${String(value)}.`);
    }
    if (value.$$kind === "octane.universal.resource") {
      throw new TypeError("A resource handle must use the resource encoding branch.");
    }
    if (seen.has(value))
      throw new TypeError("Serializable host values cannot contain cycles.");
    seen.add(value);
    try {
      if (Array.isArray(value)) {
        return Object.freeze(value.map((entry) => cloneSerializableValue(entry, seen)));
      }
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(`Serializable host values require plain objects, received ${Object.prototype.toString.call(value)}.`);
      }
      const output = {};
      for (const [name, entry] of Object.entries(value)) {
        Object.defineProperty(output, name, {
          configurable: true,
          enumerable: true,
          value: cloneSerializableValue(entry, seen),
          writable: true
        });
      }
      return Object.freeze(output);
    } finally {
      seen.delete(value);
    }
  }
  function freezeUniversalHostBatch(renderer, version, commands) {
    for (const command of commands) {
      if ((command.op === "event" || command.op === "lifecycle" || command.op === "local-callback") && command.listener !== null) {
        Object.freeze(command.listener);
      }
      Object.freeze(command);
    }
    return Object.freeze({
      renderer,
      version,
      commands: Object.freeze(commands)
    });
  }
  function collectEffectEventCells(owners) {
    const cells = [];
    for (const owner of owners) {
      for (const hook of owner.hooks.values()) {
        if (hook.kind === "effect-event")
          cells.push(hook.cell);
      }
    }
    return cells;
  }
  function deactivateEffectEventCells(cells) {
    for (const cell of cells)
      cell.active = false;
  }
  function snapshotHostAttachmentIds(value, label) {
    if (!Array.isArray(value)) {
      throw new TypeError(`Universal host attachment ${label} must be an array.`);
    }
    const ids = [];
    const seen = /* @__PURE__ */ new Set;
    for (const id of value) {
      if (!Number.isSafeInteger(id) || id <= 0) {
        throw new TypeError(`Universal host attachment ${label} IDs must be positive safe integers.`);
      }
      if (!seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
    return Object.freeze(ids);
  }
  function snapshotHostAttachmentBatch(batch) {
    if (batch === null || typeof batch !== "object" || Array.isArray(batch)) {
      throw new TypeError("A universal host attachment batch must be an object.");
    }
    return Object.freeze({
      detached: snapshotHostAttachmentIds(batch.detached, "detached"),
      attached: snapshotHostAttachmentIds(batch.attached, "attached")
    });
  }
  function logicalRecordDepth(record) {
    let depth = 0;
    for (let parent = record.parent;parent !== null; parent = parent.parent)
      depth++;
    return depth;
  }

  class UniversalRootImpl {
    constructor(container, driver, transport, microtaskScheduler) {
      this.container = container;
      this.driver = driver;
      this.transport = transport;
      this.microtaskScheduler = microtaskScheduler;
      assertRendererId(driver.id, "Universal driver id");
      if (transport?.mode === "async" && driver.capabilities?.localHostCallbacks === true) {
        throw new Error("Universal async transports do not support the local host callback capability.");
      }
      this.renderer = driver.id;
      this.rootRecord = {
        id: 0,
        kind: "range",
        key: null,
        type: null,
        props: {},
        ref: null,
        refCleanup: null,
        refAttached: false,
        owner: null,
        events: /* @__PURE__ */ new Map,
        lifecycles: /* @__PURE__ */ new Map,
        localCallbacks: /* @__PURE__ */ new Map,
        visibility: "visible",
        portalRegistration: null,
        parent: null,
        children: []
      };
      this.initializeHostAttachments();
    }
    container;
    driver;
    transport;
    microtaskScheduler;
    renderer;
    rootRecord;
    universalIdRoot = NEXT_UNIVERSAL_ID_ROOT++;
    resourceRoot = NEXT_RESOURCE_ROOT++;
    portalRoot = NEXT_PORTAL_ROOT++;
    transportRoot = NEXT_TRANSPORT_ROOT++;
    portalHandles = /* @__PURE__ */ new Map;
    owner = null;
    bridge = null;
    bridgeContextReads = null;
    unmounted = false;
    unmounting = false;
    unmountPromise = null;
    asyncWork = Promise.resolve();
    asyncWorkError = NO_PENDING_PASSIVE_ERROR;
    nextId = 1;
    nextUniversalId = 1;
    nextListener = NEXT_EVENT_ROOT++ * 1e6;
    nextBatchVersion = 1;
    acceptedBatchVersion = 0;
    treeFeatures = 0;
    handlers = /* @__PURE__ */ new Map;
    localCallbacks = /* @__PURE__ */ new Map;
    publishedListeners = /* @__PURE__ */ new Set;
    pending = null;
    suspended = null;
    urgentBoundarySuspension = null;
    awaitingReplay = null;
    queuedReplay = null;
    rootRetryAttempt = null;
    lastComponent = null;
    lastProps;
    retryRenderInput = null;
    scheduled = false;
    scheduledUrgent = false;
    scheduledFullRoot = false;
    scheduledOwners = /* @__PURE__ */ new Set;
    scheduledPreparationDepth = 0;
    scheduledTransitionBatches = /* @__PURE__ */ new Set;
    unattemptedTransitionBatches = /* @__PURE__ */ new Set;
    eventScopeDepth = 0;
    eventScopePriority = null;
    eventScopeHandlers = null;
    passiveScheduled = false;
    passiveTasks = [];
    hostAttachments = null;
    initializeHostAttachments() {
      const capability = this.driver.attachments;
      if (capability === undefined)
        return;
      if (typeof capability.subscribe !== "function") {
        throw new TypeError("A universal host attachment capability must provide subscribe().");
      }
      const state = {
        registration: null,
        records: /* @__PURE__ */ new Map,
        pending: [],
        flushScheduled: false
      };
      this.hostAttachments = state;
      let registration;
      try {
        registration = capability.subscribe(this.container, (batch) => this.receiveHostAttachmentBatch(batch));
        if (registration === null || typeof registration !== "object") {
          throw new TypeError("A universal host attachment subscription must return a registration.");
        }
        const candidate = registration;
        if (typeof candidate.isAttached !== "function") {
          throw new TypeError("A universal host attachment registration must provide isAttached().");
        }
        if (typeof candidate.unsubscribe !== "function") {
          throw new TypeError("A universal host attachment registration must provide unsubscribe().");
        }
        state.registration = candidate;
        this.flushPendingHostAttachmentBatches();
      } catch (error) {
        this.hostAttachments = null;
        try {
          const unsubscribe = registration?.unsubscribe;
          if (typeof unsubscribe === "function") {
            unsubscribe.call(registration);
          }
        } catch {}
        throw error;
      }
    }
    receiveHostAttachmentBatch(batch) {
      const state = this.hostAttachments;
      if (state === null || this.unmounted)
        return;
      const snapshot = snapshotHostAttachmentBatch(batch);
      if (snapshot.detached.length === 0 && snapshot.attached.length === 0)
        return;
      state.pending.push(snapshot);
      if (state.registration === null || this.unmounting)
        return;
      if (CURRENT_ATTEMPT !== null || UNIVERSAL_COMMIT_TASK_DEPTH > 0 || this.pending?.isAwaitingTransportAcknowledgement()) {
        this.queueHostAttachmentFlush();
        return;
      }
      this.flushPendingHostAttachmentBatches();
    }
    queueHostAttachmentFlush() {
      const state = this.hostAttachments;
      if (state === null || state.flushScheduled || state.pending.length === 0 || this.unmounted || this.unmounting) {
        return;
      }
      state.flushScheduled = true;
      this.__scheduleMicrotask(() => {
        state.flushScheduled = false;
        if (this.hostAttachments !== state || this.unmounted) {
          state.pending.splice(0);
          return;
        }
        if (this.unmounting || this.pending?.isAwaitingTransportAcknowledgement())
          return;
        this.flushPendingHostAttachmentBatches();
      });
    }
    readHostAttachment(id) {
      const registration = this.hostAttachments?.registration ?? null;
      if (registration === null)
        return true;
      const attached = registration.isAttached(id);
      if (typeof attached !== "boolean") {
        throw new TypeError("Universal host attachment isAttached() must return a boolean.");
      }
      return attached;
    }
    attachHostRef(record) {
      if (this.hostAttachments?.registration == null || this.unmounted)
        return;
      if (!this.readHostAttachment(record.id))
        return;
      const value = this.driver.getPublicInstance(this.container, record.id);
      if (value === null)
        return;
      attachRef(record, value);
    }
    processHostAttachmentBatch(batch, forcedDetaches) {
      const state = this.hostAttachments;
      if (state === null || state.registration === null)
        return;
      const records = state.records;
      const ordered = (ids, childFirst) => ids.map((id, index) => {
        const record = records.get(id);
        return {
          record,
          index,
          depth: record === undefined ? 0 : logicalRecordDepth(record)
        };
      }).filter((entry) => entry.record?.kind === "host").sort((left, right) => {
        const depth = left.depth - right.depth;
        return (childFirst ? -depth : depth) || left.index - right.index;
      }).map((entry) => entry.record);
      const tasks = [];
      for (const record of ordered(batch.detached, false)) {
        tasks.push(() => {
          if (this.unmounted || records.get(record.id) !== record || !record.refAttached || this.readHostAttachment(record.id) && !forcedDetaches?.has(record.id)) {
            return;
          }
          runOwnedCommit(record.owner, () => detachRef(record));
        });
      }
      for (const record of ordered(batch.attached, true)) {
        tasks.push(() => {
          if (this.unmounted || records.get(record.id) !== record || record.ref == null || record.refAttached || record.visibility === "suspense-hidden" || !this.readHostAttachment(record.id)) {
            return;
          }
          runOwnedCommit(record.owner, () => this.attachHostRef(record));
        });
      }
      runCommitTasks(tasks);
    }
    flushPendingHostAttachmentBatches() {
      const state = this.hostAttachments;
      if (state === null || state.pending.length === 0 || state.registration === null || this.unmounted || this.unmounting || this.pending?.isAwaitingTransportAcknowledgement()) {
        return;
      }
      const batches = state.pending.splice(0);
      const forcedDetaches = batches.map(() => /* @__PURE__ */ new Set);
      const laterAttachments = /* @__PURE__ */ new Set;
      for (let index = batches.length - 1;index >= 0; index--) {
        const batch = batches[index];
        for (const id of batch.attached)
          laterAttachments.add(id);
        for (const id of batch.detached) {
          if (laterAttachments.has(id))
            forcedDetaches[index].add(id);
        }
      }
      runCommitTasks(batches.map((batch, index) => () => this.processHostAttachmentBatch(batch, forcedDetaches[index])));
    }
    disposeHostAttachments() {
      const state = this.hostAttachments;
      if (state === null)
        return;
      const registration = state.registration;
      this.hostAttachments = null;
      state.registration = null;
      state.records.clear();
      state.pending.splice(0);
      state.flushScheduled = false;
      registration?.unsubscribe();
    }
    __scheduleMicrotask(callback) {
      if (this.microtaskScheduler !== null) {
        this.microtaskScheduler(callback);
        return;
      }
      const scheduler = readGlobalMicrotaskScheduler();
      if (scheduler === undefined) {
        throw new Error("The global queueMicrotask scheduler became unavailable.");
      }
      scheduler.call(globalThis, callback);
    }
    __runCommitTasks(tasks) {
      runCommitTasks(tasks);
    }
    hasAsyncTransport() {
      return this.transport?.mode === "async";
    }
    enqueueAsyncWork(work) {
      const run = async () => {
        try {
          await work();
        } catch (error) {
          if (this.asyncWorkError === NO_PENDING_PASSIVE_ERROR)
            this.asyncWorkError = error;
        }
      };
      this.asyncWork = this.asyncWork.then(run, run);
    }
    flushQueuedTransportWork() {
      if (this.unmounted || this.unmounting)
        return;
      if (this.scheduled)
        this.flushScheduledWork();
      const replay = this.queuedReplay;
      if (this.bridge === null && replay !== null && replay.active)
        this.runReplay(replay);
    }
    async flushTransport() {
      while (true) {
        const unmount = this.unmountPromise;
        if (unmount !== null) {
          try {
            await unmount;
          } catch {}
        }
        this.flushQueuedTransportWork();
        const pending = this.asyncWork;
        await pending;
        if (this.unmountPromise !== null || this.unmounting && !this.unmounted)
          continue;
        if (pending === this.asyncWork && (this.unmounted || !this.scheduled && (this.bridge !== null || this.queuedReplay === null || !this.queuedReplay.active))) {
          break;
        }
      }
      if (this.asyncWorkError !== NO_PENDING_PASSIVE_ERROR) {
        const error = this.asyncWorkError;
        this.asyncWorkError = NO_PENDING_PASSIVE_ERROR;
        throw error;
      }
    }
    transportIdentity(version) {
      return Object.freeze({
        protocol: UNIVERSAL_TRANSPORT_PROTOCOL_VERSION,
        renderer: this.renderer,
        root: this.transportRoot,
        version
      });
    }
    validateTransportAcknowledgement(message, version) {
      this.validateTransportIdentity(message, version, "acknowledgement");
      if (message.type !== "ack") {
        throw new Error(`Universal transport expected an acknowledgement for batch ${version}.`);
      }
    }
    validateTransportIdentity(message, version, label) {
      if (message.protocol !== UNIVERSAL_TRANSPORT_PROTOCOL_VERSION) {
        throw new Error(`Universal transport ${label} uses protocol ${String(message.protocol)}; expected ${UNIVERSAL_TRANSPORT_PROTOCOL_VERSION}.`);
      }
      if (message.renderer !== this.renderer) {
        throw new Error(`Universal transport ${label} renderer ${JSON.stringify(message.renderer)} does not match ${JSON.stringify(this.renderer)}.`);
      }
      if (message.root !== this.transportRoot) {
        throw new Error(`Universal transport ${label} belongs to a stale or foreign root.`);
      }
      if (message.version !== version) {
        throw new Error(`Universal transport ${label} version ${message.version} does not match batch ${version}.`);
      }
    }
    markBatchAccepted(version) {
      if (version <= this.acceptedBatchVersion) {
        throw new Error(`Universal transport rejected stale accepted batch version ${version}; current version is ${this.acceptedBatchVersion}.`);
      }
      this.acceptedBatchVersion = version;
    }
    setBridge(bridge) {
      if (this.bridge !== null && this.bridge !== bridge) {
        throw new Error("A universal root cannot be owned by more than one host boundary.");
      }
      this.bridge = bridge;
    }
    clearBridge(bridge) {
      if (this.bridge === bridge)
        this.bridge = null;
    }
    readBridgeContext(context) {
      const value = this.bridge === null ? context.defaultValue : this.bridge.readContext(context);
      if (this.bridge !== null && CURRENT_ATTEMPT?.root === this) {
        (CURRENT_ATTEMPT.bridgeContextReads ??= /* @__PURE__ */ new Map).set(context, value);
      }
      return value;
    }
    rootRecordForRetention() {
      return this.rootRecord;
    }
    formatUniversalId(index) {
      const sum = this.universalIdRoot + index;
      const paired = sum * (sum + 1) / 2 + index;
      return `:octane-u${paired.toString(36)}:`;
    }
    classifyEvent(name) {
      return this.driver.events?.classify(name) ?? null;
    }
    classifyLifecycle(name, value) {
      return this.driver.lifecycles?.classify(name, value) ?? null;
    }
    classifyLocalCallback(name, value) {
      return this.driver.localCallbacks?.classify(name, value) ?? null;
    }
    textPolicy() {
      return this.driver.capabilities?.text ?? "reject";
    }
    driverCapabilities() {
      return this.driver.capabilities ?? {};
    }
    canCompactCompilerLeafProps() {
      return this.transport === null && this.driver.props === undefined && this.driver.capabilities?.compilerLeafProps === true;
    }
    acquirePortalTargetHandle(id, pendingEntries) {
      if (typeof id !== "string" && typeof id !== "number" || String(id).length === 0) {
        throw new TypeError("A universal portal target handle ID must be a non-empty string or number.");
      }
      let entry = this.portalHandles.get(id);
      if (entry === undefined) {
        entry = {
          handle: Object.freeze({
            $$kind: "octane.universal.portal-target",
            renderer: this.renderer,
            root: this.portalRoot,
            id
          }),
          registrations: 0,
          pending: 0
        };
        this.portalHandles.set(id, entry);
      }
      entry.pending++;
      pendingEntries.push(entry);
      return entry.handle;
    }
    releasePortalHandleEntry(entry) {
      if (entry.registrations === 0 && entry.pending === 0 && this.portalHandles.get(entry.handle.id) === entry) {
        this.portalHandles.delete(entry.handle.id);
      }
    }
    preparePortalTarget(target) {
      const capability = this.driver.portals;
      if (capability === undefined) {
        throw new Error(`Universal renderer ${JSON.stringify(this.renderer)} does not declare the portal capability.`);
      }
      const pendingEntries = [];
      let release = null;
      try {
        const registration = capability.prepareTarget({
          container: this.container,
          renderer: this.renderer,
          target,
          transported: this.transport !== null,
          createPortalTargetHandle: (id) => this.acquirePortalTargetHandle(id, pendingEntries)
        });
        release = registration !== null && typeof registration === "object" && typeof registration.release === "function" ? registration.release.bind(registration) : null;
        if (registration === null || typeof registration !== "object" || release === null) {
          throw new TypeError("A universal portal capability must return a valid target registration.");
        }
        const handle = registration.handle;
        const entry = handle !== null && typeof handle === "object" ? this.portalHandles.get(handle.id) : undefined;
        if (handle?.$$kind !== "octane.universal.portal-target" || handle.renderer !== this.renderer || handle.root !== this.portalRoot || typeof handle.id !== "string" && typeof handle.id !== "number" || entry?.handle !== handle) {
          throw new Error(`Universal portal target handle does not belong to renderer ${JSON.stringify(this.renderer)} and this root.`);
        }
        const registrationRelease = release;
        let released = false;
        const prepared = Object.freeze({
          handle,
          release: () => {
            if (released)
              return;
            released = true;
            try {
              registrationRelease();
            } finally {
              entry.registrations--;
              this.releasePortalHandleEntry(entry);
            }
          }
        });
        entry.registrations++;
        return prepared;
      } catch (error) {
        try {
          release?.();
        } catch {}
        throw error;
      } finally {
        for (const entry of pendingEntries) {
          entry.pending--;
          this.releasePortalHandleEntry(entry);
        }
      }
    }
    encodeHostProp(hostType, name, value) {
      const codec = this.driver.props;
      if (codec === undefined) {
        return this.transport === null ? value : cloneSerializableValue(value);
      }
      const result = codec.encode({
        container: this.container,
        renderer: this.renderer,
        hostType,
        name,
        value,
        createResourceHandle: (id) => {
          if (typeof id !== "string" && typeof id !== "number" || String(id).length === 0) {
            throw new TypeError("A universal resource handle ID must be a non-empty string or number.");
          }
          return Object.freeze({
            $$kind: "octane.universal.resource",
            renderer: this.renderer,
            root: this.resourceRoot,
            id
          });
        }
      });
      if (result === null || typeof result !== "object") {
        throw new TypeError(`Universal prop codec for ${JSON.stringify(name)} returned an invalid result.`);
      }
      if (result.kind === "unsupported") {
        throw new TypeError(result.reason ?? `Universal renderer ${JSON.stringify(this.renderer)} does not support host prop ${JSON.stringify(name)}.`);
      }
      if (result.kind === "value")
        return cloneSerializableValue(result.value);
      if (result.kind !== "resource") {
        throw new TypeError(`Universal prop codec for ${JSON.stringify(name)} returned unknown encoding ${JSON.stringify(result.kind)}.`);
      }
      const handle = result.handle;
      if (handle?.$$kind !== "octane.universal.resource" || handle.renderer !== this.renderer || handle.root !== this.resourceRoot || typeof handle.id !== "string" && typeof handle.id !== "number") {
        throw new Error(`Universal resource handle for ${JSON.stringify(name)} does not belong to renderer ${JSON.stringify(this.renderer)} and this root.`);
      }
      return handle;
    }
    eventScope(priority, run) {
      if (priority !== "discrete" && priority !== "continuous" && priority !== "default") {
        throw new TypeError(`Unknown universal event priority ${JSON.stringify(priority)}.`);
      }
      if (this.eventScopeDepth > 0) {
        if (this.eventScopePriority !== priority) {
          throw new Error(`Nested universal event scopes must retain priority ${JSON.stringify(this.eventScopePriority)}.`);
        }
        this.eventScopeDepth++;
        try {
          return run();
        } finally {
          this.eventScopeDepth--;
        }
      }
      this.eventScopeDepth = 1;
      this.eventScopePriority = priority;
      this.eventScopeHandlers = this.handlers;
      if (priority === "discrete")
        UNIVERSAL_DISCRETE_EVENT_DEPTH++;
      try {
        return run();
      } finally {
        if (priority === "discrete")
          UNIVERSAL_DISCRETE_EVENT_DEPTH--;
        this.eventScopeDepth = 0;
        this.eventScopePriority = null;
        this.eventScopeHandlers = null;
        if (this.scheduled) {
          if (priority === "discrete")
            this.flushScheduledWork();
          else
            this.queueScheduledWork();
        }
      }
    }
    dispatchEvent(listener, payload) {
      if (this.eventScopeDepth === 0) {
        const event2 = this.handlers.get(listener);
        if (event2 === undefined || event2.owner.disposed) {
          throw new Error(`Unknown or inactive universal event listener ${listener}.`);
        }
        return this.eventScope(event2.priority, () => this.dispatchEvent(listener, payload));
      }
      const event = this.eventScopeHandlers.get(listener);
      if (event === undefined) {
        throw new Error(`Unknown or inactive universal event listener ${listener}.`);
      }
      let result;
      try {
        result = event.handler(payload);
      } catch (error) {
        if (!routeUniversalOwnerError(event.owner, error))
          throw error;
      }
      return result;
    }
    dispatchTransportEvent(message) {
      if (this.unmounted) {
        throw new Error("Cannot dispatch a transported event to an unmounted universal root.");
      }
      this.validateTransportIdentity(message, this.acceptedBatchVersion, "event");
      if (message.type !== "event") {
        throw new Error("Universal transport expected an event message.");
      }
      if (message.priority !== "discrete" && message.priority !== "continuous" && message.priority !== "default") {
        throw new TypeError(`Unknown universal event priority ${JSON.stringify(message.priority)}.`);
      }
      for (const { listener } of message.deliveries) {
        const event = this.handlers.get(listener);
        if (event === undefined || event.owner.disposed) {
          throw new Error(`Unknown or inactive universal event listener ${listener}.`);
        }
        if (event.priority !== message.priority) {
          throw new Error(`Universal event listener ${listener} has priority ${JSON.stringify(event.priority)}, not transported priority ${JSON.stringify(message.priority)}.`);
        }
      }
      let errors = null;
      const results = this.eventScope(message.priority, () => {
        const values = new Array(message.deliveries.length);
        for (let index = 0;index < message.deliveries.length; index++) {
          const { listener, payload } = message.deliveries[index];
          try {
            values[index] = this.dispatchEvent(listener, payload);
          } catch (error) {
            (errors ??= []).push(error);
          }
        }
        return values;
      });
      const dispatchedErrors = errors;
      if (dispatchedErrors !== null) {
        if (dispatchedErrors.length === 1)
          throw dispatchedErrors[0];
        throw typeof AggregateError === "function" ? new AggregateError(dispatchedErrors, "Multiple universal event listeners failed.") : dispatchedErrors[0];
      }
      return results;
    }
    invokeLocalCallback(listener, args) {
      const callback = this.localCallbacks.get(listener);
      if (callback === undefined || callback.owner.disposed) {
        throw new Error(`Unknown or inactive universal local callback ${listener}.`);
      }
      let result;
      runOwnedCommit(callback.owner, () => {
        result = callback.handler(...args);
      });
      if (typeof result !== "function")
        return result;
      const cleanup = result;
      return () => runOwnedCommit(callback.owner, cleanup);
    }
    scheduledRenderInput() {
      const pendingInput = this.suspended ?? (this.queuedReplay?.active === true ? this.queuedReplay : null);
      const component = pendingInput?.component ?? this.retryRenderInput?.[0] ?? this.lastComponent;
      if (component === null)
        return null;
      return [component, pendingInput?.props ?? this.retryRenderInput?.[1] ?? this.lastProps];
    }
    retryRejectedScheduledAttempt(attempt, component, props) {
      if (attempt.status !== "aborted" || this.unmounted || this.unmounting)
        return;
      this.retryRenderInput = [component, props];
      this.schedule();
    }
    restoreRejectedReplay(attempt, replay) {
      if (attempt.status !== "aborted" || this.unmounted || this.unmounting)
        return;
      if (this.queuedReplay !== null && this.queuedReplay !== replay && this.queuedReplay.active) {
        return;
      }
      let transitionBatches = replay.transitionBatches;
      if (replay.transitionRender) {
        const merged = new Set(replay.transitionBatches);
        for (const batch of this.takeScheduledTransitionBatches())
          merged.add(batch);
        transitionBatches = merged;
      } else {
        for (const batch of replay.transitionBatches) {
          this.scheduledTransitionBatches.delete(batch);
          this.unattemptedTransitionBatches.delete(batch);
        }
      }
      if (!this.scheduledUrgent) {
        this.scheduled = false;
        SCHEDULED_UNIVERSAL_ROOTS.delete(this);
      }
      const restored = {
        entries: replay.entries,
        component: replay.component,
        props: replay.props,
        transitionBatches,
        transitionRender: replay.transitionRender,
        active: true,
        asyncWorkQueued: false
      };
      this.queueReplay(restored);
    }
    flushScheduledWork() {
      if (!this.scheduled)
        return;
      if (this.unmounting)
        return;
      this.scheduled = false;
      SCHEDULED_UNIVERSAL_ROOTS.delete(this);
      if (this.unmounted || this.owner?.disposed || this.lastComponent === null)
        return;
      if (this.bridge !== null) {
        this.bridge.invalidate();
      } else if (this.hasAsyncTransport()) {
        this.enqueueAsyncWork(async () => {
          while (this.pending?.isAwaitingTransportAcknowledgement()) {
            const pending = this.pending;
            try {
              await pending.commitAsync();
            } catch {}
          }
          if (this.unmounting)
            await this.waitForProvisionalUnmount();
          if (this.unmounted)
            return;
          const input = this.scheduledRenderInput();
          if (input === null)
            return;
          const attempt = this.__prepareScheduled(input[0], input[1]);
          if (attempt.status === "prepared") {
            try {
              await attempt.commitAsync();
            } catch (error) {
              this.retryRejectedScheduledAttempt(attempt, input[0], input[1]);
              throw error;
            }
          }
        });
      } else {
        const input = this.scheduledRenderInput();
        if (input === null)
          return;
        const attempt = this.__prepareScheduled(input[0], input[1]);
        if (attempt.status === "prepared")
          attempt.commit();
      }
    }
    queueScheduledWork() {
      if (!this.scheduled)
        return;
      if (this.unmounting)
        return;
      if (UNIVERSAL_SYNC_DEPTH > 0)
        return;
      if (this.bridge !== null) {
        this.scheduled = false;
        SCHEDULED_UNIVERSAL_ROOTS.delete(this);
        this.bridge.invalidate();
        return;
      }
      this.__scheduleMicrotask(() => this.flushScheduledWork());
    }
    markUrgentScheduled() {
      if (this.unmounted || this.owner?.disposed || this.lastComponent === null)
        return;
      this.scheduledUrgent = true;
      if (this.scheduled)
        return;
      this.scheduled = true;
      SCHEDULED_UNIVERSAL_ROOTS.add(this);
      if (this.eventScopeDepth === 0 && UNIVERSAL_SYNC_DEPTH === 0)
        this.queueScheduledWork();
    }
    scheduleOwned(owner) {
      if (owner.root !== this || owner.disposed)
        return;
      this.scheduledOwners.add(owner);
      this.markUrgentScheduled();
    }
    schedule() {
      this.scheduledFullRoot = true;
      this.markUrgentScheduled();
    }
    scheduleTransition(batch) {
      if (batch.settled || this.unmounted || this.owner?.disposed || this.lastComponent === null) {
        finishUniversalTransitionRoot(batch, this);
        return;
      }
      this.scheduledTransitionBatches.add(batch);
      this.unattemptedTransitionBatches.add(batch);
      this.ensureScheduledTransitionWork();
    }
    ensureScheduledTransitionWork() {
      if (this.scheduledTransitionBatches.size === 0 || this.unmounted || this.owner?.disposed || this.lastComponent === null) {
        return;
      }
      let runnable = false;
      for (const batch of [...this.scheduledTransitionBatches]) {
        const state = this.transitionQueueState(batch);
        if (state === "none") {
          this.scheduledTransitionBatches.delete(batch);
          finishUniversalTransitionRoot(batch, this);
        } else if (state === "runnable") {
          runnable = true;
        }
      }
      if (!runnable)
        return;
      if (this.scheduled)
        return;
      this.scheduled = true;
      SCHEDULED_UNIVERSAL_ROOTS.add(this);
      if (this.eventScopeDepth === 0 && UNIVERSAL_SYNC_DEPTH === 0)
        this.queueScheduledWork();
    }
    requeueTransitionBatches(batches) {
      for (const batch of batches) {
        if (batch.settled)
          continue;
        this.scheduledTransitionBatches.add(batch);
        this.unattemptedTransitionBatches.add(batch);
      }
    }
    transitionQueueState(batch) {
      let state = "none";
      const needsFirstAttempt = this.unattemptedTransitionBatches.has(batch);
      const visit = (owner) => {
        if (state === "runnable")
          return;
        for (const queue of owner.updates.values()) {
          if (queue.batches?.includes(batch) !== true)
            continue;
          state = needsFirstAttempt || owner.visibility !== "suspense-hidden" ? "runnable" : "blocked";
          if (state === "runnable")
            return;
        }
        for (const child of owner.children)
          visit(child);
      };
      if (this.owner !== null)
        visit(this.owner);
      return state;
    }
    detachCompletedTransitionBatch(batch) {
      const visit = (owner) => {
        if (owner.visibility !== "suspense-hidden") {
          for (const queue of owner.updates.values()) {
            const batches = queue.batches;
            if (batches === undefined || !batches.includes(batch))
              continue;
            for (let index = 0;index < batches.length; index++) {
              if (batches[index] === batch)
                batches[index] = null;
            }
          }
        }
        for (const child of owner.children)
          visit(child);
      };
      if (this.owner !== null)
        visit(this.owner);
    }
    completeTransitionBatches(batches) {
      for (const batch of batches) {
        if (batch.settled)
          continue;
        this.detachCompletedTransitionBatch(batch);
        if (this.transitionQueueState(batch) === "none") {
          finishUniversalTransitionRoot(batch, this);
        } else {
          this.scheduledTransitionBatches.add(batch);
        }
      }
    }
    takeScheduledTransitionBatches() {
      if (this.scheduledTransitionBatches.size === 0)
        return EMPTY_UNIVERSAL_TRANSITION_BATCHES;
      const batches = new Set(this.scheduledTransitionBatches);
      this.scheduledTransitionBatches.clear();
      for (const batch of batches)
        this.unattemptedTransitionBatches.delete(batch);
      return batches;
    }
    finishTransitionBatches(batches) {
      for (const batch of batches)
        finishUniversalTransitionRoot(batch, this);
    }
    discardTransitionBatch(batch) {
      this.scheduledTransitionBatches.delete(batch);
      this.unattemptedTransitionBatches.delete(batch);
      for (const owner of batch.updates.keys()) {
        if (owner.root === this)
          batch.updates.delete(owner);
      }
      const visit = (owner) => {
        for (const [slot, queue] of owner.updates) {
          const batches = queue.batches;
          if (batches === undefined || !batches.includes(batch))
            continue;
          const values = [];
          const remainingBatches = [];
          const rebases = [];
          for (let index = 0;index < queue.length; index++) {
            if (batches[index] === batch)
              continue;
            values.push(queue[index]);
            remainingBatches.push(batches[index]);
            rebases.push(queue.rebases?.[index] ?? false);
          }
          if (values.length === 0) {
            owner.updates.delete(slot);
          } else if (remainingBatches.every((remaining) => remaining === null) && rebases.every(Boolean)) {
            owner.updates.delete(slot);
          } else {
            queue.length = 0;
            queue.push(...values);
            queue.batches = remainingBatches;
            if (rebases.some(Boolean))
              queue.rebases = rebases;
            else
              delete queue.rebases;
          }
        }
        for (const child of owner.children)
          visit(child);
      };
      if (this.owner !== null)
        visit(this.owner);
    }
    cancelSuspendedReplays(preserveTransitions = false) {
      if (this.awaitingReplay === null && this.queuedReplay === null && this.rootRetryAttempt === null) {
        return;
      }
      const batches = /* @__PURE__ */ new Set;
      for (const batch of this.awaitingReplay?.transitionBatches ?? [])
        batches.add(batch);
      for (const batch of this.queuedReplay?.transitionBatches ?? [])
        batches.add(batch);
      for (const batch of this.rootRetryAttempt?.transitionBatches ?? [])
        batches.add(batch);
      if (this.awaitingReplay !== null)
        this.awaitingReplay.active = false;
      if (this.queuedReplay !== null)
        this.queuedReplay.active = false;
      this.awaitingReplay = null;
      this.queuedReplay = null;
      this.rootRetryAttempt = null;
      if (preserveTransitions)
        this.requeueTransitionBatches(batches);
      else
        this.finishTransitionBatches(batches);
    }
    runReplay(replay) {
      if (!replay.active || this.queuedReplay !== replay || this.unmounted || this.unmounting)
        return;
      if (this.hasAsyncTransport()) {
        if (replay.asyncWorkQueued)
          return;
        replay.asyncWorkQueued = true;
        this.enqueueAsyncWork(async () => {
          try {
            if (this.unmounting)
              await this.waitForProvisionalUnmount();
            if (!replay.active || this.queuedReplay !== replay || this.unmounted || this.unmounting) {
              return;
            }
            this.queuedReplay = null;
            replay.active = false;
            this.rootRetryAttempt = null;
            let attempt2;
            try {
              attempt2 = this.prepareWithReplay(replay.component, replay.props, replay.entries, replay.transitionBatches, replay.transitionRender);
            } catch (error) {
              const batches = new Set(replay.transitionBatches);
              for (const batch of this.takeScheduledTransitionBatches())
                batches.add(batch);
              this.finishTransitionBatches(batches);
              throw error;
            }
            if (attempt2.status === "prepared") {
              try {
                await attempt2.commitAsync();
              } catch (error) {
                this.restoreRejectedReplay(attempt2, replay);
                throw error;
              }
            } else {
              this.ensureScheduledTransitionWork();
            }
          } finally {
            replay.asyncWorkQueued = false;
          }
        });
        return;
      }
      this.queuedReplay = null;
      replay.active = false;
      this.rootRetryAttempt = null;
      let attempt;
      try {
        attempt = this.prepareWithReplay(replay.component, replay.props, replay.entries, replay.transitionBatches, replay.transitionRender);
      } catch (error) {
        const batches = new Set(replay.transitionBatches);
        for (const batch of this.takeScheduledTransitionBatches())
          batches.add(batch);
        this.finishTransitionBatches(batches);
        throw error;
      }
      if (attempt.status === "prepared")
        attempt.commit();
      else
        this.ensureScheduledTransitionWork();
    }
    queueReplay(replay) {
      if (!replay.active || this.unmounted)
        return;
      if (this.awaitingReplay === replay)
        this.awaitingReplay = null;
      if (this.queuedReplay === replay)
        return;
      if (this.queuedReplay !== null) {
        this.queuedReplay.active = false;
        this.finishTransitionBatches(this.queuedReplay.transitionBatches);
      }
      this.queuedReplay = replay;
      if (this.bridge !== null) {
        this.bridge.invalidate();
        return;
      }
      this.__scheduleMicrotask(() => this.runReplay(replay));
    }
    resumeAfterRejectedUnmount() {
      this.unmounting = false;
      if (this.hostAttachments !== null)
        this.queueHostAttachmentFlush();
      if (this.scheduled)
        this.queueScheduledWork();
      const replay = this.queuedReplay;
      if (replay === null || !replay.active)
        return;
      if (this.bridge !== null)
        this.bridge.invalidate();
      else
        this.__scheduleMicrotask(() => this.runReplay(replay));
    }
    async waitForProvisionalUnmount() {
      while (this.unmounting && !this.unmounted) {
        const unmount = this.unmountPromise;
        if (unmount === null) {
          await Promise.resolve();
          continue;
        }
        try {
          await unmount;
        } catch {}
      }
    }
    publishLocalReplay(thenables, entries, component, props) {
      if (this.awaitingReplay !== null)
        this.awaitingReplay.active = false;
      const replay = {
        entries,
        component,
        props,
        transitionBatches: EMPTY_UNIVERSAL_TRANSITION_BATCHES,
        transitionRender: false,
        active: true,
        asyncWorkQueued: false
      };
      this.awaitingReplay = replay;
      for (const thenable of thenables) {
        thenable.then(() => this.queueReplay(replay), () => this.queueReplay(replay));
      }
    }
    suspend(thenable, component, props, replayEntries, transitionBatches, transitionRender, bridgeContextReads) {
      const attempt = new UniversalSuspendedAttemptImpl(this, thenable, component, props, replayEntries, transitionBatches, transitionRender, bridgeContextReads);
      this.suspended = attempt;
      if (!transitionRender && this.bridge !== null) {
        this.urgentBoundarySuspension = attempt;
        const releaseProjection = () => {
          if (this.urgentBoundarySuspension !== attempt)
            return;
          this.urgentBoundarySuspension = null;
          this.ensureScheduledTransitionWork();
        };
        thenable.then(releaseProjection, releaseProjection);
      }
      return attempt;
    }
    finishSuspension(attempt, schedule, preserveTransitions = false) {
      if (schedule && this.urgentBoundarySuspension === attempt) {
        this.urgentBoundarySuspension = null;
      }
      if (this.suspended === attempt)
        this.suspended = null;
      else if (this.rootRetryAttempt !== attempt)
        return;
      if (!schedule || this.unmounted) {
        if (this.rootRetryAttempt === attempt) {
          this.rootRetryAttempt = null;
          if (this.queuedReplay !== null)
            this.queuedReplay.active = false;
          this.queuedReplay = null;
        }
        if (preserveTransitions)
          this.requeueTransitionBatches(attempt.transitionBatches);
        else
          this.finishTransitionBatches(attempt.transitionBatches);
        return;
      }
      this.rootRetryAttempt = attempt;
      this.queueReplay({
        entries: attempt.replayEntries,
        component: attempt.component,
        props: attempt.props,
        transitionBatches: attempt.transitionBatches,
        transitionRender: attempt.transitionRender,
        active: true,
        asyncWorkQueued: false
      });
    }
    flushPassiveTasks() {
      PENDING_UNIVERSAL_PASSIVE_ROOTS.delete(this);
      this.passiveScheduled = false;
      if (this.passiveTasks.length === 0)
        return;
      const tasks = this.passiveTasks.splice(0);
      runCommitTasks(tasks);
    }
    enqueuePassive(task) {
      this.passiveTasks.push(task);
      PENDING_UNIVERSAL_PASSIVE_ROOTS.add(this);
      if (this.passiveScheduled)
        return;
      this.passiveScheduled = true;
      this.__scheduleMicrotask(() => {
        this.flushPassiveTasks();
      });
    }
    flushPassivesBeforeRender() {
      this.flushPassiveTasks();
    }
    discardDraftOwners(owners) {
      const committed = /* @__PURE__ */ new Set;
      const collect = (owner) => {
        if (owner === null || committed.has(owner))
          return;
        committed.add(owner);
        for (const child of owner.children)
          collect(child);
      };
      collect(this.owner);
      for (const draft of owners) {
        if (committed.has(draft.record))
          continue;
        draft.record.disposed = true;
        draft.record.componentProps = null;
        draft.record.range = null;
        draft.record.updates.clear();
        for (const hook of draft.hooks.values()) {
          if (hook.kind === "effect-event")
            hook.cell.active = false;
        }
      }
    }
    __prepareScheduled(component, props) {
      this.scheduledPreparationDepth++;
      try {
        return this.prepare(component, props);
      } finally {
        this.scheduledPreparationDepth--;
      }
    }
    __prepareBoundaryScheduled(component, props) {
      const urgentSuspension = this.suspended !== null && !this.suspended.transitionRender ? this.suspended : null;
      const urgentProjection = this.urgentBoundarySuspension;
      const previousUrgentAttempt = urgentProjection ?? urgentSuspension;
      const previousComponent = previousUrgentAttempt?.component ?? this.lastComponent;
      const previousProps = previousUrgentAttempt?.props ?? this.lastProps;
      const previousContextReads = previousUrgentAttempt?.bridgeContextReads ?? this.bridgeContextReads;
      let inputsChanged = component !== previousComponent || !universalShallowEqual(previousProps, props);
      if (!inputsChanged && previousContextReads !== null) {
        for (const [context, previousValue] of previousContextReads) {
          const value = this.bridge === null ? context.defaultValue : this.bridge.readContext(context);
          if (!Object.is(value, previousValue)) {
            inputsChanged = true;
            break;
          }
        }
      }
      const urgentReplay = this.queuedReplay?.active === true && !this.queuedReplay.transitionRender;
      if (urgentProjection !== null && !this.scheduledUrgent && !urgentReplay && !inputsChanged) {
        return {
          attempt: urgentProjection,
          transition: false,
          projectedThenable: urgentProjection.thenable
        };
      }
      const transition = urgentSuspension === null && !this.scheduledUrgent && !urgentReplay && !inputsChanged;
      return {
        attempt: transition ? this.__prepareScheduled(component, props) : this.prepare(component, props),
        transition,
        projectedThenable: null
      };
    }
    prepareOwnedUpdate(target, component, props) {
      const range = target.range;
      if (this.transport !== null || this.bridge !== null || target.component === null || target.componentProps === null || ownerTreeHasWarmPlan(target) || range === null || range.kind !== "range" || range.owner !== target || target.visibility === "suspense-hidden") {
        return null;
      }
      for (let ancestor = target.parent;ancestor !== null; ancestor = ancestor.parent) {
        if (ancestor.isBoundary && (ancestor.hasBoundaryError || ancestor.boundaryThenable !== null)) {
          return null;
        }
      }
      const unsupported = UNIVERSAL_TREE_PORTAL | UNIVERSAL_TREE_REGION;
      const scopeFeatures = logicalTreeFeatures(range);
      if ((scopeFeatures & unsupported) !== 0)
        return null;
      this.flushPassivesBeforeRender();
      this.pending?.abort();
      const owner = draftOwner(target, null, [
        {
          component: target.component,
          identityPath: target.identityPath,
          key: target.key,
          ordinal: 0
        }
      ]);
      const previousAttempt = CURRENT_ATTEMPT;
      const previousOwner = CURRENT_OWNER;
      const previousWarm = CURRENT_UNIVERSAL_WARM;
      const previousWarmClaims = CURRENT_UNIVERSAL_WARM_CLAIMS;
      const previousWarmPlans = ACTIVE_UNIVERSAL_WARM_PLANS.slice();
      const attempt = {
        root: this,
        owner,
        scope: target,
        owners: [owner],
        treeFeatures: 0,
        replayEntries: [],
        retryThenables: /* @__PURE__ */ new Set,
        nextUniversalId: this.nextUniversalId,
        implicitSlot: 0,
        transitionBatches: EMPTY_UNIVERSAL_TRANSITION_BATCHES,
        transitionRender: false,
        bridgeContextReads: null
      };
      ACTIVE_UNIVERSAL_WARM_PLANS.length = 0;
      CURRENT_UNIVERSAL_WARM = null;
      CURRENT_UNIVERSAL_WARM_CLAIMS = null;
      CURRENT_ATTEMPT = attempt;
      CURRENT_OWNER = owner;
      let nodes;
      try {
        nodes = executeOwner(owner, () => {
          const value = target.component(target.componentProps, componentContext(this.renderer));
          return materializeValue(value, this.renderer, null, [...target.identityPath, "output"]);
        });
      } catch (error) {
        this.discardDraftOwners(attempt.owners);
        if (error instanceof UniversalSuspense) {
          UNIVERSAL_WARM_CACHES.delete(this);
          return null;
        }
        for (let ancestor = target.parent;ancestor !== null; ancestor = ancestor.parent) {
          if (ancestor.isBoundary) {
            UNIVERSAL_WARM_CACHES.delete(this);
            return null;
          }
        }
        throw error;
      } finally {
        ACTIVE_UNIVERSAL_WARM_PLANS.length = 0;
        ACTIVE_UNIVERSAL_WARM_PLANS.push(...previousWarmPlans);
        CURRENT_UNIVERSAL_WARM = previousWarm;
        CURRENT_UNIVERSAL_WARM_CLAIMS = previousWarmClaims;
        CURRENT_ATTEMPT = previousAttempt;
        CURRENT_OWNER = previousOwner;
      }
      if (attempt.retryThenables.size !== 0 || (attempt.treeFeatures & unsupported) !== 0) {
        this.discardDraftOwners(attempt.owners);
        UNIVERSAL_WARM_CACHES.delete(this);
        return null;
      }
      const blueprint = {
        kind: "range",
        key: target.rangeKey,
        owner: target,
        children: nodes
      };
      this.expandCompactLeafLists(blueprint);
      let scopePlacement = null;
      if (!stableLogicalChildren(range.children, blueprint.children)) {
        scopePlacement = this.scopePhysicalPlacement(range);
        if (scopePlacement === null) {
          this.discardDraftOwners(attempt.owners);
          UNIVERSAL_WARM_CACHES.delete(this);
          return null;
        }
      }
      try {
        const transaction = this.createPreparedTransaction(blueprint, attempt, component, props, /* @__PURE__ */ new Set, range, scopeFeatures, scopePlacement);
        this.pending = transaction;
        return transaction;
      } catch (error) {
        this.discardDraftOwners(attempt.owners);
        throw error;
      }
    }
    scopePhysicalPlacement(scope) {
      let endAnchor = null;
      let current = scope;
      for (let parent = current.parent;parent !== null; current = parent, parent = current.parent) {
        if (parent.kind !== "host" && parent.kind !== "range")
          return null;
        if (endAnchor === null) {
          const siblings = parent.children;
          for (let index = siblings.indexOf(current) + 1;index < siblings.length; index++) {
            const found = physicalRecords([siblings[index]]);
            if (found.length !== 0) {
              endAnchor = found[0].id;
              break;
            }
          }
        }
        if (parent.kind === "host")
          return { parent: parent.id, endAnchor };
        if (parent === this.rootRecord)
          return { parent: null, endAnchor };
      }
      return null;
    }
    resolveScopedTarget() {
      let scope = null;
      for (const owner of this.scheduledOwners) {
        if (owner.disposed)
          continue;
        if (owner.visibility === "suspense-hidden")
          return;
        scope = scope === null ? owner : commonOwnerAncestor(scope, owner);
        if (scope === null)
          return;
      }
      let target = null;
      for (let current = scope;current !== null; current = current.parent) {
        if (current.component !== null && current.componentProps !== null && current.range !== null) {
          target = current;
          break;
        }
      }
      if (target === null)
        return;
      for (const owner of this.scheduledOwners) {
        if (owner.disposed)
          continue;
        for (let current = owner;current !== target; current = current.parent) {
          if (current === null || current.isBoundary && (current.hasBoundaryError || current.boundaryThenable !== null)) {
            return;
          }
        }
      }
      return target;
    }
    prepare(component, props) {
      const ownedTarget = this.scheduledPreparationDepth > 0 && this.scheduledUrgent && !this.scheduledFullRoot && this.scheduledOwners.size !== 0 ? this.resolveScopedTarget() : undefined;
      const scheduledUrgent = this.scheduledUrgent || this.scheduledPreparationDepth === 0;
      this.scheduledUrgent = false;
      this.scheduledFullRoot = false;
      this.scheduledOwners.clear();
      if (scheduledUrgent)
        this.urgentBoundarySuspension = null;
      const bridgeReplay = this.bridge === null ? null : this.queuedReplay;
      if (!scheduledUrgent && bridgeReplay !== null && bridgeReplay.component === component && bridgeReplay.active) {
        const scheduledTransitions2 = this.takeScheduledTransitionBatches();
        this.queuedReplay = null;
        bridgeReplay.active = false;
        this.rootRetryAttempt = null;
        const transitions = /* @__PURE__ */ new Set([...bridgeReplay.transitionBatches, ...scheduledTransitions2]);
        try {
          return this.prepareWithReplay(component, props, bridgeReplay.entries, transitions, !scheduledUrgent && (bridgeReplay.transitionRender || scheduledTransitions2.size !== 0));
        } catch (error) {
          this.finishTransitionBatches(transitions);
          throw error;
        }
      }
      this.suspended?.abort(true);
      this.cancelSuspendedReplays(true);
      const scheduledTransitions = scheduledUrgent ? EMPTY_UNIVERSAL_TRANSITION_BATCHES : this.takeScheduledTransitionBatches();
      UNIVERSAL_WARM_CACHES.delete(this);
      try {
        if (ownedTarget !== undefined && component === this.lastComponent && universalShallowEqual(props, this.lastProps)) {
          const ownedAttempt = this.prepareOwnedUpdate(ownedTarget, component, props);
          if (ownedAttempt !== null)
            return ownedAttempt;
        }
        const attempt = this.prepareWithReplay(component, props, [], scheduledTransitions, !scheduledUrgent && scheduledTransitions.size !== 0);
        if (scheduledUrgent && attempt.status === "suspended") {
          this.ensureScheduledTransitionWork();
        }
        return attempt;
      } catch (error) {
        this.finishTransitionBatches(scheduledTransitions);
        if (scheduledUrgent) {
          this.finishTransitionBatches(this.takeScheduledTransitionBatches());
        }
        throw error;
      }
    }
    prepareWithReplay(component, props, replayEntries, transitionBatches, transitionRender) {
      if (this.unmounted || this.unmounting) {
        throw new Error("Cannot render an unmounted universal root.");
      }
      this.flushPassivesBeforeRender();
      const metadata = getComponentMetadata(component);
      if (metadata !== UNIVERSAL_LAZY_METADATA && metadata.id !== this.renderer) {
        throw new Error(`Universal renderer mismatch: root ${JSON.stringify(this.renderer)} cannot render component ${JSON.stringify(metadata.id)}.`);
      }
      this.pending?.abort();
      this.suspended?.abort();
      const ownerRecord = this.owner?.component === component ? this.owner : createOwnerRecord(this, component, null, ["root"], null);
      const rootPath = [
        { component, identityPath: ownerRecord.identityPath, key: ownerRecord.key, ordinal: 0 }
      ];
      const owner = draftOwner(ownerRecord, null, rootPath);
      owner.componentProps = props;
      const previousAttempt = CURRENT_ATTEMPT;
      const previousOwner = CURRENT_OWNER;
      const previousWarm = CURRENT_UNIVERSAL_WARM;
      const previousWarmClaims = CURRENT_UNIVERSAL_WARM_CLAIMS;
      const previousWarmPlans = ACTIVE_UNIVERSAL_WARM_PLANS.slice();
      const attempt = {
        root: this,
        owner,
        scope: null,
        owners: [owner],
        treeFeatures: 0,
        replayEntries,
        retryThenables: /* @__PURE__ */ new Set,
        nextUniversalId: this.nextUniversalId,
        implicitSlot: 0,
        transitionBatches,
        transitionRender,
        bridgeContextReads: null
      };
      ACTIVE_UNIVERSAL_WARM_PLANS.length = 0;
      CURRENT_UNIVERSAL_WARM = null;
      CURRENT_UNIVERSAL_WARM_CLAIMS = null;
      CURRENT_ATTEMPT = attempt;
      CURRENT_OWNER = owner;
      let nodes;
      try {
        nodes = executeOwner(owner, () => {
          const value = component(props, componentContext(this.renderer));
          return materializeValue(value, this.renderer, null, ["root-output"]);
        });
      } catch (error) {
        const suspendedMemos = collectSuspendedMemos(attempt);
        this.discardDraftOwners(attempt.owners);
        if (error instanceof UniversalSuspense) {
          return this.suspend(error.thenable, component, props, suspendedMemos, transitionBatches, transitionRender, attempt.bridgeContextReads);
        }
        throw error;
      } finally {
        ACTIVE_UNIVERSAL_WARM_PLANS.length = 0;
        ACTIVE_UNIVERSAL_WARM_PLANS.push(...previousWarmPlans);
        CURRENT_UNIVERSAL_WARM = previousWarm;
        CURRENT_UNIVERSAL_WARM_CLAIMS = previousWarmClaims;
        CURRENT_ATTEMPT = previousAttempt;
        CURRENT_OWNER = previousOwner;
      }
      try {
        const rootBlueprint = { kind: "range", key: null, children: nodes };
        const transaction = this.createTransaction(rootBlueprint, attempt, component, props);
        this.pending = transaction;
        return transaction;
      } catch (error) {
        this.discardDraftOwners(attempt.owners);
        throw error;
      }
    }
    render(component, props) {
      if (this.hasAsyncTransport()) {
        throw new Error("A transported universal root must use renderAsync().");
      }
      const attempt = this.prepare(component, props);
      if (attempt.status === "prepared")
        attempt.commit();
      return attempt;
    }
    async renderAsync(component, props) {
      const attempt = this.prepare(component, props);
      if (attempt.status === "prepared")
        await attempt.commitAsync();
      return attempt;
    }
    stableAttemptOwnersEqual(attempt) {
      const contextValuesEqual = (previous, next) => {
        if (previous === null || next === null)
          return previous === next;
        if (previous.size !== next.size)
          return false;
        for (const [context, value] of next) {
          if (!previous.has(context) || !Object.is(previous.get(context), value))
            return false;
        }
        return true;
      };
      let ownerCount = 0;
      const validateOwner = (draft, parent) => {
        ownerCount++;
        const record = draft.record;
        if (!record.mounted || record.disposed || record.parent !== (parent?.record ?? null) || record.visibility !== draft.visibility || record.isBoundary !== draft.isBoundary || record.canHandleSuspense !== draft.canHandleSuspense || record.hasBoundaryError !== draft.hasBoundaryError || !Object.is(record.boundaryError, draft.boundaryError) || record.boundaryThenable !== draft.boundaryThenable || !contextValuesEqual(record.contextValues, draft.contextValues) || draft.appliedUpdates.size !== 0 || record.updates.size !== 0 || record.children.length !== draft.children.length || record.effectOrder.length !== draft.seenEffects.length || record.hooks.size !== draft.hooks.size) {
          return false;
        }
        for (let index = 0;index < draft.children.length; index++) {
          if (record.children[index] !== draft.children[index].record)
            return false;
        }
        for (let index = 0;index < draft.seenEffects.length; index++) {
          const next = draft.seenEffects[index];
          const previous = record.effectOrder[index];
          if (previous.kind !== "effect" || next.previous !== previous || next.phase !== previous.phase || !previous.mounted || !depsEqual(previous.deps, next.deps)) {
            return false;
          }
        }
        for (const hook of draft.hooks.values())
          if (hook.kind !== "effect")
            return false;
        for (const child of draft.children)
          if (!validateOwner(child, draft))
            return false;
        return true;
      };
      return validateOwner(attempt.owner, null) && ownerCount === attempt.owners.length;
    }
    compactLeafProps(list, index) {
      const cached = list.props[index];
      if (cached !== undefined)
        return cached;
      if (list.host === null) {
        throw new Error("A compact universal leaf list has no host plan.");
      }
      const host = list.host;
      const props = host.props === undefined ? {} : { ...host.props };
      const values = list.values[index];
      const bindings = host.bindings;
      if (bindings !== undefined) {
        for (let bindingIndex = 0;bindingIndex < bindings.length; bindingIndex++) {
          const binding = bindings[bindingIndex];
          props[binding[0]] = values[binding[1]];
        }
      }
      if (this.driver.props !== undefined || this.transport !== null) {
        for (const name of Object.keys(props)) {
          props[name] = this.encodeHostProp(host.type, name, props[name]);
        }
      }
      if (list.propCount < 0)
        list.propCount = Object.keys(props).length;
      list.props[index] = props;
      return props;
    }
    expandCompactLeafLists(node) {
      let expanded = null;
      for (let index = 0;index < node.children.length; index++) {
        const child = node.children[index];
        const list = child.kind === "range" ? child.compactLeafList : undefined;
        if (list === undefined) {
          this.expandCompactLeafLists(child);
          if (expanded !== null)
            expanded.push(child);
          continue;
        }
        expanded ??= node.children.slice(0, index);
        const hosts = [];
        if (list.host !== null) {
          const host = list.host;
          for (let leafIndex = 0;leafIndex < list.keys.length; leafIndex++) {
            hosts.push({
              kind: "host",
              key: list.keys[leafIndex],
              type: host.type,
              props: this.compactLeafProps(list, leafIndex),
              ref: null,
              owner: list.owners?.[leafIndex] ?? list.owner,
              events: EMPTY_BLUEPRINT_EVENTS,
              lifecycles: EMPTY_BLUEPRINT_HOST_CALLBACKS,
              localCallbacks: EMPTY_BLUEPRINT_HOST_CALLBACKS,
              visibility: list.visibility,
              children: []
            });
          }
        }
        if (child.key === null)
          expanded.push(...hosts);
        else
          expanded.push({ kind: "range", key: child.key, children: hosts });
      }
      if (expanded !== null)
        node.children = expanded;
    }
    tryCreateCompactLeafUpdateTransaction(blueprint, attempt, component, props) {
      if (this.transport !== null || this.owner === null || attempt.owner.record !== this.owner || this.treeFeatures !== 0 || attempt.treeFeatures !== 0 || attempt.retryThenables.size !== 0 || !this.stableAttemptOwnersEqual(attempt)) {
        return null;
      }
      const matches = [];
      let sawCompactList = false;
      const pairChildren = (records, blueprints) => {
        let recordIndex = 0;
        for (const next of blueprints) {
          const list = next.kind === "range" ? next.compactLeafList : undefined;
          if (list !== undefined) {
            sawCompactList = true;
            if (next.key !== null || list.owners !== null)
              return false;
            if (list.host === null)
              continue;
            const host = list.host;
            if (list.keys.length !== list.values.length)
              return false;
            const start = recordIndex;
            for (let leafIndex = 0;leafIndex < list.keys.length; leafIndex++) {
              const record2 = records[recordIndex++];
              if (record2 === undefined || record2.kind !== "host" || !Object.is(record2.key, list.keys[leafIndex]) || record2.type !== host.type || record2.children.length !== 0 || record2.owner !== list.owner) {
                return false;
              }
            }
            matches.push({ list, records, start });
            continue;
          }
          const record = records[recordIndex++];
          if (record === undefined || record.kind !== "range" || next.kind !== "range" || !sameRecordShape(record, next) || !pairChildren(record.children, next.children)) {
            return false;
          }
        }
        return recordIndex === records.length;
      };
      if (!pairChildren(this.rootRecord.children, blueprint.children) || !sawCompactList) {
        return null;
      }
      for (const { list } of matches) {
        for (let index = 0;index < list.keys.length; index++)
          this.compactLeafProps(list, index);
      }
      const commands = [];
      for (const { list, records, start } of matches) {
        const host = list.host;
        for (let index = 0;index < list.keys.length; index++) {
          const record = records[start + index];
          const hostProps = list.props[index];
          if (shallowPropsEqual(record.props, hostProps, list.propCount))
            continue;
          const kind = this.driver.updates?.classify(host.type, record.props, hostProps) ?? "update";
          const frozenProps = Object.freeze(hostProps);
          if (kind === "update") {
            commands.push({ op: "update", id: record.id, props: frozenProps });
          } else if (kind === "recreate") {
            commands.push({
              op: "recreate",
              id: record.id,
              type: host.type,
              props: frozenProps
            });
          } else {
            throw new TypeError(`Universal update classifier returned invalid kind ${JSON.stringify(kind)}.`);
          }
        }
      }
      if (commands.length === 0)
        return null;
      const batch = freezeUniversalHostBatch(this.renderer, this.nextBatchVersion++, commands);
      const preparedHost = this.driver.prepareBatch(this.container, batch, {
        invokeLocalCallback: (listener, args) => this.invokeLocalCallback(listener, args)
      });
      if (preparedHost === null || typeof preparedHost !== "object" || typeof preparedHost.apply !== "function" || typeof preparedHost.abort !== "function" || preparedHost.afterAccept !== undefined && typeof preparedHost.afterAccept !== "function") {
        throw new TypeError("A universal host driver must return a valid prepared batch token.");
      }
      return new UniversalTransactionImpl(this, batch, () => preparedHost.apply(), null, this.transportIdentity(batch.version), () => {
        for (const { list, records, start } of matches) {
          for (let index = 0;index < list.keys.length; index++) {
            records[start + index].props = list.props[index];
          }
        }
        for (const draft of attempt.owners) {
          const record = draft.record;
          record.componentProps = draft.componentProps;
          record.parent = draft.parent?.record ?? null;
          record.hooks = draft.hooks;
          record.effectOrder = [...draft.seenEffects];
          record.children = draft.children.map((child) => child.record);
          record.contextValues = draft.contextValues;
          record.isBoundary = draft.isBoundary;
          record.canHandleSuspense = draft.canHandleSuspense;
          record.boundaryError = draft.boundaryError;
          record.hasBoundaryError = draft.hasBoundaryError;
          record.boundaryThenable = draft.boundaryThenable;
          record.visibility = draft.visibility;
          record.mounted = true;
          record.disposed = false;
        }
        this.owner = attempt.owner.record;
        this.lastComponent = component;
        this.lastProps = props;
        this.retryRenderInput = null;
        this.urgentBoundarySuspension = null;
        this.bridgeContextReads = attempt.bridgeContextReads;
        this.nextUniversalId = attempt.nextUniversalId;
        this.treeFeatures = 0;
      }, () => preparedHost.afterAccept?.(), () => {}, () => {}, () => {}, null, () => preparedHost.abort(), () => this.discardDraftOwners(attempt.owners), attempt.transitionBatches);
    }
    tryCreateStableLeafUpdateTransaction(blueprint, attempt, component, props) {
      if (this.transport !== null || this.owner === null || attempt.owner.record !== this.owner || this.treeFeatures !== 0 || attempt.treeFeatures !== 0 || attempt.retryThenables.size !== 0) {
        return null;
      }
      if (!this.stableAttemptOwnersEqual(attempt))
        return null;
      const hostRecords = [];
      const hostBlueprints = [];
      const commands = [];
      const pairChildren = (records, blueprints) => {
        if (records.length !== blueprints.length)
          return false;
        for (let index = 0;index < records.length; index++) {
          const record = records[index];
          const next = blueprints[index];
          if (!sameRecordShape(record, next) || record.kind === "portal")
            return false;
          if (record.kind === "host") {
            if (next.kind !== "host")
              return false;
            if (record.children.length !== 0 || next.children.length !== 0 || record.owner !== next.owner) {
              return false;
            }
            hostRecords.push(record);
            hostBlueprints.push(next);
          } else if (!pairChildren(record.children, next.children)) {
            return false;
          }
        }
        return true;
      };
      if (!pairChildren(this.rootRecord.children, blueprint.children))
        return null;
      for (let index = 0;index < hostRecords.length; index++) {
        const record = hostRecords[index];
        const host = hostBlueprints[index];
        if (shallowPropsEqual(record.props, host.props))
          continue;
        const kind = this.driver.updates?.classify(host.type, record.props, host.props) ?? "update";
        const frozenProps = Object.freeze(host.props);
        if (kind === "update") {
          commands.push({ op: "update", id: record.id, props: frozenProps });
        } else if (kind === "recreate") {
          commands.push({
            op: "recreate",
            id: record.id,
            type: host.type,
            props: frozenProps
          });
        } else {
          throw new TypeError(`Universal update classifier returned invalid kind ${JSON.stringify(kind)}.`);
        }
      }
      if (commands.length === 0)
        return null;
      const batch = freezeUniversalHostBatch(this.renderer, this.nextBatchVersion++, commands);
      const preparedHost = this.driver.prepareBatch(this.container, batch, {
        invokeLocalCallback: (listener, args) => this.invokeLocalCallback(listener, args)
      });
      if (preparedHost === null || typeof preparedHost !== "object" || typeof preparedHost.apply !== "function" || typeof preparedHost.abort !== "function" || preparedHost.afterAccept !== undefined && typeof preparedHost.afterAccept !== "function") {
        throw new TypeError("A universal host driver must return a valid prepared batch token.");
      }
      const transaction = new UniversalTransactionImpl(this, batch, () => preparedHost.apply(), null, this.transportIdentity(batch.version), () => {
        for (let index = 0;index < hostRecords.length; index++) {
          const record = hostRecords[index];
          const host = hostBlueprints[index];
          record.props = host.props;
          record.owner = host.owner;
        }
        for (const draft of attempt.owners) {
          const record = draft.record;
          record.componentProps = draft.componentProps;
          record.parent = draft.parent?.record ?? null;
          record.hooks = draft.hooks;
          record.effectOrder = [...draft.seenEffects];
          record.children = draft.children.map((child) => child.record);
          record.contextValues = draft.contextValues;
          record.isBoundary = draft.isBoundary;
          record.canHandleSuspense = draft.canHandleSuspense;
          record.boundaryError = draft.boundaryError;
          record.hasBoundaryError = draft.hasBoundaryError;
          record.boundaryThenable = draft.boundaryThenable;
          record.visibility = draft.visibility;
          record.mounted = true;
          record.disposed = false;
        }
        this.owner = attempt.owner.record;
        this.lastComponent = component;
        this.lastProps = props;
        this.retryRenderInput = null;
        this.urgentBoundarySuspension = null;
        this.bridgeContextReads = attempt.bridgeContextReads;
        this.nextUniversalId = attempt.nextUniversalId;
        this.treeFeatures = 0;
      }, () => preparedHost.afterAccept?.(), () => {}, () => {}, () => {}, null, () => preparedHost.abort(), () => this.discardDraftOwners(attempt.owners), attempt.transitionBatches);
      return transaction;
    }
    createTransaction(blueprint, attempt, component, props) {
      const compactLeafUpdate = this.tryCreateCompactLeafUpdateTransaction(blueprint, attempt, component, props);
      if (compactLeafUpdate !== null)
        return compactLeafUpdate;
      this.expandCompactLeafLists(blueprint);
      const stableLeafUpdate = this.tryCreateStableLeafUpdateTransaction(blueprint, attempt, component, props);
      if (stableLeafUpdate !== null)
        return stableLeafUpdate;
      const stagedPortalRegistrations = /* @__PURE__ */ new Set;
      if (((this.treeFeatures | attempt.treeFeatures) & UNIVERSAL_TREE_PORTAL) === 0) {
        return this.createPreparedTransaction(blueprint, attempt, component, props, stagedPortalRegistrations);
      }
      const preparePortals = (node) => {
        if (node.kind === "portal" && node.registration === null) {
          node.registration = this.preparePortalTarget(node.target);
          stagedPortalRegistrations.add(node.registration);
        }
        for (const child of node.children)
          preparePortals(child);
      };
      try {
        preparePortals(blueprint);
        return this.createPreparedTransaction(blueprint, attempt, component, props, stagedPortalRegistrations);
      } catch (error) {
        for (const registration of stagedPortalRegistrations) {
          try {
            registration.release();
          } catch {}
        }
        throw error;
      }
    }
    createPreparedTransaction(blueprint, attempt, component, props, stagedPortalRegistrations, scopeRecord = this.rootRecord, scopeFeatures = 0, scopePlacement = null) {
      let nextId = this.nextId;
      const scoped = scopeRecord !== this.rootRecord;
      const treeFeatures = (scoped ? scopeFeatures : this.treeFeatures) | attempt.treeFeatures;
      const used = /* @__PURE__ */ new Set([scopeRecord]);
      const changedRangeOwners = [];
      let topologyChanged = false;
      const reconcileChildren = (oldChildren, blueprints) => {
        if ((treeFeatures & UNIVERSAL_TREE_PORTAL) === 0 && oldChildren.length === blueprints.length && oldChildren.every((record, index) => sameRecordShape(record, blueprints[index]))) {
          return oldChildren.map((record, index) => {
            used.add(record);
            const blueprint2 = blueprints[index];
            const draft = {
              record,
              blueprint: blueprint2,
              children: reconcileChildren(record.children, blueprint2.children),
              isNew: false,
              hostUpdate: null
            };
            if (record.kind === "range" && record.owner !== (blueprint2.owner ?? null)) {
              changedRangeOwners.push(draft);
            }
            return draft;
          });
        }
        const keyed = /* @__PURE__ */ new Map;
        for (const old of oldChildren)
          if (old.key !== null)
            keyed.set(old.key, old);
        const claimed = /* @__PURE__ */ new Set;
        const nextKeys = /* @__PURE__ */ new Set;
        const output = [];
        for (let childIndex = 0;childIndex < blueprints.length; childIndex++) {
          const child = blueprints[childIndex];
          let record;
          if (child.key !== null) {
            if (nextKeys.has(child.key)) {
              throw new Error(`Duplicate universal child key ${String(child.key)}.`);
            }
            nextKeys.add(child.key);
            const candidate = keyed.get(child.key);
            if (candidate !== undefined && !claimed.has(candidate) && sameRecordShape(candidate, child)) {
              record = candidate;
            }
          } else {
            const candidate = oldChildren[childIndex];
            if (candidate !== undefined && candidate.key === null && !claimed.has(candidate) && sameRecordShape(candidate, child)) {
              record = candidate;
            }
          }
          if (record?.kind === "portal" && child.kind === "portal") {
            const previousRegistration = record.portalRegistration;
            const nextRegistration = child.registration;
            if (previousRegistration !== null && nextRegistration !== null && previousRegistration !== nextRegistration && Object.is(previousRegistration.handle, nextRegistration.handle)) {
              stagedPortalRegistrations.delete(nextRegistration);
              nextRegistration.release();
              child.registration = previousRegistration;
            } else if (previousRegistration !== null && nextRegistration !== null && !Object.is(previousRegistration.handle, nextRegistration.handle)) {
              topologyChanged = true;
            }
          }
          const isNew = record === undefined;
          record ??= createLogicalRecord(nextId++, child);
          claimed.add(record);
          used.add(record);
          const draft = {
            record,
            blueprint: child,
            children: reconcileChildren(record.children, child.children),
            isNew,
            hostUpdate: null
          };
          if (record.kind === "range" && record.owner !== (child.owner ?? null)) {
            changedRangeOwners.push(draft);
          }
          output.push(draft);
        }
        if (oldChildren.length !== output.length || output.some((draft, index) => draft.record !== oldChildren[index])) {
          topologyChanged = true;
        }
        return output;
      };
      const draftRoot = {
        record: scopeRecord,
        blueprint,
        children: reconcileChildren(scopeRecord.children, blueprint.children),
        isNew: false,
        hostUpdate: null
      };
      const removedRoots = [];
      const findRemoved = (parent) => {
        for (const child of parent.children) {
          if (!used.has(child))
            removedRoots.push(child);
          else
            findRemoved(child);
        }
      };
      if (topologyChanged)
        findRemoved(scopeRecord);
      const previousPortalRegistrations = /* @__PURE__ */ new Set;
      const nextPortalRegistrations = /* @__PURE__ */ new Set;
      let reorderedPortalRecords = null;
      if ((treeFeatures & UNIVERSAL_TREE_PORTAL) !== 0) {
        const previousPortalsByTarget = topologyChanged ? /* @__PURE__ */ new Map : null;
        for (const child of scopeRecord.children) {
          walkLogical(child, (record) => {
            if (record.kind === "portal" && record.portalRegistration !== null) {
              previousPortalRegistrations.add(record.portalRegistration);
              if (previousPortalsByTarget !== null) {
                let records = previousPortalsByTarget.get(record.portalRegistration.handle);
                if (records === undefined) {
                  records = [];
                  previousPortalsByTarget.set(record.portalRegistration.handle, records);
                }
                records.push(record);
              }
            }
          });
        }
        const nextPortalsByTarget = topologyChanged ? /* @__PURE__ */ new Map : null;
        walkDraft(draftRoot, (draft) => {
          if (draft.blueprint.kind !== "portal")
            return;
          const registration = draft.blueprint.registration;
          if (registration === null) {
            throw new Error("A universal portal target was not prepared before reconciliation.");
          }
          nextPortalRegistrations.add(registration);
          if (nextPortalsByTarget !== null) {
            let records = nextPortalsByTarget.get(registration.handle);
            if (records === undefined) {
              records = [];
              nextPortalsByTarget.set(registration.handle, records);
            }
            records.push(draft);
          }
        });
        if (nextPortalsByTarget !== null && previousPortalsByTarget !== null) {
          for (const [target, nextPortals] of nextPortalsByTarget) {
            const previousPortals = previousPortalsByTarget.get(target);
            if (previousPortals?.length === nextPortals.length && nextPortals.every((draft, index) => draft.record === previousPortals[index])) {
              continue;
            }
            const reordered = reorderedPortalRecords ??= /* @__PURE__ */ new Set;
            for (const draft of nextPortals)
              reordered.add(draft.record);
          }
        }
      }
      const previousRegionBridges = /* @__PURE__ */ new Set;
      const stagedRegionBridges = [];
      const nextRegionBridges = /* @__PURE__ */ new Set;
      if ((treeFeatures & UNIVERSAL_TREE_REGION) !== 0) {
        for (const child of scopeRecord.children) {
          walkLogical(child, (record) => {
            if (record.kind !== "host")
              return;
            for (const value of Object.values(record.props)) {
              const bridge = rendererRegionOwnerBridge(value);
              if (bridge !== null)
                previousRegionBridges.add(bridge);
            }
          });
        }
        const attemptedOwnerRecords = new Set(attempt.owners.map((owner) => owner.record));
        walkDraft(draftRoot, (draft) => {
          if (draft.record.kind !== "host")
            return;
          const props2 = draft.blueprint.props;
          for (const name of Object.keys(props2)) {
            const value = props2[name];
            if (!isRendererRegion(value))
              continue;
            if (value.ownerRenderer !== this.renderer) {
              throw new Error(`Universal renderer region owner mismatch: region owner ${JSON.stringify(value.ownerRenderer)} cannot be committed by root ${JSON.stringify(this.renderer)}.`);
            }
            const next = rendererRegionOwnerBridge(value);
            if (next === null) {
              throw new Error("A universal renderer region must be created while its owning component renders.");
            }
            if (!attemptedOwnerRecords.has(next.owner)) {
              throw new Error("A renderer region cannot escape the universal owner attempt that created it.");
            }
            if (nextRegionBridges.has(next)) {
              throw new Error("One renderer-region descriptor cannot own more than one host region.");
            }
            nextRegionBridges.add(next);
            const previous = rendererRegionOwnerBridge(draft.record.props[name]);
            stagedRegionBridges.push({ next, previous });
          }
        });
      }
      const creates = [];
      const updates = [];
      const recreated = /* @__PURE__ */ new Set;
      const hostDrafts = [];
      walkDraft(draftRoot, (draft) => {
        if (draft.record.kind !== "host")
          return;
        hostDrafts.push(draft);
        const blueprintHost = draft.blueprint;
        const props2 = Object.freeze({ ...blueprintHost.props });
        if (draft.isNew) {
          creates.push({
            op: "create",
            id: draft.record.id,
            type: blueprintHost.type,
            props: props2
          });
        } else if (!shallowPropsEqual(draft.record.props, blueprintHost.props)) {
          const kind = this.driver.updates?.classify(blueprintHost.type, draft.record.props, blueprintHost.props) ?? "update";
          if (kind !== "update" && kind !== "recreate") {
            throw new TypeError(`Universal update classifier returned invalid kind ${JSON.stringify(kind)}.`);
          }
          draft.hostUpdate = kind;
          if (kind === "recreate") {
            recreated.add(draft.record);
            updates.push({
              op: "recreate",
              id: draft.record.id,
              type: blueprintHost.type,
              props: props2
            });
          } else {
            updates.push({ op: "update", id: draft.record.id, props: props2 });
          }
        }
      });
      const removes = [];
      const placements = [];
      const planPlacements = (parentId, oldRecords, newDrafts, sourceParentId = parentId, forceMove = false, endAnchor = null) => {
        const oldPhysical = physicalRecords(oldRecords);
        const newPhysical = physicalDrafts(newDrafts);
        const desiredIds = new Set(newPhysical.map((entry) => entry.record.id));
        for (const old of oldPhysical) {
          if (!desiredIds.has(old.id)) {
            removes.push({ op: "remove", parent: sourceParentId, id: old.id });
          }
        }
        const previousIds = new Set(oldPhysical.map((entry) => entry.id));
        const current = forceMove ? [] : oldPhysical.filter((entry) => desiredIds.has(entry.id)).map((entry) => entry.id);
        for (let index = 0;index < newPhysical.length; index++) {
          const draft = newPhysical[index];
          const id = draft.record.id;
          if (current[index] === id)
            continue;
          const currentIndex = current.indexOf(id);
          const before = current[index] ?? endAnchor;
          if (currentIndex === -1) {
            placements.push({
              op: forceMove && previousIds.has(id) ? "move" : "insert",
              parent: parentId,
              id,
              before
            });
          } else {
            current.splice(currentIndex, 1);
            placements.push({ op: "move", parent: parentId, id, before });
          }
          current.splice(index, 0, id);
        }
      };
      if (topologyChanged) {
        walkDraftPostOrder(draftRoot, (draft) => {
          if (draft.record === this.rootRecord) {
            planPlacements(null, this.rootRecord.children, draft.children);
          } else if (scoped && draft === draftRoot && scopePlacement !== null) {
            planPlacements(scopePlacement.parent, draft.record.children, draft.children, scopePlacement.parent, false, scopePlacement.endAnchor);
          } else if (draft.record.kind === "host") {
            planPlacements(draft.record.id, draft.record.children, draft.children);
          } else if (draft.record.kind === "portal") {
            const nextRegistration = draft.blueprint.registration;
            const previousRegistration = draft.record.portalRegistration;
            const retainedTarget = previousRegistration !== null && Object.is(previousRegistration.handle, nextRegistration.handle);
            planPlacements(nextRegistration.handle, draft.record.children, draft.children, previousRegistration?.handle ?? nextRegistration.handle, previousRegistration !== null && !retainedTarget || reorderedPortalRecords?.has(draft.record) === true);
          }
        });
      }
      for (const removed of removedRoots) {
        walkLogical(removed, (record) => {
          if (record.kind !== "portal" || record.portalRegistration === null)
            return;
          for (const child of physicalRecords(record.children)) {
            removes.push({
              op: "remove",
              parent: record.portalRegistration.handle,
              id: child.id
            });
          }
        });
      }
      const hiddenVisibilityCommands = [];
      const visibleVisibilityCommands = [];
      const stageHiddenVisibility = (draft) => {
        if (draft.record.kind !== "host")
          return;
        const nextHidden = draft.blueprint.visibility !== "visible";
        const previousHidden = draft.record.visibility !== "visible";
        if (nextHidden && (draft.isNew || recreated.has(draft.record) || !previousHidden)) {
          hiddenVisibilityCommands.push({
            op: "visibility",
            id: draft.record.id,
            state: "hidden"
          });
        }
      };
      const stageVisibleVisibility = (draft) => {
        if (draft.record.kind !== "host")
          return;
        const nextHidden = draft.blueprint.visibility !== "visible";
        const previousHidden = draft.record.visibility !== "visible";
        if (!nextHidden && !draft.isNew && previousHidden) {
          visibleVisibilityCommands.push({
            op: "visibility",
            id: draft.record.id,
            state: "visible"
          });
        }
      };
      if ((treeFeatures & UNIVERSAL_TREE_HIDDEN) !== 0) {
        walkDraftPostOrder(draftRoot, stageHiddenVisibility);
        walkDraft(draftRoot, stageVisibleVisibility);
      }
      const visibilityCommands = [...hiddenVisibilityCommands, ...visibleVisibilityCommands];
      const removedHosts = [];
      for (const removed of removedRoots)
        collectRemovedPostOrder(removed, removedHosts);
      let nextListener = this.nextListener;
      const eventCommands = [];
      const stagedEvents = /* @__PURE__ */ new Map;
      const stagedVisibleEventRecords = /* @__PURE__ */ new Set;
      if ((treeFeatures & UNIVERSAL_TREE_EVENT) !== 0) {
        walkDraft(draftRoot, (draft) => {
          if (draft.record.kind !== "host")
            return;
          const blueprintHost = draft.blueprint;
          const blueprintEvents = blueprintHost.events;
          const wasVisible = draft.record.visibility === "visible";
          const isVisible = blueprintHost.visibility === "visible";
          if (isVisible)
            stagedVisibleEventRecords.add(draft.record);
          const nextEvents = /* @__PURE__ */ new Map;
          for (const [type, event] of blueprintEvents) {
            const previous = draft.record.events.get(type);
            const listener = previous?.listener ?? nextListener++;
            const committed = { ...event, listener };
            nextEvents.set(type, committed);
            const changed = previous === undefined || previous.handler !== event.handler || previous.priority !== event.priority || previous.owner !== event.owner;
            if (isVisible && (!wasVisible || changed)) {
              eventCommands.push({
                op: "event",
                id: draft.record.id,
                type,
                listener: { id: listener, priority: event.priority }
              });
            }
          }
          for (const [type] of draft.record.events) {
            if (wasVisible && (!isVisible || !nextEvents.has(type))) {
              eventCommands.push({ op: "event", id: draft.record.id, type, listener: null });
            }
          }
          stagedEvents.set(draft.record, nextEvents);
        });
        for (const record of removedHosts) {
          if (record.visibility !== "visible")
            continue;
          for (const [type] of record.events) {
            eventCommands.push({ op: "event", id: record.id, type, listener: null });
          }
        }
      }
      const stageHostCallbacks = (op, readBlueprint, readCommitted) => {
        const commands2 = [];
        const staged = /* @__PURE__ */ new Map;
        const feature = op === "lifecycle" ? UNIVERSAL_TREE_LIFECYCLE : UNIVERSAL_TREE_LOCAL_CALLBACK;
        if ((treeFeatures & feature) === 0)
          return { commands: commands2, staged };
        walkDraft(draftRoot, (draft) => {
          if (draft.record.kind !== "host")
            return;
          const blueprintCallbacks = readBlueprint(draft.blueprint);
          const previousCallbacks = readCommitted(draft.record);
          const nextCallbacks = /* @__PURE__ */ new Map;
          for (const [type, callback] of blueprintCallbacks) {
            const previous = previousCallbacks.get(type);
            const listener = previous?.listener ?? nextListener++;
            nextCallbacks.set(type, { ...callback, listener });
            if (previous === undefined || previous.handler !== callback.handler || previous.owner !== callback.owner) {
              commands2.push({ op, id: draft.record.id, type, listener: { id: listener } });
            }
          }
          for (const [type] of previousCallbacks) {
            if (!nextCallbacks.has(type)) {
              commands2.push({ op, id: draft.record.id, type, listener: null });
            }
          }
          staged.set(draft.record, nextCallbacks);
        });
        for (const record of removedHosts) {
          for (const [type] of readCommitted(record)) {
            commands2.push({ op, id: record.id, type, listener: null });
          }
        }
        return { commands: commands2, staged };
      };
      const lifecycleStage = stageHostCallbacks("lifecycle", (host) => host.lifecycles, (record) => record.lifecycles);
      const localCallbackStage = stageHostCallbacks("local-callback", (host) => host.localCallbacks, (record) => record.localCallbacks);
      const destroys = removedHosts.map((record) => ({
        op: "destroy",
        id: record.id
      }));
      const commands = [
        ...creates,
        ...updates,
        ...eventCommands,
        ...lifecycleStage.commands,
        ...localCallbackStage.commands,
        ...removes,
        ...placements,
        ...visibilityCommands,
        ...destroys
      ];
      const batch = freezeUniversalHostBatch(this.renderer, this.nextBatchVersion++, commands);
      const retryThenables = [...attempt.retryThenables];
      const retryMemos = retryThenables.length === 0 ? [] : collectSuspendedMemos(attempt);
      const refDetaches = [];
      const refAttaches = [];
      const hostDraftsById = /* @__PURE__ */ new Map;
      const lifecycleDrafts = /* @__PURE__ */ new Set;
      if ((treeFeatures & UNIVERSAL_TREE_LIFECYCLE) !== 0) {
        walkDraft(draftRoot, (draft) => {
          if (draft.record.kind !== "host")
            return;
          hostDraftsById.set(draft.record.id, draft);
          if (draft.isNew || draft.hostUpdate !== null)
            lifecycleDrafts.add(draft);
        });
        for (const placement of placements) {
          if (placement.op !== "move")
            continue;
          const draft = hostDraftsById.get(placement.id);
          if (draft !== undefined)
            lifecycleDrafts.add(draft);
        }
      }
      if ((treeFeatures & UNIVERSAL_TREE_REF) !== 0) {
        for (const removed of removedRoots) {
          walkLogical(removed, (record) => {
            if (record.kind === "host" && record.refAttached) {
              refDetaches.push({ record, ref: record.ref, cleanup: record.refCleanup });
            }
          });
        }
        walkDraftPostOrder(draftRoot, (draft) => {
          if (draft.record.kind !== "host")
            return;
          const blueprintHost = draft.blueprint;
          const nextRef = blueprintHost.ref;
          const suspenseHide = draft.record.visibility !== "suspense-hidden" && blueprintHost.visibility === "suspense-hidden";
          const suspenseReveal = draft.record.visibility === "suspense-hidden" && blueprintHost.visibility !== "suspense-hidden";
          if (!draft.isNew && draft.record.refAttached && (recreated.has(draft.record) || suspenseHide || !Object.is(draft.record.ref, nextRef))) {
            refDetaches.push({
              record: draft.record,
              ref: draft.record.ref,
              cleanup: draft.record.refCleanup
            });
          }
          if (nextRef != null && blueprintHost.visibility !== "suspense-hidden" && (draft.isNew || recreated.has(draft.record) || suspenseReveal || !draft.record.refAttached || !Object.is(draft.record.ref, nextRef))) {
            refAttaches.push(draft);
          }
        });
      }
      const draftOwnersParentFirst = [];
      const draftOwnersPostOrder = [];
      const walkDraftOwners = (owner) => {
        draftOwnersParentFirst.push(owner);
        for (const child of owner.children)
          walkDraftOwners(child);
        draftOwnersPostOrder.push(owner);
      };
      walkDraftOwners(attempt.owner);
      const changedContexts = /* @__PURE__ */ new Set;
      for (const draft of draftOwnersParentFirst) {
        const previous = draft.record.contextValues;
        if (previous === null || draft.contextValues === null)
          continue;
        for (const [context, value] of draft.contextValues) {
          if (previous.has(context) && !Object.is(previous.get(context), value)) {
            changedContexts.add(context);
          }
        }
      }
      const draftedRecords = new Set(draftOwnersParentFirst.map((owner) => owner.record));
      const committedOwnersParentFirst = [];
      const walkCommittedOwners = (owner) => {
        if (owner === null)
          return;
        committedOwnersParentFirst.push(owner);
        for (const child of owner.children)
          walkCommittedOwners(child);
      };
      walkCommittedOwners(scoped ? attempt.owner.record : this.owner);
      const removedOwners = committedOwnersParentFirst.filter((owner) => !draftedRecords.has(owner));
      const removedEffectEventCells = collectEffectEventCells(removedOwners);
      const orderedEffectCleanups = [];
      for (const owner of removedOwners) {
        for (const hook of owner.effectOrder) {
          if (hook.mounted)
            orderedEffectCleanups.push({ phase: hook.phase, hook });
        }
      }
      const effectChanges = [];
      const disconnectedPreviousEffects = /* @__PURE__ */ new Set;
      for (const owner of draftOwnersParentFirst) {
        if (owner.record.visibility !== "visible" || owner.visibility === "visible" || !owner.record.mounted) {
          continue;
        }
        const nextBySlot = new Map(owner.seenEffects.map((effect) => [effect.slot, effect]));
        for (const previous of owner.record.effectOrder) {
          if (previous.phase === "insertion" || !previous.mounted)
            continue;
          const next = nextBySlot.get(previous.slot);
          orderedEffectCleanups.push({
            phase: previous.phase,
            hook: next?.phase === previous.phase ? next : previous
          });
          disconnectedPreviousEffects.add(previous);
        }
      }
      for (const owner of draftOwnersPostOrder) {
        const seenSlots = new Set(owner.seenEffects.map((effect) => effect.slot));
        const nextByPrevious = /* @__PURE__ */ new Map;
        for (const next of owner.seenEffects) {
          const visibilityChanged = next.phase !== "insertion" && owner.record.visibility === "visible" !== (owner.visibility === "visible");
          const changed = visibilityChanged || owner.record.hooks.get(next.slot) !== next && (next.previous === null || next.previous.phase !== next.phase || !depsEqual(next.previous.deps, next.deps) || !next.previous.mounted);
          effectChanges.push({ owner, next, changed });
          if (changed && next.previous !== null && next.previous.mounted && !disconnectedPreviousEffects.has(next.previous)) {
            nextByPrevious.set(next.previous, next);
          }
        }
        for (const previous of owner.record.effectOrder) {
          if (!seenSlots.has(previous.slot)) {
            owner.hooks.delete(previous.slot);
            if (previous.mounted && !disconnectedPreviousEffects.has(previous)) {
              orderedEffectCleanups.push({ phase: previous.phase, hook: previous });
            }
            continue;
          }
          const replacement = nextByPrevious.get(previous);
          if (replacement !== undefined) {
            orderedEffectCleanups.push({ phase: previous.phase, hook: replacement });
          }
        }
      }
      let portalReleaseError = NO_PENDING_PASSIVE_ERROR;
      const applyLogicalTopology = () => {
        const applyHost = (draft) => {
          const record = draft.record;
          const host = draft.blueprint;
          record.type = host.type;
          record.props = host.props;
          record.ref = host.ref;
          record.owner = host.owner;
          record.events = stagedEvents.get(record) ?? record.events;
          record.lifecycles = lifecycleStage.staged.get(record) ?? record.lifecycles;
          record.localCallbacks = localCallbackStage.staged.get(record) ?? record.localCallbacks;
          record.visibility = host.visibility;
        };
        const applyRangeOwner = (draft) => {
          const record = draft.record;
          const nextOwner = draft.blueprint.owner ?? null;
          if (record.owner !== nextOwner && record.owner?.range === record) {
            record.owner.range = null;
          }
          record.owner = nextOwner;
          if (nextOwner !== null)
            nextOwner.range = record;
        };
        const apply = (draft, parent) => {
          const record = draft.record;
          record.parent = parent;
          record.key = draft.blueprint.key;
          if (record.kind === "host") {
            applyHost(draft);
          } else if (record.kind === "range") {
            applyRangeOwner(draft);
          } else if (record.kind === "portal") {
            record.portalRegistration = draft.blueprint.registration;
          }
          record.children = draft.children.map((child) => child.record);
          for (const child of draft.children)
            apply(child, record);
        };
        if (topologyChanged)
          apply(draftRoot, scoped ? scopeRecord.parent : null);
        else {
          for (const draft of hostDrafts)
            applyHost(draft);
          for (const draft of changedRangeOwners)
            applyRangeOwner(draft);
        }
        stagedPortalRegistrations.clear();
        for (const registration of previousPortalRegistrations) {
          if (nextPortalRegistrations.has(registration))
            continue;
          try {
            registration.release();
          } catch (error) {
            if (portalReleaseError === NO_PENDING_PASSIVE_ERROR)
              portalReleaseError = error;
          }
        }
      };
      const lifecycleOrder = [];
      if (lifecycleDrafts.size !== 0) {
        walkDraftPostOrder(draftRoot, (draft) => {
          if (lifecycleDrafts.has(draft))
            lifecycleOrder.push(draft);
        });
      }
      const hasPassiveWork = removedEffectEventCells.length !== 0 || orderedEffectCleanups.some((cleanup) => cleanup.phase === "passive") || effectChanges.some(({ next, changed }) => changed && next.phase === "passive");
      const previousScopedEventListeners = /* @__PURE__ */ new Set;
      const previousScopedLocalCallbacks = /* @__PURE__ */ new Set;
      if (scoped) {
        walkLogical(scopeRecord, (record) => {
          if (record.kind !== "host")
            return;
          for (const event of record.events.values()) {
            previousScopedEventListeners.add(event.listener);
          }
          for (const callback of record.localCallbacks.values()) {
            previousScopedLocalCallbacks.add(callback.listener);
          }
        });
      }
      const prepareHost = (value) => this.driver.prepareBatch(this.container, value, {
        invokeLocalCallback: (listener, args) => this.invokeLocalCallback(listener, args)
      });
      const identity = this.transportIdentity(batch.version);
      let preparedHost = null;
      let preparedAsyncHost = null;
      if (this.transport?.mode === "async") {
        preparedAsyncHost = this.transport.prepareBatch(this.container, batch, identity);
        if (preparedAsyncHost === null || typeof preparedAsyncHost !== "object" || typeof preparedAsyncHost.apply !== "function" || typeof preparedAsyncHost.abort !== "function" || preparedAsyncHost.afterAccept !== undefined && typeof preparedAsyncHost.afterAccept !== "function") {
          throw new TypeError("A universal async transport must return a valid prepared batch token.");
        }
      } else {
        preparedHost = this.transport === null ? prepareHost(batch) : this.transport.prepareBatch(this.container, batch, prepareHost);
        if (preparedHost === null || typeof preparedHost !== "object" || typeof preparedHost.apply !== "function" || typeof preparedHost.abort !== "function" || preparedHost.afterAccept !== undefined && typeof preparedHost.afterAccept !== "function") {
          throw new TypeError("A universal host driver must return a valid prepared batch token.");
        }
      }
      const transaction = new UniversalTransactionImpl(this, batch, preparedHost === null ? null : () => preparedHost.apply(), preparedAsyncHost === null ? null : (acknowledge) => preparedAsyncHost.apply(acknowledge), identity, () => {
        applyLogicalTopology();
        if (this.hostAttachments !== null) {
          for (const record of removedHosts)
            this.hostAttachments.records.delete(record.id);
          for (const draft of hostDrafts) {
            this.hostAttachments.records.set(draft.record.id, draft.record);
          }
        }
        if ((treeFeatures & UNIVERSAL_TREE_EVENT) !== 0) {
          const handlers = scoped ? this.handlers : /* @__PURE__ */ new Map;
          const replacedListeners = scoped ? previousScopedEventListeners : this.publishedListeners;
          for (const listener of replacedListeners) {
            EVENT_DISPATCHERS.delete(listener);
            this.publishedListeners.delete(listener);
            handlers.delete(listener);
          }
          for (const [record, events] of stagedEvents) {
            if (!stagedVisibleEventRecords.has(record))
              continue;
            for (const event of events.values()) {
              handlers.set(event.listener, event);
              this.publishedListeners.add(event.listener);
              EVENT_DISPATCHERS.set(event.listener, (payload) => this.dispatchEvent(event.listener, payload));
            }
          }
          this.handlers = handlers;
        }
        if ((treeFeatures & UNIVERSAL_TREE_LOCAL_CALLBACK) !== 0) {
          const localCallbacks = scoped ? this.localCallbacks : /* @__PURE__ */ new Map;
          for (const listener of previousScopedLocalCallbacks) {
            localCallbacks.delete(listener);
          }
          for (const callbacks of localCallbackStage.staged.values()) {
            for (const callback of callbacks.values()) {
              localCallbacks.set(callback.listener, callback);
            }
          }
          this.localCallbacks = localCallbacks;
        }
        for (const owner of removedOwners) {
          owner.disposed = true;
          owner.mounted = false;
          owner.componentProps = null;
          owner.range = null;
          owner.updates.clear();
        }
        for (const draft of draftOwnersParentFirst) {
          const record = draft.record;
          record.componentProps = draft.componentProps;
          if (!scoped || draft !== attempt.owner) {
            record.parent = draft.parent?.record ?? null;
          }
          record.hooks = draft.hooks;
          record.effectOrder = [...draft.seenEffects];
          record.children = draft.children.map((child) => child.record);
          record.contextValues = draft.contextValues;
          record.isBoundary = draft.isBoundary;
          record.canHandleSuspense = draft.canHandleSuspense;
          record.boundaryError = draft.boundaryError;
          record.hasBoundaryError = draft.hasBoundaryError;
          record.boundaryThenable = draft.boundaryThenable;
          record.visibility = draft.visibility;
          record.mounted = true;
          record.disposed = false;
          for (const [slot, applied] of draft.appliedUpdates) {
            const queue = record.updates.get(slot);
            if (queue !== applied.queue)
              continue;
            if (!applied.lane) {
              queue.splice(0, applied.consumed);
              if (queue.batches !== undefined) {
                queue.batches.splice(0, applied.consumed);
                queue.rebases?.splice(0, applied.consumed);
                queue.baseState = applied.baseState;
              }
              if (queue.length === 0)
                record.updates.delete(slot);
              continue;
            }
            const appendedValues = queue.slice(applied.consumed);
            const appendedBatches = queue.batches?.slice(applied.consumed) ?? new Array(appendedValues.length).fill(null);
            const appendedRebases = queue.rebases?.slice(applied.consumed) ?? new Array(appendedValues.length).fill(false);
            queue.length = 0;
            queue.push(...applied.remainingValues, ...appendedValues);
            queue.baseState = applied.baseState;
            queue.batches = [...applied.remainingBatches, ...appendedBatches];
            const rebases = [...applied.remainingRebases, ...appendedRebases];
            if (rebases.some(Boolean))
              queue.rebases = rebases;
            else
              delete queue.rebases;
            if (queue.length === 0) {
              record.updates.delete(slot);
            } else if (queue.batches.every((batch2) => batch2 === null)) {
              const pendingValues = queue.filter((_, index) => !rebases[index]);
              queue.length = 0;
              queue.push(...pendingValues);
              delete queue.kind;
              delete queue.baseState;
              delete queue.batches;
              delete queue.rebases;
              if (queue.length === 0)
                record.updates.delete(slot);
            }
          }
          for (const hook of record.hooks.values()) {
            if (hook.kind === "effect-event") {
              hook.cell.impl = hook.next;
              hook.cell.active = true;
            }
          }
        }
        if (!scoped)
          this.owner = attempt.owner.record;
        this.lastComponent = component;
        this.lastProps = props;
        this.retryRenderInput = null;
        this.urgentBoundarySuspension = null;
        if (!scoped)
          this.bridgeContextReads = attempt.bridgeContextReads;
        if (retryThenables.length > 0) {
          this.publishLocalReplay(retryThenables, retryMemos, component, props);
        }
        this.nextId = nextId;
        this.nextUniversalId = attempt.nextUniversalId;
        this.nextListener = nextListener;
        this.treeFeatures = scoped ? this.treeFeatures | attempt.treeFeatures : attempt.treeFeatures;
        for (const context of changedContexts)
          context.$$version++;
        const retainedRegionCells = /* @__PURE__ */ new Set;
        for (const { next, previous } of stagedRegionBridges) {
          retainedRegionCells.add(next.activate(previous));
        }
        const deactivatedRegionCells = /* @__PURE__ */ new Set;
        for (const previous of previousRegionBridges) {
          const cell = previous.lifecycle();
          if (cell === null || retainedRegionCells.has(cell) || deactivatedRegionCells.has(cell)) {
            continue;
          }
          deactivatedRegionCells.add(cell);
          previous.deactivate();
        }
        if (portalReleaseError !== NO_PENDING_PASSIVE_ERROR)
          throw portalReleaseError;
      }, () => (preparedHost ?? preparedAsyncHost)?.afterAccept?.(), () => {
        const tasks = [];
        for (const cleanup of orderedEffectCleanups) {
          if (cleanup.phase === "insertion") {
            tasks.push(() => runOwnedEffectCleanup(cleanup.hook));
          }
        }
        for (const { next, changed } of effectChanges) {
          if (changed && next.phase === "insertion")
            tasks.push(() => runOwnedEffectCreate(next));
        }
        for (const cleanup of orderedEffectCleanups) {
          if (cleanup.phase === "layout") {
            tasks.push(() => runOwnedEffectCleanup(cleanup.hook));
          }
        }
        for (const { record, ref, cleanup } of refDetaches) {
          tasks.push(() => runOwnedCommit(record.owner, () => detachRef(record, ref, cleanup)));
        }
        runCommitTasks(tasks);
      }, () => {
        const tasks = [];
        for (const draft of lifecycleOrder) {
          const record = draft.record;
          for (const callback of record.lifecycles.values()) {
            tasks.push(() => runOwnedCommit(callback.owner, () => callback.handler(this.driver.getPublicInstance(this.container, record.id))));
          }
        }
        runCommitTasks(tasks);
      }, () => {
        const tasks = [];
        if (this.driver.attachments === undefined) {
          for (const draft of refAttaches) {
            const record = draft.record;
            tasks.push(() => runOwnedCommit(record.owner, () => attachRef(record, this.driver.getPublicInstance(this.container, record.id))));
          }
        } else {
          for (const draft of refAttaches) {
            const record = draft.record;
            tasks.push(() => runOwnedCommit(record.owner, () => this.attachHostRef(record)));
          }
          tasks.push(() => this.flushPendingHostAttachmentBatches());
        }
        for (const { owner, next, changed } of effectChanges) {
          if (changed && next.phase === "layout" && owner.visibility === "visible") {
            tasks.push(() => runOwnedEffectCreate(next));
          }
        }
        runCommitTasks(tasks);
      }, hasPassiveWork ? () => {
        const tasks = [];
        try {
          for (const cleanup of orderedEffectCleanups) {
            if (cleanup.phase === "passive") {
              tasks.push(() => runOwnedEffectCleanup(cleanup.hook));
            }
          }
          if (this.unmounted || this.owner === null || this.owner.disposed) {
            runCommitTasks(tasks);
            return;
          }
          for (const { owner, next, changed } of effectChanges) {
            if (!changed || next.phase !== "passive")
              continue;
            if (owner.record.hooks.get(next.slot) !== next || owner.record.disposed || owner.record.visibility !== "visible") {
              continue;
            }
            tasks.push(() => runOwnedEffectCreate(next));
          }
          runCommitTasks(tasks);
        } finally {
          deactivateEffectEventCells(removedEffectEventCells);
        }
      } : null, () => preparedHost === null ? preparedAsyncHost.abort() : preparedHost.abort(), () => {
        const tasks = [...stagedPortalRegistrations].map((registration) => () => registration.release());
        stagedPortalRegistrations.clear();
        tasks.push(() => this.discardDraftOwners(draftOwnersParentFirst));
        runCommitTasks(tasks);
      }, attempt.transitionBatches);
      return transaction;
    }
    finish(transaction) {
      if (this.pending === transaction) {
        this.pending = null;
        if (transaction.status === "committed") {
          this.completeTransitionBatches(transaction.transitionBatches);
        } else {
          this.requeueTransitionBatches(transaction.transitionBatches);
        }
        if (this.hostAttachments !== null)
          this.queueHostAttachmentFlush();
        this.ensureScheduledTransitionWork();
      }
    }
    unmount() {
      if (this.hasAsyncTransport()) {
        throw new Error("A transported universal root must use unmountAsync().");
      }
      if (this.unmounted)
        return;
      const work = this.stageUnmount();
      let acceptedHostError = NO_PENDING_PASSIVE_ERROR;
      if (work.batch !== null) {
        const prepare = (value) => this.driver.prepareBatch(this.container, value, {
          invokeLocalCallback: (listener, args) => this.invokeLocalCallback(listener, args)
        });
        const prepared = this.transport === null ? prepare(work.batch) : this.transport.prepareBatch(this.container, work.batch, prepare);
        try {
          runCommitTasks([
            () => prepared.apply(),
            () => this.markBatchAccepted(work.batch.version),
            () => prepared.afterAccept?.()
          ]);
        } catch (error) {
          acceptedHostError = error;
        }
      }
      work.finalize(acceptedHostError);
    }
    unmountAsync() {
      const transport = this.transport;
      if (transport?.mode !== "async") {
        try {
          this.unmount();
          return Promise.resolve();
        } catch (error) {
          return Promise.reject(error);
        }
      }
      if (this.unmountPromise !== null)
        return this.unmountPromise;
      if (this.unmounted)
        return Promise.resolve();
      if (this.pending?.isAwaitingTransportAcknowledgement()) {
        return Promise.reject(new Error("Cannot unmount a universal root while a batch awaits acknowledgement."));
      }
      this.unmounting = true;
      let work;
      try {
        work = this.stageUnmount();
      } catch (error) {
        this.resumeAfterRejectedUnmount();
        return Promise.reject(error);
      }
      if (work.batch === null) {
        try {
          work.finalize(NO_PENDING_PASSIVE_ERROR);
          return Promise.resolve();
        } catch (error) {
          return Promise.reject(error);
        }
      }
      const batch = work.batch;
      const identity = this.transportIdentity(batch.version);
      let prepared;
      try {
        prepared = transport.prepareBatch(this.container, batch, identity);
      } catch (error) {
        this.resumeAfterRejectedUnmount();
        return Promise.reject(error);
      }
      if (prepared === null || typeof prepared !== "object" || typeof prepared.apply !== "function" || typeof prepared.abort !== "function" || prepared.afterAccept !== undefined && typeof prepared.afterAccept !== "function") {
        this.resumeAfterRejectedUnmount();
        return Promise.reject(new TypeError("A universal async transport must return a valid prepared batch token."));
      }
      let acknowledged = false;
      let closed = false;
      let finalizeError = NO_PENDING_PASSIVE_ERROR;
      const rejectBeforeAcknowledgement = (error) => {
        closed = true;
        runCommitTasks([
          () => {
            throw error;
          },
          () => prepared.abort(),
          () => this.resumeAfterRejectedUnmount()
        ]);
        throw error;
      };
      const acknowledge = (message) => {
        if (closed || acknowledged || this.unmounted) {
          throw new Error(`Universal transport received a stale or duplicate acknowledgement for batch ${batch.version}.`);
        }
        this.validateTransportAcknowledgement(message, batch.version);
        acknowledged = true;
        this.markBatchAccepted(batch.version);
        try {
          runCommitTasks([
            () => prepared.afterAccept?.(),
            () => work.finalize(NO_PENDING_PASSIVE_ERROR)
          ]);
        } catch (error) {
          finalizeError = error;
        }
      };
      let applying;
      try {
        const result = prepared.apply(acknowledge);
        if (result === null || typeof result !== "object" || typeof result.then !== "function") {
          throw new TypeError("A universal async transport apply() method must return a Promise.");
        }
        applying = Promise.resolve(result);
      } catch (error) {
        closed = true;
        applying = Promise.reject(error);
      }
      this.unmountPromise = applying.then(() => {
        closed = true;
        if (!acknowledged) {
          return rejectBeforeAcknowledgement(new Error(`Universal transport completed teardown batch ${batch.version} without acknowledgement.`));
        }
        if (finalizeError !== NO_PENDING_PASSIVE_ERROR)
          throw finalizeError;
      }, (error) => {
        closed = true;
        if (!acknowledged) {
          return rejectBeforeAcknowledgement(error);
        }
        if (finalizeError !== NO_PENDING_PASSIVE_ERROR)
          throw finalizeError;
        throw error;
      }).finally(() => {
        this.unmountPromise = null;
      });
      return this.unmountPromise;
    }
    stageUnmount() {
      let pendingAbortError = NO_PENDING_PASSIVE_ERROR;
      try {
        this.pending?.abort();
      } catch (error) {
        pendingAbortError = error;
      }
      const owners = [];
      const collectOwners = (owner) => {
        if (owner === null)
          return;
        owners.push(owner);
        for (const child of owner.children)
          collectOwners(child);
      };
      collectOwners(this.owner);
      const stagedTransitionBatches = /* @__PURE__ */ new Set;
      for (const owner of owners) {
        for (const queue of owner.updates.values()) {
          for (const transition of queue.batches ?? []) {
            if (transition !== null)
              stagedTransitionBatches.add(transition);
          }
        }
      }
      const effectEventCells = collectEffectEventCells(owners);
      const effects = owners.flatMap((owner) => owner.effectOrder);
      const children = [...this.rootRecord.children];
      const regionBridges = /* @__PURE__ */ new Set;
      for (const child of children) {
        walkLogical(child, (record) => {
          if (record.kind !== "host")
            return;
          for (const value of Object.values(record.props)) {
            const bridge = rendererRegionOwnerBridge(value);
            if (bridge !== null)
              regionBridges.add(bridge);
          }
        });
      }
      const physical = physicalRecords(this.rootRecord.children);
      const portalRegistrations = /* @__PURE__ */ new Set;
      const portalRemoves = [];
      for (const child of this.rootRecord.children) {
        walkLogical(child, (record) => {
          if (record.kind !== "portal" || record.portalRegistration === null)
            return;
          portalRegistrations.add(record.portalRegistration);
          for (const physicalChild of physicalRecords(record.children)) {
            portalRemoves.push({
              op: "remove",
              parent: record.portalRegistration.handle,
              id: physicalChild.id
            });
          }
        });
      }
      const removedHosts = [];
      for (const child of this.rootRecord.children)
        collectRemovedPostOrder(child, removedHosts);
      const batch = removedHosts.length === 0 ? null : freezeUniversalHostBatch(this.renderer, this.nextBatchVersion++, [
        ...removedHosts.flatMap((record) => [...record.events.keys()].map((type) => ({
          op: "event",
          id: record.id,
          type,
          listener: null
        }))),
        ...removedHosts.flatMap((record) => [...record.lifecycles.keys()].map((type) => ({
          op: "lifecycle",
          id: record.id,
          type,
          listener: null
        }))),
        ...removedHosts.flatMap((record) => [...record.localCallbacks.keys()].map((type) => ({
          op: "local-callback",
          id: record.id,
          type,
          listener: null
        }))),
        ...physical.map((record) => ({
          op: "remove",
          parent: null,
          id: record.id
        })),
        ...portalRemoves,
        ...removedHosts.map((record) => ({ op: "destroy", id: record.id }))
      ]);
      return {
        batch,
        finalize: (acceptedHostError) => {
          this.scheduled = false;
          this.scheduledUrgent = false;
          this.scheduledFullRoot = false;
          this.scheduledOwners.clear();
          SCHEDULED_UNIVERSAL_ROOTS.delete(this);
          const transitionBatches = new Set(this.takeScheduledTransitionBatches());
          for (const transition of stagedTransitionBatches)
            transitionBatches.add(transition);
          this.finishTransitionBatches(transitionBatches);
          this.suspended?.abort();
          this.cancelSuspendedReplays();
          this.scheduled = false;
          this.scheduledUrgent = false;
          this.scheduledFullRoot = false;
          this.scheduledOwners.clear();
          SCHEDULED_UNIVERSAL_ROOTS.delete(this);
          let attachmentUnsubscribeError = NO_PENDING_PASSIVE_ERROR;
          if (this.hostAttachments !== null) {
            try {
              this.disposeHostAttachments();
            } catch (error) {
              attachmentUnsubscribeError = error;
            }
          }
          this.rootRecord.children = [];
          let portalReleaseError = NO_PENDING_PASSIVE_ERROR;
          for (const registration of portalRegistrations) {
            try {
              registration.release();
            } catch (error) {
              if (portalReleaseError === NO_PENDING_PASSIVE_ERROR)
                portalReleaseError = error;
            }
          }
          this.portalHandles.clear();
          for (const listener of this.publishedListeners)
            EVENT_DISPATCHERS.delete(listener);
          this.publishedListeners.clear();
          this.handlers = /* @__PURE__ */ new Map;
          this.localCallbacks = /* @__PURE__ */ new Map;
          for (const owner of owners) {
            owner.disposed = true;
            owner.mounted = false;
            owner.componentProps = null;
            owner.range = null;
            owner.updates.clear();
          }
          const deactivatedRegionCells = /* @__PURE__ */ new Set;
          for (const bridge of regionBridges) {
            const cell = bridge.lifecycle();
            if (cell === null || deactivatedRegionCells.has(cell))
              continue;
            deactivatedRegionCells.add(cell);
            bridge.deactivate();
          }
          this.owner = null;
          this.urgentBoundarySuspension = null;
          this.bridgeContextReads = null;
          this.treeFeatures = 0;
          this.unmounted = true;
          this.unmounting = false;
          this.lastComponent = null;
          this.retryRenderInput = null;
          let pendingPassiveError = NO_PENDING_PASSIVE_ERROR;
          try {
            this.flushPassiveTasks();
          } catch (error) {
            pendingPassiveError = error;
          }
          const insertionTasks = [];
          const layoutTasks = [];
          const refTasks = [];
          const passiveTasks = [];
          for (const hook of effects) {
            if (!hook.mounted)
              continue;
            if (hook.phase === "passive")
              passiveTasks.push(() => runOwnedEffectCleanup(hook));
            else if (hook.phase === "insertion") {
              insertionTasks.push(() => runOwnedEffectCleanup(hook));
            } else {
              layoutTasks.push(() => runOwnedEffectCleanup(hook));
            }
          }
          for (const child of children) {
            walkLogical(child, (record) => {
              if (record.refAttached) {
                refTasks.push(() => runOwnedCommit(record.owner, () => detachRef(record)));
              }
            });
          }
          const syncTasks = [...insertionTasks, ...layoutTasks, ...refTasks];
          if (attachmentUnsubscribeError !== NO_PENDING_PASSIVE_ERROR) {
            syncTasks.unshift(() => {
              throw attachmentUnsubscribeError;
            });
          }
          if (acceptedHostError !== NO_PENDING_PASSIVE_ERROR) {
            syncTasks.unshift(() => {
              throw acceptedHostError;
            });
          }
          if (portalReleaseError !== NO_PENDING_PASSIVE_ERROR) {
            syncTasks.unshift(() => {
              throw portalReleaseError;
            });
          }
          if (pendingPassiveError !== NO_PENDING_PASSIVE_ERROR) {
            syncTasks.unshift(() => {
              throw pendingPassiveError;
            });
          }
          if (pendingAbortError !== NO_PENDING_PASSIVE_ERROR) {
            syncTasks.unshift(() => {
              throw pendingAbortError;
            });
          }
          if (passiveTasks.length > 0) {
            this.enqueuePassive(() => {
              try {
                runCommitTasks(passiveTasks);
              } finally {
                deactivateEffectEventCells(effectEventCells);
              }
            });
            runCommitTasks(syncTasks);
          } else {
            try {
              runCommitTasks(syncTasks);
            } finally {
              deactivateEffectEventCells(effectEventCells);
            }
          }
        }
      };
    }
  }

  class UniversalTransactionImpl {
    constructor(root, batch, applyHost, applyHostAsync, transportIdentity, publishHost, afterHostAccept, afterMutation, lifecycle, layout, passive, abortHost, onAbort, transitionBatches) {
      this.root = root;
      this.batch = batch;
      this.applyHost = applyHost;
      this.applyHostAsync = applyHostAsync;
      this.transportIdentity = transportIdentity;
      this.publishHost = publishHost;
      this.afterHostAccept = afterHostAccept;
      this.afterMutation = afterMutation;
      this.lifecycle = lifecycle;
      this.layout = layout;
      this.passive = passive;
      this.abortHost = abortHost;
      this.onAbort = onAbort;
      this.transitionBatches = transitionBatches;
    }
    root;
    batch;
    applyHost;
    applyHostAsync;
    transportIdentity;
    publishHost;
    afterHostAccept;
    afterMutation;
    lifecycle;
    layout;
    passive;
    abortHost;
    onAbort;
    transitionBatches;
    state = "prepared";
    hostAccepted = false;
    commitStarted = false;
    completion = null;
    acceptedCommitError = NO_PENDING_PASSIVE_ERROR;
    passiveScheduled = false;
    passiveRan = false;
    get status() {
      return this.state;
    }
    isAwaitingTransportAcknowledgement() {
      return this.applyHostAsync !== null && this.commitStarted && !this.hostAccepted;
    }
    commitMutation() {
      if (this.state !== "prepared" || this.hostAccepted)
        return;
      if (this.applyHost === null) {
        throw new Error("A transported universal transaction must use commitAsync().");
      }
      this.commitStarted = true;
      this.hostAccepted = true;
      runCommitTasks([
        this.applyHost,
        () => this.root.markBatchAccepted(this.batch.version),
        this.publishHost,
        this.afterHostAccept,
        this.afterMutation,
        this.lifecycle
      ]);
    }
    commitLayout() {
      if (this.state !== "prepared")
        return;
      if (!this.hostAccepted)
        this.commitMutation();
      if (this.state !== "prepared")
        return;
      try {
        this.layout();
      } finally {
        this.state = "committed";
        this.root.finish(this);
        this.schedulePassive();
      }
    }
    commitPassive() {
      if (this.state !== "committed")
        return;
      this.schedulePassive();
      this.root.flushPassivesBeforeRender();
    }
    commit() {
      if (this.state !== "prepared")
        return;
      if (this.applyHostAsync !== null) {
        throw new Error("A transported universal transaction must use commitAsync().");
      }
      let hasError = false;
      let firstError;
      try {
        this.commitMutation();
      } catch (error) {
        hasError = true;
        firstError = error;
      }
      if (this.hostAccepted) {
        try {
          this.commitLayout();
        } catch (error) {
          if (!hasError) {
            hasError = true;
            firstError = error;
          }
        }
      }
      if (hasError)
        throw firstError;
    }
    commitAsync() {
      if (this.applyHostAsync === null) {
        try {
          this.commit();
          return Promise.resolve();
        } catch (error) {
          return Promise.reject(error);
        }
      }
      if (this.completion !== null)
        return this.completion;
      if (this.state !== "prepared")
        return Promise.resolve();
      this.commitStarted = true;
      const acknowledge = (message) => {
        if (this.state !== "prepared" || this.hostAccepted) {
          throw new Error(`Universal transport received a stale or duplicate acknowledgement for batch ${this.batch.version}.`);
        }
        this.root.validateTransportAcknowledgement(message, this.transportIdentity.version);
        this.hostAccepted = true;
        let hasError = false;
        let firstError;
        try {
          runCommitTasks([
            () => this.root.markBatchAccepted(this.batch.version),
            this.publishHost,
            this.afterHostAccept,
            this.afterMutation,
            this.lifecycle
          ]);
        } catch (error) {
          hasError = true;
          firstError = error;
        }
        try {
          this.commitLayout();
        } catch (error) {
          if (!hasError) {
            hasError = true;
            firstError = error;
          }
        }
        if (hasError)
          this.acceptedCommitError = firstError;
      };
      let applying;
      try {
        const result = this.applyHostAsync(acknowledge);
        if (result === null || typeof result !== "object" || typeof result.then !== "function") {
          throw new TypeError("A universal async transport apply() method must return a Promise.");
        }
        applying = Promise.resolve(result);
      } catch (error) {
        applying = Promise.reject(error);
      }
      this.completion = applying.then(() => {
        if (!this.hostAccepted) {
          const error = new Error(`Universal transport completed batch ${this.batch.version} without acknowledgement.`);
          this.rejectBeforeAcknowledgement();
          throw error;
        }
        if (this.acceptedCommitError !== NO_PENDING_PASSIVE_ERROR) {
          throw this.acceptedCommitError;
        }
      }, (error) => {
        if (!this.hostAccepted) {
          this.rejectBeforeAcknowledgement();
          throw error;
        }
        if (this.acceptedCommitError !== NO_PENDING_PASSIVE_ERROR) {
          throw this.acceptedCommitError;
        }
        throw error;
      });
      return this.completion;
    }
    rejectBeforeAcknowledgement() {
      if (this.state !== "prepared" || this.hostAccepted)
        return;
      this.state = "aborted";
      try {
        runCommitTasks([this.abortHost, this.onAbort]);
      } finally {
        this.root.finish(this);
      }
    }
    schedulePassive() {
      const passive = this.passive;
      if (passive === null || this.passiveScheduled)
        return;
      this.passiveScheduled = true;
      this.root.enqueuePassive(() => {
        if (this.passiveRan)
          return;
        this.passiveRan = true;
        passive();
      });
    }
    abort() {
      if (this.state !== "prepared")
        return;
      if (this.hostAccepted) {
        throw new Error("A universal transaction cannot be aborted after its host batch committed.");
      }
      if (this.commitStarted) {
        throw new Error("A universal transaction cannot be aborted while awaiting transport acknowledgement.");
      }
      this.state = "aborted";
      try {
        runCommitTasks([this.abortHost, this.onAbort]);
      } finally {
        this.root.finish(this);
      }
    }
  }
  function queuePendingUniversalWork() {
    for (const root of [...SCHEDULED_UNIVERSAL_ROOTS])
      root.queueScheduledWork();
  }
  function flushScheduledUniversalWave() {
    for (const root of [...SCHEDULED_UNIVERSAL_ROOTS])
      root.flushScheduledWork();
  }
  function flushUniversalPassiveWave() {
    for (const root of [...PENDING_UNIVERSAL_PASSIVE_ROOTS])
      root.flushPassiveTasks();
  }
  var INLINE_UNIVERSAL_FLUSHER = (run) => run();
  function runUniversalSyncBoundary(run, flushOwner, includePassives, label) {
    const canDrain = UNIVERSAL_SYNC_DEPTH === 0 && CURRENT_ATTEMPT === null && UNIVERSAL_COMMIT_TASK_DEPTH === 0;
    UNIVERSAL_SYNC_DEPTH++;
    if (!canDrain) {
      try {
        return run();
      } finally {
        UNIVERSAL_SYNC_DEPTH--;
        if (UNIVERSAL_SYNC_DEPTH === 0)
          queuePendingUniversalWork();
      }
    }
    let completed = false;
    let invoked = false;
    let result;
    try {
      for (let pass = 0;pass < UNIVERSAL_SYNC_DRAIN_LIMIT; pass++) {
        flushOwner(() => {
          if (!invoked) {
            invoked = true;
            result = run();
          }
          flushScheduledUniversalWave();
          if (includePassives)
            flushUniversalPassiveWave();
        });
        if (SCHEDULED_UNIVERSAL_ROOTS.size === 0 && (!includePassives || PENDING_UNIVERSAL_PASSIVE_ROOTS.size === 0)) {
          completed = true;
          return result;
        }
      }
      throw new Error(`${label}(): scheduler did not stabilize after ${UNIVERSAL_SYNC_DRAIN_LIMIT} iterations — likely an infinite render loop`);
    } finally {
      UNIVERSAL_SYNC_DEPTH--;
      if (UNIVERSAL_SYNC_DEPTH === 0 && !completed)
        queuePendingUniversalWork();
    }
  }
  function flushUniversalSync(run, flushOwner = INLINE_UNIVERSAL_FLUSHER) {
    return runUniversalSyncBoundary(run, flushOwner, false, "flushUniversalSync");
  }
  function createUniversalRoot(container, driver, options = {}) {
    if (options.scheduleMicrotask !== undefined && typeof options.scheduleMicrotask !== "function") {
      throw new TypeError("Universal root options.scheduleMicrotask must be a function.");
    }
    const scheduleMicrotask = options.scheduleMicrotask ?? null;
    if (scheduleMicrotask === null && readGlobalMicrotaskScheduler() === undefined) {
      throw new Error("Universal roots require options.scheduleMicrotask when the host has no global queueMicrotask.");
    }
    return new UniversalRootImpl(container, driver, options.transport ?? null, scheduleMicrotask);
  }
  function readGlobalMicrotaskScheduler() {
    const scheduler = globalThis.queueMicrotask;
    return typeof scheduler === "function" ? scheduler : undefined;
  }
  // contracts/spec/spec.ts
  var SCREEN_W = 480;
  var SCREEN_H = 272;
  var NODE_TYPE = {
    view: 0,
    text: 1,
    image: 2,
    surface: 3
  };
  var ROOT_ID = 1;
  var STYLE_ID_NONE = -1;
  var PROP = {
    width: 1,
    height: 2,
    minW: 3,
    minH: 4,
    maxW: 5,
    maxH: 6,
    paddingT: 8,
    paddingR: 9,
    paddingB: 10,
    paddingL: 11,
    marginT: 12,
    marginR: 13,
    marginB: 14,
    marginL: 15,
    gap: 16,
    flexDir: 17,
    justify: 18,
    align: 19,
    grow: 20,
    shrink: 21,
    basis: 22,
    flexWrap: 23,
    posType: 24,
    insetT: 25,
    insetR: 26,
    insetB: 27,
    insetL: 28,
    display: 29,
    overflow: 30,
    zIndex: 31,
    hitPass: 32,
    bgColor: 64,
    gradFrom: 65,
    gradTo: 66,
    gradDir: 67,
    radius: 68,
    opacity: 69,
    borderColor: 70,
    borderWidth: 71,
    shadow: 72,
    bevelOuterLight: 77,
    bevelOuterDark: 78,
    bevelInnerLight: 79,
    bevelInnerDark: 80,
    bevelWidth: 81,
    gradVia: 82,
    gradViaPos: 83,
    textColor: 96,
    fontSlot: 97,
    textAlign: 98,
    lineHeight: 99,
    tracking: 100,
    translateX: 128,
    translateY: 129,
    scale: 130,
    rotate: 131,
    scaleX: 132,
    scaleY: 133,
    originX: 134,
    originY: 135,
    rotateX: 136,
    rotateY: 137,
    translateZ: 138,
    perspective: 139,
    arcStart: 140,
    arcSweep: 141,
    arcWidth: 142
  };
  var ANIMATABLE = [
    "width",
    "height",
    "paddingT",
    "paddingR",
    "paddingB",
    "paddingL",
    "marginT",
    "marginR",
    "marginB",
    "marginL",
    "gap",
    "basis",
    "insetT",
    "insetR",
    "insetB",
    "insetL",
    "bgColor",
    "gradFrom",
    "gradTo",
    "radius",
    "opacity",
    "borderColor",
    "borderWidth",
    "textColor",
    "lineHeight",
    "tracking",
    "translateX",
    "translateY",
    "scale",
    "rotate",
    "scaleX",
    "scaleY",
    "rotateX",
    "rotateY",
    "translateZ",
    "arcStart",
    "arcSweep",
    "arcWidth"
  ];
  function animBit(prop) {
    return ANIMATABLE.indexOf(prop);
  }
  var VALUE_KIND = {
    f32: 0,
    color: 1,
    int: 2
  };
  var PROP_VALUE_KIND = {
    width: VALUE_KIND.f32,
    height: VALUE_KIND.f32,
    minW: VALUE_KIND.f32,
    minH: VALUE_KIND.f32,
    maxW: VALUE_KIND.f32,
    maxH: VALUE_KIND.f32,
    paddingT: VALUE_KIND.f32,
    paddingR: VALUE_KIND.f32,
    paddingB: VALUE_KIND.f32,
    paddingL: VALUE_KIND.f32,
    marginT: VALUE_KIND.f32,
    marginR: VALUE_KIND.f32,
    marginB: VALUE_KIND.f32,
    marginL: VALUE_KIND.f32,
    gap: VALUE_KIND.f32,
    flexDir: VALUE_KIND.int,
    justify: VALUE_KIND.int,
    align: VALUE_KIND.int,
    grow: VALUE_KIND.f32,
    shrink: VALUE_KIND.f32,
    basis: VALUE_KIND.f32,
    flexWrap: VALUE_KIND.int,
    posType: VALUE_KIND.int,
    insetT: VALUE_KIND.f32,
    insetR: VALUE_KIND.f32,
    insetB: VALUE_KIND.f32,
    insetL: VALUE_KIND.f32,
    display: VALUE_KIND.int,
    overflow: VALUE_KIND.int,
    zIndex: VALUE_KIND.int,
    hitPass: VALUE_KIND.int,
    bgColor: VALUE_KIND.color,
    gradFrom: VALUE_KIND.color,
    gradTo: VALUE_KIND.color,
    gradDir: VALUE_KIND.int,
    radius: VALUE_KIND.f32,
    opacity: VALUE_KIND.f32,
    borderColor: VALUE_KIND.color,
    borderWidth: VALUE_KIND.f32,
    shadow: VALUE_KIND.int,
    bevelOuterLight: VALUE_KIND.color,
    bevelOuterDark: VALUE_KIND.color,
    bevelInnerLight: VALUE_KIND.color,
    bevelInnerDark: VALUE_KIND.color,
    bevelWidth: VALUE_KIND.f32,
    gradVia: VALUE_KIND.color,
    gradViaPos: VALUE_KIND.f32,
    textColor: VALUE_KIND.color,
    fontSlot: VALUE_KIND.int,
    textAlign: VALUE_KIND.int,
    lineHeight: VALUE_KIND.f32,
    tracking: VALUE_KIND.f32,
    translateX: VALUE_KIND.f32,
    translateY: VALUE_KIND.f32,
    scale: VALUE_KIND.f32,
    rotate: VALUE_KIND.f32,
    scaleX: VALUE_KIND.f32,
    scaleY: VALUE_KIND.f32,
    originX: VALUE_KIND.f32,
    originY: VALUE_KIND.f32,
    rotateX: VALUE_KIND.f32,
    rotateY: VALUE_KIND.f32,
    translateZ: VALUE_KIND.f32,
    perspective: VALUE_KIND.f32,
    arcStart: VALUE_KIND.f32,
    arcSweep: VALUE_KIND.f32,
    arcWidth: VALUE_KIND.f32
  };
  var ENUMS = {
    FlexDir: {
      Row: 0,
      Col: 1
    },
    Justify: {
      Start: 0,
      Center: 1,
      End: 2,
      Between: 3,
      Around: 4
    },
    Align: {
      Start: 0,
      Center: 1,
      End: 2,
      Stretch: 3
    },
    PosType: {
      Relative: 0,
      Absolute: 1
    },
    Display: {
      Flex: 0,
      None: 1
    },
    Overflow: {
      Visible: 0,
      Hidden: 1
    },
    TextAlign: {
      Left: 0,
      Center: 1,
      Right: 2
    },
    GradDir: {
      ToTop: 0,
      ToBottom: 1,
      ToLeft: 2,
      ToRight: 3
    },
    Easing: {
      Linear: 0,
      EaseIn: 1,
      EaseOut: 2,
      EaseInOut: 3,
      OutBack: 4,
      Spring: 5,
      SpringBouncy: 6,
      CubicBezier: 7
    }
  };
  var PSM = {
    PSM_5650: 0,
    PSM_4444: 2,
    PSM_8888: 3,
    PSM_T8: 5
  };
  var IMG_FLAG_RLE = 1 << 0;
  var IMG_FLAG_LINEAR = 1 << 1;
  var TILESET_FLAG_RLE = 1 << 0;
  var TILESET_FLAG_LINEAR = 1 << 1;
  var SVC_IMG_MAX_BYTES = 128 * 1024;
  var STREAM_FLAG_ENDED = 1 << 0;
  var WIRE_MAX_PAYLOAD = 256 * 1024;
  var WIRE_SLOT_FLAG_RLE = 1 << 0;
  var WIRE_MARK_FLAG_ENDED = 1 << 0;
  var STYLE_VARIANT_BASE = 1 << 0;
  var STYLE_VARIANT_FOCUS = 1 << 1;
  var STYLE_VARIANT_ACTIVE = 1 << 2;
  var STYLE_HAS_TRANSITION = 1 << 3;
  var STYLE_HAS_ANIMATION = 1 << 4;
  var ANIM_FILL_BACKWARDS = 1 << 0;
  var ANIM_FILL_FORWARDS = 1 << 1;
  function abgr(r, g, b, a = 255) {
    return ((a & 255) << 24 | (b & 255) << 16 | (g & 255) << 8 | r & 255) >>> 0;
  }
  var FONT_FLAG_BOLD = 1 << 0;
  var PAK_MAGIC = 1263551300;
  var PAK_VERSION = 1;
  var PAK_HEADER_SIZE = 32;
  var PAK_ENTRY_SIZE = 24;
  var BTN = {
    SELECT: 1,
    START: 8,
    UP: 16,
    RIGHT: 32,
    DOWN: 64,
    LEFT: 128,
    LTRIGGER: 256,
    RTRIGGER: 512,
    ZL: 1024,
    ZR: 2048,
    TRIANGLE: 4096,
    CIRCLE: 8192,
    CROSS: 16384,
    SQUARE: 32768
  };
  var ANALOG_CENTER = 32896;
  var FIXED_DT = 1 / 60;

  // framework/src/host.ts
  function hostViewport(ops) {
    return ops.__viewport ?? null;
  }
  var current = null;
  function embeddedBuildHostContract() {
    const target = "windows-app";
    const hostAbi = 4;
    return target && hostAbi > 0 ? {
      target,
      hostAbi
    } : null;
  }
  function assertNativeHostContract(ops, expected = embeddedBuildHostContract()) {
    const baked = 60;
    const declared = ops.__tickHz ?? 60;
    if (declared !== baked) {
      throw new Error(ops.__tickHz === undefined ? `PocketJS: this bundle bakes ${baked} Hz virtual time but the host declares no ui.__tickHz, ` + "which means the 60 Hz default — declare the rate before mount and drive the surface at it " + "(pocket_apple set_tick_rate before eval_bundle; PocketSurfaceView.tickRate)" : `PocketJS: tick-rate mismatch (bundle baked at ${baked} Hz, host drives ${declared} Hz) — ` + "a bundle only runs correctly at the rate it was built with (`--hz`), like glyphs at their density");
    }
    if (!expected)
      return;
    if (typeof ops.__host !== "string") {
      throw new Error(`PocketJS: this bundle targets "${expected.target}" but the native host predates platform ` + "contracts — add __host/__hostAbi to its ui namespace (see framework/src/host.ts HostOps)");
    }
    if (ops.__host !== expected.target) {
      throw new Error(`PocketJS: native target mismatch (bundle=${expected.target}, host=${ops.__host})`);
    }
    if (ops.__hostAbi !== expected.hostAbi) {
      throw new Error(`PocketJS: native host ABI mismatch (bundle=${expected.hostAbi}, host=${ops.__hostAbi ?? "missing"})`);
    }
  }
  function detectHost(injected) {
    const native = globalThis.ui;
    const nativeMarked = native !== undefined && (typeof native.__host === "string" || native.__textures !== undefined);
    if (injected) {
      if (native !== undefined && injected === native && nativeMarked) {
        assertNativeHostContract(native);
        return {
          ops: injected,
          kind: "native",
          target: native.__host ?? "unknown",
          strict: false
        };
      }
      return {
        ops: injected,
        kind: "injected",
        target: injected.__host ?? "injected",
        strict: true
      };
    }
    if (native !== undefined && nativeMarked) {
      assertNativeHostContract(native);
      return {
        ops: native,
        kind: "native",
        target: native.__host ?? "unknown",
        strict: false
      };
    }
    if (native) {
      return {
        ops: native,
        kind: "injected",
        target: "injected",
        strict: true
      };
    }
    throw new Error("PocketJS: no host — pass HostOps to render() (web/test) or run under a native runtime (globalThis.ui)");
  }
  function installHost(host) {
    current = host;
  }
  function getHost() {
    if (!current) {
      throw new Error("PocketJS: host not installed — call render() first");
    }
    return current;
  }
  function getOps() {
    return getHost().ops;
  }
  function installFrameHandler(fn) {
    globalThis.frame = fn;
  }
  function installResizeViewportHook(resizeViewport) {
    const globals = globalThis;
    const previous = globals.__pocketResizeViewport;
    const hook = (width, height) => resizeViewport(width, height);
    globals.__pocketResizeViewport = hook;
    return () => {
      if (globals.__pocketResizeViewport !== hook)
        return;
      if (previous)
        globals.__pocketResizeViewport = previous;
      else
        delete globals.__pocketResizeViewport;
    };
  }
  function parseHexColor(s) {
    let hex = s.slice(1);
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    if (hex.length !== 6 && hex.length !== 8) {
      throw new Error(`PocketJS: bad color '${s}' (expected #rgb/#rrggbb/#rrggbbaa)`);
    }
    if (!/^[0-9a-fA-F]+$/.test(hex))
      throw new Error(`PocketJS: bad color '${s}'`);
    const n = parseInt(hex, 16);
    if (hex.length === 6) {
      return abgr(n >>> 16 & 255, n >>> 8 & 255, n & 255, 255);
    }
    return abgr(n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255);
  }
  function encodePropValue(prop, value) {
    const kind = PROP_VALUE_KIND[prop];
    if (typeof value === "string") {
      if (kind === VALUE_KIND.color)
        return parseHexColor(value);
      const n = Number(value);
      if (Number.isNaN(n)) {
        throw new Error(`PocketJS: non-numeric value '${value}' for prop '${prop}'`);
      }
      value = n;
    }
    if (kind === VALUE_KIND.color || kind === VALUE_KIND.int)
      return value >>> 0;
    return value;
  }

  // framework/src/clock.ts
  var TICKS_PER_SECOND = validTickHz(60);
  function validTickHz(hz) {
    if (!Number.isInteger(hz) || hz < 1 || hz > 240) {
      throw new Error(`PocketJS: __POCKET_TICK_HZ__ must be an integer from 1 through 240, got ${hz}`);
    }
    return hz;
  }
  var VALID_HZ = divisorsOf(TICKS_PER_SECOND);
  function divisorsOf(n) {
    const out = [];
    for (let d = 1;d <= n; d++) {
      if (n % d === 0)
        out.push(d);
    }
    return out;
  }
  var hz = TICKS_PER_SECOND;
  var frame = -1;
  var timerSeq = 0;
  var timers = [];
  function normalizeHz(raw) {
    if (!Number.isFinite(raw) || raw <= 0)
      return TICKS_PER_SECOND;
    let best = VALID_HZ[0];
    for (const v of VALID_HZ) {
      if (Math.abs(v - raw) < Math.abs(best - raw))
        best = v;
    }
    return best;
  }
  function ticksPerFrame() {
    return TICKS_PER_SECOND / hz;
  }
  function virtualFrame() {
    return frame < 0 ? 0 : frame;
  }
  function resetClock() {
    const raw = globalThis.__simHz;
    hz = typeof raw === "number" ? normalizeHz(raw) : TICKS_PER_SECOND;
    frame = -1;
    timers = [];
    timerSeq = 0;
  }
  function __advanceClock() {
    frame = frame < 0 ? 0 : frame + 1;
    if (timers.length === 0)
      return;
    const due = timers.filter((t) => t.at <= frame).sort((a, b) => a.at - b.at || a.seq - b.seq);
    if (due.length === 0)
      return;
    timers = timers.filter((t) => t.at > frame);
    for (const t of due)
      t.cb();
  }

  // node_modules/solid-js/dist/solid.js
  var IS_DEV = false;
  var equalFn = (a, b) => a === b;
  var $PROXY = Symbol("solid-proxy");
  var $TRACK = Symbol("solid-track");
  var $DEVCOMP = Symbol("solid-dev-component");
  var signalOptions = {
    equals: equalFn
  };
  var ERROR = null;
  var runEffects = runQueue;
  var STALE = 1;
  var PENDING = 2;
  var Owner = null;
  var Transition = null;
  var Scheduler = null;
  var ExternalSourceConfig = null;
  var Listener = null;
  var Updates = null;
  var Effects = null;
  var ExecCount = 0;
  function createSignal(value, options) {
    options = options ? Object.assign({}, signalOptions, options) : signalOptions;
    const s = {
      value,
      observers: null,
      observerSlots: null,
      comparator: options.equals || undefined
    };
    const setter = (value) => {
      if (typeof value === "function") {
        if (Transition && Transition.running && Transition.sources.has(s))
          value = value(s.tValue);
        else
          value = value(s.value);
      }
      return writeSignal(s, value);
    };
    return [readSignal.bind(s), setter];
  }
  function untrack(fn) {
    if (!ExternalSourceConfig && Listener === null)
      return fn();
    const listener = Listener;
    Listener = null;
    try {
      if (ExternalSourceConfig)
        return ExternalSourceConfig.untrack(fn);
      return fn();
    } finally {
      Listener = listener;
    }
  }
  var [transPending, setTransPending] = /* @__PURE__ */ createSignal(false);
  function readSignal() {
    const runningTransition = Transition && Transition.running;
    if (this.sources && (runningTransition ? this.tState : this.state)) {
      if ((runningTransition ? this.tState : this.state) === STALE)
        updateComputation(this);
      else {
        const updates = Updates;
        Updates = null;
        runUpdates(() => lookUpstream(this), false);
        Updates = updates;
      }
    }
    if (Listener) {
      const observers = this.observers;
      if (!observers || observers[observers.length - 1] !== Listener) {
        const sSlot = observers ? observers.length : 0;
        if (!Listener.sources) {
          Listener.sources = [this];
          Listener.sourceSlots = [sSlot];
        } else {
          Listener.sources.push(this);
          Listener.sourceSlots.push(sSlot);
        }
        if (!observers) {
          this.observers = [Listener];
          this.observerSlots = [Listener.sources.length - 1];
        } else {
          observers.push(Listener);
          this.observerSlots.push(Listener.sources.length - 1);
        }
      }
    }
    if (runningTransition && Transition.sources.has(this))
      return this.tValue;
    return this.value;
  }
  function writeSignal(node, value, isComp) {
    let current = Transition && Transition.running && Transition.sources.has(node) ? node.tValue : node.value;
    if (!node.comparator || !node.comparator(current, value)) {
      if (Transition) {
        const TransitionRunning = Transition.running;
        if (TransitionRunning || !isComp && Transition.sources.has(node)) {
          Transition.sources.add(node);
          node.tValue = value;
        }
        if (!TransitionRunning)
          node.value = value;
      } else
        node.value = value;
      if (node.observers && node.observers.length) {
        runUpdates(() => {
          for (let i = 0;i < node.observers.length; i += 1) {
            const o = node.observers[i];
            const TransitionRunning = Transition && Transition.running;
            if (TransitionRunning && Transition.disposed.has(o))
              continue;
            if (TransitionRunning ? !o.tState : !o.state) {
              if (o.pure)
                Updates.push(o);
              else
                Effects.push(o);
              if (o.observers)
                markDownstream(o);
            }
            if (!TransitionRunning)
              o.state = STALE;
            else
              o.tState = STALE;
          }
          if (Updates.length > 1e6) {
            Updates = [];
            if (IS_DEV)
              ;
            throw new Error;
          }
        }, false);
      }
    }
    return value;
  }
  function updateComputation(node) {
    if (!node.fn)
      return;
    cleanNode(node);
    const time = ExecCount;
    runComputation(node, Transition && Transition.running && Transition.sources.has(node) ? node.tValue : node.value, time);
    if (Transition && !Transition.running && Transition.sources.has(node)) {
      queueMicrotask(() => {
        runUpdates(() => {
          Transition && (Transition.running = true);
          Listener = Owner = node;
          runComputation(node, node.tValue, time);
          Listener = Owner = null;
        }, false);
      });
    }
  }
  function runComputation(node, value, time) {
    let nextValue;
    const owner = Owner, listener = Listener;
    Listener = Owner = node;
    try {
      nextValue = node.fn(value);
    } catch (err) {
      if (node.pure) {
        if (Transition && Transition.running) {
          node.tState = STALE;
          node.tOwned && node.tOwned.forEach(cleanNode);
          node.tOwned = undefined;
        } else {
          node.state = STALE;
          node.owned && node.owned.forEach(cleanNode);
          node.owned = null;
        }
      }
      node.updatedAt = time + 1;
      return handleError(err);
    } finally {
      Listener = listener;
      Owner = owner;
    }
    if (!node.updatedAt || node.updatedAt <= time) {
      if (node.updatedAt != null && "observers" in node) {
        writeSignal(node, nextValue, true);
      } else if (Transition && Transition.running && node.pure) {
        if (!Transition.sources.has(node))
          node.value = nextValue;
        Transition.sources.add(node);
        node.tValue = nextValue;
      } else
        node.value = nextValue;
      node.updatedAt = time;
    }
  }
  function runTop(node) {
    const runningTransition = Transition && Transition.running;
    if ((runningTransition ? node.tState : node.state) === 0)
      return;
    if ((runningTransition ? node.tState : node.state) === PENDING)
      return lookUpstream(node);
    if (node.suspense && untrack(node.suspense.inFallback))
      return node.suspense.effects.push(node);
    const ancestors = [node];
    while ((node = node.owner) && (!node.updatedAt || node.updatedAt < ExecCount)) {
      if (runningTransition && Transition.disposed.has(node))
        return;
      if (runningTransition ? node.tState : node.state)
        ancestors.push(node);
    }
    for (let i = ancestors.length - 1;i >= 0; i--) {
      node = ancestors[i];
      if (runningTransition) {
        let top = node, prev = ancestors[i + 1];
        while ((top = top.owner) && top !== prev) {
          if (Transition.disposed.has(top))
            return;
        }
      }
      if ((runningTransition ? node.tState : node.state) === STALE) {
        updateComputation(node);
      } else if ((runningTransition ? node.tState : node.state) === PENDING) {
        const updates = Updates;
        Updates = null;
        runUpdates(() => lookUpstream(node, ancestors[0]), false);
        Updates = updates;
      }
    }
  }
  function runUpdates(fn, init) {
    if (Updates)
      return fn();
    let wait = false;
    if (!init)
      Updates = [];
    if (Effects)
      wait = true;
    else
      Effects = [];
    ExecCount++;
    try {
      const res = fn();
      completeUpdates(wait);
      return res;
    } catch (err) {
      if (!wait)
        Effects = null;
      Updates = null;
      handleError(err);
    }
  }
  function completeUpdates(wait) {
    if (Updates) {
      if (Scheduler && Transition && Transition.running)
        scheduleQueue(Updates);
      else
        runQueue(Updates);
      Updates = null;
    }
    if (wait)
      return;
    let res;
    if (Transition) {
      if (!Transition.promises.size && !Transition.queue.size) {
        const sources = Transition.sources;
        const disposed = Transition.disposed;
        Effects.push.apply(Effects, Transition.effects);
        res = Transition.resolve;
        for (const e of Effects) {
          "tState" in e && (e.state = e.tState);
          delete e.tState;
        }
        Transition = null;
        runUpdates(() => {
          for (const d of disposed)
            cleanNode(d);
          for (const v of sources) {
            v.value = v.tValue;
            if (v.owned) {
              for (let i = 0, len = v.owned.length;i < len; i++)
                cleanNode(v.owned[i]);
            }
            if (v.tOwned)
              v.owned = v.tOwned;
            delete v.tValue;
            delete v.tOwned;
            v.tState = 0;
          }
          setTransPending(false);
        }, false);
      } else if (Transition.running) {
        Transition.running = false;
        Transition.effects.push.apply(Transition.effects, Effects);
        Effects = null;
        setTransPending(true);
        return;
      }
    }
    const e = Effects;
    Effects = null;
    if (e.length)
      runUpdates(() => runEffects(e), false);
    if (res)
      res();
  }
  function runQueue(queue) {
    for (let i = 0;i < queue.length; i++)
      runTop(queue[i]);
  }
  function scheduleQueue(queue) {
    for (let i = 0;i < queue.length; i++) {
      const item = queue[i];
      const tasks = Transition.queue;
      if (!tasks.has(item)) {
        tasks.add(item);
        Scheduler(() => {
          tasks.delete(item);
          runUpdates(() => {
            Transition.running = true;
            runTop(item);
          }, false);
          Transition && (Transition.running = false);
        });
      }
    }
  }
  function lookUpstream(node, ignore) {
    const runningTransition = Transition && Transition.running;
    if (runningTransition)
      node.tState = 0;
    else
      node.state = 0;
    for (let i = 0;i < node.sources.length; i += 1) {
      const source = node.sources[i];
      if (source.sources) {
        const state = runningTransition ? source.tState : source.state;
        if (state === STALE) {
          if (source !== ignore && (!source.updatedAt || source.updatedAt < ExecCount))
            runTop(source);
        } else if (state === PENDING)
          lookUpstream(source, ignore);
      }
    }
  }
  function markDownstream(node) {
    const runningTransition = Transition && Transition.running;
    for (let i = 0;i < node.observers.length; i += 1) {
      const o = node.observers[i];
      if (runningTransition ? !o.tState : !o.state) {
        if (runningTransition)
          o.tState = PENDING;
        else
          o.state = PENDING;
        if (o.pure)
          Updates.push(o);
        else
          Effects.push(o);
        o.observers && markDownstream(o);
      }
    }
  }
  function cleanNode(node) {
    let i;
    if (node.sources) {
      while (node.sources.length) {
        const source = node.sources.pop(), index = node.sourceSlots.pop(), obs = source.observers;
        if (obs && obs.length) {
          const n = obs.pop(), s = source.observerSlots.pop();
          if (index < obs.length) {
            n.sourceSlots[s] = index;
            obs[index] = n;
            source.observerSlots[index] = s;
          }
        }
      }
    }
    if (node.tOwned) {
      for (i = node.tOwned.length - 1;i >= 0; i--)
        cleanNode(node.tOwned[i]);
      delete node.tOwned;
    }
    if (Transition && Transition.running && node.pure) {
      reset(node, true);
    } else if (node.owned) {
      for (i = node.owned.length - 1;i >= 0; i--)
        cleanNode(node.owned[i]);
      node.owned = null;
    }
    if (node.cleanups) {
      for (i = node.cleanups.length - 1;i >= 0; i--)
        node.cleanups[i]();
      node.cleanups = null;
    }
    if (Transition && Transition.running)
      node.tState = 0;
    else
      node.state = 0;
  }
  function reset(node, top) {
    if (!top) {
      node.tState = 0;
      Transition.disposed.add(node);
    }
    if (node.owned) {
      for (let i = 0;i < node.owned.length; i++)
        reset(node.owned[i]);
    }
  }
  function castError(err) {
    if (err instanceof Error)
      return err;
    return new Error(typeof err === "string" ? err : "Unknown error", {
      cause: err
    });
  }
  function runErrors(err, fns, owner) {
    try {
      for (const f of fns)
        f(err);
    } catch (e) {
      handleError(e, owner && owner.owner || null);
    }
  }
  function handleError(err, owner = Owner) {
    const fns = ERROR && owner && owner.context && owner.context[ERROR];
    const error = castError(err);
    if (!fns)
      throw error;
    if (Effects)
      Effects.push({
        fn() {
          runErrors(error, fns, owner);
        },
        state: STALE
      });
    else
      runErrors(error, fns, owner);
  }
  var FALLBACK = Symbol("fallback");

  // framework/src/analog.ts
  var ANALOG_DEADZONE = 0.12;
  var analogPacked = ANALOG_CENTER;
  var rightPacked = ANALOG_CENTER;
  function __setAnalog(packed, right = undefined) {
    analogPacked = packed === undefined ? ANALOG_CENTER : packed & 65535;
    rightPacked = right === undefined ? ANALOG_CENTER : right & 65535;
  }
  function __resetAnalog() {
    analogPacked = rightPacked = ANALOG_CENTER;
  }
  function axis(raw) {
    const value = Math.max(-1, Math.min(1, (raw - 128) / 127));
    const magnitude = Math.abs(value);
    if (magnitude < ANALOG_DEADZONE)
      return 0;
    return Math.sign(value) * (magnitude - ANALOG_DEADZONE) / (1 - ANALOG_DEADZONE);
  }
  function analogX() {
    return axis(analogPacked >> 8 & 255);
  }
  function analogY() {
    return axis(analogPacked & 255);
  }

  // framework/src/frame.ts
  var callbacks = new Set;

  // framework/src/pak.ts
  var map = null;
  var bytes = null;
  function readKey(u8, off, len) {
    let s = "";
    for (let i = 0;i < len; i++)
      s += String.fromCharCode(u8[off + i]);
    return s;
  }
  function parse(ab) {
    const dv = new DataView(ab);
    if (ab.byteLength < PAK_HEADER_SIZE || dv.getUint32(0, true) !== PAK_MAGIC) {
      throw new Error("pak: bad magic");
    }
    const version = dv.getUint16(4, true);
    if (version !== PAK_VERSION) {
      throw new Error("pak: unsupported version " + version);
    }
    const entryCount = dv.getUint32(8, true);
    const dirOff = dv.getUint32(12, true);
    const namesOff = dv.getUint32(16, true);
    const u8 = new Uint8Array(ab);
    const m = new Map;
    for (let i = 0;i < entryCount; i++) {
      const e = dirOff + i * PAK_ENTRY_SIZE;
      const blobOff = dv.getUint32(e + 4, true);
      const byteLen = dv.getUint32(e + 8, true);
      const nameOff = dv.getUint32(e + 12, true);
      const nameLen = dv.getUint16(e + 16, true);
      const dtype = u8[e + 18];
      m.set(readKey(u8, namesOff + nameOff, nameLen), {
        off: blobOff,
        len: byteLen,
        dtype
      });
    }
    map = m;
    bytes = u8;
  }
  function loadPack(ab) {
    parse(ab);
  }
  function ensureLoaded() {
    if (map)
      return;
    const ab = globalThis.__pak;
    if (!ab)
      return;
    parse(ab);
  }
  function hasPack() {
    ensureLoaded();
    return map !== null;
  }
  function entries(prefix = "") {
    ensureLoaded();
    if (!map)
      return [];
    const out = [];
    for (const key of map.keys()) {
      if (key.length >= prefix.length && key.slice(0, prefix.length) === prefix) {
        out.push(key);
      }
    }
    out.sort();
    return out;
  }
  function get(key) {
    ensureLoaded();
    const e = map ? map.get(key) : undefined;
    if (!e) {
      throw new Error("pak: missing key " + key + " (no __pak provided, or the pack is incomplete)");
    }
    return bytes.slice(e.off, e.off + e.len);
  }

  // framework/src/input.ts
  var root = null;
  var focused = null;
  var pressedNode = null;
  var prevButtons = 0;
  var focusScopeStack = [];
  var focusGridStack = [];
  var focusControllerStack = [];
  function setInputRoot(r) {
    root = r;
    focused = null;
    pressedNode = null;
    prevButtons = 0;
    focusScopeStack.length = 0;
    focusGridStack.length = 0;
    focusControllerStack.length = 0;
    if (cursor) {
      cursor.pressTarget = null;
      cursor.target = null;
      cursor.spriteDirty = true;
      cursor.fresh = true;
      cursor.vw = 0;
      if (cursor.tex >= 0) {
        const ops = getOps();
        ops.setCursor?.(-1, 0, 0, 0, 0);
        ops.freeTexture?.(cursor.tex);
        cursor.tex = -1;
      }
    }
  }
  function registerPress(node, fn) {
    node.onPress = fn ?? undefined;
  }
  function registerFocusable(node, on) {
    node.focusable = on;
    __notifyTreeMutation();
    if (!on && focused === node) {
      focusNode(null);
    }
  }
  function focusNode(node) {
    if (pressedNode && pressedNode !== node)
      setPressedNode(null);
    focused = node;
    getOps().setFocus(node ? node.id : 0);
  }
  function setPressedNode(node) {
    if (pressedNode === node)
      return;
    const ops = getOps();
    if (pressedNode)
      ops.setActive?.(pressedNode.id, 0);
    pressedNode = node;
    if (node)
      ops.setActive?.(node.id, 1);
  }
  function activeFocusRoot() {
    return focusScopeStack.length > 0 ? focusScopeStack[focusScopeStack.length - 1] : root;
  }
  function collectFocusables(node, out) {
    if (!node)
      return;
    if (node.focusable)
      out.push(node);
    if (!Array.isArray(node.children))
      return;
    for (let i = 0;i < node.children.length; i++) {
      collectFocusables(node.children[i], out);
    }
  }
  function focusables() {
    const out = [];
    const r = activeFocusRoot();
    if (r)
      collectFocusables(r, out);
    return out;
  }
  function linearDirection(direction) {
    return direction === "down" || direction === "right" ? 1 : -1;
  }
  function moveLinearFocus(direction) {
    const dir = linearDirection(direction);
    const list = focusables();
    if (list.length === 0) {
      if (focused)
        focusNode(null);
      return;
    }
    const i = focused ? list.indexOf(focused) : -1;
    if (i < 0) {
      focusNode(dir === 1 ? list[0] : list[list.length - 1]);
      return;
    }
    const j = i + dir;
    if (j < 0 || j >= list.length)
      return;
    focusNode(list[j]);
  }
  function activeGrid() {
    if (!focused)
      return null;
    const active = activeFocusRoot();
    if (active && !isWithin(focused, active))
      return null;
    for (let i = focusGridStack.length - 1;i >= 0; i--) {
      const grid = focusGridStack[i];
      if (active && !isWithin(grid.node, active) && !isWithin(active, grid.node))
        continue;
      if (isWithin(focused, grid.node))
        return grid;
    }
    return null;
  }
  function moveGridFocus(direction) {
    const grid = activeGrid();
    if (!grid)
      return false;
    const list = [];
    collectFocusables(grid.node, list);
    if (list.length === 0) {
      if (focused)
        focusNode(null);
      return true;
    }
    const columns = grid.columns;
    const i = focused ? list.indexOf(focused) : -1;
    if (i < 0) {
      focusNode(linearDirection(direction) === 1 ? list[0] : list[list.length - 1]);
      return true;
    }
    let j = i;
    switch (direction) {
      case "right":
        if (i + 1 < list.length && i % columns < columns - 1)
          j = i + 1;
        else if (grid.wrap)
          j = Math.floor(i / columns) * columns;
        break;
      case "left":
        if (i % columns > 0)
          j = i - 1;
        else if (grid.wrap)
          j = Math.min(list.length - 1, Math.floor(i / columns) * columns + columns - 1);
        break;
      case "down":
        if (i + columns < list.length)
          j = i + columns;
        else if (grid.wrap)
          j = i % columns;
        break;
      case "up":
        if (i - columns >= 0)
          j = i - columns;
        else if (grid.wrap) {
          const col = i % columns;
          j = col;
          while (j + columns < list.length)
            j += columns;
        }
        break;
    }
    if (j !== i)
      focusNode(list[j]);
    return true;
  }
  function activeController() {
    if (!focused)
      return null;
    const active = activeFocusRoot();
    if (active && !isWithin(focused, active))
      return null;
    for (let i = focusControllerStack.length - 1;i >= 0; i--) {
      const ctl = focusControllerStack[i];
      if (active && !isWithin(ctl.node, active) && !isWithin(active, ctl.node))
        continue;
      if (isWithin(focused, ctl.node))
        return ctl;
    }
    return null;
  }
  function moveFocus(direction) {
    const ctl = activeController();
    if (ctl && ctl.move(direction))
      return;
    if (moveGridFocus(direction))
      return;
    moveLinearFocus(direction);
  }
  function firePress() {
    firePressFrom(focused);
  }
  function firePressFrom(start) {
    let n = start;
    while (n) {
      if (n.onPress) {
        n.onPress();
        return;
      }
      n = n.parent;
    }
  }
  function isWithin(node, ancestor) {
    if (!node || !ancestor)
      return false;
    let n = node;
    while (n) {
      if (n === ancestor)
        return true;
      n = n.parent;
    }
    return false;
  }
  function firstFocusable(node) {
    if (!node)
      return null;
    if (node.focusable)
      return node;
    if (!Array.isArray(node.children))
      return null;
    for (let i = 0;i < node.children.length; i++) {
      const f = firstFocusable(node.children[i]);
      if (f)
        return f;
    }
    return null;
  }
  function pushFocusScope(node, opts = {}) {
    const previous = focused;
    focusScopeStack.push(node);
    __notifyTreeMutation();
    if (opts.autoFocus !== false && (!focused || !isWithin(focused, node))) {
      focusNode(firstFocusable(node));
    }
    let disposed = false;
    return () => {
      if (disposed)
        return;
      disposed = true;
      const i = focusScopeStack.lastIndexOf(node);
      if (i >= 0)
        focusScopeStack.splice(i, 1);
      __notifyTreeMutation();
      const active = activeFocusRoot();
      if (opts.restoreFocus !== false && previous && (!active || isWithin(previous, active))) {
        focusNode(previous);
        return;
      }
      if (active && (!focused || !isWithin(focused, active))) {
        focusNode(firstFocusable(active));
      } else if (!active && focused) {
        focusNode(null);
      }
    };
  }
  function pushFocusGrid(node, opts) {
    const registration = {
      node,
      columns: Math.max(1, Math.floor(opts.columns)),
      wrap: opts.wrap ?? false
    };
    focusGridStack.push(registration);
    let disposed = false;
    return () => {
      if (disposed)
        return;
      disposed = true;
      const i = focusGridStack.lastIndexOf(registration);
      if (i >= 0)
        focusGridStack.splice(i, 1);
    };
  }
  function notifyDetached(node) {
    if (!focused || !isWithin(focused, node))
      return;
    const parent = node.parent;
    if (parent) {
      const idx = parent.children.indexOf(node);
      for (let i = idx + 1;i < parent.children.length; i++) {
        const f = firstFocusable(parent.children[i]);
        if (f) {
          focusNode(f);
          return;
        }
      }
      for (let i = idx - 1;i >= 0; i--) {
        const f = firstFocusable(parent.children[i]);
        if (f) {
          focusNode(f);
          return;
        }
      }
      let a = parent;
      while (a) {
        if (a.focusable) {
          focusNode(a);
          return;
        }
        a = a.parent;
      }
    }
    focusNode(null);
  }
  var cursor = null;
  var inputGen = 0;
  function __notifyTreeMutation() {
    inputGen++;
  }
  var ARROW_OUTLINE = [1, 3, 5, 9, 17, 33, 65, 129, 257, 513, 1985, 73, 149, 147, 288, 480];
  var ARROW_FILL = [0, 0, 2, 6, 14, 30, 62, 126, 254, 510, 62, 54, 98, 96, 192, 0];
  function defaultArrowRGBA() {
    const px = new Uint8Array(16 * 16 * 4);
    for (let y = 0;y < 16; y++) {
      for (let x = 0;x < 16; x++) {
        const outline = ARROW_OUTLINE[y] >> x & 1;
        const fill = ARROW_FILL[y] >> x & 1;
        if (!outline && !fill)
          continue;
        const i = (y * 16 + x) * 4;
        const v = fill ? 255 : 0;
        px[i] = v;
        px[i + 1] = v;
        px[i + 2] = v;
        px[i + 3] = 255;
      }
    }
    return px;
  }
  function cursorInitSprite(c, ops) {
    const sprite = c.sprite;
    c.spriteDirty = false;
    const old = c.tex;
    let tex = -1;
    let blob = null;
    if (typeof sprite.image === "string") {
      try {
        blob = get(sprite.image);
      } catch (err) {
        if (getHost().strict)
          throw err;
        blob = null;
      }
    } else if (sprite.image) {
      blob = sprite.image;
    }
    if (blob) {
      tex = ops.uploadImgEntry ? ops.uploadImgEntry(blob) : uploadImgFallback(ops, blob);
      if (tex < 0 && getHost().strict) {
        throw new Error("enableCursor: cursor image rejected (malformed or RLE-only IMG entry)");
      }
    }
    if (tex < 0) {
      tex = ops.uploadTexture(defaultArrowRGBA(), 16, 16, PSM.PSM_8888);
    }
    c.tex = tex;
    ops.setCursor(tex, sprite.hotspot[0], sprite.hotspot[1], sprite.size[0], sprite.size[1]);
    if (old >= 0 && old !== tex)
      ops.freeTexture?.(old);
  }
  function uploadImgFallback(ops, blob) {
    if (blob.length < 8)
      return -1;
    const dv = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
    if (blob[5] & IMG_FLAG_RLE)
      return -1;
    return ops.uploadTexture(blob.subarray(8), dv.getUint16(0, true), dv.getUint16(2, true), blob[4]);
  }
  function findMirror(node, id) {
    if (!node || id === 0)
      return null;
    if (node.id === id)
      return node;
    const kids = node.children;
    if (!Array.isArray(kids))
      return null;
    for (let i = 0;i < kids.length; i++) {
      const found = findMirror(kids[i], id);
      if (found)
        return found;
    }
    return null;
  }
  var hitRoot = null;
  var auxiliaryHitRoot = null;
  function setHitRoot(r) {
    hitRoot = r;
  }
  function setAuxiliaryHitRoot(r) {
    auxiliaryHitRoot = r;
  }
  function cursorTarget(hit) {
    const scope = focusScopeStack.length > 0 ? focusScopeStack[focusScopeStack.length - 1] : null;
    let n = hit;
    while (n) {
      if (n.focusable && (!scope || isWithin(n, scope)))
        return n;
      n = n.parent;
    }
    return null;
  }
  function cursorFrame(buttons, pressed, released) {
    const c = cursor;
    const ops = getOps();
    if (!ops.hitTest || !ops.setCursor || !ops.setCursorPos)
      return false;
    if (c.vw === 0) {
      const vp = hostViewport(ops);
      c.vw = vp ? vp.w : SCREEN_W;
      c.vh = vp ? vp.h : SCREEN_H;
      if (c.x < 0) {
        c.x = Math.floor(c.vw / 2);
        c.y = Math.floor(c.vh / 2);
      }
    }
    if (c.spriteDirty)
      cursorInitSprite(c, ops);
    let vx = analogX() * c.speed;
    let vy = analogY() * c.speed;
    if (c.dpadSpeed > 0 && vx === 0 && vy === 0) {
      if (buttons & BTN.LEFT)
        vx = -c.dpadSpeed;
      if (buttons & BTN.RIGHT)
        vx = c.dpadSpeed;
      if (buttons & BTN.UP)
        vy = -c.dpadSpeed;
      if (buttons & BTN.DOWN)
        vy = c.dpadSpeed;
    }
    let moved = c.fresh;
    if (vx !== 0 || vy !== 0) {
      const dt = ticksPerFrame() / TICKS_PER_SECOND;
      const nx = Math.min(Math.max(c.x + vx * dt, 0), c.vw - 1);
      const ny = Math.min(Math.max(c.y + vy * dt, 0), c.vh - 1);
      if (nx !== c.x || ny !== c.y) {
        c.x = nx;
        c.y = ny;
        moved = true;
      }
    }
    if (moved)
      ops.setCursorPos(c.x, c.y);
    const edges = (pressed | released) & c.button;
    const gen = inputGen;
    if (moved || edges !== 0 || gen !== c.gen) {
      c.gen = gen;
      c.fresh = false;
      c.target = cursorTarget(findMirror(hitRoot ?? root, ops.hitTest(c.x, c.y)));
    }
    const target = c.target;
    if (target !== focused)
      focusNode(target);
    if (pressed & c.button && target) {
      c.pressTarget = target;
    }
    if (c.pressTarget) {
      setPressedNode(target === c.pressTarget ? c.pressTarget : null);
      if (released & c.button) {
        const fire = target === c.pressTarget;
        c.pressTarget = null;
        setPressedNode(null);
        if (fire)
          firePress();
      }
    } else if (released & c.button) {
      setPressedNode(null);
    }
    return true;
  }
  function handleFrame(buttons) {
    const pressed = buttons & ~prevButtons;
    const released = prevButtons & ~buttons;
    prevButtons = buttons;
    if (cursor && cursorFrame(buttons, pressed, released))
      return;
    if (released & BTN.CIRCLE)
      setPressedNode(null);
    if (pressed === 0)
      return;
    if (pressed & BTN.DOWN)
      moveFocus("down");
    if (pressed & BTN.RIGHT)
      moveFocus("right");
    if (pressed & BTN.UP)
      moveFocus("up");
    if (pressed & BTN.LEFT)
      moveFocus("left");
    if (pressed & BTN.CIRCLE) {
      setPressedNode(focused);
      firePress();
    }
  }

  // framework/src/native-tree.ts
  var treeMutationHook = null;
  function setTreeMutationHook(fn) {
    treeMutationHook = fn;
  }
  function treeMutated() {
    __notifyTreeMutation();
    if (treeMutationHook)
      treeMutationHook();
  }
  function setDebugName(node, name) {
    node.debugName = name || undefined;
    treeMutated();
  }
  var rootMirror = {
    id: ROOT_ID,
    type: NODE_TYPE.view,
    parent: null,
    children: [],
    domNodeType: 1,
    domTag: "root"
  };
  var nativeRoots = new Set([rootMirror]);
  var DOM_NODE = Symbol.for("pocketjs.native-node");
  var DOM_ELEMENT = 1;
  var DOM_TEXT = 3;
  var DOM_COMMENT = 8;
  var NATIVE_ATTRIBUTE_NAMES = new Set(["class", "className", "style", "src", "onPress", "on:press", "focusable", "debugName", "ref", "nodeRef", "key", "children"]);
  function domAttrs(node) {
    return node.domAttrs ??= {};
  }
  function cloneNativeNode(node, deep) {
    const nodeType = node.domNodeType ?? (isTextNode(node) ? DOM_TEXT : DOM_ELEMENT);
    const clone = nodeType === DOM_TEXT ? createTextNode(node.text ?? "") : nodeType === DOM_COMMENT ? createCommentNode(node.domData ?? "") : createElement(node.domTag ?? tagName(node));
    for (const key of Object.keys(node.domAttrs ?? {})) {
      setDomAttribute(clone, key, node.domAttrs[key]);
    }
    if (deep) {
      for (const child of node.children)
        insertNode(clone, cloneNativeNode(child, true));
    }
    return clone;
  }
  function setDomAttribute(node, name, value) {
    if (NATIVE_ATTRIBUTE_NAMES.has(name)) {
      setProp(node, name, value, node.domAttrs?.[name]);
      return;
    }
    if (value == null)
      delete domAttrs(node)[name];
    else
      domAttrs(node)[name] = value;
  }
  function decorateNativeNode(node) {
    if (node[DOM_NODE] === true)
      return node;
    Object.defineProperty(node, DOM_NODE, {
      value: true
    });
    Object.defineProperties(node, {
      nodeType: {
        configurable: true,
        get() {
          return node.domNodeType ?? (isTextNode(node) ? DOM_TEXT : DOM_ELEMENT);
        }
      },
      nodeValue: {
        configurable: true,
        get() {
          return node.domNodeType === DOM_COMMENT ? node.domData ?? "" : node.text ?? "";
        },
        set(value) {
          if (node.domNodeType === DOM_COMMENT)
            node.domData = String(value ?? "");
          else
            replaceText(node, String(value ?? ""));
        }
      },
      data: {
        configurable: true,
        get() {
          return node.domNodeType === DOM_COMMENT ? node.domData ?? "" : node.text ?? "";
        },
        set(value) {
          if (node.domNodeType === DOM_COMMENT)
            node.domData = String(value ?? "");
          else
            replaceText(node, String(value ?? ""));
        }
      },
      textContent: {
        configurable: true,
        get() {
          if (node.domNodeType === DOM_COMMENT)
            return node.domData ?? "";
          if (isTextNode(node))
            return node.text ?? "";
          return node.children.map((child) => child.text ?? "").join("");
        },
        set(value) {
          const text = String(value ?? "");
          if (node.domNodeType === DOM_COMMENT) {
            node.domData = text;
          } else if (isTextNode(node)) {
            replaceText(node, text);
          } else {
            clearContainer(node);
            if (text)
              insertNode(node, createTextNode(text));
          }
        }
      },
      parentNode: {
        configurable: true,
        get() {
          return node.parent;
        }
      },
      parentElement: {
        configurable: true,
        get() {
          return node.parent;
        }
      },
      childNodes: {
        configurable: true,
        get() {
          return node.children;
        }
      },
      firstChild: {
        configurable: true,
        get() {
          return node.children[0] ?? null;
        }
      },
      lastChild: {
        configurable: true,
        get() {
          return node.children[node.children.length - 1] ?? null;
        }
      },
      nextSibling: {
        configurable: true,
        get() {
          return getNextSibling(node) ?? null;
        }
      },
      previousSibling: {
        configurable: true,
        get() {
          const parent = node.parent;
          if (!parent)
            return null;
          const index = parent.children.indexOf(node);
          return index > 0 ? parent.children[index - 1] : null;
        }
      },
      tagName: {
        configurable: true,
        get() {
          return (node.domTag ?? tagName(node)).toUpperCase();
        }
      },
      nodeName: {
        configurable: true,
        get() {
          if (node.domNodeType === DOM_TEXT)
            return "#text";
          if (node.domNodeType === DOM_COMMENT)
            return "#comment";
          return (node.domTag ?? tagName(node)).toUpperCase();
        }
      },
      className: {
        configurable: true,
        get() {
          return String(node.domAttrs?.class ?? "");
        },
        set(value) {
          setProp(node, "class", value, node.domAttrs?.class);
        }
      },
      isConnected: {
        configurable: true,
        get() {
          let current = node;
          while (current) {
            if (nativeRoots.has(current))
              return true;
            current = current.parent;
          }
          return false;
        }
      }
    });
    const methods = {
      appendChild(child) {
        insertNode(node, child);
        return child;
      },
      insertBefore(child, anchor) {
        insertNode(node, child, anchor ?? null);
        return child;
      },
      removeChild(child) {
        removeNode(node, child);
        return child;
      },
      replaceChild(next, current) {
        insertNode(node, next, current);
        removeNode(node, current);
        return current;
      },
      cloneNode(deep = false) {
        return cloneNativeNode(node, !!deep);
      },
      remove() {
        if (node.parent)
          removeNode(node.parent, node);
      },
      setAttribute(name, value) {
        setDomAttribute(node, name, value);
      },
      removeAttribute(name) {
        setDomAttribute(node, name, undefined);
      },
      getAttribute(name) {
        const value = node.domAttrs?.[name];
        return value == null ? null : String(value);
      },
      hasAttribute(name) {
        return node.domAttrs?.[name] != null;
      },
      hasChildNodes() {
        return node.children.length > 0;
      },
      contains(other) {
        let current = other ?? null;
        while (current) {
          if (current === node)
            return true;
          current = current.parent;
        }
        return false;
      },
      addEventListener() {},
      removeEventListener() {}
    };
    Object.assign(node, methods, {
      style: {
        length: 0,
        item: () => ""
      },
      classList: {
        add() {},
        remove() {}
      }
    });
    return node;
  }
  decorateNativeNode(rootMirror);
  var styleResolver = null;
  function setStyleResolver(fn) {
    styleResolver = fn;
  }
  var missCounters = {
    unknownClass: 0,
    unknownTexture: 0,
    unknownSurface: 0
  };
  var textures = new Map;
  function registerTexture(key, handle) {
    textures.set(key, handle);
  }
  var sprites = new Map;
  function registerSprite(key, meta) {
    sprites.set(key, meta);
  }
  var sweepSet = new Set;
  var retained = new Set;
  function subtreeHasRetained(node) {
    if (!node)
      return false;
    if (retained.has(node))
      return true;
    if (node.children) {
      for (let i = 0;i < node.children.length; i++) {
        if (subtreeHasRetained(node.children[i]))
          return true;
      }
    }
    return false;
  }
  function runSweep() {
    if (sweepSet.size === 0)
      return;
    const ops = getOps();
    const keep = [];
    for (const node of sweepSet) {
      if (!node)
        continue;
      if (node.parent !== null)
        continue;
      if (nativeRoots.has(node))
        continue;
      if (subtreeHasRetained(node)) {
        keep.push(node);
        continue;
      }
      ops.destroyNode(node.id);
    }
    sweepSet.clear();
    for (let i = 0;i < keep.length; i++)
      sweepSet.add(keep[i]);
  }
  function adoptNativeRoot(id, tag = "native-root") {
    if (!Number.isInteger(id) || id <= ROOT_ID) {
      throw new Error(`PocketJS: invalid adopted native root id ${id}`);
    }
    const root = decorateNativeNode({
      id,
      type: NODE_TYPE.view,
      parent: null,
      children: [],
      domNodeType: DOM_ELEMENT,
      domTag: tag
    });
    nativeRoots.add(root);
    return root;
  }
  function releaseNativeRoot(root) {
    if (root === rootMirror)
      return;
    if (root.children.length > 0) {
      throw new Error("PocketJS: cannot release a native root with mounted children");
    }
    nativeRoots.delete(root);
    sweepSet.delete(root);
    retained.delete(root);
  }
  function createElement(tag) {
    const type = NODE_TYPE[tag];
    if (type === undefined) {
      throw new Error(`PocketJS: unknown element <${tag}> - only view/text/image/surface exist`);
    }
    return decorateNativeNode({
      id: getOps().createNode(type),
      type,
      parent: null,
      children: [],
      domNodeType: DOM_ELEMENT,
      domTag: tag
    });
  }
  function createTextNode(value) {
    const ops = getOps();
    const id = ops.createNode(NODE_TYPE.text);
    ops.setText(id, value);
    return decorateNativeNode({
      id,
      type: NODE_TYPE.text,
      parent: null,
      children: [],
      text: value,
      domNodeType: DOM_TEXT,
      domTag: "#text"
    });
  }
  function createCommentNode(data = "") {
    const node = createTextNode("");
    node.domNodeType = DOM_COMMENT;
    node.domTag = "#comment";
    node.domData = data;
    return node;
  }
  function replaceText(node, value) {
    getOps().replaceText(node.id, value);
    node.text = value;
    treeMutated();
  }
  function isTextNode(node) {
    return node.type === NODE_TYPE.text;
  }
  function unlink(node) {
    const p = node.parent;
    if (!p)
      return;
    const i = p.children.indexOf(node);
    if (i >= 0)
      p.children.splice(i, 1);
    node.parent = null;
  }
  function insertNode(parent, node, anchor) {
    const ops = getOps();
    if (anchor && (anchor.parent !== parent || !parent.children.includes(anchor))) {
      throw new Error("PocketJS: insert anchor is not a child of parent");
    }
    if (anchor === node) {
      sweepSet.delete(node);
      return;
    }
    unlink(node);
    sweepSet.delete(node);
    ops.insertBefore(parent.id, node.id, anchor ? anchor.id : 0);
    if (anchor) {
      const i = parent.children.indexOf(anchor);
      parent.children.splice(i, 0, node);
    } else {
      parent.children.push(node);
    }
    node.parent = parent;
    treeMutated();
  }
  function removeNode(parent, node) {
    if (!node)
      return;
    notifyDetached(node);
    getOps().removeChild(parent.id, node.id);
    unlink(node);
    sweepSet.add(node);
    treeMutated();
  }
  function getNextSibling(node) {
    const p = node.parent;
    if (!p)
      return;
    const i = p.children.indexOf(node);
    return i >= 0 ? p.children[i + 1] : undefined;
  }
  function setClass(node, value) {
    const ops = getOps();
    treeMutated();
    if (value == null || value === "") {
      ops.setStyle(node.id, STYLE_ID_NONE);
      return;
    }
    if (typeof value !== "string") {
      throw new Error("PocketJS: class must be a string literal of utilities");
    }
    const styleId = styleResolver ? styleResolver(value) : undefined;
    if (styleId === undefined) {
      if (getHost().strict) {
        throw new Error(`PocketJS: unknown class "${value}" - not in the compiled style table ` + "(dynamic classes must be ternaries of full literals)");
      }
      missCounters.unknownClass++;
      return;
    }
    ops.setStyle(node.id, styleId);
  }
  function setSrc(node, value) {
    const ops = getOps();
    if (value == null || value === "") {
      ops.setImage(node.id, -1);
      return;
    }
    if (typeof value !== "string") {
      throw new Error("PocketJS: src must be a string key");
    }
    const handle = textures.get(value);
    if (handle === undefined) {
      if (getHost().strict) {
        throw new Error(`PocketJS: unknown image src "${value}" - no texture registered under that key`);
      }
      missCounters.unknownTexture++;
      return;
    }
    ops.setImage(node.id, handle);
  }
  function setSpriteSrc(node, value) {
    const ops = getOps();
    if (value == null || value === "") {
      ops.setSprite(node.id, -1, 0, 0, 0);
      return;
    }
    if (typeof value !== "string") {
      throw new Error("PocketJS: sprite must be a string key");
    }
    const meta = sprites.get(value);
    if (meta === undefined) {
      if (getHost().strict) {
        throw new Error(`PocketJS: unknown sprite "${value}" - no sprite atlas registered under that key`);
      }
      missCounters.unknownTexture++;
      return;
    }
    ops.setSprite(node.id, meta.handle, meta.frames, meta.cols, meta.step);
  }
  function setCompositorBinding(node) {
    const ops = getOps();
    const bind = ops.setCompositorSurface;
    if (!bind) {
      return;
    }
    if (!ops.__surfaces) {
      return;
    }
    const packageId = node.domAttrs?.package;
    const focused = node.domAttrs?.focused === true ? 1 : 0;
    if (packageId == null || packageId === "") {
      bind(node.id, -1, focused);
      return;
    }
    if (typeof packageId !== "string") {
      throw new Error("PocketJS: compositor surface package must be a string id");
    }
    const handle = ops.__surfaces[packageId];
    if (handle === undefined) {
      if (getHost().strict) {
        throw new Error(`PocketJS: package ${JSON.stringify(packageId)} is not installed in this Pocket System`);
      }
      missCounters.unknownSurface++;
      bind(node.id, -1, focused);
      return;
    }
    bind(node.id, handle, focused);
  }
  function setStyleObject(node, value, prev) {
    const ops = getOps();
    const next = value ?? {};
    const before = prev ?? {};
    let changed = false;
    for (const key in next) {
      const v = next[key];
      if (before[key] === v)
        continue;
      const propId = PROP[key];
      if (propId === undefined) {
        throw new Error(`PocketJS: unknown style prop '${key}' (see spec PROP)`);
      }
      ops.setProp(node.id, propId, encodePropValue(key, v));
      changed = true;
    }
    if (changed)
      treeMutated();
  }
  function setProp(node, name, value, prev) {
    if (value === prev && name !== "style")
      return value;
    if (name === "className")
      name = "class";
    if (name !== "children" && name !== "key" && name !== "ref" && name !== "nodeRef") {
      if (value == null)
        delete domAttrs(node)[name];
      else
        domAttrs(node)[name] = value;
    }
    switch (name) {
      case "class":
        setClass(node, value);
        return value;
      case "onPress":
      case "on:press":
        registerPress(node, value);
        return value;
      case "src":
        setSrc(node, value);
        return value;
      case "sprite":
        setSpriteSrc(node, value);
        return value;
      case "package":
      case "focused":
        setCompositorBinding(node);
        return value;
      case "style":
        setStyleObject(node, value, prev);
        return value;
      case "focusable":
        registerFocusable(node, !!value);
        return value;
      case "debugName":
        setDebugName(node, value == null ? undefined : String(value));
        return value;
      case "ref":
      case "nodeRef":
      case "key":
      case "children":
        return value;
      default:
        break;
    }
    if (name === "classList") {
      throw new Error("PocketJS: classList is not supported - use ternaries of full class literals");
    }
    if (name.startsWith("on:") || name.startsWith("bool:") || name.startsWith("prop:")) {
      throw new Error(`PocketJS: unsupported namespaced attribute '${name}'`);
    }
    throw new Error(`PocketJS: unknown property '${name}' on <${tagName(node)}>`);
  }
  function applyProps(node, next, prev = {}) {
    const seen = new Set;
    for (const key of Object.keys(next)) {
      seen.add(key);
      setProp(node, key, next[key], prev[key]);
    }
    for (const key of Object.keys(prev)) {
      if (seen.has(key))
        continue;
      if (key === "children" || key === "key" || key === "ref" || key === "nodeRef")
        continue;
      setProp(node, key, undefined, prev[key]);
    }
  }
  function clearContainer(container) {
    for (const child of [...container.children])
      removeNode(container, child);
  }
  function tagName(node) {
    for (const key of Object.keys(NODE_TYPE)) {
      if (NODE_TYPE[key] === node.type)
        return key;
    }
    return String(node.type);
  }

  // framework/src/overlay.ts
  var overlayRoot = null;
  function setOverlayRoot(root) {
    overlayRoot = root;
  }
  function getOverlayRoot() {
    if (!overlayRoot) {
      throw new Error("PocketJS: overlay root is not installed");
    }
    return overlayRoot;
  }

  // framework/src/renderer-octane.ts
  var OCTANE_RENDERER_ID = "pocket";
  var OVERLAY_TARGET = Symbol.for("pocketjs.octane.overlay-target");
  function overlayPortalTarget() {
    return {
      [OVERLAY_TARGET]: true
    };
  }
  function isOverlayTarget(value) {
    return !!value && typeof value === "object" && value[OVERLAY_TARGET] === true;
  }
  function isNodeMirrorTarget(value) {
    return !!value && typeof value === "object" && typeof value.id === "number" && Array.isArray(value.children);
  }
  var portalTargetSeq = 0;
  function textValue(props) {
    const value = props.value;
    return value == null ? "" : String(value);
  }
  function createPocketDriver() {
    return {
      id: OCTANE_RENDERER_ID,
      capabilities: {
        text: "host"
      },
      portals: {
        prepareTarget(context) {
          const container = context.container;
          const target = context.target;
          if (context.transported) {
            throw new Error("PocketJS: octane portal targets never cross a transport");
          }
          let host;
          let owned = false;
          if (isOverlayTarget(target)) {
            host = createElement("view");
            setProp(host, "style", {
              width: SCREEN_W,
              height: SCREEN_H,
              posType: ENUMS.PosType.Absolute,
              insetT: 0,
              insetR: 0,
              insetB: 0,
              insetL: 0,
              zIndex: 1000
            }, undefined);
            insertNode(getOverlayRoot(), host);
            owned = true;
          } else if (isNodeMirrorTarget(target)) {
            host = target;
          } else {
            throw new Error("PocketJS: octane portal target must be overlayPortalTarget() or a NodeMirror");
          }
          const id = ++portalTargetSeq;
          const handle = context.createPortalTargetHandle(id);
          container.portalHosts.set(id, host);
          return {
            handle,
            release() {
              container.portalHosts.delete(id);
              if (owned && host.parent)
                removeNode(host.parent, host);
            }
          };
        }
      },
      prepareBatch(container, batch) {
        if (batch.renderer !== OCTANE_RENDERER_ID) {
          throw new Error(`PocketJS: octane driver renderer mismatch (batch=${JSON.stringify(batch.renderer)})`);
        }
        const {
          mirrors,
          committedProps,
          portalHosts
        } = container;
        const resolveParent = (parent) => {
          if (parent === null)
            return container.root;
          if (typeof parent === "number") {
            const mirror = mirrors.get(parent);
            if (!mirror)
              throw new Error(`PocketJS: octane driver unknown parent ${parent}`);
            return mirror;
          }
          const host = portalHosts.get(parent.id);
          if (!host)
            throw new Error(`PocketJS: octane driver unknown portal target ${String(parent.id)}`);
          return host;
        };
        const resolve = (id) => {
          const mirror = mirrors.get(id);
          if (!mirror)
            throw new Error(`PocketJS: octane driver unknown node ${id}`);
          return mirror;
        };
        let applied = false;
        return {
          apply() {
            if (applied)
              return;
            applied = true;
            for (const command of batch.commands) {
              applyCommand(command);
            }
          },
          abort() {}
        };
        function applyCommand(command) {
          switch (command.op) {
            case "create": {
              if (mirrors.has(command.id)) {
                throw new Error(`PocketJS: octane driver duplicate node ${command.id}`);
              }
              let mirror;
              if (command.type === "#text") {
                mirror = createTextNode(textValue(command.props));
              } else {
                mirror = createElement(command.type);
                applyProps(mirror, command.props);
              }
              mirrors.set(command.id, mirror);
              committedProps.set(command.id, command.props);
              break;
            }
            case "update": {
              const mirror = resolve(command.id);
              const prev = committedProps.get(command.id) ?? {};
              if (mirror.domTag === "#text") {
                const next = textValue(command.props);
                if (next !== mirror.text)
                  replaceText(mirror, next);
              } else {
                applyProps(mirror, command.props, prev);
              }
              committedProps.set(command.id, command.props);
              break;
            }
            case "insert":
            case "move": {
              const parent = resolveParent(command.parent);
              const before = command.before === null ? null : resolve(command.before);
              insertNode(parent, resolve(command.id), before);
              break;
            }
            case "remove": {
              removeNode(resolveParent(command.parent), resolve(command.id));
              break;
            }
            case "destroy": {
              mirrors.delete(command.id);
              committedProps.delete(command.id);
              break;
            }
            default:
              throw new Error(`PocketJS: octane driver does not implement host command '${command.op}'`);
          }
        }
      },
      getPublicInstance(container, id) {
        return container.mirrors.get(id) ?? null;
      }
    };
  }
  var activeRoot = null;
  function render(code, root) {
    profiler.stop();
    profiler.clear();
    const container = {
      root,
      mirrors: new Map,
      committedProps: new Map,
      portalHosts: new Map
    };
    const universalRoot = createUniversalRoot(container, createPocketDriver());
    activeRoot = universalRoot;
    const attempt = universalRoot.render(code, {});
    if (attempt.status === "suspended") {
      attempt.abort();
      throw new Error("PocketJS: octane render() suspended at mount — Suspense-on-boot is not supported");
    }
    return () => {
      if (activeRoot === universalRoot)
        activeRoot = null;
      universalRoot.unmount();
    };
  }
  // framework/src/anim.ts
  var EASING_BY_NAME = {
    linear: ENUMS.Easing.Linear,
    in: ENUMS.Easing.EaseIn,
    out: ENUMS.Easing.EaseOut,
    "in-out": ENUMS.Easing.EaseInOut,
    "out-back": ENUMS.Easing.OutBack,
    spring: ENUMS.Easing.Spring,
    "spring-bouncy": ENUMS.Easing.SpringBouncy
  };
  function nodeId(node) {
    return typeof node === "number" ? node : node.id;
  }
  function animatablePropId(prop) {
    const propId = PROP[prop];
    if (propId === undefined) {
      throw new Error(`PocketJS: unknown prop '${prop}'`);
    }
    if (animBit(prop) < 0) {
      throw new Error(`PocketJS: prop '${prop}' is not animatable (see spec ANIMATABLE)`);
    }
    return propId;
  }
  function animate(node, prop, to, opts = {}) {
    const propId = animatablePropId(prop);
    let easing;
    if (typeof opts.easing === "number") {
      easing = opts.easing;
    } else {
      const named = EASING_BY_NAME[opts.easing ?? "out"];
      if (named === undefined) {
        throw new Error(`PocketJS: unknown easing '${opts.easing}'`);
      }
      easing = named;
    }
    return getOps().animate(nodeId(node), propId, encodePropValue(prop, to), opts.dur ?? 200, easing, opts.delay ?? 0);
  }
  // framework/src/frame-octane.tsx
  var _hs$ = /* @__PURE__ */ hookSlots(9);
  var _h$0 = /* @__PURE__ */ Symbol(_hs$);
  var _h$1 = /* @__PURE__ */ Symbol(_hs$ + 1);
  var _h$2 = /* @__PURE__ */ Symbol(_hs$ + 2);
  var _h$3 = /* @__PURE__ */ Symbol(_hs$ + 3);
  var _h$4 = /* @__PURE__ */ Symbol(_hs$ + 4);
  var _h$5 = /* @__PURE__ */ Symbol(_hs$ + 5);
  var _h$6 = /* @__PURE__ */ Symbol(_hs$ + 6);
  var _h$7 = /* @__PURE__ */ Symbol(_hs$ + 7);
  var _h$8 = /* @__PURE__ */ Symbol(_hs$ + 8);
  var callbacks2 = new Set;
  var buttonHandlerBlockDepth = 0;
  function resetFrameHooks() {
    callbacks2.clear();
    buttonHandlerBlockDepth = 0;
    __resetAnalog();
  }
  function runFrameHooks(buttons) {
    for (const cb of [...callbacks2])
      cb(buttons);
  }
  function useFrame(callback) {
    const stable = useEffectEvent(callback, _h$0);
    useEffect(() => {
      callbacks2.add(stable);
      return () => {
        callbacks2.delete(stable);
      };
    }, [], _h$1);
  }
  function pushButtonHandlerBlock() {
    buttonHandlerBlockDepth++;
    let disposed = false;
    return () => {
      if (disposed)
        return;
      disposed = true;
      buttonHandlerBlockDepth = Math.max(0, buttonHandlerBlockDepth - 1);
    };
  }
  function useButtonPress(mask, callback, opts = {}) {
    const prevButtons = useRef(opts.latched ? ~0 : 0, _h$2);
    const handler = useEffectEvent((buttons) => {
      const pressed = buttons & ~prevButtons.current;
      prevButtons.current = buttons;
      const active = typeof opts.active === "function" ? opts.active() : opts.active ?? true;
      if (!active)
        return;
      if (buttonHandlerBlockDepth > 0 && !opts.allowWhenBlocked)
        return;
      if (pressed & mask)
        callback(pressed, buttons);
    }, _h$3);
    useEffect(() => {
      callbacks2.add(handler);
      return () => {
        callbacks2.delete(handler);
      };
    }, [], _h$4);
  }
  // framework/src/touch.ts
  var LEGACY_COORD_BITS = 9;
  var LEGACY_COORD_MASK = (1 << LEGACY_COORD_BITS) - 1;
  var LEGACY_ID_SHIFT = LEGACY_COORD_BITS * 2;
  var WIDE_MARKER = 2147483648;
  var WIDE_COORD_BITS = 10;
  var WIDE_COORD_MASK = (1 << WIDE_COORD_BITS) - 1;
  var WIDE_ID_SHIFT = WIDE_COORD_BITS * 2;
  var EMPTY = Object.freeze([]);
  var primarySnapshot = EMPTY;
  var auxiliarySnapshot = EMPTY;
  var allSnapshot = EMPTY;
  function __setTouches(packed, hits, surfaces) {
    if (!packed || packed.length === 0) {
      primarySnapshot = EMPTY;
      auxiliarySnapshot = EMPTY;
      allSnapshot = EMPTY;
      return;
    }
    const all = packed.slice(0, 8).map((value, index) => {
      const wide = (value & WIDE_MARKER) !== 0;
      const coordBits = wide ? WIDE_COORD_BITS : LEGACY_COORD_BITS;
      const coordMask = wide ? WIDE_COORD_MASK : LEGACY_COORD_MASK;
      const idShift = wide ? WIDE_ID_SHIFT : LEGACY_ID_SHIFT;
      return Object.freeze({
        surface: surfaces?.[index] === 1 ? "auxiliary" : "primary",
        id: value >>> idShift & 255,
        x: value & coordMask,
        y: value >>> coordBits & coordMask,
        hit: hits?.[index]
      });
    });
    allSnapshot = Object.freeze(all);
    primarySnapshot = Object.freeze(all.filter((contact) => contact.surface === "primary"));
    auxiliarySnapshot = Object.freeze(all.filter((contact) => contact.surface === "auxiliary"));
  }
  function __resetTouches() {
    primarySnapshot = EMPTY;
    auxiliarySnapshot = EMPTY;
    allSnapshot = EMPTY;
  }
  // framework/src/display.ts
  var roots = null;
  function layer(width, height, overlay) {
    const node = createElement("view");
    setProp(node, "style", overlay ? {
      width,
      height,
      posType: ENUMS.PosType.Absolute,
      insetT: 0,
      insetR: 0,
      insetB: 0,
      insetL: 0,
      zIndex: 1000,
      hitPass: 1
    } : {
      width,
      height,
      overflow: ENUMS.Overflow.Hidden
    }, undefined);
    return node;
  }
  function mountAuxiliarySurface(ops) {
    const descriptor = ops.__auxiliarySurface;
    if (!descriptor) {
      roots = null;
      return null;
    }
    if (!Number.isInteger(descriptor.root) || descriptor.root <= 1 || !Number.isFinite(descriptor.w) || descriptor.w <= 0 || !Number.isFinite(descriptor.h) || descriptor.h <= 0) {
      throw new Error("PocketJS: invalid ui.__auxiliarySurface descriptor");
    }
    const native = adoptNativeRoot(descriptor.root, "auxiliary-root");
    const app = layer(descriptor.w, descriptor.h, false);
    const overlay = layer(descriptor.w, descriptor.h, true);
    insertNode(native, app);
    insertNode(native, overlay);
    roots = {
      native,
      app,
      overlay,
      viewport: Object.freeze({
        width: descriptor.w,
        height: descriptor.h
      })
    };
    return roots;
  }
  function unmountAuxiliarySurface(ops) {
    const mounted = roots;
    roots = null;
    if (!mounted)
      return;
    for (const child of mounted.native.children.splice(0)) {
      child.parent = null;
      ops.destroyNode(child.id);
    }
    releaseNativeRoot(mounted.native);
  }
  function hasAuxiliarySurface() {
    return roots !== null;
  }
  function getAuxiliarySurfaceRoots() {
    if (!roots) {
      throw new Error("PocketJS: AuxiliarySurface requires a resolved display.auxiliary capability");
    }
    return roots;
  }

  // framework/src/components-octane.tsx
  var _hs$2 = /* @__PURE__ */ hookSlots(21);
  var _h$02 = /* @__PURE__ */ Symbol(_hs$2);
  var _h$12 = /* @__PURE__ */ Symbol(_hs$2 + 1);
  var _h$22 = /* @__PURE__ */ Symbol(_hs$2 + 2);
  var _h$32 = /* @__PURE__ */ Symbol(_hs$2 + 3);
  var _h$42 = /* @__PURE__ */ Symbol(_hs$2 + 4);
  var _h$52 = /* @__PURE__ */ Symbol(_hs$2 + 5);
  var _h$62 = /* @__PURE__ */ Symbol(_hs$2 + 6);
  var _h$72 = /* @__PURE__ */ Symbol(_hs$2 + 7);
  var _h$82 = /* @__PURE__ */ Symbol(_hs$2 + 8);
  var _h$9 = /* @__PURE__ */ Symbol(_hs$2 + 9);
  var _h$10 = /* @__PURE__ */ Symbol(_hs$2 + 10);
  var _h$11 = /* @__PURE__ */ Symbol(_hs$2 + 11);
  var _h$122 = /* @__PURE__ */ Symbol(_hs$2 + 12);
  var _h$13 = /* @__PURE__ */ Symbol(_hs$2 + 13);
  var _h$14 = /* @__PURE__ */ Symbol(_hs$2 + 14);
  var _h$15 = /* @__PURE__ */ Symbol(_hs$2 + 15);
  var _h$16 = /* @__PURE__ */ Symbol(_hs$2 + 16);
  var _h$17 = /* @__PURE__ */ Symbol(_hs$2 + 17);
  var _h$18 = /* @__PURE__ */ Symbol(_hs$2 + 18);
  var _h$19 = /* @__PURE__ */ Symbol(_hs$2 + 19);
  var _h$20 = /* @__PURE__ */ Symbol(_hs$2 + 20);
  var __octaneUniversalPlan0 = universalPlan("pocket", {
    kind: "slot",
    slot: 0
  });
  var __octaneUniversalPlan1 = universalPlan("pocket", {
    kind: "slot",
    slot: 0
  });
  var __octaneUniversalPlan2 = universalPlan("pocket", {
    kind: "slot",
    slot: 0
  });
  var __octaneUniversalPlan3 = universalPlan("pocket", {
    kind: "slot",
    slot: 0
  });
  var __octaneUniversalPlan4 = universalPlan("pocket", {
    kind: "range",
    children: [{
      kind: "slot",
      slot: 0
    }]
  });
  var __octaneUniversalPlan5 = universalPlan("pocket", {
    kind: "range",
    children: [{
      kind: "slot",
      slot: 0
    }]
  });
  var __octaneUniversalPlan6 = universalPlan("pocket", {
    kind: "range",
    children: [{
      kind: "slot",
      slot: 0
    }]
  });
  var __octaneUniversalPlan7 = universalPlan("pocket", {
    kind: "range",
    children: [{
      kind: "slot",
      slot: 0
    }]
  });
  var __octaneUniversalPlan8 = universalPlan("pocket", {
    kind: "slot",
    slot: 0
  });
  var __octaneUniversalPlan9 = universalPlan("pocket", {
    kind: "range",
    children: [{
      kind: "slot",
      slot: 0
    }, {
      kind: "slot",
      slot: 1
    }]
  });
  var __octaneUniversalPlan10 = universalPlan("pocket", {
    kind: "slot",
    slot: 0
  });
  var __octaneUniversalPlan11 = universalPlan("pocket", {
    kind: "range",
    children: [{
      kind: "slot",
      slot: 0
    }]
  });
  var __octaneUniversalPlan12 = universalPlan("pocket", {
    kind: "slot",
    slot: 0
  });
  var __octaneUniversalPlan13 = universalPlan("pocket", {
    kind: "range",
    children: [{
      kind: "slot",
      slot: 0
    }]
  });
  var __octaneUniversalPlan14 = universalPlan("pocket", {
    kind: "slot",
    slot: 0
  });
  var __octaneUniversalPlan15 = universalPlan("pocket", {
    kind: "slot",
    slot: 0
  });
  var __octaneUniversalPlan16 = universalPlan("pocket", {
    kind: "slot",
    slot: 0
  });
  var __octaneUniversalPlan17 = universalPlan("pocket", {
    kind: "slot",
    slot: 0
  });
  var __octaneUniversalPlan18 = universalPlan("pocket", {
    kind: "slot",
    slot: 0
  });
  var __octaneUniversalPlan19 = universalPlan("pocket", {
    kind: "slot",
    slot: 0
  });
  var __octaneUniversalPlan20 = universalPlan("pocket", {
    kind: "slot",
    slot: 0
  });
  var __octaneUniversalPlan21 = universalPlan("pocket", {
    kind: "slot",
    slot: 0
  });
  var RENDERER_MODULE = "@pocketjs/framework/octane/renderer";
  var createPortal2 = createPortal;
  function valueOf(value) {
    return typeof value === "function" ? value() : value;
  }
  function resolveActive(active) {
    const resolved = valueOf(active);
    return typeof resolved === "function" ? !!resolved() : resolved ?? true;
  }
  function normalizeClassValue(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.entries(value).filter(([, active]) => !!active).map(([name]) => name).join(" ");
    }
    if (!Array.isArray(value))
      return value;
    const parts = value.map((part) => normalizeClassValue(part)).filter((part) => typeof part === "string" && part.length > 0);
    return parts.join(" ");
  }
  function mergeRefs(...refs) {
    return (node) => {
      for (const ref of refs) {
        if (!ref)
          continue;
        if (typeof ref === "function")
          ref(node);
        else
          ref.current = node;
      }
    };
  }
  function hostProps(props) {
    const out = {};
    for (const key of Object.keys(props)) {
      if (key === "children" || key === "key")
        continue;
      const value = props[key];
      if (value === undefined)
        continue;
      if (key === "className") {
        if (out.class === undefined)
          out.class = normalizeClassValue(value);
      } else if (key === "class") {
        out.class = normalizeClassValue(value);
      } else if (key === "nodeRef") {
        if (out.ref === undefined)
          out.ref = value;
      } else {
        out[key] = value;
      }
    }
    return out;
  }
  function primitive(tag) {
    const plan = universalPlan(OCTANE_RENDERER_ID, {
      kind: "host",
      type: tag,
      propsSlot: 0,
      children: [{
        kind: "slot",
        slot: 1
      }]
    });
    return defineUniversalComponent(OCTANE_RENDERER_ID, (props) => universalValue(plan, [hostProps(props), props.children]), {
      module: RENDERER_MODULE
    });
  }
  var View = primitive("view");
  var Text = primitive("text");
  var Image = primitive("image");
  var Sprite = primitive("image");
  var CompositorSurface = primitive("surface");
  var Screen = defineUniversalComponent("pocket", function Screen(props) {
    return universalValue(__octaneUniversalPlan0, [universalComponent("pocket", View, universalProps([["spread", props], ["set", "class", props.class ?? props.className ?? "relative flex-col w-full h-full bg-slate-50 overflow-hidden"]]))]);
  }, {
    module: "@pocketjs/framework/octane/renderer"
  });
  var Focusable = defineUniversalComponent("pocket", function Focusable(props) {
    return universalValue(__octaneUniversalPlan1, [universalComponent("pocket", View, universalProps([["spread", props], ["set", "focusable", true]]))]);
  }, {
    module: "@pocketjs/framework/octane/renderer"
  });
  var FocusScope = defineUniversalComponent("pocket", function FocusScope(props) {
    const ref = useRef(null, _h$02);
    const active = resolveActive(props.active);
    useLayoutEffect(() => {
      const node = ref.current;
      if (!node || !active)
        return;
      return pushFocusScope(node, {
        autoFocus: props.autoFocus,
        restoreFocus: props.restoreFocus
      });
    }, [active], _h$12);
    const {
      active: _active,
      autoFocus: _autoFocus,
      restoreFocus: _restoreFocus,
      ...rest
    } = props;
    return universalValue(__octaneUniversalPlan2, [universalComponent("pocket", View, universalProps([["spread", rest], ["set", "nodeRef", mergeRefs(ref, props.nodeRef)]]))]);
  }, {
    module: "@pocketjs/framework/octane/renderer"
  });
  var FocusGrid = defineUniversalComponent("pocket", function FocusGrid(props) {
    const ref = useRef(null, _h$22);
    const active = resolveActive(props.active);
    const columns = props.columns;
    const wrap = props.wrap;
    useLayoutEffect(() => {
      const node = ref.current;
      if (!node || !active)
        return;
      return pushFocusGrid(node, {
        columns,
        wrap
      });
    }, [active, columns, wrap], _h$32);
    const {
      active: _active,
      columns: _columns,
      wrap: _wrap,
      ...rest
    } = props;
    return universalValue(__octaneUniversalPlan3, [universalComponent("pocket", View, universalProps([["spread", rest], ["set", "nodeRef", mergeRefs(ref, props.nodeRef)]]))]);
  }, {
    module: "@pocketjs/framework/octane/renderer"
  });
  var ActionHandler = defineUniversalComponent("pocket", function ActionHandler(props) {
    withSlot(_h$42, useButtonPress, props.button, (pressed, buttons) => props.onPress?.(pressed, buttons), {
      allowWhenBlocked: props.allowWhenBlocked,
      active: () => resolveActive(props.active),
      latched: props.latched
    }, _h$42);
    return universalValue(__octaneUniversalPlan4, [props.children]);
  }, {
    module: "@pocketjs/framework/octane/renderer"
  });
  var Portal = defineUniversalComponent("pocket", function Portal(props) {
    const target = useMemo(() => overlayPortalTarget(), [], _h$52);
    return universalValue(__octaneUniversalPlan5, [createPortal2(props.children, target)]);
  }, {
    module: "@pocketjs/framework/octane/renderer"
  });
  var AuxiliarySurface = defineUniversalComponent("pocket", function AuxiliarySurface(props) {
    const target = useMemo(() => getAuxiliarySurfaceRoots().app, [], _h$62);
    return universalValue(__octaneUniversalPlan6, [createPortal2(props.children, target)]);
  }, {
    module: "@pocketjs/framework/octane/renderer"
  });
  var AuxiliaryPortal = defineUniversalComponent("pocket", function AuxiliaryPortal(props) {
    const target = useMemo(() => getAuxiliarySurfaceRoots().overlay, [], _h$72);
    return universalValue(__octaneUniversalPlan7, [createPortal2(props.children, target)]);
  }, {
    module: "@pocketjs/framework/octane/renderer"
  });
  var Modal = defineUniversalComponent("pocket", function Modal(props) {
    const target = useMemo(() => overlayPortalTarget(), [], _h$82);
    const open = resolveActive(props.open);
    useLayoutEffect(() => {
      if (!open)
        return;
      return pushButtonHandlerBlock();
    }, [open], _h$9);
    return universalValue(__octaneUniversalPlan11, [createPortal2(universalValue(__octaneUniversalPlan10, [universalComponent("pocket", View, universalProps([["set", "class", props.class ?? "absolute inset-0 z-50 flex-col items-center justify-center"]], universalChildren("pocket", () => {
      return universalValue(__octaneUniversalPlan9, [universalComponent("pocket", View, universalProps([["set", "class", "absolute inset-0 bg-slate-950"], ["set", "style", {
        opacity: open ? 0.62 : 0
      }]])), universalComponent("pocket", View, universalProps([["set", "class", props.panelClass ?? "flex-col gap-2 w-[328] p-3 rounded-xl shadow-lg bg-white border-slate-200"], ["set", "style", {
        opacity: open ? 1 : 0,
        translateY: 0,
        scale: 1
      }]], universalChildren("pocket", () => {
        return universalValue(__octaneUniversalPlan8, [props.children]);
      })))]);
    })))]), target)]);
  }, {
    module: "@pocketjs/framework/octane/renderer"
  });
  var ActionBar = defineUniversalComponent("pocket", function ActionBar(props) {
    const target = useMemo(() => overlayPortalTarget(), [], _h$10);
    return universalValue(__octaneUniversalPlan13, [createPortal2(universalValue(__octaneUniversalPlan12, [universalComponent("pocket", View, universalProps([["spread", props], ["set", "class", props.class ?? props.className ?? "absolute left-3 right-3 bottom-3 flex-row items-center justify-between px-2 py-1 rounded-lg shadow-md bg-white border-slate-200"]]))]), target)]);
  }, {
    module: "@pocketjs/framework/octane/renderer"
  });
  var Grid = defineUniversalComponent("pocket", function Grid(props) {
    const ref = useRef(null, _h$11);
    const active = resolveActive(props.active);
    const columns = props.columns;
    const wrap = props.wrap;
    useLayoutEffect(() => {
      const node = ref.current;
      if (!node || columns == null || !active)
        return;
      return pushFocusGrid(node, {
        columns,
        wrap
      });
    }, [active, columns, wrap], _h$122);
    const {
      active: _active,
      columns: _columns,
      wrap: _wrap,
      gap,
      style,
      ...rest
    } = props;
    return universalValue(__octaneUniversalPlan14, [universalComponent("pocket", View, universalProps([["spread", rest], ["set", "class", props.class ?? props.className ?? "flex-row flex-wrap"], ["set", "style", gap != null ? {
      ...style ?? {},
      gap
    } : style], ["set", "nodeRef", mergeRefs(ref, props.nodeRef)]]))]);
  }, {
    module: "@pocketjs/framework/octane/renderer"
  });
  var Lazy = defineUniversalComponent("pocket", function Lazy(props) {
    const reveal = Math.max(0, Math.floor(props.reveal ?? 0));
    const [ready, setReady] = useState(reveal === 0, _h$13);
    const elapsed = useRef(0, _h$14);
    withSlot(_h$15, useFrame, () => {
      if (ready)
        return;
      if (!resolveActive(props.when))
        return;
      if (++elapsed.current >= reveal)
        setReady(true);
    }, _h$15);
    const active = resolveActive(props.when);
    const body = !active ? null : ready ? valueOf(props.children) : valueOf(props.fallback);
    const {
      when: _when,
      reveal: _reveal,
      fallback: _fallback,
      children: _children,
      ...rest
    } = props;
    return universalValue(__octaneUniversalPlan16, [universalComponent("pocket", View, universalProps([["spread", rest], ["set", "style", props.class || props.className ? props.style : {
      ...props.style ?? {},
      grow: 1,
      width: SCREEN_W,
      flexDir: ENUMS.FlexDir.Col,
      justify: ENUMS.Justify.Center,
      align: ENUMS.Align.Center
    }]], universalChildren("pocket", () => {
      return universalValue(__octaneUniversalPlan15, [body]);
    })))]);
  }, {
    module: "@pocketjs/framework/octane/renderer"
  });
  var Gallery = defineUniversalComponent("pocket", function Gallery(props) {
    const count = Math.max(0, Math.floor(props.count ?? 0));
    const win = Math.max(0, Math.floor(props.window ?? 1));
    const clampPage = (n) => props.wrap ? (n % count + count) % count : Math.max(0, Math.min(count - 1, n));
    const page = clampPage(Math.max(0, Math.floor(valueOf(props.page) ?? 0)));
    const stripRef = useRef(null, _h$16);
    const mounted = useRef(false, _h$17);
    if (props.bindTriggers !== false) {
      withSlot(_h$18, useButtonPress, BTN.LTRIGGER, () => props.onPageChange?.(clampPage(page - 1)), _h$18);
      withSlot(_h$19, useButtonPress, BTN.RTRIGGER, () => props.onPageChange?.(clampPage(page + 1)), _h$19);
    }
    useLayoutEffect(() => {
      const strip = stripRef.current;
      if (!strip)
        return;
      if (!mounted.current) {
        mounted.current = true;
        setProp(strip, "style", {
          translateX: -page * SCREEN_W
        }, undefined);
        return;
      }
      animate(strip, "translateX", -page * SCREEN_W, {
        dur: props.duration ?? 300,
        easing: props.easing ?? "out"
      });
    }, [page], _h$20);
    const pages = [];
    for (let i = 0;i < count; i++) {
      pages.push(universalValue(__octaneUniversalPlan18, [universalComponent("pocket", View, universalProps([["set", "key", i], ["set", "style", {
        posType: ENUMS.PosType.Absolute,
        insetT: 0,
        insetR: 0,
        insetB: 0,
        insetL: 0,
        translateX: i * SCREEN_W
      }]], universalChildren("pocket", () => {
        return universalValue(__octaneUniversalPlan17, [Math.abs(i - page) <= win ? props.renderPage(i) : null]);
      })))]));
    }
    return universalValue(__octaneUniversalPlan21, [universalComponent("pocket", View, universalProps([["set", "class", props.class], ["set", "style", props.class ? undefined : {
      width: SCREEN_W,
      height: SCREEN_H,
      overflow: ENUMS.Overflow.Hidden
    }]], universalChildren("pocket", () => {
      return universalValue(__octaneUniversalPlan20, [universalComponent("pocket", View, universalProps([["set", "nodeRef", stripRef], ["set", "style", {
        width: SCREEN_W,
        height: SCREEN_H
      }]], universalChildren("pocket", () => {
        return universalValue(__octaneUniversalPlan19, [pages]);
      })))]);
    })))]);
  }, {
    module: "@pocketjs/framework/octane/renderer"
  });
  // framework/src/scheduler-polyfill.ts
  if (typeof globalThis.queueMicrotask !== "function") {
    globalThis.queueMicrotask = (fn) => {
      Promise.resolve().then(fn);
    };
  }
  if (typeof globalThis.setTimeout !== "function") {
    globalThis.setTimeout = (fn) => {
      queueMicrotask(fn);
      return 0;
    };
  }
  if (typeof globalThis.clearTimeout !== "function") {
    globalThis.clearTimeout = () => {};
  }
  if (typeof globalThis.console !== "object") {
    globalThis.console = {
      log() {},
      warn() {},
      error() {}
    };
  }

  // framework/src/devtools.ts
  var TAPE_CAP = 36000;
  var TREE_THROTTLE = 30;
  var STATS_EVERY = 30;
  var state = {
    ops: null,
    transport: null,
    app: undefined,
    frame: 0,
    tape: new Uint16Array(TAPE_CAP),
    tapeAnalog: new Uint16Array(TAPE_CAP),
    tapeRightAnalog: null,
    tapeTouch: null,
    tapeTouchSurfaces: null,
    tapeStart: 0,
    tapeLen: 0,
    tapeFirstFrame: 0,
    replayMasks: null,
    replayAnalog: null,
    replayRightAnalog: null,
    replayTouch: null,
    replayTouchSurfaces: null,
    replayAt: 0,
    paused: false,
    stepQueued: 0,
    inspectReportId: null,
    inspectAskedAt: 0,
    treeDirty: true,
    treeSentAt: -TREE_THROTTLE,
    saidHello: false,
    hostCalls: 0
  };
  function initDevtools(ops) {
    const g = globalThis;
    if (!g.console)
      g.console = {
        log() {},
        warn() {},
        error() {}
      };
    state.ops = ops;
    state.frame = 0;
    state.tapeStart = 0;
    state.tapeLen = 0;
    state.tapeFirstFrame = 0;
    state.tapeTouch = null;
    state.tapeRightAnalog = null;
    state.tapeTouchSurfaces = null;
    state.replayMasks = null;
    state.replayAnalog = null;
    state.replayRightAnalog = null;
    state.replayTouch = null;
    state.replayTouchSurfaces = null;
    state.paused = false;
    state.stepQueued = 0;
    state.inspectReportId = null;
    state.inspectAskedAt = 0;
    state.treeDirty = true;
    state.treeSentAt = -TREE_THROTTLE;
    state.saidHello = false;
    state.hostCalls = 0;
    state.app = globalThis.__pocketApp;
    const injected = globalThis.__pocketDevtoolsTransport;
    if (injected) {
      state.transport = injected;
    } else if (ops.__dbgActive?.() && ops.__dbgPoll && ops.__dbgSend) {
      state.transport = {
        send: (l) => ops.__dbgSend(l),
        recv: () => ops.__dbgPoll(),
        everyFrames: 10
      };
    } else {
      state.transport = null;
    }
    if (state.transport) {
      setTreeMutationHook(() => {
        state.treeDirty = true;
      });
      bridgeConsole();
    } else {
      setTreeMutationHook(null);
    }
    globalThis.__pocketDevtools = api;
  }
  function wrapFrameHandler(h) {
    return (buttons, analogArg, touchArg, hitsArg, touchSurfacesArg, rightAnalogArg) => {
      state.hostCalls++;
      if (state.transport) {
        pollTransport();
        flushInspectReport();
      }
      let mask = buttons;
      let analog = analogArg === undefined ? ANALOG_CENTER : analogArg & 65535;
      let rightAnalog = rightAnalogArg === undefined ? ANALOG_CENTER : rightAnalogArg & 65535;
      let touch = touchArg;
      let hits = hitsArg;
      let touchSurfaces = touchSurfacesArg;
      if (state.replayMasks) {
        if (state.replayAt < state.replayMasks.length) {
          mask = state.replayMasks[state.replayAt];
          analog = state.replayAnalog ? state.replayAnalog[state.replayAt] : ANALOG_CENTER;
          rightAnalog = state.replayRightAnalog ? state.replayRightAnalog[state.replayAt] : ANALOG_CENTER;
          touch = state.replayTouch ? state.replayTouch[state.replayAt] : undefined;
          touchSurfaces = state.replayTouchSurfaces ? state.replayTouchSurfaces[state.replayAt] : undefined;
          hits = undefined;
          state.replayAt++;
        } else {
          state.replayMasks = null;
          state.replayAnalog = null;
          state.replayRightAnalog = null;
          state.replayTouch = null;
          state.replayTouchSurfaces = null;
          send({
            t: "replayDone",
            frame: state.frame
          });
        }
      }
      if (state.paused) {
        if (state.stepQueued <= 0)
          return;
        state.stepQueued--;
        state.ops?.debugStep?.();
      }
      recordMask(mask, analog, touch, touchSurfaces, rightAnalog);
      state.frame++;
      try {
        h(mask, analog, touch, hits, touchSurfaces, rightAnalog);
      } catch (e) {
        send({
          t: "error",
          frame: state.frame,
          message: e instanceof Error ? e.message : String(e),
          stack: e instanceof Error ? e.stack : undefined
        });
        throw e;
      }
      if (state.transport)
        afterFrame();
    };
  }
  function recordMask(mask, analog, touch, touchSurfaces, rightAnalog) {
    const right = rightAnalog ?? ANALOG_CENTER;
    if (right !== ANALOG_CENTER && !state.tapeRightAnalog)
      state.tapeRightAnalog = new Uint16Array(TAPE_CAP).fill(ANALOG_CENTER);
    const contacts = touch && touch.length > 0 ? touch.slice(0, 8) : null;
    if (contacts && !state.tapeTouch) {
      state.tapeTouch = new Array(TAPE_CAP).fill(null);
    }
    const surfaces = contacts && touchSurfaces ? touchSurfaces.slice(0, contacts.length).map((surface) => surface === 1 ? 1 : 0) : null;
    if (surfaces?.some((surface) => surface === 1) && !state.tapeTouchSurfaces) {
      state.tapeTouchSurfaces = new Array(TAPE_CAP).fill(null);
    }
    if (state.tapeLen < TAPE_CAP) {
      const at = (state.tapeStart + state.tapeLen) % TAPE_CAP;
      state.tape[at] = mask;
      state.tapeAnalog[at] = analog;
      if (state.tapeRightAnalog)
        state.tapeRightAnalog[at] = right;
      if (state.tapeTouch)
        state.tapeTouch[at] = contacts;
      if (state.tapeTouchSurfaces)
        state.tapeTouchSurfaces[at] = surfaces;
      state.tapeLen++;
    } else {
      state.tape[state.tapeStart] = mask;
      state.tapeAnalog[state.tapeStart] = analog;
      if (state.tapeRightAnalog)
        state.tapeRightAnalog[state.tapeStart] = right;
      if (state.tapeTouch)
        state.tapeTouch[state.tapeStart] = contacts;
      if (state.tapeTouchSurfaces)
        state.tapeTouchSurfaces[state.tapeStart] = surfaces;
      state.tapeStart = (state.tapeStart + 1) % TAPE_CAP;
      state.tapeFirstFrame++;
    }
  }
  function rlePairs(ring) {
    const out = [];
    for (let i = 0;i < state.tapeLen; i++) {
      const v = ring[(state.tapeStart + i) % TAPE_CAP];
      const last = out[out.length - 1];
      if (last && last[0] === v)
        last[1]++;
      else
        out.push([v, 1]);
    }
    return out;
  }
  function exportTape() {
    const tape = {
      v: 1,
      app: state.app,
      frames: state.tapeLen,
      masks: rlePairs(state.tape),
      startFrame: state.tapeFirstFrame
    };
    const analog = rlePairs(state.tapeAnalog);
    if (analog.length > 1 || analog.length === 1 && analog[0][0] !== ANALOG_CENTER) {
      tape.analog = analog;
    }
    if (state.tapeRightAnalog) {
      const right = rlePairs(state.tapeRightAnalog);
      if (right.some(([value]) => value !== ANALOG_CENTER))
        tape.rightAnalog = right;
    }
    if (state.tapeTouch) {
      const touch = [];
      for (let i = 0;i < state.tapeLen; i++) {
        const contacts = state.tapeTouch[(state.tapeStart + i) % TAPE_CAP];
        if (contacts)
          touch.push([i, contacts.slice()]);
      }
      if (touch.length > 0) {
        tape.v = 2;
        tape.touch = touch;
      }
    }
    if (state.tapeTouchSurfaces) {
      const touchSurfaces = [];
      for (let i = 0;i < state.tapeLen; i++) {
        const surfaces = state.tapeTouchSurfaces[(state.tapeStart + i) % TAPE_CAP];
        if (surfaces)
          touchSurfaces.push([i, surfaces.slice()]);
      }
      if (touchSurfaces.length > 0) {
        tape.v = 3;
        tape.touchSurfaces = touchSurfaces;
      }
    }
    return tape;
  }
  function expandPairs(pairs, fill, total) {
    const out = new Uint16Array(total).fill(fill);
    let at = 0;
    for (const [v, n] of pairs) {
      out.fill(v, at, Math.min(at + n, total));
      at += n;
    }
    return out;
  }
  function expandTape(tape) {
    let total = 0;
    for (const [, n] of tape.masks)
      total += n;
    return expandPairs(tape.masks, 0, total);
  }
  function expandTapeAnalog(tape) {
    let total = 0;
    for (const [, n] of tape.masks)
      total += n;
    return expandPairs(tape.analog ?? [], ANALOG_CENTER, total);
  }
  function expandTapeRightAnalog(tape) {
    return expandPairs(tape.rightAnalog ?? [], ANALOG_CENTER, tape.masks.reduce((n, [, count]) => n + count, 0));
  }
  function expandTapeTouch(tape) {
    let total = 0;
    for (const [, n] of tape.masks)
      total += n;
    const out = new Array(total).fill(undefined);
    for (const [frame, contacts] of tape.touch ?? []) {
      if (frame >= 0 && frame < total)
        out[frame] = contacts;
    }
    return out;
  }
  function expandTapeTouchSurfaces(tape) {
    let total = 0;
    for (const [, n] of tape.masks)
      total += n;
    const out = new Array(total).fill(undefined);
    for (const [frame, surfaces] of tape.touchSurfaces ?? []) {
      if (frame >= 0 && frame < total)
        out[frame] = surfaces;
    }
    return out;
  }
  function send(msg) {
    try {
      state.transport?.send(JSON.stringify(msg));
    } catch {}
  }
  function pollTransport() {
    const t = state.transport;
    const every = t.everyFrames ?? 1;
    if (every > 1 && state.hostCalls % every !== 0)
      return;
    if (!state.saidHello) {
      state.saidHello = true;
      send({
        t: "hello",
        app: state.app,
        host: hostKind(),
        frame: state.frame
      });
    }
    for (let guard = 0;guard < 64; guard++) {
      const chunk = t.recv();
      if (!chunk)
        break;
      for (const line of chunk.split(`
`)) {
        if (line.trim())
          handleMessage(line);
      }
    }
  }
  function handleMessage(line) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    const ops = state.ops;
    switch (msg.t) {
      case "inspect": {
        const id = typeof msg.id === "number" ? msg.id : 0;
        ops?.debugInspect?.(id);
        state.inspectReportId = id || null;
        state.inspectAskedAt = state.hostCalls;
        if (!id)
          send({
            t: "inspect",
            id: 0,
            rect: null
          });
        break;
      }
      case "pause":
        state.paused = true;
        state.stepQueued = 0;
        ops?.debugPause?.(true);
        sendStats();
        break;
      case "resume":
        state.paused = false;
        ops?.debugPause?.(false);
        sendStats();
        break;
      case "step":
        state.stepQueued += typeof msg.n === "number" && msg.n > 0 ? msg.n : 1;
        break;
      case "getTree":
        sendTree();
        break;
      case "eval": {
        let ok = true;
        let value;
        try {
          value = fmt((0, eval)(String(msg.code)));
        } catch (e) {
          ok = false;
          value = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
        }
        send({
          t: "evalResult",
          id: msg.id,
          ok,
          value
        });
        break;
      }
      case "dumpTape":
        send({
          t: "tape",
          tape: exportTape()
        });
        break;
      case "devStats": {
        let data = null;
        const raw = ops?.debugStats?.();
        if (raw) {
          try {
            data = JSON.parse(raw);
          } catch {
            data = null;
          }
        }
        send({
          t: "devStats",
          frame: state.frame,
          data
        });
        break;
      }
      case "screenshot": {
        if (ops?.__dbgShot?.()) {
          send({
            t: "screenshotRaw",
            file: "shot.raw",
            w: 480,
            h: 272,
            stride: 512,
            frame: state.frame
          });
        } else {
          send({
            t: "log",
            level: "warn",
            args: ["screenshot: not supported on this host"]
          });
        }
        break;
      }
      case "replay": {
        const tape = msg.tape;
        if (tape && Array.isArray(tape.masks)) {
          state.replayMasks = expandTape(tape);
          state.replayAnalog = tape.analog ? expandTapeAnalog(tape) : null;
          state.replayRightAnalog = tape.rightAnalog ? expandTapeRightAnalog(tape) : null;
          state.replayTouch = tape.touch ? expandTapeTouch(tape) : null;
          state.replayTouchSurfaces = tape.touchSurfaces ? expandTapeTouchSurfaces(tape) : null;
          state.replayAt = 0;
        }
        break;
      }
      default:
        break;
    }
  }
  function afterFrame() {
    if (state.treeDirty && state.frame - state.treeSentAt >= TREE_THROTTLE) {
      sendTree();
    }
    if (state.frame % STATS_EVERY === 0)
      sendStats();
  }
  function flushInspectReport() {
    const id = state.inspectReportId;
    if (id == null)
      return;
    const ops = state.ops;
    if (!ops?.debugRectXY || !ops.debugRectWH) {
      state.inspectReportId = null;
      return;
    }
    const xy = ops.debugRectXY();
    if (xy === -1) {
      if (state.hostCalls - state.inspectAskedAt > 60) {
        state.inspectReportId = null;
        send({
          t: "inspect",
          id,
          rect: null
        });
      }
      return;
    }
    const wh = ops.debugRectWH();
    state.inspectReportId = null;
    send({
      t: "inspect",
      id,
      rect: [xy << 16 >> 16, xy >> 16, wh & 65535, wh >> 16 & 65535]
    });
  }
  function sendStats() {
    send({
      t: "stats",
      frame: state.frame,
      nodes: countMountedNodes(),
      tapeLen: state.tapeLen,
      paused: state.paused
    });
  }
  function sendTree() {
    state.treeDirty = false;
    state.treeSentAt = state.frame;
    send({
      t: "tree",
      frame: state.frame,
      root: serializeMountedTree()
    });
  }
  function isTreeMirror(value) {
    if (value == null || typeof value !== "object")
      return false;
    const candidate = value;
    return typeof candidate.id === "number" && typeof candidate.type === "number";
  }
  function forEachTreeMirror(value, visit) {
    if (Array.isArray(value)) {
      for (const entry of value)
        forEachTreeMirror(entry, visit);
      return;
    }
    if (isTreeMirror(value)) {
      visit(value);
      return;
    }
    if (value != null && typeof value === "object") {
      const nodes = value.nodes;
      if (nodes !== undefined)
        forEachTreeMirror(nodes, visit);
    }
  }
  function forEachTreeChild(node, visit) {
    const children = Array.isArray(node.children) ? node.children : [];
    for (const child of children)
      forEachTreeMirror(child, visit);
  }
  function serializeNode(node) {
    const out = {
      i: node.id,
      t: node.domTag ?? String(node.type)
    };
    if (node.debugName)
      out.n = node.debugName;
    const cls = node.domAttrs?.class;
    if (typeof cls === "string" && cls)
      out.c = cls;
    if (node.text)
      out.x = node.text.length > 80 ? node.text.slice(0, 79) + "…" : node.text;
    const kids = [];
    forEachTreeChild(node, (child) => {
      if (child.domNodeType === 8)
        return;
      kids.push(serializeNode(child));
    });
    if (kids.length)
      out.k = kids;
    return out;
  }
  function namedSurfaceRoot(node, name) {
    const out = serializeNode(node);
    if (!out.n)
      out.n = name;
    return out;
  }
  function serializeMountedTree() {
    if (!hasAuxiliarySurface())
      return serializeNode(rootMirror);
    return {
      i: 0,
      t: "surfaces",
      v: 1,
      n: "Displays",
      k: [namedSurfaceRoot(rootMirror, "Primary display"), namedSurfaceRoot(getAuxiliarySurfaceRoots().native, "Auxiliary display")]
    };
  }
  function countNodes(node) {
    let n = 1;
    forEachTreeChild(node, (child) => {
      n += countNodes(child);
    });
    return n;
  }
  function countMountedNodes() {
    let count = countNodes(rootMirror);
    if (hasAuxiliarySurface())
      count += countNodes(getAuxiliarySurfaceRoots().native);
    return count;
  }
  function bridgeConsole() {
    const g = globalThis;
    if (!g.console)
      g.console = {};
    const c = g.console;
    if (c.__pocketBridged)
      return;
    c.__pocketBridged = true;
    for (const level of ["log", "warn", "error"]) {
      const original = c[level];
      c[level] = (...args) => {
        send({
          t: "log",
          level,
          args: args.map((a) => fmt(a))
        });
        original?.apply(c, args);
      };
    }
  }
  function fmt(v, depth = 0) {
    if (v === undefined)
      return "undefined";
    if (v === null)
      return "null";
    const t = typeof v;
    if (t === "string") {
      const s = v;
      return depth === 0 ? clip(s) : JSON.stringify(clip(s));
    }
    if (t === "number" || t === "boolean" || t === "bigint")
      return String(v);
    if (t === "function") {
      const name = v.name;
      return name ? `[function ${name}]` : "[function]";
    }
    if (depth >= 3)
      return Array.isArray(v) ? "[…]" : "{…}";
    if (Array.isArray(v)) {
      const items = v.slice(0, 20).map((x) => fmt(x, depth + 1));
      if (v.length > 20)
        items.push(`… ${v.length - 20} more`);
      return `[${items.join(", ")}]`;
    }
    if (v instanceof Error)
      return `${v.name}: ${v.message}`;
    const entries = Object.entries(v).slice(0, 20);
    const body = entries.map(([k, x]) => `${k}: ${fmt(x, depth + 1)}`).join(", ");
    return `{${body}}`;
  }
  function clip(s) {
    return s.length > 200 ? s.slice(0, 199) + "…" : s;
  }
  function hostKind() {
    const ops = state.ops;
    if (typeof ops?.__host === "string")
      return ops.__host;
    if (ops?.__textures !== undefined)
      return "psp";
    if (typeof globalThis.document !== "undefined")
      return "web";
    return "headless";
  }
  var api = {
    get frame() {
      return state.frame;
    },
    dumpTape: () => exportTape(),
    replay: (tape) => {
      state.replayMasks = expandTape(tape);
      state.replayAnalog = tape.analog ? expandTapeAnalog(tape) : null;
      state.replayRightAnalog = tape.rightAnalog ? expandTapeRightAnalog(tape) : null;
      state.replayTouch = tape.touch ? expandTapeTouch(tape) : null;
      state.replayTouchSurfaces = tape.touchSurfaces ? expandTapeTouchSurfaces(tape) : null;
      state.replayAt = 0;
    }
  };

  // framework/src/styles.ts
  var verbatim = new Map;
  var sortedAlias = new Map;
  function normalize(cls) {
    return cls.trim().replace(/\s+/g, " ");
  }
  function sortTokens(normalized) {
    return normalized.split(" ").sort().join(" ");
  }
  var ALIAS_AMBIGUOUS = -1;
  function registerStyles(table) {
    for (const key of Object.keys(table)) {
      const id = table[key];
      const norm = normalize(key);
      verbatim.set(norm, id);
      const sorted = sortTokens(norm);
      const prev = sortedAlias.get(sorted);
      sortedAlias.set(sorted, prev !== undefined && prev !== id ? ALIAS_AMBIGUOUS : id);
    }
  }
  function resolveStyle(cls) {
    const norm = normalize(cls);
    const hit = verbatim.get(norm);
    if (hit !== undefined)
      return hit;
    const alias = sortedAlias.get(sortTokens(norm));
    return alias === ALIAS_AMBIGUOUS ? undefined : alias;
  }

  // framework/src/effects.ts
  var nextId = 1;
  var pending = new Map;
  var queue = [];
  function traceSink() {
    const s = globalThis.__pocketEffectTrace;
    return typeof s === "function" ? s : null;
  }
  function resetEffects() {
    nextId = 1;
    pending.clear();
    queue = [];
  }
  function __drainEffects() {
    if (queue.length === 0)
      return;
    const batch = queue;
    queue = [];
    for (const {
      id,
      result
    } of batch) {
      const entry = pending.get(id);
      if (!entry)
        continue;
      pending.delete(id);
      traceSink()?.({
        t: "delivery",
        frame: virtualFrame(),
        id,
        kind: entry.kind
      });
      entry.onResult(result);
    }
  }

  // framework/src/services.ts
  var pumps = new Set;
  function runServicePumps() {
    if (pumps.size === 0)
      return;
    for (const pump of pumps)
      pump();
  }

  // framework/src/styles.generated.ts
  var STYLE_IDS = {
    "w-full h-full flex-col bg-slate-900": 0,
    "flex-row items-center justify-between px-4 py-2 bg-slate-900": 1,
    "text-sm text-white font-bold": 2,
    "text-xs text-slate-400": 3,
    "flex-1 overflow-hidden bg-slate-800": 4,
    "bg-slate-900 border border-slate-600": 5,
    "text-xs text-white": 6,
    "text-xs text-slate-500": 7,
    "relative flex-col w-full h-full bg-slate-50 overflow-hidden": 8,
    "absolute inset-0 z-50 flex-col items-center justify-center": 9,
    "absolute inset-0 bg-slate-950": 10,
    "flex-col gap-2 w-[328] p-3 rounded-xl shadow-lg bg-white border-slate-200": 11,
    "absolute left-3 right-3 bottom-3 flex-row items-center justify-between px-2 py-1 rounded-lg shadow-md bg-white border-slate-200": 12,
    "flex-row flex-wrap": 13,
    grow: 14
  };

  // framework/src/index-octane.ts
  var STYLES_KEY = "ui:styles";
  var FONT_PREFIX = "ui:font.";
  var IMG_PREFIX = "ui:img.";
  var SPRITE_PREFIX = "ui:sprite.";
  function globalOps() {
    return globalThis.ui;
  }
  function uploadPakImages(ops) {
    if (ops.__textures)
      return;
    for (const key of entries(IMG_PREFIX)) {
      const blob = get(key);
      let handle;
      if (ops.uploadImgEntry) {
        handle = ops.uploadImgEntry(blob);
      } else {
        const dv = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
        handle = ops.uploadTexture(blob.subarray(8), dv.getUint16(0, true), dv.getUint16(2, true), blob[4]);
      }
      if (handle >= 0)
        registerTexture(key.slice(IMG_PREFIX.length), handle);
    }
  }
  function uploadPakSprites(ops) {
    if (ops.__sprites)
      return;
    for (const key of entries(SPRITE_PREFIX)) {
      const blob = get(key);
      const dv = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
      const w = dv.getUint16(0, true);
      const h = dv.getUint16(2, true);
      const psm = blob[4];
      const frames = dv.getUint16(6, true);
      const cols = dv.getUint16(8, true);
      const step = dv.getUint16(10, true);
      const handle = ops.uploadTexture(blob.subarray(16), w, h, psm);
      if (handle >= 0) {
        registerSprite(key.slice(SPRITE_PREFIX.length), {
          handle,
          frames,
          cols,
          step
        });
      }
    }
  }
  function createLayer(style) {
    const layer = createElement("view");
    setProp(layer, "style", style, undefined);
    return layer;
  }
  var appLayer = null;
  var overlayLayer = null;
  function resizeViewport(w, h) {
    if (!appLayer || !overlayLayer)
      return;
    setProp(appLayer, "style", {
      width: w,
      height: h,
      overflow: ENUMS.Overflow.Hidden
    }, undefined);
    setProp(overlayLayer, "style", {
      width: w,
      height: h,
      posType: ENUMS.PosType.Absolute,
      insetT: 0,
      insetR: 0,
      insetB: 0,
      insetL: 0,
      zIndex: 1000
    }, undefined);
    const ops = getOps();
    ops.__viewport = {
      w,
      h
    };
  }
  function render2(code, opts = {}) {
    const host = detectHost(opts.ops);
    installHost(host);
    setStyleResolver(resolveStyle);
    if (opts.styles)
      registerStyles(opts.styles);
    const nativeTextureTable = host.kind === "native" ? host.ops.__textures : undefined;
    if (host.kind === "native") {
      if (nativeTextureTable) {
        for (const key in nativeTextureTable) {
          registerTexture(key, nativeTextureTable[key]);
        }
      }
      const spr = host.ops.__sprites;
      if (spr) {
        for (const key in spr)
          registerSprite(key, spr[key]);
      }
    }
    if (host.kind === "injected" || nativeTextureTable === undefined) {
      if (opts.pak)
        loadPack(opts.pak);
      if (hasPack()) {
        for (const key of entries()) {
          if (key === STYLES_KEY) {
            host.ops.loadStyles?.(get(key));
          } else if (key.startsWith(FONT_PREFIX)) {
            host.ops.loadFontAtlas?.(get(key));
          }
        }
      }
    }
    const auxiliary = mountAuxiliarySurface(host.ops);
    const viewport = hostViewport(host.ops);
    const layerW = viewport?.w ?? SCREEN_W;
    const layerH = viewport?.h ?? SCREEN_H;
    const appRoot = createLayer({
      width: layerW,
      height: layerH,
      overflow: ENUMS.Overflow.Hidden
    });
    const overlayRoot = createLayer({
      width: layerW,
      height: layerH,
      posType: ENUMS.PosType.Absolute,
      insetT: 0,
      insetR: 0,
      insetB: 0,
      insetL: 0,
      zIndex: 1000
    });
    insertNode(rootMirror, appRoot);
    insertNode(rootMirror, overlayRoot);
    setOverlayRoot(overlayRoot);
    appLayer = appRoot;
    overlayLayer = overlayRoot;
    setInputRoot(appRoot);
    setHitRoot(rootMirror);
    setAuxiliaryHitRoot(auxiliary?.native ?? null);
    resetFrameHooks();
    resetClock();
    resetEffects();
    initDevtools(host.ops);
    installFrameHandler(wrapFrameHandler((buttons, analog, touches, hits, touchSurfaces, rightAnalog) => {
      __advanceClock();
      __setAnalog(analog, rightAnalog);
      __setTouches(touches, hits, touchSurfaces);
      runServicePumps();
      __drainEffects();
      flushUniversalSync(() => {
        runFrameHooks(buttons);
        handleFrame(buttons);
      });
      runSweep();
    }));
    const dispose = render(code, appRoot);
    const removeResizeViewportHook = installResizeViewportHook(resizeViewport);
    return () => {
      removeResizeViewportHook();
      __resetTouches();
      dispose();
      setInputRoot(null);
      setHitRoot(null);
      setAuxiliaryHitRoot(null);
      setOverlayRoot(null);
      appLayer = null;
      overlayLayer = null;
      for (const child of rootMirror.children.splice(0)) {
        child.parent = null;
        host.ops.destroyNode(child.id);
      }
      unmountAuxiliarySurface(host.ops);
      runSweep();
    };
  }
  function mount(code, opts = {}) {
    const ops = opts.ops ?? globalOps();
    if (!ops) {
      throw new Error("PocketJS: mount() requires globalThis.ui or opts.ops");
    }
    if (opts.pak)
      loadPack(opts.pak);
    uploadPakImages(ops);
    uploadPakSprites(ops);
    return render2(code, {
      ops,
      styles: opts.styles ?? STYLE_IDS,
      pak: opts.pak
    });
  }

  // ../picoview-guest-norm/app.octane.tsx
  var _hs$3 = /* @__PURE__ */ hookSlots(5);
  var _h$03 = /* @__PURE__ */ Symbol(_hs$3);
  var _h$110 = /* @__PURE__ */ Symbol(_hs$3 + 1);
  var _h$23 = /* @__PURE__ */ Symbol(_hs$3 + 2);
  var _h$33 = /* @__PURE__ */ Symbol(_hs$3 + 3);
  var _h$43 = /* @__PURE__ */ Symbol(_hs$3 + 4);
  var __octaneUniversalPlan02 = universalPlan("pocket", {
    kind: "text",
    value: "PicoView"
  });
  var __octaneUniversalPlan110 = universalPlan("pocket", {
    kind: "text",
    value: "Architecture A6 — Per-Monitor DPI V2"
  });
  var __octaneUniversalPlan22 = universalPlan("pocket", {
    kind: "range",
    children: [{
      kind: "slot",
      slot: 0
    }, {
      kind: "slot",
      slot: 1
    }]
  });
  var __octaneUniversalPlan32 = universalPlan("pocket", {
    kind: "text",
    value: " F=Fit 1=100% +/-=zoom drag=pan s=stress"
  });
  var __octaneUniversalPlan42 = universalPlan("pocket", {
    kind: "slot",
    slot: 0
  });
  var __octaneUniversalPlan52 = universalPlan("pocket", {
    kind: "range",
    children: [{
      kind: "slot",
      slot: 0
    }, {
      kind: "slot",
      slot: 1
    }]
  });
  var __octaneUniversalPlan62 = universalPlan("pocket", {
    kind: "slot",
    slot: 0
  });
  var __octaneUniversalPlan72 = universalPlan("pocket", {
    kind: "text",
    value: "QuickJS is a control plane — no pixel payloads"
  });
  var __octaneUniversalPlan82 = universalPlan("pocket", {
    kind: "range",
    children: [{
      kind: "slot",
      slot: 0
    }, {
      kind: "slot",
      slot: 1
    }]
  });
  var __octaneUniversalPlan92 = universalPlan("pocket", {
    kind: "range",
    children: [{
      kind: "slot",
      slot: 0
    }, {
      kind: "slot",
      slot: 1
    }, {
      kind: "slot",
      slot: 2
    }]
  });
  var __octaneUniversalPlan102 = universalPlan("pocket", {
    kind: "slot",
    slot: 0
  });
  var A3_SERVICE = "picoview-a3";
  var STAGE_W = 880;
  var STAGE_H = 495;
  var DENSITY = 2;
  var STRESS_REQUESTS = 120;
  var STRESS_BURST = 5;
  function connectA3() {
    const ops = getOps();
    if (!ops.svcOpen || !ops.svcPoll || !ops.svcSend || !ops.svcOpen(A3_SERVICE))
      return null;
    const poll = ops.svcPoll.bind(ops);
    const send = ops.svcSend.bind(ops);
    return {
      poll() {
        const batch = poll();
        if (!batch)
          return [];
        const events = [];
        for (const line of batch.split(`
`)) {
          if (line === "")
            continue;
          try {
            events.push(JSON.parse(line));
          } catch {}
        }
        return events;
      },
      send(line) {
        send(JSON.stringify(line));
      }
    };
  }
  function fileName(path) {
    const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
    return cut >= 0 ? path.slice(cut + 1) : path;
  }
  function fitBox(w, h) {
    const scale = Math.min(STAGE_W / w, STAGE_H / h);
    const bw = w * scale;
    const bh = h * scale;
    return {
      bx: (STAGE_W - bw) / 2,
      by: (STAGE_H - bh) / 2,
      bw,
      bh
    };
  }
  function clampBox(b) {
    const out = {
      ...b
    };
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
  var PicoViewGuest = defineUniversalComponent("pocket", function PicoViewGuest() {
    const [info, setInfo] = useState("A5: waiting for manifest…", _h$03);
    const mainRef = useRef(null, _h$110);
    const [box, setBox] = useState({
      bx: 0,
      by: 0,
      bw: STAGE_W,
      bh: STAGE_H
    }, _h$23);
    getOps().__pocketStaticFrames?.(true);
    const state = useRef({
      svc: null,
      files: [],
      next: 0,
      pending: false,
      currentPath: "",
      boundHandle: -1,
      planeW: 0,
      planeH: 0,
      box: {
        bx: 0,
        by: 0,
        bw: STAGE_W,
        bh: STAGE_H
      },
      zoom: 1,
      mode: "fit",
      pointer: {
        x: STAGE_W / 2,
        y: STAGE_H / 2
      },
      dragging: false,
      acks: 0,
      stress: {
        sent: 0,
        imgs: 0,
        cancelled: 0,
        others: 0,
        lastPath: "",
        done: false
      }
    }, _h$33);
    withSlot(_h$43, useFrame, () => {
      const s = state.current;
      if (!s.svc)
        s.svc = connectA3();
      const svc = s.svc;
      if (!svc)
        return;
      const reportGeom = (req) => {
        svc.send({
          t: "a3ack",
          req,
          bound: `${s.mode}@${s.zoom.toFixed(3)}`,
          geom: [s.box.bx, s.box.by, s.box.bw, s.box.bh],
          zoom: s.zoom
        });
        setBox({
          ...s.box
        });
      };
      const applyFit = () => {
        if (s.planeW <= 0)
          return;
        s.mode = "fit";
        s.zoom = 1;
        s.box = fitBox(s.planeW, s.planeH);
      };
      const noteStressReply = (req, kind) => {
        const st = s.stress;
        if (!req.startsWith("p"))
          return;
        if (kind === "img")
          st.imgs += 1;
        else if (kind === "cancelled")
          st.cancelled += 1;
        else
          st.others += 1;
        if (st.sent === STRESS_REQUESTS && !st.done && st.imgs + st.cancelled + st.others === st.sent) {
          st.done = true;
          setInfo(`A5 stress complete: sent=${st.sent} imgs=${st.imgs} cancelled=${st.cancelled} other=${st.others} final=${fileName(st.lastPath)}`);
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
          if (mainRef.current)
            getOps().setImage(mainRef.current.id, msg.handle);
          if (msg.mode === "full") {
            s.mode = "full";
            s.zoom = 1;
            s.box = clampBox({
              bx: 0,
              by: 0,
              bw: s.planeW / DENSITY,
              bh: s.planeH / DENSITY
            });
          } else {
            applyFit();
          }
          reportGeom(msg.req);
          noteStressReply(msg.req, "img");
          if (!msg.req.startsWith("p")) {
            setInfo(`A5: ${msg.req} ${msg.mode} bound handle=${msg.handle} plane=${msg.w}x${msg.h} native=${msg.nativeW}x${msg.nativeH} (${fileName(s.currentPath)})`);
          }
        } else if (msg.t === "a3error") {
          s.pending = false;
          noteStressReply(msg.req, msg.code === "cancelled" ? "cancelled" : "other");
          if (!msg.req.startsWith("p")) {
            setInfo(`A5: ${msg.req} error code=${msg.code} (${fileName(s.currentPath)}) — bounded, walk continues`);
          }
          svc.send({
            t: "a3ack",
            req: msg.req,
            error: msg.code
          });
        } else if (msg.t === "mouse") {
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
          s.pointer = {
            x: px,
            y: py
          };
        } else if (msg.t === "scroll") {
          if (s.planeW <= 0)
            continue;
          const factor = Math.exp(msg.dy / 24 * 0.25);
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
            s.stress.sent = 1;
            s.stress.lastPath = s.files[0];
            svc.send({
              t: "a4open",
              req: "p0",
              path: s.files[0],
              fitW: STAGE_W * DENSITY,
              fitH: STAGE_H * DENSITY
            });
            setInfo("A5 stress running: 120 rapid Fit requests…");
          }
        } else if (msg.t === "resize") {
          if (msg.dpi !== undefined || msg.density !== undefined) {
            setInfo(`A6: scale transition — logical=${msg.w}x${msg.h} dpi=${msg.dpi ?? "?"} density=${msg.density ?? "?"} (composition unchanged, box=(${s.box.bx.toFixed(1)},${s.box.by.toFixed(1)},${s.box.bw.toFixed(1)},${s.box.bh.toFixed(1)}))`);
            svc.send({
              t: "a3ack",
              req: `dpi-${msg.dpi ?? 0}`,
              bound: `${s.mode}@${s.zoom.toFixed(3)}`,
              geom: [s.box.bx, s.box.by, s.box.bw, s.box.bh],
              zoom: s.zoom
            });
          }
        }
      }
      if (!s.pending && s.next < s.files.length) {
        s.next += 1;
        request("fit", svc);
      }
      if (s.stress.sent > 0 && s.stress.sent < STRESS_REQUESTS && s.files.length > 0) {
        for (let b = 0;b < STRESS_BURST && s.stress.sent < STRESS_REQUESTS; b++) {
          const i = s.stress.sent;
          const path = s.files[i % s.files.length];
          s.stress.lastPath = path;
          svc.send({
            t: "a4open",
            req: `p${i}`,
            path,
            fitW: STAGE_W * DENSITY,
            fitH: STAGE_H * DENSITY
          });
          s.stress.sent += 1;
        }
      }
      function request(mode, out) {
        if (s.pending || s.next === 0 || s.next > s.files.length)
          return;
        const req = `r${s.next}`;
        s.currentPath = s.files[s.next - 1];
        const line = mode === "fit" ? {
          t: "a4open",
          req,
          path: s.currentPath,
          fitW: STAGE_W * DENSITY,
          fitH: STAGE_H * DENSITY
        } : {
          t: "a4open",
          req,
          path: s.currentPath
        };
        out.send(line);
        s.pending = true;
      }
      function zoomAt(ax, ay, factor) {
        if (s.planeW <= 0)
          return;
        if (s.mode === "fit")
          s.mode = "free";
        const nz = Math.min(Math.max(s.zoom * factor, 0.05), 40);
        const f = nz / s.zoom;
        if (f === 1)
          return;
        const u = (ax - s.box.bx) / s.box.bw;
        const v = (ay - s.box.by) / s.box.bh;
        s.box = clampBox({
          bx: ax - u * s.box.bw * f,
          by: ay - v * s.box.bh * f,
          bw: s.box.bw * f,
          bh: s.box.bh * f
        });
        s.zoom = nz;
        s.acks += 1;
        reportGeom(`zoom-${s.acks}`);
      }
    }, _h$43);
    return universalValue(__octaneUniversalPlan102, [universalComponent("pocket", View, universalProps([["set", "class", "w-full h-full flex-col bg-slate-900"]], universalChildren("pocket", () => {
      return universalValue(__octaneUniversalPlan92, [universalComponent("pocket", View, universalProps([["set", "class", "flex-row items-center justify-between px-4 py-2 bg-slate-900"]], universalChildren("pocket", () => {
        return universalValue(__octaneUniversalPlan22, [universalComponent("pocket", Text, universalProps([["set", "class", "text-sm text-white font-bold"]], universalChildren("pocket", () => {
          return universalValue(__octaneUniversalPlan02, []);
        }))), universalComponent("pocket", Text, universalProps([["set", "class", "text-xs text-slate-400"]], universalChildren("pocket", () => {
          return universalValue(__octaneUniversalPlan110, []);
        })))]);
      }))), universalComponent("pocket", View, universalProps([["set", "class", "flex-1 overflow-hidden bg-slate-800"]], universalChildren("pocket", () => {
        return universalValue(__octaneUniversalPlan52, [universalComponent("pocket", Image, universalProps([["set", "nodeRef", (node) => {
          mainRef.current = node;
          if (node && state.current.boundHandle >= 0) {
            getOps().setImage(node.id, state.current.boundHandle);
          }
        }], ["set", "style", {
          posType: 1,
          insetL: box.bx,
          insetT: box.by,
          width: box.bw,
          height: box.bh
        }]])), universalComponent("pocket", View, universalProps([["set", "class", "bg-slate-900 border border-slate-600"], ["set", "style", {
          posType: 1,
          insetL: 16,
          insetT: 12,
          width: 300,
          height: 36
        }]], universalChildren("pocket", () => {
          return universalValue(__octaneUniversalPlan42, [universalComponent("pocket", Text, universalProps([["set", "class", "text-xs text-white"]], universalChildren("pocket", () => {
            return universalValue(__octaneUniversalPlan32, []);
          })))]);
        })))]);
      }))), universalComponent("pocket", View, universalProps([["set", "class", "flex-row items-center justify-between px-4 py-1 bg-slate-900 border-t border-slate-700"]], universalChildren("pocket", () => {
        return universalValue(__octaneUniversalPlan82, [universalComponent("pocket", Text, universalProps([["set", "class", "text-xs text-slate-400"]], universalChildren("pocket", () => {
          return universalValue(__octaneUniversalPlan62, [info]);
        }))), universalComponent("pocket", Text, universalProps([["set", "class", "text-xs text-slate-500"]], universalChildren("pocket", () => {
          return universalValue(__octaneUniversalPlan72, []);
        })))]);
      })))]);
    })))]);
  }, {
    module: "@pocketjs/framework/octane/renderer"
  });
  var app_octane_default = PicoViewGuest;

  // ../picoview-guest-norm/main.octane.tsx
  mount(app_octane_default);
})();
