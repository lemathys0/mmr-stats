const STORAGE_KEY = "rl_mmr_tracker_v1";
const DEFAULT_QUICK_DELTAS = [8, 9, 10, -8, -9, -10];

function nowIso() {
  return new Date().toISOString();
}

function formatWhen(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function parseIntStrict(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const normalized = s.replace(/\s+/g, "");
  if (!/^[+-]?\d+$/.test(normalized)) return null;
  const n = Number.parseInt(normalized, 10);
  return Number.isFinite(n) ? n : null;
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
    const quickDeltas = Array.isArray(parsed.quickDeltas)
      ? parsed.quickDeltas.map((d) => Number.parseInt(d, 10)).filter((d) => Number.isFinite(d) && d !== 0)
      : DEFAULT_QUICK_DELTAS.slice();
    // de-dupe while preserving order
    const seen = new Set();
    const quickDeltasDedup = [];
    for (const d of quickDeltas) {
      if (seen.has(d)) continue;
      seen.add(d);
      quickDeltasDedup.push(d);
    }
    return { startingMmr, entries, quickDeltas: quickDeltasDedup.length ? quickDeltasDedup : DEFAULT_QUICK_DELTAS.slice() };
  } catch {
    return { startingMmr: null, entries: [], quickDeltas: DEFAULT_QUICK_DELTAS.slice() };
  }
}

function saveState(state) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      startingMmr: state.startingMmr,
      entries: state.entries,
      quickDeltas: state.quickDeltas,
    }),
  );
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

function safeUuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

const els = {
  currentMmrInput: document.getElementById("currentMmrInput"),
  customDeltaInput: document.getElementById("customDeltaInput"),
  addCustomBtn: document.getElementById("addCustomBtn"),
  quickButtons: document.getElementById("quickButtons"),
  customQuickBtnInput: document.getElementById("customQuickBtnInput"),
  addQuickBtn: document.getElementById("addQuickBtn"),
  quickManageList: document.getElementById("quickManageList"),
  totalDelta: document.getElementById("totalDelta"),
  isPositive: document.getElementById("isPositive"),
  estimatedMmr: document.getElementById("estimatedMmr"),
  matchCount: document.getElementById("matchCount"),
  historyList: document.getElementById("historyList"),
  emptyState: document.getElementById("emptyState"),
  undoBtn: document.getElementById("undoBtn"),
  resetBtn: document.getElementById("resetBtn"),
};

let state = loadState();
if (!Array.isArray(state.quickDeltas) || state.quickDeltas.length === 0) {
  state.quickDeltas = DEFAULT_QUICK_DELTAS.slice();
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

function addQuickDelta(delta) {
  if (!Number.isFinite(delta) || delta === 0) return;
  if (!state.quickDeltas.includes(delta)) {
    state.quickDeltas.unshift(delta);
    saveState(state);
  }
  render();
}

function removeQuickDelta(delta) {
  state.quickDeltas = state.quickDeltas.filter((d) => d !== delta);
  if (state.quickDeltas.length === 0) state.quickDeltas = DEFAULT_QUICK_DELTAS.slice();
  saveState(state);
  render();
}

function removeEntry(id) {
  state.entries = state.entries.filter((e) => e.id !== id);
  saveState(state);
  render();
}

function undoLast() {
  state.entries.shift();
  saveState(state);
  render();
}

function resetAll() {
  state = { startingMmr: null, entries: [], quickDeltas: DEFAULT_QUICK_DELTAS.slice() };
  saveState(state);
  render();
}

function renderQuickButtons() {
  els.quickButtons.innerHTML = "";
  for (const d of state.quickDeltas) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `deltaBtn ${d > 0 ? "pos" : "neg"} big`;
    btn.textContent = formatDelta(d);
    btn.addEventListener("click", () => addDelta(d));
    els.quickButtons.appendChild(btn);
  }
}

function renderQuickManage() {
  els.quickManageList.innerHTML = "";
  for (const d of state.quickDeltas) {
    const chip = document.createElement("div");
    chip.className = "chip";

    const label = document.createElement("div");
    label.textContent = formatDelta(d);
    label.style.color = d > 0 ? "var(--pos)" : "var(--neg)";

    const x = document.createElement("button");
    x.type = "button";
    x.className = "x";
    x.title = "Supprimer ce bouton";
    x.textContent = "×";
    x.addEventListener("click", () => removeQuickDelta(d));

    chip.appendChild(label);
    chip.appendChild(x);
    els.quickManageList.appendChild(chip);
  }
}

function render() {
  const total = sumDeltas(state.entries);

  const currentMmr = state.startingMmr == null ? null : state.startingMmr + total;
  els.currentMmrInput.value = currentMmr == null ? "" : String(currentMmr);

  els.totalDelta.textContent = formatDelta(total);
  els.totalDelta.style.color = total > 0 ? "var(--pos)" : total < 0 ? "var(--neg)" : "var(--text)";

  const pos = positivityLabel(total);
  els.isPositive.textContent = pos.text;
  els.isPositive.className = `pill ${pos.cls}`;

  els.matchCount.textContent = String(state.entries.length);

  if (state.startingMmr == null) {
    els.estimatedMmr.textContent = "—";
    els.estimatedMmr.classList.add("dim");
  } else {
    els.estimatedMmr.textContent = String(currentMmr);
    els.estimatedMmr.classList.remove("dim");
  }

  els.undoBtn.disabled = state.entries.length === 0;

  renderQuickButtons();
  renderQuickManage();

  els.historyList.innerHTML = "";
  if (state.entries.length === 0) {
    els.emptyState.style.display = "block";
  } else {
    els.emptyState.style.display = "none";
    for (const entry of state.entries) {
      const li = document.createElement("li");
      li.className = "historyItem";

      const left = document.createElement("div");
      left.className = "historyLeft";

      const delta = document.createElement("div");
      delta.className = "historyDelta";
      delta.textContent = formatDelta(entry.delta);
      delta.style.color =
        entry.delta > 0 ? "var(--pos)" : entry.delta < 0 ? "var(--neg)" : "var(--text)";

      const meta = document.createElement("div");
      meta.className = "historyMeta";
      meta.textContent = formatWhen(entry.at);

      left.appendChild(delta);
      left.appendChild(meta);

      const removeBtn = document.createElement("button");
      removeBtn.className = "smallBtn";
      removeBtn.type = "button";
      removeBtn.textContent = "Supprimer";
      removeBtn.addEventListener("click", () => removeEntry(entry.id));

      li.appendChild(left);
      li.appendChild(removeBtn);
      els.historyList.appendChild(li);
    }
  }
}

function wireEvents() {
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

  els.addQuickBtn.addEventListener("click", () => {
    const n = parseIntStrict(els.customQuickBtnInput.value);
    if (n == null || n === 0) {
      els.customQuickBtnInput.focus();
      return;
    }
    addQuickDelta(n);
    els.customQuickBtnInput.value = "";
    els.customQuickBtnInput.focus();
  });

  els.customQuickBtnInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") els.addQuickBtn.click();
  });

  els.currentMmrInput.addEventListener("change", applyCurrentMmrFromInput);
  els.currentMmrInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") applyCurrentMmrFromInput();
  });

  els.undoBtn.addEventListener("click", undoLast);
  els.resetBtn.addEventListener("click", () => {
    if (confirm("Réinitialiser l'historique et le MMR de départ ?")) resetAll();
  });
}

wireEvents();
render();
