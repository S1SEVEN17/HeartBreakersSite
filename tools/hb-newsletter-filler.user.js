// ==UserScript==
// @name         HB Newsletter Filler
// @namespace    heartbreakers.torn
// @version      1.1.0
// @description  Fills Torn's faction newsletter (title + body) from the Heart Breakers payout calculator's "Create Newsletter" button.
// @match        https://www.torn.com/factions.php*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

/*
 * HOW IT WORKS
 * The payout calculator (a different website) can't touch Torn's page, so it passes the newsletter
 * in the link's #hash:  ...#/tab=controls&option=newsletter&hbnews=<base64url(JSON {t: title, h: html})>
 * The hash never leaves the browser (not sent to Torn's server), so length isn't a problem.
 * This script:
 *   1. reads + removes the hbnews param from the URL (so a reload doesn't refill),
 *   2. waits for Torn's React newsletter form to render,
 *   3. sets the title input (React-controlled: native value setter + input event),
 *   4. sets the body. Torn's body editor is TinyMCE (inline mode, #mce_0, empty = <p><br data-mce-bogus>).
 *      Methods are tried in order, each VERIFIED by checking the editor's text now contains the
 *      newsletter's opening words (v1.0 wrongly took the empty default <p> as success):
 *        a. TinyMCE API: tinymce.get("mce_0").setContent(html) + change/input events (Torn's React
 *           wrapper listens to these, so Send picks it up)
 *        b. Torn's Code Editor: toggle </>, set the source <textarea> (re-queried after toggling,
 *           React may re-mount it), toggle back
 *        c. synthetic paste event carrying text/html (TinyMCE's paste handler inserts it)
 *        d. execCommand("insertHTML") into the selected editor
 *        e. last resort: innerHTML + input event
 * It never presses "Send newsletter" - the leader checks it and sends it.
 *
 * Torn element hooks (class names carry build hashes, so match on the stable prefix):
 *   title:   input[class*="titleField"]
 *   source:  textarea[class*="sourceArea"]
 *   toggle:  button[aria-label="Toggle Code Editor"]
 *   editor:  [contenteditable="true"][class*="editorContent"]  (id mce_0)
 * No panel = no launcher icon; it only shows a short toast. PDA-friendly (pure DOM, no GM APIs).
 */
(function () {
  "use strict";
  const KEY = "hbnews";

  function readPayload() {
    const hash = location.hash || "";
    const m = hash.match(new RegExp("[&?#/]" + KEY + "=([^&]+)"));
    if (!m) return null;
    try {
      const b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
      const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
      const json = new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
      // drop the param so reloading the page doesn't fill it again
      history.replaceState(null, "", location.pathname + location.search + hash.replace("&" + KEY + "=" + m[1], ""));
      return JSON.parse(json);
    } catch (e) {
      toast("Newsletter Filler: couldn't read the newsletter from the link.", true);
      return null;
    }
  }

  // React keeps its own copy of input values - use the prototype setter so React sees the change
  function setReactValue(el, value) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", {bubbles: true}));
    el.dispatchEvent(new Event("change", {bubbles: true}));
  }

  function waitFor(sel, ms) {
    return new Promise(resolve => {
      const t0 = Date.now();
      (function poll() {
        const el = document.querySelector(sel);
        if (el) return resolve(el);
        if (Date.now() - t0 > ms) return resolve(null);
        setTimeout(poll, 250);
      })();
    });
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const editorEl = () => document.querySelector('#mce_0, [contenteditable="true"][class*="editorContent"]');
  // first ~12 letters of the newsletter's visible text - used to check a method actually worked
  function probeOf(html) {
    const d = document.createElement("div"); d.innerHTML = html;
    return (d.textContent || "").replace(/\s+/g, " ").trim().slice(0, 12);
  }
  const filled = probe => { const ed = editorEl(); return !!ed && (ed.textContent || "").replace(/\s+/g, " ").includes(probe); };
  const pageWin = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;

  async function viaTinyMCE(html) {
    const tm = pageWin.tinymce;
    if (!tm) return;
    const ed = (tm.get && (tm.get("mce_0") || (tm.get()[0]))) || tm.activeEditor;
    if (!ed) return;
    ed.focus();
    ed.setContent(html);
    ed.undoManager && ed.undoManager.add();
    ["change", "input", "keyup"].forEach(ev => { try { ed.fire ? ed.fire(ev) : ed.dispatch(ev); } catch (e) {} });
    ed.setDirty && ed.setDirty(true);
  }
  async function viaCodeEditor(html) {
    const toggle = document.querySelector('button[aria-label="Toggle Code Editor"]');
    if (!toggle) return;
    toggle.click();                   // into code view
    await sleep(500);
    const src = document.querySelector('textarea[class*="sourceArea"]');
    if (src) { src.focus(); setReactValue(src, html); }
    await sleep(400);
    toggle.click();                   // back to normal view - Torn renders the HTML
    await sleep(600);
  }
  async function viaPaste(html) {
    const ed = editorEl(); if (!ed) return;
    ed.focus(); selectAll(ed);
    const dt = new DataTransfer();
    dt.setData("text/html", html); dt.setData("text/plain", probeOf(html));
    ed.dispatchEvent(new ClipboardEvent("paste", {clipboardData: dt, bubbles: true, cancelable: true}));
    await sleep(500);
  }
  async function viaExec(html) {
    const ed = editorEl(); if (!ed) return;
    ed.focus(); selectAll(ed);
    document.execCommand("insertHTML", false, html);
    await sleep(300);
  }
  async function viaInnerHTML(html) {
    const ed = editorEl(); if (!ed) return;
    ed.focus(); ed.innerHTML = html;
    ed.dispatchEvent(new InputEvent("input", {bubbles: true}));
    await sleep(200);
  }
  function selectAll(el) {
    const r = document.createRange(); r.selectNodeContents(el);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
  }

  async function fill(data) {
    const title = await waitFor('input[class*="titleField"]', 20000);
    if (!title) return toast("Newsletter Filler: newsletter form not found - open Faction > Controls > Newsletter.", true);
    if (data.t) setReactValue(title, data.t);
    await waitFor('#mce_0, [contenteditable="true"][class*="editorContent"]', 10000);
    await sleep(500);                 // let TinyMCE finish initialising
    const html = data.h || "", probe = probeOf(html);
    let used = "";
    for (const [name, fn] of [["tinymce", viaTinyMCE], ["code editor", viaCodeEditor], ["paste", viaPaste],
                              ["insertHTML", viaExec], ["innerHTML", viaInnerHTML]]) {
      try { await fn(html); } catch (e) { console.warn("[HB Newsletter Filler]", name, e); }
      if (filled(probe)) { used = name; break; }
    }
    console.log("[HB Newsletter Filler] body filled via:", used || "nothing worked");
    toast(used ? "Newsletter filled in - check it, then press Send newsletter."
               : "Newsletter Filler: couldn't fill the body - it's on your clipboard: press </> and paste.", !used);
  }

  // dark panel + amber accent house style
  function toast(msg, warn) {
    const d = document.createElement("div");
    d.textContent = msg;
    d.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:999999;" +
      "max-width:min(92vw,520px);padding:10px 14px;border-radius:8px;font:13px/1.4 Arial,sans-serif;" +
      "background:#1b1b1d;color:#eee;box-shadow:0 4px 16px rgba(0,0,0,.5);border:1px solid " + (warn ? "#c0392b" : "#e8be5a");
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 7000);
  }

  function run() { const data = readPayload(); if (data) fill(data); }
  run();
  window.addEventListener("hashchange", run);   // Torn is a single-page app - catch hash navigation too
})();
