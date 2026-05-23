const STORAGE_KEY = "rl_mmr_tracker_v2_simple";

function nowIso() {
  return new Date().toISOString();
}

function safeUuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function parseIntStrict(value) {
  const s = String(value ?? "").trim().replace(/\s+/g, "");
  if (!s) return null;
  if (!/^[+-]?\d+$/.test(s)) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function sumDeltas(entries) {
  return entries.reduce((acc, e) => acc + e.delta, 0);
}

function formatDelta(delta) {
  return delta > 0 ? `+${delta}` : String(delta);
}

function positivityLabel(total) {
  if (total > 0) return { text: "Positif", cls: "positive" };
  if (total < 0) return { text: "Négatif", cls: "negative" };
  return { text: "Neutre", cls: "neutral" };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { startingMmr: null, entries: [] };
    const parsed = JSON.parse(raw);
    const startingMmr =
      typeof parsed.startingMmr === "number" && Number.isFinite(parsed.startingMmr)
        ? parsed.startingMmr
        : null;
    const entries = Array.isArray(parsed.entries)
      ? parsed.entries
          .map((e) => ({
            id: typeof e.id === "string" ? e.id : safeUuid(),
            delta: typeof e.delta === "number" ? e.delta : Number(e.delta),
            at: typeof e.at === "string" ? e.at : nowIso(),
          }))
          .filter((e) => Number.isFinite(e.delta))
      : [];
    return { startingMmr, entries };
  } catch {
    return { startingMmr: null, entries: [] };
  }
}

function saveState(state) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      startingMmr: state.startingMmr,
      entries: state.entries,
    }),
  );
}

const els = {
  rotateOverlay: document.getElementById("rotateOverlay"),
  tryLockBtn: document.getElementById("tryLockBtn"),
  dismissRotateBtn: document.getElementById("dismissRotateBtn"),
  optionsOverlay: document.getElementById("optionsOverlay"),
  optionsBtn: document.getElementById("optionsBtn"),
  closeOptionsBtn: document.getElementById("closeOptionsBtn"),
  lockBtn: document.getElementById("lockBtn"),
  currentMmrInput: document.getElementById("currentMmrInput"),
  customDeltaInput: document.getElementById("customDeltaInput"),
  addCustomBtn: document.getElementById("addCustomBtn"),
  totalDelta: document.getElementById("totalDelta"),
  isPositive: document.getElementById("isPositive"),
  estimatedMmr: document.getElementById("estimatedMmr"),
  matchCount: document.getElementById("matchCount"),
  undoBtn: document.getElementById("undoBtn"),
  resetBtn: document.getElementById("resetBtn"),
};

let state = loadState();

function isLandscapeNow() {
  return window.matchMedia?.("(orientation: landscape)")?.matches ?? window.innerWidth >= window.innerHeight;
}

function setRotateOverlayVisible(visible) {
  if (!els.rotateOverlay) return;
  els.rotateOverlay.classList.toggle("show", Boolean(visible));
}

function setOptionsOverlayVisible(visible) {
  if (!els.optionsOverlay) return;
  els.optionsOverlay.classList.toggle("show", Boolean(visible));
}

async function tryLockLandscape() {
  try {
    if (globalThis.screen?.orientation?.lock) {
      await screen.orientation.lock("landscape");
      return true;
    }
  } catch {
    // ignored
  }
  return false;
}

function updateLandscapeUi() {
  setRotateOverlayVisible(!isLandscapeNow());
}

function applyCurrentMmrFromInput() {
  const current = parseIntStrict(els.currentMmrInput.value);
  if (current == null) {
    state.startingMmr = null;
  } else {
    const total = sumDeltas(state.entries);
    state.startingMmr = current - total;
  }
  saveState(state);
  render();
}

function addDelta(delta) {
  if (!Number.isFinite(delta) || delta === 0) return;
  state.entries.unshift({ id: safeUuid(), delta, at: nowIso() });
  saveState(state);
  render();
}

function undoLast() {
  if (state.entries.length === 0) return;
  state.entries.shift();
  saveState(state);
  render();
}

function resetAll() {
  state = { startingMmr: null, entries: [] };
  saveState(state);
  render();
}

function render() {
  const total = sumDeltas(state.entries);
  els.totalDelta.textContent = formatDelta(total);
  els.totalDelta.style.color = total > 0 ? "var(--pos)" : total < 0 ? "var(--neg)" : "var(--text)";

  const pos = positivityLabel(total);
  els.isPositive.textContent = pos.text;
  els.isPositive.className = `pill ${pos.cls}`;

  els.matchCount.textContent = String(state.entries.length);

  const currentMmr = state.startingMmr == null ? null : state.startingMmr + total;
  els.currentMmrInput.value = currentMmr == null ? "" : String(currentMmr);
  if (currentMmr == null) {
    els.estimatedMmr.textContent = "—";
    els.estimatedMmr.classList.add("dim");
  } else {
    els.estimatedMmr.textContent = String(currentMmr);
    els.estimatedMmr.classList.remove("dim");
  }

  els.undoBtn.disabled = state.entries.length === 0;
}

function wireEvents() {
  document.querySelectorAll("[data-delta]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const delta = Number.parseInt(btn.getAttribute("data-delta"), 10);
      addDelta(delta);
    });
  });

  els.addCustomBtn.addEventListener("click", () => {
    const n = parseIntStrict(els.customDeltaInput.value);
    if (n == null || n === 0) {
      els.customDeltaInput.focus();
      return;
    }
    addDelta(n);
    els.customDeltaInput.value = "";
    els.customDeltaInput.focus();
  });

  els.customDeltaInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") els.addCustomBtn.click();
  });

  els.currentMmrInput.addEventListener("change", applyCurrentMmrFromInput);
  els.currentMmrInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") applyCurrentMmrFromInput();
  });

  els.undoBtn.addEventListener("click", undoLast);
  els.resetBtn.addEventListener("click", () => {
    if (confirm("Reset total + MMR ?")) resetAll();
  });

  els.optionsBtn?.addEventListener("click", () => {
    setOptionsOverlayVisible(true);
    els.currentMmrInput?.focus();
  });

  els.closeOptionsBtn?.addEventListener("click", () => setOptionsOverlayVisible(false));
  els.optionsOverlay?.addEventListener("click", (e) => {
    if (e.target === els.optionsOverlay) setOptionsOverlayVisible(false);
  });

  els.lockBtn?.addEventListener("click", async () => {
    await tryLockLandscape();
    updateLandscapeUi();
  });

  els.tryLockBtn?.addEventListener("click", async () => {
    await tryLockLandscape();
    updateLandscapeUi();
  });

  els.dismissRotateBtn?.addEventListener("click", () => setRotateOverlayVisible(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOptionsOverlayVisible(false);
  });

  window.addEventListener("resize", updateLandscapeUi, { passive: true });
  window.addEventListener("orientationchange", updateLandscapeUi, { passive: true });
}

wireEvents();
render();
updateLandscapeUi();
