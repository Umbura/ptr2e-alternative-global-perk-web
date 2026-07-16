const MODULE_ID = "ptr2e-alternative-global-perk-web";

const ROOT_COLORS = {
  "root-1": "#D84F58",
  "root-2": "#3F68D8",
  "root-3": "#C36D38",
  "root-4": "#8A55E6",
  "root-5": "#4F8FA3",
  "root-6": "#B94A8A",
  "root-7": "#A9B0CA",
};

const PURCHASED_CLASSES = new Set(["purchased", "auto-unlocked"]);
const ROOT_COLOR_VALUES = Object.values(ROOT_COLORS);
const WHEEL_ZOOM_SENSITIVITY = 0.00045;
const WHEEL_ZOOM_MIN_FACTOR = 0.96;
const WHEEL_ZOOM_MAX_FACTOR = 1.04;
const WHEEL_ZOOM_REDRAW_DELAY_MS = 140;
const WHEEL_ZOOM_STATES = new WeakMap();

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function elementFromHookPayload(payload) {
  if (payload instanceof HTMLElement) return payload;
  if (payload?.[0] instanceof HTMLElement) return payload[0];
  if (payload?.element instanceof HTMLElement) return payload.element;
  if (payload?.element?.[0] instanceof HTMLElement) return payload.element[0];
  return null;
}

function appElement(app) {
  return elementFromHookPayload(app?.element) ?? document.querySelector(".ptr2e#perk-web-app");
}

function isPerkWebApp(app, element) {
  if (app?.id === "perk-web-app") return true;
  const root = elementFromHookPayload(element);
  return Boolean(root?.matches?.(".ptr2e#perk-web-app") || root?.querySelector?.("#perk-web-app, [data-application-part='web'] .perk-grid"));
}

function nodeSlug(node) {
  return node?.slug ?? node?.node?.slug ?? node?.perk?.slug ?? node?.perk?.system?.slug;
}

function nodePosition(node) {
  return node?.position ?? node?.node?.position ?? node?.perk?.system?.primaryNode;
}

function nodeConnections(node) {
  return node?.connected ?? node?.node?.connected ?? [];
}

function coordinateForElement(element) {
  return `${Number(element.dataset.x)}-${Number(element.dataset.y)}`;
}

function elementState(element, storeNode, stateClass) {
  if (element?.classList?.contains(stateClass)) return true;
  return String(storeNode?.state ?? "").toLowerCase() === stateClass;
}

function isUnlocked(element, storeNode) {
  if (storeNode?.tierInfo) return true;
  if ([...PURCHASED_CLASSES].some((state) => elementState(element, storeNode, state))) return true;
  const state = String(storeNode?.state ?? "").toLowerCase();
  return state === "purchased" || state === "auto-unlocked";
}

function isAvailable(element, storeNode) {
  return elementState(element, storeNode, "available");
}

function isConnected(element, storeNode) {
  return elementState(element, storeNode, "connected");
}

function isPokemonGlobalWeb(app) {
  const web = String(app?.web ?? "");
  return web === "global" && !web.includes("ptr2e-digimon-expansion") && !web.includes(".digimon-species.");
}

function isSkillBoostPerk(storeNode) {
  const perk = storeNode?.perk;
  const slug = storeNode?.slug ?? perk?.slug ?? perk?.system?.slug ?? "";
  if (typeof slug === "string" && slug.includes("skill-refinement")) return true;

  const traits = perk?.system?.traits;
  if (traits?.has?.("skill-boost")) return true;
  if (Array.isArray(traits) && traits.includes("skill-boost")) return true;
  if (traits?.contents?.some?.((trait) => (trait?.slug ?? trait) === "skill-boost")) return true;
  return Boolean(perk?.system?.description?.includes?.("skill-boost"));
}

function buildSectorMap(app, isPokemonGlobal) {
  const store = app?._perkStore;
  const sectorBySlug = new Map();
  const queue = [];
  if (!isPokemonGlobal || !store?.rootNodes) return sectorBySlug;

  for (const [index, root] of Array.from(store.rootNodes).entries()) {
    const slug = nodeSlug(root);
    if (!slug) continue;
    const rootId = slug.match?.(/root-\d+/)?.[0] ?? `root-${index + 1}`;
    const sector = { id: rootId, color: ROOT_COLORS[rootId] ?? ROOT_COLOR_VALUES[index % ROOT_COLOR_VALUES.length] };
    sectorBySlug.set(slug, sector);
    queue.push(root);
  }

  for (let index = 0; index < queue.length; index += 1) {
    const source = queue[index];
    const sourceSlug = nodeSlug(source);
    const sector = sourceSlug ? sectorBySlug.get(sourceSlug) : null;
    if (!sector) continue;

    for (const connectedSlug of nodeConnections(source)) {
      const connectedNode = store.nodeFromSlug?.(connectedSlug);
      const slug = nodeSlug(connectedNode);
      if (connectedNode && slug && !sectorBySlug.has(slug)) {
        sectorBySlug.set(slug, sector);
        queue.push(connectedNode);
      }
    }
  }

  return sectorBySlug;
}

function propagateSectors(app, sectorBySlug, elements) {
  const store = app?._perkStore;
  if (!store) return;

  for (let changed = true; changed;) {
    changed = false;

    for (const element of elements) {
      const storeNode = store.get?.(coordinateForElement(element));
      if (!storeNode) continue;

      const slug = nodeSlug(storeNode);
      const ownSector = slug ? sectorBySlug.get(slug) : null;

      for (const connectedSlug of nodeConnections(storeNode)) {
        const connectedNode = store.nodeFromSlug?.(connectedSlug);
        const targetSlug = nodeSlug(connectedNode);
        const targetSector = targetSlug ? sectorBySlug.get(targetSlug) : null;

        if (ownSector && targetSlug && !targetSector) {
          sectorBySlug.set(targetSlug, ownSector);
          changed = true;
        } else if (!ownSector && slug && targetSector) {
          sectorBySlug.set(slug, targetSector);
          changed = true;
        }
      }
    }
  }
}

function rootSectorCenters(app, sectorBySlug, columnWidth, rowHeight, columnGap, rowGap) {
  const roots = isPokemonGlobalWeb(app) ? Array.from(app?._perkStore?.rootNodes ?? []) : [];
  return roots.flatMap((root) => {
    const slug = nodeSlug(root);
    const sector = slug ? sectorBySlug.get(slug) : null;
    const position = nodePosition(root);
    if (!sector || !position) return [];

    return [{
      id: sector.id,
      color: sector.color,
      x: (position.x - 1) * (columnWidth + columnGap) + columnWidth / 2,
      y: (position.y - 1) * (rowHeight + rowGap) + rowHeight / 2,
    }];
  });
}

function nearestSectorColor(centers, x, y) {
  if (!centers.length) return null;

  let nearest = null;
  let distance = Number.POSITIVE_INFINITY;

  for (const center of centers) {
    const dx = x - center.x;
    const dy = y - center.y;
    const currentDistance = dx * dx + dy * dy;
    if (currentDistance < distance) {
      distance = currentDistance;
      nearest = center;
    }
  }

  return nearest?.color ?? null;
}

function lineStateStyle(app, fromElement, fromNode, toElement, toNode) {
  if (app?.editMode) return null;

  const fromUnlocked = isUnlocked(fromElement, fromNode);
  const toUnlocked = isUnlocked(toElement, toNode);
  const bothUnlocked = fromUnlocked && toUnlocked;
  const anyUnlocked = fromUnlocked || toUnlocked;
  const leadsToAvailable = (fromUnlocked && isAvailable(toElement, toNode)) || (toUnlocked && isAvailable(fromElement, fromNode));
  const leadsToConnected = (fromUnlocked && isConnected(toElement, toNode)) || (toUnlocked && isConnected(fromElement, fromNode));
  const skillBoostLead = (leadsToAvailable || leadsToConnected || bothUnlocked) && (isSkillBoostPerk(fromNode) || isSkillBoostPerk(toNode));

  if (bothUnlocked) return { color: "#2ECFF5", width: 2.25, opacity: ".98", filter: "drop-shadow(0 0 8px rgba(46, 207, 245, 1))" };
  if (skillBoostLead) return { color: "#F4C542", width: 2.1, opacity: ".98", filter: "drop-shadow(0 0 8px rgba(244, 197, 66, .95))" };
  if (leadsToAvailable) return { color: "#38E66F", width: 2, opacity: ".98", filter: "drop-shadow(0 0 7px rgba(56, 230, 111, .9))" };
  if (leadsToConnected) return { color: "#F2A65A", width: 1.85, opacity: ".9", filter: "drop-shadow(0 0 6px rgba(242, 166, 90, .75))" };
  return null;
}

function appendLine(svg, lineData, stateStyle) {
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", String(lineData.x1));
  line.setAttribute("y1", String(lineData.y1));
  line.setAttribute("x2", String(lineData.x2));
  line.setAttribute("y2", String(lineData.y2));
  line.setAttribute("stroke", lineData.color);
  line.setAttribute("stroke-width", String(lineData.width));
  line.setAttribute("stroke-linecap", "round");
  line.setAttribute("stroke-opacity", lineData.opacity);
  svg.appendChild(line);

  if (!stateStyle) return;

  const overlay = line.cloneNode();
  overlay.classList.add("perk-line-state");
  overlay.setAttribute("stroke", stateStyle.color);
  overlay.setAttribute("stroke-width", String(stateStyle.width));
  overlay.setAttribute("stroke-opacity", stateStyle.opacity);
  overlay.setAttribute("filter", stateStyle.filter);
  svg.appendChild(overlay);
}

function renderPerkWeb(app) {
  const root = appElement(app);
  const scroll = root?.querySelector?.('[data-application-part="web"] .scroll');
  const grid = scroll?.querySelector?.(".perk-grid");
  if (!scroll || !grid) return;

  const isPokemonGlobal = isPokemonGlobalWeb(app);
  grid.classList.toggle("pokemon-sector-web", isPokemonGlobal);
  scroll.querySelectorAll(":scope > svg").forEach((svg) => svg.remove());

  let svg = grid.querySelector(":scope > svg.perk-lines");
  if (!svg) {
    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("perk-lines");
    grid.prepend(svg);
  }

  svg.textContent = "";
  app?._lineCache?.clear?.();

  const style = getComputedStyle(grid);
  const gridSize = grid.classList.contains("species-web") ? 51 : 250;
  const columnGap = parseFloat(style.columnGap) || 0;
  const rowGap = parseFloat(style.rowGap) || 0;
  const columnWidth = parseFloat(style.gridTemplateColumns.split(" ")[0]) || 48;
  const rowHeight = parseFloat(style.gridTemplateRows.split(" ")[0]) || 48;
  const width = gridSize * columnWidth + (gridSize - 1) * columnGap;
  const height = gridSize * rowHeight + (gridSize - 1) * rowGap;

  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("aria-hidden", "true");

  const store = app?._perkStore;
  const elements = Array.from(grid.querySelectorAll(".perk"));
  if (!store) {
    attachNavigation(app, scroll);
    return;
  }

  const elementByCoordinate = new Map(elements.map((element) => [coordinateForElement(element), element]));
  const sectorBySlug = buildSectorMap(app, isPokemonGlobal);
  if (isPokemonGlobal) propagateSectors(app, sectorBySlug, elements);

  const centers = rootSectorCenters(app, sectorBySlug, columnWidth, rowHeight, columnGap, rowGap);
  const lineKeys = new Set();

  for (const element of elements) {
    const coordinate = coordinateForElement(element);
    const fromNode = store.get?.(coordinate);
    if (!fromNode) continue;

    const fromX = (Number(element.dataset.x) - 1) * (columnWidth + columnGap) + columnWidth / 2;
    const fromY = (Number(element.dataset.y) - 1) * (rowHeight + rowGap) + rowHeight / 2;

    for (const connectedSlug of nodeConnections(fromNode)) {
      const toNode = store.nodeFromSlug?.(connectedSlug);
      const toPosition = nodePosition(toNode);
      if (!toNode || !toPosition) continue;

      const targetCoordinate = `${toPosition.x}-${toPosition.y}`;
      const forwardKey = `${coordinate}-${targetCoordinate}`;
      const reverseKey = `${targetCoordinate}-${coordinate}`;
      if (lineKeys.has(forwardKey) || lineKeys.has(reverseKey)) continue;

      const toElement = elementByCoordinate.get(targetCoordinate);
      const toX = (toPosition.x - 1) * (columnWidth + columnGap) + columnWidth / 2;
      const toY = (toPosition.y - 1) * (rowHeight + rowGap) + rowHeight / 2;

      const fromSector = sectorBySlug.get(nodeSlug(fromNode));
      const toSector = sectorBySlug.get(nodeSlug(toNode));
      const sectorColor = isPokemonGlobal
        ? nearestSectorColor(centers, (fromX + toX) / 2, (fromY + toY) / 2)
        : fromSector && toSector && fromSector.id === toSector.id
          ? fromSector.color
          : null;

      const baseColor = app?.editMode
        ? "#ffffff"
        : sectorColor ?? (String(app?.web ?? "").includes(".digimon-species.") ? "#0c0b16" : "#707887");

      appendLine(svg, {
        x1: fromX,
        y1: fromY,
        x2: toX,
        y2: toY,
        color: baseColor,
        width: sectorColor && baseColor === sectorColor ? 3.35 : 2.5 * (baseColor === "#ffffff" ? 1 : 0.85),
        opacity: sectorColor && baseColor === sectorColor ? ".9" : ".34",
      }, lineStateStyle(app, element, fromNode, toElement, toNode));

      lineKeys.add(forwardKey);
      lineKeys.add(reverseKey);
    }
  }

  attachNavigation(app, scroll);
}

function customZoom(app, zoomAmount = app?._zoomAmount, updateHud = true, pointer = null, options = {}) {
  const root = appElement(app);
  const grid = root?.querySelector?.(".perk-grid");
  const scroll = root?.querySelector?.('[data-application-part="web"] .scroll');
  if (!grid || !scroll) return;

  const previousZoom = Number(app._zoomAmount) || Number.parseFloat(grid.style.zoom) || 1;
  const minimumZoom = app?.web === "global" ? 0.1 : 0.65;
  const nextZoom = clamp(Number(zoomAmount) || previousZoom, minimumZoom, 2.5);
  const rect = scroll.getBoundingClientRect();
  const focus = pointer ?? { left: rect.width / 2, top: rect.height / 2 };
  const before = {
    top: (scroll.scrollTop + focus.top) / previousZoom,
    left: (scroll.scrollLeft + focus.left) / previousZoom,
  };
  const after = {
    top: before.top * nextZoom - focus.top,
    left: before.left * nextZoom - focus.left,
  };

  app._zoomAmount = nextZoom;
  grid.style.zoom = String(nextZoom);
  if (options.redraw !== false) renderPerkWeb(app);
  scroll.scrollTo(after);

  if (updateHud) app.render?.({ parts: ["hudZoom"] });
}

function scheduleDeferredWheelRedraw(app, state) {
  clearTimeout(state.redrawTimer);
  state.redrawTimer = setTimeout(() => {
    state.redrawTimer = null;
    renderPerkWeb(app);
    app.render?.({ parts: ["hudZoom"] });
  }, WHEEL_ZOOM_REDRAW_DELAY_MS);
}

function scheduleWheelZoom(app, scroll, event) {
  let state = WHEEL_ZOOM_STATES.get(scroll);
  if (!state) {
    state = {
      delta: 0,
      frame: null,
      pointer: { left: 0, top: 0 },
      redrawTimer: null,
    };
    WHEEL_ZOOM_STATES.set(scroll, state);
  }

  const rect = scroll.getBoundingClientRect();
  state.delta += event.deltaY;
  state.pointer = {
    left: event.clientX - rect.left,
    top: event.clientY - rect.top,
  };

  if (state.frame !== null) return;

  state.frame = requestAnimationFrame(() => {
    const delta = state.delta;
    state.delta = 0;
    state.frame = null;

    const factor = clamp(
      Math.exp(-delta * WHEEL_ZOOM_SENSITIVITY),
      WHEEL_ZOOM_MIN_FACTOR,
      WHEEL_ZOOM_MAX_FACTOR,
    );

    customZoom(app, (Number(app._zoomAmount) || 1) * factor, false, state.pointer, { redraw: false });
    scheduleDeferredWheelRedraw(app, state);
  });
}

function attachLegacyWheelOverride(app, scroll) {
  if (!scroll || scroll.dataset.ptr2eAlternativeGlobalPerkWebWheelOverride === "true") return;
  scroll.dataset.ptr2eAlternativeGlobalPerkWebWheelOverride = "true";

  const listenerTarget = scroll.parentElement ?? scroll;
  listenerTarget.addEventListener("wheel", (event) => {
    if (!scroll.contains(event.target)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    scheduleWheelZoom(app, scroll, event);
  }, { passive: false, capture: true });
}

function isBackgroundClick(scroll, event) {
  if (!scroll.contains(event.target)) return false;
  if (event.target.closest?.(".perk")) return false;
  return event.target === scroll || event.target.closest?.(".perk-grid, svg.perk-lines");
}

function attachNavigation(app, scroll) {
  if (!scroll || scroll.dataset.ptr2eAlternativeGlobalPerkWeb === "true") return;
  if (scroll.dataset.ptr2eFreeZoom === "true") {
    attachLegacyWheelOverride(app, scroll);
    scroll.dataset.ptr2eAlternativeGlobalPerkWeb = "legacy-system-patch";
    return;
  }

  scroll.dataset.ptr2eAlternativeGlobalPerkWeb = "true";

  let isPanning = false;
  let startX = 0;
  let startY = 0;
  let startScrollLeft = scroll.scrollLeft;
  let startScrollTop = scroll.scrollTop;

  scroll.addEventListener("mousedown", (event) => {
    if (event.button !== 2) return;

    isPanning = true;
    app.isMoving = false;
    startX = event.pageX - scroll.offsetLeft;
    startY = event.pageY - scroll.offsetTop;
    startScrollLeft = scroll.scrollLeft;
    startScrollTop = scroll.scrollTop;
    scroll.classList.add("ptr2e-alternative-global-perk-web-panning");
    event.preventDefault();
  });

  scroll.addEventListener("mouseleave", () => {
    isPanning = false;
    app.isMoving = false;
    scroll.classList.remove("ptr2e-alternative-global-perk-web-panning");
  });

  scroll.addEventListener("mouseup", () => {
    isPanning = false;
    scroll.classList.remove("ptr2e-alternative-global-perk-web-panning");
    setTimeout(() => {
      app.isMoving = false;
    });
  });

  scroll.addEventListener("mousemove", (event) => {
    if (!isPanning) return;

    app.isMoving = true;
    event.preventDefault();
    const x = event.pageX - scroll.offsetLeft;
    const y = event.pageY - scroll.offsetTop;
    const left = startScrollLeft - (x - startX) * 2.5;
    const top = startScrollTop - (y - startY) * 2.5;
    scroll.scrollTo(left, top);
  });

  scroll.addEventListener("wheel", (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    scheduleWheelZoom(app, scroll, event);
  }, { passive: false, capture: true });

  scroll.addEventListener("click", (event) => {
    if (!isBackgroundClick(scroll, event)) return;
    event.stopImmediatePropagation();
  }, { capture: true });

  scroll.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true });
}

function patchPerkWebApp(app) {
  if (!app || app._ptr2eAlternativeGlobalPerkWebInstalled) return;
  app._ptr2eAlternativeGlobalPerkWebInstalled = true;
  app.zoomLevels = [0.1, 0.2, 0.4, 0.65, 1, 1.3, 1.65];

  app.renderSVG = function renderEnhancedPerkWeb() {
    return renderPerkWeb(this);
  };

  app.zoom = function zoomEnhancedPerkWeb(zoomAmount = this._zoomAmount, updateHud = true, pointer = null) {
    return customZoom(this, zoomAmount, updateHud, pointer);
  };

  app.zoomIn = function zoomInEnhancedPerkWeb(event) {
    const scroll = appElement(this)?.querySelector?.('[data-application-part="web"] .scroll');
    if (!scroll) return undefined;
    event?.preventDefault?.();
    customZoom(this, (Number(this._zoomAmount) || 1) * 1.12, true);
    return true;
  };

  app.zoomOut = function zoomOutEnhancedPerkWeb(event) {
    if (this.isMoving) return undefined;
    const scroll = appElement(this)?.querySelector?.('[data-application-part="web"] .scroll');
    if (!scroll) return undefined;
    event?.preventDefault?.();
    customZoom(this, (Number(this._zoomAmount) || 1) * 0.88, true);
    return true;
  };
}

function enhancePerkWeb(app) {
  patchPerkWebApp(app);
  renderPerkWeb(app);
}

function registerHooks() {
  Hooks.on("renderApplicationV2", (app, element) => {
    if (!isPerkWebApp(app, element)) return;
    queueMicrotask(() => enhancePerkWeb(app));
  });
}

if (globalThis.game?.system?.id === "ptr2e") {
  registerHooks();
} else {
  Hooks.once("init", () => {
    if (game.system?.id !== "ptr2e") return;
    console.debug(`${MODULE_ID} | Registered perk web hooks.`);
    registerHooks();
  });
}

