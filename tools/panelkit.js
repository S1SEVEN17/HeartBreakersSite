/*
  PANEL KIT - the universal panel editor (Nov 14 2026, user: "All 5 editors should share a universal panel editor.
  This should be very UI friendly for both PDA/Mobile and Desktop." + "side by side on desktop. Stacked tabs on
  mobile."). Inlined by generate.py (inline_panelkit) into: Description + Announcements (panels_editor.html), Header
  (header_editor.html), Homepage (homepage_editor.html) and Profile layout (profile_layout_editor.html). Each page
  only describes ITS panel (an "adapter" passed to PK.mount); everything below is shared:

    #1 click to edit      - tap a part of the preview -> its section opens in the editor (preview parts are marked
                            with ctx.mark(el, key) or image regions with ctx.region(img, key, y0, y1, h)); the open
                            section is outlined in the preview
    #2 section sidebar    - every section of the panel, drag ⠿ to reorder (mouse + touch), 👁 to show / hide, ✕ to
                            remove, "+ Add" with section templates; lists inside a section are drag-reorderable too
    #4 placeholders       - a tappable list ({respect}, {members}...) that inserts at the cursor (adapter.placeholders)
    #5 undo / redo + draft - every change is a step (Ctrl+Z / Ctrl+Y too); the unsaved work is kept on this device
                            (localStorage hb_pk_<id>) and offered back when the page opens again
    #6 review & save      - a summary of what changed (per section) before saving
    #7 preview sizes      - Fit / Torn desktop / Phone width, dark or light background
    #9 templates          - preset sections and preset list items (adapter.addSection.options, field.templates)

  LAYOUT: desktop (> 900 px) = three columns Sections | Preview | Edit; phone / PDA = one pane at a time with a tab
  bar (☰ Sections · 👁 Preview · ✏️ Edit). A bottom bar holds undo / redo, the change count, Review & save and
  (panels with HTML for Torn) Copy HTML.

  ADAPTER (all functions get the editable model `data`, which the kit owns and snapshots for undo):
    id, title, lead                       - draft key, page title, intro line
    views: [{id, label}]                  - optional switch (Header: Members / Leaders)
    load() -> {data}                      - async; the model to edit
    save(data) -> message                 - async; throws on failure
    sections(data, view) -> [{key, label, icon, sub, shown (true/false/undefined = no 👁), fixed, removable}]
    move(data, view, from, to)            - reorder sections (only non-fixed ones are draggable)
    toggle(data, view, key, on)           - 👁
    remove(data, view, key)
    form(data, view, key) -> {title, help, obj, fields}   - the section's editable object + its field schema
    addSection: {label, options: [{label, icon, desc, make: () => obj}]}, insert(data, view, obj) -> new key
    placeholders: [[token, description], ...]
    preview: {sizes: true, render: async (data, view, ctx) => {}}     ctx: box, mark, region, select, status, setHtml
    html: {help} -> shows "HTML for Torn" with Copy (the preview calls ctx.setHtml(text))
    actions: [{label, run: async (data) => newData|undefined}]       - extra buttons (Reset ...)
  FIELD SCHEMA (form().fields): {k, label, t, ...}
    t: "text" | "area" | "num" | "select" (opts [[v, l]]) | "check" | "icon" (icons [[name, label]], base) |
       "link" (pages [[title, link]]) | "lines" (array of strings, one per line) | "strings" (fixed array, labels) |
       "order" (array of keys, names {key: label} - drag to sort) | "note" (text) |
       "list" (item: fields, OR variants: {name: {label, fields, is: it => bool}}, add: [{label, make}],
               templates: [{label, make}], title: it => text, fixed)
*/
(function () {
  "use strict";
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
  const clone = o => JSON.parse(JSON.stringify(o));
  const CSS = `
.pk{--bg:#100a0b;--card:#170d0e;--edge:#5c1c1a;--gold:#e8be5a;--red:#e4382e;--sub:#9a9a9c;--green:#78c878;color:#ddd;font:14px system-ui,sans-serif}
.pk *{box-sizing:border-box}
.pk h1{color:var(--red);text-align:center;font-size:22px;letter-spacing:2px;text-transform:uppercase;margin:6px 0 2px}
.pk .pk-lead{color:var(--sub);text-align:center;margin:0 0 8px;font-size:13px}
.pk button{background:#1a1012;color:#ddd;border:1px solid var(--edge);border-radius:7px;padding:6px 10px;font:13px system-ui;cursor:pointer}
.pk button:hover{border-color:var(--gold)}.pk button:disabled{opacity:.4;cursor:default}
.pk button.pk-go{background:var(--red);border-color:var(--red);color:#fff;font-weight:700}
.pk button.pk-gold{background:#3a2d12;border-color:#6b4a18;color:var(--gold);font-weight:600}
.pk button.pk-s{padding:3px 8px;font-size:12px}
.pk input,.pk select,.pk textarea{width:100%;background:#1a1012;color:#ddd;border:1px solid var(--edge);border-radius:7px;padding:8px;font:14px system-ui;margin:2px 0 6px}
.pk textarea{min-height:76px;resize:vertical}.pk input[type=checkbox]{width:18px;height:18px;margin:0;accent-color:#e8be5a}
.pk label.pk-l{display:block;color:var(--sub);font-size:12px;margin-top:4px}
.pk-views{display:flex;gap:6px;justify-content:center;margin:4px 0 8px}.pk-views button.on{background:var(--red);border-color:var(--red);color:#fff;font-weight:600}
.pk-grid{display:grid;grid-template-columns:230px minmax(0,1fr) 390px;gap:10px;align-items:start}
.pk-pane{background:var(--card);border:1px solid var(--edge);border-radius:12px;padding:10px;min-width:0}
.pk-pane>h2{margin:0 0 8px;color:var(--gold);font-size:12px;text-transform:uppercase;letter-spacing:1.5px;display:flex;gap:6px;align-items:center}
.pk-side,.pk-edit{position:sticky;top:8px;max-height:calc(100vh - 80px);overflow:auto}
.pk-sec{display:flex;align-items:center;gap:6px;padding:8px;border:1px solid var(--edge);border-radius:9px;margin-bottom:6px;background:#140b0c;cursor:pointer;user-select:none}
.pk-sec:hover{border-color:var(--gold)}.pk-sec.on{border-color:var(--gold);background:#2a1d0e}.pk-sec.off{opacity:.5}
.pk-sec .pk-nm{flex:1;min-width:0}.pk-sec .pk-nm b{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pk-sec .pk-nm small{color:var(--sub);font-size:11px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pk-grip{cursor:grab;touch-action:none;color:var(--sub);font-size:18px;line-height:1;padding:2px 4px;user-select:none}
.pk-grip.pk-fix{visibility:hidden}
.pk-eye{background:none!important;border:0!important;padding:2px 4px!important;font-size:16px}
.pk-drop-before{box-shadow:0 -3px 0 var(--gold)}.pk-drop-after{box-shadow:0 3px 0 var(--gold)}.pk-dragging{opacity:.45}
.pk-addbox{border:1px dashed var(--edge);border-radius:9px;padding:8px;margin-top:6px}
.pk-tpl{display:flex;flex-direction:column;gap:5px;margin-top:6px}.pk-tpl button{text-align:left}.pk-tpl small{color:var(--sub);display:block;font-size:11px}
.pk-pvbar{display:flex;gap:5px;flex-wrap:wrap;align-items:center;margin-bottom:8px}.pk-pvbar button.on{border-color:var(--gold);color:var(--gold)}
.pk-pvbar .pk-st{margin-left:auto;color:var(--sub);font-size:12px}
.pk-pvwrap{border-radius:10px;padding:10px;transition:background .2s;overflow:auto}
.pk-pvwrap.dark{background:#191919}.pk-pvwrap.light{background:#f2f2f2}
.pk-pv{margin:0 auto;position:relative}.pk-pv img{max-width:100%;display:block;margin:0 auto}
.pk-pv iframe{width:100%;border:0;border-radius:8px;background:var(--bg);display:block}
[data-pk-sec]{cursor:pointer;outline-offset:2px}[data-pk-sec]:hover{outline:2px dashed rgba(232,190,90,.6)}
[data-pk-sec].pk-hl{outline:2px solid var(--gold)!important}
.pk-rgn{position:absolute;left:0;right:0;cursor:pointer;border-radius:6px}.pk-rgn:hover{background:rgba(232,190,90,.10);outline:2px dashed rgba(232,190,90,.6)}
.pk-rgn.pk-hl{outline:2px solid var(--gold);background:rgba(232,190,90,.08)}
.pk-edit .pk-help{color:var(--sub);font-size:12px;margin:-2px 0 8px}.pk-help code,.pk-ph code{color:var(--gold)}
.pk-item{border:1px solid var(--edge);border-radius:9px;padding:6px 8px;margin:6px 0;background:#140b0c}
.pk-item .pk-ih{display:flex;align-items:center;gap:6px}.pk-item .pk-ih b{flex:1;font-size:12px;color:var(--gold);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pk-item .pk-item{background:#1a0e10}
.pk-row2{display:grid;grid-template-columns:1fr 1fr;gap:0 8px}
.pk-ic{display:flex;gap:6px;align-items:center}.pk-ic img{width:30px;height:30px;object-fit:contain;flex:0 0 30px}
.pk-ord{display:flex;align-items:center;gap:6px;padding:7px;border:1px solid var(--edge);border-radius:8px;margin:4px 0;background:#140b0c}
.pk-ph{border-top:1px solid var(--edge);margin-top:10px;padding-top:8px}
.pk-ph summary{cursor:pointer;color:var(--gold);font-size:12px;text-transform:uppercase;letter-spacing:1px}
.pk-phl{display:flex;flex-direction:column;gap:3px;margin-top:6px;max-height:260px;overflow:auto}
.pk-phl button{display:flex;gap:8px;text-align:left;align-items:baseline}.pk-phl button code{flex:0 0 auto}.pk-phl button span{color:var(--sub);font-size:12px}
.pk-bar{position:sticky;bottom:0;z-index:50;display:flex;gap:6px;align-items:center;flex-wrap:wrap;background:rgba(16,10,11,.96);border-top:1px solid var(--edge);padding:8px 4px;margin-top:10px}
.pk-bar .pk-cnt{color:var(--gold);font-size:13px;flex:1;min-width:120px}
.pk-banner{background:#2a1d0e;border:1px solid var(--gold);border-radius:9px;padding:8px 10px;margin:0 0 8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.pk-banner span{flex:1}
.pk-html textarea{font:12px monospace;min-height:90px}
.pk-modal{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:12px}
.pk-modal>div{background:var(--card);border:1px solid var(--edge);border-radius:12px;padding:14px;max-width:560px;width:100%;max-height:85vh;overflow:auto}
.pk-modal h3{margin:0 0 8px;color:var(--gold)}.pk-modal ul{padding-left:18px;margin:6px 0}.pk-modal li{margin:3px 0}
.pk-tabs{display:none}
@media (max-width:1180px){.pk-grid{grid-template-columns:210px minmax(0,1fr) 340px}}
@media (max-width:900px){
  .pk-grid{display:block}.pk-pane{display:none}.pk-pane.pk-show{display:block}
  .pk-side,.pk-edit{position:static;max-height:none}
  .pk-tabs{display:flex;gap:4px;position:sticky;top:0;z-index:55;background:var(--bg);padding:6px 0}
  .pk-tabs button{flex:1;padding:9px 4px;font-size:14px}.pk-tabs button.on{background:var(--red);border-color:var(--red);color:#fff;font-weight:700}
  .pk-row2{grid-template-columns:1fr}
}`;

  // ----- small helpers -----
  const getPath = (o, p) => p.reduce((x, k) => x == null ? x : x[k], o);
  const setPath = (o, p, v) => { let x = o; for (let i = 0; i < p.length - 1; i++) x = x[p[i]]; x[p[p.length - 1]] = v; };
  const enc = p => p.join("~"), dec = s => s === "" ? [] : s.split("~").map(x => /^\d+$/.test(x) ? +x : x);

  // drag-to-reorder for any container: rows = direct children carrying data-pk-i; handle = .pk-grip inside a row.
  // Works with mouse, pen and touch (pointer events, touch-action:none on the grip). onDrop(from, to).
  function sortable(box, sel, onDrop) {
    box.addEventListener("pointerdown", e => {
      const g = e.target.closest(".pk-grip"); if (!g || g.classList.contains("pk-fix")) return;
      const row = g.closest(sel); if (!row || row.parentElement !== box) return;
      e.preventDefault(); e.stopPropagation();
      const rows = () => [...box.children].filter(r => r.matches(sel));
      const from = rows().indexOf(row); let to = from;
      row.classList.add("pk-dragging"); try { g.setPointerCapture(e.pointerId); } catch (x) {}
      const clear = () => rows().forEach(r => r.classList.remove("pk-drop-before", "pk-drop-after"));
      // the drop index = how many of the OTHER rows sit above the pointer; a gold line shows where it lands
      const move = ev => {
        const y = ev.clientY, others = rows().filter(r => r !== row); let n = 0;
        others.forEach(r => { const b = r.getBoundingClientRect(); if (y > b.top + b.height / 2) n++; });
        to = n; clear();
        if (others[n]) others[n].classList.add("pk-drop-before"); else if (others.length) others[others.length - 1].classList.add("pk-drop-after");
      };
      const up = () => { g.removeEventListener("pointermove", move); g.removeEventListener("pointerup", up); g.removeEventListener("pointercancel", up);
        row.classList.remove("pk-dragging"); clear(); if (to !== from && to >= 0) onDrop(from, to); };
      g.addEventListener("pointermove", move); g.addEventListener("pointerup", up); g.addEventListener("pointercancel", up);
    });
  }

  // ----- fields (schema -> HTML; every input carries data-pkf = its path from the section object) -----
  function fieldsHtml(fields, obj, base) {
    return (fields || []).map(f => `<div class="pk-f">${fieldHtml(f, obj, base)}</div>`).join("");
  }
  function fieldHtml(f, obj, base) {
    const p = base.concat(f.k == null ? [] : [f.k]), v = f.k == null ? null : (obj || {})[f.k], a = `data-pkf="${esc(enc(p))}" data-pkt="${f.t || "text"}"`;
    const lab = f.label ? `<label class="pk-l">${esc(f.label)}</label>` : "";
    switch (f.t) {
      case "note": return `<div class="pk-help">${f.html || esc(f.text)}</div>`;
      case "num": return lab + `<input ${a} inputmode="numeric" value="${esc(v)}">`;
      case "area": return lab + `<textarea ${a} placeholder="${esc(f.ph || "")}">${esc(v)}</textarea>`;
      case "lines": return lab + `<textarea ${a} placeholder="One per line">${esc((v || []).join("\n"))}</textarea>`;
      case "check": return `<label class="pk-l" style="display:flex;gap:8px;align-items:center;color:#ddd"><input type="checkbox" ${a}${v !== false ? " checked" : ""}> ${esc(f.label)}</label>`;
      case "select": return lab + `<select ${a}>${f.opts.map(([o, l]) => `<option value="${esc(o)}"${String(o) === String(v) ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
      case "icon": {
        const known = f.icons.some(([n]) => n === v);
        return lab + `<div class="pk-ic"><img src="${esc(f.base + v + ".png")}" onerror="this.style.visibility='hidden'" alt=""><select ${a}>`
          + f.icons.map(([n, l]) => `<option value="${esc(n)}"${n === v ? " selected" : ""}>${esc(l)}</option>`).join("")
          + (known ? "" : `<option value="${esc(v)}" selected>${esc(v)}</option>`) + `</select></div>`;
      }
      case "link": {
        const known = f.pages.some(([, u]) => u === v);
        return lab + `<select ${a} data-pkt="linkpick">${f.pages.map(([t, u]) => `<option value="${esc(u)}"${u === v ? " selected" : ""}>${esc(t)}</option>`).join("")}`
          + `<option value=""${known ? "" : " selected"}>Other address…</option></select>`
          + (known ? "" : `<input data-pkf="${esc(enc(p))}" data-pkt="text" placeholder="https://… or M:page.html" value="${esc(v || "")}">`);
      }
      case "strings": return lab + (f.labels || []).map((l, i) =>
        `<label class="pk-l">${l}</label><input data-pkf="${esc(enc(p.concat(i)))}" data-pkt="str" placeholder="${esc(f.ph || "")}" value="${esc((v || [])[i] || "")}">`).join("")
        + (f.note ? `<div class="pk-help">${esc(f.note)}</div>` : "");
      case "order": return lab + `<div class="pk-ordl" data-pkord="${esc(enc(p))}">` + (v || []).map((k, i) =>
        `<div class="pk-ord" data-pk-i="${i}"><span class="pk-grip" title="Drag to move">⠿</span><span style="flex:1">${esc((f.names || {})[k] || k)}</span></div>`).join("") + `</div>`;
      case "list": return lab + listHtml(f, v || [], p);
      default: return lab + `<input ${a} placeholder="${esc(f.ph || "")}" value="${esc(v)}">`;
    }
  }
  function variantOf(f, it) { if (!f.variants) return null; const ks = Object.keys(f.variants); return ks.find(k => f.variants[k].is(it)) || ks[0]; }
  function listHtml(f, arr, p) {
    const rows = arr.map((it, i) => {
      const vk = variantOf(f, it), vf = vk ? f.variants[vk] : null, fields = vf ? vf.fields : f.item;
      const name = (f.title ? f.title(it, i) : "") || (vf ? vf.label : "") || "#" + (i + 1);
      return `<div class="pk-item" data-pk-i="${i}"><div class="pk-ih"><span class="pk-grip${f.fixed ? " pk-fix" : ""}" title="Drag to move">⠿</span>
        <b>${vf ? esc(vf.label) + " · " : ""}${esc(name)}</b>${f.fixed ? "" : `<button class="pk-s" data-pkdel="${esc(enc(p.concat(i)))}" title="Remove">✕</button>`}</div>`
        + `<div class="${fields && fields.length > 1 && !fields.some(x => x.t === "list" || x.t === "lines" || x.t === "area") ? "pk-row2" : ""}">${fieldsHtml(fields, it, p.concat(i))}</div></div>`;
    }).join("");
    const adds = f.fixed ? "" : (f.add || [{label: "+ Add", make: f.make}]).map((a, j) => `<button class="pk-s pk-gold" data-pkadd="${esc(enc(p))}" data-pkj="${j}">${esc(a.label)}</button>`).join(" ");
    const tpls = (f.templates || []).length ? `<select class="pk-s" data-pktpl="${esc(enc(p))}" style="width:auto;display:inline-block;margin:0"><option value="">✨ From a template…</option>`
      + f.templates.map((t, j) => `<option value="${j}">${esc(t.label)}</option>`).join("") + `</select>` : "";
    return `<div class="pk-list" data-pklist="${esc(enc(p))}">${rows}</div><div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">${adds}${tpls}</div>`;
  }
  function mount(A) {
    const root = document.getElementById("pk");
    if (!document.getElementById("pk-css")) { const st = document.createElement("style"); st.id = "pk-css"; st.textContent = CSS; document.head.appendChild(st); }
    root.className = "pk";
    let data = null, orig = null, view = A.views ? A.views[0].id : null, sel = null, pane = "preview";
    let hist = [], hi = -1, typingT = null, html = "", lastFocus = null;
    const LSK = "hb_pk_" + A.id;
    const pref = (() => { try { return JSON.parse(localStorage.getItem("hb_pk_prefs") || "{}") || {}; } catch (e) { return {}; } })();
    let size = pref.size || "fit", bg = pref.bg || "dark";
    root.innerHTML = `${A.title ? `<h1>${esc(A.title)}</h1>` : ""}<div class="pk-lead">${A.lead || ""}</div>
      <div id="pkBanner"></div>
      ${A.views ? `<div class="pk-views">${A.views.map(v => `<button data-pkview="${v.id}">${esc(v.label)}</button>`).join("")}</div>` : ""}
      <div class="pk-tabs"><button data-pkpane="side">☰ Sections</button><button data-pkpane="preview">👁 Preview</button><button data-pkpane="edit">✏️ Edit</button></div>
      <div class="pk-grid">
        <div class="pk-pane pk-side" id="pkSide"><h2>☰ Sections</h2><div id="pkSecs"></div><div id="pkAdd"></div></div>
        <div class="pk-pane pk-prev" id="pkPrev"><h2>👁 Preview</h2>
          <div class="pk-pvbar">${A.preview && A.preview.sizes !== false ? `<button data-pksize="fit">Fit</button><button data-pksize="torn">🖥 Torn desktop</button><button data-pksize="phone">📱 Phone</button>
            <button data-pkbg="dark">🌙</button><button data-pkbg="light">☀️</button>` : ""}<span class="pk-st" id="pkSt"></span></div>
          <div class="pk-pvwrap ${bg}" id="pkWrap"><div class="pk-pv" id="pkPv"></div></div>
          ${A.preview && A.preview.note ? `<div class="pk-help" style="margin-top:6px">${A.preview.note}</div>` : ""}
          <div class="pk-help" style="margin-top:6px">Tap any part of the preview to edit it.</div>
          ${A.html ? `<details class="pk-html" style="margin-top:8px"><summary style="cursor:pointer;color:var(--gold)">📋 HTML for Torn</summary><div class="pk-help" style="margin-top:6px">${A.html.help || ""}</div><textarea id="pkHtml" readonly></textarea></details>` : ""}
          ${A.previewExtra || ""}</div>
        <div class="pk-pane pk-edit" id="pkEdit"><h2>✏️ Edit</h2><div id="pkForm"><div class="pk-help">Pick a section on the left (or tap it in the preview).</div></div></div>
      </div>
      <div class="pk-bar"><button id="pkUndo" title="Undo (Ctrl+Z)">↶ Undo</button><button id="pkRedo" title="Redo (Ctrl+Y)">↷ Redo</button>
        <span class="pk-cnt" id="pkCnt">Loading…</span>
        ${(A.actions || []).map((x, i) => `<button data-pkact="${i}">${esc(x.label)}</button>`).join("")}
        <button id="pkDiscard">Discard</button>${A.html ? `<button id="pkCopy">📋 Copy HTML</button>` : ""}<button class="pk-go" id="pkSave">Review &amp; save</button></div>`;
    const $ = id => document.getElementById(id);
    const status = t => { $("pkSt").textContent = t || ""; };

    // ---- history / draft ----
    const snap = () => JSON.stringify(data);
    function commit(immediate) {
      clearTimeout(typingT);
      const go = () => {
        const s = snap(); if (hist[hi] === s) return;
        hist = hist.slice(0, hi + 1); hist.push(s); if (hist.length > 150) hist.shift(); hi = hist.length - 1;
        try { localStorage.setItem(LSK, JSON.stringify({at: Date.now(), base: JSON.stringify(orig), data: s})); } catch (e) {}
        bar();
      };
      immediate ? go() : (typingT = setTimeout(go, 450));
    }
    function restore(s) { data = JSON.parse(s); drawAll(); }
    $("pkUndo").onclick = () => { commit(true); if (hi > 0) { hi--; restore(hist[hi]); bar(); } };
    $("pkRedo").onclick = () => { if (hi < hist.length - 1) { hi++; restore(hist[hi]); bar(); } };
    document.addEventListener("keydown", e => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); $("pkUndo").click(); }
      else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); $("pkRedo").click(); }
    });

    // ---- what changed (review) ----
    function changes() {
      const out = [], vs = A.views ? A.views.map(v => v.id) : [null];
      vs.forEach(vw => {
        const pre = A.views ? A.views.find(v => v.id === vw).label + " · " : "";
        const a = A.sections(orig, vw), b = A.sections(data, vw), ak = a.map(x => x.key), bk = b.map(x => x.key);
        // INDEXED sections (A.indexed: Header items, Homepage sections - their key is just the position): match them by
        // content, so moving one reads "order changed" rather than every section "edited"
        if (A.indexed) {
          const sig = (D, vv, k) => JSON.stringify((A.form(D, vv, k) || {}).obj), as = a.map(x => sig(orig, vw, x.key)), bs = b.map(x => sig(data, vw, x.key));
          const used = new Set(), pairs = [], lb = [];
          bs.forEach((g, j) => { const i = as.findIndex((x, ii) => x === g && !used.has(ii)); if (i >= 0) { used.add(i); pairs.push(i); } else lb.push(j); });
          const la = as.map((x, i) => i).filter(i => !used.has(i));
          // the original position of every section in its new order (edited ones paired up in order) - any step back = moved
          const seq = []; let ui = 0; bs.forEach((g, j) => { const n = lb.indexOf(j); if (n < 0) seq.push(pairs[ui++]); else if (n < la.length) seq.push(la[n]); });
          if (seq.some((x, n) => n && x < seq[n - 1])) out.push(`${pre}↕ Order changed`);
          lb.forEach((j, n) => { const s = b[j];
            if (n < la.length) { const fa = A.form(orig, vw, a[la[n]].key), fb = A.form(data, vw, s.key), det = diffFields(fb.fields, fa.obj, fb.obj);
              out.push(`${pre}✏️ <b>${esc(s.label)}</b>${det.length ? ": " + det.join("; ") : " edited"}`); }
            else out.push(`${pre}➕ Added <b>${esc(s.label)}</b>`); });
          la.slice(lb.length).forEach(i => out.push(`${pre}➖ Removed <b>${esc(a[i].label)}</b>`));
          return;
        }
        b.forEach(s => { if (!ak.includes(s.key)) out.push(`${pre}➕ Added <b>${esc(s.label)}</b>`); });
        a.forEach(s => { if (!bk.includes(s.key)) out.push(`${pre}➖ Removed <b>${esc(s.label)}</b>`); });
        const common = bk.filter(k => ak.includes(k));
        if (common.join() !== ak.filter(k => bk.includes(k)).join()) out.push(`${pre}↕ Section order changed`);
        b.forEach(s => {
          const o = a.find(x => x.key === s.key); if (!o) return;
          if (o.shown !== s.shown && s.shown !== undefined) out.push(`${pre}${s.shown ? "👁 Showing" : "🚫 Hiding"} <b>${esc(s.label)}</b>`);
          const fa = A.form(orig, vw, s.key), fb = A.form(data, vw, s.key);
          if (!fa || !fb) return;
          const det = diffFields(fb.fields, fa.obj, fb.obj);
          if (det.length) out.push(`${pre}✏️ <b>${esc(s.label)}</b>: ${det.join("; ")}`);
        });
      });
      return out;
    }
    function diffFields(fields, a, b) {
      const d = [];
      (fields || []).forEach(f => {
        if (f.k == null || f.t === "note") return;
        const x = (a || {})[f.k], y = (b || {})[f.k];
        if (JSON.stringify(x) === JSON.stringify(y)) return;
        const L = f.label || f.k;
        if (f.t === "list") {
          const xa = x || [], ya = y || [], xs = xa.map(v => JSON.stringify(v)), ys = ya.map(v => JSON.stringify(v));
          const add = ys.filter(v => !xs.includes(v)).length, rem = xs.filter(v => !ys.includes(v)).length;
          d.push(`${L} (${[ya.length > xa.length ? `${ya.length - xa.length} added` : "", xa.length > ya.length ? `${xa.length - ya.length} removed` : "",
            add && ya.length === xa.length ? `${add} edited` : "", !add && !rem ? "reordered" : ""].filter(Boolean).join(", ") || "edited"})`);
        } else if (f.t === "order") d.push(`${L} reordered`);
        else if (typeof y === "string" || typeof y === "number") d.push(`${L} → “${esc(String(y).slice(0, 40))}${String(y).length > 40 ? "…" : ""}”`);
        else d.push(`${L} changed`);
      });
      return d;
    }
    function bar() {
      const n = data ? changes().length : 0;
      $("pkCnt").textContent = !data ? "Loading…" : n ? `● ${n} unsaved change${n === 1 ? "" : "s"}` : "No unsaved changes";
      $("pkUndo").disabled = hi <= 0; $("pkRedo").disabled = hi >= hist.length - 1;
    }

    // ---- sidebar ----
    function drawSide() {
      const S = A.sections(data, view);
      $("pkSecs").innerHTML = S.map((s, i) => `<div class="pk-sec${s.key === sel ? " on" : ""}${s.shown === false ? " off" : ""}" data-pk-i="${i}" data-pkkey="${esc(s.key)}">
        <span class="pk-grip${s.fixed ? " pk-fix" : ""}" title="Drag to move">⠿</span><span class="pk-nm"><b>${s.icon ? esc(s.icon) + " " : ""}${esc(s.label)}</b>${s.sub ? `<small>${esc(s.sub)}</small>` : ""}</span>
        ${s.shown !== undefined ? `<button class="pk-eye" data-pkeye="${esc(s.key)}" title="${s.shown ? "Shown - tap to hide" : "Hidden - tap to show"}">${s.shown ? "👁" : "🚫"}</button>` : ""}
        ${s.removable ? `<button class="pk-s" data-pkrm="${esc(s.key)}" title="Remove">✕</button>` : ""}</div>`).join("") || '<div class="pk-help">Nothing here yet.</div>';
      const ad = A.addSection;
      $("pkAdd").innerHTML = ad ? `<details class="pk-addbox"><summary style="cursor:pointer;color:var(--gold)">${esc(ad.label || "+ Add a section")}</summary><div class="pk-tpl">`
        + ad.options.map((o, j) => `<button data-pkaddsec="${j}">${o.icon ? esc(o.icon) + " " : ""}<b>${esc(o.label)}</b>${o.desc ? `<small>${esc(o.desc)}</small>` : ""}</button>`).join("") + `</div></details>` : "";
    }
    sortable($("pkSecs"), ".pk-sec", (from, to) => { const S = A.sections(data, view); if (S[from].fixed || (S[to] && S[to].fixed)) return; A.move(data, view, from, to); changed(true); });
    $("pkSide").addEventListener("click", e => {
      if (e.target.closest(".pk-grip")) return;
      const eye = e.target.closest("[data-pkeye]"); if (eye) { const k = eye.dataset.pkeye, s = A.sections(data, view).find(x => x.key === k); A.toggle(data, view, k, !s.shown); changed(true); return; }
      const rm = e.target.closest("[data-pkrm]"); if (rm) { if (!confirm("Remove this section?")) return; A.remove(data, view, rm.dataset.pkrm); if (sel === rm.dataset.pkrm) sel = null; changed(true); return; }
      const ad = e.target.closest("[data-pkaddsec]"); if (ad) { const o = A.addSection.options[+ad.dataset.pkaddsec]; sel = A.insert(data, view, o.make()); changed(true); show("edit"); return; }
      const row = e.target.closest(".pk-sec"); if (row) { select(row.dataset.pkkey, true); }
    });

    // ---- edit pane ----
    function drawForm() {
      const keys = A.sections(data, view).map(s => s.key);
      if (sel != null && !keys.includes(sel)) sel = null;
      if (sel == null) { $("pkForm").innerHTML = '<div class="pk-help">Pick a section on the left (or tap it in the preview).</div>' + phList(); return; }
      const F = A.form(data, view, sel);
      const s = A.sections(data, view).find(x => x.key === sel) || {};
      $("pkForm").innerHTML = `<div style="font-weight:700;color:#fff;margin-bottom:4px">${s.icon ? esc(s.icon) + " " : ""}${esc(F.title || s.label)}</div>`
        + (F.help ? `<div class="pk-help">${F.help}</div>` : "") + (F.fields && F.fields.length ? fieldsHtml(F.fields, F.obj, []) : '<div class="pk-help">Nothing to fill in for this section - drag it to move it, or 👁 to show / hide it.</div>') + phList();
      $("pkForm").querySelectorAll(".pk-list, .pk-ordl").forEach(box => sortable(box, box.classList.contains("pk-ordl") ? ".pk-ord" : ".pk-item", (from, to) => {
        const p = dec(box.dataset.pklist || box.dataset.pkord), arr = getPath(F.obj, p); if (!arr) return;
        const [x] = arr.splice(from, 1); arr.splice(to, 0, x); changed(true);
      }));
    }
    const phList = () => (A.placeholders || []).length ? `<details class="pk-ph"${pref.ph ? " open" : ""}><summary>🔣 Placeholders - tap to insert</summary><div class="pk-help" style="margin:6px 0 0">Filled in with live faction values when the panel is drawn.</div><div class="pk-phl">`
      + A.placeholders.map(([t, d]) => `<button data-pkph="${esc(t)}"><code>${esc(t)}</code><span>${esc(d)}</span></button>`).join("") + `</div></details>` : "";
    const form = $("pkForm");
    const fobj = () => A.form(data, view, sel).obj;
    form.addEventListener("focusin", e => { if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName) && e.target.dataset.pkf != null) lastFocus = e.target; });
    form.addEventListener("input", e => {
      const el = e.target, ps = el.dataset.pkf; if (ps == null) return;
      const p = dec(ps), o = fobj(), t = el.dataset.pkt;
      let v = el.value;
      if (t === "num") { v = v.replace(/[^\d.-]/g, ""); el.value = v; v = v === "" ? 0 : +v; }
      if (t === "lines") v = el.value.split("\n").map(x => x.trimEnd()).filter(x => x !== "");
      if (t === "check") v = el.checked;
      if (t === "str") { const arr = getPath(o, p.slice(0, -1)) || setPath(o, p.slice(0, -1), []) || getPath(o, p.slice(0, -1)); arr[p[p.length - 1]] = v.trim(); for (let i = 0; i < arr.length; i++) if (arr[i] == null) arr[i] = ""; changed(false); return; }
      if (t === "linkpick") { setPath(o, p, v || "https://"); changed(true); drawForm(); return; }
      if (t === "icon") { const im = el.closest(".pk-ic").querySelector("img"); im.style.visibility = ""; im.src = im.src.replace(/[^/]*\.png$/, v + ".png"); }
      setPath(o, p, v);
      changed(t === "select" || t === "check" || t === "icon");
    });
    form.addEventListener("change", e => { if (e.target.dataset.pktpl != null && e.target.value !== "") {
      const p = dec(e.target.dataset.pktpl), F = A.form(data, view, sel), f = findList(F.fields, F.obj, p);
      const arr = getPath(F.obj, p) || (setPath(F.obj, p, []), getPath(F.obj, p)); arr.push(clone(f.templates[+e.target.value].make())); changed(true); } });
    form.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.pkph != null) { insertPh(b.dataset.pkph); return; }
      if (b.dataset.pkdel != null) { const p = dec(b.dataset.pkdel), arr = getPath(fobj(), p.slice(0, -1)); if (!confirm("Remove this one?")) return; arr.splice(p[p.length - 1], 1); changed(true); return; }
      if (b.dataset.pkadd != null) { const p = dec(b.dataset.pkadd), F = A.form(data, view, sel), f = findList(F.fields, F.obj, p);
        let arr = getPath(F.obj, p); if (!arr) { setPath(F.obj, p, []); arr = getPath(F.obj, p); }
        const a = (f.add || [{make: f.make}])[+b.dataset.pkj]; arr.push(clone(a.make())); changed(true); }
    });
    // the list field definition behind a path (walks the schema alongside the data, variants included)
    function findList(fields, obj, p) {
      let fs = fields, o = obj, f = null;
      for (let i = 0; i < p.length; i++) {
        const k = p[i];
        if (typeof k === "number") { const it = o[k]; const vk = variantOf(f, it); fs = vk ? f.variants[vk].fields : f.item; o = it; continue; }
        f = fs.find(x => x.k === k); o = o ? o[k] : null;
      }
      return f;
    }
    function insertPh(tok) {
      const el = lastFocus && document.body.contains(lastFocus) ? lastFocus : null;
      if (!el) { (navigator.clipboard ? navigator.clipboard.writeText(tok) : Promise.reject()).then(() => status("Copied " + tok + " - paste it into a field"), () => {}); return; }
      const s = el.selectionStart ?? el.value.length, e2 = el.selectionEnd ?? el.value.length;
      el.value = el.value.slice(0, s) + tok + el.value.slice(e2); el.focus(); el.selectionStart = el.selectionEnd = s + tok.length;
      el.dispatchEvent(new Event("input", {bubbles: true}));
    }
    form.addEventListener("toggle", e => { if (e.target.classList && e.target.classList.contains("pk-ph")) { pref.ph = e.target.open; savePref(); } }, true);

    // ---- preview ----
    let pvT = null, drawing = false, again = false;
    const ctx = {
      get box() { return $("pkPv"); },
      status,
      select: k => select(k, true),
      setHtml: t => { html = t || ""; if ($("pkHtml")) $("pkHtml").value = html; },
      // mark a DOM element (in this page or an iframe) as section `key`
      mark(el, key) { if (!el) return; el.setAttribute("data-pk-sec", key); el.addEventListener("click", ev => { ev.preventDefault(); ev.stopPropagation(); select(key, true); }); },
      // an image area (pixel rows y0..y1 of an image `h` px tall) as section `key`
      region(img, key, y0, y1, h) {
        const r = document.createElement("div"); r.className = "pk-rgn"; r.dataset.pkSecR = key;
        const place = () => { const top = img.offsetTop, ih = img.clientHeight || 0; r.style.top = (top + ih * y0 / h) + "px"; r.style.height = Math.max(8, ih * (y1 - y0) / h) + "px";
          r.style.left = img.offsetLeft + "px"; r.style.width = img.clientWidth + "px"; r.style.right = "auto"; };
        img.addEventListener("load", place); new ResizeObserver(place).observe(img); place();
        r.addEventListener("click", () => select(key, true)); img.parentElement.appendChild(r); return r;
      },
      highlight() { hl(); }
    };
    function hl() {
      const box = $("pkPv"), docs = [document];
      box.querySelectorAll("iframe").forEach(f => { try { if (f.contentDocument) docs.push(f.contentDocument); } catch (e) {} });
      docs.forEach(d => d.querySelectorAll("[data-pk-sec]").forEach(el => el.classList.toggle("pk-hl", el.getAttribute("data-pk-sec") === sel)));
      box.querySelectorAll("[data-pk-sec-r]").forEach(el => el.classList.toggle("pk-hl", el.dataset.pkSecR === sel));
      if (sel != null) { const t = box.querySelector(`[data-pk-sec-r="${CSS_esc(sel)}"]`); if (t && pane === "preview") t.scrollIntoView({block: "nearest", behavior: "smooth"}); }
    }
    const CSS_esc = s => String(s).replace(/["\\]/g, "\\$&");
    async function drawPreview() {
      if (!A.preview || !data) return;
      if (drawing) { again = true; return; }
      drawing = true;
      try { await A.preview.render(data, view, ctx); hl(); }
      catch (e) { status("Preview failed: " + (e && e.message ? e.message : e && e.type === "error" ? "couldn't load the preview engine (check your connection)" : String(e))); }
      drawing = false; if (again) { again = false; drawPreview(); }
    }
    const schedule = () => { clearTimeout(pvT); pvT = setTimeout(drawPreview, A.preview && A.preview.delay != null ? A.preview.delay : 350); };
    function applySize() {
      const w = {fit: "", torn: "784px", phone: "390px"}[size] || "";
      $("pkPv").style.maxWidth = w; $("pkPv").style.width = w ? "100%" : "";
      $("pkWrap").className = "pk-pvwrap " + bg;
      root.querySelectorAll("[data-pksize]").forEach(b => b.classList.toggle("on", b.dataset.pksize === size));
      root.querySelectorAll("[data-pkbg]").forEach(b => b.classList.toggle("on", b.dataset.pkbg === bg));
      if (A.preview && A.preview.onSize) A.preview.onSize(size);
    }
    const savePref = () => { try { localStorage.setItem("hb_pk_prefs", JSON.stringify(Object.assign(pref, {size, bg}))); } catch (e) {} };
    root.querySelectorAll("[data-pksize]").forEach(b => b.onclick = () => { size = b.dataset.pksize; savePref(); applySize(); });
    root.querySelectorAll("[data-pkbg]").forEach(b => b.onclick = () => { bg = b.dataset.pkbg; savePref(); applySize(); });

    // ---- panes (phones) ----
    function show(p) {
      pane = p;
      root.querySelectorAll("[data-pkpane]").forEach(b => b.classList.toggle("on", b.dataset.pkpane === p));
      $("pkSide").classList.toggle("pk-show", p === "side"); $("pkPrev").classList.toggle("pk-show", p === "preview"); $("pkEdit").classList.toggle("pk-show", p === "edit");
    }
    root.querySelectorAll("[data-pkpane]").forEach(b => b.onclick = () => show(b.dataset.pkpane));
    const narrow = () => matchMedia("(max-width:900px)").matches;
    function select(k, jump) { sel = k; drawSide(); drawForm(); hl(); if (jump && narrow()) show("edit"); if (!narrow()) { const r = $("pkForm"); r.scrollTop = 0; } }

    // ---- views ----
    function drawViews() { root.querySelectorAll("[data-pkview]").forEach(b => b.classList.toggle("on", b.dataset.pkview === view)); }
    root.querySelectorAll("[data-pkview]").forEach(b => b.onclick = () => { view = b.dataset.pkview; sel = null; drawViews(); drawAll(); });

    function drawAll() { drawSide(); drawForm(); schedule(); bar(); }
    function changed(structural) { if (structural) { drawSide(); drawForm(); } else drawSide(); schedule(); commit(structural); bar(); }

    // ---- review & save ----
    function modal(h) { const m = document.createElement("div"); m.className = "pk-modal"; m.innerHTML = `<div>${h}</div>`; document.body.appendChild(m);
      m.addEventListener("click", e => { if (e.target === m || e.target.closest("[data-pkclose]")) m.remove(); }); return m; }
    $("pkSave").onclick = () => {
      commit(true);
      const ch = changes();
      if (!ch.length) { modal(`<h3>Nothing to save</h3><div class="pk-help">You haven't changed anything yet.</div><button data-pkclose>OK</button>`); return; }
      const m = modal(`<h3>Review your changes</h3><ul>${ch.map(x => `<li>${x}</li>`).join("")}</ul>
        <div class="pk-help">${esc(A.saveNote || "Saved changes go live on the site a few minutes after saving.")}</div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px"><button data-pkclose>Keep editing</button><button class="pk-go" id="pkDoSave">Save ${ch.length} change${ch.length === 1 ? "" : "s"}</button></div><div class="pk-help" id="pkSaveMsg"></div>`);
      m.querySelector("#pkDoSave").onclick = async () => {
        const b = m.querySelector("#pkDoSave"); b.disabled = true; m.querySelector("#pkSaveMsg").textContent = "Saving…";
        try { const msg = await A.save(data); orig = clone(data); hist = [snap()]; hi = 0; try { localStorage.removeItem(LSK); } catch (e) {}
          bar(); m.querySelector("#pkSaveMsg").textContent = msg || "Saved ✓"; setTimeout(() => m.remove(), 1400); status(msg || "Saved ✓"); }
        catch (e) { b.disabled = false; m.querySelector("#pkSaveMsg").textContent = "Save failed: " + (e.message || e); }
      };
    };
    $("pkDiscard").onclick = () => { if (!changes().length) return; if (!confirm("Throw away all your unsaved changes?")) return;
      data = clone(orig); hist = [snap()]; hi = 0; try { localStorage.removeItem(LSK); } catch (e) {} drawAll(); };
    if ($("pkCopy")) $("pkCopy").onclick = () => {
      const t = html || ($("pkHtml") ? $("pkHtml").value : "");
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => { $("pkCopy").textContent = "✓ Copied"; },
        () => { const ta = $("pkHtml"); if (ta) { ta.closest("details").open = true; ta.select(); document.execCommand("copy"); $("pkCopy").textContent = "✓ Copied"; } });
      setTimeout(() => { $("pkCopy").textContent = "📋 Copy HTML"; }, 1600);
    };
    root.querySelectorAll("[data-pkact]").forEach(b => b.onclick = async () => {
      const r = await A.actions[+b.dataset.pkact].run(data); if (r) { data = r; sel = null; } drawAll(); commit(true);
    });
    addEventListener("beforeunload", e => { if (data && changes().length) { e.preventDefault(); e.returnValue = ""; } });

    // ---- start ----
    show(narrow() ? "preview" : "preview"); drawViews(); applySize();
    (async () => {
      try {
        const r = await A.load();
        data = r.data; orig = clone(data); hist = [snap()]; hi = 0;
        // an unsaved draft from earlier on this device (same starting point) -> offer it back
        let d = null; try { d = JSON.parse(localStorage.getItem(LSK) || "null"); } catch (e) {}
        if (d && d.data && d.data !== hist[0] && d.base === JSON.stringify(orig)) {
          const mins = Math.round((Date.now() - d.at) / 60000);
          $("pkBanner").innerHTML = `<div class="pk-banner"><span>📝 You have unsaved changes from ${mins < 60 ? mins + " min" : Math.round(mins / 60) + " h"} ago on this device.</span>
            <button class="pk-gold" id="pkRest">Restore them</button><button id="pkDrop">Discard</button></div>`;
          $("pkRest").onclick = () => { data = JSON.parse(d.data); hist.push(d.data); hi = hist.length - 1; $("pkBanner").innerHTML = ""; drawAll(); };
          $("pkDrop").onclick = () => { try { localStorage.removeItem(LSK); } catch (e) {} $("pkBanner").innerHTML = ""; };
        } else if (d) { try { localStorage.removeItem(LSK); } catch (e) {} }
        const first = A.sections(data, view)[0]; if (first && !narrow()) sel = first.key;
        drawAll();
      } catch (e) { $("pkForm").innerHTML = `<div class="pk-help">Couldn't load: ${esc(e.message || e)}</div>`; $("pkCnt").textContent = "Couldn't load"; }
    })();
    return {get data() { return data; }, redraw: drawAll};
  }

  // shared GitHub-config helpers (the leaders' save route through the gatekeeper - CFG.ghproxy; no token on the device)
  const b64d = b => new TextDecoder().decode(Uint8Array.from(atob(String(b).replace(/\n/g, "")), c => c.charCodeAt(0)));
  const b64e = t => { const u = new TextEncoder().encode(t); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  function gh(CFG) {
    const GHC = CFG.ghproxy || `https://api.github.com/repos/${CFG.repo}/contents/`;
    const tok = CFG.ghproxy ? "gate" : (() => { try { return JSON.parse(localStorage.getItem("hb_gh_token")); } catch (e) { return null; } })();
    const H = extra => Object.assign({Accept: "application/vnd.github+json"}, tok ? {Authorization: "Bearer " + tok} : {}, extra || {});
    let sha = null;
    return {
      hasToken: !!tok,
      async load() {
        const r = await fetch(`${GHC}config.json?ref=${CFG.branch || "main"}`, {headers: H(), cache: "no-store"});
        if (!r.ok) throw new Error("couldn't read the settings (" + r.status + ")");
        const j = await r.json(); sha = j.sha; return JSON.parse(b64d(j.content));
      },
      // fresh=true: re-read and apply `patch(config)` to the latest copy (single-key editors - no lost updates)
      async save(C, message, patch) {
        if (!tok) throw new Error("no GitHub access on this device");
        if (patch) { const r = await fetch(`${GHC}config.json?ref=${CFG.branch || "main"}`, {headers: H(), cache: "no-store"});
          if (!r.ok) throw new Error("couldn't read the settings (" + r.status + ")"); const j = await r.json(); sha = j.sha; C = JSON.parse(b64d(j.content)); patch(C); }
        const r = await fetch(`${GHC}config.json`, {method: "PUT", headers: H({"Content-Type": "application/json", "X-HB-Save": "1"}),
          body: JSON.stringify({message, sha, branch: CFG.branch || "main", content: b64e(JSON.stringify(C, null, 2) + "\n")})});
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(r.status === 409 || r.status === 422 ? "the settings changed since you opened this page - reload and redo your change" : (j.message || r.status));
        sha = j.content && j.content.sha; return C;
      }
    };
  }
  window.PK = {mount, gh, esc, clone};
})();
