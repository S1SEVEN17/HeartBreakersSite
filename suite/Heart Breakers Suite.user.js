// ==UserScript==
// @name         Heart Breakers Suite
// @namespace    S1SEVEN.suite
// @version      0.2.74
// @description  One centralized "Suite" of scripts for Heart Breakers.
// @author       Chris5295 [974757]
// @match        https://www.torn.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_openInTab
// @connect      hb-gate.heartbreakers.workers.dev
// @connect      api.torn.com
// @connect      ffscouter.com
// @run-at       document-idle
// @noframes
// @homepageURL  https://greasyfork.org/en/scripts/605562-heart-breakers-suite
// @supportURL   https://greasyfork.org/en/scripts/605562-heart-breakers-suite/feedback
// @downloadURL  https://update.greasyfork.org/scripts/605562/Heart%20Breakers%20Suite.user.js
// @updateURL    https://update.greasyfork.org/scripts/605562/Heart%20Breakers%20Suite.meta.js
// ==/UserScript==

(function () {
    'use strict';

    const SCRIPT_NAME = 'HB Suite';
    const VERSION = '0.2.74';
    const LOG = '[HBSuite]';
    const HUB_BASE = 'https://hb-gate.heartbreakers.workers.dev';
    const API_COMMENT = 'HBSuite';
    const PDA_KEY = '###PDA-APIKEY###';
    const isPDA = () => typeof PDA_httpGet === 'function' && !PDA_KEY.includes('###');
    const CACHE_MS = 5 * 60 * 1000;
    const MIN_HITS = 5;
    const READY_POLL_MS = 60000;
    const OC_SHARE_MS = 300000;
    const SHARE_PING_MS = 120000;
    const SHARE_READY_MS = 60000;

    const K = {
        key: 'hbs_key',
        session: 'hbs_session',
        collapsed: 'hbs_collapsed',
        panelPos: 'hbs_panel_pos',
        panelSize: 'hbs_panel_size',
        launchPos: 'hbs_launch_pos',
        tab: 'hbs_tab',
        pay: 'hbs_pay_settings',
        presets: 'hbs_pay_presets',
        paid: 'hbs_paid_',
        rcpt: 'hbs_rcpt_',
        share: 'hbs_share',
        shareMig: 'hbs_share_mig255',
        ocShareAt: 'hbs_share_ocat',
        sharePingAt: 'hbs_share_pingat',
        shareDay: 'hbs_share_day',
        ocMeSig: 'hbs_oc_me_sig',
        feedDoneAt: 'hbs_feed_done_at',
        feedOn: 'hbs_feed_on',
        feedAt: 'hbs_feed_at',
        feedNo: 'hbs_feed_no',
        ocTag: 'hbs_share_octag',
        mods: 'hbs_mods',
        cwTok: 'hbs_cw_token',
        cwStats: 'hbs_cw_stats',
        cwSnap: 'hbs_cw_snap',
        ffKey: 'hbs_ff_key',
        warRange: 'hbs_war_range',
        warFF: 'hbs_war_ff',
        warMine: 'hbs_war_mine',
        ffCache: 'hbs_ff_cache',
        rtHide: 'hbs_rt_hide',
        rtSort: 'hbs_rt_sort',
        rtFf: 'hbs_rt_ff',
        schTz: 'hbs_sch_tz',
        schHr: 'hbs_sch_hr',
        view: 'hbs_view',
        loanCache: 'hbs_loan_cache',
        loanIgn: 'hbs_loan_ign',
        rsDb: 'hbs_rs_db',
        rsPool: 'hbs_rs_pool',
        rsCrit: 'hbs_rs_crit',
        rsTpl: 'hbs_rs_tpl',
        rsSubj: 'hbs_rs_subj',
        rsSetAt: 'hbs_rs_set_at', rsSetAt0: 'hbs_rs_set_at0',
        rsSetNote: 'hbs_rs_set_note',
        rtOpen: 'hbs_rt_open',
        cfold: 'hbs_cfold',
        cwHits: 'hbs_cw_hits',
        cwDump: 'hbs_cw_dump',
        cwCompact: 'hbs_cw_compact',

        relSeen: 'hbs_rel_seen',
        onb: 'hbs_onboard',
        ocDepOpen: 'hbs_oc_dep_open', ocShareOpen: 'hbs_oc_share_open',
        chatFill: 'hbs_chat_fill',
        armHide: 'hbs_arm_hide',
        rsAtk: 'hbs_rs_atk',
        rsPassive: 'hbs_rs_passive',
        mailFill: 'hbs_mail_fill',
        rsRate: 'hbs_rs_rate',
        rsHubAuto: 'hbs_rs_hubauto', rsHubPct: 'hbs_rs_hubpct',
        rsView: 'hbs_rs_view', rsSort: 'hbs_rs_sort', rsPf: 'hbs_rs_pf',
        alerts: 'hbs_alerts',
        alertSeen: 'hbs_alert_seen',
        uiPdaMig: 'hbs_ui_pda_mig272',
        ui: 'hbs_ui',
        annDismiss: 'hbs_ann_dismiss',
        upd: 'hbs_update',
        layout: 'hbs_layout',
        meC: 'hbs_me',
        cwq: 'hbs_cw_queued',
    };

    const store = {
        get(k, d) {
            try { if (typeof GM_getValue === 'function') { const v = GM_getValue(k, undefined); return v === undefined ? d : v; } } catch (e) {   }
            try { const raw = localStorage.getItem(k); return raw === null ? d : JSON.parse(raw); } catch (e) { return d; }
        },
        set(k, v) {
            try { if (typeof GM_setValue === 'function') { GM_setValue(k, v); return; } } catch (e) {   }
            try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {   }
        },
    };

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const pnum = v => { const n = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return Number.isFinite(n) ? n : 0; };
    const int = n => Math.round(num(n)).toLocaleString('en-US');
    const tzLocal = () => store.get(K.schTz, 'tct') === 'local';
    const tzTag = () => tzLocal() ? 'local' : 'TCT';
    const tzTagH = () => tzLocal() ? 'local' : '<span class="hbs-tct" aria-label="TCT"></span>';
    const tzOpt = o => tzLocal() ? Object.assign(o, o.hour ? { hour12: store.get(K.schHr, '24') === '12' } : {}) : Object.assign(o, { timeZone: 'UTC' }, o.hour ? { hour12: false } : {});
    const fmtD = t => t ? new Date(t * 1000).toLocaleDateString('en-US', tzOpt({ month: 'short', day: 'numeric', year: 'numeric' })) : '-';
    const fmtDT = t => t ? new Date(t * 1000).toLocaleString('en-US', tzOpt({ month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })) : '-';
    const money = n => '$' + Math.round(num(n)).toLocaleString('en-US');
    const shortMoney = n => { n = num(n); return n >= 1e9 ? '$' + (n / 1e9).toFixed(2) + 'b' : n >= 1e6 ? '$' + (n / 1e6).toFixed(1) + 'm' : n >= 1e3 ? '$' + Math.round(n / 1e3) + 'k' : '$' + n; };
    const big = n => n == null ? '-' : n >= 1e9 ? (n / 1e9).toFixed(2) + 'b' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'm' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n));
    const nowS = () => Math.floor(Date.now() / 1000);
    const dur = s => { s = Math.max(0, Math.floor(s)); if (!s) return '0s'; const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
        return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : m ? `${m}m ${String(x).padStart(2, '0')}s` : `${x}s`; };
    const ago = t => t ? dur(nowS() - t) + ' ago' : '-';
    const monthOf = t => new Date(t * 1000).toISOString().slice(0, 7);
    const monthName = m => new Date(m + '-01T00:00:00Z').toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const thisMonth = () => new Date().toISOString().slice(0, 7);
    const lastMonth = () => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); };
    const b64ToText = b => new TextDecoder().decode(Uint8Array.from(atob(String(b).replace(/\n/g, '')), c => c.charCodeAt(0)));
    const textToB64 = t => { const u = new TextEncoder().encode(t); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const abs = u => !u ? '' : /^https?:/i.test(u) ? u : HUB_BASE + (u.startsWith('/') ? u : '/m/' + u);
    const GRADES = [[95, 'S', '#c9a0ff'], [85, 'A', '#78c878'], [75, 'B', '#a8d878'], [65, 'C', '#e8be5a'], [55, 'D', '#e8a05a'], [45, 'E', '#e8705a'], [0, 'F', '#e4382e']];
    const relG = s => { for (const g of GRADES) if ((s || 0) >= g[0]) return [g[1], g[2]]; return ['F', '#e4382e']; };
    const SRC_ICON = { site: '🌐', script: '🧩', ocopt: '🕵️' }, SRC_NAME = { site: 'Hub site', script: 'Hub script', ocopt: 'OC Optimizer script' };
    const srcIcons = v => (v || []).map(x => `<span title="${SRC_NAME[x] || x}">${SRC_ICON[x] || x}</span>`).join('');
    const srcNames = v => (v || []).map(x => (SRC_ICON[x] || '') + ' ' + (SRC_NAME[x] || x)).join(' · ');

    async function copyText(text) {
        try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; } } catch (e) {   }
        try {
            const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
            document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length); const ok = document.execCommand('copy'); ta.remove(); return ok;
        } catch (e) { return false; }
    }
    let notifyList = [];
    const OC_CRIME_LINK = id => `https://www.torn.com/factions.php?step=your&type=1#/tab=crimes&crimeId=${id}`;
    let notifyTplS = null;
    const NOTIFY_DEFAULT = {
        chat: "Hi {name}! You've been picked for an Organized Crime: {crime} - {role}. Please join it here: {link} - thank you! 💗",
        subject: 'OC: please join {crime} ({role})',
        mail: "Hi {name},\n\nYou've been picked for an Organized Crime: **{crime}**, role **{role}**.\nPlease join it here: [{crime} #{crime_id}]({link})\n\n"
            + 'Tip: the Heart Breakers Suite script shows your OC assignment automatically, so you never miss one - [install the Heart Breakers Suite]({scripts}).\n'
            + 'You can also see your crimes and pass rates on [the Hub]({hub}).\n\nThanks!' };
    function notifyFill(tpl, x) {
        const v = { name: x.name, crime: x.crime, role: x.position, crime_id: x.crime_id, link: OC_CRIME_LINK(x.crime_id),
            scripts: 'https://greasyfork.org/en/scripts/605562-heart-breakers-suite', hub: HUB_BASE + '/m/' };
        return String(tpl).replace(/\{(name|crime|role|crime_id|link|scripts|hub)\}/g, (m, k) => v[k] == null ? '' : String(v[k]));
    }
    const mdPlain = t => t.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '$1: $2').replace(/\*\*([^*]+)\*\*/g, '$1');
    function mdHtml(t) {
        const link = (u, txt) => `<a href="${esc(u)}">${txt}</a>`;
        return t.split(/\n\s*\n/).map(par => {
            const parts = [], re = /\[([^\]]+)\]\((https?:[^)\s]+)\)|(https?:\/\/[^\s<]*[^\s<.,!?;:)])/g; let last = 0, m;
            while ((m = re.exec(par))) { parts.push(esc(par.slice(last, m.index))); parts.push(m[1] ? link(m[2], esc(m[1])) : link(m[3], esc(m[3]))); last = re.lastIndex; }
            parts.push(esc(par.slice(last)));
            return '<p>' + parts.join('').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>') + '</p>';
        }).join('');
    }
    function notifyMsgs(x) {
        const t = notifyTplS || {}, T = { chat: t.chat || NOTIFY_DEFAULT.chat, subject: t.subject || NOTIFY_DEFAULT.subject, mail: t.mail || NOTIFY_DEFAULT.mail };
        const mail = notifyFill(T.mail, x);
        return { chat: mdPlain(notifyFill(T.chat, x)), subject: mdPlain(notifyFill(T.subject, x)), mail: mdPlain(mail), mailHtml: mdHtml(mail) };
    }
    async function copyRich(html, text) {
        try {
            if (navigator.clipboard && window.ClipboardItem) {
                await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
                return true;
            }
        } catch (e) {   }
        try {
            const d = document.createElement('div'); d.contentEditable = 'true'; d.innerHTML = html;
            d.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;'; document.body.appendChild(d);
            const r = document.createRange(); r.selectNodeContents(d); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
            const ok = document.execCommand('copy'); sel.removeAllRanges(); d.remove(); return ok;
        } catch (e) { return copyText(text); }
    }
    function ntfBadge(x) {
        const c = x.contacted, pill = (bg, bd, col, t) => `<span style="display:inline-block;margin-top:3px;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.3px;background:${bg};border:1px solid ${bd};color:${col}">${t}</span>`;
        if (!c || !c.at) return pill('rgba(228,56,46,.14)', '#e4382e', '#ff7a70', '✖ NOT NOTIFIED');
        const mins = Math.max(0, Math.round((Date.now() - c.at) / 60000));
        const ago = mins < 60 ? mins + 'm ago' : mins < 2880 ? Math.round(mins / 60) + 'h ago' : Math.round(mins / 1440) + 'd ago';
        const same = String(c.crime_id) === String(x.crime_id) && c.role === x.position;
        const how = { chat: '💬 chat', mail: '✉️ mail', sent: '✓ marked' }[c.how] || c.how || '';
        const by = c.by ? ' · ' + esc(String(c.by).replace(/ \[\d+\]$/, '')) : '';
        return (same ? pill('rgba(120,200,120,.18)', '#78c878', '#78c878', '✅ NOTIFIED · ' + ago)
                     : pill('rgba(232,190,90,.16)', '#e8be5a', '#e8be5a', '⚠️ NOTIFIED FOR ANOTHER CRIME · ' + ago))
            + `<br><span style="opacity:.7;font-size:11px">${how}${by}${same ? '' : ` · was ${esc(c.crime)} · ${esc(c.role)}`}</span>`;
    }
    // [HB Suite] Hub API — op "oc_contacted": log the contact in the Hub's shared Notify log (leaders)
    function logContact(x, how) {
        x.contacted = { at: Date.now(), crime: x.crime, crime_id: x.crime_id, role: x.position, how, by: 'you' };
        const el = bodyEl.querySelector(`[data-ntfst="${notifyList.indexOf(x)}"]`); if (el) el.innerHTML = ntfBadge(x);
        hub('oc_contacted', { entry: { pid: x.pid, crime: x.crime, crime_id: x.crime_id, role: x.position, how } }).catch(() => {   });
    }
    async function notifyClick(b) {
        const x = notifyList[Number(b.dataset.i)]; if (!x) return;
        const k = x.pid + ':' + x.crime_id, msgEl = bodyEl.querySelector('[data-ntfmsg]');
        const say = t => { if (msgEl) msgEl.textContent = t; };
        logContact(x, b.dataset.ntf);
        if (b.dataset.ntf === 'sent') return;
        const m = notifyMsgs(x), chat = b.dataset.ntf === 'chat';
        if (chat) store.set(K.chatFill, { pid: Number(x.pid), text: m.chat, at: Date.now() });
        else store.set(K.mailFill, { pid: Number(x.pid), subject: m.subject, html: m.mailHtml, text: m.mail, at: Date.now() });
        const ok = chat ? await copyText(m.chat) : await copyRich(m.mailHtml, m.mail);
        const url = chat ? `https://www.torn.com/profiles.php?XID=${x.pid}` : `https://www.torn.com/messages.php#/p=compose&XID=${x.pid}`;
        say(ok ? (chat ? `On ${x.name}'s profile tap Chat - the message is typed in for you; press Enter to send. (Also copied.)` : `Opening the mail - subject and message are filled in for you; check it and press Send. (Also copied.)`)
               : `Couldn't copy on this device - the message: ${chat ? m.chat : m.mail}`);
        const w = window.open(url, '_blank'); if (!w) location.href = url;
    }
    function download(name, blobOrUrl) {
        const a = document.createElement('a'); a.download = name;
        a.href = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
        document.body.appendChild(a); a.click(); a.remove();
    }

    class HubError extends Error { constructor(message, relink) { super(message); this.relink = !!relink; } }

    function rawPost(body) {
        const url = HUB_BASE + '/sx';
        const payload = JSON.stringify(body);
        return new Promise((resolve, reject) => {
            const done = (status, txt) => {
                let r = null; try { r = txt ? JSON.parse(txt) : null; } catch (e) {   }
                if (r == null) return reject(new HubError(`Hub error (${status || 'no response'}).`));
                if (r && r.ok === false) return reject(new HubError(r.error || `Hub error (${status}).`, r.relink));
                if (num(status) >= 400) return reject(new HubError(num(status) === 409 ? 'Someone else saved at the same time - try again.' : (r.message || `Hub error (${status}).`)));
                resolve({ status: num(status), data: r });
            };
            if (typeof PDA_httpPost === 'function') {
                try {
                    Promise.resolve(PDA_httpPost(url, { 'Content-Type': 'application/json' }, payload))
                        .then(r => done(r && r.status, (r && (r.responseText || r.response || r.body || r.text)) || ''))
                        .catch(() => reject(new HubError('Hub unreachable.')));
                    return;
                } catch (e) {   }
            }
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({
                    method: 'POST', url, data: payload, timeout: 25000, headers: { 'Content-Type': 'application/json' },
                    onload: r => done(r.status, r.responseText),
                    onerror: () => reject(new HubError('Hub unreachable.')),
                    ontimeout: () => reject(new HubError('Hub timed out.')),
                });
                return;
            }
            fetch(url, { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' } })
                .then(r => r.text().then(t => done(r.status, t)))
                .catch(() => reject(new HubError('Hub unreachable.')));
        });
    }

    const getKey = () => isPDA() ? PDA_KEY : String(store.get(K.key, '') || '').trim();

    // [HB Suite] Torn API — every Torn call goes through here (GET, key in Torn's own address as Torn requires; it goes
    const TORN_GAP = 650;
    let tornNext = 0;
    async function tornGet(url) {
        const wait = Math.max(0, tornNext - Date.now());
        tornNext = Math.max(Date.now(), tornNext) + TORN_GAP;
        if (wait) await sleep(wait);
        return tornCall(url);
    }
    function tornCall(url) {
        const u = url + (url.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(getKey()) + '&comment=' + API_COMMENT;
        return new Promise((resolve, reject) => {
            const fail = () => reject(new HubError("Torn didn't answer - try again."));
            const done = txt => {
                let d = null; try { d = JSON.parse(txt); } catch (e) {   }
                if (!d) return fail();
                if (d.error) return reject(new HubError('Torn: ' + (d.error.error || 'key error') + (d.error.code === 2 ? ' - check your API key in ⚙.' : '')
                    + (d.error.code === 16 ? ' - this needs a key with Faction API access.' : '')));
                resolve(d);
            };
            if (typeof PDA_httpGet === 'function') {
                Promise.resolve(PDA_httpGet(u)).then(r => done((r && (r.responseText || r.response || r.body)) || '')).catch(fail);
                return;
            }
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({ method: 'GET', url: u, timeout: 20000, onload: r => done(r.responseText), onerror: fail,
                                    ontimeout: () => reject(new HubError('Torn timed out - try again.')) });
                return;
            }
            fetch(u).then(r => r.text()).then(done).catch(fail);
        });
    }

    let signingIn = null;
    function signIn() {
        if (signingIn) return signingIn;
        signingIn = (async () => {
            if (!getKey()) throw new HubError('Add your API key first: ⚙ → API key.', true);
            // [HB Suite] Torn API — sign-in: this key's own profile (id, name, faction)
            const p = await tornGet('https://api.torn.com/user/?selections=profile');
            const id = { pid: p.player_id, faction: p.faction && p.faction.faction_id, name: p.name };
            // [HB Suite] Hub API — op "hello": client-reported identity -> session (no key is sent)
            const r = (await rawPost(Object.assign({ op: 'hello' }, id))).data;
            store.set(K.session, { code: r.code, exp: r.exp });
            setMe(r.me);
            return r.code;
        })().finally(() => { signingIn = null; });
        return signingIn;
    }

    // [HB Suite] Hub API — every Hub call goes through here (the Hub session, never a Torn key). Signs in by itself
    let shareMemo = null;
    let whoMemo = null;
    async function hub(op, extra) {
        if (op === 'whoami') {
            if (whoMemo && Date.now() - whoMemo.at < 30000) return whoMemo.p;
            const p = (async () => { const ses = store.get(K.session, null);
                if (!(ses && ses.code && ses.exp > Date.now() + 60000)) { await signIn(); if (me) return { ok: true, me }; }
                return hubCall(op, extra); })();
            whoMemo = { at: Date.now(), p }; p.catch(() => { whoMemo = null; }); return p;
        }
        if (op === 'share_get' && shareMemo && Date.now() - shareMemo.at < 60000) return shareMemo.p;
        if (op === 'share_get') { const p = hubCall(op, extra); shareMemo = { at: Date.now(), p }; p.catch(() => { shareMemo = null; }); return p; }
        if (op === 'share_set') shareMemo = null;
        return hubCall(op, extra);
    }
    async function hubCall(op, extra) {
        if ((/^(rc|rcset|cwcfg|oc_contacted|share_set)$/.test(op) && !/^(get|list|page)$/.test(String((extra || {}).do || ''))) || (op === 'gh' && (extra || {}).method === 'PUT')) { try { liveClear(); } catch (e) {   } }
        const ses = store.get(K.session, null);
        let code = ses && ses.code && ses.exp > Date.now() + 60000 ? ses.code : null;
        if (!code) code = await signIn();
        try {
            return (await rawPost(Object.assign({ code, op }, extra || {}))).data;
        } catch (e) {
            if (!e.relink) throw e;
            store.set(K.session, null);
            code = await signIn();
            return (await rawPost(Object.assign({ code, op }, extra || {}))).data;
        }
    }

    // [HB Suite] Hub API — read a Hub data file (op "read"), cached CACHE_MS in memory.
    const cache = {};
    const readsOut = {};
    async function readFile(area, path, force) {
        const k = area + ':' + path;
        if (!force && cache[k] && Date.now() - cache[k].at < CACHE_MS) return cache[k].data;
        if (readsOut[k]) return readsOut[k];
        readsOut[k] = hub('read', { area, path }).then(d => { cache[k] = { at: Date.now(), data: d }; return d; }).finally(() => { delete readsOut[k]; });
        return readsOut[k];
    }
    const optMiss = {};
    const readOpt = (area, path) => { const k = area + ':' + path; if (optMiss[k] && Date.now() - optMiss[k] < 60000) return Promise.resolve(null);
        return readFile(area, path).then(d => { delete optMiss[k]; return d; }, () => { optMiss[k] = Date.now(); return null; }); };

    // [HB Suite] Hub API — live data (op "live"): board / schedule / scripts / readiness / spawn. Not cached (polled).
    const LIVE_TTL = 30000, liveMemo = {};
    const liveClear = () => { Object.keys(liveMemo).forEach(k => delete liveMemo[k]); };
    const live = what => {
        const m = liveMemo[what], now = Date.now();
        if (m && now - m.at < LIVE_TTL) return m.p;
        const p = hub('live', { what }); liveMemo[what] = { at: now, p };
        p.catch(() => { if (liveMemo[what] && liveMemo[what].p === p) delete liveMemo[what]; });
        return p;
    };

    // [HB Suite] Hub API — config.json through the leaders' save route (op "gh"): read, change, write back.
    async function editConfig(mutate, message) {
        const j = await hub('gh', { method: 'GET', path: 'config.json', ref: 'main' });
        if (!j || !j.content || !j.sha) throw new HubError("Couldn't read the Hub settings.");
        const c = JSON.parse(b64ToText(j.content));
        mutate(c);
        await hub('gh', { method: 'PUT', path: 'config.json',
                          body: { message, sha: j.sha, branch: 'main', content: textToB64(JSON.stringify(c, null, 2) + '\n') } });
        return c;
    }
    // [HB Suite] Hub API — config.json (read only)
    async function readConfig() {
        const j = await hub('gh', { method: 'GET', path: 'config.json', ref: 'main' });
        return JSON.parse(b64ToText(j.content));
    }

    function injectStyles() {
        const s = document.createElement('style');
        s.id = 'hbs-styles';
        s.textContent = `
            #hbs-panel{position:fixed;z-index:2147482000;display:none;flex-direction:column;
                width:min(430px, calc(100vw - 16px));height:min(680px, 82vh);
                background:var(--bg);color:var(--txt);border:1px solid var(--edge);border-radius:10px;
                font:12px/1.4 var(--font);box-shadow:0 6px 24px rgba(0,0,0,.55);overflow:hidden;}
            #hbs-panel.hbs-open{display:flex;}
            /* resize grip (v2.4.0) - bottom-right corner, touch friendly */
            #hbs-panel .hbs-grip{position:absolute;right:0;bottom:0;width:22px;height:22px;cursor:nwse-resize;z-index:3;
                touch-action:none;user-select:none;-webkit-user-select:none;display:flex;align-items:flex-end;justify-content:flex-end;
                padding:0 3px 2px 0;color:#6b7280;font-size:13px;line-height:1;}
            #hbs-panel .hbs-grip:hover,#hbs-panel .hbs-grip.hbs-on{color:var(--acc);}
            #hbs-panel.hbs-resizing{user-select:none;-webkit-user-select:none;}
            #hbs-panel *{box-sizing:border-box;}
            #hbs-panel .hbs-head{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:7px 10px;
                background:var(--bg);border-bottom:1px solid var(--edge);cursor:move;
                user-select:none;-webkit-user-select:none;touch-action:none;}
            #hbs-panel .hbs-title{font-weight:bold;color:var(--acc);}
            #hbs-panel .hbs-ver{margin-left:6px;font-size:10px;color:var(--link);}
            #hbs-panel .hbs-who{font-size:10.5px;opacity:.7;margin-left:6px;}
            #hbs-panel .hbs-ctrls{display:flex;gap:4px;}
            #hbs-panel .hbs-ibtn{cursor:pointer;min-width:26px;height:24px;padding:0 6px;color:var(--txt);background:var(--raise);
                border:1px solid var(--edge);border-radius:5px;font:13px/22px var(--font);}
            #hbs-panel .hbs-ibtn:hover,#hbs-panel .hbs-ibtn.hbs-on{border-color:var(--acc);color:var(--acc);}
            /* tab bar wraps onto more rows when the tabs don't fit (user, Nov 11 2026: "Make the header multiple rows if necessary") */
            #hbs-panel .hbs-tabs{display:flex;flex-wrap:wrap;border-bottom:1px solid var(--edge);background:var(--card);flex:0 0 auto;padding:0 2px;}
            #hbs-panel .hbs-tabs button{flex:1 0 auto;cursor:pointer;padding:7px 8px;background:none;border:0;color:#cfd3d9;white-space:nowrap;
                font:bold 11.5px var(--font);border-bottom:2px solid transparent;touch-action:manipulation;}
            #hbs-panel .hbs-tabs button.hbs-on{color:var(--acc);border-bottom-color:var(--acc);}
            #hbs-panel .hbs-tabs button.hbs-lead{color:#e8be5a;}
            #hbs-panel .hbs-tabs .hbs-sep{flex:0 0 1px;background:var(--edge);margin:6px 2px;}
            #hbs-panel .hbs-bar{display:flex;flex-wrap:wrap;gap:5px;align-items:center;padding:7px 10px 0;}
            #hbs-panel .hbs-btn{cursor:pointer;padding:5px 9px;color:var(--bg);background:var(--acc);border:0;border-radius:6px;
                font:bold 11px var(--font);touch-action:manipulation;text-decoration:none;display:inline-block;}
            #hbs-panel .hbs-btn.hbs-ghost{color:var(--txt);background:var(--raise);border:1px solid var(--edge);}
            #hbs-panel .hbs-btn.hbs-ghost:hover{border-color:var(--acc);}
            #hbs-panel .hbs-btn:disabled{opacity:.45;cursor:default;}
            #hbs-panel .hbs-input{min-width:0;padding:5px 7px;color:var(--txt);background:var(--well);border:1px solid var(--edge);
                border-radius:6px;font:12px var(--font);}
            #hbs-panel .hbs-input:focus{outline:none;border-color:var(--acc);}
            #hbs-panel .hbs-status{padding:5px 10px;font-size:11px;opacity:.85;min-height:16px;}
            #hbs-panel .hbs-status.hbs-err{color:#FF7676;opacity:1;}
            #hbs-panel .hbs-body{flex:1 1 auto;overflow-y:auto;padding:0 10px 12px;-webkit-overflow-scrolling:touch;}
            #hbs-panel .hbs-empty{padding:20px 4px;text-align:center;opacity:.65;}
            #hbs-panel .hbs-card{border:1px solid var(--edge);border-left:3px solid var(--edge);border-radius:8px;background:var(--card);
                padding:7px 8px;margin-top:7px;}
            #hbs-panel .hbs-card.hbs-gold{border-left-color:var(--acc);}
            #hbs-panel .hbs-card.hbs-green{border-left-color:#5fd38a;}
            #hbs-panel .hbs-card.hbs-red{border-left-color:#FF7676;}
            #hbs-panel .hbs-r1{display:flex;align-items:center;gap:6px;cursor:pointer;}
            #hbs-panel .hbs-name{color:var(--link);font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}
            #hbs-panel a.hbs-name{text-decoration:none;}
            #hbs-panel .hbs-sub{font-size:11px;opacity:.75;margin-top:2px;}
            #hbs-panel .hbs-chip{margin-left:auto;flex:0 0 auto;font-size:10.5px;font-weight:bold;padding:1px 7px;border-radius:9px;
                background:var(--well);border:1px solid var(--edge);white-space:nowrap;}
            #hbs-panel .hbs-tag{font-size:10px;padding:1px 6px;border-radius:5px;background:#3a2d12;color:var(--acc);border:1px solid #6b4a18;white-space:nowrap;}
            #hbs-panel .hbs-tag.hbs-red{background:#3a1414;color:#FF7676;border-color:#7a2f2f;}
            #hbs-panel .hbs-tag.hbs-green{background:#143a20;color:#8ee6ae;border-color:#2f7a4c;}
            #hbs-panel .hbs-actions{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;}
            #hbs-panel .hbs-detail{margin-top:6px;padding:6px;border-radius:6px;background:var(--well);border:1px solid var(--edge2);}
            #hbs-panel .hbs-kv{display:grid;grid-template-columns:1fr auto;gap:2px 10px;font-size:11.5px;}
            #hbs-panel .hbs-kv b{color:#fff;text-align:right;}
            #hbs-panel .hbs-list{max-height:220px;overflow-y:auto;margin-top:5px;}
            #hbs-panel .hbs-li{display:flex;gap:6px;justify-content:space-between;padding:2px 0;border-bottom:1px solid var(--line);font-size:11.5px;}
            #hbs-panel .hbs-li.hbs-low{color:#FF7676;}
            #hbs-panel .hbs-img{display:block;width:100%;max-height:170px;object-fit:cover;object-position:top;border-radius:6px;
                border:1px solid var(--edge2);margin-top:6px;background:var(--well);}
            #hbs-panel canvas{width:100%;height:auto;display:block;border-radius:6px;border:1px solid var(--edge2);margin-top:6px;}
            #hbs-panel .hbs-msg{font-size:11px;color:var(--acc);margin-top:5px;word-break:break-word;}
            #hbs-panel .hbs-sec{margin:10px 0 5px;font-weight:bold;color:var(--acc);border-bottom:1px solid var(--edge);padding-bottom:3px;}
            #hbs-panel .hbs-hint{font-size:10.5px;opacity:.65;margin-top:3px;}
            #hbs-panel textarea.hbs-input{width:100%;min-height:70px;resize:vertical;font:11px monospace;word-break:break-all;}
            #hbs-panel .hbs-lvadd{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:6px;}
            #hbs-panel .hbs-lvadd label{display:flex;flex-direction:column;gap:2px;font-size:10.5px;opacity:.85;}

            /* --- v2 building blocks --- */
            #hbs-panel .hbs-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:6px;margin-top:7px;}
            #hbs-panel .hbs-tiles div{background:var(--card);border:1px solid var(--edge);border-radius:8px;padding:6px;text-align:center;min-width:0;}
            #hbs-panel .hbs-tiles b{display:block;color:#fff;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
            #hbs-panel .hbs-tiles > div > span{display:block;font-size:9.5px;opacity:.7;text-transform:uppercase;letter-spacing:.5px;}
            #hbs-panel .hbs-tiles i{display:block;font-style:normal;font-size:10px;opacity:.75;margin-top:1px;}
            #hbs-panel .hbs-up{color:#8ee6ae;} #hbs-panel .hbs-down{color:#FF7676;}
            #hbs-panel .hbs-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:7px;}
            #hbs-panel .hbs-chips button{cursor:pointer;padding:4px 9px;border-radius:12px;background:var(--card);border:1px solid var(--edge);color:#cfd3d9;
                font:11px var(--font);touch-action:manipulation;}
            #hbs-panel .hbs-chips button.hbs-on{background:var(--acc);color:var(--bg);border-color:var(--acc);font-weight:bold;}
            #hbs-panel .hbs-meter{margin-top:4px;}
            #hbs-panel .hbs-meter .l{display:flex;justify-content:space-between;font-size:11px;}
            #hbs-panel .hbs-meter .t{height:6px;border-radius:3px;background:var(--well);overflow:hidden;margin-top:2px;}
            #hbs-panel .hbs-meter .t i{display:block;height:100%;}
            #hbs-panel table.hbs-tbl{width:100%;border-collapse:collapse;font-size:11.5px;margin-top:5px;}
            #hbs-panel table.hbs-tbl th{color:var(--acc);font-weight:bold;text-align:right;padding:3px 4px;border-bottom:1px solid var(--edge);white-space:nowrap;}
            #hbs-panel table.hbs-tbl td{text-align:right;padding:3px 4px;border-bottom:1px solid var(--line);white-space:nowrap;}
            #hbs-panel table.hbs-tbl th:first-child,#hbs-panel table.hbs-tbl td:first-child{text-align:left;}
            #hbs-panel table.hbs-tbl td.hbs-nm{max-width:120px;overflow:hidden;text-overflow:ellipsis;}
            #hbs-panel .hbs-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;}
            #hbs-panel .hbs-form label{display:block;font-size:10.5px;opacity:.8;margin:6px 0 2px;}
            #hbs-panel .hbs-form .hbs-input{width:100%;}
            #hbs-panel .hbs-row{display:flex;gap:5px;align-items:center;margin-top:4px;}
            #hbs-panel .hbs-row > *{min-width:0;}
            #hbs-panel .hbs-row .hbs-input{flex:1 1 0;}
            #hbs-panel .hbs-row .hbs-btn{flex:0 0 auto;}
            #hbs-panel .hbs-ck,#hbs-panel .hbs-form label.hbs-ck{display:flex;gap:6px;align-items:center;font-size:11.5px;margin-top:5px;cursor:pointer;}
            #hbs-panel .hbs-ck input{width:16px;height:16px;flex:0 0 auto;}
            #hbs-panel .hbs-item{border:1px solid var(--edge2);border-radius:7px;padding:6px;margin-top:6px;background:var(--well2);}
            #hbs-panel .hbs-bad{color:#FF7676;} #hbs-panel .hbs-good{color:#8ee6ae;}
            #hbs-panel .hbs-paid td{opacity:.45;}
            #hbs-panel a{color:var(--link);}
            /* leaderboards (v2.1.0) */
            #hbs-panel .hbs-lb{border:1px solid var(--edge);border-radius:9px;background:var(--card);margin-top:8px;overflow:hidden;}
            #hbs-panel .hbs-lb .h{display:flex;justify-content:space-between;align-items:baseline;gap:8px;padding:8px 10px;background:var(--raise2);border-bottom:1px solid var(--edge);}
            #hbs-panel .hbs-lb .h b{color:var(--acc);font-size:11px;text-transform:uppercase;letter-spacing:.9px;}
            #hbs-panel .hbs-lb .h span{font-size:10.5px;opacity:.65;white-space:nowrap;}
            #hbs-panel .hbs-lb .r{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:9px;align-items:center;padding:6px 10px;cursor:pointer;}
            #hbs-panel .hbs-lb .r + .r{border-top:1px solid var(--raise2);}
            #hbs-panel .hbs-lb .r:hover{background:var(--raise2);}
            #hbs-panel .hbs-lb .rk{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10.5px;font-weight:bold;
                background:var(--well);color:#9aa0a8;border:1px solid var(--edge);}
            #hbs-panel .hbs-lb .r1 .rk{background:#e8be5a;color:var(--bg);border-color:#e8be5a;}
            #hbs-panel .hbs-lb .r2 .rk{background:#c3c9d2;color:var(--bg);border-color:#c3c9d2;}
            #hbs-panel .hbs-lb .r3 .rk{background:#cd8b52;color:var(--bg);border-color:#cd8b52;}
            #hbs-panel .hbs-lb .nm > span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--txt);font-weight:bold;font-size:12px;}
            #hbs-panel .hbs-lb .nm small{font-weight:normal;font-size:9.5px;opacity:.6;text-transform:uppercase;letter-spacing:.5px;}
            #hbs-panel .hbs-lb .nm i{display:block;height:3px;border-radius:2px;background:#2e323a;margin-top:4px;}
            #hbs-panel .hbs-lb .nm em{display:block;height:100%;border-radius:2px;background:var(--acc);opacity:.75;}
            #hbs-panel .hbs-lb .r1 .nm em{opacity:1;}
            #hbs-panel .hbs-lb .v{font-weight:bold;color:#fff;font-size:12.5px;font-variant-numeric:tabular-nums;white-space:nowrap;}
            #hbs-panel .hbs-lb .r.me{background:#2a2414;box-shadow:inset 3px 0 0 var(--acc);}
            #hbs-panel .hbs-lb .gap{text-align:center;opacity:.4;font-size:11px;line-height:10px;}
            #hbs-panel .hbs-lb .none{padding:10px;text-align:center;opacity:.6;font-size:11.5px;}
            /* war detail (v2.2.1): compact rows, own scroll area with room for the scroll bar */
            #hbs-panel .hbs-wtiles .hbs-tiles{grid-template-columns:repeat(auto-fill,minmax(70px,1fr));}
            /* average marker (v2.4.1): blue vertical line across each bar at the war's average */
            #hbs-panel .hbs-wl .nm i{position:relative;height:4px;overflow:visible;}
            #hbs-panel .hbs-wl .nm i u{position:absolute;top:-4px;bottom:-4px;width:2px;margin-left:-1px;background:var(--link);border-radius:1px;box-shadow:0 0 0 1px rgba(20,22,27,.8);}
            #hbs-panel .hbs-avgkey{display:inline-block;width:2px;height:10px;background:var(--link);border-radius:1px;margin-right:4px;vertical-align:-1px;}
            #hbs-panel .hbs-wtiles .hbs-tiles b{font-size:13.5px;}
            /* thin dark scroll bars in the panel (v2.2.1) */
            #hbs-panel, #hbs-panel *{scrollbar-width:thin;scrollbar-color:#4a505b transparent;}
            #hbs-panel ::-webkit-scrollbar{width:6px;height:6px;}
            #hbs-panel ::-webkit-scrollbar-track{background:transparent;}
            #hbs-panel ::-webkit-scrollbar-thumb{background:#4a505b;border-radius:3px;}
            /* armory use cards (v2.4.2): items grouped by type */
            #hbs-panel .hbs-arm .hbs-ag{margin-top:6px;}
            #hbs-panel .hbs-arm .hbs-agh{font-size:10.5px;color:var(--acc);text-transform:uppercase;letter-spacing:.6px;font-weight:bold;}
            #hbs-panel .hbs-arm .hbs-agh b{color:#fff;margin-left:3px;}
            #hbs-panel .hbs-arm .hbs-agi{display:flex;flex-wrap:wrap;gap:4px;margin-top:3px;}
            #hbs-panel .hbs-arm .hbs-agi span{font-size:11px;background:var(--well2);border:1px solid var(--edge2);border-radius:5px;padding:2px 6px;white-space:nowrap;}
            #hbs-panel .hbs-arm .hbs-agi b{color:#fff;}
            /* member card stats (v2.4.3) */
            #hbs-panel .hbs-ms{margin-top:5px;border-top:1px solid var(--edge2);padding-top:4px;}
            #hbs-panel .hbs-msr{display:grid;grid-template-columns:58px 52px repeat(4,minmax(0,1fr));align-items:stretch;gap:3px;
                font-size:11px;padding:2px 0;font-variant-numeric:tabular-nums;}
            #hbs-panel .hbs-msr .k{color:var(--acc);font-weight:bold;white-space:nowrap;align-self:center;}
            #hbs-panel .hbs-src{display:block;font-size:10px;font-weight:normal;letter-spacing:1px;margin-top:1px;}
            #hbs-panel .hbs-msr .t{color:#fff;text-align:right;padding-right:4px;align-self:center;white-space:nowrap;}
            #hbs-panel .hbs-msr .na{grid-column:2 / -1;align-self:center;opacity:.45;font-size:10.5px;font-style:italic;}
            #hbs-panel .hbs-msr .p{background:var(--well2);border-radius:4px;padding:1px 2px;text-align:center;white-space:nowrap;overflow:hidden;min-width:0;}
            #hbs-panel .hbs-msr .p.e{background:transparent;}
            #hbs-panel .hbs-msr .p i{display:block;font-style:normal;opacity:.6;font-size:8.5px;letter-spacing:.4px;}
            #hbs-panel .hbs-msr .p b{color:var(--txt);font-size:10.5px;}
            #hbs-panel .hbs-wlist{max-height:300px;overflow-y:auto;-webkit-overflow-scrolling:touch;padding-right:6px;}
            #hbs-panel .hbs-wl .r{padding:4px 10px;gap:8px;}
            #hbs-panel .hbs-wl .r + .r{border-top:1px solid var(--raise2);}
            #hbs-panel .hbs-wl .v{min-width:34px;text-align:right;}
            #hbs-panel .hbs-wl .r.low .v{color:#FF7676;}
            #hbs-panel .hbs-wl .r.low .nm em{background:#FF7676;}
            /* history rows (v2.1.0 - Me / profile wars + chains) */
            #hbs-panel .hbs-ev{border:1px solid var(--edge2);border-radius:8px;background:var(--card);padding:6px 9px;margin-top:5px;}
            #hbs-panel .hbs-ev.low{border-left:3px solid #FF7676;}
            #hbs-panel .hbs-ev .t{display:flex;justify-content:space-between;gap:8px;align-items:baseline;}
            #hbs-panel .hbs-ev .t b{color:var(--txt);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}
            #hbs-panel .hbs-ev .t span{font-size:10.5px;opacity:.6;white-space:nowrap;}
            #hbs-panel .hbs-ev .s{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-top:5px;}
            #hbs-panel .hbs-ev .s div{text-align:center;background:var(--well2);border-radius:5px;padding:3px 0;}
            #hbs-panel .hbs-ev .s div b{display:block;color:#fff;font-size:12.5px;font-variant-numeric:tabular-nums;}
            #hbs-panel .hbs-ev .s div span{display:block;font-size:9px;opacity:.6;text-transform:uppercase;letter-spacing:.5px;}
            #hbs-panel .hbs-ev.low .s div:first-child b{color:#FF7676;}

            /* --- launcher (suite FAB) --- */
            #hbs-launcher{position:fixed;z-index:2147481000;width:52px;height:52px;border-radius:50%;display:none;
                align-items:center;justify-content:center;box-sizing:border-box;background:linear-gradient(180deg,var(--raise),var(--bg));
                border:1px solid var(--edge);color:#9aa0a8;cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none;
                -webkit-touch-callout:none;box-shadow:0 3px 10px rgba(0,0,0,.45);transition:box-shadow .15s,color .15s;}
            #hbs-launcher.hbs-show{display:flex;}
            #hbs-launcher svg{width:26px;height:26px;pointer-events:none;}
            #hbs-launcher:hover{color:var(--acc);box-shadow:0 0 12px rgba(255,180,84,.6);}
            #hbs-launcher::after{content:attr(data-dock-label);position:absolute;right:calc(100% + 8px);top:50%;transform:translateY(-50%);
                white-space:nowrap;padding:3px 7px;border-radius:5px;background:var(--bg);border:1px solid var(--edge);color:var(--txt);
                font:11px var(--font);opacity:0;pointer-events:none;transition:opacity .15s;}
            #hbs-launcher:hover::after{opacity:1;}
            @media (max-width:600px), (pointer:coarse){ #hbs-launcher{width:46px;height:46px;} #hbs-launcher svg{width:23px;height:23px;} }
            /* ===== SUITE LOOK (v0.1.0): graphite + amber, chips row, bottom tab bar, More grid ===== */
            #hbs-panel,#hbs-launcher,#hbs-toast{--bg:#111318;--card:#181b21;--edge:#2b3039;--edge2:#262a32;--well:#0c0e12;--well2:#14171c;
                --raise:#20242c;--raise2:#1d2128;--line:#1f232a;--acc:#FFB454;--link:#7CC5FF;--txt:#e7e9ec;--mut:#98a1ab;--ok:#5fd38a;--bad:#FF7676;
                --font:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;}
            #hbs-panel{border-radius:14px;border-color:var(--edge);box-shadow:0 12px 36px rgba(0,0,0,.6);font-size:12.5px;}
            #hbs-panel .hbs-head{padding:9px 12px 6px;border-bottom:0;}
            #hbs-panel .hbs-title{font-size:13.5px;letter-spacing:.3px;}
            #hbs-panel .hbs-ver{color:var(--mut);}
            #hbs-panel .hbs-ibtn{background:transparent;border-color:transparent;border-radius:8px;}
            #hbs-panel .hbs-ibtn:hover,#hbs-panel .hbs-ibtn.hbs-on{background:var(--raise);}
            #hbs-panel .hbs-chipbar{display:flex;gap:5px;overflow-x:auto;padding:0 12px 8px;flex:0 0 auto;border-bottom:1px solid var(--edge);scrollbar-width:none;}
            #hbs-panel .hbs-chipbar::-webkit-scrollbar{display:none;}
            #hbs-panel .hbs-chipb{flex:0 0 auto;display:flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;background:var(--card);
                border:1px solid var(--edge);color:var(--txt);font:600 11px var(--font);cursor:pointer;white-space:nowrap;touch-action:manipulation;}
            #hbs-panel .hbs-chipb:hover{border-color:var(--acc);}
            #hbs-panel .hbs-dot{width:7px;height:7px;border-radius:50%;background:var(--mut);display:inline-block;}
            #hbs-panel .hbs-dot.ok{background:var(--ok);box-shadow:0 0 6px var(--ok);} #hbs-panel .hbs-dot.warn{background:var(--acc);box-shadow:0 0 6px var(--acc);}
            #hbs-panel .hbs-body{padding:0 12px 14px;}
            #hbs-panel .hbs-tabs{order:9;flex-wrap:nowrap;border-bottom:0;border-top:1px solid var(--edge);background:var(--bg);padding:2px 4px calc(2px + env(safe-area-inset-bottom));}
            #hbs-panel .hbs-tabs button{flex:1 1 0;display:flex;flex-direction:column;align-items:center;gap:1px;padding:6px 2px 5px;
                border-bottom:0;border-top:2px solid transparent;color:var(--mut);font:600 10px var(--font);}
            #hbs-panel .hbs-tabs button span{font-size:16px;line-height:18px;}
            #hbs-panel .hbs-tabs button.hbs-on{color:var(--acc);border-top-color:var(--acc);border-bottom-color:transparent;}
            #hbs-panel .hbs-card{border-radius:12px;border-left-width:1px;padding:9px 10px;margin-top:8px;}
            #hbs-panel .hbs-card.hbs-gold,#hbs-panel .hbs-card.hbs-alert{box-shadow:inset 3px 0 0 var(--acc);}
            #hbs-panel .hbs-card.hbs-green{box-shadow:inset 3px 0 0 var(--ok);} #hbs-panel .hbs-card.hbs-red{box-shadow:inset 3px 0 0 var(--bad);}
            #hbs-panel .hbs-hero{background:linear-gradient(160deg,#1f232b,#15181d);}
            #hbs-panel .hbs-big{font:700 28px/1.1 var(--font);color:#fff;margin-top:6px;font-variant-numeric:tabular-nums;}
            #hbs-panel .hbs-big small{display:block;font:500 10.5px var(--font);color:var(--mut);margin-top:2px;}
            #hbs-panel .hbs-banner{margin-top:7px;padding:6px 8px;border-radius:8px;background:#2a2414;border:1px solid #6b4a18;color:#ffd9a0;font-size:11.5px;}
            #hbs-panel .hbs-sec{border-bottom:0;margin:14px 0 4px;font-size:10.5px;text-transform:uppercase;letter-spacing:1px;color:var(--mut);}
            #hbs-panel .hbs-li{padding:5px 0;align-items:center;}
            /* 0.2.42 - ⛶ compact view (edge tab) */
            #hbs-launcher.hbs-cvhide{display:none !important;}
            /* (0.2.60) ⛓ queue: podium (top 3) + "also queued" tiles */
            #hbs-panel .hbs-qyou{font-size:11px;color:#bcd9ff;text-align:center;margin:0 0 5px;}
            #hbs-panel .hbs-pod{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;}
            #hbs-panel .hbs-pt{background:#1b1e24;border:1px solid #2c313a;border-radius:8px;padding:5px 3px 6px;text-align:center;min-width:0;}
            #hbs-panel .hbs-pt.up{border-color:#FFB454;} #hbs-panel .hbs-pt.me, #hbs-panel .hbs-ch.me{box-shadow:inset 0 0 0 1px #6aa9ff;} #hbs-panel .hbs-pt.dim, #hbs-panel .hbs-ch.dim{opacity:.55;}
            #hbs-panel .hbs-pt .hd{display:flex;align-items:center;justify-content:center;gap:4px;min-height:16px;flex-wrap:nowrap;overflow:hidden;} #hbs-panel .hbs-pt .ps{font-size:10px;opacity:.65;flex:0 0 auto;}
            #hbs-panel .hbs-pt b{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:3px;font-weight:bold;}
            #hbs-panel .hbs-pt .hbs-qe{display:block;font-size:16px;font-weight:bold;line-height:1.25;} #hbs-panel .hbs-pt .hbs-qe.none{font-size:12px;line-height:20px;}
            #hbs-panel .hbs-qe{cursor:pointer;text-decoration:underline dotted #555;text-underline-offset:3px;white-space:nowrap;} #hbs-panel .hbs-qe.none{cursor:default;text-decoration:none;opacity:.6;}
            #hbs-panel .hbs-dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:4px;vertical-align:middle;flex:0 0 7px;background:#4caf50;} #hbs-panel .hbs-dot.idle{background:#FFB454;} #hbs-panel .hbs-dot.off{background:#666;}
            #hbs-panel .hbs-pt .ic, #hbs-panel .hbs-ch .ic{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:3px 2px;}
            #hbs-panel .hbs-pt .ic{margin-top:5px;padding-top:5px;border-top:1px solid #2c313a;} #hbs-panel .hbs-ch .ic{margin-top:3px;gap:2px 4px;}
            #hbs-panel .hbs-ci{display:flex;align-items:center;justify-content:center;gap:2px;font-size:10px;white-space:nowrap;line-height:13px;} #hbs-panel .hbs-ch .hbs-ci{justify-content:flex-start;}
            #hbs-panel .hbs-ci svg{width:13px;height:13px;flex:0 0 13px;} #hbs-panel .hbs-ci em{font-style:normal;}
            #hbs-panel .hbs-ci.free{color:#7CFC9A;} #hbs-panel .hbs-ci.cd{color:#FFB454;} #hbs-panel .hbs-ci.off{color:#6b7078;}
            #hbs-panel .hbs-qsub{font-size:10.5px;opacity:.65;text-transform:uppercase;letter-spacing:.5px;margin:8px 0 4px;}
            #hbs-panel .hbs-chg{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;}
            #hbs-panel .hbs-ch{background:#1b1e24;border:1px solid #2c313a;border-radius:7px;padding:4px 5px;min-width:0;} #hbs-panel .hbs-ch.up{border-color:#FFB454;}
            #hbs-panel .hbs-ch .t{display:flex;align-items:center;gap:4px;min-width:0;} #hbs-panel .hbs-ch .n{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:bold;min-width:0;flex:0 1 auto;}
            #hbs-panel .hbs-ch .hbs-qe{margin-left:auto;font-size:11px;padding-left:3px;flex:0 0 auto;}
            #hbs-panel .hbs-pt .hbs-qt, #hbs-panel .hbs-ch .hbs-qt{font-size:10px;line-height:15px;padding:0 6px;border-radius:8px;white-space:nowrap;margin:0;flex:0 0 auto;} #hbs-panel .hbs-qt em{font-style:normal;}
            #hbs-panel .hbs-pt .hbs-qt.up, #hbs-panel .hbs-ch .hbs-qt.up{background:#FFB454;color:#2a1c00;} #hbs-panel .hbs-pt .hbs-qt.bon, #hbs-panel .hbs-ch .hbs-qt.bon{background:#4a3a10;color:#FFD48A;}
            #hbs-panel .hbs-qt.you{background:#1f3a5c;color:#bcd9ff;} #hbs-panel .hbs-rot{display:inline-flex;flex:0 0 auto;} #hbs-panel .hbs-rot > span[hidden]{display:none;}
            /* (0.2.59) key fields: text inputs drawn as dots - not type=password, so password managers leave the page alone */
            #hbs-panel input.hbs-secret{-webkit-text-security:disc;text-security:disc;font-family:text-security-disc,monospace;}
            #hbs-panel label.hbs-ck.hbs-ckx{pointer-events:none;cursor:default;} #hbs-panel label.hbs-ck.hbs-ckx input{pointer-events:auto;cursor:pointer;}
            #hbs-panel .hbs-depm .hbs-cprn{flex:0 0 auto;width:auto;min-width:0;padding:2px 8px;margin:0;font-size:11px;} #hbs-panel .hbs-depm .nt{flex:1 0 100%;opacity:.7;font-size:11px;}
            #hbs-panel .hbs-pay2{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:5px 0 3px;} #hbs-panel .hbs-pay2 div{background:rgba(0,0,0,.25);border-radius:7px;padding:5px 4px;text-align:center;}
            #hbs-panel .hbs-pay2 small{display:block;font-size:10px;opacity:.75;text-transform:uppercase;letter-spacing:.3px;} #hbs-panel .hbs-pay2 b{display:block;font-size:19px;color:#7CFC9A;}
            /* (0.2.48) 💩 dumping hits */
            #hbs-panel .hbs-dmbtn{flex:0 0 auto;min-width:0;width:38px;padding-left:0;padding-right:0;font-size:16px;} #hbs-panel .hbs-dmbtn.on{background:#3a2f55;border-color:#9b86e0;}
            #hbs-panel .hbs-dmline{display:flex;align-items:center;gap:8px;text-align:left;background:var(--card);border:1px solid var(--edge);border-radius:8px;padding:6px 8px;margin-top:7px;font-size:12px;}
            #hbs-panel .hbs-dmline span{flex:1 1 auto;min-width:0;} #hbs-panel .hbs-dmline b{color:#FFB454;} #hbs-panel .hbs-dmline small{opacity:.7;white-space:nowrap;}
            #hbs-panel .hbs-dmline i{flex:1 1 40px;height:4px;border-radius:2px;background:#2c313a;overflow:hidden;} #hbs-panel .hbs-dmline em{display:block;height:100%;background:#9b86e0;}
            #hbs-panel .hbs-dmline .hbs-btn{flex:0 0 auto;width:auto;min-width:0;padding:4px 10px;margin:0;}
            #hbs-panel .hbs-dmstop{background:#5a2626;border:1px solid #ff5b5b;border-radius:8px;padding:9px;margin-top:7px;text-align:center;color:#ffd6d6;font-size:12px;}
            #hbs-panel .hbs-dmstop b{display:block;font-size:16px;color:#fff;} #hbs-panel .hbs-dmstop span, #hbs-panel .hbs-dmstop small{display:block;} #hbs-panel .hbs-dmstop small{opacity:.75;margin-top:3px;}
            #hbs-panel .hbs-qt.dmp{background:#3a2f55;color:#d9ccff;}
            #hbs-dmcover{position:fixed;z-index:2147481500;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;gap:3px;background:#3a1d1d;border:2px dashed #ff5b5b;border-radius:10px;padding:8px 10px;color:#ffd6d6;font:12px/1.3 Arial,sans-serif;text-align:center;cursor:pointer;touch-action:manipulation;}
            #hbs-dmcover b{color:#fff;font-size:13px;} #hbs-dmcover u{text-decoration:none;display:block;background:#8a2a2a;color:#ffe0e0;border-radius:7px;padding:5px;font-weight:bold;margin-top:2px;}
            #hbs-dmwarn{position:fixed;z-index:2147481500;left:8px;right:8px;top:8px;max-width:520px;margin:0 auto;background:#5a4417;border:1px solid #FFB454;border-radius:8px;padding:8px 10px;color:#FFE3B0;font:12px/1.35 Arial,sans-serif;text-align:center;pointer-events:none;}
            /* (0.2.47) alert timer tiles above the Queue: next = amber outline, sent = amber fill (last alert red), off = dimmed (chain under the minimum) */
            #hbs-panel .hbs-altiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(0,1fr));gap:5px;margin-top:7px;}
            #hbs-panel .hbs-altiles div{background:var(--card);border:1px solid var(--edge);border-radius:8px;padding:6px 2px;text-align:center;min-width:0;}
            #hbs-panel .hbs-altiles span{display:block;font-size:9.5px;opacity:.75;text-transform:uppercase;letter-spacing:.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
            #hbs-panel .hbs-altiles b{display:block;color:#ccc;font-size:15px;white-space:nowrap;} #hbs-panel .hbs-altiles i{display:block;font-style:normal;font-size:10px;opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
            #hbs-panel .hbs-altiles .next{border-color:#FFB454;} #hbs-panel .hbs-altiles .next b{color:#FFB454;}
            #hbs-panel .hbs-altiles .sent{background:#5a4417;border-color:#FFB454;} #hbs-panel .hbs-altiles .sent b, #hbs-panel .hbs-altiles .sent span, #hbs-panel .hbs-altiles .sent i{color:#FFD48A;opacity:1;}
            #hbs-panel .hbs-altiles .sent.last{background:#5a2626;border-color:#ff5b5b;} #hbs-panel .hbs-altiles .sent.last b, #hbs-panel .hbs-altiles .sent.last span, #hbs-panel .hbs-altiles .sent.last i{color:#ffc4c4;}
            #hbs-panel .hbs-altiles .off{opacity:.45;} #hbs-panel .hbs-altiles .met b{color:#7CFC9A;}
            #hbs-panel .hbs-altiles .below{border-style:dashed;} #hbs-panel .hbs-altiles .below b{color:#ff8f8f;}
            #hbs-compact{position:fixed;z-index:2147481000;box-sizing:border-box;background:#14161b;border:1px solid #FFB454;color:#e8e8e8;font:13px/1.3 Arial,sans-serif;text-align:center;
                cursor:pointer;user-select:none;-webkit-user-select:none;box-shadow:0 2px 10px rgba(0,0,0,.5);padding:5px 6px;}
            #hbs-compact.cv-right{right:0;border-right:0;border-radius:10px 0 0 10px;} #hbs-compact.cv-left{left:0;border-left:0;border-radius:0 10px 10px 0;}
            #hbs-compact .t{font-weight:bold;color:#fff;font-variant-numeric:tabular-nums;} #hbs-compact .t.amber{color:#FFB454;} #hbs-compact .t.red{color:#ff5b5b;} #hbs-compact .t.dim{color:#777;}
            #hbs-compact .p{font-size:11px;color:#bbb;} #hbs-compact .s{font-size:11px;color:#999;}
            #hbs-compact .pl span{display:inline-block;padding:2px 8px;border-radius:9px;background:#2c313a;color:#ddd;font-weight:bold;font-size:12px;white-space:nowrap;}
            #hbs-compact.up .pl span{background:#2f5d33;color:#c8f5cf;} #hbs-compact.bk .pl span{background:#5a4417;color:#FFD48A;}
            #hbs-compact.cv-right.up{border-left:3px solid #4caf50;} #hbs-compact.cv-right.bk{border-left:3px solid #FFB454;}
            #hbs-compact.cv-left.up{border-right:3px solid #4caf50;} #hbs-compact.cv-left.bk{border-right:3px solid #FFB454;}
            #hbs-compact .b{display:block;width:100%;margin-top:6px;padding:8px 6px;border:0;border-radius:8px;background:#FFB454;color:#2a1c00;font:bold 13px Arial,sans-serif;cursor:pointer;touch-action:none;}
            #hbs-compact .b.on{background:#2f5d33;color:#c8f5cf;}
            #hbs-compact .x{position:absolute;top:2px;font-size:13px;color:#999;padding:2px 5px;} #hbs-compact.cv-right .x{left:2px;} #hbs-compact.cv-left .x{right:2px;}
            #hbs-compact.cv-l:not(.open) .t{font-size:16px;} #hbs-compact.cv-s:not(.open){padding:4px 6px;} #hbs-compact.cv-s:not(.open) .t{font-size:13px;}
            #hbs-compact.cv-l.open{width:138px;padding:8px;} #hbs-compact.cv-l.open .t{font-size:30px;line-height:1.2;} #hbs-compact.cv-l.open .pl{margin:4px 0 2px;}
            #hbs-compact.cv-s.open{width:100px;padding:6px;} #hbs-compact.cv-s.open .r{display:flex;align-items:baseline;justify-content:center;gap:6px;margin-top:8px;}
            #hbs-compact.cv-s.open .t{font-size:21px;} #hbs-compact.cv-s.open .pl span{font-size:11px;padding:1px 6px;} #hbs-compact.cv-s.open .b{font-size:12px;padding:7px 4px;margin-top:5px;}
            #hbs-compact.flash{animation:hbsCvFlash .9s steps(1,end) infinite;} #hbs-compact.flash.panic{animation-duration:.45s;}
            @keyframes hbsCvFlash{0%{background:#7a1410;border-color:#ff3b30;}50%{background:#14161b;border-color:#FFB454;}}
            #hbs-panel .hbs-cvopt{text-align:left;margin-top:6px;}
            /* 0.2.40 - queue cover headline + time setting row */
            #hbs-panel .hbs-cover{margin:8px 0 2px;padding:9px 12px;border-radius:9px;text-align:left;border:1px solid #2f5d33;background:#16261b;color:#c8f5cf;}
            #hbs-panel .hbs-cover .h{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;}
            #hbs-panel .hbs-cover .h i{font-style:normal;font-size:15px;}
            #hbs-panel .hbs-cover .h b{font-size:14.5px;}
            #hbs-panel .hbs-cover .h span{margin-left:auto;font-size:11.5px;opacity:.85;white-space:nowrap;}
            #hbs-panel .hbs-cover .d{margin-top:5px;font-size:11.5px;opacity:.9;line-height:1.5;}
            #hbs-panel .hbs-cover .d .y{color:#7CFC9A;font-weight:bold;} #hbs-panel .hbs-cover .d .n{color:#ff8f8f;font-weight:bold;}
            #hbs-panel .hbs-cover.warn{border-color:#6b4a18;background:#2a2414;color:#ffd9a0;}
            #hbs-panel .hbs-cover.low{border-color:#7a3a3a;background:#3a1f1f;color:#ffd0d0;}
            #hbs-panel .hbs-tzrow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;text-align:left;}
            #hbs-panel .hbs-tzrow > span:first-child{display:flex;flex-direction:column;min-width:0;}
            #hbs-panel .hbs-tzrow small{color:#888;font-size:10.5px;}
            #hbs-panel .hbs-tzrow .hbs-chips{flex:0 0 auto;margin:0;}
            #hbs-panel .hbs-tzset{display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex:0 0 auto;}
            /* 0.2.39 - red update banner (3+ versions behind / required) */
            #hbs-panel .hbs-upd.hbs-updreq{background:#4a1616;border-color:#ff6b6b;color:#ffe0e0;font-size:12.5px;line-height:1.5;padding:8px 10px;}
            #hbs-panel .hbs-upd.hbs-updreq .hbs-btn{margin-left:6px;text-decoration:none;}
            /* 0.2.37 - "your energy isn't reaching the queue" note */
            #hbs-panel .hbs-banner.hbs-warnb{background:#3a1f1f;border-color:#7a3a3a;color:#ffd0d0;text-align:left;line-height:1.45;}
            #hbs-panel .hbs-banner.hbs-warnb .hbs-actions{margin-top:6px;justify-content:flex-start;}
            /* 0.2.35 - low reliability: who's new / dropped a grade */
            #hbs-panel .hbs-relnew{margin:4px 0 6px;padding:6px 10px;border-radius:8px;background:#3a1f1f;border:1px solid #7a3a3a;color:#ffd0d0;font-size:12px;text-align:left;line-height:1.5;}
            #hbs-panel .hbs-relrow.new{border-color:#ff6b6b;box-shadow:inset 3px 0 0 #ff6b6b;}
            #hbs-panel .hbs-relrow .n{position:relative;}
            #hbs-panel .hbs-relrow .n em{align-self:flex-start;font-style:normal;font-size:10px;font-weight:bold;padding:0 6px;border-radius:8px;background:#c0392b;color:#fff;margin:2px 0;}
            /* 0.2.34 - minimized icon: chain timer, you're-up, alert flash */
            #hbs-launcher .hbs-ltime{position:absolute;left:50%;bottom:-9px;transform:translateX(-50%);padding:1px 6px;border-radius:9px;background:#111318;border:1px solid var(--acc,#FFB454);
                color:#e8e8e8;font:bold 11px/1.3 Arial,sans-serif;white-space:nowrap;pointer-events:none;}
            #hbs-launcher .hbs-ltime.amber{color:#FFB454;} #hbs-launcher .hbs-ltime.red{color:#fff;background:#c0392b;border-color:#ff6b6b;}
            #hbs-launcher.hbs-l-up{box-shadow:0 0 0 3px #ff4d4d,0 2px 10px rgba(0,0,0,.6);}
            #hbs-launcher.hbs-l-flash,#hbs-launcher.hbs-l-flash.hbs-alerting{animation:hbsLFlash .9s steps(1,end) infinite;}   /* wins over the old 2.6 s hbs-alerting pulse */
            #hbs-launcher.hbs-l-flash.hbs-l-panic,#hbs-launcher.hbs-l-flash.hbs-l-panic.hbs-alerting{animation-duration:.45s;}
            @keyframes hbsLFlash{0%{background:#ff3b30;box-shadow:0 0 0 6px rgba(255,59,48,.55),0 0 18px 6px rgba(255,59,48,.6);transform:scale(1.12);}
                50%{background:#FFB454;box-shadow:0 0 0 2px rgba(255,180,84,.5);transform:scale(1);}}
            /* 0.2.33 - 🛡 low reliability rows */
            #hbs-panel .hbs-rel{display:flex;flex-direction:column;gap:4px;margin:4px 0 6px;}
            #hbs-panel .hbs-relrow{display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:8px;background:#1b1e24;border:1px solid #2c313a;text-align:left;}
            #hbs-panel .hbs-relrow .g{flex:0 0 26px;height:26px;line-height:26px;border-radius:6px;text-align:center;color:#111;font-size:14px;}
            #hbs-panel .hbs-relrow .n{flex:1;min-width:0;display:flex;flex-direction:column;}
            #hbs-panel .hbs-relrow .n a{font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
            #hbs-panel .hbs-relrow .n small{color:#999;font-size:10.5px;}
            #hbs-panel .hbs-relrow .sc{flex:0 0 64px;display:flex;flex-direction:column;align-items:flex-end;gap:3px;}
            #hbs-panel .hbs-relrow .sc b{font-size:14px;line-height:1;}
            #hbs-panel .hbs-relrow .sc i{display:block;width:100%;height:4px;border-radius:2px;background:#2c313a;overflow:hidden;}
            #hbs-panel .hbs-relrow .sc u{display:block;height:100%;text-decoration:none;}
            /* 0.2.32 - ✅ Getting started */
            #hbs-panel .hbs-onb{box-shadow:inset 3px 0 0 var(--acc);text-align:left;}
            #hbs-panel .hbs-onbrow{display:flex;align-items:center;gap:8px;padding:6px 0;border-top:1px solid #2c313a;}
            #hbs-panel .hbs-onbrow i{font-style:normal;width:18px;text-align:center;color:#888;font-weight:bold;}
            #hbs-panel .hbs-onbrow span{flex:1;min-width:0;display:flex;flex-direction:column;}
            #hbs-panel .hbs-onbrow small{color:#888;font-size:10.5px;}
            #hbs-panel .hbs-onbrow.ok i{color:#7CFC9A;} #hbs-panel .hbs-onbrow.ok b{color:#888;font-weight:normal;text-decoration:line-through;}
            /* 0.2.31 - chain goal + tab dots */
            #hbs-panel .hbs-goal{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 12px;margin:6px 0 4px;padding:6px 10px;border-radius:8px;background:#1b1e24;border:1px solid #2c313a;font-size:12px;color:#bbb;}
            #hbs-panel .hbs-goal b{color:#e8e8e8;} #hbs-panel .hbs-goal span:first-child b{color:var(--acc);}
            #hbs-panel .hbs-tabs button{position:relative;}
            #hbs-panel .hbs-tdot{position:absolute;top:4px;left:calc(50% + 9px);width:9px;height:9px;border-radius:50%;background:#FF4D4D;box-shadow:0 0 0 2px #111318;}
            /* 0.2.30 - unfilled roles in 🚀 Deployed crimes */
            #hbs-panel .hbs-depm.open{background:rgba(255,107,107,.06);}
            #hbs-panel .hbs-depm.open i{color:#888;}
            /* 0.2.27 - bonus guard */
            #hbs-panel .hbs-bguard{font-size:11px;color:#FFB454;margin:4px 0 2px;}
            #hbs-panel .hbs-btn.hbs-warnbtn{background:#5a4417;color:#FFD48A;border-color:#8a6a2a;}
            /* 0.2.26 - 📌 OC assignment tile */
            #hbs-panel .hbs-pin.hbs-ocpin{box-shadow:inset 3px 0 0 var(--acc);cursor:pointer;}
            #hbs-panel .hbs-ocpin .hbs-pin-l{flex-wrap:wrap;row-gap:2px;white-space:normal;}
            #hbs-panel .hbs-ocpin .hbs-pin-t{color:var(--acc);font-size:14px;}
            #hbs-panel .hbs-ocpin .hbs-pin-s{flex-basis:100%;white-space:normal;}
            /* 0.2.25 - role weights */
            #hbs-panel .hbs-wt{display:inline-block;margin-left:4px;padding:0 5px;border-radius:8px;background:#2a2440;color:#d9ccff;font-size:10px;font-weight:bold;white-space:nowrap;vertical-align:middle;}
            #hbs-panel .hbs-depm .r .hbs-wt{display:block;margin:2px 0 0;width:max-content;}
            /* 0.2.23 - 🚀 Deployed crimes / 📡 Sharing rows */
            #hbs-panel .hbs-dep{margin:6px 0;text-align:left;}
            #hbs-panel .hbs-depm{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;padding:4px 2px;border-top:1px solid #2c313a;font-size:12px;text-align:left;}
            #hbs-panel .hbs-depm .r{flex:0 0 32%;color:#bbb;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
            #hbs-panel .hbs-depm a{flex:1 1 auto;min-width:35%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:bold;}
            #hbs-panel .hbs-depm .s{font-size:11px;white-space:nowrap;} #hbs-panel .hbs-depm .s.ok{color:#7CFC9A;} #hbs-panel .hbs-depm .s.q{color:#FFB454;} #hbs-panel .hbs-depm .s.no{color:#ff6b6b;}
            #hbs-panel .hbs-depm .p{font-size:11px;color:#888;min-width:30px;text-align:right;}
            #hbs-panel .hbs-depm.t{display:grid;grid-template-columns:30% minmax(0,1fr) auto;gap:2px 8px;}
            #hbs-panel .hbs-depm.t .n{display:flex;flex-direction:column;min-width:0;}
            #hbs-panel .hbs-depm.t .n a{min-width:0;}
            /* 0.2.23 - paged lists */
            #hbs-panel .hbs-pgmore{display:flex;flex-direction:column;align-items:center;gap:4px;margin:10px 0 4px;}
            #hbs-panel .hbs-pgmore small,#hbs-panel .hbs-pgend{font-size:10.5px;color:#888;text-align:center;}
            #hbs-panel .hbs-pgend{margin:10px 0 4px;}
            /* 0.2.22 - queue runway + dead-chain timer */
            #hbs-panel .hbs-runway{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:8px 0 2px;}
            #hbs-panel .hbs-runway > div{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:6px 4px;border-radius:8px;
                background:#1b1e24;border:1px solid #2c313a;text-align:center;min-width:0;}
            #hbs-panel .hbs-runway b{font-size:15px;color:#e8e8e8;line-height:1.2;}
            #hbs-panel .hbs-runway small{font-size:9.5px;color:#888;text-transform:uppercase;letter-spacing:.4px;line-height:1.25;margin-top:2px;}
            #hbs-panel .hbs-runway .ok b{color:#7CFC9A;} #hbs-panel .hbs-runway .no b{color:#ff6b6b;}
            @media (max-width:360px){ #hbs-panel .hbs-runway{grid-template-columns:repeat(2,1fr);} }
            #hbs-panel .hbs-big.hbs-dead{color:#666;}
            /* 0.2.21 - 🔍 Alert check */
            #hbs-panel .hbs-allog{display:flex;flex-direction:column;gap:2px;margin:4px 0 8px;max-height:220px;overflow:auto;text-align:left;font-size:11px;}
            #hbs-panel .hbs-allog > div{display:flex;flex-wrap:wrap;gap:6px;align-items:baseline;padding:3px 6px;border-radius:6px;background:#1b1e24;}
            #hbs-panel .hbs-allog span{color:#888;min-width:54px;}
            #hbs-panel .hbs-allog em{font-style:normal;color:#bbb;margin-left:auto;}
            /* 0.2.20 - 🛠 Chain settings (leaders) */
            #hbs-panel .hbs-cwcfg{margin-top:6px;text-align:left;}
            #hbs-panel .hbs-cwcfg .hbs-ck{display:flex;align-items:center;gap:8px;padding:8px 0;text-align:left;}
            #hbs-panel .hbs-cwcfg .hbs-ck small{color:#888;}
            #hbs-panel .hbs-cfgrow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid #2c313a;}
            #hbs-panel .hbs-cfgrow > span:first-child{display:flex;flex-direction:column;min-width:0;}
            #hbs-panel .hbs-cfgrow small{color:#888;font-size:10.5px;}
            #hbs-panel .hbs-cfgin{display:flex;align-items:center;gap:6px;flex:0 0 auto;}
            #hbs-panel .hbs-cfgin input{width:78px;text-align:right;}
            #hbs-panel .hbs-cfgin small{min-width:44px;color:var(--acc);}
            /* 0.2.19 - fold bars (Retals / Schedule) */
            #hbs-panel .hbs-fold{display:flex;align-items:center;gap:8px;width:100%;margin:14px 0 0;padding:9px 12px;border-radius:9px;cursor:pointer;
                background:#1b1e24;border:1px solid #2c313a;border-left:3px solid var(--acc);color:#e8e8e8;font:inherit;text-align:left;touch-action:manipulation;}
            #hbs-panel .hbs-fold:hover{background:#21252d;}
            #hbs-panel .hbs-fold .ic{font-size:15px;}
            #hbs-panel .hbs-fold .tt{font-weight:bold;font-size:12.5px;color:var(--acc);white-space:nowrap;}
            #hbs-panel .hbs-fold .mt{margin-left:auto;display:flex;align-items:center;gap:6px;font-size:11px;color:#bbb;min-width:0;overflow:hidden;white-space:nowrap;}
            #hbs-panel .hbs-fold .mt small{color:#888;}
            #hbs-panel .hbs-fold .cv{display:inline-block;transition:transform .15s;color:var(--acc);font-size:12px;}
            #hbs-panel .hbs-fold.open{border-radius:9px 9px 0 0;border-bottom-color:transparent;}
            #hbs-panel .hbs-fold.open .cv{transform:rotate(90deg);}
            #hbs-panel .hbs-fold.alert{border-left-color:#ff6b6b;}
            #hbs-panel .hbs-foldn{display:inline-block;min-width:18px;padding:0 6px;border-radius:9px;background:#2c313a;color:#fff;text-align:center;font-size:11px;}
            #hbs-panel .hbs-fold.alert .hbs-foldn{background:#c0392b;}
            #hbs-panel .hbs-foldme{padding:1px 6px;border-radius:9px;background:#2f5d33;color:#b9f5c0;font-weight:bold;overflow:hidden;text-overflow:ellipsis;}
            #hbs-panel .hbs-foldb{padding:6px 10px 8px;border:1px solid #2c313a;border-top:0;border-radius:0 0 9px 9px;background:#16191e;}
            #hbs-panel .hbs-fold:not(.open) + .hbs-foldb{border-top:1px solid #2c313a;border-radius:9px;margin-top:4px;}
            #hbs-panel .hbs-foldb .hbs-sec:first-child{margin-top:4px;}
            /* 0.2.18 - Chain Watch queue + bonus line */
            .hbs-bonusline{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:6px 0;padding:6px 10px;border-radius:8px;background:#2a2440;border:1px solid #4a3f6e;color:#d9ccff;font-size:12px;}
            .hbs-bonusline .hbs-mini{margin-left:auto;}
            .hbs-cap{font-size:12px;font-weight:bold;color:#7CFC9A;margin:2px 0 6px;}
            .hbs-cap.warn{color:#FFB454;} .hbs-cap.low{color:#ff6b6b;}
            .hbs-q{display:flex;flex-direction:column;gap:4px;}
            .hbs-qr{padding:6px 8px;border-radius:8px;background:#1b1e24;border:1px solid #2c313a;}
            .hbs-qr.up{box-shadow:inset 3px 0 0 #4caf50;border-color:#2f5d33;}
            .hbs-qr.bon{box-shadow:inset 3px 0 0 #9b87f5;}
            .hbs-qr.me{border-color:#FFB454;}
            .hbs-qr.dim{opacity:.55;}
            .hbs-qr .m{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0;}
            .hbs-qr .m .p{min-width:16px;color:#888;font-weight:bold;}
            .hbs-qr .m a{font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:45%;}
            .hbs-qr .m .h{margin-left:auto;font-weight:bold;font-size:15px;color:#e8e8e8;}
            .hbs-qr .m .h small{font-size:10px;font-weight:normal;color:#888;margin-left:2px;}
            .hbs-qr.dry .h{color:#ff6b6b;}
            .hbs-qt{font-size:10px;font-weight:bold;padding:1px 6px;border-radius:9px;background:#2c313a;color:#ccc;white-space:nowrap;}
            .hbs-qt.up{background:#2f5d33;color:#b9f5c0;} .hbs-qt.bon{background:#4a3f6e;color:#d9ccff;}
            .hbs-qt.cant{background:#5a2626;color:#ffc4c4;} .hbs-qt.hit{background:#1f4d3a;color:#7CFC9A;}
            .hbs-qr .st{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:3px;padding-left:22px;font-size:11px;}
            .hbs-qr .st span{display:inline-flex;align-items:center;gap:3px;}
            .hbs-qr .st .en{color:#7CFC9A;font-weight:bold;} .hbs-qr .st .cd{color:#FFB454;} .hbs-qr .st .ok{color:#888;} .hbs-qr .st .n{color:#888;}
            .hbs-qr .st .bolt.off{opacity:.3;filter:grayscale(1);}
            .hbs-ic{height:12px;width:auto;vertical-align:middle;}
            /* 0.2.18 - Armory Loan Filter (on Torn's page, outside the panel) */
            .hbs-armbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:6px 0;padding:6px 10px;border-radius:8px;background:#1b1e24;
                border:1px solid #33373f;color:#eaeaea;font:12px Arial,sans-serif;}
            .hbs-armbar label{display:flex;align-items:center;gap:6px;cursor:pointer;font-weight:bold;color:#FFB454;}
            .hbs-armbar span{opacity:.7;}
            li.hbs-armhide{display:none !important;}
            /* 0.2.15 - Home Latest tiles */
            #hbs-panel .hbs-latest{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:6px;}
            #hbs-panel .hbs-lt{display:flex;flex-direction:column;gap:3px;padding:6px;border-radius:9px;background:var(--card);border:1px solid var(--edge);text-decoration:none;color:inherit;min-width:0;}
            #hbs-panel .hbs-lt .k{font-size:9.5px;letter-spacing:.5px;text-transform:uppercase;color:var(--acc);font-weight:800;}
            #hbs-panel .hbs-lt img{width:100%;height:70px;object-fit:cover;object-position:top;border-radius:6px;background:var(--well);}
            #hbs-panel .hbs-lt b{font-size:11.5px;line-height:1.25;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}
            #hbs-panel .hbs-lt small{font-size:10px;opacity:.65;}
            /* 0.2.13 - OC crime card for narrow panels: ready line, seat blocks with a planning bar */
            #hbs-panel .hbs-ocready{margin-top:7px;padding:6px 8px;border-radius:8px;background:var(--well);border:1px solid var(--edge);}
            #hbs-panel .hbs-ocready small{display:block;font-size:10.5px;opacity:.7;}
            #hbs-panel .hbs-seat{max-width:520px;margin:0 auto;padding:6px 8px;border-bottom:1px solid var(--edge);text-align:left;}
            #hbs-panel .hbs-seat.me{background:#2a2414;box-shadow:inset 3px 0 0 var(--acc);border-radius:4px;}
            #hbs-panel .hbs-seat.open{opacity:.6;}
            #hbs-panel .hbs-seat .t{display:flex;justify-content:space-between;gap:8px;align-items:baseline;}
            #hbs-panel .hbs-seat .t span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
            #hbs-panel .hbs-seat .b{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;margin-top:3px;}
            #hbs-panel .hbs-seat .b i{display:block;height:5px;border-radius:3px;background:var(--edge);overflow:hidden;}
            #hbs-panel .hbs-seat .b em{display:block;height:100%;background:var(--ok);}
            #hbs-panel .hbs-seat .b small{font-size:10.5px;opacity:.85;white-space:nowrap;}
            /* 0.2.11 - recruit layout for narrow panels */
            #hbs-panel .hbs-chips[data-chips="rsv"]{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:5px;}
            #hbs-panel .hbs-chips[data-chips="rsv"] button{margin:0;}
            #hbs-panel .hbs-rstool{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px;}
            #hbs-panel .hbs-rstool > label{grid-column:1 / -1;}
            #hbs-panel .hbs-rstool .hbs-btn{margin:0;width:100%;font-size:11.5px;}
            #hbs-panel .hbs-rsfld{display:flex;flex-direction:column;gap:2px;text-align:left;min-width:0;}
            #hbs-panel .hbs-rsfld > span{font-size:9.5px;letter-spacing:.4px;text-transform:uppercase;opacity:.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
            #hbs-panel .hbs-rsfld .hbs-input{width:100%;box-sizing:border-box;text-align:right;} #hbs-panel .hbs-rsfld select.hbs-input{text-align:left;}
            #hbs-panel .hbs-rsfldck{justify-content:flex-start;} #hbs-panel .hbs-rsfldck input{width:18px;height:18px;margin:4px 0 0;}
            #hbs-panel .hbs-rscrit{padding:7px 2px;border-top:1px solid var(--edge);text-align:left;}
            #hbs-panel .hbs-rscrit .h{display:flex;justify-content:space-between;align-items:center;gap:8px;}
            #hbs-panel .hbs-rscrit .h b{font-size:12.5px;}
            #hbs-panel .hbs-rscrit .f{display:grid;grid-template-columns:1fr 64px;gap:6px;margin-top:5px;}
            #hbs-panel .hbs-rscrit .f.f3{grid-template-columns:1fr 1fr 64px;}
            #hbs-panel .hbs-rsmust{display:flex;align-items:center;gap:4px;font-size:11px;padding:2px 8px;border:1px solid var(--edge);border-radius:12px;cursor:pointer;white-space:nowrap;}
            #hbs-panel .hbs-rsmust:has(input:checked){border-color:var(--acc);color:var(--acc);}
            #hbs-panel .hbs-rsset{grid-template-columns:1fr 96px !important;}
            #hbs-panel .hbs-rscrit input[type=number],#hbs-panel .hbs-rsset input[type=number]{-moz-appearance:textfield;appearance:textfield;}
            #hbs-panel .hbs-rscrit input::-webkit-outer-spin-button,#hbs-panel .hbs-rscrit input::-webkit-inner-spin-button,
            #hbs-panel .hbs-rsset input::-webkit-outer-spin-button,#hbs-panel .hbs-rsset input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}
            /* 0.2.10 - ⚙ Criteria rows: check · limit · weight · must */
            #hbs-panel .hbs-rsset4{display:grid;grid-template-columns:1fr 104px 44px 50px;gap:5px;align-items:center;margin-top:5px;text-align:left;}
            #hbs-panel .hbs-rsset4 > span:first-child{font-size:11.5px;} #hbs-panel .hbs-rsset4 .hbs-input{width:100%;text-align:right;padding-left:3px;padding-right:3px;}
            #hbs-panel .hbs-rsset4 .hbs-ck{margin:0;font-size:10.5px;} #hbs-panel .hbs-rsset4 > input[type=checkbox]{justify-self:end;}
            #hbs-panel .hbs-rshead span{font-size:9.5px !important;text-transform:uppercase;letter-spacing:.5px;opacity:.6;text-align:center;}
            #hbs-panel .hbs-rshead span:first-child{text-align:left;}
            #hbs-panel .hbs-rsrange{grid-column:1 / -1;display:grid;grid-template-columns:auto 1fr auto 1fr;gap:5px;align-items:center;}
            #hbs-panel .hbs-rsrange small{font-size:10px;opacity:.65;}
            /* 0.2.9 - recruit tiles for phones: 3-column value / label grid, even button rows, two-line pool rows */
            #hbs-panel .hbs-rsg{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;margin-top:7px;}
            #hbs-panel .hbs-rsg > div{background:var(--well);border:1px solid var(--edge);border-radius:7px;padding:4px 3px;text-align:center;min-width:0;}
            #hbs-panel .hbs-rsg b{display:block;font-size:13px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
            #hbs-panel .hbs-rsg span{display:block;font-size:9px;letter-spacing:.4px;text-transform:uppercase;opacity:.65;}
            #hbs-panel .hbs-rsbtns,#hbs-panel .hbs-rsact{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:5px;margin-top:7px;}
            #hbs-panel .hbs-rsbtns .hbs-btn,#hbs-panel .hbs-rsact .hbs-btn,#hbs-panel .hbs-rsbtns select{width:100%;margin:0;}
            #hbs-panel .hbs-rshd{text-align:center;} #hbs-panel .hbs-rshd small{opacity:.6;}
            #hbs-panel .hbs-rsfit{height:5px;max-width:180px;margin:5px auto 2px;border-radius:3px;background:var(--edge);overflow:hidden;}
            #hbs-panel .hbs-rsfit i{display:block;height:100%;background:var(--acc);}
            #hbs-panel .hbs-rsrow{max-width:520px;margin:0 auto;padding:7px 4px;border-bottom:1px solid var(--edge);text-align:left;}
            #hbs-panel .hbs-rsrow .t{font-weight:bold;} #hbs-panel .hbs-rsrow .t small{opacity:.55;font-weight:normal;}
            #hbs-panel .hbs-rsrow .s{font-size:11px;opacity:.8;margin-top:2px;}
            #hbs-panel .hbs-rsset{display:grid;grid-template-columns:1fr 90px 54px;gap:6px;align-items:center;margin-top:5px;text-align:left;}
            #hbs-panel .hbs-rsset span{font-size:11.5px;} #hbs-panel .hbs-rsset .hbs-input{width:100%;text-align:right;}
            #hbs-panel .hbs-rsset .hbs-ck{margin:0;font-size:10.5px;}
            /* 0.2.8 - Recruit Scout cards: check chips, 7-day bars */
            #hbs-panel .hbs-rsck{display:flex;flex-wrap:wrap;justify-content:center;gap:4px;margin-top:6px;}
            #hbs-panel .hbs-rsck span{font-size:10.5px;padding:1px 6px;border-radius:5px;background:var(--well);border:1px solid var(--edge);color:#9aa0a8;white-space:nowrap;}
            #hbs-panel .hbs-rsck span.pass{border-color:#2f7a4c;color:#8ee6ae;} #hbs-panel .hbs-rsck span.near{border-color:#8a6a2e;color:var(--acc);}
            #hbs-panel .hbs-rsck span.fail{border-color:#7a2f2f;color:#FF7676;} #hbs-panel .hbs-rsck span.must{font-weight:bold;}
            #hbs-panel .hbs-rsbars{display:flex;align-items:flex-end;gap:3px;height:30px;max-width:260px;margin:4px auto;}
            #hbs-panel .hbs-rsbars i{flex:1 1 0;min-height:2px;border-radius:2px 2px 0 0;background:var(--acc);}
            #hbs-panel .hbs-rsbars i.idle{background:#FF7676;} #hbs-panel .hbs-rsbars i.na{background:var(--edge);height:2px;}
            /* 0.2.4 - Home tile groups (centred), Armoury loan outlines */
            #hbs-panel .hbs-grps{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:8px;}
            #hbs-panel .hbs-grp{flex:1 1 150px;max-width:100%;background:rgba(255,255,255,.02);border:1px solid var(--edge);border-radius:10px;padding:5px 6px 6px;}
            #hbs-panel .hbs-grp > .t{font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--acc);text-align:center;}
            #hbs-panel .hbs-grp .hbs-tiles{display:flex;flex-wrap:wrap;justify-content:center;margin-top:4px;}
            #hbs-panel .hbs-grp .hbs-tiles > div{flex:1 1 84px;max-width:140px;}
            #hbs-panel .hbs-grp2{display:grid;grid-template-columns:1fr 1fr;gap:6px;}
            #hbs-panel .hbs-grp2 > div{min-width:0;}
            #hbs-panel .hbs-grp2 > div > .t{font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--acc);text-align:center;}
            #hbs-panel .hbs-ctiles .hbs-tiles{display:flex;flex-wrap:wrap;justify-content:center;}
            #hbs-panel .hbs-ctiles .hbs-tiles > div{flex:1 1 96px;max-width:150px;}
            .hbs-arm-loan{outline:2px solid #4caf50 !important;outline-offset:-2px;border-radius:4px;}
            .hbs-arm-retr{outline:2px solid #e4382e !important;outline-offset:-2px;border-radius:4px;}
            .hbs-arm-pulse{animation:hbsArmPulse .6s ease-in-out 4;}
            @keyframes hbsArmPulse{50%{box-shadow:0 0 0 4px rgba(232,190,90,.75);}}
            /* 0.2.3 - schedule day chip (date on a second line), OC pay hero, alert settings, alert flash */
            #hbs-panel .hbs-day{display:inline-flex;flex-direction:column;align-items:center;line-height:1.15;}
            #hbs-panel .hbs-day small{display:block;font-size:10px;opacity:.75;font-weight:normal;}
            #hbs-panel .hbs-pay{margin:8px auto;padding:8px 10px;border-radius:8px;background:#1b2418;border:1px solid #2f5a34;max-width:360px;}
            #hbs-panel .hbs-pay.jn{background:#2a2410;border-color:var(--acc);box-shadow:0 0 0 1px rgba(232,190,90,.25);}
            #hbs-panel .hbs-pay .l{font-size:11px;font-weight:700;letter-spacing:.04em;opacity:.85;}
            #hbs-panel .hbs-pay .v{font-size:22px;font-weight:800;color:#7cfc9a;}
            #hbs-panel .hbs-pay.jn .v{color:var(--acc);}
            #hbs-panel .hbs-pay .v small{font-size:11px;font-weight:normal;opacity:.7;}
            #hbs-panel .hbs-pay .s{font-size:11px;opacity:.75;}
            #hbs-panel .hbs-alcfg{text-align:center;}
            #hbs-panel .hbs-alrow{padding:6px 0;border-top:1px solid var(--edge);}
            #hbs-panel .hbs-alrow:first-of-type{border-top:0;}
            #hbs-panel .hbs-alcfg .hbs-row{gap:6px;flex-wrap:wrap;margin-top:4px;}
            #hbs-panel .hbs-alcfg select.hbs-input{width:auto;min-width:96px;}
            #hbs-panel .hbs-alcfg input[type=range]{width:140px;}
            #hbs-panel .hbs-alcfg label.hbs-ck{display:inline-flex;align-items:center;gap:4px;margin:3px 6px;}
            #hbs-panel.hbs-alerting,#hbs-launcher.hbs-alerting{animation:hbsAlertFlash .65s ease-in-out 4;}
            @keyframes hbsAlertFlash{50%{box-shadow:0 0 0 3px #FF3B3B,0 0 24px rgba(255,59,59,.7);}}
            #hbs-panel .hbs-li.hbs-me{background:#2a2414;box-shadow:inset 3px 0 0 var(--acc);padding-left:6px;border-radius:4px;}
            #hbs-panel .hbs-li.hbs-dim{opacity:.55;}
            #hbs-panel .hbs-btn{border-radius:8px;padding:6px 11px;}
            #hbs-panel .hbs-more{display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:6px;}
            #hbs-panel .hbs-more button{display:flex;flex-direction:column;align-items:center;gap:3px;padding:10px 4px;border-radius:12px;
                background:var(--card);border:1px solid var(--edge);color:var(--txt);font:600 11px var(--font);cursor:pointer;touch-action:manipulation;}
            #hbs-panel .hbs-more button span{font-size:20px;}
            #hbs-panel .hbs-more button:hover{border-color:var(--acc);}
            #hbs-panel .hbs-tiles div{border-radius:10px;}
            #hbs-toast{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:2147483000;max-width:min(92vw,420px);padding:9px 14px;
                border-radius:10px;background:var(--bg);color:var(--txt);border:1px solid var(--edge);font:600 13px var(--font);
                box-shadow:0 8px 24px rgba(0,0,0,.6);opacity:0;transition:opacity .2s;pointer-events:none;}
            #hbs-toast.hbs-strong{border-color:var(--acc);color:var(--acc);box-shadow:0 0 18px rgba(255,180,84,.45);}
            /* 0.2.1: pinned chain tile, badges, update banner, retals, schedule grid, compact mode */
            #hbs-panel .hbs-pin{display:flex;align-items:center;gap:8px;margin:0 12px 6px;padding:6px 8px;border-radius:10px;background:var(--card);border:1px solid var(--edge);box-shadow:inset 3px 0 0 var(--ok);}
            #hbs-panel .hbs-pin-l{flex:1;min-width:0;display:flex;align-items:baseline;gap:8px;cursor:pointer;white-space:nowrap;overflow:hidden;}
            #hbs-panel .hbs-pin-t{font:700 15px var(--font);color:#fff;font-variant-numeric:tabular-nums;}
            #hbs-panel .hbs-pin-s{font-size:11px;color:var(--mut);overflow:hidden;text-overflow:ellipsis;}
            #hbs-panel .hbs-pin .hbs-btn{padding:4px 9px;}
            #hbs-panel .hbs-upd{margin:0 12px 6px;padding:6px 8px;border-radius:8px;background:#2a2414;border:1px solid #6b4a18;color:#ffd9a0;font-size:11.5px;}
            #hbs-panel .hbs-upd button{float:right;background:none;border:0;color:#ffd9a0;cursor:pointer;}
            /* badge: flex-centred number (0.2.2 - user: "very out of center and hard to read") */
            .hbs-badge{position:absolute;top:1px;left:calc(50% + 5px);box-sizing:border-box;min-width:18px;height:18px;padding:0 5px;border-radius:9px;
                display:flex;align-items:center;justify-content:center;background:#FF3B3B;color:#fff;font:800 11px/1 system-ui,Arial,sans-serif;
                letter-spacing:0;box-shadow:0 0 0 2px #111318;pointer-events:none;}
            #hbs-panel .hbs-tabs button, #hbs-panel .hbs-more button{position:relative;}
            #hbs-panel .hbs-more .hbs-badge{left:auto;right:8px;top:6px;}
            #hbs-launcher .hbs-badge.hbs-lb{left:auto;top:-4px;right:-4px;}
            .hbs-tct::before{content:"TCT";}
            #hbs-panel .hbs-btn.hbs-hitting{background:#2f8f4e;color:#fff;box-shadow:0 0 0 2px rgba(124,252,154,.45);}
            /* CENTRE-FOCUSED (0.2.2, user: "Center all of the pages and information. The entire suite should be
               center-focused."): text, card headers, buttons, chips, tiles and the pinned tile are centred; list rows
               (queue, members...) keep name left / value right but sit in a centred column */
            #hbs-panel .hbs-body{text-align:center;}
            #hbs-panel .hbs-r1{justify-content:center;flex-wrap:wrap;}
            #hbs-panel .hbs-r1 .hbs-chip{margin-left:0;}
            #hbs-panel .hbs-actions,#hbs-panel .hbs-chips,#hbs-panel .hbs-rtc,#hbs-panel .hbs-bar,#hbs-panel .hbs-row{justify-content:center;}
            #hbs-panel .hbs-sec{text-align:center;}
            #hbs-panel .hbs-kv{grid-template-columns:1fr 1fr;column-gap:12px;}
            #hbs-panel .hbs-kv span{text-align:right;} #hbs-panel .hbs-kv b{text-align:left;}
            #hbs-panel .hbs-li{max-width:520px;margin-left:auto;margin-right:auto;text-align:left;}
            #hbs-panel .hbs-pin{justify-content:center;} #hbs-panel .hbs-pin-l{flex:0 1 auto;justify-content:center;}
            #hbs-panel .hbs-upd{text-align:center;}
            /* (0.2.66) 📢 announcement tile + the leaders' Announce tab */
            #hbs-panel .hbs-ann{margin:0 12px 6px;padding:7px 10px;border-radius:8px;background:#2a2414;border:1px solid #6b4a18;color:#ffd9a0;font-size:12.5px;line-height:1.4;word-break:break-word;position:relative;}
            #hbs-panel .hbs-ann.urgent{background:#4a1616;border-color:#ff6b6b;color:#ffe0e0;}
            #hbs-panel .hbs-ann small{display:block;opacity:.7;font-size:10.5px;margin-top:2px;}
            #hbs-panel .hbs-ann.dis{padding-right:30px;} #hbs-panel .hbs-ann button{position:absolute;top:2px;right:2px;width:28px;height:28px;background:none;border:0;color:inherit;cursor:pointer;font-size:13px;}
            #hbs-panel .hbs-annbox{width:100%;min-height:64px;resize:vertical;font:13px var(--font);margin:0;}
            #hbs-panel .hbs-annpick{display:flex;flex-wrap:wrap;gap:5px;margin-top:5px;}
            #hbs-panel .hbs-annpick label{display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border-radius:999px;border:1px solid var(--edge);background:var(--well);font-size:11.5px;cursor:pointer;min-height:30px;}
            #hbs-panel .hbs-annpick label.on{border-color:var(--acc);color:var(--acc);} #hbs-panel .hbs-annpick input{margin:0;accent-color:var(--acc);}
            #hbs-panel .hbs-ck,#hbs-panel .hbs-form label.hbs-ck{justify-content:center;}
            #hbs-panel .hbs-lay{text-align:left;}
            #hbs-panel table.hbs-tbl{margin-left:auto;margin-right:auto;}
            #hbs-panel .hbs-rtc{display:flex;flex-wrap:wrap;gap:6px;align-items:center;}
            #hbs-panel .hbs-rtc .hbs-chips{margin-top:4px;}
            #hbs-panel .hbs-rtff{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--mut);}
            #hbs-panel .hbs-rtff .hbs-input{width:52px;padding:3px 5px;}
            #hbs-panel .hbs-rt{border:1px solid var(--edge);border-radius:10px;padding:7px 9px;margin-top:6px;background:var(--card);box-shadow:inset 3px 0 0 #FF5C5C;}
            #hbs-panel .hbs-rt.hbs-rtsoon{box-shadow:inset 3px 0 0 var(--acc);}
            #hbs-panel .hbs-rt.hbs-rtcalled{box-shadow:inset 3px 0 0 var(--link);opacity:.85;}
            #hbs-panel .hbs-ff{font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px;background:#2b2f37;color:#cfd3da;white-space:nowrap;}
            #hbs-panel .hbs-ffe{background:#2f5f3a;color:#b6f0c4;} #hbs-panel .hbs-ffm{background:#5f5330;color:#ffe0a3;} #hbs-panel .hbs-ffh{background:#5f2f2f;color:#ffbcbc;}
            #hbs-panel .hbs-schh{cursor:pointer;}
            #hbs-panel .hbs-slots{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:3px;margin:3px 0 6px;}
            #hbs-panel .hbs-slot{padding:5px 0;border-radius:5px;border:1px solid var(--edge);background:var(--well2);color:var(--txt);font:10.5px var(--font);cursor:pointer;touch-action:manipulation;}
            #hbs-panel .hbs-slot.hbs-sp{background:#173d27;border-color:#2f7a4c;} #hbs-panel .hbs-slot.hbs-sb{background:#3d3217;border-color:#6b4a18;}
            #hbs-panel .hbs-slot.hbs-past{opacity:.3;cursor:default;} #hbs-panel .hbs-slot.hbs-on{outline:2px solid var(--acc);}
            #hbs-panel .hbs-key{display:inline-block;width:10px;height:10px;border-radius:3px;margin:0 3px 0 8px;vertical-align:-1px;border:1px solid var(--edge);}
            #hbs-panel .hbs-key.hbs-sp{background:#173d27;} #hbs-panel .hbs-key.hbs-sb{background:#3d3217;} #hbs-panel .hbs-key.hbs-so{background:var(--well2);}
            #hbs-panel .hbs-chips button:disabled{opacity:.4;}
            #hbs-panel.hbs-compact{font-size:11px;}
            #hbs-panel.hbs-compact .hbs-card{padding:6px 8px;margin-top:5px;border-radius:9px;}
            #hbs-panel.hbs-compact .hbs-tiles{gap:4px;} #hbs-panel.hbs-compact .hbs-tiles div{padding:4px;} #hbs-panel.hbs-compact .hbs-tiles b{font-size:13px;}
            #hbs-panel.hbs-compact .hbs-big{font-size:22px;} #hbs-panel.hbs-compact .hbs-btn{padding:4px 8px;font-size:10.5px;}
            #hbs-panel.hbs-compact .hbs-tabs button{padding:4px 2px 3px;font-size:9px;} #hbs-panel.hbs-compact .hbs-tabs button span{font-size:14px;}
            #hbs-panel.hbs-compact .hbs-li{padding:3px 0;font-size:11px;} #hbs-panel.hbs-compact .hbs-sec{margin:9px 0 3px;}
            /* (0.2.62) compact-mode layouts: Chain + OC */
            #hbs-panel.hbs-compact .hbs-fold{margin-top:5px;padding:6px 9px;} #hbs-panel.hbs-compact .hbs-fold .tt{font-size:11.5px;}
            #hbs-panel.hbs-compact .hbs-foldb{padding:4px 8px 6px;}
            #hbs-panel .hbs-cmtop{display:flex;align-items:center;gap:8px;min-width:0;}
            #hbs-panel .hbs-cmt{font:700 24px/1 var(--font);color:#fff;font-variant-numeric:tabular-nums;flex:0 0 auto;} #hbs-panel .hbs-cmt.dead{color:#777;}
            #hbs-panel .hbs-cmi{flex:1 1 auto;min-width:0;line-height:1.25;text-align:left;} #hbs-panel .hbs-cmi > b{display:block;font-size:12.5px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
            #hbs-panel .hbs-cmi > small{display:block;font-size:10.5px;color:#aaa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;} #hbs-panel .hbs-cmi > small b{color:var(--acc);}
            #hbs-panel .hbs-cmdot{flex:0 0 auto;font-size:10px;color:#7CFC9A;} #hbs-panel .hbs-cmdot.poll{color:#FFB454;} #hbs-panel .hbs-cmdot.off{color:#777;}
            #hbs-panel .hbs-cmic{flex:0 0 auto !important;width:34px;min-width:34px;padding:6px 0 !important;font-size:14px !important;text-align:center;}
            #hbs-panel .hbs-cmup{margin-top:4px;font-size:11px;color:#bbb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
            #hbs-panel .hbs-cmcov{display:flex;align-items:center;gap:6px;margin:5px 0 0;padding:5px 9px;font-size:11.5px;cursor:pointer;white-space:nowrap;overflow:hidden;}
            #hbs-panel .hbs-cmcov b{flex:0 0 auto;} #hbs-panel .hbs-cmcov span{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;opacity:.9;} #hbs-panel .hbs-cmcov em{font-style:normal;flex:0 0 auto;opacity:.8;}
            #hbs-panel .hbs-cmcovd{margin:0;border-radius:0 0 9px 9px;border-top:0;padding:4px 9px 6px;font-size:11px;} #hbs-panel .hbs-cmcov.open{border-radius:9px 9px 0 0;}
            #hbs-panel .hbs-cmact{flex-wrap:nowrap;} #hbs-panel .hbs-cmact > .hbs-btn:first-child{flex:1 1 auto;padding:7px 8px !important;font-size:12px !important;}
            #hbs-panel .hbs-cmact .hbs-dmbtn{width:34px;min-width:34px;padding:6px 0 !important;font-size:14px !important;}
            /* (0.2.62, user: "Add small text under the icons. 'Target' 'Dump'. Remove the X, replace it as 'Leave'. Use small text ... so they fit in the existing buttons") */
            #hbs-panel .hbs-cmact .hbs-cmic, #hbs-panel .hbs-cmact .hbs-dmbtn{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;padding:3px 0 !important;line-height:1;font-size:13px !important;}
            #hbs-panel .hbs-cmact small{display:block;font-size:7.5px;font-weight:bold;letter-spacing:.1px;line-height:1;white-space:nowrap;opacity:.9;} #hbs-panel .hbs-cmact small.only{font-size:8.5px;}
            #hbs-panel .hbs-cmal .hbs-altiles{gap:4px;margin-top:5px;} #hbs-panel .hbs-cmal .hbs-altiles div{padding:2px 2px 3px;border-radius:7px;}
            #hbs-panel .hbs-cmal .hbs-altiles i{display:none;} #hbs-panel .hbs-cmal .hbs-altiles b{font-size:12.5px;} #hbs-panel .hbs-cmal .hbs-altiles span{font-size:8.5px;}
            #hbs-panel .hbs-cmq{display:flex;align-items:baseline;gap:8px;} #hbs-panel .hbs-cmq .hbs-cap{margin:0 0 0 auto;font-size:11px;}
            /* (0.2.64) ⚔ War tab: priority targets */
            #hbs-panel .hbs-wscore{font:700 24px/1.1 var(--font);color:#fff;text-align:center;margin-top:6px;font-variant-numeric:tabular-nums;} #hbs-panel .hbs-wscore small{display:block;font:normal 11.5px var(--font);color:#aaa;margin-top:3px;}
            #hbs-panel .hbs-wscore .up{color:#7CFC9A;} #hbs-panel .hbs-wscore .dn{color:#ff8f8f;}
            #hbs-panel .hbs-wrange{display:flex;align-items:center;gap:6px;margin-top:6px;font-size:11.5px;color:#bbb;} #hbs-panel .hbs-wrange input{width:58px;margin:0;text-align:center;}
            #hbs-panel .hbs-wrow{display:flex;align-items:center;gap:6px;padding:6px 0;border-top:1px solid var(--edge);text-align:left;min-width:0;}
            #hbs-panel .hbs-wrow .n{flex:1 1 auto;min-width:0;line-height:1.25;} #hbs-panel .hbs-wrow .n a{font-weight:bold;font-size:12.5px;} #hbs-panel .hbs-wrow .n small{display:block;font-size:10.5px;color:#999;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
            #hbs-panel .hbs-wrow .hbs-btn{flex:0 0 auto;text-decoration:none;} #hbs-panel .hbs-wrow.off{opacity:.5;}
            #hbs-panel .hbs-wst{font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px;white-space:nowrap;background:#2f5f3a;color:#b6f0c4;} #hbs-panel .hbs-wst.no{background:#5f2f2f;color:#ffbcbc;} #hbs-panel .hbs-wst.aw{background:#2b2f37;color:#cfd3da;}
            #hbs-panel .hbs-wgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;margin-top:6px;}
            #hbs-panel .hbs-wgrid a{display:block;text-decoration:none;text-align:left;padding:5px 7px;border-radius:7px;background:var(--well);border:1px solid var(--edge);min-width:0;}
            #hbs-panel .hbs-wgrid a b{display:block;font-size:12px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;} #hbs-panel .hbs-wgrid a span{display:block;font-size:10.5px;color:#bbb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
            #hbs-panel .hbs-wgrid a.ok{border-color:#2f5d33;} #hbs-panel .hbs-wgrid a.ok span i{font-style:normal;color:#7CFC9A;} #hbs-panel .hbs-wgrid a.off{opacity:.5;}
            #hbs-panel .hbs-cmpay{flex:0 0 auto;text-align:right;line-height:1.15;} #hbs-panel .hbs-cmpay b{display:block;font-size:17px;color:#7CFC9A;} #hbs-panel .hbs-cmpay small{font-size:9.5px;opacity:.75;text-transform:uppercase;}
            #hbs-panel .hbs-cm4 .hbs-rsg{grid-template-columns:repeat(4,minmax(0,1fr));margin-top:5px;} #hbs-panel .hbs-cm4 .hbs-rsg b{font-size:12px;}
            /* ⚙ Layout rows (0.2.0) */
            #hbs-panel .hbs-lay{display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--line);font-size:11.5px;}
            #hbs-panel .hbs-lay > span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
            #hbs-panel .hbs-lay small{opacity:.55;font-size:9.5px;}
            #hbs-panel .hbs-lay label{display:flex;align-items:center;gap:3px;font-size:10.5px;color:var(--mut);white-space:nowrap;}
            #hbs-panel .hbs-btn.hbs-mini{padding:3px 8px;min-width:28px;}
            /* pictures open full size (0.2.0) */
            #hbs-panel img, #hbs-panel canvas{cursor:zoom-in;}
            #hbs-full{position:fixed;inset:0;z-index:2147483100;background:rgba(0,0,0,.88);display:none;align-items:center;justify-content:center;overflow:auto;padding:12px;}
            #hbs-full > div{display:flex;flex-direction:column;align-items:center;gap:8px;max-width:100%;}
            #hbs-full img{max-width:none;width:auto;height:auto;}
            @media (max-width:700px){ #hbs-full img{max-width:100%;} }
            #hbs-full a{color:#1b1e24;background:#FFB454;border-radius:8px;padding:6px 12px;font:bold 12px system-ui,Arial,sans-serif;text-decoration:none;}
            #hbs-full span{color:#ccc;font:12px system-ui,Arial,sans-serif;}
            /* crimes page: your assigned crime + seat (OC module) */
            .hbs-occard{outline:2px solid #FFB454 !important;outline-offset:2px;border-radius:6px;}
            /* (0.2.74) a crime leadership disabled: red hatch (never catches a press itself) + dead Join buttons */
            .hbs-ocdis{position:relative !important;}
            .hbs-ocdis::before{content:'';position:absolute;inset:0;z-index:3;border-radius:6px;pointer-events:none;
                background:repeating-linear-gradient(135deg,rgba(255,118,118,.13) 0 5px,rgba(0,0,0,.34) 5px 10px);box-shadow:inset 0 0 0 1px rgba(255,118,118,.6);}
            .hbs-ocdis::after{content:'⛔ Disabled by leadership';position:absolute;top:2px;left:2px;z-index:4;max-width:calc(100% - 4px);pointer-events:none;
                background:#FF7676;color:#2a0000;font:bold 10px Arial,sans-serif;padding:1px 6px;border-radius:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
            .hbs-ocdis [class*="joinButton"]{pointer-events:none !important;opacity:.35 !important;cursor:not-allowed !important;}
            .hbs-ocseat{position:relative !important;outline:3px solid #4caf50 !important;outline-offset:1px;border-radius:6px;animation:hbsSeatPulse 1.4s ease-in-out infinite;}
            .hbs-ocseat::after{content:'★ Your role';position:absolute;top:1px;left:1px;z-index:5;max-width:calc(100% - 2px);pointer-events:none;
                background:#4caf50;color:#06240a;font:bold 9px Arial,sans-serif;padding:0 5px;border-radius:3px;line-height:1.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
            @keyframes hbsSeatPulse{0%,100%{box-shadow:0 0 0 2px rgba(76,175,80,.4),0 0 10px rgba(76,175,80,.4);}50%{box-shadow:0 0 0 3px rgba(76,175,80,.7),0 0 20px rgba(76,175,80,.75);}}
        `;
        (document.head || document.documentElement).appendChild(s);
    }

    const ICON_SVG =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z"/>' +
        '<circle cx="12" cy="12.6" r="1.6"/><path d="M12 14.2v2.3M10.6 11.8l-2-1.3M13.4 11.8l2-1.3"/></svg>';

    let panel, bodyEl, statusEl, whoEl, gearBtn, tabsEl, launcher;
    let collapsed = true, showSettings = !!(store.get(K.view, null) || {}).set;
    let tab = store.get(K.tab, 'home');
    let me = null;
    const open = Object.assign({}, (store.get(K.view, null) || {}).open || {});
    let profileId = (store.get(K.view, null) || {}).pid || null;

    const TABS = [
        { id: 'home', icon: '🏠', label: 'Home', main: true }, { id: 'chain', icon: '⛓', label: 'Chain', main: true, mod: 'chain' },
        { id: 'oc', icon: '🕵', label: 'OC', main: true }, { id: 'wars', icon: '⚔', label: 'War', main: true },
        { id: 'more', icon: '•••', label: 'More', main: true },
        { id: 'boards', icon: '🏆', label: 'Boards' }, { id: 'me', icon: '👤', label: 'Me' }, { id: 'members', icon: '👥', label: 'Members' },
        { id: 'history', icon: '📜', label: 'History' }, { id: 'news', icon: '📰', label: 'News' }, { id: 'payouts', icon: '💰', label: 'Payouts' }, { id: 'scripts', icon: '🧩', label: 'Scripts' },
        { id: 'alerts', icon: '🔔', label: 'Alerts', lead: true }, { id: 'announce', icon: '📢', label: 'Announce', lead: true }, { id: 'ocm', icon: '🗂', label: 'OC Management ↗', lead: true, href: '/l/oc.html' },
        { id: 'panels', icon: '🖼', label: 'Panel Editor ↗', lead: true, href: '/l/panels.html' },
        { id: 'recruit', icon: '🤝', label: 'Recruit', lead: true, mod: 'recruit' },
        { id: 'stats', icon: '💪', label: 'Stats', lead: true },
        { id: 'armory', icon: '🗄', label: 'Armory', lead: true }, { id: 'calc', icon: '🧮', label: 'Payout calculator ↗', lead: true, href: '/l/payout.html' },
    ];
    const hrefTab = id => { const t = TABS.find(x => x.id === id); if (!t || !t.href) return false; window.open(HUB_BASE + t.href, '_blank', 'noopener'); return true; };
    const tabOk = id => { const t = TABS.find(x => x.id === id); if (t && t.href) return false;
        return !!t && (!t.lead || !!(me && me.leader)) && (!t.mod || MOD[t.mod] !== false); };

    function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }

    function buildPanel() {
        panel = el('div'); panel.id = 'hbs-panel';
        panel.innerHTML = `
            <div class="hbs-head">
                <span><span class="hbs-title">${SCRIPT_NAME}</span><span class="hbs-ver">v${VERSION}</span><span class="hbs-who"></span></span>
                <span class="hbs-ctrls">
                    <button type="button" class="hbs-ibtn" data-h="reload" title="Reload from the Hub">↻</button>
                    <button type="button" class="hbs-ibtn" data-h="gear" title="Settings">⚙</button>
                    <button type="button" class="hbs-ibtn" data-h="min" title="Minimize">–</button>
                </span>
            </div>
            <div class="hbs-chipbar"></div>
            <div class="hbs-upd" style="display:none"></div>
            <div class="hbs-ann" style="display:none"></div>
            <div class="hbs-pin" style="display:none"></div>
            <div class="hbs-pin hbs-ocpin" style="display:none"></div>
            <div class="hbs-tabs"></div>
            <div class="hbs-status"></div>
            <div class="hbs-body"></div>`;
        document.body.appendChild(panel);
        bodyEl = panel.querySelector('.hbs-body');
        statusEl = panel.querySelector('.hbs-status');
        whoEl = panel.querySelector('.hbs-who');
        tabsEl = panel.querySelector('.hbs-tabs');
        gearBtn = panel.querySelector('[data-h="gear"]');
        chipsEl = panel.querySelector('.hbs-chipbar');
        pinEl = panel.querySelector('.hbs-pin:not(.hbs-ocpin)'); updEl = panel.querySelector('.hbs-upd');
        ocPinEl = panel.querySelector('.hbs-ocpin');
        ocPinEl.addEventListener('click', e => { if (e.target.closest('a')) return; if (!e.target.closest('[data-ocpin]')) return; tab = 'oc'; store.set(K.tab, tab); showSettings = false; render(); });
        pinEl.addEventListener('click', e => { const b = e.target.closest('[data-pin]'); if (b) cwAction(b.dataset.pin, b.tagName === 'BUTTON' ? b : null); });
        annEl = panel.querySelector('.hbs-ann');
        annEl.addEventListener('click', e => { if (!e.target.closest('[data-anndis]')) return; const a = nowData && nowData.announce; if (a) store.set(K.annDismiss, a.id); drawAnn(); });
        updEl.addEventListener('click', e => { if (!e.target.closest('[data-upd]')) return; const U = store.get(K.upd, {}) || {}; U.dismissed = U.ver; store.set(K.upd, U); drawUpdate(); });
        chipsEl.addEventListener('click', e => { const b = e.target.closest('[data-gotab]'); if (!b || hrefTab(b.dataset.gotab) || !tabOk(b.dataset.gotab)) return;
            tab = b.dataset.gotab; store.set(K.tab, tab); showSettings = false; render(); });
        panel.querySelector('[data-h="min"]').addEventListener('click', () => setCollapsed(true));
        gearBtn.addEventListener('click', () => { showSettings = !showSettings; render(); });
        panel.querySelector('[data-h="reload"]').addEventListener('click', () => { Object.keys(cache).forEach(k => delete cache[k]); liveClear(); Object.keys(optMiss).forEach(k => delete optMiss[k]); render(); });
        tabsEl.addEventListener('click', e => {
            const b = e.target.closest('button[data-tab]'); if (!b || hrefTab(b.dataset.tab)) return;
            if (tab === b.dataset.tab && b.dataset.tab === 'members') profileId = null;
            profileBack = null;
            tab = b.dataset.tab; store.set(K.tab, tab); showSettings = false; render();
        });
        panel.addEventListener('keydown', e => { if (e.target.matches('input,textarea,select')) e.stopPropagation(); }, true);
        ['pointerdown', 'keydown', 'input', 'change'].forEach(ev => panel.addEventListener(ev, () => { userActAt = Date.now(); }, true));
        buildTabs();
        restorePanelSize();
        restorePanelPos();
        makePanelDraggable(panel.querySelector('.hbs-head'), panel.querySelector('.hbs-ctrls'));
        makePanelResizable();
    }

    function buildTabs() {
        if (!tabsEl) return;
        const lead = !!(me && me.leader);
        void lead;
        tabsEl.innerHTML = barTabs().map(t =>
            `<button type="button" data-tab="${t.id}"><span>${t.icon}</span>${t.label}</button>`).join('');
    }

    function setMe(m) {
        const wasLead = !!(me && me.leader);
        me = m || null;
        if (me) me.id = num(me.id);
        if (me && me.leader) { try { rsLeaderLoad(); } catch (e) {   } }
        try { const ses = store.get(K.session, null); store.set(K.meC, me && ses ? { me, exp: ses.exp } : null); } catch (e) {   }
        if (whoEl) whoEl.textContent = me ? '· ' + me.name : '';
        if (wasLead !== !!(me && me.leader)) buildTabs();
    }

    function setStatus(text, isErr) {
        if (!statusEl) return;
        statusEl.textContent = text || '';
        statusEl.classList.toggle('hbs-err', !!isErr);
    }

    let pollTimer = null, tickTimer = null;
    function stopTimers() { clearTimeout(pollTimer); pollTimer = null; clearInterval(tickTimer); tickTimer = null; }
    function schedulePoll() {
        clearTimeout(pollTimer); pollTimer = null;
        if (collapsed || showSettings || document.visibilityState !== 'visible') return;
        const ms = tab === 'ready' ? READY_POLL_MS : 0;
        if (ms) pollTimer = setTimeout(() => { if (tab === 'ready') render(true); }, ms);
        if (!tickTimer) tickTimer = setInterval(tick, 1000);
    }
    function tick() {
        if (collapsed || !panel) return;
        tickEl(panel);
        refreshNow(false);
    }
    function tickEl(root) {
        const n = Date.now();
        root.querySelectorAll('[data-exp]').forEach(x => { const v = Number(x.dataset.exp) - n; x.textContent = v > 0 ? dur(v / 1000) : (x.dataset.zero || '0s'); });
        root.querySelectorAll('[data-until]').forEach(x => { const v = Number(x.dataset.until) - n / 1000; x.textContent = v > 0 ? dur(v) : (x.dataset.zero || 'Ready'); });
    }
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') { if (!collapsed && (tab === 'home' || tab === 'ready')) render(true); }
        else stopTimers();
    });

    let renderSeq = 0;
    let userActAt = 0;
    async function render(quiet) {
        if (!panel || collapsed) return;
        if (quiet && showSettings && Date.now() - userActAt > 5000) return;
        if (quiet && tab === 'recruit' && rsView === 'set' && !showSettings) return;
        const seq = ++renderSeq;
        gearBtn.classList.toggle('hbs-on', showSettings);
        if (showSettings || !getKey()) { markTab(); renderSettings(); stopTimers(); viewSave(); return; }
        const top = bodyEl.scrollTop;
        if (!quiet) viewHold();
        if (!quiet) { bodyEl.innerHTML = '<div class="hbs-empty">Loading…</div>'; setStatus(''); }
        try {
            if (!me) setMe((await hub('whoami')).me);
            if (!tabOk(tab)) { tab = 'home'; store.set(K.tab, tab); }
            markTab(); cwWatch(); refreshNow(false);
            if (tab === 'ready') { tab = 'home'; store.set(K.tab, tab); }
            const T = VIEWS[tab];
            const html = await T.html();
            if (seq !== renderSeq) return;
            bodyEl.innerHTML = html;
            if (quiet) bodyEl.scrollTop = top;
            if (T.bind) T.bind();
            if (!quiet) viewRestore();
            tick(); drawPin(); drawBadges();
        } catch (e) {
            if (seq !== renderSeq) return;
            console.warn(LOG, e);
            if (!quiet) bodyEl.innerHTML = `<div class="hbs-empty">${esc(e.message || 'Something went wrong.')}</div>`;
            setStatus(e.message, true);
        }
        schedulePoll();
    }
    function markTab() {
        const t = TABS.find(x => x.id === tab), on = t && inBar(t.id) && barTabs().includes(t) ? tab : 'more';
        tabsEl.querySelectorAll('button[data-tab]').forEach(b => b.classList.toggle('hbs-on', !showSettings && b.dataset.tab === on));
    }
    const msgIn = key => bodyEl.querySelector(`[data-msg="${key}"]`);

    async function names() {
        const M = await readFile('m', 'db/members.json');
        if (!M._by) { M._by = {}; (M.members || []).forEach(m => { M._by[m.id] = m; }); }
        return { list: M.members || [], byId: M._by };
    }
    const nameOf = (N, id) => (N.byId[id] || {}).name || '[' + id + ']';
    const kv = rows => `<div class="hbs-kv">${rows.filter(Boolean).map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('')}</div>`;
    const tiles = rows => `<div class="hbs-tiles">${rows.filter(Boolean).map(([v, l, sub]) => `<div><b>${v}</b><span>${l}</span>${sub ? `<i>${sub}</i>` : ''}</div>`).join('')}</div>`;
    const sec = t => `<div class="hbs-sec">${t}</div>`;
    const meter = (lab, b, col) => !b ? '' : `<div class="hbs-meter"><div class="l"><span>${lab}</span><b>${int(b.cur)} / ${int(b.max)}</b></div>
        <div class="t"><i style="width:${b.max ? Math.min(100, Math.round(100 * b.cur / b.max)) : 0}%;background:${col}"></i></div></div>`;
    const vsAvg = (v, a) => v == null || !a ? '' : `<span class="${v >= a ? 'hbs-up' : 'hbs-down'}">${v >= a ? '▲' : '▼'} ${Math.abs(Math.round((v / a - 1) * 100))}% vs avg</span>`;
    const chips = (name, opts, cur) => `<div class="hbs-chips" data-chips="${name}">${opts.map(([v, l]) =>
        `<button type="button" data-v="${esc(v)}" class="${String(v) === String(cur) ? 'hbs-on' : ''}">${l}</button>`).join('')}</div>`;
    function bindChips(name, set) {
        const c = bodyEl.querySelector(`[data-chips="${name}"]`);
        if (c) c.addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (!b) return; set(b.dataset.v); render(); });
    }

    let mineCache = null;
    const OC_LINK = id => `https://www.torn.com/factions.php?step=your&type=1#/tab=crimes&crimeId=${id}`;
    const onb = () => store.get(K.onb, {}) || {};
    const onbSet = p => { const o = onb(); if (o.done) return; store.set(K.onb, Object.assign(o, p)); };
    let onbBusy = false;
    function onbHtml() {
        const o = onb(); if (o.done) return '';
        if (!o.oc && !onbBusy && Date.now() - num(o.ocAt) > 20000) { onbBusy = true;
            // [HB Suite] Hub API — op "share_get" (your sharing settings; kept 60 s) for the Getting started tile
            hub('share_get').then(g => { const on = !!((g && g.settings) || {}).oc; onbSet({ oc: on, ocAt: Date.now() }); if (on && tab === 'home' && !collapsed && !showSettings) render(true); }, () => onbSet({ ocAt: Date.now() }))
                .then(() => { onbBusy = false; }); }
        if (cw.queued && !o.join) { onbSet({ join: true }); o.join = true; }
        const MO = typeof myOc !== 'undefined' ? myOc : null, as = MO && MO.assignment;
        if (!MO && !o.crime) loadMyOc(false).then(d => { if (d && tab === 'home' && !collapsed && !showSettings) render(true); }, () => {});
        if (MO && MO.current && !o.crime) { onbSet({ crime: true }); o.crime = true; }
        const ocBtn = as && !as.joined && as.kind === 'live' && as.crime_id
            ? `<a class="hbs-btn hbs-mini" href="${OC_LINK(as.crime_id)}">Join ${esc(as.crime)}</a>` : '<button type="button" class="hbs-btn hbs-mini" data-onb="oc">Open 🕵 OC</button>';
        const steps = [
            ['key', !!getKey(), 'Add your API key', 'A Limited Access key. Stays on this device.', ''],
            ['oc', !!o.oc, 'Share your OC pass rates', 'So the planner seats you in roles you pass.', '<button type="button" class="hbs-btn hbs-mini" data-onb="oc">Open 🕵 OC</button>'],
            ['test', !!o.test, 'Test your alerts', "Hear and feel what a chain alert is like.", '<button type="button" class="hbs-btn hbs-mini" data-onb="test">🔔 Test</button>'],
            ['join', !!o.join, 'Join the Chain Watch queue', 'Take a turn keeping the chain alive.', '<button type="button" class="hbs-btn hbs-mini" data-onb="chain">Open ⛓ Chain</button>'],
            ['crime', !!o.crime, 'Join an organized crime', as && !as.joined ? `You're assigned: ${esc(as.crime)} · ${esc(as.position)}${as.kind === 'live' ? '' : ' (waiting to be spawned)'}.` : 'Take a seat in a faction OC.', ocBtn]];
        const left = steps.filter(x => !x[1]).length;
        if (!left) { store.set(K.onb, { done: true }); return ''; }
        return `<div class="hbs-card hbs-onb"><div class="hbs-r1"><span class="hbs-name">✅ Getting started</span><span class="hbs-chip">${steps.length - left}/${steps.length}</span></div>
            ${steps.map(([k, ok, t, sub, btn]) => `<div class="hbs-onbrow${ok ? ' ok' : ''}"><i>${ok ? '✓' : '○'}</i><span><b>${t}</b><small>${sub}</small></span>${ok ? '' : btn}</div>`).join('')}</div>`;
    }
    function homeBind() {
        bodyEl.querySelectorAll('[data-onb]').forEach(x => x.addEventListener('click', () => { const a = x.dataset.onb;
            if (a === 'test') { cwAction('test'); toast('🔔 Test alert sent - it comes back from the Hub in a moment.'); setTimeout(() => { if (tab === 'home') render(true); }, 300); return; }
            tab = a; store.set(K.tab, tab); render(); })); const b = bodyEl.querySelector('[data-homeme]'); if (b) b.addEventListener('click', () => { tab = 'me'; store.set(K.tab, tab); render(); }); }
    async function homeHtml() {
        // [HB Suite] Hub API — op "live" what "myoc" (your crime + plan seat) and op "mine" (your reliability)
        const myP = live('myoc').catch(() => null);
        const minP = mineCache && Date.now() - mineCache.at < 600000 ? Promise.resolve(mineCache.d)
            : hub('mine').then(d => { mineCache = { at: Date.now(), d }; return d; }).catch(() => null);
        const pend = [], peek = (area, path) => { const k = area + ':' + path;
            if (cache[k] && Date.now() - cache[k].at < CACHE_MS) return cache[k].data;
            if (optMiss[k] && Date.now() - optMiss[k] < 60000) return null;
            pend.push(readOpt(area, path)); return null; };
        const soon = p => Promise.race([p, new Promise(r => setTimeout(() => r(undefined), 150))]).then(v => { if (v === undefined) { pend.push(p); return null; } return v; });
        const H = peek('m', 'db/home.json'), F = peek('m', 'db/script_feed.json'), W = peek('m', 'db/wars.json'), C = peek('m', 'db/chains.json'),
              O = peek('m', 'db/crimes.json'), PO = peek('m', 'db/payouts.json');
        const [N, MY, MINE] = await Promise.all([names(), soon(myP), soon(minP)]);
        if (pend.length) Promise.all(pend.map(p => p.catch(() => null))).then(() => { if (tab === 'home' && !collapsed && !showSettings) render(true); });
        let out = onbHtml();
        const m = N.byId[me.id] || {}, row = H && H.m ? H.m[String(me.id)] : null, A = (H && H.avg) || {};
        out += `<div class="hbs-card hbs-gold"><div class="hbs-r1"><span class="hbs-name">${esc(me.name)} <span style="opacity:.5;font-weight:normal">[${me.id}]</span></span>
            <span class="hbs-chip">${esc(me.position || m.position || 'Member')}</span></div>
            <div class="hbs-sub">${[m.level != null ? 'Level ' + m.level : '', (row && row[0] != null ? row[0] : m.days) != null ? int(row && row[0] != null ? row[0] : m.days) + ' days in the faction' : '']
                .filter(Boolean).join(' · ')}</div>`;
        const cmH = out.length;
        {
            const [, wh, gym, oc] = row || [], t = m.t || {};
            const grp = (title, rows) => rows.filter(Boolean).length ? `<div class="hbs-grp"><div class="t">${title}</div>${tiles(rows)}</div>` : '';
            out += `<div class="hbs-grps">`
                + grp('⚔ Wars', [row ? [wh == null ? '-' : int(wh), 'Last war hits', wh == null ? 'not in it' : vsAvg(wh, A.war)] : null,
                                 [int(t.war_hits), 'War hits', `${int(t.wars)} wars`]])
                + `<div class="hbs-grp hbs-grp2"><div><div class="t">⛓ Chains</div>${tiles([[int(t.chain_hits), 'Chain hits', `${int(t.chains)} chains`]])}</div>
                    ${row ? `<div><div class="t">🏋 Gym</div>${tiles([[big(gym), 'Gym this month', vsAvg(gym, A.gym)]])}</div>` : ''}</div>`
                + grp('🕵 OCs', [row ? [oc == null ? '-' : oc + '%', 'OC success', oc == null ? 'no crimes' : vsAvg(oc, A.oc)] : null,
                                [`${int(t.crimes_ok)}/${int(t.crimes)}`, 'OCs passed'], [shortMoney(t.crime_money), 'OC earnings']])
                + `</div><div class="hbs-actions"><button type="button" class="hbs-btn" data-homeme>Full profile</button>
                <a class="hbs-btn hbs-ghost" href="${HUB_BASE}/m/member.html?id=${me.id}" target="_blank" rel="noopener">On the Hub</a></div>`;
        }
        if (CMP()) { const g = out.slice(cmH), i = g.indexOf('<div class="hbs-actions">'), t = m.t || {};
            out = out.slice(0, cmH) + (i >= 0 ? g.slice(i) : '') + '</div>'
                + cFold('homestats', '📊', 'Your stats', `<small>${int(t.war_hits)} war hits · ${int(t.chain_hits)} chain hits${row && row[3] != null ? ` · OC ${row[3]}%` : ''}</small>`, i >= 0 ? g.slice(0, i) : g, false); }
        else out += '</div>';
        {
            const cur = MY && MY.current, as = MY && MY.assignment;
            const mineOC = ((O && O.crimes) || []).filter(c => (c.m || []).includes(me.id));
            const last = mineOC.length ? mineOC[mineOC.length - 1] : null, okN = mineOC.filter(c => String(c.status).toLowerCase() === 'successful').length;
            const earned = mineOC.reduce((a, c) => a + num(c.share), 0);
            let body = '';
            if (cur) {
                const eta = cur.ready_at ? new Date(cur.ready_at * 1000).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '';
                body += `<div class="hbs-li"><span>In <a href="${OC_LINK(cur.crime_id)}"><b>${esc(cur.crime)}</b></a> as <b>${esc(cur.position)}</b>${cur.rate != null ? ` · ${cur.rate}%` : ''}<br>
                    <span style="opacity:.75">${esc(cur.status)} · ${cur.filled}/${cur.seats} filled · your planning ${Math.round(cur.progress)}%${eta ? ' · ready ' + eta : ''}</span></span></div>`;
            }
            if (as && !as.joined && !(cur && String(cur.crime_id) === String(as.crime_id))) {
                body += `<div class="hbs-li"><span>📌 Assigned: <b>${esc(as.crime)}</b> · <b>${esc(as.position)}</b>${as.rate != null ? ` · ${Math.round(as.rate)}%` : ''}
                    ${as.leave ? `<br><span style="color:#e8be5a">↪ Leave ${esc(as.leave.crime)} first - your planning there hasn't started</span>` : ''}
                    ${as.kind !== 'live' ? '<br><span style="opacity:.75">Waiting for this crime to be spawned</span>' : ''}</span>
                    ${as.kind === 'live' && as.crime_id ? `<a class="hbs-btn" href="${OC_LINK(as.crime_id)}">Join</a>` : ''}</div>`;
            }
            if (!cur && !(as && !as.joined)) body += '<div class="hbs-hint">Not in a crime and nothing assigned right now.</div>';
            body += tiles([[mineOC.length ? `${okN}/${mineOC.length}` : '-', 'Crimes passed'],
                [mineOC.length ? Math.round(100 * okN / mineOC.length) + '%' : '-', 'Success rate'], [earned ? shortMoney(earned) : '-', 'OC earnings'],
                last ? [esc(last.name || '?'), 'Last crime', `${fmtD(last.t)} · <span class="${String(last.status).toLowerCase() === 'successful' ? 'hbs-good' : 'hbs-bad'}">${esc(last.status || '')}</span>`] : null]);
            const asWait = !!(as && !as.joined && !(cur && String(cur.crime_id) === String(as.crime_id)));
            out += cmCard('homeoc', '🕵', 'My organized crime', asWait ? `<span class="hbs-foldme">📌 ${esc(as.crime)}</span>` : cur ? `<small>${esc(cur.crime)} · ${Math.round(cur.progress)}%</small>` : '<small>not in a crime</small>', asWait,
                `<div class="hbs-card"><div class="hbs-r1"><span class="hbs-name">🕵 My organized crime</span></div>${body}</div>`);
        }
        {
            const wars = ((W && W.wars) || []).slice().sort((a, b) => num(a.end) - num(b.end)), w = wars[wars.length - 1];
            if (w) {
                const ranked = (w.m || []).slice().sort((a, b) => b[1] - a[1]), x = (w.m || []).find(r => r[0] === me.id);
                const avg = ranked.length ? ranked.reduce((a, r) => a + r[1], 0) / ranked.length : 0;
                const pay = ((PO && PO.payouts) || []).find(p => p.end === w.end && (p.m || []).some(r => r[0] === me.id));
                const paid = pay ? pay.m.find(r => r[0] === me.id) : null;
                out += cmCard('homewar', '⚔', 'Latest war', `<small>vs ${esc(w.opponent || '?')} · ${x ? int(x[1]) + ' hits' : 'not in it'}${paid && paid[1] ? ' · ' + shortMoney(paid[1]) : ''}</small>`, false,
                    `<div class="hbs-card"><div class="hbs-r1"><span class="hbs-name">⚔ Latest war · vs ${esc(w.opponent || '?')}</span><span class="hbs-chip">${fmtD(w.end)}</span></div>`
                    + (x ? tiles([[int(x[1]), 'Your hits', `#${ranked.findIndex(r => r[0] === me.id) + 1} of ${ranked.length}<br>${vsAvg(x[1], avg)}`], [int(x[2]), 'Respect'],
                                  [int(x[3]), 'Assists'], [paid && paid[1] ? shortMoney(paid[1]) : (w.payout ? '-' : 'pending'), 'Your payout']])
                         : '<div class="hbs-hint">You weren\'t in this war.</div>')
                    + `<div class="hbs-hint">Faction: ${int(w.hits)} hits · ${w.attackers}/${w.members} members hit${w.termed ? ' · 🤝 termed' : ''}${x && x[1] < MIN_HITS ? ` · <span class="hbs-bad">under ${MIN_HITS} hits</span>` : ''}</div>`
                    + `<div class="hbs-actions">${w.report ? `<a class="hbs-btn hbs-ghost" href="${esc(w.report)}" target="_blank" rel="noopener">📄 Report</a>` : ''}</div></div>`);
            }
        }
        {
            const chains = ((C && C.chains) || []).slice().sort((a, b) => num(a.end) - num(b.end)), c = chains[chains.length - 1];
            if (c) {
                const x = (c.m || []).find(r => r[0] === me.id), ranked = (c.m || []).slice().sort((a, b) => b[1] - a[1]);
                out += cmCard('homechain', '⛓', 'Latest chain', `<small>${int(c.length)} hits · ${x ? 'yours ' + int(x[1]) : 'you: none'}</small>`, false,
                    `<div class="hbs-card"><div class="hbs-r1"><span class="hbs-name">⛓ Latest chain · ${int(c.length)} hits</span><span class="hbs-chip">${fmtD(c.end)}</span></div>`
                    + (x ? tiles([[int(x[1]), 'Your hits', `#${ranked.findIndex(r => r[0] === me.id) + 1} of ${ranked.length}`], [int(x[2]), 'Respect'], [int(x[3]), 'Retals'],
                                  [c.length ? (100 * x[1] / c.length).toFixed(1) + '%' : '-', 'Of the chain']])
                         : '<div class="hbs-hint">You didn\'t hit in this chain.</div>') + '</div>');
            }
        }
        {
            const pick = (l, label) => { const x = ((F && F[l]) || [])[0]; return x ? [x, label] : null; };
            const T = [pick('newsletters', '📰 Newsletter'), pick('war_reports', '⚔ War report'), pick('chain_reports', '⛓ Chain report')].filter(Boolean);
            if (T.length && CMP()) out += cFold('homelatest', '📰', 'Latest', `<small>${T.map(([, label]) => label.replace(/^\S+\s/, '')).join(' · ')}</small>`,
                `<div class="hbs-latest">${T.map(([x, label]) => `<a class="hbs-lt" href="${esc(x.url)}" target="_blank" rel="noopener">
                <span class="k">${label}</span>${x.img ? `<img src="${esc(x.img)}" alt="" loading="lazy">` : ''}<b>${esc(x.title || '')}</b><small>${esc(x.sub || '')}</small></a>`).join('')}</div>
                <div class="hbs-hint">More in 📰 News.</div>`, false);
            else if (T.length) out += sec('Latest') + `<div class="hbs-latest">${T.map(([x, label]) => `<a class="hbs-lt" href="${esc(x.url)}" target="_blank" rel="noopener">
                <span class="k">${label}</span>${x.img ? `<img src="${esc(x.img)}" alt="" loading="lazy">` : ''}<b>${esc(x.title || '')}</b><small>${esc(x.sub || '')}</small></a>`).join('')}</div>
                <div class="hbs-hint">More in 📰 News.</div>`;
        }
        return out;
    }
    async function alertsHtml() {
        const N = await names();
        let out = '';
        if (me.leader) {
            const [At, P] = await Promise.all([readOpt('l', 'db/attention.json'), readOpt('l', 'db/private.json')]);
            // [HB Suite] Hub API — op "live" what "spawn" (leaders): spawn alerts, OC alerts, Notify list
            const S = await live('spawn').catch(() => null);
            const lines = [];
            await rsSyncSettings();
            { const SN = store.get(K.rsSetNote, null);
              if (SN && Date.now() - SN.at < 48 * 3600e3) lines.push(`⚙ Recruit settings changed by <b>${esc(SN.by)}</b> (${fmtDT(Math.floor(SN.at / 1000))} ${tzTagH()})${(SN.diff || []).length ? ': ' + esc(SN.diff.slice(0, 4).join(', ')) + (SN.diff.length > 4 ? '…' : '') : ''}`); }
            (At ? At.unpaid || [] : []).forEach(w => lines.push(`💰 No payout yet: vs ${esc(w.opponent || '?')} (${fmtD(w.end)})`));
            (At ? At.recruits || [] : []).forEach(r => lines.push(`🧑 Recruit ${esc(r.name)} idle ${r.idle} days`));
            const OA = (S && S.oc_alerts) || {};
            (OA.crimes || []).forEach(x => lines.push(`📉 <b>${esc(x.crime)}</b> #${esc(x.crime_id)} - team success ${esc(x.success)}%, below the ${esc(x.target)}% target`));
            (OA.roles || []).slice(0, 8).forEach(x => lines.push(`🎯 <b>${esc(x.name)}</b> joined ${esc(x.position)} in ${esc(x.crime)} at ${esc(x.rate)}% - ${esc(x.why)}`));
            ((S && S.alerts) || []).slice(0, 6).forEach(a => lines.push(`🧪 Spawn <b>${esc(a.crime)}</b>${a.difficulty != null ? ` D${esc(a.difficulty)}` : ''}${a.pay_day ? ` · $${big(a.pay_day)}/day each` : ''} - pass rates too high for every open crime${(a.names || []).length ? `: ${esc(a.names.filter(Boolean).join(', '))}` : ''}`));
            const bad = P && P.members ? Object.entries(P.members).filter(([id, v]) => v && v.reliability && v.reliability.score != null && v.reliability.score < 55
                && (N.byId[id] || {}).current).sort((a, b) => a[1].reliability.score - b[1].reliability.score) : [];
            const REL_MAX = 12;
            relTrack(bad);
            const relNewList = bad.filter(([id]) => relWhy[id]);
            const relHtml = !bad.length ? '' : sec(`🛡 Low reliability · ${bad.length}`)
                + `<div class="hbs-hint">Score under 55 (grade E or F), worst first. War = wars with ${MIN_HITS}+ hits · Chains = large chains hit · Idle = days since last action.</div>`
                + (relNewList.length ? `<div class="hbs-relnew">🔻 <b>New since you last looked:</b> ${relNewList.map(([id, v]) => `<a href="#" data-prof="${id}">${esc(nameOf(N, id))}</a> ${relWhyText(id)} (${int(v.reliability.score)})`).join(' · ')}</div>` : '')
                + `<div class="hbs-rel">` + relNewList.concat(bad.filter(([id]) => !relWhy[id])).slice(0, REL_MAX).map(([id, v]) => { const R = v.reliability, g = relG(R.score), D = R.detail || {};
                    const why = [D.wars_in ? `War ${int(D.wars_hit)}/${int(D.wars_in)}` : '', D.chains_elig ? `Chains ${int(D.chains_hit)}/${int(D.chains_elig)}` : '',
                        D.idle_days != null && D.idle_days >= 1 ? `Idle ${int(D.idle_days)} d` : ''].filter(Boolean).join(' · ');
                    const W = relWhy[id];
                    return `<div class="hbs-relrow${W ? ' new' : ''}"><b class="g" style="background:${g[1]}">${g[0]}</b>
                        <span class="n"><a href="#" data-prof="${id}">${esc(nameOf(N, id))}</a>${W ? `<em>${W.from == null ? 'NEW' : '▼ ' + GRADES[W.from][1] + '→' + GRADES[W.to][1]}</em>` : ''}<small>${why || 'not enough detail yet'}</small></span>
                        <span class="sc"><b style="color:${g[1]}">${int(R.score)}</b><i><u style="width:${Math.max(0, Math.min(100, num(R.score)))}%;background:${g[1]}"></u></i></span></div>`; }).join('') + '</div>'
                + (bad.length > REL_MAX ? `<div class="hbs-hint">+${bad.length - REL_MAX} more - 👥 Members → sort by Lowest reliability.</div>` : '');
            const NT = (S && S.oc_notify) || [];
            notifyList = NT; notifyTplS = (S && S.notify_tpl) || null;
            const todo = NT.filter(x => !(x.contacted && String(x.contacted.crime_id) === String(x.crime_id) && x.contacted.role === x.position)).length;
            const n = lines.length + bad.length + todo; alertN = n;
            alertKeys = lines.map(t => String(t).replace(/<[^>]+>/g, '')).concat(NT.filter(x => !(x.contacted && String(x.contacted.crime_id) === String(x.crime_id) && x.contacted.role === x.position))
                .map(x => 'ntf:' + x.pid + ':' + x.crime_id + ':' + x.position));
            out += `<div class="hbs-card ${n ? 'hbs-red' : 'hbs-green'}"><div class="hbs-r1"><span class="hbs-name">🔔 Leader alerts</span><span class="hbs-chip">${n}</span></div>`
                + (n ? '' : '<div class="hbs-hint">✅ Nothing needs you right now.</div>')
                + lines.map(t => `<div class="hbs-li"><span>${t}</span></div>`).join('')
                + relHtml
                + (NT.length ? sec(`📣 Notify (no OC script) · ${todo} to do`) + `<div class="hbs-hint">They can't see their OC assignment. Each button copies the message and opens Torn - paste and send. 💬 / ✉️ / ✓ log the contact for every leader (here and on the Hub site).</div>`
                    + NT.slice(0, 12).map((x, i) => `<div class="hbs-li"><span><b>${esc(x.name)}</b><br><span style="opacity:.75">${esc(x.crime)} #${esc(x.crime_id)} · ${esc(x.position)}</span><br><span data-ntfst="${i}">${ntfBadge(x)}</span></span>
                        <span style="white-space:nowrap"><button class="hbs-btn" data-ntf="chat" data-i="${i}">💬</button> <button class="hbs-btn" data-ntf="mail" data-i="${i}">✉️</button> <button class="hbs-btn" data-ntf="sent" data-i="${i}">✓</button></span></div>`).join('')
                    + `<div class="hbs-hint" data-ntfmsg>Full list: OC Management → 📣 Notify on the Hub site.</div>` : '')
                + (lines.length ? '<div class="hbs-hint">Details: OC Management / War reports on the Hub site.</div>' : '') + '</div>';
        }
        return out;
    }

    let lbPeriod = 'month', lbSec = 'war', lbMonth = '';
    const GS = [['gymstrength', 'Strength'], ['gymspeed', 'Speed'], ['gymdefense', 'Defense'], ['gymdexterity', 'Dexterity']];
    async function boardsHtml() {
        const [N, W, C, O, G] = await Promise.all([names(), readFile('m', 'db/wars.json'), readFile('m', 'db/chains.json'),
                                                    readFile('m', 'db/crimes.json'), readFile('m', 'db/gym.json')]);
        const cur = {}; N.list.forEach(m => { if (m.current) cur[m.id] = 1; });
        const ms = new Set(Object.keys(G.history || {}));
        (W.wars || []).forEach(w => w.end && ms.add(monthOf(w.end))); (C.chains || []).forEach(c => c.end && ms.add(monthOf(c.end)));
        (O.crimes || []).forEach(c => c.t && ms.add(monthOf(c.t)));
        const months = [...ms].filter(m => m < thisMonth()).sort().reverse();
        if (!lbMonth || !months.includes(lbMonth)) lbMonth = months[0] || '';
        const period = lbPeriod === 'all' ? { all: true } : { month: lbPeriod === 'past' ? lbMonth : thisMonth() };
        const onlyCur = lbPeriod !== 'past';
        const inP = t => period.all || (t && monthOf(t) === period.month);
        const add = (o, id, v) => { if (v) o[id] = (o[id] || 0) + v; };
        const board = (title, vals, fmt) => {
            fmt = fmt || int;
            const rows = Object.entries(vals).filter(([id, v]) => v > 0 && !(N.byId[id] || {}).nolb && (!onlyCur || cur[id])).sort((a, b) => b[1] - a[1]);
            const tot = rows.reduce((a, r) => a + r[1], 0), top = rows.length ? rows[0][1] : 1;
            const row = ([id, v], i) => `<div class="r r${i + 1}${Number(id) === me.id ? ' me' : ''}" data-prof="${id}"><span class="rk">${i + 1}</span>
                <span class="nm"><span>${esc(nameOf(N, id))}${cur[id] ? '' : ' <small>left</small>'}${Number(id) === me.id ? ' <small>you</small>' : ''}</span><i><em style="width:${Math.max(2, Math.round(100 * v / top))}%"></em></i></span>
                <span class="v">${fmt(v)}</span></div>`;
            const mine = rows.findIndex(([id]) => Number(id) === me.id), fk = 'lbc:' + title, shut = !!open[fk];
            return `<div class="hbs-lb"><div class="h" data-toggle="${esc(fk)}" style="cursor:pointer"><b>${shut ? '▸' : '▾'} ${title}</b><span>${shut && mine >= 0 ? `you #${mine + 1} · ` : ''}${rows.length} member${rows.length === 1 ? '' : 's'} · total ${fmt(tot)}</span></div>` +
                (shut ? '' : rows.length ? rows.slice(0, 10).map(row).join('') + (mine >= 10 ? '<div class="gap">⋯</div>' + row(rows[mine], mine) : '')
                    : '<div class="none">Nothing this period.</div>') + '</div>';
        };
        let out = chips('lbp', [['month', 'This month'], ['all', 'All time'], ['past', 'Past months']], lbPeriod);
        if (lbPeriod === 'past') out += `<div class="hbs-row"><select class="hbs-input" data-lbm>${months.map(m => `<option value="${m}"${m === lbMonth ? ' selected' : ''}>${monthName(m)}</option>`).join('')}</select></div>`;
        out += chips('lbs', [['war', '⚔ War'], ['chain', '⛓ Chain'], ['oc', '🕵 OC'], ['gym', '🏋 Gym']], lbSec);
        out += `<div class="hbs-hint">${period.all ? 'All time on record' : monthName(period.month) + (lbPeriod === 'month' ? ' (so far)' : '')} · ${onlyCur ? 'current members' : 'everyone who took part'} · top 10</div>`;
        if (lbSec === 'war') {
            const wh = {}, wr = {}, wn = {};
            (W.wars || []).filter(w => inP(w.end)).forEach(w => w.m.forEach(x => { add(wh, x[0], x[1]); add(wr, x[0], x[2]); if (x[1] > 0) add(wn, x[0], 1); }));
            out += board('War hits', wh) + board('War respect', wr) + board('Wars hit', wn);
        } else if (lbSec === 'chain') {
            const ch = {}, cr = {}, crt = {};
            (C.chains || []).filter(c => inP(c.end)).forEach(c => c.m.forEach(x => { add(ch, x[0], x[1]); add(cr, x[0], x[2]); add(crt, x[0], x[3]); }));
            out += board('Chain hits', ch) + board('Chain respect', cr) + board('Retaliations', crt);
        } else if (lbSec === 'oc') {
            const op = {}, oe = {};
            (O.crimes || []).filter(c => inP(c.t) && String(c.status).toLowerCase() === 'successful').forEach(c => (c.m || []).forEach(id => { add(op, id, 1); add(oe, id, c.share || 0); }));
            out += board('Crimes passed', op) + board('Crime earnings', oe, shortMoney);
        } else {
            let g = {};
            if (period.all) g = G.all || {};
            else if (period.month === G.month) g = G.month_gain || {};
            else { const h = (G.history || {})[period.month] || {}; Object.entries(h).forEach(([id, arr]) => { g[id] = {}; GS.forEach(([k], j) => { g[id][k] = arr[j] || 0; }); }); }
            const gt = {}, per = {}; GS.forEach(([k]) => { per[k] = {}; });
            Object.entries(g).forEach(([id, st]) => GS.forEach(([k]) => { add(per[k], id, st[k] || 0); add(gt, id, st[k] || 0); }));
            out += board('Total energy', gt) + GS.map(([k, l]) => board(l, per[k])).join('');
        }
        return out;
    }
    function boardsBind() {
        bindChips('lbp', v => { lbPeriod = v; });
        bindChips('lbs', v => { lbSec = v; });
        const s = bodyEl.querySelector('[data-lbm]'); if (s) s.onchange = () => { lbMonth = s.value; render(); };
    }

    let memberFilter = '', memberSort = 'name';
    async function membersHtml() {
        if (profileId) return profileHtml(profileId, false);
        const N = await names();
        const P = me.leader ? await readOpt('l', 'db/private.json') : null;
        const PM = (P && P.members) || {};
        const SH = P ? null : await readOpt('m', 'db/optin_shared.json');
        const statsOf = id => {
            const o = P ? (PM[id] || {}).optin : SH && SH.members ? SH.members[id] : null;
            const last = x => x && x.s && x.s.length ? x.s[x.s.length - 1] : null;
            const b = last(o && o.bs), w = last(o && o.ws);
            const via = P ? ((PM[id] || {}).optin || {}).via || null : null;
            return { bs: b ? { tot: b[1] + b[2] + b[3] + b[4], str: b[1], def: b[2], spd: b[3], dex: b[4], day: b[0] } : null,
                     ws: w ? { tot: w[1] + w[2] + w[3], man: w[1], int: w[2], end: w[3], day: w[0] } : null, via };
        };
        const ST = {}; N.list.forEach(m => { if (m.current) ST[m.id] = statsOf(m.id); });
        let list = N.list.filter(m => m.current);
        if (memberFilter) list = list.filter(m => String(m.name).toLowerCase().includes(memberFilter) || String(m.id) === memberFilter);
        const rel = m => { const r = (PM[m.id] || {}).reliability; return r && r.score != null ? r.score : -1; };
        const S = { name: (a, b) => String(a.name).localeCompare(String(b.name)), days: (a, b) => num(b.days) - num(a.days),
                    level: (a, b) => num(b.level) - num(a.level), hits: (a, b) => num((b.t || {}).war_hits) - num((a.t || {}).war_hits),
                    rel: (a, b) => rel(b) - rel(a), low: (a, b) => rel(a) - rel(b),
                    bs: (a, b) => num((ST[b.id].bs || {}).tot) - num((ST[a.id].bs || {}).tot),
                    ws: (a, b) => num((ST[b.id].ws || {}).tot) - num((ST[a.id].ws || {}).tot) };
        if (!S[memberSort] || (!P && (memberSort === 'rel' || memberSort === 'low'))) memberSort = 'name';
        list.sort(S[memberSort]);
        const opts = [['name', 'Name'], ['days', 'Days in faction'], ['level', 'Level'], ['hits', 'War hits'], ['bs', 'Battle stats'], ['ws', 'Work stats']]
            .concat(P ? [['rel', 'Best reliability'], ['low', 'Lowest reliability']] : []);
        const head = `<div class="hbs-bar" style="padding:7px 0 0">
            <input class="hbs-input" data-mf placeholder="Search members…" value="${esc(memberFilter)}" style="flex:1">
            <select class="hbs-input" data-ms>${opts.map(([v, l]) => `<option value="${v}"${memberSort === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
            <div class="hbs-hint">${list.length} current members${P && P.averages ? ` · faction reliability ${relG(P.averages.reliability)[0]} · ${P.averages.reliability}` : ''} · tap a member for their profile</div>`;
        return head + list.map(m => {
            const R = (PM[m.id] || {}).reliability, sc = R ? R.score : null, G = sc == null ? ['', '#33373f'] : relG(sc);
            const chip = P ? (sc == null ? '<span class="hbs-chip" style="color:#9aa0a8">Not enough data</span>' : `<span class="hbs-chip" style="color:${G[1]}">${G[0]} · ${sc}</span>`)
                : `<span class="hbs-chip">${int((m.t || {}).war_hits)} war hits</span>`;
            return `<div class="hbs-card" style="${P ? 'border-left-color:' + G[1] : ''}"><div class="hbs-r1" data-prof="${m.id}"><span class="hbs-name">${esc(m.name)}</span>
                <span style="font-size:10.5px;opacity:.6;white-space:nowrap">${esc(m.position || '')}</span>${chip}</div>
                <div class="hbs-sub">${[m.level != null ? 'Level ' + m.level : '', m.days != null ? m.days + ' days' : '', m.last_action ? 'active ' + ago(m.last_action) : ''].filter(Boolean).join(' · ')}</div>
                ${statRows(ST[m.id])}</div>`;
        }).join('');
    }
    function statRows(st) {
        if (!st || (!st.bs && !st.ws)) return '';
        const row = (ic, lab, tot, parts, src) => `<div class="hbs-msr"><span class="k">${ic} ${lab}${src && src.length ? `<span class="hbs-src">${srcIcons(src)}</span>` : ''}</span>` + (tot == null
            ? '<span class="na">not shared</span>'
            : `<b class="t">${big(tot)}</b>` + [0, 1, 2, 3].map(i => parts[i]
                ? `<span class="p"><i>${parts[i][0]}</i><b>${big(parts[i][1])}</b></span>` : '<span class="p e"></span>').join('')) + '</div>';
        return '<div class="hbs-ms">' +
            row('💪', 'Battle', st.bs ? st.bs.tot : null, st.bs ? [['STR', st.bs.str], ['DEF', st.bs.def], ['SPD', st.bs.spd], ['DEX', st.bs.dex]] : [], st.via && st.via.bs) +
            row('🧰', 'Work', st.ws ? st.ws.tot : null, st.ws ? [['MAN', st.ws.man], ['INT', st.ws.int], ['END', st.ws.end]] : [], st.via && st.via.ws) + '</div>';
    }
    function membersBind() {
        if (profileId) { profileBind(profileId); return; }
        const f = bodyEl.querySelector('[data-mf]'), s = bodyEl.querySelector('[data-ms]');
        if (f) {
            let t = null;
            f.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { memberFilter = f.value.trim().toLowerCase(); render().then(() => {
                const n = bodyEl.querySelector('[data-mf]'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }); }, 250); });
        }
        if (s) s.addEventListener('change', () => { memberSort = s.value; render(); });
    }

    async function profileHtml(pid, own) {
        pid = Number(pid);
        const [N, W, C, O, PO, SH] = await Promise.all([names(), readFile('m', 'db/wars.json'), readFile('m', 'db/chains.json'),
            readFile('m', 'db/crimes.json'), readFile('m', 'db/payouts.json'), readOpt('m', 'db/optin_shared.json')]);
        const m = N.byId[pid];
        if (!m) return '<div class="hbs-empty">That member isn\'t on the Hub.</div>';
        let pv = null, P = null;
        if (own) { try { pv = await hub('mine'); } catch (e) { pv = null; } }
        else if (me.leader) { P = await readOpt('l', 'db/private.json'); pv = P && P.members ? P.members[pid] || {} : null; }
        const t = m.t || {}, cur = N.list.filter(x => x.current);
        const avg = f => { const v = cur.map(f).filter(x => x != null && Number.isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
        const hpw = x => x.t && x.t.wars ? x.t.war_hits / x.t.wars : null, hpc = x => x.t && x.t.chains ? x.t.chain_hits / x.t.chains : null;
        const myW = hpw(m), myC = hpc(m), aW = avg(hpw), aC = avg(hpc);
        let out = `${own ? '' : '<div class="hbs-bar" style="padding:7px 0 0"><button type="button" class="hbs-btn hbs-ghost" data-back>← ' + (profileBack && tabOk(profileBack) ? 'Back' : 'Members') + '</button></div>'}
            <div class="hbs-card hbs-gold"><div class="hbs-r1"><span class="hbs-name">${esc(m.name)} <span style="opacity:.5;font-weight:normal">[${pid}]</span></span>
            <span class="hbs-chip">${esc(m.position || (m.current ? '' : 'Former member'))}</span></div>
            <div class="hbs-sub">${[m.level != null ? 'Level ' + m.level : '', m.days != null ? m.days + ' days in the faction' : '', m.last_action ? 'active ' + ago(m.last_action) : ''].filter(Boolean).join(' · ')}</div>
            <div class="hbs-actions"><a class="hbs-btn hbs-ghost" href="https://www.torn.com/profiles.php?XID=${pid}">Torn profile</a>
            <a class="hbs-btn hbs-ghost" href="${HUB_BASE}/m/member.html?id=${pid}" target="_blank" rel="noopener">Hub profile</a>
            ${own ? `<a class="hbs-btn hbs-ghost" href="${HUB_BASE}/m/my-data.html" target="_blank" rel="noopener">My data & sharing</a>` : ''}</div></div>`;
        out += sec('📊 Totals') + tiles([[int(t.war_hits), 'War hits', `${int(t.wars)} wars`], [myW == null ? '-' : myW.toFixed(1), 'Hits / war', vsAvg(myW, aW)],
            [int(t.chain_hits), 'Chain hits', `${int(t.chains)} chains`], [myC == null ? '-' : myC.toFixed(1), 'Hits / chain', vsAvg(myC, aC)],
            [int(t.rets), 'Retaliations'], [`${int(t.crimes_ok)}/${int(t.crimes)}`, 'OCs passed'], [shortMoney(t.crime_money), 'OC earnings'],
            [shortMoney(t.paid), 'War payouts', `${int(t.payouts)} paid`]]);
        const R = pv && pv.reliability;
        if (R) {
            const WT = (P && P.weights) || pv.weights || { war: 55, chains: 25, activity: 20 }, D = R.detail || {};
            const pt = (k, mx) => R.parts && R.parts[k] != null ? `${R.parts[k]} / ${mx}` : 'not enough data';
            const G = R.score == null ? null : relG(R.score);
            out += sec('🛡 Reliability') + `<div class="hbs-card" style="border-left-color:${G ? G[1] : '#33373f'}"><div class="hbs-r1">
                <span class="hbs-name" style="color:${G ? G[1] : '#9aa0a8'};font-size:15px">${G ? G[0] + ' · ' + R.score + ' / 100' : 'Not enough data yet'}</span></div>
                ${kv([[`War (${MIN_HITS}+ hits in ${D.wars_hit || 0}/${D.wars_in || 0})`, pt('war', WT.war)], [`Large chains (${D.chains_hit || 0}/${D.chains_elig || 0})`, pt('chains', WT.chains)],
                      [`Activity (idle ${D.idle_days != null ? D.idle_days : '-'} d)`, pt('activity', WT.activity)]])}
                <div class="hbs-actions">${R.receipt ? `<button type="button" class="hbs-btn" data-rc="${pid}">🧾 Performance receipt</button>` : ''}
                ${me.leader && !own ? `<button type="button" class="hbs-btn hbs-ghost" data-lv="${pid}">🗓 Excused leave</button>` : ''}</div>
                <div data-rcbox="${pid}"></div><div data-lvbox="${pid}"></div></div>`;
        }
        const op = (pv && pv.optin) || (SH && SH.members && SH.members[pid]) || null;
        if (op && ((op.bs && op.bs.s && op.bs.s.length) || (op.ws && op.ws.s && op.ws.s.length))) {
            out += sec('💪 Battle and work stats');
            if (op.bs && op.bs.s.length) { const l = op.bs.s[op.bs.s.length - 1], tot = r => r[1] + r[2] + r[3] + r[4];
                out += tiles([[big(tot(l)), 'Battle total', gainTxt(op.bs.s, 30, tot)], [big(l[1]), 'Strength'], [big(l[2]), 'Defense'], [big(l[3]), 'Speed'], [big(l[4]), 'Dexterity']]); }
            if (op.ws && op.ws.s.length) { const l = op.ws.s[op.ws.s.length - 1], wt = r => r[1] + r[2] + r[3];
                out += tiles([[big(wt(l)), 'Work total', gainTxt(op.ws.s, 30, wt)], [big(l[1]), 'Manual labor'], [big(l[2]), 'Intelligence'], [big(l[3]), 'Endurance']]); }
            out += `<div class="hbs-hint">Shared ${own ? 'by you' : 'with ' + ((op.bs || op.ws || {}).share === 'faction' ? 'the faction' : 'leaders')}${own ? ' - change it on My data & sharing' : ''}.</div>`;
        }
        const via = pv && pv.optin && pv.optin.via;
        if (via && Object.values(via).some(v => v && v.length)) {
            const K2 = [['bs', '💪 Battle stats'], ['ws', '🧰 Work stats'], ['oc', '🕵️ OC pass rates'], ['cw', '⛓️ Chain timer']];
            out += sec('🔗 How ' + (own ? 'you share' : 'they share')) + K2.filter(([k]) => (via[k] || []).length)
                .map(([k, l]) => `<div class="hbs-li"><span>${l}</span><b style="font-weight:normal">${srcNames(via[k])}</b></div>`).join('');
        }
        const gm = m.gym_month || {}, ga = m.gym || {}, gsum = o => GS.reduce((a, [k]) => a + num(o[k]), 0);
        if (gsum(ga) || gsum(gm)) out += sec('🏋 Gym energy') + tiles([[big(gsum(gm)), 'This month'], [big(gsum(ga)), 'Since joining']]
            .concat(GS.map(([k, l]) => [big(num(gm[k])), l, 'this month'])));
        const pays = (PO.payouts || []).map(p => { const x = (p.m || []).find(r => r[0] === pid); return x && x[1] ? [p, x] : null; }).filter(Boolean).reverse().slice(0, 10);
        if (pays.length) out += sec('💰 War payouts') + pays.map(([p, x]) => `<div class="hbs-li"><span>${fmtD(p.end)} vs ${esc(p.opponent || '?')} · ${x[2]} hits</span><b>${money(x[1])}</b></div>`).join('');
        const wl = (W.wars || []).map(w => { const x = w.m.find(r => r[0] === pid); return x ? [w, x] : null; }).filter(Boolean).reverse().slice(0, 10);
        const ev = (title, when, stats, low) => `<div class="hbs-ev${low ? ' low' : ''}"><div class="t"><b>${title}</b><span>${when}</span></div>
            <div class="s">${stats.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}</div></div>`;
        if (wl.length) out += sec('⚔ Wars (last 10)') + wl.map(([w, x]) => ev('vs ' + esc(w.opponent || '?'), fmtD(w.end),
            [[x[1], 'Hits'], [int(x[2]), 'Respect'], [x[3], 'Assists'], [x[5], 'Outside']], x[1] < MIN_HITS)).join('')
            + `<div class="hbs-hint">Red = under ${MIN_HITS} war hits.</div>`;
        const cl = (C.chains || []).map(c => { const x = c.m.find(r => r[0] === pid); return x ? [c, x] : null; }).filter(Boolean).reverse().slice(0, 10);
        if (cl.length) out += sec('⛓ Chains (last 10)') + cl.map(([c, x]) => ev(int(c.length) + '-hit chain', fmtD(c.end),
            [[x[1], 'Hits'], [int(x[2]), 'Respect'], [x[3], 'Retals'], [c.length ? (100 * x[1] / c.length).toFixed(1) + '%' : '-', 'Of chain']])).join('');
        const ol = (O.crimes || []).filter(c => (c.m || []).includes(pid)).reverse().slice(0, 10);
        if (ol.length) out += sec('🕵 Organized crimes (last 10)') + ol.map(c => `<div class="hbs-li"><span>${fmtD(c.t)} · ${esc(c.name || '?')}</span>
            <b class="${String(c.status).toLowerCase() === 'successful' ? 'hbs-good' : 'hbs-bad'}">${esc(c.status || '')}${c.share ? ' · ' + shortMoney(c.share) : ''}</b></div>`).join('');
        if (me.leader && !own) {
            const A = await readOpt('l', 'db/armory.json'), r = A && A.members && A.members[pid] ? A.members[pid].r || [] : [];
            if (r.length) out += sec('🗄 Armory - latest') + r.slice(0, 8).map(([tm, it, cnt, kind]) =>
                `<div class="hbs-li"><span>${fmtDT(tm)} · ${esc((A.items || [])[it] || it)}${kind === 'r' ? ' · points refill' : ''}</span><b>×${cnt}</b></div>`).join('');
        }
        return out;
    }
    const gainTxt = (s, days, f) => {
        if (!s || s.length < 2) return '';
        const last = s[s.length - 1], want = new Date(Date.parse(last[0]) - days * 864e5).toISOString().slice(0, 10);
        const base = s.filter(x => x[0] <= want).pop() || s[0];
        return base === last ? '' : `<span class="hbs-up">+${big(f(last) - f(base))} / ${days} d</span>`;
    };
    function profileBind() {
        const b = bodyEl.querySelector('[data-back]'); if (b) b.onclick = closeProfile;
    }

    async function showReceipt(pid) {
        const box = bodyEl.querySelector(`[data-rcbox="${pid}"]`);
        if (!box) return;
        if (box.innerHTML) { box.innerHTML = ''; return; }
        const N = await names(), own = pid === me.id && tab === 'me';
        let pv, WT, RU;
        if (own) { const x = await hub('mine'); pv = x; WT = x.weights; RU = x.rules; }
        else { const P = await readFile('l', 'db/private.json'); pv = (P.members || {})[pid] || {}; WT = P.weights; RU = P.rules; }
        WT = WT || { war: 55, chains: 25, activity: 20 }; RU = RU || { min_hits: 5, min_wars: 3, min_chains: 2, chain_min: 100 };
        const m = N.byId[pid] || { id: pid, name: String(pid) }, R = pv.reliability;
        if (!R || !R.receipt) { box.innerHTML = '<div class="hbs-msg">No receipt data yet.</div>'; return; }
        const cv = drawReceipt(m, R, WT, RU);
        box.innerHTML = '';
        box.appendChild(cv);
        const subject = 'Faction Performance ' + new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
        const acts = el('div', 'hbs-actions');
        acts.innerHTML = (me.leader && !own ? `<button type="button" class="hbs-btn" data-a="msg">✉ Create Message</button>` : '') +
            `<button type="button" class="hbs-btn hbs-ghost" data-a="copy">📋 Copy image</button>
            <button type="button" class="hbs-btn hbs-ghost" data-a="dl">⬇ Download PNG</button>` +
            (me.leader && !own ? `<button type="button" class="hbs-btn hbs-ghost" data-a="subj">📋 Copy subject</button>` : '');
        box.appendChild(acts);
        const msg = el('div', 'hbs-msg', me.leader && !own ? 'Subject: ' + subject : ''); box.appendChild(msg);
        const pngP = () => new Promise(ok => cv.toBlob(ok, 'image/png'));
        const copyImg = () => {
            if (!navigator.clipboard || !window.ClipboardItem) return Promise.reject(new Error("Copying images isn't supported here - use Download PNG and attach it."));
            return navigator.clipboard.write([new ClipboardItem({ 'image/png': pngP() })]).catch(() => { throw new Error("Couldn't copy the image - use Download PNG."); });
        };
        const compose = `https://www.torn.com/messages.php#/p=compose&XID=${encodeURIComponent(pid)}`;
        const on = (a, f) => { const b = acts.querySelector(`[data-a="${a}"]`); if (b) b.onclick = f; };
        on('msg', () => {
            const cp = copyImg();
            window.open(compose, '_blank');
            cp.then(() => { msg.innerHTML = `Image copied ✓ - set the subject to <b>${esc(subject)}</b> (Copy subject) and paste the image into the message to <b>${esc(m.name)}</b>.`; },
                e => { msg.textContent = e.message + " Torn's message page was opened."; });
        });
        on('copy', () => copyImg().then(() => { msg.textContent = 'Image copied ✓'; }, e => { msg.textContent = e.message; }));
        on('dl', () => download(`receipt-${pid}-${new Date().toISOString().slice(0, 10)}.png`, cv.toDataURL('image/png')));
        on('subj', () => copyText(subject).then(ok => { msg.textContent = ok ? 'Subject copied ✓' : 'Subject: ' + subject; }));
    }

    async function showLeave(pid, note) {
        const box = bodyEl.querySelector(`[data-lvbox="${pid}"]`);
        if (!box) return;
        if (box.innerHTML && note == null) { box.innerHTML = ''; return; }
        box.innerHTML = '<div class="hbs-msg">Loading…</div>';
        try {
            const list = ((await readConfig()).leave || {})[String(pid)] || [];
            box.innerHTML = `<div class="hbs-sec">🗓 Excused leave</div>
                <div class="hbs-hint">Wars and large chains during these dates don't count for them. Dates are TCT (UTC), whole days.</div>
                ${list.length ? list.map((x, k) => `<div class="hbs-li"><span>${fmtD(x.from)} – ${fmtD(x.to)}${x.note ? ' · ' + esc(x.note) : ''}${x.by ? ' · ' + esc(x.by) : ''}</span>
                    <button type="button" class="hbs-btn hbs-ghost" data-lvdel="${pid}" data-k="${k}">Remove</button></div>`).join('') : '<div class="hbs-hint">No excused leave.</div>'}
                <div class="hbs-lvadd"><label>From<input class="hbs-input" type="date" data-lvf></label><label>To<input class="hbs-input" type="date" data-lvt></label></div>
                <input class="hbs-input" data-lvn maxlength="80" placeholder="Note (optional)" style="width:100%;margin-top:5px">
                <div class="hbs-actions"><button type="button" class="hbs-btn" data-lvadd="${pid}">Add leave</button></div>
                <div class="hbs-msg" data-lvmsg>${note || ''}</div>`;
            box._list = list;
        } catch (e) { box.innerHTML = `<div class="hbs-msg">${esc(e.message)}</div>`; }
    }

    // [HB Suite] leader action — excused leave add / remove (config "leave"), same as the Hub profile's editor.
    async function saveLeave(pid, mutate, what) {
        const box = bodyEl.querySelector(`[data-lvbox="${pid}"]`), msgEl = box && box.querySelector('[data-lvmsg]');
        if (msgEl) msgEl.textContent = 'Saving…';
        try {
            const N = await names(), m = N.byId[pid] || {};
            await editConfig(c => { c.leave = c.leave || {}; mutate(c.leave); if (!(c.leave[pid] || []).length) delete c.leave[pid]; },
                             `Excused leave: ${m.name || pid} [${pid}] ${what} (Hub script)`);
            await showLeave(pid, 'Saved ✓ - reliability and the receipt update in a few minutes.');
        } catch (e) { if (msgEl) msgEl.textContent = e.message; }
    }

    const WT_SLOTS = 10, WT_SLOTS_C = 6;
    const wt = { fid: 0, mem: null, memAt: 0, busy: false, err: '', ffBusy: false, ffErr: '', mineBusy: false, mineAt: 0, mineErr: '' };
    const warRange = () => { const r = store.get(K.warRange, null) || {}; let lo = Number(r.lo), hi = Number(r.hi);
        if (!(lo >= 1)) lo = 2; if (!(hi >= lo)) hi = Math.max(lo, 2.5); return { lo, hi }; };
    const warNow = () => (nowData && nowData.war && num(nowData.war.opponent_id)) ? nowData.war : null;
    const warVisible = () => tab === 'wars' && !collapsed && !showSettings && document.visibilityState === 'visible';
    function warHttp(url) {
        return new Promise((res, rej) => { try {
            if (typeof PDA_httpGet === 'function') { Promise.resolve(PDA_httpGet(url)).then(r => res((r && (r.responseText || r.response || r.body)) || ''), rej); return; }
            GM_xmlhttpRequest({ method: 'GET', url, timeout: 15000, onload: r => res(r.responseText), onerror: () => rej(new Error('no answer')), ontimeout: () => rej(new Error('timed out')) });
        } catch (e) { rej(e); } });
    }
    async function warLoad() {
        const W = warNow(); if (!W || !warVisible() || wt.busy) return;
        const fid = num(W.opponent_id);
        if (wt.fid !== fid) { wt.fid = fid; wt.mem = null; wt.memAt = 0; }
        if (!ffKey()) { warMine(); return; }
        if (Date.now() - wt.memAt < 30000) return;
        wt.busy = true; wt.memAt = Date.now();
        try {
            let r = null;
            // [HB Suite] Hub API — op "war_feed" get: the enemy faction list other Suites already read (no Torn call)
            try { r = await hub('war_feed', { do: 'get', fid }); } catch (e) { r = null; }
            if (r && r.members && !r.read) wt.mem = r.members;
            else {
                // [HB Suite] Torn API — War tab: the enemy faction's members + status (your key; only when the Hub's shared
                const d = await tornGet(`https://api.torn.com/faction/${fid}?selections=basic`);
                wt.mem = Object.entries((d && d.members) || {}).map(([pid, m]) => ({ pid: num(pid), name: m.name || '#' + pid, level: num(m.level),
                    state: String((m.status || {}).state || ''), until: num((m.status || {}).until), la: String((m.last_action || {}).status || '') }));
                // [HB Suite] Hub API — op "war_feed" put: that list, for every other Suite (names, levels, status - no key)
                if (r && r.read && wt.mem.length) hub('war_feed', { do: 'put', fid, members: wt.mem }).catch(() => {});
            }
            wt.err = '';
        } catch (e) { wt.err = e.message || 'Could not read the enemy faction.'; }
        wt.busy = false;
        warFF(); warMine();
        if (warVisible() && !cwBusy()) render(true);
    }
    async function warFF() {
        const key = ffKey(); if (!key || !wt.mem || !wt.mem.length || wt.ffBusy) return;
        const wst = num((warNow() || {}).start);
        let C = store.get(K.warFF, null) || {}; if (num(C.fid) !== wt.fid || num(C.war) !== wst) C = { fid: wt.fid, war: wst, at: 0, m: {} };
        const need = wt.mem.map(x => x.pid).filter(p => !C.m[p]);
        if (!need.length) return;
        wt.ffBusy = true;
        try {
            for (let i = 0; i < need.length; i += 200) {
                // [HB Suite] FFScouter API — War tab: fair fight + stat estimate for the enemy faction (your FFScouter key, this device)
                const rows = JSON.parse(await warHttp(`https://ffscouter.com/api/v1/get-stats?key=${encodeURIComponent(key)}&targets=${need.slice(i, i + 200).join(',')}`));
                if (!Array.isArray(rows)) throw new Error((rows && (rows.error || rows.message)) || 'FFScouter refused the request');
                rows.forEach(r => { if (r && r.player_id != null) C.m[r.player_id] = { ff: r.fair_fight != null ? Number(r.fair_fight) : null, est: r.bs_estimate_human || '' }; });
                need.slice(i, i + 200).forEach(p => { if (!C.m[p]) C.m[p] = { ff: null, est: '' }; });
            }
            C.at = Date.now(); store.set(K.warFF, C); wt.ffErr = '';
        } catch (e) { wt.ffErr = 'FFScouter: ' + (e.message || 'no answer'); }
        wt.ffBusy = false;
        if (warVisible() && !cwBusy()) render(true);
    }
    async function warMine() {
        const W = warNow(); if (!W || W.kind !== 'ongoing' || !num(W.start) || wt.mineBusy || Date.now() - wt.mineAt < 60000) return;
        const key = wt.fid + ':' + num(W.start);
        let M = store.get(K.warMine, null) || {}; if (M.key !== key) M = { key, hits: 0, resp: 0, last: num(W.start), ids: [] };
        wt.mineBusy = true; wt.mineAt = Date.now();
        try {
            const seen = new Set(M.ids || []), from0 = num(M.last);
            let from = from0, to = 0, maxTs = from0;
            for (let n = 0; n < 6; n++) {
                // [HB Suite] Torn API — War tab "Your war so far": your own attack log since the war began (War tab open, once a minute)
                const d = await tornGet(`https://api.torn.com/user/?selections=attacks&from=${from}${to ? '&to=' + to : ''}`);
                const L = Object.entries((d && d.attacks) || {}).map(([id, a]) => Object.assign({ id: String(id) }, a));
                let lo = Infinity, hi = 0;
                L.forEach(a => { const ts = num(a.timestamp_ended || a.timestamp_started); lo = Math.min(lo, ts); hi = Math.max(hi, ts);
                    if (seen.has(a.id)) return; seen.add(a.id);
                    if (num(a.attacker_id) === me.id && num(a.defender_faction) === wt.fid && num(a.respect_gain != null ? a.respect_gain : a.respect) > 0) { M.hits++; M.resp += num(a.respect_gain != null ? a.respect_gain : a.respect); } });
                maxTs = Math.max(maxTs, hi);
                if (L.length < 100) break;
                if (lo - from > Math.floor(Date.now() / 1000) - hi) to = lo; else from = hi;
            }
            M.last = maxTs; M.ids = [...seen].slice(-300); M.at = Date.now(); store.set(K.warMine, M); wt.mineErr = '';
        } catch (e) { wt.mineErr = e.message || 'Could not read your attacks.'; }
        wt.mineBusy = false;
        if (warVisible() && !cwBusy()) render(true);
    }
    setInterval(() => { if (warVisible()) warLoad(); }, 15000);
    const warStat = x => x.state === 'Okay' ? ['', 'Okay'] : x.state === 'Hospital' ? ['no', `Hosp <span data-until="${x.until}" data-zero="out">-</span>`]
        : x.state === 'Jail' ? ['no', `Jail <span data-until="${x.until}" data-zero="out">-</span>`] : ['aw', esc(x.state || '?')];
    function warTargetsHtml(compact) {
        const R = warRange(), key = ffKey(), C = store.get(K.warFF, null) || {}, FM = num(C.fid) === wt.fid ? C.m || {} : {};
        const rng = `FF ${R.lo.toFixed(1)} – ${R.hi.toFixed(1)}`;
        const inputs = `<div class="hbs-wrange"><span>Your FF range</span><input type="number" class="hbs-input" data-wrange="lo" min="1" max="10" step="0.1" value="${R.lo}"><span>to</span>
            <input type="number" class="hbs-input" data-wrange="hi" min="1" max="10" step="0.1" value="${R.hi}"></div>`;
        let head = `<div class="hbs-r1"><span class="hbs-name">🎯 Priority targets</span>${compact ? `<button type="button" class="hbs-btn hbs-ghost hbs-mini" data-cfold="warrange">${rng} ✎</button>` : `<span class="hbs-chip">${rng}</span>`}</div>`;
        if (!key) return `<div class="hbs-card">${head}<div class="hbs-hint">Add your <b>FFScouter key</b> in ⚙ Settings to see the enemy members in your fair-fight range - the hits that pay the most respect. The key stays on this device.</div></div>`;
        head += !compact || cfOpen('warrange') ? inputs : '';
        if (!wt.mem) return `<div class="hbs-card">${head}<div class="hbs-hint">${wt.err ? esc(wt.err) : 'Reading the enemy faction…'}</div></div>`;
        const all = wt.mem.map(x => Object.assign({ ff: (FM[x.pid] || {}).ff, est: (FM[x.pid] || {}).est || '' }, x));
        const inR = all.filter(x => x.ff != null && x.ff >= R.lo - 1e-9 && x.ff <= R.hi + 1e-9), noFF = all.filter(x => x.ff == null).length;
        const ok = inR.filter(x => x.state === 'Okay').sort((a, b) => b.ff - a.ff);
        const off = inR.filter(x => x.state !== 'Okay').sort((a, b) => (a.until || 9e12) - (b.until || 9e12) || b.ff - a.ff);
        const slots = compact ? WT_SLOTS_C : WT_SLOTS, show = ok.slice(0, slots).concat(off.slice(0, Math.max(0, slots - ok.length)));
        const atk = pid => `https://www.torn.com/loader.php?sid=attack&user2ID=${pid}`;
        let list;
        if (!Object.keys(FM).length && wt.ffBusy) list = '<div class="hbs-hint">Asking FFScouter…</div>';
        else if (!show.length) list = `<div class="hbs-hint">Nobody in ${rng} right now. Widen your range to see more targets.</div>`;
        else if (compact) list = `<div class="hbs-wgrid">${show.map(x => { const s = warStat(x); return `<a class="${x.state === 'Okay' ? 'ok' : 'off'}" href="${atk(x.pid)}"><b>${esc(x.name)}</b><span>FF ${x.ff.toFixed(2)} · <i>${s[1]}</i></span></a>`; }).join('')}</div>`;
        else list = show.map(x => { const s = warStat(x); return `<div class="hbs-wrow${x.state === 'Okay' ? '' : ' off'}"><span class="n"><a href="#" data-prof="${x.pid}">${esc(x.name)}</a>
            <small>Lvl ${x.level}${x.est ? ' · est ' + esc(x.est) : ''}${x.la ? ' · ' + esc(x.la.toLowerCase()) : ''}</small></span>
            <span class="hbs-ff hbs-ffm">FF ${x.ff.toFixed(2)}</span><span class="hbs-wst ${s[0]}">${s[1]}</span><a class="hbs-btn${x.state === 'Okay' ? '' : ' hbs-ghost'}" href="${atk(x.pid)}">Attack</a></div>`; }).join('');
        return `<div class="hbs-card">${head}${list}
            <div class="hbs-hint">Higher FF = more respect per hit. ${inR.length} in range · <b>${ok.length}</b> hittable now${ok.length > slots ? ` (top ${slots} shown)` : ''}${noFF ? ` · ${noFF} without FF data` : ''}${wt.memAt ? ` · checked ${ago(Math.floor(wt.memAt / 1000))}` : ''}</div>
            ${wt.ffErr ? `<div class="hbs-msg">${esc(wt.ffErr)}</div>` : ''}${wt.err ? `<div class="hbs-msg">${esc(wt.err)}</div>` : ''}</div>`;
    }
    async function warTabHtml() {
        if (!nowData) { try { await refreshNow(true); } catch (e) {   } }
        const W = nowData && nowData.war, compact = CMP();
        if (!W) return `<div class="hbs-card"><div class="hbs-r1"><span class="hbs-name">⚔ No war right now</span></div>
            <div class="hbs-hint">When a ranked war is matched, the opponent, the score and your priority targets show here. Past wars and your war summary are in 📜 History (••• More).</div></div>`;
        warLoad();
        const on = W.kind === 'ongoing', lead = num(W.our) - num(W.their);
        const when = on ? (num(W.start) ? `started ${ago(num(W.start))}` : 'ongoing') : `starts in <b><span data-until="${num(W.start)}" data-zero="now">-</span></b>`;
        const hBody = on ? `<div class="hbs-wscore">${int(W.our)} – ${int(W.their)}<small>Lead <b class="${lead >= 0 ? 'up' : 'dn'}">${lead >= 0 ? '+' : '−'}${int(Math.abs(lead))}</b>${num(W.target) ? ` · target ${int(W.target)}` : ''} · ${when}</small></div>`
            : `<div class="hbs-wscore"><span data-until="${num(W.start)}" data-zero="now">-</span><small>until the war starts${num(W.start) ? ' · ' + ocWhen(num(W.start)) : ''}</small></div>`;
        let out = compact ? cFold('warhead', '⚔', `vs ${esc(W.opponent || '?')}`, on ? `<b class="hbs-foldn">${lead >= 0 ? '+' : '−'}${int(Math.abs(lead))}</b><small>${int(W.our)} – ${int(W.their)}</small>` : `<small>starts in <span data-until="${num(W.start)}" data-zero="now">-</span></small>`, hBody, false)
            : `<div class="hbs-card hbs-hero"><div class="hbs-r1"><span class="hbs-name">⚔ vs ${esc(W.opponent || '?')}</span><span class="hbs-chip">${on ? 'Ongoing' : 'Upcoming'}</span></div>${hBody}</div>`;
        if (on) { const M = store.get(K.warMine, null) || {}, mine = M.key === num(W.opponent_id) + ':' + num(W.start) ? M : null;
            out += cFold('warmine', '🗡', 'Your war so far', mine ? `<small>${int(mine.hits)} hit${mine.hits === 1 ? '' : 's'} · ${num(mine.resp).toFixed(1)} respect</small>` : '<small>reading…</small>',
                (mine ? tiles([[int(mine.hits), 'Your hits', mine.hits >= MIN_HITS ? `<span class="hbs-good">min ${MIN_HITS} met</span>` : `<span class="hbs-bad">${MIN_HITS - mine.hits} more to reach ${MIN_HITS}</span>`],
                                [num(mine.resp).toFixed(1), 'Your respect'], [mine.hits ? (num(mine.resp) / mine.hits).toFixed(2) : '-', 'Respect / hit']])
                       : `<div class="hbs-hint">${wt.mineErr ? esc(wt.mineErr) : 'Reading your attack log…'}</div>`)
                + '<div class="hbs-hint">Counted from your own attack log on this device (attacks on the enemy faction with respect gained) - the official figures are in the war report.</div>', false, !compact); }
        out += warTargetsHtml(compact);
        return out;
    }
    function warTabBind() {
        bodyEl.querySelectorAll('[data-wrange]').forEach(i => i.addEventListener('change', () => {
            const R = warRange(), v = Math.round(Number(i.value) * 10) / 10; if (!(v >= 1 && v <= 10)) { i.value = R[i.dataset.wrange]; return; }
            R[i.dataset.wrange] = v; if (R.hi < R.lo) { if (i.dataset.wrange === 'lo') R.hi = R.lo; else R.lo = R.hi; }
            store.set(K.warRange, R); render(true); }));
    }
    let histSec = 'wars';
    async function historyHtml() {
        let out = chips('hs', [['wars', '⚔ Wars'], ['chains', '⛓ Chains'], ['ocs', '🕵 OCs']], histSec);
        if (histSec === 'chains') {
            const C = await readOpt('m', 'db/chains.json');
            const L = ((C && C.chains) || []).slice().sort((a, b) => num(b.end) - num(a.end)).slice(0, 15);
            out += await chainSummaryHtml();
            if (L.length) out += sec('Latest chains') + L.map(c => { const x = (c.m || []).find(r => num(r[0]) === me.id);
                return `<div class="hbs-li"><span>${c.end ? fmtD(c.end) + ' · ' : ''}<b>${int(c.length)}</b>-hit chain</span><b class="${x ? 'hbs-good' : ''}" style="${x ? '' : 'opacity:.6;font-weight:normal'}">${x ? `your hits ${int(x[1])}` : 'not in it'}</b></div>`; }).join('');
            return out;
        }
        if (histSec === 'ocs') {
            const O = await readOpt('m', 'db/crimes.json');
            const mine = ((O && O.crimes) || []).filter(c => (c.m || []).includes(me.id));
            const okN = mine.filter(c => String(c.status).toLowerCase() === 'successful').length, earned = mine.reduce((a, c) => a + num(c.share), 0);
            const best = mine.reduce((a, c) => num(c.share) > num(a && a.share) ? c : a, null), m30 = mine.filter(c => num(c.t) > Date.now() / 1000 - 30 * 86400);
            out += `<div class="hbs-card hbs-gold"><div class="hbs-r1"><span class="hbs-name">🕵 Your OC summary</span></div>
                ${mine.length ? `<div class="hbs-ctiles">${tiles([[int(mine.length), 'Crimes'], [`${okN}/${mine.length}`, 'Passed'], [Math.round(100 * okN / mine.length) + '%', 'Success rate'],
                    [earned ? shortMoney(earned) : '-', 'OC earnings'], [okN ? shortMoney(earned / okN) : '-', 'Avg payout'], [best && num(best.share) ? shortMoney(best.share) : '-', 'Best payout', best && num(best.share) ? esc(best.name || '') : ''],
                    [int(m30.length), 'Last 30 days']])}</div>` : '<div class="hbs-hint">No organized crimes on record for you yet.</div>'}</div>`;
            if (mine.length) out += sec('Latest crimes') + mine.slice(-15).reverse().map(c => `<div class="hbs-li"><span>${fmtD(c.t)} · ${esc(c.name || '?')}</span>
                <b class="${String(c.status).toLowerCase() === 'successful' ? 'hbs-good' : 'hbs-bad'}">${esc(c.status || '')}${c.share ? ' · ' + shortMoney(c.share) : ''}</b></div>`).join('');
            return out;
        }
        return out + await warsHtml();
    }
    async function warsHtml() {
        const [F, N] = await Promise.all([readFile('m', 'db/script_feed.json'), names()]);
        const wars = F.wars || [];
        const summary = await warSummaryHtml();
        if (!wars.length) return summary + '<div class="hbs-empty">No wars on the Hub yet.</div>';
        return summary + wars.map(w => {
            const key = 'w:' + w.id;
            const tags = (w.termed ? '<span class="hbs-tag">🤝 Termed</span> ' : '') +
                (w.payout ? '<span class="hbs-tag hbs-green">Paid</span>' : '<span class="hbs-tag hbs-red">No payout yet</span>');
            let detail = '';
            if (open[key]) {
                const mine = (w.m || []).find(x => x[0] === me.id);
                const ranked = (w.m || []).slice().sort((a, b) => b[1] - a[1]), top = ranked.length ? Math.max(1, ranked[0][1]) : 1;
                const under = ranked.filter(x => x[1] < MIN_HITS).length;
                const myRank = mine ? ranked.findIndex(x => x[0] === me.id) + 1 : 0;
                const avg = ranked.length ? ranked.reduce((a, x) => a + x[1], 0) / ranked.length : 0;
                const avgPct = Math.min(100, Math.round(1000 * avg / top) / 10);
                const avgTxt = avg >= 100 ? int(avg) : avg.toFixed(1);
                const rows = ranked.map(([id, h], i) => `<div class="r r${i + 1}${id === me.id ? ' me' : ''}${h < MIN_HITS ? ' low' : ''}" data-prof="${id}"><span class="rk">${i + 1}</span>
                    <span class="nm"><span>${esc(nameOf(N, id))}${id === me.id ? ' <small>you</small>' : ''}</span><i><em style="width:${Math.max(2, Math.round(100 * h / top))}%"></em><u style="left:${avgPct}%"></u></i></span>
                    <span class="v">${int(h)}</span></div>`).join('');
                detail = `<div class="hbs-detail hbs-wtiles" style="padding:6px 0 0;background:none;border:0">
                    ${tiles([[int(w.hits), 'Total hits'], [`${w.attackers}/${w.members}`, 'Members hit'], [avgTxt, 'Average hits'],
                             [String(under), `Under ${MIN_HITS} hits`], mine ? [int(mine[1]), 'Your hits', `#${myRank} of ${ranked.length}<br>${vsAvg(mine[1], avg)}`] : null])}
                    <div class="hbs-lb hbs-wl"><div class="h" data-toggle="wlc:${w.id}" style="cursor:pointer"><b>${open['wlc:' + w.id] ? '▸' : '▾'} Hits by member</b><span><span class="hbs-avgkey"></span> avg ${avgTxt} · red = under ${MIN_HITS}</span></div>${open['wlc:' + w.id] ? '' : `<div class="hbs-wlist">${rows}</div>`}</div>
                    <div class="hbs-actions">
                        <a class="hbs-btn hbs-ghost" href="${esc(w.report)}" target="_blank" rel="noopener">📄 Report</a>
                        ${w.payout ? `<a class="hbs-btn hbs-ghost" href="${esc(w.payout)}" target="_blank" rel="noopener">💰 Payout receipt</a>` : ''}
                        ${me.leader ? `<button type="button" class="hbs-btn ${w.termed ? '' : 'hbs-ghost'}" data-termed="${w.id}" data-on="${w.termed ? 1 : 0}">
                            ${w.termed ? '🤝 Termed - tap to undo' : '🤝 Mark termed'}</button>` : ''}
                    </div>
                    <div class="hbs-msg" data-msg="${key}"></div></div>`;
            }
            return `<div class="hbs-card ${w.termed ? 'hbs-gold' : w.payout ? 'hbs-green' : ''}">
                <div class="hbs-r1" data-toggle="${key}"><span class="hbs-name">vs ${esc(w.opponent || '?')}</span>
                    <span class="hbs-chip">${int(w.hits)} hits</span></div>
                <div class="hbs-sub">${fmtD(w.end)} · ${tags}</div>${detail}</div>`;
        }).join('');
    }

    // [HB Suite] leader action — Termed on/off (config "termed_wars"), same as the toggle on the war's report page.
    async function toggleTermed(btn) {
        const wid = String(btn.dataset.termed), on = btn.dataset.on !== '1';
        const msg = msgIn('w:' + wid);
        btn.disabled = true; if (msg) msg.textContent = 'Saving…';
        try {
            await editConfig(c => {
                const l = (c.termed_wars || []).map(String).filter(x => x !== wid);
                if (on) l.push(wid);
                c.termed_wars = l;
            }, `War ${wid} ${on ? 'marked termed' : 'no longer termed'} (Hub script)`);
            const F = cache['m:db/script_feed.json'];
            if (F) (F.data.wars || []).forEach(w => { if (String(w.id) === wid) w.termed = on; });
            await render();
            setStatus(`Saved ✓ - war ${on ? 'marked termed' : 'no longer termed'}. Reliability and the Hub pages update in a few minutes.`);
        } catch (e) { if (msg) msg.textContent = e.message; btn.disabled = false; }
    }

    let newsSec = 'latest';
    const NEWS = [['latest', 'Latest', 'latest'], ['news', '📰 Newsletters', 'newsletters'], ['war', '⚔ War reports', 'war_reports'],
                  ['chain', '⛓ Chain reports', 'chain_reports'], ['pay', '💰 Payouts', 'payouts'], ['recap', '🗂 Recaps', 'recap_items']];
    async function newsHtml() {
        const F = await readFile('m', 'db/script_feed.json');
        const S = NEWS.find(x => x[0] === newsSec) || NEWS[0];
        let items = F[S[2]];
        if (!items && S[0] === 'chain') items = (F.chains || []).map(x => ({ url: x.report, img: x.img, title: int(x.length) + '-hit chain', sub: fmtD(x.end), kind: 'chain' }));
        if (!items && S[0] === 'recap') items = (F.recaps || []).map(x => ({ url: x.url, img: x.img, title: x.label + ' recap', sub: 'Monthly recap', kind: 'recap' }));
        items = items || [];
        F._shown = items;
        const ICON = { newsletter: '📰', recap: '🗂', war: '⚔', chain: '⛓', payout: '💰' };
        let out = chips('ns', NEWS.map(([k, l]) => [k, l]), newsSec);
        if (!items.length) return out + '<div class="hbs-empty">Nothing here yet.</div>';
        return out + items.map((x, i) => `<div class="hbs-card hbs-gold">
            <div class="hbs-r1"><a class="hbs-name" href="${esc(x.url)}" target="_blank" rel="noopener">${ICON[x.kind] || '•'} ${esc(x.title)}</a>
                ${S[0] === 'latest' ? `<span class="hbs-chip">${esc(x.kind)}</span>` : ''}</div>
            <div class="hbs-sub">${esc(x.sub || '')}</div>
            <a href="${esc(x.url)}" target="_blank" rel="noopener"><img class="hbs-img" loading="lazy" src="${esc(x.img)}" alt=""></a>
            <div class="hbs-actions">
                <a class="hbs-btn hbs-ghost" href="${esc(x.url)}" target="_blank" rel="noopener">Open</a>
                <button type="button" class="hbs-btn hbs-ghost" data-news="${i}" data-what="link">📋 Image link</button>
                <button type="button" class="hbs-btn hbs-ghost" data-news="${i}" data-what="html">📋 Torn HTML</button>
            </div><div class="hbs-msg" data-msg="n:${i}"></div></div>`).join('');
    }
    async function copyNews(btn) {
        const F = await readFile('m', 'db/script_feed.json'), x = (F._shown || F.latest || [])[Number(btn.dataset.news)];
        if (!x) return;
        const html = `<p style="text-align:center;"><a href="${x.img}" target="_blank"><img src="${x.img}" alt="${esc(x.title)}" style="max-width:100%;height:auto;"></a></p>`;
        const ok = await copyText(btn.dataset.what === 'html' ? html : x.img);
        const m = msgIn('n:' + btn.dataset.news);
        if (m) m.textContent = ok ? (btn.dataset.what === 'html' ? 'Torn HTML copied ✓ - paste it in HTML mode.' : 'Image link copied ✓') : "Couldn't copy.";
    }

    async function payoutsHtml() {
        const [PO, N, F] = await Promise.all([readFile('m', 'db/payouts.json'), names(), readOpt('m', 'db/script_feed.json')]);
        const link = {}; ((F && F.wars) || []).forEach(w => { if (w.payout) link[w.war || w.id] = w.payout; });
        const pays = (PO.payouts || []).slice().sort((a, b) => num(b.end) - num(a.end));
        const unpaid = ((F && F.wars) || []).filter(w => !w.payout && !w.termed).slice(0, 5);
        let top = me.leader ? `<div class="hbs-bar" style="padding:7px 0 0"><a class="hbs-btn" href="${HUB_BASE}/l/payout.html" target="_blank" rel="noopener">🧮 Payout calculator ↗</a></div>` : '';
        const myTot = pays.reduce((a, p) => a + num(((p.m || []).find(x => x[0] === me.id) || [])[1]), 0);
        top += tiles([[shortMoney(pays.reduce((a, p) => a + num(p.paid), 0)), 'Paid out', `${pays.length} wars`], [shortMoney(myTot), 'Paid to you']]);
        if (me.leader && unpaid.length) top += `<div class="hbs-hint" style="color:#FF7676;opacity:1">No payout yet: ${unpaid.map(w => 'vs ' + esc(w.opponent || '?') + ' (' + fmtD(w.end) + ')').join(' · ')}</div>`;
        if (!pays.length) return top + '<div class="hbs-empty">No payouts on the Hub yet.</div>';
        return top + pays.slice(0, 40).map(p => {
            const key = 'p:' + p.war, rows = (p.m || []).filter(x => x[1]).sort((a, b) => b[1] - a[1]);
            const mine = (p.m || []).find(x => x[0] === me.id);
            const detail = open[key] ? `<div class="hbs-detail"><div class="hbs-list">${rows.map(([id, pay, wh]) =>
                `<div class="hbs-li"><span>${id === me.id ? '<b>' : ''}${esc(nameOf(N, id))}${id === me.id ? '</b>' : ''} <span style="opacity:.55">· ${wh} hits</span></span><b>${money(pay)}</b></div>`).join('')}</div>
                ${link[p.war] ? `<div class="hbs-actions"><a class="hbs-btn hbs-ghost" href="${esc(link[p.war])}" target="_blank" rel="noopener">💰 Payout receipt</a></div>` : ''}</div>` : '';
            return `<div class="hbs-card hbs-green"><div class="hbs-r1" data-toggle="${key}"><span class="hbs-name">vs ${esc(p.opponent || '?')}</span>
                <span class="hbs-chip">${shortMoney(p.paid)}</span></div>
                <div class="hbs-sub">${fmtD(p.end)} · ${rows.length} members paid${mine && mine[1] ? ` · <b class="hbs-good">you: ${money(mine[1])}</b>` : ''}</div>${detail}</div>`;
        }).join('');
    }

    const normName = n => String(n || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    function installedScripts() {
        const out = {};
        document.querySelectorAll('meta[name="hb-script"]').forEach(m => { out[normName(m.content)] = m.dataset.version || ''; });
        document.querySelectorAll('.torn-launcher[data-dock-label]').forEach(l => { const k = normName(l.dataset.dockLabel); if (!(k in out)) out[k] = ''; });
        return out;
    }
    const verCmp = (a, b) => { const x = String(a).split(/[.\-]/), y = String(b).split(/[.\-]/);
        for (let i = 0; i < Math.max(x.length, y.length); i++) { const p = parseInt(x[i] || '0', 10) || 0, q = parseInt(y[i] || '0', 10) || 0; if (p !== q) return p > q ? 1 : -1; }
        return 0; };
    async function scriptsHtml() {
        const S = await live('scripts');
        const list = S.scripts || [], inst = installedScripts();
        let out = `<div class="hbs-hint">"Installed" is checked on this page - a script that only runs on other Torn pages may not show here.${me.leader
            ? ` Add, edit or remove listings on the <a href="${HUB_BASE}/m/scripts.html" target="_blank" rel="noopener">Hub's Scripts page</a>.` : ''}</div>`;
        if (!list.length) return out + '<div class="hbs-empty">No scripts listed yet.</div>';
        return out + list.map(x => {
            const key = 's:' + x.id, k = normName(x.name), has = k in inst, iv = inst[k];
            const upd = has && iv && x.version && verCmp(x.version, iv) > 0;
            const state = !has ? '' : upd ? `<span class="hbs-tag hbs-red">v${esc(iv)} installed</span>`
                : `<span class="hbs-tag hbs-green">✓ Installed${iv ? ' v' + esc(iv) : ''}</span>`;
            const btn = !x.install_url ? '' : upd ? `<a class="hbs-btn" href="${esc(abs(x.install_url))}" target="_blank" rel="noopener">⬆ Update to v${esc(x.version)}</a>`
                : has ? `<a class="hbs-btn hbs-ghost" href="${esc(abs(x.install_url))}" target="_blank" rel="noopener">Reinstall</a>`
                : `<a class="hbs-btn" href="${esc(abs(x.install_url))}" target="_blank" rel="noopener">⬇ Install</a>`;
            return `<div class="hbs-card ${upd ? 'hbs-red' : has ? 'hbs-green' : 'hbs-gold'}"><div class="hbs-r1" data-toggle="${key}"><span class="hbs-name">${esc(x.name)}</span>
                ${x.version ? `<span class="hbs-chip">v${esc(x.version)}</span>` : ''}</div>
                <div class="hbs-sub">${esc(x.summary || '')}</div>
                ${state ? `<div class="hbs-sub">${state}</div>` : ''}
                ${open[key] && x.description ? `<div class="hbs-detail" style="white-space:pre-wrap">${esc(x.description)}</div>` : ''}
                <div class="hbs-actions">${btn}
                ${x.gf && x.gf.url ? `<a class="hbs-btn hbs-ghost" href="${esc(x.gf.url)}" target="_blank" rel="noopener">Greasy Fork</a>` : ''}
                ${x.description ? `<button type="button" class="hbs-btn hbs-ghost" data-toggle="${key}">${open[key] ? 'Less' : 'More'}</button>` : ''}</div>
                <div class="hbs-hint">${x.updated ? 'Updated ' + fmtD(x.updated > 1e11 ? Math.floor(x.updated / 1000) : x.updated) + (x.updated_by ? (x.gf ? ' on ' : ' by ') + esc(x.updated_by) : '') : ''}${x.gf && x.gf.installs != null ? ' · ' + int(x.gf.installs) + ' installs' : ''}</div></div>`;
        }).join('');
    }

    let readySort = 'energy';
    async function readyHtml() {
        const D = await live('readiness');
        const rows = (D.members || []).slice(), el_ = Math.max(0, nowS() - num(D.at));
        const okState = r => r.status && String(r.status.state).toLowerCase() === 'okay';
        const en = r => r.energy ? r.energy.cur : -1;
        rows.sort(readySort === 'name' ? (a, b) => String(a.name).localeCompare(String(b.name))
            : readySort === 'ready' ? (a, b) => (okState(b) - okState(a)) || en(b) - en(a) : (a, b) => en(b) - en(a));
        const ok = rows.filter(r => !r.err && okState(r)), stacked = rows.filter(r => r.energy && r.energy.cur >= r.energy.max);
        const noDrug = rows.filter(r => r.cd && (r.cd.drug || 0) - el_ <= 0 && !r.err);
        let out = tiles([[rows.length, 'Opted in'], [ok.length, 'Okay'], [stacked.length, 'Stacked'], [noDrug.length, 'No drug CD'],
            [big(rows.reduce((a, r) => a + (r.energy ? r.energy.cur : 0), 0)), 'Total energy']]);
        out += chips('rs', [['energy', 'Most energy'], ['ready', 'Ready first'], ['name', 'Name']], readySort);
        out += `<div class="hbs-hint">Read ${ago(D.at)} with each member's own key · refreshes every minute while this tab is open</div>`;
        out += rows.map(r => {
            if (r.err) return `<div class="hbs-card hbs-red"><div class="hbs-r1"><a href="#" class="hbs-name" data-prof="${r.id}">${esc(r.name)}</a><span class="hbs-chip hbs-bad">${esc(r.err)}</span></div></div>`;
            const st = r.status || {}, s = String(st.state || '').toLowerCase();
            const cd = k => { const until = num(D.at) + num((r.cd || {})[k]); return `<div><b data-until="${until}">${until > nowS() ? dur(until - nowS()) : 'Ready'}</b><span>${k}</span></div>`; };
            return `<div class="hbs-card ${s === 'okay' ? 'hbs-green' : 'hbs-red'}"><div class="hbs-r1"><a href="#" class="hbs-name" data-prof="${r.id}">${esc(r.name)}</a>
                <span class="hbs-chip ${s === 'okay' ? 'hbs-good' : s === 'traveling' || s === 'abroad' ? '' : 'hbs-bad'}">${esc(st.state || '?')}${st.until && st.until > nowS() ? ' · <span data-until="' + st.until + '">' + dur(st.until - nowS()) + '</span>' : ''}</span></div>
                ${meter('Energy' + (r.energy && r.energy.cur >= r.energy.max ? ' · stacked' : ''), r.energy, '#78c878')}${meter('Happy', r.happy, '#e8be5a')}${meter('Nerve', r.nerve, '#e4382e')}
                <div class="hbs-tiles">${cd('drug')}${cd('booster')}${cd('medical')}</div>
                <div class="hbs-sub">Energy refill: ${r.refill == null ? '-' : r.refill ? 'used today' : '<b class="hbs-good">available</b>'}${r.last ? ' · active ' + ago(r.last) : ''}</div></div>`;
        }).join('') || '<div class="hbs-empty">Nobody has turned war readiness on yet.</div>';
        return out;
    }

    let statsKind = 'bs', statsSort = 'total';
    async function statsHtml() {
        const [P, N] = await Promise.all([readFile('l', 'db/private.json'), names()]);
        const bs = [], ws = [];
        Object.entries(P.members || {}).forEach(([id, x]) => { const o = x.optin; if (!o) return;
            const tot = r => r[1] + r[2] + r[3] + r[4], wt = r => r[1] + r[2] + r[3];
            if (o.bs && o.bs.s.length) { const l = o.bs.s[o.bs.s.length - 1];
                bs.push({ id, name: nameOf(N, id), total: tot(l), a: l[1], b: l[2], c: l[3], d: l[4], g: gainTxt(o.bs.s, 30, tot), share: o.bs.share, on: l[0], via: (o.via || {}).bs }); }
            if (o.ws && o.ws.s.length) { const l = o.ws.s[o.ws.s.length - 1];
                ws.push({ id, name: nameOf(N, id), total: wt(l), a: l[1], b: l[2], c: l[3], g: gainTxt(o.ws.s, 30, wt), share: o.ws.share, on: l[0], via: (o.via || {}).ws }); } });
        const opted = Object.values(P.members || {}).filter(x => x.optin).length;
        const ways = { site: 0, script: 0, ocopt: 0 };
        Object.values(P.members || {}).forEach(x => { const v = x.optin && x.optin.via; if (!v) return;
            new Set([].concat(...Object.values(v))).forEach(k => { if (k in ways) ways[k]++; }); });
        let out = tiles([[opted, 'Sharing'], [bs.length, 'Battle stats'], [ws.length, 'Work stats'],
            [ways.site, '🌐 Hub site'], [ways.script, '🧩 Hub script'], [ways.ocopt, '🕵️ OC script']]);
        out += chips('sk', [['bs', '⚔ Battle'], ['ws', '🛠 Work']], statsKind);
        const L = statsKind === 'bs' ? [['total', 'Total'], ['a', 'Strength'], ['b', 'Defense'], ['c', 'Speed'], ['d', 'Dexterity']]
                                     : [['total', 'Total'], ['a', 'Manual labor'], ['b', 'Intelligence'], ['c', 'Endurance']];
        if (!L.find(x => x[0] === statsSort)) statsSort = 'total';
        out += chips('ss', L.concat([['name', 'Name']]), statsSort);
        const rows = (statsKind === 'bs' ? bs : ws).sort(statsSort === 'name' ? (a, b) => a.name.localeCompare(b.name) : (a, b) => b[statsSort] - a[statsSort]);
        return out + (rows.map(r => `<div class="hbs-card"><div class="hbs-r1"><a href="#" class="hbs-name" data-prof="${r.id}">${esc(r.name)}</a>
            <span class="hbs-chip">${big(r.total)}</span></div>
            <div class="hbs-sub">${L.slice(1).map(([k, l]) => `${l} <b>${big(r[k])}</b>`).join(' · ')}</div>
            <div class="hbs-sub">${r.g || 'no 30-day gain yet'} · shared with ${r.share === 'faction' ? 'the faction' : 'leaders'} · read ${esc(r.on || '-')}</div>
            ${r.via && r.via.length ? `<div class="hbs-sub">Through ${srcNames(r.via)}</div>` : ''}</div>`).join('')
            || '<div class="hbs-empty">Nobody shares these yet.</div>');
    }

    const ARM_USE = [['Drugs', ['Xanax', 'Drugs']], ['Medical', ['Medical']], ['Boosters', ['Boosters']], ['Consumables', ['Refills', 'Temporary']]];
    const ARM_LOAN = [['Weapons', '🔫'], ['Armor', '🛡'], ['Temporary', '💣'], ['Utilities', '🧰']];
    let armSec = 'loans', armPeriod = 'month', armSort = 'total';
    async function armoryHtml() {
        const A = await readFile('l', 'db/armory.json');
        const nm = id => (A.names[id] || ['[' + id + ']'])[0];
        let out = chips('as', [['loans', '📦 Currently loaned'], ['use', '💊 Armory use']], armSec);
        if (armSec === 'loans') {
            const L = A.loans || {}, tot = {};
            const rows = Object.entries(L).map(([id, cats]) => {
                let n = 0; ARM_LOAN.forEach(([c]) => { const k = (cats[c] || []).length; n += k; tot[c] = (tot[c] || 0) + k; });
                return { id, name: nm(id), cur: !!(A.names[id] || [])[1], cats, n };
            }).filter(r => r.n).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
            out += tiles(ARM_LOAN.map(([c, ic]) => [int(tot[c] || 0), ic + ' ' + (c === 'Temporary' ? 'Temps' : c)]).concat([[String(rows.length), 'Members']]));
            out += `<div class="hbs-hint">${A.loans_at ? 'As of ' + fmtDT(A.loans_at) + ' ' + tzTagH() + ' (read with each full Hub update)' : 'Not read yet - it starts with the next full Hub update'} · tap a member for their items</div>`;
            out += rows.map(r => {
                const key = 'al:' + r.id;
                const detail = open[key] ? `<div class="hbs-detail">${ARM_LOAN.filter(([c]) => (r.cats[c] || []).length).map(([c, ic]) => {
                    const cnt = {}; r.cats[c].forEach(x => { cnt[x] = (cnt[x] || 0) + 1; });
                    return `<div class="hbs-sec" style="margin-top:4px">${ic} ${c === 'Temporary' ? 'Temps' : c} · ${r.cats[c].length}</div>` +
                        Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([n, k]) => `<div class="hbs-li ${k > 1 ? 'hbs-low' : ''}"><span>${esc(n)}</span><b>×${k}</b></div>`).join('');
                }).join('')}</div>` : '';
                return `<div class="hbs-card${r.cur ? '' : ' hbs-red'}"><div class="hbs-r1" data-toggle="${key}"><span class="hbs-name">${esc(r.name)}${r.cur ? '' : ' <span style="opacity:.6">(left the faction)</span>'}</span>
                    <span class="hbs-chip">${r.n} item${r.n === 1 ? '' : 's'}</span></div>
                    <div class="hbs-sub">${ARM_LOAN.filter(([c]) => (r.cats[c] || []).length).map(([c, ic]) => `${ic} ${(r.cats[c] || []).length}`).join(' · ')}</div>${detail}</div>`;
            }).join('') || '<div class="hbs-empty">Nothing on loan right now.</div>';
            return out;
        }
        const months = armPeriod === 'all' ? (A.months || []) : [armPeriod === 'month' ? thisMonth() : lastMonth()];
        const grp = c => { const g = ARM_USE.find(([, cs]) => cs.includes(c)); return g ? g[0] : null; };
        const usage = id => {
            const m = (A.members[id] || {}).m || {}, r = { total: 0, items: {} };
            ARM_USE.forEach(([g]) => { r[g] = 0; r.items[g] = {}; });
            months.forEach(mo => Object.entries(m[mo] || {}).forEach(([it, n]) => {
                const g = grp(A.item_cat[+it]); if (!g) return;
                const name = String(A.items[+it]).replace(/ \(points\)$/, ' · points');
                r[g] += n; r.total += n; r.items[g][name] = (r.items[g][name] || 0) + n; }));
            return r;
        };
        const ids = [...new Set(Object.keys(A.members || {}).concat(Object.keys(A.names || {}).filter(i => A.names[i][1])))];
        const rows = ids.map(id => Object.assign({ id, name: nm(id), cur: !!(A.names[id] || [])[1] }, usage(id)))
            .filter(r => r.cur || r.total)
            .sort(armSort === 'name' ? (a, b) => a.name.localeCompare(b.name) : (a, b) => (b.total - a.total) || a.name.localeCompare(b.name));
        const fac = {}; rows.forEach(r => ARM_USE.forEach(([g]) => { fac[g] = (fac[g] || 0) + r[g]; }));
        const ICON = { Drugs: '💊', Medical: '🩸', Boosters: '🍺', Consumables: '⚡' };
        out += chips('ap', [['month', 'This month'], ['last', 'Last month'], ['all', 'All time']], armPeriod);
        out += '<div class="hbs-wtiles">' + tiles(ARM_USE.map(([g]) => [int(fac[g]), ICON[g] + ' ' + g])) + '</div>';
        out += chips('ao', [['total', 'Most used'], ['name', 'Name']], armSort);
        out += `<div class="hbs-hint">${armPeriod === 'all' ? 'All time on record' : monthName(months[0])} · items used from the armory · Drugs = Xanax + other drugs ·
            Consumables = points refills + temps used${A.done ? '' : ' · older months still filling in'}</div>`;
        out += rows.map(r => `<div class="hbs-card hbs-arm"><div class="hbs-r1" data-prof="${r.id}"><span class="hbs-name">${esc(r.name)}${r.cur ? '' : ' <span style="opacity:.5">former</span>'}</span>
                <span class="hbs-chip">${int(r.total)} used</span></div>
                ${r.total ? ARM_USE.filter(([g]) => r[g]).map(([g]) => `<div class="hbs-ag"><div class="hbs-agh">${ICON[g]} ${g} <b>${int(r[g])}</b></div>
                    <div class="hbs-agi">${Object.entries(r.items[g]).sort((a, b) => b[1] - a[1]).map(([n, k]) => `<span>${esc(n)} <b>×${int(k)}</b></span>`).join('')}</div></div>`).join('')
                    : '<div class="hbs-sub">Nothing used this period.</div>'}</div>`).join('');
        return out;
    }

    const FACTION_ID = 51384;
    const MOD_DEF = { chain: true, ocpage: true, recruit: true };
    const MOD = Object.assign({}, MOD_DEF, store.get(K.mods, {}) || {});
    const modOn = k => true;

    function postTo(path, body) {
        const url = HUB_BASE + path, payload = JSON.stringify(body);
        return new Promise((resolve, reject) => {
            const done = (status, txt) => { let r = null; try { r = txt ? JSON.parse(txt) : null; } catch (e) {   }
                if (!r) return reject(new HubError(`Hub error (${status || 'no response'}).`));
                if (num(status) >= 400 || r.ok === false) return reject(new HubError(r.error || `Hub error (${status}).`));
                resolve(r); };
            if (typeof PDA_httpPost === 'function') {
                try { Promise.resolve(PDA_httpPost(url, { 'Content-Type': 'application/json' }, payload))
                        .then(r => done(r && r.status, (r && (r.responseText || r.response || r.body || r.text)) || ''))
                        .catch(() => reject(new HubError('Hub unreachable.'))); return; } catch (e) {   }
            }
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({ method: 'POST', url, data: payload, timeout: 20000, headers: { 'Content-Type': 'application/json' },
                    onload: r => done(r.status, r.responseText), onerror: () => reject(new HubError('Hub unreachable.')),
                    ontimeout: () => reject(new HubError('Hub timed out.')) });
                return;
            }
            fetch(url, { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' } })
                .then(r => r.text().then(t => done(r.status, t))).catch(() => reject(new HubError('Hub unreachable.')));
        });
    }

    let audioCtx = null;
    function alertMe(text, strong) {
        toast(text, strong);
        try { if (navigator.vibrate) navigator.vibrate(strong ? [200, 100, 200] : 150); } catch (e) {   }
        try {
            audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
            const o = audioCtx.createOscillator(), g = audioCtx.createGain();
            o.frequency.value = strong ? 880 : 660; g.gain.value = 0.08; o.connect(g); g.connect(audioCtx.destination);
            o.start(); o.stop(audioCtx.currentTime + (strong ? 0.35 : 0.18));
        } catch (e) {   }
    }
    function toast(text, strong) {
        let t = document.getElementById('hbs-toast');
        if (!t) { t = el('div'); t.id = 'hbs-toast'; document.body.appendChild(t); }
        t.textContent = text; t.className = strong ? 'hbs-strong' : '';
        t.style.opacity = '1'; clearTimeout(t._h); t._h = setTimeout(() => { t.style.opacity = '0'; }, strong ? 7000 : 4000);
    }

    let nowData = null, nowAt = 0, chipsEl = null;
    async function refreshNow(force) {
        if (collapsed || document.visibilityState !== 'visible' || !me) return;
        if (!force && Date.now() - nowAt < 30000) return;
        nowAt = Date.now();
        try { nowData = await live('now'); } catch (e) {   }   // [HB Suite] Hub API — op live "now"
        drawChips();
    }
    let annEl = null;
    function drawAnn() {
        if (!annEl) return;
        const a = nowData && nowData.announce, dead = !a || (a.until && a.until <= Date.now()) || (a.type !== 'urgent' && store.get(K.annDismiss, '') === a.id);
        if (dead) { annEl.style.display = 'none'; annEl.innerHTML = ''; return; }
        const urgent = a.type === 'urgent';
        annEl.className = 'hbs-ann' + (urgent ? ' urgent' : ' dis'); annEl.style.display = '';
        annEl.innerHTML = `${urgent ? '🚨' : '📢'} ${esc(a.text)}<small>${esc(String(a.by || '').replace(/\s*\[\d+\]$/, ''))}${a.at ? ' · ' + ago(Math.floor(a.at / 1000)) : ''}${urgent && a.until ? ` · until ${ocWhen(Math.floor(a.until / 1000))}` : ''}</small>`
            + (urgent ? '' : '<button type="button" data-anndis title="Dismiss">✕</button>');
    }
    let annS = null, annAt = 0, annMsg = '';
    const annAud = a => !a ? '-' : a.all ? 'Everyone' : [a.queue ? 'Chain queue' : '', a.leaders ? 'All leaders' : ''].concat(a.roles || []).filter(Boolean).join(', ');
    async function annHtml() {
        if (!me.leader) return '<div class="hbs-empty">Leaders only.</div>';
        // [HB Suite] Hub API — op "announce" get (leaders: the current announcement, history, positions)
        if (!annS || Date.now() - annAt > 30000) { try { annS = await hub('announce', { do: 'get' }); annAt = Date.now(); } catch (e) { return `<div class="hbs-empty">${esc(e.message)}</div>`; } }
        const c = annS.cur, max = annS.max || 200;
        const hist = (annS.log || []).map(x => `<div class="hbs-li" style="display:block;text-align:left"><span class="hbs-tag ${x.type === 'urgent' ? 'hbs-red' : ''}">${x.type === 'urgent' ? 'Urgent' : 'Announcement'}</span> ${esc(x.text)}
            <div class="hbs-hint" style="text-align:left;margin:2px 0 0">${esc(x.by || '')} · ${fmtD(Math.floor(num(x.at) / 1000))} · ${esc(annAud(x.aud))} · ${esc(x.ended || 'expired')}${x.ended_by ? ' by ' + esc(x.ended_by) : ''}</div></div>`).join('');
        return `<div class="hbs-card"><div class="hbs-r1"><span class="hbs-name">📢 Showing now</span></div>
                ${c ? `<div class="hbs-ann${c.type === 'urgent' ? ' urgent' : ''}" style="margin:6px 0 0">${c.type === 'urgent' ? '🚨' : '📢'} ${esc(c.text)}<small>${esc(c.by || '')} · ${esc(annAud(c.aud))} · ${c.until ? 'expires ' + ocWhen(Math.floor(c.until / 1000)) : 'no expiry'}</small></div>
                    <div class="hbs-actions"><button type="button" class="hbs-btn hbs-ghost" data-anndel>Delete it</button></div>` : '<div class="hbs-hint">Nothing is showing right now.</div>'}</div>
            <div class="hbs-card"><div class="hbs-r1"><span class="hbs-name">✍ New announcement</span><span class="hbs-chip" data-anncn>0 / ${max}</span></div>
                <div class="hbs-hint" style="text-align:left">One at a time - sending replaces the one showing now. Members see it within about half a minute.</div>
                <textarea class="hbs-input hbs-annbox" data-anntx maxlength="${max}" placeholder="Chain starts at 20:00 TCT - join the queue"></textarea>
                ${sec('Kind')}<div class="hbs-annpick" data-annkind><label class="on"><input type="radio" name="hbs-annk" value="announce" checked> Announcement (yellow, can be dismissed)</label>
                    <label><input type="radio" name="hbs-annk" value="urgent"> Urgent (red, can't be dismissed)</label></div>
                ${sec('Expires')}<select class="hbs-input" data-annhrs></select>
                ${sec('Who sees it')}<div class="hbs-annpick" data-annaud><label class="on"><input type="checkbox" value="all" checked> Everyone</label><label><input type="checkbox" value="queue"> In the chain queue</label>
                    <label><input type="checkbox" value="leaders"> All leaders</label>${(annS.positions || []).map(p => `<label><input type="checkbox" data-role="1" value="${esc(p)}"> ${esc(p)}</label>`).join('')}</div>
                <div class="hbs-actions"><button type="button" class="hbs-btn" data-annsend>Send</button></div>
                <div class="hbs-msg" data-annmsg>${esc(annMsg)}</div></div>
            ${sec('History')}${hist || '<div class="hbs-hint">No past announcements.</div>'}`;
    }
    function annBind() {
        const q = s => bodyEl.querySelector(s), tx = q('[data-anntx]'); if (!tx) return;
        const kind = () => (q('[data-annkind] input:checked') || {}).value || 'announce';
        const marks = () => bodyEl.querySelectorAll('.hbs-annpick label').forEach(l => l.classList.toggle('on', l.querySelector('input').checked));
        const hours = () => { const u = kind() === 'urgent', L = u ? [1, 2, 3, 6, 12, 24] : [0, 1, 6, 12, 24, 72, 168];
            q('[data-annhrs]').innerHTML = L.map(h => `<option value="${h}"${h === (u ? 6 : 0) ? ' selected' : ''}>${h === 0 ? 'Stays until replaced or deleted' : h < 48 ? h + ' hour' + (h === 1 ? '' : 's') : (h / 24) + ' days'}</option>`).join(''); };
        hours();
        tx.addEventListener('input', () => { q('[data-anncn]').textContent = `${tx.value.length} / ${annS.max || 200}`; });
        q('[data-annkind]').addEventListener('change', () => { hours(); marks(); });
        q('[data-annaud]').addEventListener('change', e => { const all = q('[data-annaud] input[value=all]');
            if (e.target === all && all.checked) bodyEl.querySelectorAll('[data-annaud] input').forEach(i => { if (i !== all) i.checked = false; });
            else if (e.target !== all && e.target.checked) all.checked = false;
            marks(); });
        const act = async (body, done) => { const m = q('[data-annmsg]'); if (m) m.textContent = 'Saving…';
            // [HB Suite] Hub API — op "announce" send / delete (leaders)
            try { annS = await hub('announce', body); annAt = Date.now(); annMsg = done; delete liveMemo.now; nowAt = 0; refreshNow(true); render(true); }
            catch (e) { if (m) m.textContent = e.message; } };
        q('[data-annsend]').addEventListener('click', () => {
            const text = tx.value.trim(), A = [...bodyEl.querySelectorAll('[data-annaud] input:checked')];
            const aud = { all: A.some(i => i.value === 'all'), queue: A.some(i => i.value === 'queue'), leaders: A.some(i => i.value === 'leaders'), roles: A.filter(i => i.dataset.role).map(i => i.value) };
            if (!text) { q('[data-annmsg]').textContent = 'Write a message first.'; return; }
            if (!confirm(`Send this ${kind() === 'urgent' ? 'URGENT ' : ''}announcement to: ${annAud(aud) || 'nobody'}?${annS && annS.cur ? '\n\nIt replaces the one showing now.' : ''}`)) return;
            act({ do: 'send', text, type: kind(), hours: Number(q('[data-annhrs]').value), aud }, 'Sent ✓');
        });
        const del = q('[data-anndel]');
        if (del) del.addEventListener('click', () => { if (confirm("Delete the current announcement? It disappears from every member's Suite.")) act({ do: 'delete' }, 'Deleted ✓'); });
    }
    function drawChips() {
        drawAnn();
        if (!chipsEl) return;
        const out = [], S = cw.state, t = Date.now() / 1000;
        const PC = cwChain();
        if (S && PC.current > 0) {
            out.push(`<button type="button" data-gotab="chain" class="hbs-chipb"><i class="hbs-dot ok"></i>⛓ ${int(PC.current)} · <span data-cwexp data-exp="${cwLocal(PC.expires_at)}" data-zero="00:00">-</span></button>`);
        } else if (!(cw.state && !cw.state.restored && cw.state.chain) && nowData && nowData.chain && nowData.chain.current > 0 && nowData.chain.timeout_at > t) {
            out.push(`<button type="button" data-gotab="chain" class="hbs-chipb"><i class="hbs-dot ok"></i>⛓ ${int(nowData.chain.current)} · <span data-until="${nowData.chain.timeout_at}">-</span></button>`);
        } else out.push(`<button type="button" data-gotab="chain" class="hbs-chipb"><i class="hbs-dot"></i>⛓ 00:00</button>`);
        if (cw.queued) out.push(`<button type="button" data-gotab="chain" class="hbs-chipb"><i class="hbs-dot ok"></i>In queue #${cw.queuePos}</button>`);
        const w = nowData && nowData.war;
        if (w) out.push(w.kind === 'ongoing'
            ? `<button type="button" data-gotab="wars" class="hbs-chipb"><i class="hbs-dot warn"></i>⚔ ${int(w.our)}–${int(w.their)} vs ${esc(w.opponent)}</button>`
            : `<button type="button" data-gotab="wars" class="hbs-chipb"><i class="hbs-dot warn"></i>⚔ vs ${esc(w.opponent)} in <span data-until="${w.start}">-</span></button>`);
        chipsEl.innerHTML = out.join('');
        tickEl(chipsEl);
        drawPin();
    }

    const cw = { ws: null, token: null, state: null, offset: 0, fails: 0, retryT: null, pingT: null, readT: null, syncT: null,
                 out: [], useSync: false, queued: false, queuePos: 0, lastTurnUp: null, stage: {}, backupFor: null, statsAt: 0, statsSent: false };
    (function cwRestore() {
        try { const s = store.get(K.cwSnap, null);
            if (!s || !s.chain || Date.now() - num(s.at) > 300000) return;
            cw.offset = num(s.offset);
            if (num(s.chain.current) > 0 && num(s.chain.expires_at) > Date.now() + cw.offset) cw.state = { chain: s.chain, restored: true };
        } catch (e) {   }
    })();
    const cwNow = () => Date.now() + cw.offset;
    const cwLocal = ms => num(ms) - cw.offset;
    const cwWanted = () => modOn('chain') && !!me && !!getKey();
    function cwSend(msg) {
        if (cw.ws && cw.ws.readyState === 1) { try { cw.ws.send(JSON.stringify(msg)); return; } catch (e) {   } }
        cw.out.push(msg); if (cw.out.length > 20) cw.out.shift();
        cwSyncSoon();
    }
    async function cwConnect() {
        if (!cwWanted() || cw.ws || cw.syncT || cw.connecting) return;
        cw.connecting = true;
        try {
            if (!cw.token) { const t = store.get(K.cwTok, null);
                if (t && num(t.pid) === me.id && num(t.exp) > Date.now() + 60000) { cw.token = t.token; cw.tokenExp = num(t.exp); } }
            if (!cw.token || cw.tokenExp < Date.now() + 60000) {
                cw.step = 'Signing in to Chain Watch…'; cwShow();
                // [HB Suite] Hub API — /cw/hello: identity only ({pid, faction, name}); the key never leaves the device
                const h = await postTo('/cw/hello', { pid: me.id, faction: FACTION_ID, name: me.name, ver: VERSION, pda: isPDA() });
                if (!h.token) throw new HubError('Chain Watch sign-in gave no token.');
                cw.token = h.token; cw.tokenExp = num(h.expires) > 1e12 ? num(h.expires) : num(h.expires) > 1e9 ? num(h.expires) * 1000 : Date.now() + 20 * 3600e3;
                store.set(K.cwTok, { token: cw.token, exp: cw.tokenExp, pid: me.id });
            }
            if (typeof WebSocket !== 'function') { cwToSync('this browser has no live connections'); return; }
            cw.step = 'Connecting…';
            cwStartSync();
            cwOpenWs();
        } catch (e) {
            cw.err = e.message || String(e);
            if (/not_member|wrong_faction/.test(cw.err)) cw.denied = cw.err; else { cw.step = 'Retrying…'; cwRetry(); }
            cwShow();
        } finally { cw.connecting = false; }
    }
    const CW_BLOCKED = 'This browser blocks live connections on Torn, so Chain Watch checks the Hub every 15 s instead (every 5 s near an alert, and straight after anything you do).';
    function cwOpenWs() {
        if (!cw.syncT) { cw.step = 'Opening the live connection…'; cwShow(); }
        let ws;
        try { ws = new WebSocket(HUB_BASE.replace(/^http/, 'ws') + '/cw/ws?token=' + encodeURIComponent(cw.token) + '&faction=' + FACTION_ID); }
        catch (x) { console.warn(LOG, 'live connection refused', x); cwToSync(null); return; }
        cw.ws = ws; let opened = false, got = false;
        const openT = setTimeout(() => { if (!opened) { ws.onclose = null; try { ws.close(); } catch (x) {   } if (cw.ws === ws) cw.ws = null; cwToSync('the live connection didn\'t open within 8 s'); } }, 8000);
        ws.onopen = () => { opened = true; clearTimeout(openT); cw.fails = 0; cw.err = ''; cw.step = 'Live'; cw.lastMsg = Date.now();
            clearTimeout(cw.syncT); cw.syncT = null; clearTimeout(cw.wsRetryT);
            cwSend({ t: 'hello', ver: VERSION, pda: isPDA() }); cw.out.splice(0).forEach(m => cwSend(m));
            if (store.get(K.cwq, false)) { const st = cwStatsCached(); cwSend(st ? { t: 'join', stats: st } : { t: 'join' }); }
            clearInterval(cw.pingT); cw.pingT = setInterval(() => { try { ws.send('{"t":"ping"}'); } catch (e) {   } }, 25000);
            cwStats(false); cwPresence(); pageSentCount = -1; cwShow(); };
        ws.onmessage = e => { got = true; cw.lastMsg = Date.now(); let m = null; try { m = JSON.parse(e.data); } catch (x) { return; } cwIn(m); };
        ws.onclose = e => { clearTimeout(openT); clearInterval(cw.pingT); if (cw.ws === ws) cw.ws = null;
            if (e && (e.code === 1008 || e.code === 1011 || e.code === 4001 || e.code === 4003)) { cw.token = null; store.set(K.cwTok, null); cwRetry(); return; }
            if (!opened || !got) return cwToSync('the live connection was refused' + (e && e.code ? ' (code ' + e.code + ')' : ''));
            if (e && e.reason === 'replaced') return cwToSync('another Chain Watch connection (the old script, or Torn open in another tab) took the live slot');
            if (++cw.fails >= 3) return cwToSync('the live connection keeps dropping');
            cw.step = 'Reconnecting…'; cwShow(); cwRetry(); };
        ws.onerror = () => {   };
    }
    function cwToSync(why) {
        cw.err = ''; cw.pollWhy = why || 'live connections blocked'; cw.step = 'Connected by polling';
        if (!cw.syncT) cwStartSync();
        clearTimeout(cw.wsRetryT);
        if (typeof WebSocket === 'function') cw.wsRetryT = setTimeout(() => { if (cwWanted() && !cw.ws && cw.token) cwOpenWs(); }, 60000);
        cwShow();
    }
    function cwShow() { if (!collapsed && tab === 'chain' && !cwBusy()) { clearTimeout(cw.drawT); cw.drawT = setTimeout(() => { if (tab === 'chain' && !cwBusy()) render(true); }, 120); } }
    function cwRetry() { clearTimeout(cw.retryT); cw.retryT = null; if (cwWanted()) cw.retryT = setTimeout(() => { cw.retryT = null; cwConnect(); }, Math.min(30000, 2000 * (cw.fails + 1))); }
    function cwDisconnect() {
        clearTimeout(cw.retryT); clearInterval(cw.pingT); clearTimeout(cw.readT); clearTimeout(cw.syncT); cw.syncT = null; clearTimeout(cw.alT); cw.alT = null; clearTimeout(cw.wsRetryT);
        if (cw.ws) { try { cw.ws.onclose = null; cw.ws.close(); } catch (e) {   } cw.ws = null; }
    }
    function cwStartSync() {
        clearTimeout(cw.syncT);
        cw.syncT = -1;
        cwStats(false); cwSyncRun();
    }
    async function cwSyncRun() {
        clearTimeout(cw.syncT); cw.syncT = -1;
        if (!cwWanted() || (cw.ws && cw.ws.readyState === 1)) { cw.syncT = null; return; }
        if (cw.syncBusy) { cw.syncAgain = true; return; }
        cw.syncBusy = true;
        try {
            // [HB Suite] Hub API — /cw/sync (batched messages; token from /cw/hello)
            const r = await postTo('/cw/sync', { token: cw.token, out: cw.out.splice(0, 20), since: 0 });
            cw.lastMsg = Date.now();
            (r.in || []).forEach(cwIn);
            cw.err = cw.err && (/^Polling/.test(cw.err) || cw.err === CW_BLOCKED) ? cw.err : '';
        } catch (e) {
            cw.syncBusy = false;
            if (/bad_token/.test(e.message)) { cw.token = null; store.set(K.cwTok, null); cw.syncT = null; cwConnect(); return; }
            cw.err = 'Chain Watch poll failed: ' + e.message; cwShow();
        }
        cw.syncBusy = false;
        if (cw.ws && cw.ws.readyState === 1) { cw.syncT = null; return; }
        if (cw.syncAgain) { cw.syncAgain = false; cw.syncT = setTimeout(cwSyncRun, 50); return; }
        const c = cwChain(), left = c && c.current > 0 ? (num(c.expires_at) - cwNow()) / 1000 : 9e9;
        cw.syncT = setTimeout(cwSyncRun, left < num((cw.state && cw.state.config || {}).topAlertSeconds || 90) ? 5000 : 15000);
        cwAlSched();
    }
    const cwAlMarks = () => { const g = (cw.state && cw.state.config) || {};
        return [num(g.topAlertSeconds), num(g.restAlertSeconds), num(g.thirdAlertSeconds), 30, 15].filter(x => x > 0); };
    function cwAlSched() {
        clearTimeout(cw.alT); cw.alT = null;
        if (!cw.syncT || (cw.ws && cw.ws.readyState === 1)) return;
        const c = cwChain(), g = (cw.state && cw.state.config) || {};
        if (!c || !(c.current > 0) || !num(c.expires_at) || c.current < num(g.minChain)) return;
        const now = cwNow(), due = [];
        cwAlMarks().forEach(sec => [300, 1500].forEach(d => { const at = num(c.expires_at) - sec * 1000 + d; if (at > now + 50) due.push(at); }));
        if (!due.length) return;
        cw.alT = setTimeout(() => { cw.alT = null;
            if (cw.syncT && cw.syncT !== -1 && !(cw.ws && cw.ws.readyState === 1)) { clearTimeout(cw.syncT); cwSyncRun(); }
            else if (cw.syncBusy) cw.syncAgain = true;
            else cwAlSched(); }, Math.min(...due) - now);
    }
    function cwAlTilesHtml(cfg) {
        const st = [num(cfg.topAlertSeconds), num(cfg.restAlertSeconds), num(cfg.thirdAlertSeconds)].filter(x => x > 0).sort((a, b) => b - a);
        const who = i => i === 0 ? (cfg.firstAlertPrimaryOnly ? '#1' : 'All active') : i === 1 ? '#1 + #2' : 'All queued';
        return `<div class="hbs-altiles" data-altiles data-min="${num(cfg.minChain)}">`
            + st.map((x, i) => `<div data-alsec="${x}"${i === st.length - 1 && st.length > 1 ? ' data-allast="1"' : ''}><span data-allab="Alert ${i + 1}">Alert ${i + 1}</span><b>${mSec(x)}</b><i>${who(i)}</i></div>`).join('')
            + `<div data-almin><span>Min chain</span><b>${int(cfg.minChain)}</b><i>hits</i></div></div>`;
    }
    function cwAlTilesTick() {
        const box = bodyEl && bodyEl.querySelector('[data-altiles]'); if (!box) return;
        const c = cwChain(), live = !!(c && c.current > 0 && num(c.expires_at) > cwNow()), min = num(box.dataset.min);
        const left = live ? (num(c.expires_at) - cwNow()) / 1000 : null, ok = live && c.current >= min;
        let next = null;
        box.querySelectorAll('[data-alsec]').forEach(d => { const sec = num(d.dataset.alsec), sent = ok && left <= sec;
            if (ok && !sent && next == null) next = d;
            d.className = sent ? (d.dataset.allast ? 'sent last' : 'sent') : live && !ok ? 'off' : '';
            const l = d.querySelector('[data-allab]'); if (l) l.textContent = l.dataset.allab + (sent ? ' · sent' : ''); });
        if (next) next.classList.add('next');
        const m = box.querySelector('[data-almin]');
        if (m) { m.className = !live || !min ? '' : ok ? 'met' : 'below';
            m.querySelector('b').textContent = live && min && !ok ? `${int(c.current)} / ${int(min)}` : int(min);
            m.querySelector('i').textContent = !live || !min ? 'hits' : ok ? 'met' : 'alerts off'; }
    }
    setInterval(() => { if (!collapsed && tab === 'chain') cwAlTilesTick(); }, 1000);
    setInterval(() => { try { document.querySelectorAll('#hbs-panel input:not([data-lpignore]), #hbs-panel textarea:not([data-lpignore]), #hbs-compact input:not([data-lpignore])').forEach(i => {
        i.setAttribute('data-lpignore', 'true'); i.setAttribute('data-1p-ignore', ''); i.setAttribute('data-bwignore', ''); i.setAttribute('data-form-type', 'other');
        if (!i.hasAttribute('autocomplete')) i.setAttribute('autocomplete', 'off'); }); } catch (e) {   } }, 1200);
    function cwSyncSoon() { if (cw.syncT && !(cw.ws && cw.ws.readyState === 1)) { clearTimeout(cw.syncT); cw.syncT = setTimeout(cwSyncRun, 120); } }
    function cwWatch() { if (cwWanted()) cwConnect(); else if (cw.ws || cw.syncT) cwDisconnect(); }
    setInterval(() => {
        if (!cwWanted()) return;
        if (cw.ws && cw.ws.readyState === 1 && Date.now() - (cw.lastMsg || 0) > 45000) { try { cw.ws.close(); } catch (e) {   } return; }
        if (!cw.ws && !cw.syncT && !cw.connecting && !cw.retryT) cwConnect();
    }, 5000);

    let cwVerifyAt = 0;
    const cwLeft = () => { const c = cwChain(); return c.current > 0 ? num(c.expires_at) - cwNow() : 0; };
    setInterval(() => {
        const c = cwChain();
        if (!(c.current > 0) || !cw.state || cw.state.restored) { cwVerifyAt = 0; return; }
        if (cwLeft() > 0) { cwVerifyAt = 0; return; }
        if (cwVerifyAt && Date.now() - cwVerifyAt < 15000) return;
        if (!cwVerifyAt) { try { alStopAll(); } catch (e) {   } }
        cwVerifyAt = Date.now(); cwSend({ t: 'verify', chain: c.current });
        if (tab === 'chain' && !collapsed && !cwBusy()) render(true);
    }, 1000);
    let cwWasBackup = false;
    function cwNextUp() {
        const S = cw.state || {}, t = S.turn || {}, c = cwChain(), cfg = S.config || {};
        const isB = !!(me && t.backup && num(t.backup) === me.id && num(t.up) !== me.id && c.current > 0 && c.current >= num(cfg.minChain));
        if (isB && !cwWasBackup) toast(`⏭ You're next - backup behind ${esc(((S.queue || []).find(x => num(x.pid) === num(t.up)) || {}).name || 'who\'s up')}. Get ready.`, false);
        cwWasBackup = isB;
    }
    function bonusGuard() {
        const S = cw.state || {}, b = S.bonus || {}, c = cwChain();
        if (!b.pid || !b.next || !me || num(b.pid) === me.id || !(c.current > 0)) return null;
        const left = num(b.next) - c.current;
        return left > 0 && left <= 5 ? { left, name: b.name || '#' + b.pid, next: num(b.next), last: left === 1 } : null;
    }
    function cwIn(m) {
        if (!m || !m.t) return;
        if (m.now) cw.offset = num(m.now) - Date.now();
        if (m.t === 'alert') { cwHubAlert(m); return; }
        if (m.t === 'panic') { cwHubPanic(m); return; }
        if (m.t === 'dump') { dmIn(m); return; }
        if (m.t === 'diag') { cw.diag = m; if (tab === 'chain') render(true); return; }
        if (m.t === 'notice') {
            if (m.kind === 'join_refused') { cw.optimistic = null; cw.queued = false; store.set(K.cwq, false); cwShow(); }
            alertMe(m.text || m.kind, false); return; }
        if (m.t === 'mode') { cw.mode = m.mode; return; }
        if (m.suite) updFromHub(m.suite);
        if (m.chain) { cw.hubAt = Date.now();
            try { store.set(K.cwSnap, { chain: m.chain, offset: num(m.now) - Date.now(), at: Date.now() }); } catch (e) {   } }
        if (m.t === 'state') cw.state = m;
        else if (m.t === 'sync') cw.state = Object.assign(cw.state || {}, m);
        else return;
        const q = (cw.state.queue || []), i = q.findIndex(x => num(x.pid) === me.id);
        const was = cw.queued; cw.queued = i >= 0; cw.queuePos = i + 1;
        if (cw.optimistic && Date.now() - cw.optimistic.at < 20000 && cw.queued !== cw.optimistic.queued) cw.queued = cw.optimistic.queued;
        else cw.optimistic = null;
        if (was !== cw.queued) { store.set(K.cwq, cw.queued); cwPresence(); }
        alWatch(); cwReadPlan(); drawChips(); rtChime();
        cwNextUp();
        if (m.t === 'state' && m.me && m.me.rejoin && !cw.queued && Date.now() - (cw.rejoinAt || 0) > 60000) {
            cw.rejoinAt = Date.now();
            cwAction('join').then(() => toast("⛓ You were offline 60+ min and left the Chain Watch queue - you've been put back in.", true), () => {});
        }
        cwShow();
    }
    const cwBusy = () => { const a = document.activeElement; return !!(a && panel.contains(a) && /SELECT|INPUT|TEXTAREA/.test(a.tagName)); };
    function cwPresence() {
        clearInterval(cw.presT);
        const beat = () => { if (cw.queued && !document.hidden && cw.ws && cw.ws.readyState === 1) { try { cw.ws.send('{"t":"presence"}'); } catch (e) {   } } };
        if (cw.queued) { beat(); cw.presT = setInterval(beat, 45000); }
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden && cw.queued) cwPresence(); });

    function cwStatsCached(maxAge) { const c = store.get(K.cwStats, null); return c && Date.now() - num(c.at) < (maxAge || 600000) ? c.s : null; }
    async function cwStats(force) {
        if (!getKey() || document.hidden) return null;
        const last = store.get(K.cwStats, null), age = last ? Date.now() - num(last.at) : 9e9;
        if (age < 29500) { if (force && last) cwSend(Object.assign({ t: 'stats' }, last.s)); return last && last.s; }
        if (!force && !cw.queued && cw.statsSent) return null;
        cw.statsSent = true;
        try {
            // [HB Suite] Torn API — your energy / cooldowns / refill for the Chain Watch queue (v1 bars,cooldowns,refills)
            const d = await tornGet('https://api.torn.com/user/?selections=bars,cooldowns,refills');
            const e = (d && d.energy) || {}, cd = (d && d.cooldowns) || {}, rf = (d && d.refills) || {};
            const st = { energyCur: num(e.current), energyMax: num(e.maximum), energyInc: num(e.increment), energyInt: num(e.interval),
                         energyTick: num(e.ticktime), drug: num(cd.drug), booster: num(cd.booster), medical: num(cd.medical), refill: rf.energy_refill_used ? 0 : 1 };
            store.set(K.cwStats, { s: st, at: Date.now() });
            cwSend(Object.assign({ t: 'stats' }, st));
            cw.statsErr = '';
            return st;
        } catch (x) {
            const was = cw.statsErr; cw.statsErr = String((x && x.message) || 'Torn did not answer').replace(/^Torn: /, '').replace(/ - this needs a key with Faction API access\.?$/, '');
            if (!was && cw.queued && tab === 'chain' && !cwBusy()) render(true);
            return null;
        }
    }
    setInterval(() => { if ((cw.ws || cw.syncT) && cw.queued) cwStats(false); }, 10000);
    function cwReadPlan() {
        clearTimeout(cw.readT);
        const S = cw.state || {}, c = S.chain || {}, cfg = S.config || {};
        if (!getKey() || !(c.current > 0)) return;
        const left = (num(c.expires_at) - cwNow()) / 1000;
        if (!cw.queued && !(left > 0 && left <= num(cfg.topAlertSeconds || 90))) return;
        const phase = num((S.me || {}).phase_ms) % 30000, wait = (30000 - ((cwNow() - phase) % 30000) + 30000) % 30000 || 30000;
        cw.readT = setTimeout(async () => {
            try {
                // [HB Suite] Torn API — v2 faction/chain (the reading is sent to the Hub; the key stays here)
                const d = await tornGet('https://api.torn.com/v2/faction/chain');
                const ch = (d && d.chain) || {};
                if (num(ch.current) > 0) cwSend({ t: 'chain', current: num(ch.current), max: num(ch.max), timeout: num(ch.timeout), cooldown: num(ch.cooldown),
                                                  modifier: ch.modifier, start: num(ch.start), end: num(ch.end) });
            } catch (x) {   }
            cwReadPlan();
        }, wait);
    }

    const PAGE_CHAIN_MIN_MS = 30000, PAGE_LOCAL_TTL_MS = 10000;
    let pageSentAt = 0, pageSentCount = -1, pageObs = null, pageEl = null;
    const pageScrapeAllowed = () => !document.hidden && (typeof document.hasFocus === 'function' ? document.hasFocus() : true);
    function cwChain() {
        const h = (cw.state && cw.state.chain) || {}, p = cw.page;
        if (p && pageScrapeAllowed() && Date.now() - p.at < PAGE_LOCAL_TTL_MS && p.current >= num(h.current))
            return { current: p.current, max: num(h.max), expires_at: p.expires_at, src: 'page' };
        return h;
    }
    function parseChainCount(text) {
        const cleaned = String(text == null ? '' : text).replace(/\d{1,2}:\d{2}(?::\d{2})?/g, ' ');
        const slash = cleaned.match(/(\d[\d,]*)\s*\/\s*\d[\d,]*/);
        if (slash) return parseInt(slash[1].replace(/,/g, ''), 10);
        const m = cleaned.match(/(?:^|[^\d.,])(\d[\d,]{0,7})(?![\d.])/);
        return m ? parseInt(m[1].replace(/,/g, ''), 10) : NaN;
    }
    function parseClockMs(txt) {
        const m = String(txt == null ? '' : txt).match(/(?:(\d+):)?(\d{1,2}):(\d{2})/);
        if (!m) return null;
        const h = m[1] ? Number(m[1]) : 0, mn = Number(m[2]), sc = Number(m[3]);
        if (mn > 59 || sc > 59) return null;
        const ms = (h * 3600 + mn * 60 + sc) * 1000;
        return ms > 300000 ? null : ms;
    }
    function readPageChain() {
        try {
            for (const te of document.querySelectorAll('[class*="bar-timeleft"], [class*="barTimeleft"], [class*="timeleft___"]')) {
                const bar = (te.closest && (te.closest('[class*="bar___"]') || te.closest('[class*="chain"]'))) || te.parentElement;
                if (!bar || bar.closest('#hbs-panel')) continue;
                const label = bar.querySelector && (bar.querySelector('[class*="bar-name"]') || bar.querySelector('[class*="barName"]'));
                const name = ((label && label.textContent) || bar.getAttribute('aria-label') || bar.textContent || '').toLowerCase();
                if (name.indexOf('chain') === -1) continue;
                const remMs = parseClockMs(te.textContent);
                if (remMs == null) continue;
                let count = NaN;
                const valEl = bar.querySelector && (bar.querySelector('[class*="bar-value"]') || bar.querySelector('[class*="barValue"]'));
                if (valEl) count = parseChainCount(valEl.textContent);
                if (!Number.isFinite(count)) count = parseChainCount(bar.textContent || '');
                if (Number.isFinite(count)) return { count, remainingMs: remMs, el: bar };
            }
            for (const box of document.querySelectorAll('[class*="chain-box"], [class*="chainBox"], [class*="chain___"]')) {
                if (box.closest('#hbs-panel')) continue;
                const t = box.textContent || '';
                if (t.toLowerCase().indexOf('chain') === -1) continue;
                const remMs = parseClockMs(t);
                if (remMs == null) continue;
                const count = parseChainCount(t);
                if (Number.isFinite(count)) return { count, remainingMs: remMs, el: box };
            }
        } catch (e) {   }
        return null;
    }
    function pageStop() { if (pageObs) { try { pageObs.disconnect(); } catch (e) {   } } pageObs = null; pageEl = null; }
    function scanPageChain() {
        try {
            if (!modOn('chain') || !(cw.ws || cw.syncT) || !pageScrapeAllowed()) { pageStop(); return; }
            const r = readPageChain();
            if (!r || !(r.count > 0) || r.remainingMs == null) return;
            const hubRef = cw.hubAt && Date.now() - cw.hubAt < 120000 ? num((cw.state && cw.state.chain || {}).current) : 0;
            if (hubRef > 0 && (r.count < hubRef - 5 || r.count > hubRef + 500)) return;
            if (r.el && r.el !== pageEl) {
                pageStop(); pageEl = r.el;
                try { pageObs = new MutationObserver(() => { clearTimeout(scanPageChain._t); scanPageChain._t = setTimeout(scanPageChain, 200); });
                      pageObs.observe(r.el, { subtree: true, childList: true, characterData: true }); } catch (e) {   }
            }
            const prev = cw.page;
            cw.page = { current: r.count, expires_at: cwNow() + Math.min(300000, r.remainingMs), at: Date.now() };
            if (!prev || prev.current !== r.count) { drawChips(); cwShow(); }
            else { const v = cwLocal(cw.page.expires_at); panel && panel.querySelectorAll('[data-cwexp]').forEach(x => { x.dataset.exp = v; }); }
            if (!(cw.ws && cw.ws.readyState === 1)) return;
            const now = Date.now(), changed = r.count !== pageSentCount;
            if (!changed && now - pageSentAt < PAGE_CHAIN_MIN_MS) return;
            pageSentAt = now; pageSentCount = r.count;
            try { cw.ws.send(JSON.stringify({ t: 'chain', src: 'page', current: r.count, end_ms: cwNow() + r.remainingMs, remaining_ms: Math.min(300000, r.remainingMs) })); }
            catch (e) {   }
        } catch (e) {   }
    }
    setInterval(scanPageChain, 1000);
    const pageFocus = () => { if (pageScrapeAllowed()) { pageSentCount = -1; scanPageChain(); } else pageStop(); };
    window.addEventListener('focus', pageFocus); window.addEventListener('blur', pageFocus);
    document.addEventListener('visibilitychange', pageFocus);
    const cwWake = () => { if (document.hidden || !cwWanted()) return;
        if (cw.syncT && !(cw.ws && cw.ws.readyState === 1)) { clearTimeout(cw.syncT); cw.syncT = setTimeout(cwSyncRun, 50); } };
    document.addEventListener('visibilitychange', cwWake); window.addEventListener('focus', cwWake);

    const CMP = () => !!uiOpt('compact');
    const cfOpen = k => !!(store.get(K.cfold, {}) || {})[k];
    function cFold(key, icon, title, meta, body, alert, defOpen) {
        const M = store.get(K.cfold, {}) || {}, o = key in M ? !!M[key] : !!defOpen;
        return cwFold(`data-cfold="${key}"${defOpen ? ' data-cfdef="1"' : ''}`, icon, title, meta, o, alert) + (o ? `<div class="hbs-foldb">${body}</div>` : '');
    }
    document.addEventListener('click', e => {
        const b = e.target && e.target.closest && e.target.closest('#hbs-panel [data-cfold]'); if (!b) return;
        const m = store.get(K.cfold, {}) || {}, k = b.dataset.cfold; m[k] = !(k in m ? m[k] : b.dataset.cfdef === '1'); store.set(K.cfold, m); render(true);
    });
    function cmCard(key, icon, title, meta, alert, html) {
        if (!CMP()) return html;
        const m = /^\s*<div class="hbs-card[^"]*"><div class="hbs-r1">[\s\S]*?<\/div>/.exec(html), e = html.lastIndexOf('</div>');
        if (!m || e < m[0].length) return html;
        return cFold(key, icon, title, meta, html.slice(m[0].length, e), alert);
    }
    async function chainCompactHtml(X) {
        const { S, c, cfg, turn, bonus, rw, q, st, nm, live, hubAge } = X, lead = !!(S.me || {}).is_leader;
        let out = hubAge > 75000 ? `<div class="hbs-banner hbs-warnb">⚠ No update from the Hub for <b>${dur(hubAge / 1000)}</b> - may be out of date. Asking again…</div>` : '';
        const go = live && bonus.next ? Math.max(0, num(bonus.next) - c.current) : 0, pc = num(bonus.pace_per_min);
        const conn = cw.ws && cw.ws.readyState === 1 ? ['', 'Live'] : cw.syncT ? [' poll', 'Polling'] : [' off', 'Offline'];
        const sub = !live ? (S.cooldown && S.cooldown.until ? `next chain in <b data-exp="${cwLocal(S.cooldown.until)}">-</b>` : 'no active chain')
            : cwVerifyAt && cwLeft() <= 0 ? 'timer ran out - checking…'
            : bonus.next ? `🎯 bonus ${int(bonus.next)} · <b>${int(go)}</b> to go${pc > 0 ? ` · ~${dur(go / pc * 60)}` : ''}` : 'left on the timer';
        out += `<div class="hbs-card hbs-hero"><div class="hbs-cmtop">
            <div class="hbs-cmt${live ? '' : ' dead'}">${live ? `<span data-cwexp data-exp="${cwLocal(c.expires_at)}" data-zero="00:00">-</span>` : '00:00'}</div>
            <div class="hbs-cmi"><b>⛓ ${live ? int(c.current) + ' / ' + int(c.max) : 'No live chain'}</b><small>${sub}</small></div>
            <span class="hbs-cmdot${conn[0]}" title="${conn[1]}">●</span>
            <button type="button" class="hbs-btn${cvOptOpen ? '' : ' hbs-ghost'} hbs-cmic" data-cvopt title="Compact View - a small tab on the screen edge">⛶</button></div>
            ${cw.err ? `<div class="hbs-hint">${esc(cw.err)}</div>` : ''}`;
        if (live && turn.up) out += `<div class="hbs-cmup">Up: ${nm(turn.up)}${num(turn.up) === me.id ? ' <b class="hbs-good">(you)</b>' : ''}${turn.backup ? ` · Backup: ${nm(turn.backup)}${num(turn.backup) === me.id ? ' <b class="hbs-good">(you)</b>' : ''}` : ''}</div>`;
        if (live && bonus.next && c.current >= num(bonus.warn_from))
            out += `<div class="hbs-banner">🎯 Bonus hit <b>${int(bonus.next)}</b> in ${int(bonus.next - c.current)}${bonus.name ? ` · taken by <b>${esc(bonus.name)}</b>` : ''}
                ${bonus.pid && c.current === bonus.next - 1 && num(bonus.pid) !== me.id ? '<br><b>Hold - the bonus is theirs</b>' : ''}</div>`;
        else if (bonus.pid) out += `<div class="hbs-bonusline">★ Bonus <b>${bonus.next ? int(bonus.next) : ''}</b> → <b>${esc(bonus.name || '#' + bonus.pid)}</b>
            ${lead ? ' <button type="button" class="hbs-btn hbs-ghost hbs-mini" data-cwbonusclr>Clear</button>' : ''}</div>`;
        if (rw) {
            const mins = rw.hours != null ? Math.max(0, Math.round(+rw.hours * 60)) : null;
            const canNow = q.filter(x => x.can_hit !== false && !x.away && !x.inactive && (!x.presence || x.presence === 'active') && (() => { const e = cwEnergy(x); return e && e.cur >= 25; })()).length;
            const lvl = mins == null ? 'ok' : mins < 15 ? 'low' : mins < 30 ? 'warn' : 'ok';
            const span = mins == null ? '' : mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h${mins % 60 ? ' ' + (mins % 60) + ' min' : ''}`;
            const head = mins == null ? 'Covered - regen keeps pace' : mins === 0 ? "Can't cover" : `Covered ~${span}`, o = cfOpen('cwcov');
            out += `<div class="hbs-cover ${lvl} hbs-cmcov${o ? ' open' : ''}" data-cfold="cwcov" role="button"><b>${lvl === 'low' ? '⚠' : lvl === 'warn' ? '⏳' : '✓'} ${head}</b>
                <span>· ${int(rw.banked_hits)} hit${num(rw.banked_hits) === 1 ? '' : 's'} · ${canNow}/${q.length} can hit</span><em>${o ? '▾' : '▸'}</em></div>`
                + (o ? `<div class="hbs-cover ${lvl} hbs-cmcovd"><div class="d">${mins ? `Holds the chain at the slowest safe pace until ~${tzClock(Math.floor(cwNow() / 1000) + mins * 60)} ${tzTagH()}. ` : mins === 0 ? 'No hits ready in the queue right now. ' : ''}
                    ${int(rw.banked_hits)} hits ready · ${canNow} of ${q.length} can hit now${bonus.next ? ` · <span class="${rw.bonus_reachable ? 'y' : 'n'}">bonus ${int(bonus.next)} ${rw.bonus_reachable ? 'in reach ✓' : 'out of reach ✗'}</span>` : ''}</div></div>` : '');
        }
        out += cw.queued ? `<div class="hbs-actions hbs-cmact">${hitBtn('chain')}
                <button type="button" class="hbs-btn hbs-ghost hbs-cmic" data-cw="target" title="Find target - open a weak target's attack page (level 1-3, inactive 60+ days)">🎯<small>Target</small></button>
                <button type="button" class="hbs-btn hbs-ghost hbs-cmic" data-cw="away" title="${(q.find(x => num(x.pid) === me.id) || {}).away ? "I'm back" : 'Away - skip me for now'}">${(q.find(x => num(x.pid) === me.id) || {}).away ? '↩<small>Back</small>' : '⏸<small>Away</small>'}</button>${dmBtnHtml().replace('💩</button>', '💩<small>Dump</small></button>')}
                <button type="button" class="hbs-btn hbs-ghost hbs-cmic" data-cw="leave" title="Leave the queue"><small class="only">Leave</small></button></div>`
            : `<div class="hbs-actions hbs-cmact"><button type="button" class="hbs-btn" data-cw="join">Join the queue</button></div>`;
        out += '</div>' + cvChainHtml().replace(/^<div class="hbs-actions">[\s\S]*?<\/div>/, '');
        { const mineQ = q.find(x => num(x.pid) === me.id);
          if (mineQ && !mineQ.stats && (cw.statsErr || !cwStatsCached(600000)))
            out += `<div class="hbs-banner hbs-warnb">⚠ <b>Your energy and cooldowns aren't reaching the queue.</b>
                ${cw.statsErr ? `Torn said: <i>${esc(cw.statsErr)}</i>. ` : ''}Needs a <b>Limited Access</b> key or higher, and Torn open in a visible tab.
                <div class="hbs-actions"><button type="button" class="hbs-btn hbs-mini" data-cw="statsretry">↻ Try again</button></div></div>`; }
        const qOk = q.filter(x => !x.away && !x.inactive && (!x.presence || x.presence === 'active'));
        const capHits = qOk.reduce((a, x) => { const e = cwEnergy(x); return a + (e ? Math.floor(e.cur / 25) : 0); }, 0);
        out += dmLineHtml() + `<div class="hbs-cmal">${cwAlTilesHtml(cfg)}</div>`;
        out += `<div class="hbs-sec hbs-cmq"><span>Queue · ${q.length}</span>${q.length ? `<span class="hbs-cap${capHits === 0 ? ' low' : capHits < 5 ? ' warn' : ''}">${qOk.length ? `⚡ ~${int(capHits)} hits · ${qOk.length} online` : '⚠ no watchers online'}</span>` : ''}</div>`
            + (q.length ? cwQueueHtml(q, st, turn, bonus) : '<div class="hbs-hint">Nobody queued.</div>');
        out += retalsHtml() + schedHtml();
        if (lead && (S.me || {}).members) out += cFold('cwbonus', '★', 'Bonus hitter', bonus.pid ? `<span class="hbs-foldme">${esc(bonus.name || '#' + bonus.pid)}</span>` : '<small>not assigned</small>',
            `<div class="hbs-actions"><select class="hbs-input" data-cwbonus><option value="">🎯 Assign bonus…</option><option value="clear">Clear</option>
                ${S.me.members.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })).map(m => `<option value="${m.pid}">${esc(m.name)}</option>`).join('')}</select></div>`, false);
        const cfgUrl = lead && cfg.edit_url ? String(cfg.edit_url) : '';
        out += cFold('cwset', '⚙', 'Alerts & settings', `<small>${[cfg.topAlertSeconds, cfg.restAlertSeconds, cfg.thirdAlertSeconds].filter(x => num(x) > 0).map(mSec).join(' / ')} · min ${int(cfg.minChain)}</small>`,
            `<div class="hbs-actions"><button type="button" class="hbs-btn${alOpen ? '' : ' hbs-ghost'}" data-alopen>⚙ Configure alerts</button>${alOpen ? '' : '<button type="button" class="hbs-btn hbs-ghost" data-cw="test">🔔 Test my alerts</button>'}
                ${lead ? `<button type="button" class="hbs-btn${cwCfg.open ? '' : ' hbs-ghost'}" data-cwcfgopen>🛠 Chain settings ${cwCfg.open ? '▾' : '▸'}</button>` : ''}</div>` + cwCfgHtml(cfg, cfgUrl) + alertsCfgHtml(), false);
        { let meta = '';
          try { const C = await readOpt('m', 'db/chains.json'), L = ((C && C.chains) || []).map(x => (x.m || []).find(r => num(r[0]) === me.id)).filter(Boolean);
                meta = L.length ? `<small>${L.length} chain${L.length === 1 ? '' : 's'} · ${int(L.reduce((a, r) => a + num(r[1]), 0))} hits</small>` : '<small>none yet</small>'; } catch (e) {   }
          out += cFold('cwsum', '⛓', 'Your chain summary', meta, cfOpen('cwsum') ? (await chainSummaryHtml()).replace(/^<div class="hbs-sec">[^<]*<\/div>/, '') : '', false); }
        return out;
    }
    function ocCmHero(cur) {
        const p = cur.pay || {}, open = num(cur.filled) < num(cur.seats);
        return `<div class="hbs-card hbs-hero hbs-cm4"><div class="hbs-cmtop">
            <div class="hbs-cmi"><b>${esc(cur.crime)} <span class="hbs-chip">${esc(cur.status)}</span></b>
                <small>${esc(cur.position)}${cur.rate != null ? ` · <b>${cur.rate}%</b> CPR` : ''}${cur.difficulty != null ? ` · difficulty ${esc(String(cur.difficulty))}` : ''}</small></div>
            ${p.pay_day ? `<div class="hbs-cmpay"><b>${shortMoney(p.pay_day)}</b><small>${p.yours ? 'joined at' : 'pay'} / day</small></div>` : ''}</div>
            ${rsTiles([[`${cur.filled}/${cur.seats}`, 'Filled'], [Math.round(cur.progress) + '%', 'Planning'], [cur.success != null ? Math.round(cur.success) + '%' : '-', 'Team'],
                cur.ready_at ? [`<span data-until="${ocEarliest(cur)}">-</span>`, open ? 'Earliest' : 'Ready in'] : null])}
            ${cFold('ocseats', '💺', 'Seats & pay', `<small>${cur.filled}/${cur.seats} filled${p.normal ? ` · normal ${shortMoney(p.normal)}` : ''}</small>`,
                payHero(cur.pay, 0, false, true) + (cur.ready_at ? `<div class="hbs-hint">${open ? 'Earliest ready time' : 'Ready'}: ${ocWhen(ocEarliest(cur))}</div>` : '')
                + slotsHtml(cur).replace(/^<div class="hbs-sec">[^<]*<\/div>/, ''), false)}
            <div class="hbs-actions"><a class="hbs-btn hbs-ghost" href="${OC_LINK(cur.crime_id)}">Open the crime</a></div></div>`;
    }
    async function ocRecentHtml() {
        let R = null;
        // [HB Suite] Hub API — op live "recent" (OC tab: the last completed crimes and their payout state; no Torn call)
        try { R = await live('recent'); } catch (e) { return ''; }
        const rows = (R && R.rows) || []; if (!rows.length) return '';
        const late = rows.filter(r => r.late).length, unpaid = rows.filter(r => r.unpaid).length;
        const tag = r => r.late ? `<span class="hbs-tag hbs-red">Not paid · ${dur(Math.max(0, Date.now() / 1000 - r.at))}</span>`
            : r.unpaid ? '<span class="hbs-tag">Awaiting payout</span>' : r.paid ? '<span class="hbs-tag hbs-good">Paid</span>' : '<span class="hbs-tag">No payout</span>';
        const list = rows.map(r => `<div class="hbs-li"><span style="min-width:0"><a href="${OC_LINK(r.id)}"><b>${esc(r.name || '?')}</b></a>
            <small style="display:block;opacity:.7;font-size:10.5px">${r.ok ? 'Success' : 'Failed'} · ${ago(r.at)}${r.money ? ' · ' + shortMoney(r.money) : ''}${r.items ? ` · ${r.items} item${r.items === 1 ? '' : 's'}` : ''}</small></span>${tag(r)}</div>`).join('');
        const head = late ? `<span class="hbs-chip" style="background:#5f2f2f;color:#ffbcbc">${late} unpaid</span>` : '';
        if (CMP()) return cFold('ocrecent', '✅', 'Recently completed', late ? `<b class="hbs-foldn">${late}</b><small>unpaid</small>` : `<small>${rows.length} crime${rows.length === 1 ? '' : 's'}${unpaid ? ` · ${unpaid} awaiting payout` : ' · all paid'}</small>`, list, late > 0);
        return `<div class="hbs-card${late ? ' hbs-red' : ''}"><div class="hbs-r1"><span class="hbs-name">✅ Recently completed</span>${head}</div>
            ${late ? `<div class="hbs-hint">${late} crime${late === 1 ? " hasn't" : "s haven't"} been paid out after more than an hour.</div>` : ''}${list}</div>`;
    }
    async function chainHtml() {
        if (!modOn('chain')) return `<div class="hbs-empty">The Chain module is off - turn it on in ⚙.</div>`;
        if (cw.denied) return `<div class="hbs-empty">Chain Watch refused this account (${esc(cw.denied)}).</div>`;
        cwWatch();
        const S = cw.state;
        if (!S) return `<div class="hbs-empty">${esc(cw.step || 'Connecting to Chain Watch…')}${cw.err ? `<div class="hbs-msg">${esc(cw.err)}</div>` : ''}
            <div class="hbs-actions" style="justify-content:center"><button type="button" class="hbs-btn hbs-ghost" data-cw="retry">↻ Retry now</button></div></div>`;
        const c = cwChain(), cfg = S.config || {}, turn = S.turn || {}, bonus = S.bonus || {}, rw = S.runway || null;
        let q = S.queue || [];
        const st = S.status || {}, N = await names().catch(() => ({ byId: {} }));
        if (cw.optimistic && Date.now() - cw.optimistic.at < 20000) {
            if (!cw.optimistic.queued) q = q.filter(x => num(x.pid) !== me.id);
            else if (!q.some(x => num(x.pid) === me.id)) q = q.concat([{ pid: me.id, name: me.name, energy: null, can_hit: true }]);
        }
        const nm = pid => `<a href="#" data-prof="${num(pid)}">${esc(((q.find(x => num(x.pid) === num(pid)) || {}).name) || nameOf(N, pid))}</a>`;
        const live = c.current > 0;
        const hubAge = cw.lastMsg ? Date.now() - cw.lastMsg : 0;
        if (hubAge > 75000) cwSyncSoon();
        if (CMP()) return await chainCompactHtml({ S, c, cfg, turn, bonus, rw, q, st, nm, live, hubAge });
        let out = cvChainHtml() + (hubAge > 75000 ? `<div class="hbs-banner hbs-warnb">⚠ No update from the Hub for <b>${dur(hubAge / 1000)}</b> - what's below may be out of date. Asking again…</div>` : '')
            + `<div class="hbs-card hbs-hero"><div class="hbs-r1"><span class="hbs-name">⛓ ${live ? int(c.current) + ' / ' + int(c.max) : 'No live chain'}</span>
            <span class="hbs-chip">${cw.ws && cw.ws.readyState === 1 ? '● Live' : cw.syncT ? '● Polling' : '○ Offline'}</span></div>${cw.err ? `<div class="hbs-hint">${esc(cw.err)}</div>` : ''}`;
        if (live) out += `<div class="hbs-big"><span data-cwexp data-exp="${cwLocal(c.expires_at)}" data-zero="00:00">-</span><small>${cwVerifyAt && cwLeft() <= 0 ? 'timer ran out - checking with the Hub…' : 'left on the timer' + (c.src === 'page' ? ' · live from your Torn page' : '')}</small></div>`;
        else out += `<div class="hbs-big hbs-dead">00:00<small>no active chain</small></div>`
            + (S.cooldown && S.cooldown.until ? `<div class="hbs-sub">Next chain can start in <b data-exp="${cwLocal(S.cooldown.until)}">-</b></div>` : '');
        if (live && bonus.next) { const go = Math.max(0, num(bonus.next) - c.current), pc = num(bonus.pace_per_min);
            out += `<div class="hbs-goal"><span>🎯 Next bonus <b>${int(bonus.next)}</b></span><span><b>${int(go)}</b> hits to go</span>
                <span>${pc > 0 ? `~<b>${dur(go / pc * 60)}</b> at ${pc >= 10 ? pc.toFixed(0) : pc.toFixed(1)} hits/min` : 'pace: not enough hits yet'}</span></div>`; }
        if (live && turn.up) out += kv([['Up now', nm(turn.up) + (num(turn.up) === me.id ? ' <b class="hbs-good">(you)</b>' : '')],
                                         turn.backup ? ['Backup', nm(turn.backup) + (num(turn.backup) === me.id ? ' <b class="hbs-good">(you)</b>' : '')] : null]);
        if (live && bonus.next && c.current >= num(bonus.warn_from))
            out += `<div class="hbs-banner">🎯 Bonus hit <b>${int(bonus.next)}</b> in ${int(bonus.next - c.current)}${bonus.name ? ` · taken by <b>${esc(bonus.name)}</b>` : ''}
                ${bonus.pid && c.current === bonus.next - 1 && num(bonus.pid) !== me.id ? '<br><b>Hold - the bonus is theirs</b>' : ''}</div>`;
        else if (bonus.pid) out += `<div class="hbs-bonusline">★ Bonus hit <b>${bonus.next ? int(bonus.next) : ''}</b> assigned to <b>${esc(bonus.name || '#' + bonus.pid)}</b>${bonus.by ? ` <small>· by ${esc(String(bonus.by).replace(/ \[\d+\]$/, ''))}</small>` : ''}
            ${(S.me || {}).is_leader ? ' <button type="button" class="hbs-btn hbs-ghost hbs-mini" data-cwbonusclr>Clear</button>' : ''}</div>`;
        if (rw) {
            const mins = rw.hours != null ? Math.max(0, Math.round(+rw.hours * 60)) : null;
            const canNow = q.filter(x => x.can_hit !== false && !x.away && !x.inactive && (!x.presence || x.presence === 'active') && (() => { const e = cwEnergy(x); return e && e.cur >= 25; })()).length;
            const lvl = mins == null ? 'ok' : mins < 15 ? 'low' : mins < 30 ? 'warn' : 'ok';
            const span = mins == null ? '' : mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h${mins % 60 ? ' ' + (mins % 60) + ' min' : ''}`;
            const until = mins == null || !mins ? '' : `until ~${tzClock(Math.floor(cwNow() / 1000) + mins * 60)} ${tzTagH()}`;
            const head = mins == null ? 'Queue covers the chain - regen keeps pace' : mins === 0 ? "Queue can't cover the chain right now" : `Queue covers about ${span}`;
            const bon = bonus.next ? `<span class="${rw.bonus_reachable ? 'y' : 'n'}">bonus ${int(bonus.next)} ${rw.bonus_reachable ? 'in reach ✓' : 'out of reach ✗'}</span>` : '';
            out += `<div class="hbs-cover ${lvl}"><div class="h"><i>${lvl === 'low' ? '⚠' : lvl === 'warn' ? '⏳' : '✓'}</i><b>${head}</b>${until ? `<span>${until}</span>` : ''}</div>
                <div class="d">${int(rw.banked_hits)} hit${num(rw.banked_hits) === 1 ? '' : 's'} ready · ${canNow} of ${q.length} can hit now${bon ? ' · ' + bon : ''}</div></div>`;
        }
        out += `<div class="hbs-actions">${cw.queued ? `<button type="button" class="hbs-btn hbs-ghost" data-cw="leave">Leave queue</button>
                ${hitBtn('chain')}
                <button type="button" class="hbs-btn hbs-ghost" data-cw="target" title="Open a weak target's attack page (level 1-3, inactive 60+ days - same pick as Panic Mode)">🎯 Find target</button>
                <button type="button" class="hbs-btn hbs-ghost" data-cw="away">${(q.find(x => num(x.pid) === me.id) || {}).away ? '↩ Back' : '⏸ Away'}</button>${dmBtnHtml()}`
            : `<button type="button" class="hbs-btn" data-cw="join">Join the queue</button>`}
            ${(S.me || {}).is_leader && (S.me || {}).members ? `<select class="hbs-input" data-cwbonus><option value="">🎯 Assign bonus…</option><option value="clear">Clear</option>
                ${S.me.members.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }))
                    .map(m => `<option value="${m.pid}">${esc(m.name)}</option>`).join('')}</select>` : ''}</div></div>`;
        { const mineQ = q.find(x => num(x.pid) === me.id);
          if (mineQ && !mineQ.stats && (cw.statsErr || !cwStatsCached(600000)))
            out += `<div class="hbs-banner hbs-warnb">⚠ <b>Your energy and cooldowns aren't reaching the queue.</b>
                ${cw.statsErr ? `Torn said: <i>${esc(cw.statsErr)}</i>. ` : ''}Chain Watch reads them with your own key on this device (bars, cooldowns, refills) -
                that needs a <b>Limited Access</b> key or higher, and Torn open in a visible tab. Until then you're listed after members whose energy is known.
                <div class="hbs-actions"><button type="button" class="hbs-btn hbs-mini" data-cw="statsretry">↻ Try again</button></div></div>`; }
        const qOk = q.filter(x => !x.away && !x.inactive && (!x.presence || x.presence === 'active'));
        const capHits = qOk.reduce((a, x) => { const e = cwEnergy(x); return a + (e ? Math.floor(e.cur / 25) : 0); }, 0);
        out += dmLineHtml();
        out += cwAlTilesHtml(cfg);
        out += sec(`Queue · ${q.length}`) + (q.length ? `<div class="hbs-cap${capHits === 0 ? ' low' : capHits < 5 ? ' warn' : ''}">${qOk.length ? `⚡ ~${int(capHits)} hits available · ${qOk.length} online` : '⚠ no watchers online'}</div>`
            + cwQueueHtml(q, st, turn, bonus)
            : '<div class="hbs-hint">Nobody queued.</div>');
        out += retalsHtml();
        out += schedHtml();
        const cfgUrl = (S.me || {}).is_leader && cfg.edit_url ? String(cfg.edit_url) : '';
        out += `<div class="hbs-actions"><button type="button" class="hbs-btn${alOpen ? '' : ' hbs-ghost'}" data-alopen>⚙ Configure alerts</button>${alOpen ? '' : '<button type="button" class="hbs-btn hbs-ghost" data-cw="test">🔔 Test my alerts</button>'}
            ${(S.me || {}).is_leader ? `<button type="button" class="hbs-btn${cwCfg.open ? '' : ' hbs-ghost'}" data-cwcfgopen>🛠 Chain settings ${cwCfg.open ? '▾' : '▸'}</button>` : ''}</div>`
            + cwCfgHtml(cfg, cfgUrl)
            + alertsCfgHtml();
        out += await chainSummaryHtml();
        out += `<div class="hbs-hint">Alerts: ${[cfg.topAlertSeconds, cfg.restAlertSeconds, cfg.thirdAlertSeconds].filter(x => num(x) > 0).map(mSec).join(' / ')} left · min chain ${int(cfg.minChain)}</div>`;
        return out;
    }
    const cwCfg = { open: false, draft: null, saving: false, err: '' };
    const CWCFG_F = [
        ['topAlertSeconds', '1st alert', 'seconds left on the timer', 10, 300], ['restAlertSeconds', '2nd alert', 'seconds left', 5, 300],
        ['thirdAlertSeconds', '3rd alert (final)', 'seconds left - also sent while someone is "hitting"', 5, 300],
        ['minChain', 'Minimum chain', 'no alerts (not even "You\'re up") below this count', 0, 100000],
        ['bonusWarnHits', 'Bonus heads-up', 'show the bonus banner this many hits before (0 = off)', 0, 50]];
    function cwCfgHtml(cfg, url) {
        if (!cwCfg.open || !((cw.state || {}).me || {}).is_leader) return '';
        const d = cwCfg.draft || (cwCfg.draft = Object.assign({}, ...CWCFG_F.map(([k]) => ({ [k]: num(cfg[k]) })), { firstAlertPrimaryOnly: !!cfg.firstAlertPrimaryOnly,
            dumpOn: !!cfg.dumpOn, dumpCover: cfg.dumpCover !== false, dumpBuffer: num(cfg.dumpBuffer) || 10 }));
        return `<div class="hbs-card hbs-cwcfg"><div class="hbs-sub"><b>Faction chain settings</b> - for everyone's Chain Watch. Saved on the Hub and sent to every connected script at once.</div>
            ${CWCFG_F.map(([k, l, h, lo, hi]) => `<label class="hbs-cfgrow"><span><b>${l}</b><small>${h}</small></span>
                <span class="hbs-cfgin"><input class="hbs-input" type="number" inputmode="numeric" min="${lo}" max="${hi}" step="1" data-cwcfg="${k}" value="${esc(String(d[k]))}">${/Seconds$/.test(k) ? `<small data-cwcfgm="${k}">${mSec(d[k])}</small>` : ''}</span></label>`).join('')}
            <label class="hbs-ck"><input type="checkbox" data-cwcfg="firstAlertPrimaryOnly"${d.firstAlertPrimaryOnly ? ' checked' : ''}> 1st alert to who's up only <small>(off = everyone active in the queue)</small></label>
            <div class="hbs-sub" style="margin-top:8px"><b>💩 Dumping hits</b> - members burning their energy before going offline; the hits before each bonus stay protected.</div>
            <label class="hbs-ck"><input type="checkbox" data-cwcfg="dumpOn"${d.dumpOn ? ' checked' : ''}> Dumping on <small>(shows the 💩 button to queued members)</small></label>
            <label class="hbs-cfgrow"><span><b>Protected hits before a bonus</b><small>nobody can dump into these</small></span>
                <span class="hbs-cfgin"><input class="hbs-input" type="number" inputmode="numeric" min="1" max="100" step="1" data-cwcfg="dumpBuffer" value="${esc(String(d.dumpBuffer))}"></span></label>
            <label class="hbs-ck"><input type="checkbox" data-cwcfg="dumpCover"${d.dumpCover ? ' checked' : ''}> Cover the attack button <small>(dumpers only, inside the protected hits - one tap uncovers it)</small></label>
            ${cwCfg.err ? `<div class="hbs-hint hbs-bad">⚠ ${esc(cwCfg.err)}</div>` : ''}
            <div class="hbs-actions"><button type="button" class="hbs-btn" data-cwcfgsave${cwCfg.saving ? ' disabled' : ''}>${cwCfg.saving ? 'Saving…' : '💾 Save for everyone'}</button>
                <button type="button" class="hbs-btn hbs-ghost" data-cwcfgundo>Undo changes</button></div>
            <div class="hbs-hint">${cfg.set_by ? `Last changed by ${esc(String(cfg.set_by).replace(/ \[\d+\]$/, ''))}${num(cfg.set_at) ? ' · ' + fmtDT(Math.floor(num(cfg.set_at) / 1000)) + ' ' + tzTagH() : ''}` : 'Defaults - nobody has changed them yet.'}${url ? ` · <a href="${esc(url)}" target="_blank" rel="noopener">open on the Hub</a>` : ''}</div></div>`;
    }
    function cwCfgBind() {
        const o = bodyEl.querySelector('[data-cwcfgopen]');
        if (o) o.addEventListener('click', () => { cwCfg.open = !cwCfg.open; cwCfg.draft = null; cwCfg.err = ''; render(true); });
        bodyEl.querySelectorAll('[data-cwcfg]').forEach(i => i.addEventListener(i.type === 'checkbox' ? 'change' : 'input', () => {
            if (!cwCfg.draft) return; const k = i.dataset.cwcfg;
            cwCfg.draft[k] = i.type === 'checkbox' ? i.checked : i.value === '' ? '' : Number(i.value);
            const m = bodyEl.querySelector(`[data-cwcfgm="${k}"]`); if (m) m.textContent = i.value === '' ? '' : mSec(i.value);
        }));
        const u = bodyEl.querySelector('[data-cwcfgundo]'); if (u) u.addEventListener('click', () => { cwCfg.draft = null; cwCfg.err = ''; render(true); });
        const sv = bodyEl.querySelector('[data-cwcfgsave]'); if (sv) sv.addEventListener('click', async () => {
            const d = cwCfg.draft; if (!d || cwCfg.saving) return;
            const bad = CWCFG_F.find(([k, , , lo, hi]) => d[k] === '' || !Number.isFinite(Number(d[k])) || Number(d[k]) < lo || Number(d[k]) > hi);
            if (bad) { cwCfg.err = `${bad[1]} must be ${bad[3]}-${bad[4]}.`; render(true); return; }
            if (!(d.topAlertSeconds > d.restAlertSeconds && d.restAlertSeconds > d.thirdAlertSeconds)) { cwCfg.err = 'Alerts must go down: 1st > 2nd > 3rd.'; render(true); return; }
            if (!(Number(d.dumpBuffer) >= 1 && Number(d.dumpBuffer) <= 100)) { cwCfg.err = 'Protected hits before a bonus must be 1-100.'; render(true); return; }
            cwCfg.saving = true; cwCfg.err = ''; render(true);
            try {
                const r = await hub('cwcfg', { do: 'put', data: d });   // [HB Suite] Hub API - op "cwcfg" put (leaders: Chain Watch settings)
                if (cw.state && r && r.config) cw.state.config = Object.assign({}, cw.state.config || {}, r.config);
                cwCfg.draft = null; cwCfg.open = false;
                toast(r && r.pushed === false ? '🛠 Chain settings saved - scripts get them on their next update.' : '🛠 Chain settings saved and sent to everyone.', true);
            } catch (e) { cwCfg.err = (e && e.message) || 'Could not save.'; }
            cwCfg.saving = false; render(true);
        });
    }
    function cwEnergy(x) {
        const s = x && x.stats; if (!s || s.energyMax == null) return x && x.energy != null ? { cur: num(x.energy), max: null } : null;
        if (x.energy != null) return { cur: num(x.energy), max: num(s.energyMax) };
        let cur = num(s.energyCur); const max = num(s.energyMax), inc = num(s.energyInc) || 5, iv = num(s.energyInt) || 600, first = num(s.energyTick) || iv, at = num(s.at);
        if (at && cur < max) { const el = (Date.now() - at) / 1000; if (el >= first) cur = Math.min(max, cur + inc * (1 + Math.floor((el - first) / iv))); }
        return { cur, max };
    }
    const cwCd = (secs, at) => secs == null ? 0 : Math.max(0, num(secs) - Math.floor((Date.now() - num(at)) / 1000));
    const cwFmtCd = sec => { sec = Math.max(0, Math.floor(sec)); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60); return h ? `${h}h${String(m).padStart(2, '0')}` : `${m}:${String(sec % 60).padStart(2, '0')}`; };
    const CW_WEED = '<svg class="hbs-ic" viewBox="0 0 24 24" aria-label="drug"><g fill="#5fbf6a"><path d="M12 22C11 14 11 6 12 2C13 6 13 14 12 22Z"/><path d="M12 22C9 15 6 10 3 8C7 10 10 15 12 22Z"/><path d="M12 22C15 15 18 10 21 8C17 10 14 15 12 22Z"/><path d="M12 22C8 17 4 15 1 15C5 16 9 18 12 22Z"/><path d="M12 22C16 17 20 15 23 15C19 16 15 18 12 22Z"/></g><path d="M12 21.5V24" stroke="#7a5230" stroke-width="1.2" fill="none"/></svg>';
    const CW_CAN = '<img class="hbs-ic" src="https://www.torn.com/images/items/555/large.png" alt="booster" loading="lazy" onerror="this.replaceWith(\'🥫\')">';
    const CW_ICO = {
        drug: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-45 12 12)" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.6 9.6l4.8 4.8" stroke="currentColor" stroke-width="2"/></svg>',
        booster: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="5" width="10" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 10h10M10 2.5h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
        medical: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
        refill: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2L4.5 13.5h6L9.5 22l9-12h-6z" fill="currentColor"/></svg>' };
    const cwCdTxt = sec => { sec = num(sec); if (!(sec > 0)) return '';
        if (sec < 3570) return Math.max(1, Math.ceil(sec / 60)) + 'm';
        const h = Math.round(sec / 360) / 10; return (h % 1 ? h.toFixed(1) : String(h)) + 'h'; };
    function cwIcons(x) {
        const sT = x.stats, one = (k, title, endMs, known, offWhy) => {
            if (!known) return `<span class="hbs-ci off" title="${title}: ${offWhy}">${CW_ICO[k]}</span>`;
            const left = (endMs - Date.now()) / 1000;
            return left > 0 ? `<span class="hbs-ci cd" title="${title} cooldown" data-cdend="${Math.round(endMs)}">${CW_ICO[k]}<em>${cwCdTxt(left)}</em></span>`
                            : `<span class="hbs-ci free" title="${title}: free">${CW_ICO[k]}</span>`; };
        if (!sT) return ['drug', 'booster', 'medical', 'refill'].map(k => `<span class="hbs-ci off" title="not shared">${CW_ICO[k]}</span>`).join('');
        const at = num(sT.at);
        return one('drug', 'Drug', at + num(sT.drug) * 1000, sT.drug != null, 'not known')
            + one('booster', 'Booster', at + num(sT.booster) * 1000, sT.booster != null, 'not known')
            + one('medical', 'Medical', at + num(sT.medical) * 1000, sT.medical != null, 'not known (their script is older than 0.2.60)')
            + (num(sT.refill) === 1 ? `<span class="hbs-ci free" title="Energy refill available">${CW_ICO.refill}</span>` : `<span class="hbs-ci off" title="Energy refill used">${CW_ICO.refill}</span>`);
    }
    function cwQueueHtml(q, st, turn, bonus) {
        const hitsMode = !!store.get(K.cwHits, false), myIx = me ? q.findIndex(x => num(x.pid) === me.id) : -1;
        const tile = (x, i, pod) => {
            const s0 = st[x.pid] || {}, en = cwEnergy(x), hits = en ? Math.floor(en.cur / 25) : null, mine = !!me && num(x.pid) === me.id;
            const up = num(turn.up) === num(x.pid), bk = num(turn.backup) === num(x.pid), bon = bonus.pid && num(bonus.pid) === num(x.pid);
            const hitting = x.hitting_until && x.hitting_until > cwNow(), cant = x.can_hit === false;
            const pres = x.presence === 'idle' ? 'idle' : ((x.presence && x.presence !== 'active') || x.inactive) ? 'off' : 'on';
            const urgent = cant ? `<span class="hbs-qt cant">${esc(s0.state || "Can't hit")}${s0.until && num(s0.until) * 1000 > Date.now() ? ` <em data-cdend="${num(s0.until) * 1000}">${cwCdTxt(num(s0.until) - Date.now() / 1000)}</em>` : ''}</span>`
                : hitting ? '<span class="hbs-qt hit">HITTING</span>'
                : up ? `<span class="hbs-qt up">${turn.reason === 'bonus' ? '★ UP · BONUS' : 'UP'}</span>` : '';
            const rest = urgent ? [] : [bk ? '<span class="hbs-qt">BACKUP</span>' : '', bon ? '<span class="hbs-qt bon">★ BONUS</span>' : '',
                x.dump ? `<span class="hbs-qt dmp">💩 ${x.dump.st === 'on' ? int(x.dump.left) + ' left' : 'stopped'}</span>` : '',
                x.away ? '<span class="hbs-qt">Away</span>' : '', pres === 'off' && !x.away ? '<span class="hbs-qt">Offline</span>' : '',
                mine ? '<span class="hbs-qt you">you</span>' : ''].filter(Boolean);
            const tag = urgent || (rest.length > 1 ? `<span class="hbs-rot" data-rot="${rest.length}">${rest.map((t, k) => `<span${k ? ' hidden' : ''}>${t}</span>`).join('')}</span>` : rest[0] || '');
            const enTxt = !en ? '<span class="hbs-qe none">no data</span>'
                : `<span class="hbs-qe" data-cwhits title="Tap to switch between energy and hits">${hitsMode ? `${int(hits)} hit${hits === 1 ? '' : 's'}` : int(en.cur) + (pod ? ' E' : '')}</span>`;
            const cls = `${up ? ' up' : ''}${mine ? ' me' : ''}${cant || pres === 'off' ? ' dim' : ''}`, tip = x.hits ? ` title="${int(x.hits)} hit${num(x.hits) === 1 ? '' : 's'} landed this chain"` : '';
            return pod
                ? `<div class="hbs-pt${cls}"${tip}><div class="hd"><span class="ps">#${i + 1}</span>${tag}</div><b><span class="hbs-dot ${pres}"></span>${esc(x.name)}</b>${enTxt}<div class="ic">${cwIcons(x)}</div></div>`
                : `<div class="hbs-ch${cls}"${tip}><div class="t"><span class="hbs-dot ${pres}"></span><span class="n">${esc(x.name)}</span>${tag}${cant ? '' : enTxt}</div><div class="ic">${cwIcons(x)}</div></div>`;
        };
        return (myIx >= 3 ? `<div class="hbs-qyou">You're #${myIx + 1}</div>` : '')
            + `<div class="hbs-pod">${q.slice(0, 3).map((x, i) => tile(x, i, true)).join('')}</div>`
            + (q.length > 3 ? `<div class="hbs-qsub">Also queued · ${q.length - 3}</div><div class="hbs-chg">${q.slice(3).map((x, i) => tile(x, i + 3, false)).join('')}</div>` : '');
    }
    let cwRotN = 0, cwQT = 0;
    function cwQueueTick(force) {
        if (collapsed || tab !== 'chain' || !bodyEl) return;
        cwQT++;
        if (force || cwQT % 3 === 0) { if (!force) cwRotN++;
            bodyEl.querySelectorAll('[data-rot]').forEach(r => { const n = num(r.dataset.rot), k = cwRotN % n; [...r.children].forEach((c, i) => { c.hidden = i !== k; }); }); }
        if (force || cwQT % 15 === 0) { let done = false;
            bodyEl.querySelectorAll('[data-cdend]').forEach(e => { const left = (num(e.dataset.cdend) - Date.now()) / 1000, em = e.tagName === 'EM' ? e : e.querySelector('em');
                if (left <= 0) done = true; else if (em) em.textContent = cwCdTxt(left); });
            if (done) cwShow(); }
    }
    setInterval(() => { try { cwQueueTick(false); } catch (e) {   } }, 1000);
    function cwStatsHtml(x) {
        const s = x.stats; if (!s) return '<span class="n">no energy / cooldown info shared</span>';
        const en = cwEnergy(x), drug = cwCd(s.drug, s.at), boost = cwCd(s.booster, s.at), ref = num(s.refill) === 1;
        return (en ? `<span class="en"><span class="bolt${ref ? '' : ' off'}" title="${ref ? 'Energy refill available' : 'Energy refill used'}">⚡</span>${int(en.cur)}${en.max ? '/' + int(en.max) : ''}</span>` : '')
            + `<span class="${drug > 0 ? 'cd' : 'ok'}" title="Drug cooldown">${CW_WEED}${drug > 0 ? cwFmtCd(drug) : '✓'}</span>`
            + `<span class="${boost > 0 ? 'cd' : 'ok'}" title="Booster cooldown">${CW_CAN}${boost > 0 ? cwFmtCd(boost) : '✓'}</span>`;
    }
    async function cwAction(a, b) {
        if (a === 'target') { const G = bonusGuard();
            if (G && G.last && !confirm(`The next hit is bonus ${G.next} - assigned to ${G.name}. Find a target anyway?`)) return;
            if (G && !G.last) toast(`⚠ Bonus ${G.next} (${G.name}'s) is ${G.left} hits away.`, false);
            if (b) { b.disabled = true; setTimeout(() => { b.disabled = false; }, 4000); }
            toast('🎯 Finding a weak target…'); openPanicTarget(); return; }
        if (a === 'statsretry') { store.set(K.cwStats, null); const st = await cwStats(true); toast(st ? '✓ Energy and cooldowns sent to the queue.' : '⚠ Still not readable: ' + (cw.statsErr || 'no answer'), !!st); render(true); return; }
        if (a === 'retry') { cwDisconnect(); cw.fails = 0; cw.err = ''; cw.token = null; store.set(K.cwTok, null); cw.connecting = false; cwConnect(); return; }
        if (a === 'open') { tab = 'chain'; store.set(K.tab, tab); if (collapsed) setCollapsed(false); else render(); return; }
        const S = cw.state || (cw.state = {}), Q = S.queue || (S.queue = []), mine = Q.find(x => num(x.pid) === me.id);
        if (b) b.disabled = true;
        if (a === 'join') {
            onbSet({ join: true });
            let st = cwStatsCached(600000); if (!st) st = await cwStats(true);
            cwSend(st ? { t: 'join', stats: st } : { t: 'join' }); if (st) cwStats(false);
            if (!st) toast("⚠ Joined - but your energy and cooldowns couldn't be read" + (cw.statsErr ? ': ' + cw.statsErr : '') + '. See the note on the Chain tab.', false);
            if (!mine) { const en = st ? num(st.energyCur) : null, row = { pid: me.id, name: me.name, energy: en, can_hit: true, stats: st, hits: 0, presence: 'active' };
                let at = Q.findIndex(q => q.energy == null || (en != null && num(q.energy) < en)); if (at < 0) at = Q.length; Q.splice(at, 0, row); }
            cw.queued = true; cw.optimistic = { queued: true, at: Date.now() }; store.set(K.cwq, true); cwPresence();
        } else if (a === 'leave') {
            cwSend({ t: 'leave' }); S.queue = Q.filter(x => num(x.pid) !== me.id);
            cw.queued = false; cw.optimistic = { queued: false, at: Date.now() }; store.set(K.cwq, false);
            alLeftQueue();
        } else if (a === 'hitting') {
            const on = !(mine && num(mine.hitting_until) > cwNow());
            cwSend({ t: 'hitting', on }); if (mine) mine.hitting_until = on ? cwNow() + 20000 : 0;
            if (on && mine && mine.away) { cwSend({ t: 'away', on: false }); mine.away = false; }
            if (on) alStopAll();
            if (pinEl) pinEl.dataset.sig = '';
        }
        else if (a === 'away') { const on = !(mine || {}).away; cwSend({ t: 'away', on }); if (mine) mine.away = on; }
        else if (a === 'test') { cwSend({ t: 'test_alert' }); onbSet({ test: true }); }
        drawChips(); drawPin(); if (!collapsed && tab === 'chain') render(true);
    }
    function chainBind() {
        cwAlTilesTick(); dmBind();
        try { cwQueueTick(true); } catch (e) {   }
        bodyEl.querySelectorAll('[data-cwhits]').forEach(e => e.addEventListener('click', () => { store.set(K.cwHits, !store.get(K.cwHits, false)); render(true); }));
        bodyEl.querySelectorAll('[data-cw]').forEach(b => b.addEventListener('click', () => cwAction(b.dataset.cw, b)));
        const sel = bodyEl.querySelector('[data-cwbonus]');
        const setBonus = pid => { cwSend({ t: 'bonus', pid });
            const S = cw.state || {}, b = S.bonus || (S.bonus = {}), m = pid && ((S.me || {}).members || []).find(x => num(x.pid) === pid);
            b.pid = pid || null; b.name = m ? m.name : null; b.by = me.name;
            toast(pid ? `★ Bonus hit assigned to ${m ? m.name : '#' + pid}` : 'Bonus assignment cleared', false); render(true); };
        if (sel) sel.addEventListener('change', () => { if (!sel.value) return; const v = sel.value; sel.value = ''; sel.blur(); setBonus(v === 'clear' ? null : Number(v)); });
        const bc = bodyEl.querySelector('[data-cwbonusclr]'); if (bc) bc.addEventListener('click', () => setBonus(null));
        retalsBind(); schedBind(); alertsCfgBind(); cwCfgBind(); cvChainBind();
    }

    let myOc = null, myOcAt = 0;
    async function loadMyOc(force) {
        if (!force && myOc && Date.now() - myOcAt < 60000) return myOc;
        try { myOc = await live('myoc'); myOcAt = Date.now(); } catch (e) {   }   // [HB Suite] Hub API — op live "myoc"
        return myOc;
    }
    const payDay = p => !p || !p.pay_day ? '' : shortMoney(p.pay_day);
    const ocEarliest = c => num(c.ready_at) ? num(c.ready_at) + Math.max(0, num(c.seats) - num(c.filled)) * 86400 : 0;
    function payHero(p, readyAt, open, noWhen) {
        if (!p || !p.pay_day) return '';
        const ra = num(readyAt);
        const when = noWhen ? '' : ra ? (ra > nowS() ? `${open ? 'pays out in at least' : 'pays out in'} ~<span data-until="${ra}">${dur(ra - nowS())}</span>` : 'ready to pay out') : p.days != null ? `pays out in ~${(+p.days).toFixed(1)} days` : '';
        if (p.yours) return `<div class="hbs-pay"><div class="l">💰 Pay per day (est) · per member</div>
            <div class="hbs-pay2"><div><small>Normal</small><b>${p.normal ? shortMoney(p.normal) : '-'}</b></div><div><small>Joined at</small><b>${shortMoney(p.pay_day)}</b></div></div>
            ${when ? `<div class="s">${when}</div>` : ''}</div>`;
        const sub = [p.yours ? 'from when you joined' : '', p.est && p.normal && p.normal !== p.pay_day ? `normal ${shortMoney(p.normal)} / day` : '', when].filter(Boolean);
        return `<div class="hbs-pay${p.join_now ? ' jn' : ''}"><div class="l">${p.join_now ? '⚡ JOIN NOW · ' : '💰 '}${p.yours ? 'Your pay' : 'Pay'} per day (est)</div>
            <div class="v">${payDay(p)}<small> / member / day</small></div>
            ${sub.length ? `<div class="s">${sub.join(' · ')}</div>` : ''}</div>`;
    }
    const ocWhen = t => t ? new Date(t * 1000).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    function slotsHtml(d) {
        if (!d || !(d.slots || []).length) return '';
        return sec(`Seats · ${d.slots.filter(x => x.pid).length}/${d.slots.length} filled`) + d.slots.map(x => `<div class="hbs-seat${x.you ? ' me' : ''}${x.pid ? '' : ' open'}">
            <div class="t"><b>${esc(x.position)}${x.weight != null ? ` <small class="hbs-wt" title="This role's share of the crime's success (tornprobability role weights)">${x.weight}% weight</small>` : ''}</b><span>${x.pid ? `<a href="https://www.torn.com/profiles.php?XID=${x.pid}">${esc(x.name || String(x.pid))}</a>${x.you ? ' <b class="hbs-good">you</b>' : ''}` : '<i>open seat</i>'}</span></div>
            ${x.pid ? `<div class="b"><i><em style="width:${Math.min(100, Math.round(num(x.progress)))}%"></em></i><small>planning ${Math.round(num(x.progress))}%</small>${x.rate != null ? `<small><b>${x.rate}%</b> CPR</small>` : ''}</div>` : ''}</div>`).join('');
    }
    async function ocHtml() {
        const [MY, O] = await Promise.all([loadMyOc(true), readOpt('m', 'db/crimes.json')]);
        const cur = MY && MY.current, as = MY && MY.assignment;
        let out = '';
        if (cur && CMP()) out += ocCmHero(cur);
        else if (cur) out += `<div class="hbs-card hbs-hero"><div class="hbs-r1"><span class="hbs-name">${esc(cur.crime)}</span><span class="hbs-chip">${esc(cur.status)}</span></div>
            ${payHero(cur.pay, 0, false, true)}
            ${rsTiles([[esc(cur.position), 'Your role'], [cur.rate != null ? cur.rate + '%' : '-', 'Your CPR'], [cur.difficulty != null ? esc(String(cur.difficulty)) : '-', 'Difficulty'],
                  [`${cur.filled}/${cur.seats}`, 'Filled'], [Math.round(cur.progress) + '%', 'Your planning'], [cur.success != null ? Math.round(cur.success) + '%' : '-', cur.success_kind === 'weighted' ? 'Team success · weighted' : 'Team success']])}
            ${cur.ready_at ? `<div class="hbs-ocready">⏱ ${num(cur.filled) < num(cur.seats) ? 'Earliest Ready Time:' : 'Ready in'} <b><span data-until="${ocEarliest(cur)}">-</span></b><small>${ocWhen(ocEarliest(cur))}</small></div>` : ''}
            ${'' }
            ${slotsHtml(cur)}
            <div class="hbs-actions"><a class="hbs-btn hbs-ghost" href="${OC_LINK(cur.crime_id)}">Open the crime</a></div></div>`;
        if (as && !as.joined && !(cur && String(cur.crime_id) === String(as.crime_id)))
            out += `<div class="hbs-card hbs-alert"><div class="hbs-r1"><span class="hbs-name">📌 Assigned: ${esc(as.crime)}</span>${as.rate != null ? `<span class="hbs-chip">${Math.round(as.rate)}% CPR</span>` : ''}</div>
                ${as.changed ? `<div class="hbs-hint">↻ Your assignment changed${as.changed.from ? ` from <b>${esc(as.changed.from)}</b>` : ''} - this is the one to join now.</div>` : ''}
                ${payHero(as.pay, as.ready_at)}
                <div class="hbs-sub">Role <b>${esc(as.position)}</b>${as.weight != null ? ` <small class="hbs-wt">${as.weight}% weight</small>` : ''}${as.difficulty != null ? ` · difficulty ${esc(String(as.difficulty))}` : ''}${as.succ != null ? ` · team success ${Math.round(as.succ)}%` : ''}</div>
                ${as.leave ? `<div class="hbs-banner">↪ Leave <b>${esc(as.leave.crime)}</b> (${esc(as.leave.position)}) first - your planning there hasn't started and this seat pays more.</div>` : ''}
                ${as.kind !== 'live' ? '<div class="hbs-hint">Waiting for this crime to be spawned.</div>' : ''}
                ${as.detail ? (CMP() ? cFold('ocasg', '💺', 'Seats', `<small>${as.detail.slots.filter(x => x.pid).length}/${as.detail.slots.length} filled</small>`, slotsHtml(as.detail).replace(/^<div class="hbs-sec">[^<]*<\/div>/, ''), false) : slotsHtml(as.detail)) : ''}
                ${as.kind === 'live' && as.crime_id ? `<div class="hbs-actions"><a class="hbs-btn" href="${OC_LINK(as.crime_id)}">${as.pay && as.pay.join_now ? '⚡ Join now' : 'Go to the crime'}</a></div>` : ''}</div>`;
        if (!cur && !(as && !as.joined)) out += `<div class="hbs-card"><div class="hbs-sub">You're not in a crime and nothing is assigned right now. The Hub re-plans every few minutes.</div></div>`;
        const sh = store.get(K.share, {}) || {};
        out += CMP() ? cFold('occpr', '🕵️', 'Share CPR', sh.oc ? '<span class="hbs-foldme">On</span>' : '<small>Off</small>',
                `<div class="hbs-actions"><button type="button" class="hbs-btn${sh.oc ? '' : ' hbs-ghost'}" data-occpr>${sh.oc ? '✓ On - tap to turn off' : 'Off - tap to turn on'}</button></div>
                <div class="hbs-hint">Your checkpoint pass rate per role, read on this device, so leaders and the planner can put you in the roles you pass best. Same setting as ⚙ sharing.</div>
                <div class="hbs-msg" data-occprmsg></div>`, false)
            : `<div class="hbs-card"><div class="hbs-r1"><span class="hbs-name">🕵️ Share CPR (OC pass rates)</span>
            <button type="button" class="hbs-btn${sh.oc ? '' : ' hbs-ghost'}" data-occpr>${sh.oc ? '✓ On' : 'Off'}</button></div>
            <div class="hbs-hint">Your checkpoint pass rate per role, read on this device when the Hub finds a new crime, so leaders and the planner can put you in the roles you pass best. Same setting as ⚙ sharing.</div>
            <div class="hbs-msg" data-occprmsg></div></div>`;
        const mine = ((O && O.crimes) || []).filter(c => (c.m || []).includes(me.id));
        const okN = mine.filter(c => String(c.status).toLowerCase() === 'successful').length, earned = mine.reduce((a, c) => a + num(c.share), 0);
        const leadHtml = (me.leader || me.loans) ? await ocLeadersHtml() : '';
        if (me.leader || me.loans) out += ocLoansOut;
        out += await ocRecentHtml();
        const cmMark = out.length;
        {
            const best = mine.reduce((a, c) => num(c.share) > num(a && a.share) ? c : a, null), cnt = {};
            mine.forEach(c => { cnt[c.name] = (cnt[c.name] || 0) + 1; });
            const fav = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
            const m30 = mine.filter(c => num(c.t) > Date.now() / 1000 - 30 * 86400);
            out += `<div class="hbs-card"><div class="hbs-r1"><span class="hbs-name">🕵 Your OC summary</span></div>
                ${mine.length ? `<div class="hbs-ctiles">${tiles([[int(mine.length), 'Crimes'], [`${okN}/${mine.length}`, 'Passed'], [Math.round(100 * okN / mine.length) + '%', 'Success rate'],
                    [earned ? shortMoney(earned) : '-', 'OC earnings'], [okN ? shortMoney(earned / okN) : '-', 'Avg payout'], [best && num(best.share) ? shortMoney(best.share) : '-', 'Best payout', best && num(best.share) ? esc(best.name || '') : ''],
                    [int(m30.length), 'Last 30 days']])}</div>
                ${fav ? `<div class="hbs-hint">Most played: <b>${esc(fav[0])}</b> × ${fav[1]}</div>` : ''}` : '<div class="hbs-hint">No organized crimes on record for you yet.</div>'}</div>`;
        }
        if (mine.length) out += sec('Latest crimes');
        out += mine.slice(-6).reverse().map(c => `<div class="hbs-li"><span>${fmtD(c.t)} · ${esc(c.name || '?')}</span>
            <b class="${String(c.status).toLowerCase() === 'successful' ? 'hbs-good' : 'hbs-bad'}">${esc(c.status || '')}${c.share ? ' · ' + shortMoney(c.share) : ''}</b></div>`).join('');
        if (CMP()) out = out.slice(0, cmMark) + cFold('ocsum', '🕵', 'Your OC summary',
            mine.length ? `<small>${mine.length} crime${mine.length === 1 ? '' : 's'} · ${Math.round(100 * okN / mine.length)}%${earned ? ' · ' + shortMoney(earned) : ''}</small>` : '<small>none yet</small>',
            out.slice(cmMark).replace(/^\s*<div class="hbs-card"><div class="hbs-r1">[\s\S]*?<\/div>/, '<div>'), false);
        if (me.leader) out += leadHtml;
        return out;
    }
    function ocBind() {
        if (me.leader || me.loans) ocLeadersBind();
        const b = bodyEl.querySelector('[data-occpr]'); if (!b) return;
        b.addEventListener('click', async () => {
            const m = bodyEl.querySelector('[data-occprmsg]'); b.disabled = true; if (m) m.textContent = 'Saving…';
            try {
                // [HB Suite] Hub API — op "share_get" then "share_set": flip OC pass rates, keep every other sharing choice
                const g = await hub('share_get'), st = Object.assign({ bs: 'off', ws: 'off', ready: false, oc: false, cw: false }, g.settings || {});
                const v = { bs: st.bs, ws: st.ws, ready: false, oc: !st.oc, cw: false };
                const r = await hub('share_set', v);
                store.set(K.share, r.settings || v);
                if (v.oc) { store.set(K.ocTag, ''); shareTick(true); }
                render(true);
            } catch (e) { b.disabled = false; if (m) m.textContent = e.message; }
        });
    }
    let ocMeT = null, ocMeAt = 0;
    const ocMeAllowed = () => !!me && !!getKey() && (store.get(K.share, null) || { oc: true }).oc !== false;
    function ocMeSoon() {
        if (ocMeT || !ocMeAllowed()) return;
        ocMeT = setTimeout(() => { ocMeT = null; ocMeCheck(false); }, Math.max(3000, 20000 - (Date.now() - ocMeAt)));
    }
    async function ocMeCheck(again) {
        if (!ocMeAllowed()) return;
        ocMeAt = Date.now();
        try {
            // [HB Suite] Torn API — instant join / leave: the member's OWN current crime (v2 user/organizedcrime, 1 call,
            const d = await tornGet('https://api.torn.com/v2/user/organizedcrime');
            const has = d && ('organizedCrime' in d || 'organizedcrime' in d); if (!has) return;
            const c = d.organizedCrime !== undefined ? d.organizedCrime : d.organizedcrime;
            const crime = c && typeof c === 'object' && num(c.id) > 0 ? c : null;
            const seat = crime ? (crime.slots || []).find(sl => sl.user && num(sl.user.id) === num(me.id)) : null;
            const sig = crime && seat ? crime.id + ':' + seat.position : '0';
            if (sig === store.get(K.ocMeSig, null)) {
                if (!again && !ocMeT) ocMeT = setTimeout(() => { ocMeT = null; ocMeCheck(true); }, 32000);
                return;
            }
            // [HB Suite] Hub API — op "oc_feed" me: the member's own crime (or null = in no crime); no key
            const r = await hub('oc_feed', { do: 'me', crime: crime && seat ? crime : null });
            if (r && r.ok && !r.throttled) { store.set(K.ocMeSig, sig); try { liveClear(); } catch (e) {   } myOcAt = 0; ocPinTick();
                store.set(K.ocShareAt, 0); store.set(K.sharePingAt, 0); shareTick(true); }
        } catch (e) {   }
    }
    let ocPageT = null;
    function ocPageWatch() {
        if (!modOn('ocpage') || !/factions\.php/.test(location.href)) return;
        document.addEventListener('click', e => {
            if (!/tab=crimes/.test(location.hash) || !pageScrapeAllowed()) return;
            const b = e.target && e.target.closest ? e.target.closest('button, [role="button"]') : null;
            if (!b || b.closest('#hbs-panel, .torn-launcher')) return;
            ocMeSoon();
        }, true);
        document.addEventListener('click', e => {
            const b = e.target && e.target.closest ? e.target.closest('.hbs-ocdis [class*="joinButton"]') : null;
            if (b) { e.preventDefault(); e.stopImmediatePropagation(); }
        }, true);
        const norm = t => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const cardOf = el => { let box = el; for (let i = 0; i < 12 && box; i++) { if (box.querySelector && box.querySelector('[class*="slotBody___"]')) return box; box = box.parentElement; } return null; };
        const markDisabled = names => {
            const off = new Set((names || []).map(norm)), want = new Set();
            if (off.size) document.querySelectorAll('[class*="panelTitle"]').forEach(t => {
                if (!off.has(norm(t.textContent))) return;
                const card = cardOf(t.parentElement); if (!card || !card.querySelector('[class*="joinButton"]')) return;
                const mine = me && [...card.querySelectorAll('a[href*="XID="]')].some(a => { const m = /XID=(\d+)/.exec(a.getAttribute('href') || ''); return m && num(m[1]) === num(me.id); });
                if (!mine) want.add(card);
            });
            document.querySelectorAll('.hbs-ocdis').forEach(n => { if (!want.has(n)) n.classList.remove('hbs-ocdis'); });
            want.forEach(n => { if (!n.classList.contains('hbs-ocdis')) n.classList.add('hbs-ocdis'); });
        };
        const topRow = inner => { let el = inner; while (el && el.parentElement) { const p = el.parentElement; let n = 0, isRow = false;
            for (const c of p.children) if (c.querySelector && c.querySelector('[class*="panelTitle"]')) { n++; if (c === el) isRow = true; }
            if (n >= 2 && isRow) return el; el = p; } return null; };
        const pinTop = card => { try {
            const keep = card ? topRow(card) : null;
            document.querySelectorAll('[data-hbs-octop]').forEach(el => { if (el !== keep) { el.style.removeProperty('order'); el.removeAttribute('data-hbs-octop'); } });
            document.querySelectorAll('[data-hbs-ocflex]').forEach(c => { if (!keep || c !== keep.parentElement) { c.style.removeProperty('display'); c.style.removeProperty('flex-direction'); c.removeAttribute('data-hbs-ocflex'); } });
            if (!keep) return;
            const box = keep.parentElement, disp = String(getComputedStyle(box).display || '');
            if (!/flex|grid/.test(disp)) { box.style.display = 'flex'; box.style.flexDirection = 'column'; box.setAttribute('data-hbs-ocflex', '1'); }
            if (keep.getAttribute('data-hbs-octop') !== '1') { keep.style.order = '-1'; keep.setAttribute('data-hbs-octop', '1'); }
        } catch (e) {   } };
        const run = async () => {
            if (!/tab=crimes/.test(location.hash)) { markDisabled([]); pinTop(null); return; }
            const MY = await loadMyOc(false), as = MY && MY.assignment;
            document.querySelectorAll('.hbs-ocseat,.hbs-occard').forEach(n => n.classList.remove('hbs-ocseat', 'hbs-occard'));
            markDisabled(MY && MY.disabled);
            const aRoot = as && as.crime_id ? document.getElementById('crime-history-root-' + as.crime_id) : null;
            pinTop(aRoot ? cardOf(aRoot) : null);
            if (!as || as.joined || !as.crime_id) return;
            const root = aRoot; if (!root) return;
            let card = root; for (let i = 0; i < 10 && card && !card.querySelector('[class*="slotBody___"]'); i++) card = card.parentElement;
            if (!card) return;
            card.classList.add('hbs-occard');
            const clean = t => norm(t).replace(/\s+\d+%?$/, ''), base = t => clean(String(t).replace(/#\s*\d+/g, ''));
            const slots = [...card.querySelectorAll('[class*="slotBody___"]')].map(b => b.closest('[class*="slot___"]') || b.parentElement).filter(Boolean);
            const titled = (slot, f, want) => [...slot.querySelectorAll('*')].some(x => (x.textContent || '').length <= 40 && f(x.textContent) === want);
            let seat = slots.find(sl => titled(sl, clean, clean(as.position)));
            if (!seat) { const same = slots.filter(sl => titled(sl, base, base(as.position))); seat = same.find(sl => sl.querySelector('[class*="joinButton"]')) || same[0]; }
            if (seat) seat.classList.add('hbs-ocseat');
        };
        const sched = () => { clearTimeout(ocPageT); ocPageT = setTimeout(run, 400); };
        new MutationObserver(sched).observe(document.body, { childList: true, subtree: true });
        window.addEventListener('hashchange', sched); sched();
    }

    let rcFilter = 'open';
    const rcPg = { filter: null, rows: [], total: 0, counts: null, me: {}, loading: false, at: 0, err: '' };
    async function rcPage(reset) {
        if (rcPg.loading) return;
        rcPg.loading = true;
        try {
            const off = reset ? 0 : rcPg.rows.length;
            const d = await hub('rc', { do: 'page', filter: rcFilter, offset: off, limit: 30 });   // [HB Suite] Hub API — op "rc" page (leaders, 30 rows)
            if (reset) rcPg.rows = [];
            const have = new Set(rcPg.rows.map(r => num(r.pid)));
            rcPg.rows.push(...(d.recruits || []).filter(r => !have.has(num(r.pid))));
            rcPg.total = num(d.total); rcPg.counts = d.counts || rcPg.counts; rcPg.me = d.me || rcPg.me; rcPg.filter = rcFilter; rcPg.at = Date.now(); rcPg.err = '';
        } catch (e) { rcPg.err = e.message || 'Could not load the Hub list.'; if (reset) rcPg.filter = rcFilter; }
        rcPg.loading = false;
    }
    async function rcHubHtml() {
        if (rcPg.filter !== rcFilter || !rcPg.at || Date.now() - rcPg.at > 120000) await rcPage(true);
        const L = rcPg.rows, my = rcPg.me || {}, C = rcPg.counts || {};
        const lab = (k, l) => [k, `${l}${C[k] != null ? ' · ' + int(C[k]) : ''}`];
        return chips('rcf', [lab('open', 'Open'), lab('mine', 'Claimed by me'), lab('unclaimed', 'Unclaimed'), lab('all', 'All')], rcFilter)
            + `<div class="hbs-rstool"><span class="hbs-hint">${int(rcPg.total)} recruits · best score first · shared with every leader</span><button type="button" class="hbs-btn hbs-ghost hbs-mini" data-rcref>↻</button></div>`
            + (rcPg.err ? `<div class="hbs-hint hbs-bad">${esc(rcPg.err)}</div>` : '')
            + (L.length ? L.map(r => { const x = r.data || {}, fit = x.fit || {};
                return `<div class="hbs-card"><div class="hbs-r1"><a class="hbs-name" href="https://www.torn.com/profiles.php?XID=${r.pid}">${esc(r.name)} [${r.pid}]</a>
                    <span class="hbs-chip">${fit.pct != null ? 'score ' + Math.round(fit.pct) : '-'}</span></div>
                    ${rsDataTiles(x)}${x.factionName ? `<div class="hbs-hint">In ${esc(x.factionName)}</div>` : ''}
                    <div class="hbs-sub">Status <b>${esc(r.status)}</b>${r.claim_name ? ` · claimed by <b>${esc(r.claim_name)}</b>` : ''}</div>
                    ${r.note ? `<div class="hbs-detail">📝 ${esc(r.note)}</div>` : ''}
                    <div class="hbs-actions">${num(r.claim_pid) === num(my.id) ? `<button type="button" class="hbs-btn hbs-ghost" data-rc="${r.pid}" data-ra="unclaim">Unclaim</button>`
                        : `<button type="button" class="hbs-btn" data-rc="${r.pid}" data-ra="claim"${r.claim_name ? ` data-take="${esc(r.claim_name)}"` : ''}>Claim</button>`}
                        <select class="hbs-input" data-rcs="${r.pid}">${['new', 'contacted', 'joined', 'declined'].map(s => `<option${s === r.status ? ' selected' : ''}>${s}</option>`).join('')}</select>
                        <button type="button" class="hbs-btn hbs-ghost" data-rc="${r.pid}" data-ra="note">📝</button>
                        <a class="hbs-btn hbs-ghost" href="https://www.torn.com/messages.php#/p=compose&XID=${r.pid}">✉</a>
                        <button type="button" class="hbs-btn hbs-ghost" data-rc="${r.pid}" data-ra="remove">✕</button></div>
                    <div class="hbs-msg" data-msg="rc${r.pid}"></div></div>`; }).join('') + pgMore('rc', L.length, rcPg.total, rcPg.loading)
                : '<div class="hbs-empty">No recruits here.</div>');
    }
    function rcHubBind() {
        bindChips('rcf', v => { rcFilter = v; });
        const rf = bodyEl.querySelector('[data-rcref]'); if (rf) rf.addEventListener('click', () => { rcPg.at = 0; render(true); });
        pgBind(async () => { await rcPage(false); render(true); });
        const local = (pid, body) => { const i = rcPg.rows.findIndex(r => num(r.pid) === pid); if (i < 0) return; const r = rcPg.rows[i], my = rcPg.me || {};
            if (body.action === 'claim') { r.claim_pid = my.id; r.claim_name = my.name; }
            else if (body.action === 'unclaim') { r.claim_pid = null; r.claim_name = null; }
            else if (body.action === 'status') r.status = body.status;
            else if (body.action === 'note') r.note = body.note;
            else if (body.action === 'remove') { rcPg.rows.splice(i, 1); rcPg.total = Math.max(0, rcPg.total - 1); } };
        const act = async (pid, body) => { const m = msgIn('rc' + pid);
            try { await hub('rc', { do: 'update', body: Object.assign({ pid }, body) }); local(pid, body); render(true); }   // [HB Suite] Hub API — op "rc" update
            catch (e) { if (m) m.textContent = e.message; } };
        bodyEl.querySelectorAll('[data-rc]').forEach(b => b.addEventListener('click', () => {
            const pid = Number(b.dataset.rc), a = b.dataset.ra;
            if (a === 'claim' && b.dataset.take && !confirm(`Take this recruit over from ${b.dataset.take}?`)) return;
            if (a === 'remove' && !confirm('Remove this recruit from the list?')) return;
            if (a === 'note') { const n = prompt('Shared note (everyone in leadership sees it):', ''); if (n == null) return; act(pid, { action: 'note', note: n }); return; }
            if (a === 'remove' && rsPool[pid]) { rsPool[pid][9] = 1; rsPoolSave(); }
            act(pid, { action: a });
        }));
        bodyEl.querySelectorAll('[data-rcs]').forEach(s => s.addEventListener('change', () => {
            const pid = Number(s.dataset.rcs); if (rsPool[pid]) { rsPool[pid][9] = ['declined', 'joined'].includes(s.value) ? 1 : 0; rsPoolSave(); }
            act(pid, { action: 'status', status: s.value }); }));
    }

    function moreHtml() {
        const lead = !!(me && me.leader);
        const grid = list => `<div class="hbs-more">${list.map(t => `<button type="button" data-gotab="${t.id}"><span>${t.icon}</span>${t.label}</button>`).join('')}</div>`;
        const rest = tabsOrdered().filter(t => !inBar(t.id) && !tabHidden(t.id) && (tabOk(t.id) || (t.href && (!t.lead || lead))));
        return sec('Faction') + grid(rest.filter(t => !t.lead))
            + (lead && rest.some(t => t.lead) ? sec('Leaders') + grid(rest.filter(t => t.lead)) : '')
            + `<div class="hbs-hint">Rearrange or hide tabs: ⚙ → Layout.</div>`;
    }

    const BAR_MAX = 4;
    const LAY_DEF = () => ({ order: [], bar: TABS.filter(t => t.main && t.id !== 'more').map(t => t.id), hide: [] });
    let LAY = null;
    const lay = () => LAY || (LAY = LAY_DEF());
    const laySave = () => { store.set(K.layout, LAY); buildTabs(); markTab(); };
    function tabsOrdered() {
        const ids = TABS.map(t => t.id).filter(id => id !== 'more'), ord = (lay().order || []).filter(id => ids.includes(id));
        ids.forEach(id => { if (!ord.includes(id)) ord.push(id); });
        return ord.map(id => TABS.find(t => t.id === id));
    }
    const inBar = id => id === 'more' || (lay().bar || []).includes(id);
    const tabHidden = id => (lay().hide || []).includes(id);
    const barTabs = () => tabsOrdered().filter(t => inBar(t.id) && (tabOk(t.id) || (t.href && (!t.lead || !!(me && me.leader))))).slice(0, BAR_MAX).concat([TABS.find(t => t.id === 'more')]);
    function layoutBox(box) {
        const L = lay(), lead = !!(me && me.leader);
        const mv = (kind, id, d) => `<button type="button" class="hbs-btn hbs-ghost hbs-mini" data-lmv="${kind}" data-id="${id}" data-d="${d}">${d < 0 ? '↑' : '↓'}</button>`;
        const tabs = tabsOrdered().filter(t => !t.lead || lead).filter(t => !t.mod || modOn(t.mod));
        const nBar = tabs.filter(t => inBar(t.id)).length;
        box.innerHTML = `<div class="hbs-sec">Layout (this device)</div>
            <div class="hbs-hint">Tabs: ↑↓ to reorder · <b>Bar</b> = in the bottom bar (up to ${BAR_MAX}, ••• More is always last) · <b>Show</b> = listed in ••• More.</div>
            ${tabs.map(t => `<div class="hbs-lay"><span>${t.icon} ${esc(t.label)}${t.lead ? ' <small>leaders</small>' : ''}</span>
                <label><input type="checkbox" data-lbar="${t.id}"${inBar(t.id) ? ' checked' : ''}${!inBar(t.id) && nBar >= BAR_MAX ? ' disabled' : ''}> Bar</label>
                <label><input type="checkbox" data-lshow="${t.id}"${tabHidden(t.id) ? '' : ' checked'}${inBar(t.id) ? ' disabled' : ''}> Show</label>
                ${mv('tab', t.id, -1)}${mv('tab', t.id, 1)}</div>`).join('')}
            <div class="hbs-actions"><button type="button" class="hbs-btn hbs-ghost" data-lreset>Reset layout</button></div>`;
        const redraw = () => { laySave(); layoutBox(box); };
        box.querySelectorAll('[data-lmv]').forEach(b => b.addEventListener('click', () => {
            const id = b.dataset.id, d = Number(b.dataset.d);
            const list = tabsOrdered().map(t => t.id), i = list.indexOf(id), j = i + d;
            if (i < 0 || j < 0 || j >= list.length) return;
            [list[i], list[j]] = [list[j], list[i]];
            LAY.order = list;
            redraw();
        }));
        box.querySelectorAll('[data-lbar]').forEach(c => c.addEventListener('change', () => {
            const id = c.dataset.lbar; LAY.bar = (LAY.bar || []).filter(x => x !== id); if (c.checked) LAY.bar.push(id);
            if (c.checked) LAY.hide = (LAY.hide || []).filter(x => x !== id); redraw();
        }));
        box.querySelectorAll('[data-lshow]').forEach(c => c.addEventListener('change', () => {
            const id = c.dataset.lshow; LAY.hide = (LAY.hide || []).filter(x => x !== id); if (!c.checked) LAY.hide.push(id); redraw();
        }));
        box.querySelector('[data-lreset]').addEventListener('click', () => { LAY = LAY_DEF(); redraw(); });
    }

    function showFull(url) {
        let ov = document.getElementById('hbs-full');
        if (!ov) { ov = el('div'); ov.id = 'hbs-full'; document.body.appendChild(ov);
            ov.addEventListener('click', e => { if (!e.target.closest('a')) ov.style.display = 'none'; }); }
        ov.innerHTML = `<div><img src="${esc(url)}" alt=""><a href="${esc(url)}" download="heart-breakers.png" target="_blank" rel="noopener">⬇ Save PNG</a><span>✕ tap to close</span></div>`;
        ov.style.display = 'flex';
    }
    document.addEventListener('click', e => {
        const t = e.target, pic = t && t.closest && t.closest('#hbs-panel img, #hbs-panel canvas');
        if (!pic) return;
        const r = pic.getBoundingClientRect(); if (r.width < 40 && r.height < 40) return;
        e.preventDefault(); e.stopPropagation();
        if (pic.tagName === 'IMG') { const w = window.open(pic.currentSrc || pic.src, '_blank'); if (!w) showFull(pic.currentSrc || pic.src); return; }
        try { pic.toBlob(b => { if (!b) return; const u = URL.createObjectURL(b); const w = window.open(u, '_blank'); if (!w) showFull(u); }, 'image/png'); }
        catch (x) {   }
    }, true);

    function oldScripts() {
        const out = [];
        if (document.querySelector('meta[name="hb-script"][content="Heart Breakers Hub"], #hbx-panel')) out.push('Heart Breakers Hub');
        if (document.getElementById('ocopt-launcher') || document.getElementById('ocopt-panel')) out.push('Torn OC Payout Optimizer');
        if ([...document.querySelectorAll('.torn-launcher')].some(n => /chain watch/i.test(n.dataset.dockLabel || ''))) out.push('Faction Chain Watch');
        if ([...document.querySelectorAll('.torn-launcher')].some(n => /recruit scout/i.test(n.dataset.dockLabel || ''))) out.push('Torn Recruit Scout');
        return out;
    }

    const RETAL_WINDOW_MS = 300000, CALL_TTL_MS = 90000;
    const rtExpiry = r => num(r.expires_at) || (num(r.ts) + RETAL_WINDOW_MS);
    const rtCaller = r => !r || !r.call_by ? null : (r.call_at && cwNow() - num(r.call_at) > CALL_TTL_MS ? null : r.call_by);
    const ffKey = () => String(store.get(K.ffKey, '') || '').trim();
    const ffCache = () => store.get(K.ffCache, {}) || {};
    const groupFF = g => { const c = ffCache()[String(g.attacker_id)]; return c && c.ff != null ? Number(c.ff) : null; };
    function rtGroups() {
        const map = new Map(), now = cwNow();
        ((cw.state || {}).retals || []).forEach(r => {
            if (!r || r.done || rtExpiry(r) <= now) return;
            const k = String(r.attacker_id), exp = rtExpiry(r); let g = map.get(k);
            if (!g) map.set(k, { attacker_id: r.attacker_id, attacker_name: r.attacker_name, faction: r.attacker_faction, rep: r, expiry: exp, ids: [r.id], count: 1, caller: null, callerId: null });
            else { g.ids.push(r.id); g.count++; if (exp > g.expiry) { g.expiry = exp; g.rep = r; } }
        });
        const all = (cw.state.retals || []);
        const groups = [...map.values()];
        groups.forEach(g => { const c = rtCaller(g.rep); if (c) { g.caller = c; g.callerId = g.rep.id; return; }
            for (const id of g.ids) { const cc = rtCaller(all.find(x => String(x.id) === String(id))); if (cc) { g.caller = cc; g.callerId = id; break; } } });
        return groups.sort((a, b) => { const ac = a.caller ? 1 : 0, bc = b.caller ? 1 : 0; if (ac !== bc) return ac - bc;
            return a.expiry - b.expiry; });
    }
    function rtVisible() {
        const hid = store.get(K.rtHide, {}) || {}, now = cwNow(), F = store.get(K.rtFf, {}) || {}, mn = parseFloat(F.min), mx = parseFloat(F.max);
        let changed = false; Object.keys(hid).forEach(k => { if (num(hid[k]) < now) { delete hid[k]; changed = true; } }); if (changed) store.set(K.rtHide, hid);
        let hidden = 0, filtered = 0;
        const visible = rtGroups().filter(g => {
            if (hid[String(g.attacker_id)] != null && g.expiry <= num(hid[String(g.attacker_id)])) { hidden++; return false; }
            const ff = groupFF(g);
            if (ff != null && ((!isNaN(mn) && ff < mn) || (!isNaN(mx) && ff > mx))) { filtered++; return false; }
            return true;
        });
        return { visible, hidden, filtered };
    }
    function ffBadge(id) {
        if (!ffKey()) return '';
        const c = ffCache()[String(id)]; if (!c) return '';
        const cls = c.ff == null ? '' : c.ff < 1.5 ? ' hbs-ffe' : c.ff < 2.5 ? ' hbs-ffm' : ' hbs-ffh';
        return `<span class="hbs-ff${cls}" title="FFScouter fair fight">FF ${c.ff != null ? Number(c.ff).toFixed(2) : '?'}${c.est ? ' · ' + esc(c.est) : ''}</span>`;
    }
    let ffBusy = false, ffAt = 0;
    function refreshFF(ids) {
        const key = ffKey(); if (!key || !ids.length || ffBusy || Date.now() - ffAt < 60000) return;
        const C = ffCache(), now = Date.now(), need = ids.filter(id => { const c = C[String(id)]; return !c || now - num(c.at) > 300000; });
        if (!need.length) return;
        ffBusy = true; ffAt = now;
        // [HB Suite] FFScouter API — fair-fight + stat estimates for the retal targets (your own FFScouter key, this device)
        const url = `https://ffscouter.com/api/v1/get-stats?key=${encodeURIComponent(key)}&targets=${need.slice(0, 205).join(',')}`;
        const done = txt => { ffBusy = false; let rows = null; try { rows = JSON.parse(txt); } catch (e) { return; }
            if (!Array.isArray(rows)) return;
            const F = ffCache(); rows.forEach(r => { if (r && r.player_id != null) F[String(r.player_id)] = { ff: r.fair_fight, est: r.bs_estimate_human || '', at: Date.now() }; });
            const ks = Object.keys(F); if (ks.length > 300) ks.sort((a, b) => num(F[a].at) - num(F[b].at)).slice(0, ks.length - 300).forEach(k => delete F[k]);
            store.set(K.ffCache, F); cwShow(); };
        try {
            if (typeof PDA_httpGet === 'function') { Promise.resolve(PDA_httpGet(url)).then(r => done((r && (r.responseText || r.response || r.body)) || '')).catch(() => { ffBusy = false; }); return; }
            GM_xmlhttpRequest({ method: 'GET', url, timeout: 15000, onload: r => done(r.responseText), onerror: () => { ffBusy = false; }, ontimeout: () => { ffBusy = false; } });
        } catch (e) { ffBusy = false; }
    }
    function pasteIntoChat(text) {
        const box = document.querySelector('[class*="faction"] textarea') || document.querySelector('[class*="chat-app"] textarea, [class*="chatBox"] textarea, [class*="chat_"] textarea')
            || document.querySelector('textarea[class*="textarea___"]') || document.querySelector('#chatRoot textarea');
        if (!box) return false;
        box.focus();
        try { const d = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value'); if (d && d.set) d.set.call(box, text); else box.value = text; } catch (e) { box.value = text; }
        box.dispatchEvent(new Event('input', { bubbles: true })); box.focus();
        return true;
    }
    const cwFold = (attr, icon, title, meta, open, alert) => `<button type="button" class="hbs-fold${open ? ' open' : ''}${alert ? ' alert' : ''}" ${attr} aria-expanded="${open}">
        <span class="ic">${icon}</span><span class="tt">${title}</span><span class="mt">${meta || ''}</span><span class="cv">▸</span></button>`;
    const rtOpen = () => !!store.get(K.rtOpen, false);
    function retalsHtml() {
        if (!cw.queued) return cwFold('data-rtfold', '↩', 'Retals', '<small>join the queue to see</small>', rtOpen(), false)
            + (rtOpen() ? `<div class="hbs-foldb"><div class="hbs-hint">Join the queue to see retaliation targets (as in Chain Watch).</div></div>` : '');
        const { visible, hidden, filtered } = rtVisible(), F = store.get(K.rtFf, {}) || {}, hasFf = !!ffKey();
        if (ffKey()) refreshFF(rtGroups().map(g => g.attacker_id));
        const soon = visible.length ? Math.min(...visible.map(g => num(g.expiry))) : 0;
        const meta = visible.length ? `<b class="hbs-foldn">${visible.length}</b> ⏱ <span data-exp="${cwLocal(soon)}" data-zero="gone">-</span>` : '<small>none right now</small>';
        let out = cwFold('data-rtfold', '↩', 'Retals', meta, rtOpen(), visible.length > 0);
        if (!rtOpen()) return out;
        out += `<div class="hbs-foldb">`
            + `<div class="hbs-rtc">
               ${hasFf ? `<span class="hbs-rtff">FF range <input class="hbs-input" data-rtff="min" inputmode="decimal" placeholder="min" value="${esc(F.min || '')}"> –
                 <input class="hbs-input" data-rtff="max" inputmode="decimal" placeholder="max" value="${esc(F.max || '')}"></span>` : ''}</div>`;
        const BG = bonusGuard();
        out += visible.length ? visible.map(g => {
            const mineCall = g.caller && String(g.caller) === String(me.name), left = g.expiry - cwNow();
            return `<div class="hbs-rt${left < 60000 ? ' hbs-rtsoon' : ''}${g.caller ? ' hbs-rtcalled' : ''}">
                <div class="hbs-r1"><a class="hbs-name" href="https://www.torn.com/profiles.php?XID=${g.attacker_id}" target="_blank" rel="noopener">${esc(g.attacker_name || 'Unknown')}</a>
                    ${ffBadge(g.attacker_id)}${g.count > 1 ? `<span class="hbs-tag" title="${g.count} attacks from this enemy">×${g.count}</span>` : ''}
                    ${g.caller ? `<span class="hbs-tag">📢 ${mineCall ? 'you' : esc(g.caller)}</span>` : ''}
                    <span class="hbs-chip">⏱ <span data-exp="${cwLocal(g.expiry)}" data-zero="gone">-</span></span></div>
                ${BG ? `<div class="hbs-bguard">⚠ Bonus hit ${int(BG.next)} is ${esc(BG.name)}'s - ${BG.last ? '<b>the next hit is the bonus</b>' : BG.left + ' hits away'}</div>` : ''}
                <div class="hbs-actions"><a class="hbs-btn${BG ? ' hbs-warnbtn' : ''}" href="https://www.torn.com/page.php?sid=attack&user2ID=${g.attacker_id}" target="_blank" rel="noopener"${BG && BG.last ? ' data-bguard="1"' : ''}>⚔ Attack</a>
                    <button type="button" class="hbs-btn hbs-ghost" data-rta="say" data-aid="${g.attacker_id}" title="Paste an alert into faction chat (you press send)">💬</button>
                    <button type="button" class="hbs-btn hbs-ghost" data-rta="${mineCall ? 'release' : 'call'}" data-rid="${esc(mineCall ? (g.callerId || g.rep.id) : g.rep.id)}">${mineCall ? '✋ Release' : g.caller ? '🔒 Take over' : '📢 Call'}</button>
                    <button type="button" class="hbs-btn hbs-ghost" data-rta="hide" data-aid="${g.attacker_id}" data-exp2="${g.expiry}" title="Hide for you only">🙈</button></div></div>`;
        }).join('') : `<div class="hbs-hint">No retaliation targets right now - watching incoming attacks.</div>`;
        if (filtered) out += `<a href="#" class="hbs-hint" data-rta="clearff" style="display:block">${filtered} filtered by FF · clear</a>`;
        if (hidden) out += `<a href="#" class="hbs-hint" data-rta="unhide" style="display:block">${hidden} hidden by you · show</a>`;
        return out + '</div>';
    }
    function retalsBind() {
        bodyEl.querySelectorAll('[data-bguard]').forEach(a => a.addEventListener('click', e => { const G = bonusGuard();
            if (G && G.last && !confirm(`The next hit is bonus ${G.next} - assigned to ${G.name}. Attack anyway?`)) { e.preventDefault(); e.stopPropagation(); } }));
        const fb = bodyEl.querySelector('[data-rtfold]'); if (fb) fb.addEventListener('click', () => { store.set(K.rtOpen, !rtOpen()); render(true); });
        bodyEl.querySelectorAll('[data-rtff]').forEach(i => i.addEventListener('change', () => {
            const F = store.get(K.rtFf, {}) || {}; F[i.dataset.rtff] = i.value.trim(); store.set(K.rtFf, F); render(true); }));
        bodyEl.querySelectorAll('[data-rta]').forEach(b => b.addEventListener('click', e => {
            e.preventDefault();
            const a = b.dataset.rta, R = (cw.state || {}).retals || [];
            if (a === 'call' || a === 'release') {
                const r = R.find(x => String(x.id) === b.dataset.rid);
                cwSend({ t: 'retal', id: b.dataset.rid, action: a });
                if (r) { r.call_by = a === 'call' ? me.name : null; r.call_at = a === 'call' ? cwNow() : 0; }
            } else if (a === 'say') {
                const g = rtGroups().find(x => String(x.attacker_id) === b.dataset.aid); if (!g) return;
                const c = ffCache()[String(g.attacker_id)] || {};
                const msg = `⚔ Retaliation Target\n${g.attacker_name} [${g.attacker_id}]\nEst. Battle Stats: ${c.est || 'unknown'}\nAttack: https://www.torn.com/page.php?sid=attack&user2ID=${g.attacker_id}`;
                if (pasteIntoChat(msg)) toast('Retaliation pasted into chat - press Enter to send.');
                else copyText(msg).then(ok => toast(ok ? 'No chat box open - copied instead.' : 'Open faction chat, then try again.'));
                return;
            } else if (a === 'hide') { const h = store.get(K.rtHide, {}) || {}; h[b.dataset.aid] = num(b.dataset.exp2); store.set(K.rtHide, h); }
            else if (a === 'unhide') store.set(K.rtHide, {});
            else if (a === 'clearff') store.set(K.rtFf, {});
            render(true);
        }));
    }
    let rtLastN = null;
    function rtChime() {
        if (!cw.queued) { rtLastN = null; return; }
        const n = rtVisible().visible.length;
        if (rtLastN != null && n > rtLastN && (collapsed || tab !== 'chain' || document.hidden) && isAlertTab()) alEngage('retal', 0, false, { text: `↩ Retaliation target available (${n})` });
        rtLastN = n;
    }

    const TCT = '<span class="hbs-tct" aria-label="TCT"></span>';
    const SCHED_ROLES = [['primary', 'Primary'], ['backup', 'Backup'], ['backup2', '2nd backup']];
    const SLOT_SEC = 1800, SCHED_WINDOW_H = 48, SCHED_MAX_MIN = 360, WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const sch = { open: false, day: 0, slot: null, len: 30, role: 'primary' };
    const schLocal = () => store.get(K.schTz, 'tct') === 'local', sch24 = () => !schLocal() || store.get(K.schHr, '24') !== '12';
    const minutesOf = s => num(s && s.minutes) > 0 ? num(s.minutes) : num(s && s.hours) * 60;
    function clockHM(h, m, compact) { const p = n => String(n).padStart(2, '0'); if (sch24()) return `${p(h)}:${p(m)}`;
        const pm = h >= 12; let hh = h % 12; if (!hh) hh = 12; return `${hh}:${p(m)}${compact ? (pm ? 'p' : 'a') : (pm ? ' PM' : ' AM')}`; }
    const tzClock = (sec, compact) => { const d = new Date(sec * 1000); return clockHM(schLocal() ? d.getHours() : d.getUTCHours(), schLocal() ? d.getMinutes() : d.getUTCMinutes(), compact); };
    const dayStart = i => { const d = new Date(cwNow() + i * 86400000); return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000); };
    const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayLabel = i => { const d = new Date(dayStart(i) * 1000); return i === 0 ? `Today ${d.getUTCDate()}` : `${WD[d.getUTCDay()]} ${d.getUTCDate()}`; };
    const dayChip = i => { const d = new Date(dayStart(i) * 1000); return `<span class="hbs-day">${i === 0 ? 'Today' : WD[d.getUTCDay()]}<small>${MO[d.getUTCMonth()]} ${d.getUTCDate()}</small></span>`; };
    const curSlot = () => { const n = Math.floor(cwNow() / 1000); return n - (n % SLOT_SEC); };
    const winEnd = () => Math.floor(cwNow() / 1000) + SCHED_WINDOW_H * 3600;
    const inWindow = t => t + SLOT_SEC > Math.floor(cwNow() / 1000) && t <= winEnd();
    const dayCount = () => { let n = 1; while (n < 4 && dayStart(n) <= winEnd()) n++; return n; };
    const shifts = () => { const S = (cw.state || {}).schedule; return S && Array.isArray(S.shifts) ? S.shifts : []; };
    const spans = (s, t) => t >= num(s.start) && t < num(s.start) + minutesOf(s) * 60;
    const myShifts = () => shifts().filter(s => num(s.pid) === me.id).sort((a, b) => num(a.start) - num(b.start));
    const maxShifts = () => num(((cw.state || {}).schedule || {}).max_shifts) || 2;
    const atLimit = () => myShifts().length >= maxShifts();
    const roleTaken = (start, mins, role) => { for (let i = 0; i < Math.max(1, Math.round(mins / 30)); i++) { const t = start + i * SLOT_SEC; if (shifts().some(s => s.role === role && spans(s, t))) return true; } return false; };
    const myOverlap = (start, mins) => { for (let i = 0; i < Math.max(1, Math.round(mins / 30)); i++) { const t = start + i * SLOT_SEC, s = myShifts().find(x => spans(x, t)); if (s) return s.role; } return null; };
    const roleLabel = r => (SCHED_ROLES.find(x => x[0] === r) || [r, r])[1];
    const span = (st, mins) => `${tzClock(st)}–${tzClock(st + mins * 60)}`;
    const fmtLen = m => { const h = Math.floor(m / 60), r = m % 60; return !h ? `${r}m` : r ? `${h}h${r}` : `${h}h`; };
    const dayOf = st => { for (let d = 0; d < 4; d++) if (st >= dayStart(d) && st < dayStart(d) + 86400) return dayLabel(d); const x = new Date(st * 1000); return `${WD[x.getUTCDay()]} ${x.getUTCDate()}`; };
    const coverCls = t => { let p = false, b = false; shifts().forEach(s => { if (spans(s, t)) { if (s.role === 'primary') p = true; else b = true; } }); return p ? 'p' : b ? 'b' : 'o'; };
    function estHits(start, mins) {
        const need = Math.ceil(mins / 5), c = store.get(K.cwStats, null), s = c && c.s;
        if (!s || !s.energyMax) return { est: null, need };
        const inc = num(s.energyInc) || 5, intv = num(s.energyInt) || 600, max = num(s.energyMax), toStart = start - num(c.at) / 1000;
        let e = num(s.energyCur); if (toStart > 0 && e < max) e = Math.min(max, e + inc * Math.floor(toStart / intv));
        const later = Math.floor(start / 86400) > Math.floor(cwNow() / 86400000);
        const total = e + inc * Math.floor(mins * 60 / intv) + (num(s.refill) === 1 || later ? max : 0) + (num(s.drug) - Math.max(0, toStart) <= 0 ? 250 : 0);
        return { est: Math.floor(total / 25), need };
    }
    function nextClaim() {
        const now = curSlot(), end = winEnd();
        for (let t = now; t <= end; t += SLOT_SEC) { if (myShifts().some(x => spans(x, t))) continue;
            const r = SCHED_ROLES.find(([k]) => !shifts().some(s => s.role === k && spans(s, t))); if (r) return { t, role: r[0] }; }
        return null;
    }
    function shiftAdd(start, mins, role) {
        if (atLimit()) { toast(`You already have ${maxShifts()} shifts - cancel one to book another.`); return; }
        const ov = myOverlap(start, mins); if (ov) { toast(`You're already ${roleLabel(ov)} for part of that time - one role per time slot.`); return; }
        cwSend({ t: 'shift_add', start, minutes: mins, role });
        const S = (cw.state.schedule = cw.state.schedule || { shifts: [], max_shifts: 2 }), e = estHits(start, mins);
        (S.shifts = S.shifts || []).push({ id: 'tmp-' + start + '-' + role, pid: me.id, name: me.name, start, minutes: mins, role, est_hits: e.est, need_hits: e.need });
        toast('Shift request sent…');
    }
    function shiftDrop(id, mine) {
        cwSend({ t: mine ? 'shift_cancel' : 'shift_remove', id });
        const S = cw.state.schedule; if (S && S.shifts) S.shifts = S.shifts.filter(s => String(s.id) !== String(id));
    }
    function schedHtml() {
        const S = (cw.state || {}).schedule;
        const mine = myShifts();
        const nB = S ? shifts().length : 0, my1 = mine.slice().sort((a, b) => num(a.start) - num(b.start))[0];
        let out = cwFold('data-sch="toggle"', '🗓', 'Chain watching schedule',
            S ? `${my1 ? `<span class="hbs-foldme">${roleLabel(my1.role)} ${dayOf(my1.start).replace(/^Today \d+$/, 'today')} ${tzClock(my1.start)}</span>` : '<small>you: none booked</small>'} <b class="hbs-foldn">${nB}</b>` : '<small>loading…</small>',
            sch.open, false);
        out += '<div class="hbs-foldb' + (sch.open ? '' : ' shut') + '">';
        if (S) {
            const nx = atLimit() ? null : nextClaim();
            out += `<div class="hbs-actions">${mine.length ? mine.map(m => `<span class="hbs-tag hbs-green">${roleLabel(m.role)} ${dayOf(m.start)} ${span(m.start, minutesOf(m))}</span>`).join(' ') : ''}
                ${nx ? `<button type="button" class="hbs-btn" data-sch="claim" data-t="${nx.t}" data-role="${nx.role}">⚡ Claim ${nx.t === curSlot() ? 'now' : 'next · ' + dayOf(nx.t).replace(/^Today \d+$/, 'today') + ' ' + tzClock(nx.t)} · ${roleLabel(nx.role)}</button>`
                    : atLimit() ? `<span class="hbs-hint">You have ${maxShifts()} shifts booked.</span>` : `<span class="hbs-hint">Every slot is filled for the next 48 hours.</span>`}</div>`;
        } else out += `<div class="hbs-hint">Loading the schedule from the Hub…</div>`;
        if (!sch.open || !S) return out + '</div>';
        if (mine.length) out += mine.map(m => { const ok = m.est_hits == null || num(m.est_hits) >= num(m.need_hits);
            return `<div class="hbs-li"><span><b>${roleLabel(m.role)}</b> · ${dayOf(m.start)} ${span(m.start, minutesOf(m))}${m.est_hits == null ? '' : ok ? ' · ✓ energy' : ` · ⚠ ${m.est_hits}/${m.need_hits} hits`}</span>
                <button type="button" class="hbs-btn hbs-ghost" data-sch="cancel" data-id="${esc(String(m.id))}">Cancel</button></div>`; }).join('');
        out += `<div class="hbs-rtc">${chips('schtz', [['tct', TCT], ['local', 'Local']], schLocal() ? 'local' : 'tct')}${schLocal() ? chips('schhr', [['12', '12h'], ['24', '24h']], sch24() ? '24' : '12') : '<div class="hbs-chips"><button type="button" class="hbs-on" disabled title="Torn time is always 24 h">24h</button></div>'}</div>`;
        const dc = dayCount(); if (sch.day >= dc) sch.day = 0;
        out += chips('schday', [...Array(dc).keys()].map(d => [String(d), dayChip(d)]), String(sch.day));
        [0, 24].forEach(base => {
            out += `<div class="hbs-hint">${tzClock(dayStart(sch.day) + base * SLOT_SEC)} – ${tzClock(dayStart(sch.day) + (base + 24) * SLOT_SEC)}</div><div class="hbs-slots">`;
            for (let i = 0; i < 24; i++) { const t = dayStart(sch.day) + (base + i) * SLOT_SEC, ok = inWindow(t);
                out += `<button type="button" class="hbs-slot hbs-s${coverCls(t)}${ok ? '' : ' hbs-past'}${sch.slot === t ? ' hbs-on' : ''}"${ok ? ` data-sch="slot" data-t="${t}"` : ' disabled'}>${tzClock(t, true)}</button>`; }
            out += '</div>';
        });
        out += `<div class="hbs-hint"><span class="hbs-key hbs-sp"></span>Primary covered <span class="hbs-key hbs-sb"></span>backup only <span class="hbs-key hbs-so"></span>open</div>`;
        if (sch.slot != null && !atLimit()) {
            const e = estHits(sch.slot, sch.len), ok = e.est == null || e.est >= e.need, ov = myOverlap(sch.slot, sch.len), taken = roleTaken(sch.slot, sch.len, sch.role);
            out += `<div class="hbs-card"><div class="hbs-sub">Booking <b>${dayOf(sch.slot)} ${span(sch.slot, sch.len)}</b> ${schLocal() ? 'Local' : TCT}</div>
                ${chips('schlen', [...Array(SCHED_MAX_MIN / 30).keys()].map(i => [String((i + 1) * 30), fmtLen((i + 1) * 30)]), String(sch.len))}
                <div class="hbs-chips">${SCHED_ROLES.map(([k, l]) => { const tk = roleTaken(sch.slot, sch.len, k);
                    return `<button type="button" data-sch="role" data-role="${k}" class="${sch.role === k ? 'hbs-on' : ''}"${tk ? ' disabled' : ''}>${l}${tk ? ' ✕' : ''}</button>`; }).join('')}</div>
                <div class="hbs-hint ${ok ? 'hbs-good' : 'hbs-bad'}">${e.est == null ? 'Energy estimate needs a stats reading - it comes once Chain Watch connects.' : `${ok ? '✓' : '⚠'} est ~${e.est} hits vs ${e.need} needed - ${ok ? 'covers it' : 'short'} (estimate only)`}</div>
                ${ov ? `<div class="hbs-hint hbs-bad">⚠ You're already ${roleLabel(ov)} for part of that time - one role per time slot.</div>` : ''}
                <div class="hbs-actions"><button type="button" class="hbs-btn" data-sch="book"${ov || taken ? ' disabled' : ''}>Book shift</button>
                    <button type="button" class="hbs-btn hbs-ghost" data-sch="back">Back</button></div></div>`;
        }
        const up = shifts().slice().sort((a, b) => num(a.start) - num(b.start)), lead = !!((cw.state.me || {}).is_leader);
        out += sec(`Booked · ${up.length}`) + (up.length ? up.map(s => { const mineS = num(s.pid) === me.id, ok = s.est_hits == null || num(s.est_hits) >= num(s.need_hits);
            return `<div class="hbs-li${mineS ? ' hbs-me' : ''}"><span><b>${roleLabel(s.role)}</b> ${s.pid ? `<a href="#" data-prof="${num(s.pid)}">${esc(s.name || '')}</a>` : esc(s.name || '')} · ${dayOf(s.start)} ${span(s.start, minutesOf(s))}
                <span class="${ok ? 'hbs-good' : 'hbs-bad'}">${s.est_hits == null ? '' : ok ? '✓' : `⚠ ${s.est_hits}/${s.need_hits}`}</span></span>
                ${mineS || lead ? `<button type="button" class="hbs-btn hbs-ghost hbs-mini" data-sch="${mineS ? 'cancel' : 'remove'}" data-id="${esc(String(s.id))}" title="${mineS ? 'Cancel your shift' : 'Remove this shift'}">✕</button>` : ''}</div>`; }).join('')
            : '<div class="hbs-hint">No shifts booked yet.</div>');
        return out + '</div>';
    }
    function schedBind() {
        bindChips('schtz', v => store.set(K.schTz, v)); bindChips('schhr', v => store.set(K.schHr, v));
        bindChips('schday', v => { sch.day = Number(v); sch.slot = null; });
        bindChips('schlen', v => { sch.len = Number(v); if (roleTaken(sch.slot, sch.len, sch.role)) { const f = SCHED_ROLES.find(r => !roleTaken(sch.slot, sch.len, r[0])); if (f) sch.role = f[0]; } });
        bodyEl.querySelectorAll('[data-sch]').forEach(b => b.addEventListener('click', () => {
            const a = b.dataset.sch;
            if (a === 'toggle') sch.open = !sch.open;
            else if (a === 'claim') shiftAdd(Number(b.dataset.t), 30, b.dataset.role);
            else if (a === 'slot') { if (atLimit()) { toast(`You already have ${maxShifts()} shifts - cancel one to book another.`); return; }
                sch.slot = Number(b.dataset.t); sch.len = 30; sch.role = (SCHED_ROLES.find(r => !roleTaken(sch.slot, 30, r[0])) || SCHED_ROLES[0])[0]; }
            else if (a === 'role') sch.role = b.dataset.role;
            else if (a === 'book') { if (roleTaken(sch.slot, sch.len, sch.role)) { toast('That role is already taken for part of that time.'); return; } shiftAdd(sch.slot, sch.len, sch.role); sch.slot = null; }
            else if (a === 'back') sch.slot = null;
            else if (a === 'cancel') shiftDrop(b.dataset.id, true);
            else if (a === 'remove') { if (!confirm('Remove this member\'s shift?')) return; shiftDrop(b.dataset.id, false); }
            render(true);
        }));
    }

    let pinEl = null;
    const hittingUntil = () => { const q = ((cw.state || {}).queue || []).find(x => num(x.pid) === me.id); return q && num(q.hitting_until) > cwNow() ? num(q.hitting_until) : 0; };
    function hitBtn(where) {
        const u = hittingUntil(), attr = where === 'pin' ? 'data-pin' : 'data-cw';
        return u ? `<button type="button" class="hbs-btn hbs-hitting" ${attr}="hitting" title="Tap to clear">✋ Hitting · <span data-exp="${cwLocal(u)}" data-zero="0s">-</span></button>`
                 : `<button type="button" class="hbs-btn" ${attr}="hitting">⚔ ${where === 'pin' ? 'Hitting' : "I'm hitting now"}</button>`;
    }
    let ocPinEl = null;
    function drawOcPin() {
        if (!ocPinEl) return;
        const M = typeof myOc !== 'undefined' ? myOc : null, as = M && M.assignment;
        const on = me && modOn('oc') && tab !== 'oc' && !showSettings && as && !as.joined && !(M && M.current);
        if (!on) { ocPinEl.style.display = 'none'; ocPinEl.innerHTML = ''; delete ocPinEl.dataset.sig; return; }
        const live = as.kind === 'live' && as.crime_id, p = as.pay || {};
        const sig = [as.crime, as.position, as.crime_id, as.kind, p.pay_day, p.join_now, as.changed && as.changed.from].join('|');
        ocPinEl.style.display = '';
        if (ocPinEl.dataset.sig === sig) return;
        ocPinEl.dataset.sig = sig;
        ocPinEl.innerHTML = `<div class="hbs-pin-l" data-ocpin="open"><b>📌 OC assigned</b>
            <span class="hbs-pin-t">${esc(as.crime)}</span>${as.changed ? `<span class="hbs-pin-s">↻ changed${as.changed.from ? ' from ' + esc(as.changed.from) : ''}</span>` : ''}
            <span class="hbs-pin-s">${esc(as.position)}${as.weight != null ? ` · ${as.weight}% weight` : ''}${p.pay_day ? ` · ${p.join_now ? '⚡ ' : ''}${payDay(p)}/day (est)` : ''}</span></div>
            <div class="hbs-pin-b">${live ? `<a class="hbs-btn" href="${OC_LINK(as.crime_id)}">Join</a>` : '<span class="hbs-hint">waiting to be spawned</span>'}</div>`;
    }
    const ocPinTick = () => { if (me && !document.hidden && !collapsed && modOn('oc')) loadMyOc(false).then(() => { drawOcPin(); drawTabDots(); }, () => {}); };
    setInterval(ocPinTick, 60000); setTimeout(ocPinTick, 2500);
    function drawTabDots() {
        if (!tabsEl || !me) return;
        const S = cw.state || {}, c = cwChain(), t = S.turn || {};
        const M = typeof myOc !== 'undefined' ? myOc : null, as = M && M.assignment;
        const need = { chain: modOn('chain') && cw.queued && c.current > 0 && num(t.up) === me.id && c.current >= num((S.config || {}).minChain),
                       oc: modOn('oc') && !!(as && !as.joined && !(M && M.current)) };
        const want = {};
        Object.keys(need).forEach(id => { if (!need[id] || (tab === id && !showSettings)) return;
            want[tabsEl.querySelector(`button[data-tab="${id}"]`) ? id : 'more'] = true; });
        tabsEl.querySelectorAll('button[data-tab]').forEach(b => { const on = !!want[b.dataset.tab] && !b.querySelector('.hbs-badge'); let d = b.querySelector('.hbs-tdot');
            if (on && !d) { d = el('i', 'hbs-tdot'); b.appendChild(d); } else if (!on && d) d.remove(); });
    }
    function drawPin() {
        drawOcPin();
        drawTabDots();
        if (!pinEl) return;
        const on = modOn('chain') && uiOpt('pin') && tab !== 'chain' && !showSettings && cw.state && me;
        const c = on ? cwChain() : {}, live = c.current > 0;
        if (!on || (!live && !cw.queued)) { pinEl.style.display = 'none'; pinEl.innerHTML = ''; delete pinEl.dataset.sig; return; }
        const S = cw.state, turn = S.turn || {}, q = S.queue || [], i = q.findIndex(x => num(x.pid) === me.id);
        const who = pid => esc(((q.find(x => num(x.pid) === num(pid)) || {}).name) || '');
        const sig = [live, c.current, Math.round(num(c.expires_at) / 1000), turn.up, turn.backup, i, cw.queued, q.length, hittingUntil()].join('|');
        pinEl.style.display = '';
        if (pinEl.dataset.sig === sig) return;
        pinEl.dataset.sig = sig;
        pinEl.innerHTML = `<div class="hbs-pin-l" data-pin="open"><b>⛓ ${live ? int(c.current) : '-'}</b>
            ${live ? `<span class="hbs-pin-t" data-cwexp data-exp="${cwLocal(c.expires_at)}">-</span>` : '<span class="hbs-hint">no chain</span>'}
            <span class="hbs-pin-s">${turn.up ? `Up: ${num(turn.up) === me.id ? '<b class="hbs-good">you</b>' : who(turn.up)}` : ''}${cw.queued ? ` · you #${i + 1}${num(turn.backup) === me.id ? ' (backup)' : ''}` : ` · ${q.length} queued`}</span></div>
            <div class="hbs-pin-b">${cw.queued ? hitBtn('pin') : `<button type="button" class="hbs-btn" data-pin="join">Join</button>`}</div>`;
        tickEl(pinEl);
    }

    let alertN = 0, alertKeys = [], badgeAt = 0;
    const alertsUnseen = () => { const seen = new Set(store.get(K.alertSeen, []) || []); return alertKeys.filter(k => !seen.has(k)).length + relNewIds().length; };
    function alertsSeen() { store.set(K.alertSeen, alertKeys.slice(0, 300)); relMarkSeen(); drawBadges(); }
    const REL_RANK = sc => { const i = GRADES.findIndex(g => (sc || 0) >= g[0]); return i < 0 ? GRADES.length - 1 : i; };
    let relNow = {}, relWhy = {};
    function relTrack(bad) {
        relNow = {}; bad.forEach(([id, v]) => { relNow[id] = { rank: REL_RANK(v.reliability.score), score: v.reliability.score }; });
        let seen = store.get(K.relSeen, null);
        if (!seen || typeof seen !== 'object') { seen = {}; Object.keys(relNow).forEach(id => { seen[id] = relNow[id].rank; }); store.set(K.relSeen, seen); }
        Object.keys(relNow).forEach(id => { const r = relNow[id].rank;
            if (seen[id] == null) relWhy[id] = { from: null, to: r, score: relNow[id].score };
            else if (r > seen[id]) relWhy[id] = { from: seen[id], to: r, score: relNow[id].score }; });
        Object.keys(relWhy).forEach(id => { if (!relNow[id] || relNow[id].rank < relWhy[id].to) delete relWhy[id]; });
    }
    const relNewIds = () => { const seen = store.get(K.relSeen, null) || {}; return Object.keys(relNow).filter(id => seen[id] == null || relNow[id].rank > seen[id]); };
    function relMarkSeen() { const seen = {}; Object.keys(relNow).forEach(id => { seen[id] = relNow[id].rank; }); store.set(K.relSeen, seen); }
    const relWhyText = id => { const w = relWhy[id]; if (!w) return ''; const L = r => GRADES[r][1];
        return w.from == null ? `new on the list at ${L(w.to)}` : `dropped ${L(w.from)} → ${L(w.to)}`; };
    async function refreshBadges(force) {
        if (!me || !me.leader || document.hidden) return;
        if (!force && Date.now() - badgeAt < 180000) return;
        badgeAt = Date.now();
        try { await alertsHtml(); } catch (e) { return; }   // [HB Suite] Hub API — op live "spawn" (via the Alerts tab's own reads)
        drawBadges();
    }
    function drawBadges() {
        const n = me && me.leader ? alertsUnseen() : 0, txt = n > 99 ? '99+' : String(n);
        const put = (host, cls) => { if (!host) return; let b = host.querySelector('.hbs-badge');
            if (!n) { if (b) b.remove(); return; }
            if (!b) { b = el('span', 'hbs-badge' + (cls ? ' ' + cls : '')); host.appendChild(b); } b.textContent = txt; };
        if (tabsEl) put(tabsEl.querySelector('button[data-tab="more"]'));
        if (bodyEl) put(bodyEl.querySelector('.hbs-more button[data-gotab="alerts"]'));
        if (launcher) put(launcher, 'hbs-lb');
    }
    setInterval(() => refreshBadges(false), 30000);

    const UI_DEF = { compact: isPDA(), pin: true };
    if (isPDA() && !store.get(K.uiPdaMig, 0)) { store.set(K.uiPdaMig, 1); store.set(K.ui, Object.assign({}, store.get(K.ui, {}) || {}, { compact: true })); }
    const uiOpt = k => Object.assign({}, UI_DEF, store.get(K.ui, {}) || {})[k];
    function applyUi() { if (panel) panel.classList.toggle('hbs-compact', !!uiOpt('compact')); drawPin(); }

    const cmpVer = (a, b) => { const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; } return 0; };
    let updEl = null;
    async function checkUpdate() {
        const U = store.get(K.upd, {}) || {};
        if (!U.at || Date.now() - num(U.at) > 30 * 60e3) {
            try { const d = await live('scripts');                     // [HB Suite] Hub API — op live "scripts" (the Scripts directory)
                const x = (d.scripts || []).find(s => /heart breakers suite/i.test(s.name || ''));
                const U2 = store.get(K.upd, {}) || {}, v = x ? String(x.version || '') : '';
                Object.assign(U2, { at: Date.now(), ver: U2.ver && (!v || cmpVer(v, U2.ver) < 0) ? U2.ver : v, url: (x && x.install_url) || U2.url || '' }); store.set(K.upd, U2);
            } catch (e) {   }
        }
        drawUpdate();
    }
    const SUITE_INSTALL = 'https://update.greasyfork.org/scripts/605562/Heart%20Breakers%20Suite.user.js';
    function updFromHub(sv) {
        const U = store.get(K.upd, {}) || {}, lat = String(sv.latest || ''), req = String(sv.required || '');
        if (!/^\d+(\.\d+)*$/.test(lat) || (req && !/^\d+(\.\d+)*$/.test(req))) return;
        if (U.ver === lat && (U.req || '') === req && U.url) return;
        if (U.ver && cmpVer(lat, U.ver) < 0 && (U.req || '') === req) return;
        Object.assign(U, { at: Date.now(), ver: U.ver && cmpVer(lat, U.ver) < 0 ? U.ver : lat, req, url: U.url || SUITE_INSTALL }); store.set(K.upd, U);
        drawUpdate();
    }
    const verBehind = (mine, latest) => { const a = String(mine).split('.').map(Number), b = String(latest).split('.').map(Number);
        return (a[0] || 0) !== (b[0] || 0) || (a[1] || 0) !== (b[1] || 0) ? 99 : Math.max(0, (b[2] || 0) - (a[2] || 0)); };
    function drawUpdate() {
        if (!updEl) return;
        const U = store.get(K.upd, {}) || {};
        const newer = U.ver && cmpVer(U.ver, VERSION) > 0;
        const required = !!(U.req && cmpVer(VERSION, U.req) < 0), strong = newer && verBehind(VERSION, U.ver) >= 3;
        if (required || strong) {
            updEl.style.display = ''; updEl.className = 'hbs-upd hbs-updreq';
            const to = newer ? U.ver : U.req;
            updEl.innerHTML = required
                ? `⛔ <b>Update required</b> - Suite v${esc(to)} has an important fix (you're on v${VERSION}). <a class="hbs-btn hbs-mini" href="${esc(U.url || SUITE_INSTALL)}" target="_blank" rel="noopener">Update now</a>`
                : `⚠ <b>Your Suite is ${verBehind(VERSION, U.ver) >= 99 ? 'far' : verBehind(VERSION, U.ver) + ' versions'} behind</b> (v${VERSION} → v${esc(U.ver)}) - fixes you're missing. <a class="hbs-btn hbs-mini" href="${esc(U.url || SUITE_INSTALL)}" target="_blank" rel="noopener">Update now</a>`;
            return;
        }
        updEl.className = 'hbs-upd';
        const show = newer && U.dismissed !== U.ver;
        updEl.style.display = show ? '' : 'none';
        if (show) updEl.innerHTML = `⬆ Suite <b>v${esc(U.ver)}</b> is out ${U.url ? `- <a href="${esc(U.url)}" target="_blank" rel="noopener">install</a>` : '- see 🧩 Scripts'} <button type="button" data-upd="x" title="Hide until the next version">✕</button>`;
    }

    const SYNC_KEYS = () => [K.mods, K.layout, K.ui, K.rtSort, K.rtFf, K.schTz, K.schHr, K.tab, K.alerts, K.rsRate];
    function prefsCollect() { const o = { v: 1, suite: VERSION, at: Date.now(), s: {} }; SYNC_KEYS().forEach(k => { const v = store.get(k, undefined); if (v !== undefined) o.s[k] = v; }); return o; }
    function prefsApply(o) {
        if (!o || typeof o !== 'object' || !o.s || typeof o.s !== 'object') throw new Error("That isn't a Suite settings backup.");
        const ok = SYNC_KEYS();
        Object.keys(o.s).forEach(k => { if (ok.includes(k)) store.set(k, o.s[k]); });
        Object.keys(MOD).forEach(k => delete MOD[k]); Object.assign(MOD, MOD_DEF, store.get(K.mods, {}) || {});
        LAY = null; tab = store.get(K.tab, 'home');
        buildTabs(); applyUi(); cwWatch();
    }
    const b64e = t => btoa(unescape(encodeURIComponent(t))), b64d = t => decodeURIComponent(escape(atob(String(t).trim())));
    function backupBox(box) {
        box.innerHTML = `<div class="hbs-sec">Backup & sync (display, alerts, recruit settings)</div>
            <div class="hbs-hint">Never includes your API key or FFScouter key.</div>
            <div class="hbs-actions"><button type="button" class="hbs-btn" data-bk="up">⬆ Save to the Hub</button><button type="button" class="hbs-btn hbs-ghost" data-bk="down">⬇ Load from the Hub</button>
                <button type="button" class="hbs-btn hbs-ghost" data-bk="copy">📋 Copy backup code</button></div>
            <textarea class="hbs-input" data-bkcode placeholder="Paste a backup code here, then Restore"></textarea>
            <div class="hbs-actions"><button type="button" class="hbs-btn hbs-ghost" data-bk="restore">Restore from code</button></div>
            <div class="hbs-msg" data-bkmsg></div>`;
        const m = box.querySelector('[data-bkmsg]');
        box.querySelectorAll('[data-bk]').forEach(b => b.addEventListener('click', async () => {
            const a = b.dataset.bk; m.textContent = '…';
            try {
                if (a === 'up') { const r = await hub('prefs_put', { data: prefsCollect() });          // [HB Suite] Hub API — op prefs_put (own settings)
                    m.innerHTML = `Saved to the Hub ✓ ${fmtDT(Math.floor(num(r.updated) / 1000))} ${tzTagH()} - use ⬇ Load on your other device.`; }
                else if (a === 'down') { const r = await hub('prefs_get');                            // [HB Suite] Hub API — op prefs_get (own settings)
                    if (!r.data) { m.textContent = 'Nothing saved on the Hub yet - use ⬆ Save on the device you want to copy.'; return; }
                    if (!confirm(`Replace this device's layout / module / display settings with the ones saved ${fmtDT(Math.floor(num(r.updated) / 1000))} (Torn time)?`)) { m.textContent = ''; return; }
                    prefsApply(r.data); m.textContent = 'Loaded ✓'; }
                else if (a === 'copy') { const ok = await copyText(b64e(JSON.stringify(prefsCollect()))); m.textContent = ok ? 'Backup code copied ✓ - paste it on the other device.' : "Couldn't copy."; }
                else if (a === 'restore') { const t = box.querySelector('[data-bkcode]').value; if (!t.trim()) { m.textContent = 'Paste a backup code first.'; return; }
                    prefsApply(JSON.parse(b64d(t))); m.textContent = 'Restored ✓'; }
            } catch (e) { m.textContent = e.message || "That didn't work."; }
        }));
    }
    function displayBox(box) {
        const U = Object.assign({}, UI_DEF, store.get(K.ui, {}) || {});
        box.innerHTML = `<div class="hbs-sec">Display (this device)</div>
            <label class="hbs-ck hbs-ckx"><input type="checkbox" data-ui="compact"${U.compact ? ' checked' : ''}> 🗜 Compact mode - smaller cards and text</label>
            <label class="hbs-ck hbs-ckx"><input type="checkbox" data-ui="pin"${U.pin ? ' checked' : ''}> 📌 Pinned Chain Watch tile on every tab</label>
            <div class="hbs-tzrow"><span><b>🕒 Times shown in</b><small>Every clock time and date in the Suite - the same switch as on the chain watching schedule.</small></span>
                <span class="hbs-tzset" data-tzset><span class="hbs-chips">${[['tct', '<span class="hbs-tct" aria-label="TCT"></span>'], ['local', 'Local']].map(([v, l]) => `<button type="button" data-v="${v}" class="${(tzLocal() ? 'local' : 'tct') === v ? 'hbs-on' : ''}">${l}</button>`).join('')}</span>
                ${tzLocal() ? `<span class="hbs-chips">${[['12', '12h'], ['24', '24h']].map(([v, l]) => `<button type="button" data-hr="${v}" class="${(store.get(K.schHr, '24') === '12' ? '12' : '24') === v ? 'hbs-on' : ''}">${l}</button>`).join('')}</span>` : ''}</span></div>
`;
        const tz = box.querySelector('[data-tzset]');
        if (tz) tz.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return;
            if (b.dataset.v) store.set(K.schTz, b.dataset.v); else if (b.dataset.hr) store.set(K.schHr, b.dataset.hr);
            displayBox(box); });
        box.querySelectorAll('[data-ui]').forEach(c => c.addEventListener('change', () => { const u = Object.assign({}, UI_DEF, store.get(K.ui, {}) || {}); u[c.dataset.ui] = c.checked; store.set(K.ui, u); applyUi(); }));
    }

    setInterval(() => { const u = hittingUntil(); if (cw.lastHit && !u) { cw.lastHit = 0; if (pinEl) pinEl.dataset.sig = ''; drawPin();
        if (!collapsed && tab === 'chain' && !cwBusy()) render(true); } else if (u) cw.lastHit = u; }, 1000);

    const mSec = v => { v = Math.max(0, Math.round(num(v))); const m = Math.floor(v / 60), r = v % 60; return m ? `${m}m${r ? ' ' + r + 's' : ''}` : `${r}s`; };
    const AL_TONES = [['soft', 'Soft'], ['classic', 'Classic'], ['urgent', 'Urgent'], ['chime', 'Chime'], ['pulse', 'Pulse'], ['siren', 'Siren']];
    const AL_REPEAT = [[0, 'Once'], [3, 'Every 3 s'], [5, 'Every 5 s'], [10, 'Every 10 s'], [15, 'Every 15 s'], [30, 'Every 30 s']];
    const AL_KINDS = [
        ['a1', 'Alert 1 · first warning', 'soft', 3, 1], ['a2', 'Alert 2 · second warning', 'classic', 3, 2], ['a3', 'Alert 3 · final warning', 'urgent', 3, 3],
        ['panic', 'Panic · 30s / 15s left', 'siren', 3, 4], ['up', "You're up", 'chime', 0, 1], ['shift', 'Your shift started', 'chime', 0, 0], ['retal', 'New retal target', 'pulse', 0, 0]];
    const AL_DEF = () => ({ vol: 80, desktop: false, pdaNotif: true, pdaAlarm: false, wake: true, panicMode: false,
        k: Object.fromEntries(AL_KINDS.map(([k, , tone, rep]) => [k, { on: true, tone, repeat: rep, vibrate: true, flash: true }])) });
    function alCfg() { const s = store.get(K.alerts, null) || {}, d = AL_DEF(); const o = Object.assign(d, s, { k: Object.assign({}, d.k) });
        Object.keys(d.k).forEach(k => { o.k[k] = Object.assign({}, d.k[k], (s.k || {})[k] || {}); });
        if (!o.upOnce) { o.k.up.repeat = 0; o.upOnce = true; }
        return o; }
    const alSave = c => store.set(K.alerts, c);

    let alCtx = null;
    function alAudio() { try { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; if (!alCtx) alCtx = new C();
        if (alCtx.state === 'suspended') alCtx.resume().catch(() => {}); return alCtx; } catch (e) { return null; } }
    ['click', 'touchend', 'keydown'].forEach(ev => window.addEventListener(ev, function unlock() { alAudio(); window.removeEventListener(ev, unlock, true); }, true));
    function note(ctx, f, at, dur, pk, wave) { try { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = wave || 'triangle'; o.frequency.value = f;
        o.connect(g); g.connect(ctx.destination); const t0 = ctx.currentTime + at, p = Math.max(pk, 0.0002);
        g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(p, t0 + 0.012); g.gain.exponentialRampToValueAtTime(p * 0.55, t0 + dur * 0.5);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); o.start(t0); o.stop(t0 + dur + 0.04); } catch (e) {   } }
    const voice = (ctx, f, at, dur, pk, w) => { note(ctx, f, at, dur, pk, w); note(ctx, f * 1.004, at, dur, pk * 0.45, w); };
    function alSound(tone, urgent, volPct) {
        const ctx = alAudio(); if (!ctx) return;
        const pk = 0.32 * Math.max(0, Math.min(1, (volPct == null ? alCfg().vol : volPct) / 100)); if (pk <= 0.0005) return;
        if (tone === 'soft') { voice(ctx, 1046.5, 0, 0.28, pk * 0.9, 'sine'); voice(ctx, 783.99, 0.15, 0.34, pk * 0.9, 'sine'); if (urgent) voice(ctx, 1318.5, 0.40, 0.26, pk, 'sine'); }
        else if (tone === 'urgent') { [880, 659.25, 880, 659.25].forEach((f, i) => voice(ctx, f, i * 0.13, 0.11, pk, 'sawtooth')); if (urgent) { voice(ctx, 1046.5, 0.56, 0.12, pk, 'sawtooth'); voice(ctx, 1318.5, 0.70, 0.18, pk, 'sawtooth'); } }
        else if (tone === 'chime') { [659.25, 830.61, 987.77].forEach((f, i) => voice(ctx, f, i * 0.11, 0.17, pk * 0.92, 'triangle')); if (urgent) voice(ctx, 1318.5, 0.36, 0.22, pk, 'triangle'); }
        else if (tone === 'pulse') { [740, 740, 740].forEach((f, i) => voice(ctx, f, i * 0.16, 0.08, pk, 'square')); if (urgent) { voice(ctx, 740, 0.48, 0.08, pk, 'square'); voice(ctx, 740, 0.60, 0.10, pk, 'square'); } }
        else if (tone === 'siren') { [622.25, 932.33, 622.25, 932.33].forEach((f, i) => voice(ctx, f, i * 0.16, 0.15, pk, 'sawtooth')); if (urgent) { voice(ctx, 932.33, 0.64, 0.14, pk, 'sawtooth'); voice(ctx, 1244.5, 0.80, 0.20, pk, 'sawtooth'); } }
        else { voice(ctx, 783.99, 0, 0.14, pk, 'triangle'); voice(ctx, 1046.5, 0.12, 0.14, pk, 'triangle'); voice(ctx, 1318.5, 0.24, 0.22, pk, 'triangle'); if (urgent) voice(ctx, 1568, 0.46, 0.22, pk, 'triangle'); }
    }
    const buzz = p => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {   } };
    const origTitle = document.title; let titleT = null;
    function flashTitle(text, ms) { clearInterval(titleT); let on = false; titleT = setInterval(() => { document.title = on ? origTitle : text; on = !on; }, 900);
        setTimeout(() => { clearInterval(titleT); titleT = null; document.title = origTitle; }, ms || 10000); }
    function flashPanel() { [panel, launcher].forEach(n => { if (!n) return; n.classList.add('hbs-alerting'); setTimeout(() => n.classList.remove('hbs-alerting'), 2600); }); }

    const TAB_ID = Math.random().toString(36).slice(2);
    function tabBeat() { try { const now = Date.now(), cur = JSON.parse(localStorage.getItem('hbs_alert_tab') || 'null');
        const focused = !document.hidden;
        if (focused || !cur || now - cur.at > 4000 || cur.id === TAB_ID) localStorage.setItem('hbs_alert_tab', JSON.stringify({ id: TAB_ID, at: now, f: focused })); } catch (e) {   } }
    setInterval(tabBeat, 1500); ['focus', 'visibilitychange'].forEach(ev => window.addEventListener(ev, tabBeat));
    function isAlertTab() { try { const cur = JSON.parse(localStorage.getItem('hbs_alert_tab') || 'null'); return !cur || Date.now() - cur.at > 4000 || cur.id === TAB_ID || !document.hidden; } catch (e) { return true; } }

    function alText(kind, info) {
        info = info || {};
        if (kind === 'up') return info.reason === 'bonus' ? "★ You're up - take the bonus hit!" : "⚔ You're up - hit now!";
        if (kind === 'shift') return info.text || 'Your chain watch shift has started - join the queue.';
        if (kind === 'retal') return info.text || '↩ Retaliation target available';
        if (kind === 'test') return info.text || "Test alert - this is how you'll be alerted.";
        if (kind === 'panic') return `🚨 PANIC - ${mSec(info.seconds || 0)} left on chain #${int(info.chain || cwChain().current)}!`;
        return `🚨 Chain #${int(info.chain || cwChain().current)} - ${info.seconds ? mSec(info.seconds) + ' left, ' : ''}hit now!`;
    }
    function pdaCall(name, args) { try { if (window.flutter_inappwebview && typeof window.flutter_inappwebview.callHandler === 'function') return window.flutter_inappwebview.callHandler(name, args); } catch (e) {   } return null; }
    function notifyOut(kind, info, urgent) {
        const C = alCfg(), text = alText(kind, info);
        if (C.desktop && typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
            try { const n = new Notification('⛓ Chain Watch', { body: text, tag: 'hbs-alert', renotify: true }); n.onclick = () => { try { window.focus(); n.close(); } catch (e) {   } }; } catch (e) {   }
        }
        if (isPDA()) {
            if (C.pdaNotif) { pdaCall('showToast', { text: text.slice(0, 120), seconds: 5, clickClose: true, bgColor: { r: 17, g: 19, b: 24, a: 1 }, textColor: { r: 255, g: 180, b: 84, a: 1 } });
                pdaCall('scheduleNotification', { id: 4820, title: '⛓ Chain Watch', subtitle: text.slice(0, 140), timestamp: Date.now() + 1000, overwriteID: true, launchNativeToast: false }); }
            if (C.pdaAlarm && urgent) pdaCall('setAlarm', { timestamp: Date.now() + 1000, vibrate: true, sound: true, message: text.slice(0, 120), id: 4821 });
        }
    }

    let alLoop = null, alLevel = 0, alStop = null, alKind = null;
    function alStopAll() { clearInterval(alLoop); alLoop = null; clearTimeout(alStop); alStop = null; alLevel = 0; alKind = null; alFlashUntil = 0; }
    let alFlashUntil = 0, alFlashLvl = 0;
    const alNotQueued = () => !cw.queued && !store.get(K.cwq, false);
    function alLeftQueue() { alStopAll(); alUpHeld = null; if (launcher) launcher.classList.remove('hbs-l-flash', 'hbs-l-panic'); }
    setInterval(() => {
        if (!launcher) return;
        let t = launcher.querySelector('.hbs-ltime');
        const c = cwChain(), live = !!(me && modOn('chain') && c.current > 0 && cw.state && num(c.expires_at) > 0);
        const left = live ? Math.max(0, Math.floor((num(c.expires_at) - cwNow()) / 1000)) : 0;
        if (!live) { if (t) t.remove(); launcher.classList.remove('hbs-l-up'); }
        else {
            if (!t) { t = el('span', 'hbs-ltime'); launcher.appendChild(t); }
            const txt = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
            if (t.textContent !== txt) t.textContent = txt;
            t.className = 'hbs-ltime' + (left <= 30 ? ' red' : left <= topAlertS() ? ' amber' : '');
            const up = cw.queued && num(((cw.state || {}).turn || {}).up) === me.id && c.current >= num(((cw.state || {}).config || {}).minChain);
            launcher.classList.toggle('hbs-l-up', !!up);
        }
        const fl = Date.now() < alFlashUntil;
        launcher.classList.toggle('hbs-l-flash', fl); launcher.classList.toggle('hbs-l-panic', fl && alFlashLvl >= 4);
    }, 1000);
    const chainAlive = () => { const c = cwChain(); return c.current > 0 && !!cw.state && num(c.expires_at) - cwNow() > (cwVerifyAt ? 0 : -3000); };
    const alLog = [];
    function alNote(m, result) {
        alLog.push({ at: Date.now(), t: m.t, kind: m.kind || m.t, stage: num(m.stage), chain: num(m.chain), sec: num(m.seconds), result });
        if (alLog.length > 30) alLog.shift();
        if (alOpen && tab === 'chain' && !cwBusy()) render(true);
    }
    const leftS = () => { const c = cwChain(); return c.current > 0 ? (num(c.expires_at) - cwNow()) / 1000 : null; };
    const topAlertS = () => num(((cw.state || {}).config || {}).topAlertSeconds) || 90;
    function alEngage(kind, level, urgent, info) {
        const C = alCfg(), A = C.k[kind]; if (!A || !A.on) return;
        if (alLoop && level < alLevel) return;
        if (alLoop && level === alLevel && alKind === kind) return;
        alStopAll(); alLevel = level; alKind = kind;
        const ring = () => {
            if (level && !chainAlive()) { alStopAll(); return; }
            if (level && alNotQueued()) { alStopAll(); return; }
            alSound(A.tone, urgent);
            if (A.vibrate) buzz(urgent ? [200, 100, 200, 100, 200] : [180, 90, 180]);
        };
        ring();
        alFlashLvl = level; alFlashUntil = Date.now() + (A.repeat > 0 && level ? 120000 : 10000);
        if (launcher) { launcher.classList.add('hbs-l-flash'); launcher.classList.toggle('hbs-l-panic', level >= 4); }
        try { if (cvGet().on) { cvSig = ''; cvDraw(); } } catch (e) {   }
        if (A.repeat > 0 && level) { alLoop = setInterval(ring, A.repeat * 1000); alStop = setTimeout(alStopAll, 120000); }
        else alLevel = 0;
        if (A.flash) { flashPanel(); flashTitle(level >= 4 ? '🚨 PANIC!' : kind === 'up' ? "⚔ YOU'RE UP!" : level ? '🚨 CHAIN LOW!' : '🔔 ' + alText(kind, info).slice(0, 30), 10000); }
        toast(alText(kind, info), level >= 2 || kind === 'up');
        notifyOut(kind, info, urgent);
    }
    function cwHubAlert(m) {
        const kind = m.kind, stage = num(m.stage);
        if (kind === 'test') { const A = alCfg().k.a1; alSound(A.tone, false); if (A.vibrate) buzz([180, 90, 180]); flashPanel(); toast(alText('test', m), true); notifyOut('test', m, false); return; }
        if (kind !== 'test' && !isAlertTab()) { alNote(m, 'not sounded - another Torn tab is the alert tab'); return; }
        if ((kind === 'timer' || kind === 'up') && alNotQueued()) { alNote(m, "not sounded - you're not in the queue"); return; }
        if (kind === 'shift_start') { alEngage('shift', 0, false, { text: m.text }); alNote(m, 'sounded'); return; }
        if (kind === 'up') { const rem = leftS();
            if (rem != null && rem > topAlertS()) { alUpHeld = m; alNote(m, `held until ${mSec(topAlertS())} left`); return; }
            alUpHeld = null; alEngage('up', 1, false, m); alNote(m, 'sounded'); return; }
        if (kind !== 'timer') { alNote(m, 'ignored (unknown kind)'); return; }
        if (num(m.chain) && cwChain().current > num(m.chain)) { alNote(m, `not sounded - chain already at ${cwChain().current}`); return; }
        if (!chainAlive()) { alNote(m, 'not sounded - the chain timer has run out'); return; }
        cw.state = cw.state || {};
        const stages = [num((cw.state.config || {}).topAlertSeconds), num((cw.state.config || {}).restAlertSeconds), num((cw.state.config || {}).thirdAlertSeconds)].filter(x => x > 0).length || 3;
        const final = stage >= 3 || m.most_urgent || stage >= stages;
        const paused = (cw.state.alerts_paused && num(cw.state.alerts_paused.until) > cwNow()) || (cw.state.queue || []).some(q => num(q.hitting_until) > cwNow());
        if (!final && paused) { alNote(m, "not sounded - someone's hitting"); return; }
        const ak = final ? 'a3' : stage >= 2 ? 'a2' : 'a1';
        alNote(m, alCfg().k[ak].on ? (alLoop && alLevel > (final ? 3 : stage >= 2 ? 2 : 1) ? 'not sounded - a more urgent alert is sounding' : 'sounded') : 'off in your alert settings');
        alEngage(ak, final ? 3 : stage >= 2 ? 2 : 1, final, m);
    }
    let alUpHeld = null;
    setInterval(() => {
        if (!alUpHeld) return;
        const S = cw.state || {}, up = num((S.turn || {}).up);
        if (!chainAlive() || (up && up !== me.id)) { alUpHeld = null; return; }
        const rem = leftS(); if (rem == null || rem > topAlertS()) return;
        const m = alUpHeld; alUpHeld = null;
        if (isAlertTab()) { alEngage('up', 1, false, m); alNote(m, 'sounded (held "You\'re up")'); }
    }, 1000);
    let panicLap = { chain: -1, s1: false, s2: false };
    function cwHubPanic(m) {
        if (!isAlertTab()) { alNote(m, 'not sounded - another Torn tab is the alert tab'); return; }
        if (alNotQueued()) { alNote(m, "not sounded - you're not in the queue"); return; }
        const count = num(m.chain) || cwChain().current;
        if (cwChain().current > count) { alNote(m, `not sounded - chain already at ${cwChain().current}`); return; }
        if (!chainAlive()) { alNote(m, 'not sounded - the chain timer has run out'); return; }
        if (panicLap.chain !== count) panicLap = { chain: count, s1: false, s2: false };
        const first = num(m.seconds) > 15; if (first ? panicLap.s1 : panicLap.s2) { alNote(m, 'duplicate'); return; } if (first) panicLap.s1 = true; else panicLap.s2 = true;
        alNote(m, alCfg().k.panic.on ? 'sounded' + (alCfg().panicMode ? ' + Panic Mode target' : '') : 'off in your alert settings');
        alEngage('panic', 4, true, { seconds: m.seconds, chain: count });
        if (alCfg().panicMode) openPanicTarget();
    }
    const panicId = () => 1000000 + Math.floor(Math.random() * 2400001);
    async function openPanicTarget() {
        let id = null;
        for (let i = 0; i < 10 && !id && getKey(); i++) {
            const x = panicId();
            try {
                // [HB Suite] Torn API — Panic Mode: one random player's profile (alive, level 1-3, inactive 60+ days, not us)
                const d = await tornGet(`https://api.torn.com/user/${x}?selections=profile`);
                const ok = d && d.status && d.status.state === 'Okay', lvl = num(d && d.level) || 999, la = num(d && d.last_action && d.last_action.timestamp);
                if (ok && lvl >= 1 && lvl <= 3 && la && Date.now() / 1000 - la > 60 * 86400 && !(d.faction && num(d.faction.faction_id) === FACTION_ID)) id = x;
            } catch (e) {   }
        }
        const url = `https://www.torn.com/page.php?sid=attack&user2ID=${id || panicId()}`;
        try { if (typeof GM_openInTab === 'function') { GM_openInTab(url, { active: true, insert: true, setParent: true }); return; } } catch (e) {   }
        try { if (window.open(url, '_blank')) return; } catch (e) {   }
        location.assign(url);
    }
    let alLastCount = null;
    function alWatch() { const c = cwChain().current; if (alLastCount != null && c !== alLastCount) { alStopAll(); panicLap = { chain: -1, s1: false, s2: false }; } alLastCount = c; }

    let wakeLock = null;
    function wakeSync() {
        try {
            const want = cw.queued && alCfg().wake && !document.hidden && 'wakeLock' in navigator;
            if (want && !wakeLock) navigator.wakeLock.request('screen').then(w => { wakeLock = w; w.addEventListener('release', () => { wakeLock = null; }); }).catch(() => { wakeLock = null; });
            else if (!want && wakeLock) { wakeLock.release(); wakeLock = null; }
        } catch (e) { wakeLock = null; }
    }
    setInterval(wakeSync, 5000); document.addEventListener('visibilitychange', wakeSync);

    let alOpen = false;
    function alertsCfgHtml() {
        if (!alOpen) return '';
        const C = alCfg(), sel = (attr, opts, v) => `<select class="hbs-input" ${attr}>${opts.map(([o, l]) => `<option value="${o}"${String(o) === String(v) ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
        const perm = typeof Notification === 'undefined' ? 'n/a' : Notification.permission;
        return `<div class="hbs-card hbs-alcfg">
            <div class="hbs-sub"><b>Every alert</b> - turn it on / off, pick its tone (▶ to hear it) and how often it repeats while it stands. Stored on this device.</div>
            ${AL_KINDS.map(([k, label]) => { const A = C.k[k];
                return `<div class="hbs-alrow"><label class="hbs-ck"><input type="checkbox" data-al="${k}.on"${A.on ? ' checked' : ''}> <b>${label}</b></label>
                    <div class="hbs-row">${sel(`data-al="${k}.tone"`, AL_TONES, A.tone)}<button type="button" class="hbs-btn hbs-ghost hbs-mini" data-alplay="${k}">▶</button>
                    ${k === 'shift' || k === 'retal' ? '' : sel(`data-al="${k}.repeat"`, AL_REPEAT, A.repeat)}</div>
                    <div class="hbs-row"><label class="hbs-ck"><input type="checkbox" data-al="${k}.vibrate"${A.vibrate ? ' checked' : ''}> Vibrate</label>
                    <label class="hbs-ck"><input type="checkbox" data-al="${k}.flash"${A.flash ? ' checked' : ''}> Flash</label></div></div>`; }).join('')}
            <div class="hbs-sec">This device</div>
            <div class="hbs-row"><span class="hbs-hint">Volume</span><input type="range" min="0" max="100" step="5" data-alg="vol" value="${C.vol}"><span class="hbs-hint" data-alvol>${C.vol}%</span></div>
            <label class="hbs-ck"><input type="checkbox" data-alg="desktop"${C.desktop ? ' checked' : ''}> Desktop notification (when Torn is in the background)${perm === 'denied' ? ' - blocked in the browser' : ''}</label>
            ${isPDA() ? `<label class="hbs-ck"><input type="checkbox" data-alg="pdaNotif"${C.pdaNotif ? ' checked' : ''}> TornPDA notification</label>
            <label class="hbs-ck"><input type="checkbox" data-alg="pdaAlarm"${C.pdaAlarm ? ' checked' : ''}> TornPDA alarm (final alert + Panic)</label>` : ''}
            <label class="hbs-ck"><input type="checkbox" data-alg="wake"${C.wake ? ' checked' : ''}> Keep the screen awake while queued</label>
            <label class="hbs-ck"><input type="checkbox" data-alg="panicMode"${C.panicMode ? ' checked' : ''}> 🚨 Panic Mode - at Panic, open a weak target's attack page</label>
            <div class="hbs-actions"><button type="button" class="hbs-btn" data-cw="test">🔔 Test my alerts</button>
                <button type="button" class="hbs-btn hbs-ghost" data-alpanictest>🚨 Test Panic Mode</button><button type="button" class="hbs-btn hbs-ghost" data-alreset>Reset alerts</button></div>
            ${alCheckHtml()}</div>`;
    }
    const tAgo = ms => { const s = Math.round((Date.now() - ms) / 1000); return s < 60 ? s + 's ago' : s < 3600 ? Math.floor(s / 60) + 'm ago' : Math.floor(s / 3600) + 'h ago'; };
    const alLabel = x => x.kind === 'panic' || x.t === 'panic' ? `Panic ${mSec(x.sec || (x.stage === 2 ? 15 : 30))}` : x.kind === 'timer' ? `Alert ${x.stage}` : x.kind === 'up' ? "You're up" : x.kind;
    function alCheckHtml() {
        const D = cw.diag, lead = !!((cw.state || {}).me || {}).is_leader;
        let out = `<div class="hbs-sec">🔍 Alert check</div>
            <div class="hbs-hint">Connection: <b>${cw.ws && cw.ws.readyState === 1 ? 'live socket' : cw.syncT ? 'polling (no socket)' : 'not connected'}</b> · ${cw.queued ? 'in the queue' : 'not queued'} · this tab ${isAlertTab() ? '<b>is</b>' : 'is <b>not</b>'} the alert tab</div>
            <div class="hbs-sub"><b>Received on this device</b> (since this page loaded)</div>`
            + (alLog.length ? `<div class="hbs-allog">${alLog.slice().reverse().map(x => `<div><span>${tAgo(x.at)}</span><b>${esc(alLabel(x))}</b> #${int(x.chain)}<em>${esc(x.result)}</em></div>`).join('')}</div>`
                : '<div class="hbs-hint">Nothing yet - no chain alerts have reached this page.</div>');
        if (lead) {
            out += `<div class="hbs-actions"><button type="button" class="hbs-btn hbs-ghost" data-aldiag>${D ? '↻ Ask the Hub again' : 'Ask the Hub what it sent'}</button></div>`;
            if (D) out += `<div class="hbs-sub"><b>The Hub</b> (${tAgo(cwLocal(D.now))}): ${esc(D.why)}</div>
                <div class="hbs-hint">Chain ${int(D.chain)}${D.left != null ? ` · ${mSec(D.left)} left` : ''}${D.src ? ` (from ${esc(D.src)})` : ''} · alerts at ${esc((D.stages || []).map(mSec).join(' / '))} · min chain ${int(D.min_chain)} · ${int(D.sockets)} live + ${int(D.sync_devices)} polling</div>
                <div class="hbs-hint${D.api_err ? ' hbs-bad' : ''}">Torn API (Hub's own read${D.api_read_at ? ', ' + tAgo(cwLocal(D.api_read_at)) : ''}): ${D.api_err ? '⚠ failed - ' + esc(D.api_err)
                    : D.api ? `chain ${int(D.api.cur)}${D.api.cur > 0 ? ' · ' + mSec(D.api.left) + ' left' : ''}` : 'no answer yet'}${D.api_low ? ` · ⚠ ${int(D.api_low)} lower-than-known answer${D.api_low === 1 ? '' : 's'} ignored` : ''}${D.page_at ? ' · last page reading ' + tAgo(cwLocal(D.page_at)) : ''}</div>
                ${(D.queue || []).length ? `<div class="hbs-allog">${D.queue.map(q => `<div><b>${esc(q.name)}</b><em>${q.via === 'ws' ? 'live' : q.via === 'sync' ? 'polling' : '⚠ not connected'}${q.can_hit ? '' : ' · can\'t attack'}${q.away ? ' · away' : ''}${q.presence !== 'active' ? ' · ' + esc(q.presence) : ''}</em></div>`).join('')}</div>` : ''}
                <div class="hbs-sub"><b>Sent by the Hub</b> (last ${(D.log || []).length})</div>
                ${(D.log || []).length ? `<div class="hbs-allog">${D.log.slice().reverse().map(x => `<div><span>${tAgo(cwLocal(x.at))}</span><b>${esc(alLabel(x))}</b> #${int(x.chain)}${x.left != null ? ` · ${x.left}s` : ''}<em>→ ${x.to.map(t => esc(t.name || '#' + t.pid) + (t.via === 'ws' ? '' : t.via === 'held' ? ' (poll)' : ' ⚠')).join(', ') || 'nobody'}</em></div>`).join('')}</div>`
                    : '<div class="hbs-hint">The Hub hasn\'t sent any alerts since it last restarted.</div>'}`;
        }
        return out;
    }
    function alertsCfgBind() {
        const dg = bodyEl.querySelector('[data-aldiag]'); if (dg) dg.addEventListener('click', () => { cwSend({ t: 'diag' }); toast('Asking the Hub…'); });
        const t = bodyEl.querySelector('[data-alopen]'); if (t) t.addEventListener('click', () => { alOpen = !alOpen; render(true); });
        bodyEl.querySelectorAll('[data-al]').forEach(i => i.addEventListener('change', () => {
            const [k, f] = i.dataset.al.split('.'), C = alCfg();
            C.k[k][f] = i.type === 'checkbox' ? i.checked : f === 'repeat' ? Number(i.value) : i.value; alSave(C);
            if (f === 'tone') alSound(i.value, k === 'panic' || k === 'a3');
        }));
        bodyEl.querySelectorAll('[data-alplay]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.alplay; alSound(alCfg().k[k].tone, k === 'panic' || k === 'a3'); }));
        bodyEl.querySelectorAll('[data-alg]').forEach(i => i.addEventListener(i.type === 'range' ? 'input' : 'change', () => {
            const C = alCfg(), k = i.dataset.alg; C[k] = i.type === 'checkbox' ? i.checked : Number(i.value); alSave(C);
            if (k === 'vol') { const v = bodyEl.querySelector('[data-alvol]'); if (v) v.textContent = i.value + '%'; }
            if (k === 'desktop' && i.checked && typeof Notification !== 'undefined' && Notification.permission !== 'granted')
                Notification.requestPermission().then(p => { if (p !== 'granted') { const c2 = alCfg(); c2.desktop = false; alSave(c2); i.checked = false; } });
            if (k === 'wake') wakeSync();
        }));
        const vr = bodyEl.querySelector('[data-alg="vol"]'); if (vr) vr.addEventListener('change', () => alSound(alCfg().k.a1.tone, false));
        const pt = bodyEl.querySelector('[data-alpanictest]'); if (pt) pt.addEventListener('click', () => {
            const A = alCfg().k.panic; alSound(A.tone, true); if (A.vibrate) buzz([200, 100, 200, 100, 200]);
            if (A.flash) { flashPanel(); flashTitle('🚨 PANIC TEST', 5000); }
            toast('🚨 Panic test - opening a target…', true); notifyOut('test', { text: '🚨 Panic Mode test' }, true);
            pt.disabled = true; openPanicTarget().finally(() => { pt.disabled = false; });
        });
        const rs = bodyEl.querySelector('[data-alreset]'); if (rs) rs.addEventListener('click', () => { if (confirm('Put every alert back to the defaults?')) { alSave(AL_DEF()); render(true); } });
    }

    const CV_DEF = { on: false, size: 'l', side: 'right', y: 140, open: true };
    const cvGet = () => Object.assign({}, CV_DEF, store.get(K.cwCompact, {}) || {});
    function cvSet(p) { store.set(K.cwCompact, Object.assign(cvGet(), p)); cvSig = ''; cvDraw(); }
    let cvEl = null, cvSig = '';
    const cvShown = () => { const C = cvGet(); return !!(C.on && collapsed && me && modOn('chain')); };
    function cvEnsure() {
        if (cvEl) return;
        cvEl = el('div'); cvEl.id = 'hbs-compact'; cvEl.style.touchAction = 'none';
        document.body.appendChild(cvEl);
        let d = null;
        cvEl.addEventListener('pointerdown', e => { if (e.button) return; d = { y: e.clientY, top: cvEl.getBoundingClientRect().top, moved: false, id: e.pointerId, t: e.target };
            try { cvEl.setPointerCapture(e.pointerId); } catch (x) {   } });
        cvEl.addEventListener('pointermove', e => { if (!d || e.pointerId !== d.id) return; const dy = e.clientY - d.y;
            if (!d.moved && Math.abs(dy) < DRAG_THRESHOLD) return; d.moved = true; e.preventDefault();
            cvEl.style.top = cvClampY(d.top + dy) + 'px'; });
        const up = e => { if (!d || e.pointerId !== d.id) return; const was = d; d = null;
            try { cvEl.releasePointerCapture(e.pointerId); } catch (x) {   }
            if (was.moved) { store.set(K.cwCompact, Object.assign(cvGet(), { y: Math.round(cvEl.getBoundingClientRect().top) })); return; }
            const b = was.t && was.t.closest ? was.t.closest('[data-cv]') : null, a = b ? b.dataset.cv : '';
            if (a !== 'hit' && a !== 'join') { setCollapsed(false); tab = 'chain'; store.set(K.tab, tab); render(); cvDraw(); return; }
            if (a === 'hit' || a === 'join') { cwAction(a === 'hit' ? 'hitting' : 'join').then(() => { cvSig = ''; cvDraw(); }, () => {}); cvSig = ''; setTimeout(cvDraw, 60); return; }
            };
        cvEl.addEventListener('pointerup', up); cvEl.addEventListener('pointercancel', () => { d = null; });
        window.addEventListener('resize', () => { if (cvEl && cvShown()) cvEl.style.top = cvClampY(cvGet().y) + 'px'; });
    }
    const cvClampY = y => Math.max(6, Math.min(Math.max(6, window.innerHeight - (cvEl ? cvEl.offsetHeight : 60) - 6), num(y)));
    function cvDraw() {
        const show = cvShown();
        if (launcher) launcher.classList.toggle('hbs-cvhide', show);
        if (!show) { if (cvEl) cvEl.style.display = 'none'; cvSig = ''; return; }
        cvEnsure();
        const C = cvGet(), S = cw.state || {}, c = cwChain(), live = c.current > 0 && num(c.expires_at) > 0;
        const left = live ? Math.max(0, Math.floor((num(c.expires_at) - cwNow()) / 1000)) : 0;
        const txt = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
        const t = S.turn || {}, upMe = cw.queued && num(t.up) === me.id, bkMe = cw.queued && !upMe && num(t.backup) === me.id;
        const hitU = hittingUntil(), flash = Date.now() < alFlashUntil;
        const tcls = !live ? 'dim' : left <= 30 ? 'red' : left <= topAlertS() ? 'amber' : '';
        const posS = cw.queued ? '#' + (cw.queuePos || '?') : '–';
        const posL = !cw.queued ? 'Not queued' : upMe ? "You're up" : `You're #${cw.queuePos || '?'}${bkMe ? ' · backup' : ''}`;
        const btn = !cw.queued ? `<button type="button" class="b" data-cv="join">Join queue</button>`
            : `<button type="button" class="b${hitU ? ' on' : ''}" data-cv="hit">${hitU ? '✋ Hitting' : "⚔ I'm hitting"}</button>`;
        const size = C.size === 't' && flash ? 'l' : C.size, open = size !== 't';
        const sig = [size, C.side, txt, tcls, posL, !!hitU, live ? c.current : 0, flash, upMe, bkMe].join('|');
        cvEl.style.display = '';
        cvEl.className = `cv-${open ? size : 'l'} cv-${C.side}${open ? ' open' : ''}${upMe ? ' up' : bkMe ? ' bk' : ''}${flash ? ' flash' : ''}${flash && alFlashLvl >= 4 ? ' panic' : ''}`;
        if (sig === cvSig) return;
        cvSig = sig;
        cvEl.title = 'Open Chain Watch';
        cvEl.innerHTML = !open
            ? `<div class="t ${tcls}">${txt}</div><div class="p">${posS}</div>`
            : size === 'l'
                ? `<div class="s">${live ? 'Chain ' + int(c.current) : 'No live chain'}</div>
                   <div class="t ${tcls}">${txt}</div><div class="pl"><span>${posL}</span></div>${btn}`
                : `<div class="r"><span class="t ${tcls}">${txt}</span><span class="pl"><span>${posS}</span></span></div>${btn}`;
        cvEl.style.top = cvClampY(C.y) + 'px';
    }
    setInterval(() => { if (cvGet().on || cvEl) cvDraw(); }, 1000);
    let cvOptOpen = false;
    function cvChainHtml() {
        const C = cvGet();
        const pick = (k, opts) => `<span class="hbs-chips" data-cvset="${k}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${String(C[k]) === v ? 'hbs-on' : ''}">${l}</button>`).join('')}</span>`;
        return `<div class="hbs-actions"><button type="button" class="hbs-btn${cvOptOpen ? '' : ' hbs-ghost'}" data-cvopt>⛶ Compact View ${cvOptOpen ? '▾' : '▸'}</button></div>`
            + (cvOptOpen ? `<div class="hbs-card hbs-cvopt"><div class="hbs-sub">A small tab on the edge of the screen with the chain timer, your position and the I'm hitting button - shown while the Suite is minimized. Tap it to open Chain Watch, drag it up or down.</div>
                <div class="hbs-cfgrow"><span><b>View</b></span>${pick('size', [['l', 'Original'], ['s', 'Smaller'], ['t', 'Timer only']])}</div>
                <div class="hbs-cfgrow"><span><b>Side</b></span>${pick('side', [['left', 'Left'], ['right', 'Right']])}</div>
                <div class="hbs-actions"><button type="button" class="hbs-btn" data-cvgo>${C.on ? 'Switch to compact view now' : 'Turn on compact view'}</button>
                    ${C.on ? '<button type="button" class="hbs-btn hbs-ghost" data-cvoff>Turn off</button>' : ''}</div>
                <div class="hbs-hint">${C.on ? 'On - minimizing the Suite shows the compact tab instead of the round icon.' : 'Off - minimizing the Suite shows the round icon.'}</div></div>` : '');
    }
    function cvChainBind() {
        const o = bodyEl.querySelector('[data-cvopt]'); if (o) o.addEventListener('click', () => { cvOptOpen = !cvOptOpen; render(true); });
        bodyEl.querySelectorAll('[data-cvset]').forEach(g => g.addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (!b) return;
            cvSet({ [g.dataset.cvset]: b.dataset.v }); render(true); }));
        const go = bodyEl.querySelector('[data-cvgo]'); if (go) go.addEventListener('click', () => { cvSet({ on: true, open: true }); setCollapsed(true); cvDraw(); });
        const off = bodyEl.querySelector('[data-cvoff]'); if (off) off.addEventListener('click', () => { cvSet({ on: false }); render(true); });
    }

    const dm = { offer: null, asking: false, msg: '', stop: null, uncovered: false, warnUntil: 0 };
    const dmGet = () => store.get(K.cwDump, null) || {};
    const dmSet = p => store.set(K.cwDump, Object.assign(dmGet(), p));
    const dmCfg = () => (cw.state && cw.state.config) || {};
    const dmMine = () => { const r = me && ((cw.state || {}).queue || []).find(x => num(x.pid) === me.id); return (r && r.dump) || null; };
    const dmOnAttack = () => /[?&]sid=attack\b/.test(location.search) || /loader\.php/.test(location.pathname) && /sid=attack/.test(location.href);
    function dmBtnHtml() {
        if (!cw.queued || !dmCfg().dumpOn) return '';
        const d = dmMine(), lit = (d && d.st === 'on') || dm.offer || dm.asking;
        return `<button type="button" class="hbs-btn hbs-ghost hbs-dmbtn${lit ? ' on' : ''}" data-dm="toggle" title="${d && d.st === 'on' ? 'Stop dumping' : 'Dump energy - burn your hits fast before going offline (bonus hits stay protected)'}">💩</button>`;
    }
    function dmLineHtml() {
        if (!cw.queued || !dmCfg().dumpOn) return '';
        const d = dmMine(), S = dmGet();
        if (d && d.st === 'on') { const done = Math.max(num(d.done), num(S.done));
            return `<div class="hbs-dmline"><span>💩 <b>${int(done)} / ${int(d.allow)}</b></span><i><em style="width:${Math.min(100, Math.round(done / Math.max(1, num(d.allow)) * 100))}%"></em></i><small>stop at ${int(d.stop_at)}</small></div>`; }
        if (d && (d.st === 'stopped' || dm.stop)) return `<div class="hbs-dmstop"><b>STOP · bonus protected</b><span>${esc((dm.stop && dm.stop.text) || S.stopText || `Hits before the bonus at ${int((d || {}).bonus)} are reserved.`)}</span><small>You'll be told when dumping opens again.</small></div>`;
        if (dm.offer) return `<div class="hbs-dmline"><span>Dump <b>${int(dm.offer.allow)} hit${num(dm.offer.allow) === 1 ? '' : 's'}</b> · stop at ${int(dm.offer.stop_at)}</span><button type="button" class="hbs-btn" data-dm="start">Start</button><button type="button" class="hbs-btn hbs-ghost" data-dm="cancel" title="Cancel">✕</button></div>`;
        if (dm.asking) return `<div class="hbs-dmline"><span>Asking the Hub…</span></div>`;
        if (dm.msg) return `<div class="hbs-dmline"><span>💩 ${esc(dm.msg)}</span><button type="button" class="hbs-btn hbs-ghost" data-dm="cancel" title="Dismiss">✕</button></div>`;
        return '';
    }
    function dmBind() {
        bodyEl.querySelectorAll('[data-dm]').forEach(b => b.addEventListener('click', () => {
            const a = b.dataset.dm, d = dmMine();
            if (a === 'toggle') {
                if (d && d.st === 'on') { cwSend({ t: 'dump', do: 'stop' }); store.set(K.cwDump, null); dm.msg = 'Stopped dumping.'; }   // [HB Suite] Hub - Chain Watch message "dump" stop
                else if (dm.offer || dm.asking) { dm.offer = null; dm.asking = false; }
                else { dm.msg = ''; dm.asking = true; cwSend({ t: 'dump', do: 'ask' });                                                // [HB Suite] Hub - Chain Watch message "dump" ask
                    setTimeout(() => { if (dm.asking) { dm.asking = false; dm.msg = 'No answer from the Hub - try again.'; cwShow(); } }, 12000); }
            } else if (a === 'start') { if (!dm.offer) return;
                dmSet({ done: 0, last: num(cwChain().current), st: 'on', stopText: '' }); dm.offer = null; dm.asking = true;
                setTimeout(() => { if (dm.asking) { dm.asking = false; cwShow(); } }, 12000);
                cwSend({ t: 'dump', do: 'start' });                                                                                    // [HB Suite] Hub - Chain Watch message "dump" start
            } else if (a === 'cancel') { dm.offer = null; dm.asking = false; dm.msg = ''; }
            render(true);
        }));
    }
    function dmIn(m) {
        dm.asking = false;
        if (m.kind === 'offer') { dm.offer = m; dm.msg = ''; }
        else if (m.kind === 'refused') { dm.offer = null; dm.msg = m.text || 'Not right now.'; toast('💩 ' + dm.msg, false); }
        else if (m.kind === 'started') { dm.offer = null; dm.stop = null; dm.msg = '';
            dmSet({ st: 'on', done: 0, last: num(m.chain) || num(cwChain().current), bonus: num(m.bonus), buffer: num(m.buffer), stopText: '' });
            toast(`💩 Dumping - ${int(m.allow)} hit${num(m.allow) === 1 ? '' : 's'}, stop at chain ${int(m.stop_at)}.`, true); }
        else if (m.kind === 'stop') { dm.stop = { text: m.text || 'STOP - bonus protected.' }; dmSet({ st: 'stopped', bonus: num(m.bonus), buffer: num(m.buffer), stopText: dm.stop.text });
            alertMe('🛑 ' + dm.stop.text, true); try { alSound('urgent', true); } catch (e) {   } }
        else if (m.kind === 'done') { dm.stop = null; dm.msg = m.text || 'Dump finished.'; store.set(K.cwDump, null); toast('💩 ' + dm.msg, true);
            if (m.finished && cw.queued) { try { cwAction('leave'); } catch (e) {   } } }
        else if (m.kind === 'reopen') { dm.stop = null; dm.msg = m.text || 'Dumping is open again.'; store.set(K.cwDump, null); alertMe('💩 ' + dm.msg, true); }
        cwShow();
    }
    let dmSyncAt = 0;
    setInterval(() => {
        try {
            if (!me || !modOn('chain')) return;
            const d = dmMine(), S = dmGet();
            if (d && (d.st !== S.st || S.cover !== (dmCfg().dumpCover !== false))) dmSet({ st: d.st, bonus: num(d.bonus), buffer: num(dmCfg().dumpBuffer), cover: dmCfg().dumpCover !== false });
            if (!d && cw.state && !dm.asking) {
                if (S.st) store.set(K.cwDump, null);
                if (dm.stop) { dm.stop = null; cwShow(); }
            }
            if (d && d.st === 'on') {
                const cur = num(cwChain().current), last = num(S.last);
                if (cur > last) {
                    const p = { last: cur };
                    if (last > 0 && dmOnAttack() && !document.hidden) { p.done = Math.max(num(S.done), num(d.done)) + 1;
                        cwSend({ t: 'dump', do: 'hit', done: p.done }); }                           // [HB Suite] Hub - Chain Watch message "dump" hit (your count)
                    dmSet(p); cwShow();
                } else if (!last && cur) dmSet({ last: cur });
                if (Date.now() - dmSyncAt > 3000) { dmSyncAt = Date.now(); cwSyncSoon(); }
            }
            dmCover();
        } catch (e) {   }
    }, 500);
    let dmCovEl = null, dmWarnEl = null;
    function dmCoverWanted() {
        if (dm.uncovered || !dmOnAttack() || !pageScrapeAllowed()) return null;
        const S = dmGet(), d = dmMine(), g = dmCfg(), have = !!cw.state;
        if (!(have ? d : S.st)) return null;
        if (have ? g.dumpCover === false || !g.dumpOn : S.cover === false) return null;
        let cur = num(cwChain().current);
        if (!cur) { const sn = store.get(K.cwSnap, null); if (sn && sn.chain && Date.now() - num(sn.at) < 120000) cur = num(sn.chain.current); }
        if (!(cur > 0)) return null;
        const b = (cw.state || {}).bonus || {}, buf = num(g.dumpBuffer) || num(S.buffer) || 10;
        let next = num(b.next) || num(S.bonus); if (next === 10) next = 25;
        if (!next || next <= cur || next - cur > buf) return null;
        if (b.pid && me && num(b.pid) === me.id) return null;
        return { cur, next, name: b.name || '' };
    }
    function dmFindBtn() {
        const els = document.querySelectorAll('button, [role="button"], input[type="submit"]');
        for (const x of els) { if (x.closest('#hbs-panel, #hbs-compact, #hbs-dmcover')) continue;
            const t = (x.textContent || x.value || '').trim(); if (!/^(start|join) fight$/i.test(t)) continue;
            const r = x.getBoundingClientRect(); if (r.width > 4 && r.height > 4) return r; }
        return null;
    }
    function dmCover() {
        const w = dmCoverWanted(), r = w ? dmFindBtn() : null;
        if (dmWarnEl && Date.now() > dm.warnUntil) { dmWarnEl.remove(); dmWarnEl = null; }
        if (!w || !r) { if (dmCovEl) { dmCovEl.remove(); dmCovEl = null; } return; }
        if (!dmCovEl) {
            dmCovEl = el('div'); dmCovEl.id = 'hbs-dmcover'; document.body.appendChild(dmCovEl);
            dmCovEl.addEventListener('click', e => { e.preventDefault(); e.stopPropagation();
                dm.uncovered = true; if (dmCovEl) { dmCovEl.remove(); dmCovEl = null; }
                const x = dmCoverWanted.last || {};
                dmWarnEl = el('div'); dmWarnEl.id = 'hbs-dmwarn'; dmWarnEl.innerHTML = `<b>Uncovered.</b> Chain ${int(x.cur)} of ${int(x.next)}. Only hit if leaders asked you to. The cover returns on the next attack page.`;
                document.body.appendChild(dmWarnEl); dm.warnUntil = Date.now() + 20000; });
        }
        dmCoverWanted.last = w;
        const W = Math.max(r.width + 16, 230), H = Math.max(r.height + 16, 74), vw = window.innerWidth;
        dmCovEl.style.cssText = `left:${Math.max(4, Math.min(vw - W - 4, r.left + r.width / 2 - W / 2))}px;top:${Math.max(4, r.top + r.height / 2 - H / 2)}px;width:${W}px;min-height:${H}px;`;
        const html = `<b>🛡 Bonus protected · chain ${int(w.cur)} of ${int(w.next)}</b><span>This hit could take the bonus${w.name ? ` - the assigned hitter is ${esc(w.name)}` : ''}.</span><u>Tap to uncover the attack button</u>`;
        if (dmCovEl._h !== html) { dmCovEl.innerHTML = html; dmCovEl._h = html; }
        const hh = dmCovEl.offsetHeight; if (hh > H) dmCovEl.style.top = Math.max(4, r.top + r.height / 2 - hh / 2) + 'px';
    }

    const VIEW0 = (() => { try { return store.get(K.view, null) || {}; } catch (e) { return {}; } })();
    let profileBack = VIEW0.back || null;
    let viewHoldUntil = 0, viewUserScrolled = false;
    const viewKey = () => showSettings ? 'settings' : tab + (tab === 'members' && profileId ? ':' + profileId : '');
    function viewSave() {
        const v = store.get(K.view, null) || {};
        v.pid = profileId || null; v.back = profileBack || null; v.open = Object.assign({}, open); v.set = !!showSettings;
        v.scroll = v.scroll || {};
        store.set(K.view, v);
    }
    let viewScrollT = null;
    function viewOnScroll() {
        if (Date.now() < viewHoldUntil || !bodyEl) return;
        viewUserScrolled = true;
        clearTimeout(viewScrollT);
        viewScrollT = setTimeout(() => { const v = store.get(K.view, null) || {}; v.scroll = v.scroll || {};
            v.scroll[viewKey()] = Math.round(bodyEl.scrollTop); store.set(K.view, v); }, 250);
    }
    const viewHold = () => { viewHoldUntil = Date.now() + 900; viewUserScrolled = false; };
    function viewRestore() {
        viewSave();
        const want = num(((store.get(K.view, null) || {}).scroll || {})[viewKey()]);
        viewHoldUntil = Date.now() + 900;
        if (!want) return;
        bodyEl.scrollTop = want;
        setTimeout(() => { if (!viewUserScrolled && bodyEl.scrollTop < want) { viewHoldUntil = Date.now() + 300; bodyEl.scrollTop = want; } }, 450);
    }

    function isMemberId(id) {
        const c = cache['m:db/members.json'], M = c && c.data;
        return !!(M && (M.members || []).some(m => num(m.id) === num(id)));
    }
    function openProfile(pid) {
        if (!(tab === 'members' && profileId)) profileBack = tab === 'members' ? null : tab;
        profileId = Number(pid); tab = 'members'; store.set(K.tab, tab); showSettings = false;
        viewSave(); render(); bodyEl.scrollTop = 0;
    }
    function closeProfile() {
        profileId = null;
        if (profileBack && tabOk(profileBack)) { tab = profileBack; store.set(K.tab, tab); }
        profileBack = null; viewSave(); render();
    }

    async function warSummaryHtml() {
        const W = await readOpt('m', 'db/wars.json');
        const mine = ((W && W.wars) || []).map(w => (w.m || []).find(r => num(r[0]) === me.id)).filter(Boolean);
        const n = mine.length, hits = mine.reduce((a, r) => a + num(r[1]), 0), resp = mine.reduce((a, r) => a + num(r[2]), 0);
        return `<div class="hbs-card hbs-gold"><div class="hbs-r1"><span class="hbs-name">⚔ Your war summary</span></div>
            ${n ? '<div class="hbs-ctiles">' + tiles([[int(n), 'Wars involved'], [int(hits), 'Total war hits'], [int(resp), 'Total respect'],
                [(hits / n).toFixed(1), 'Avg hits / war'], [int(resp / n), 'Avg respect / war']]) + '</div>'
                : '<div class="hbs-hint">No ranked wars on record for you yet.</div>'}</div>`;
    }

    let ocLead = null;
    const loanIgnored = () => new Set(store.get(K.loanIgn, []) || []);
    const loanRead = () => store.get(K.loanCache, null) || {};
    function loanWrite(p) { const c = Object.assign(loanRead(), p); store.set(K.loanCache, c); return c; }
    let loanView = 'toloan', loanBusy = false, loanErr = '';
    async function ocLeadersHtml() {
        // [HB Suite] Hub API — op "live" what "spawn" (leaders): Notify list, delayed / paused crimes, missing items
        // just the two loan lists (missing / needs) - [HB Suite] Hub API — op "live" what "loans"
        ocLead = await live(me.leader ? 'spawn' : 'loans').catch(() => null);
        const S = ocLead || {}, N = await names().catch(() => ({ byId: {} }));
        const pl = (pid, name) => `<a href="#" data-prof="${pid}">${esc(name || nameOf(N, pid))}</a>`;
        let out = sec('Leaders');
        const NT = S.oc_notify || [];
        notifyList = NT; notifyTplS = S.notify_tpl || null;
        const todo = NT.filter(x => !(x.contacted && String(x.contacted.crime_id) === String(x.crime_id) && x.contacted.role === x.position)).length;
        const lastAt = c => c && c.at ? ` · last contact ${new Date(c.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : '';
        out += cmCard('ocntf', '📣', 'Notify (no OC script)', `<b class="hbs-foldn">${todo}</b><small>to do</small>`, todo > 0, `<div class="hbs-card"><div class="hbs-r1"><span class="hbs-name">📣 Notify (no OC script)</span><span class="hbs-chip">${todo} to do</span></div>`
            + (NT.length ? `<div class="hbs-hint">They can't see their OC seat. ✉️ opens the mail with the subject and message filled in; 💬 opens their profile - tap Chat and the message is typed in. You press Send. ✓ just logs it. Every leader sees the contact.</div>`
                + NT.map((x, i) => `<div class="hbs-li"><span>${pl(x.pid, x.name)}<br><span style="opacity:.75">${esc(x.crime)} #${esc(x.crime_id)} · ${esc(x.position)}${lastAt(x.contacted)}</span>
                    <br><span data-ntfst="${i}">${ntfBadge(x)}</span></span>
                    <span style="white-space:nowrap"><button class="hbs-btn" data-ntf="chat" data-i="${i}">💬</button> <button class="hbs-btn" data-ntf="mail" data-i="${i}">✉️</button> <button class="hbs-btn" data-ntf="sent" data-i="${i}">✓</button></span></div>`).join('')
                + '<div class="hbs-hint" data-ntfmsg></div>'
            : '<div class="hbs-hint">✅ Nobody to notify.</div>') + '</div>');
        const D = S.delays || [];
        out += cmCard('ocdel', '⏰', 'Delayed crimes', `<b class="hbs-foldn">${D.length}</b>`, D.length > 0, `<div class="hbs-card ${D.length ? 'hbs-red' : ''}"><div class="hbs-r1"><span class="hbs-name">⏰ Delayed crimes</span><span class="hbs-chip">${D.length}</span></div>`
            + (D.length ? D.map(d => `<div class="hbs-li"><span><a href="${OC_LINK(d.crime_id)}"><b>${esc(d.crime)}</b></a> #${esc(d.crime_id)}
                    ${(d.members || []).map(m => `<br>${pl(m.pid, m.name)} · ${esc(m.position)} - <b class="hbs-bad">${esc(m.reason)}</b>`).join('')}</span>
                    <span>${d.since ? `late ${dur((Date.now() - num(d.since)) / 1000)}` : ''}</span></div>`).join('')
                : '<div class="hbs-hint">✅ No ready crime is held up.</div>') + '</div>');
        const P = S.paused || [];
        out += cmCard('ocpau', '⏸️', 'Paused planning', `<b class="hbs-foldn">${P.length}</b>`, false, `<div class="hbs-card ${P.length ? 'hbs-alert' : ''}"><div class="hbs-r1"><span class="hbs-name">⏸️ Paused planning</span><span class="hbs-chip">${P.length}</span></div>`
            + (P.length ? P.map(c => `<div class="hbs-li"><span><a href="${OC_LINK(c.crime_id)}"><b>${esc(c.crime)}</b></a> #${esc(c.crime_id)} · ${c.filled}/${c.seats} filled
                    <br><span style="opacity:.75">open: ${esc((c.open || []).join(', ') || '?')}${c.expired_at ? ` · expires ${new Date(c.expired_at * 1000).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}</span></span></div>`).join('')
                : '<div class="hbs-hint">✅ No crime is waiting on an empty seat.</div>') + '</div>');
        const missing = Array.isArray(S.missing) ? S.missing : (loanRead().missing || []);
        if (ocLead && Array.isArray(S.needs)) loanWrite({ missing, needs: S.needs, mts: Date.now() });
        loanHighlight();
        const C = loanRead(), ig = loanIgnored(), unused = (C.unused || []).filter(e => !ig.has(e.pid + ':' + e.iid) && !(C.needs || []).includes(e.pid + ':' + e.iid));
        const onArm = onArmoury();
        const before = out; out = '';
        out += `<div class="hbs-card"><div class="hbs-r1"><span class="hbs-name">🧰 Loans</span></div>
            ${chips('loanv', [['toloan', `To loan · ${missing.length}`], ['unused', `Unused loans${C.unused ? ' · ' + unused.length : ''}`]], loanView)}
            <div class="hbs-hint">${onArm ? `You're on the Armoury: rows to <b style="color:#7cfc9a">loan</b> / <b style="color:#ff7a70">retrieve</b> are outlined. Loan opens Torn's form with the member filled in, Retrieve opens Torn's confirm - you press Torn's own LOAN / Yes.`
                : `Open your faction <a href="https://www.torn.com/factions.php?step=your&type=1#/tab=armoury&sub=utilities&start=0">Armoury → Utilities</a>, then press Loan / Retrieve here to jump to the row.`}</div>`;
        if (loanView === 'toloan') out += missing.length ? missing.map(m => `<div class="hbs-li"><span><b>${esc(m.item || '#' + m.item_id)}</b> → ${pl(m.pid, m.name)}
                <br><span style="opacity:.75">${esc(m.crime)} #${esc(m.crime_id)} · ${esc(m.position)} · ${esc(m.status)}</span></span>
                <button type="button" class="hbs-btn" data-loan="loan" data-iid="${m.item_id}" data-pid="${m.pid}" data-name="${esc(m.name)}">Loan</button></div>`).join('')
            : '<div class="hbs-hint">✅ Every member in a crime has their item.</div>';
        else {
            out += `<div class="hbs-actions"><button type="button" class="hbs-btn hbs-ghost" data-loanref${loanBusy ? ' disabled' : ''}>${loanBusy ? 'Reading…' : '↻ Refresh'}</button>
                ${ig.size ? `<button type="button" class="hbs-btn hbs-ghost" data-loanreset>Reset ignored (${ig.size})</button>` : ''}</div>
                ${C.uts ? `<div class="hbs-hint">Checked ${ago(Math.floor(C.uts / 1000))} · utilities only (temporary items ignored)</div>` : '<div class="hbs-hint">Refresh reads your faction\'s utilities once with your key (needs faction API access).</div>'}
                ${loanErr ? `<div class="hbs-msg">${esc(loanErr)}</div>` : ''}`;
            out += C.unused ? (unused.length ? unused.map(e => `<div class="hbs-li"><span><b>${esc(e.item)}</b> · loaned to ${pl(e.pid, e.name)}<br><span style="opacity:.75">not needed for any OC</span></span>
                <span style="white-space:nowrap"><button type="button" class="hbs-btn" data-loan="retrieve" data-iid="${e.iid}" data-pid="${e.pid}" data-name="${esc(e.name)}">Retrieve</button>
                <button type="button" class="hbs-btn hbs-ghost" data-loanign="${e.pid}:${e.iid}">Ignore</button></span></div>`).join('')
                : '<div class="hbs-hint">✅ No loaned utilities that nobody needs.</div>') : '';
        }
        ocLoansOut = cmCard('ocloan', '🧰', 'Loans', `<b class="hbs-foldn">${missing.length}</b><small>to loan${C.unused ? ' · ' + unused.length + ' unused' : ''}</small>`, missing.length > 0, out + '</div>') + await ocDeployedHtml() + ocSharingHtml();
        return before;
    }
    let ocLoansOut = '';
    function ocChatFill() {
        const P = store.get(K.chatFill, null);
        if (!P || Date.now() - num(P.at) > 180000) return;
        if (!/profiles\.php/.test(location.href) || !new RegExp('XID=' + P.pid + '(\\D|$)').test(location.href)) return;
        const vis = e => !!(e && e.getClientRects().length);
        const before = new Set([...document.querySelectorAll('textarea')]);
        let n = 0;
        const t = setInterval(() => {
            if (++n > 240) { clearInterval(t); return; }
            if (document.hidden) return;
            const ta = [...document.querySelectorAll('textarea')].find(x => !before.has(x) && vis(x) && !x.closest('#hbs-panel') && !x.value);
            if (!ta) return;
            clearInterval(t); store.set(K.chatFill, null);
            rsSetInput(ta, P.text); try { ta.focus(); } catch (e) {   }
            toast('💬 Message typed in for you - check it and press Enter to send.', true);
        }, 750);
    }
    setTimeout(ocChatFill, 0);
    const ocDep = { at: 0, d: null, err: '' };
    const ocDepOpen = () => !!store.get(K.ocDepOpen, false);
    const ocShareOpen = () => !!store.get(K.ocShareOpen, false);
    function ocSharingHtml() {
        if (!(me && me.leader)) return '';
        const open = ocShareOpen(), L = (ocDep.d && ocDep.d.sharing) || null;
        const yes = L ? L.filter(x => x.sharing).sort((a, b) => num(b.last) - num(a.last)) : [], no = L ? L.filter(x => !x.sharing) : [];
        const meta = L ? `<b class="hbs-foldn">${yes.length}</b><small>of ${L.length}</small>` : '<small>tap to load</small>';
        let out = cwFold('data-ocshare', '📡', 'Sharing CPR rates', meta, open, false);
        if (!open) return out;
        if (!L) return out + `<div class="hbs-foldb"><div class="hbs-hint">${ocDep.busy ? 'Loading…' : ocDep.err ? esc(ocDep.err) : 'Not available right now.'}</div></div>`;
        const NT = (ocDep.d && ocDep.d.cpr_notified) || {};
        const noScr = x => !x.sharing && !x.off && !x.script;
        const noteOf = x => { const n = NT[String(x.pid)]; return n && n.ts ? `<small class="nt">notified ${ago(Math.floor(num(n.ts) / 1000))}${n.by ? ' by ' + esc(n.by) : ''}</small>` : ''; };
        const row = (x, ok) => `<div class="hbs-depm"><a href="#" data-prof="${num(x.pid)}">${esc(x.name)}</a>${!ok && noScr(x) ? `<button type="button" class="hbs-btn hbs-cprn" data-cprnote="${num(x.pid)}" data-name="${esc(x.name)}" title="Open a Torn mail to ${esc(x.name)} with the Suite's install link filled in - you press Send">✉ Notify</button>` : ''}
            <span class="s ${ok ? 'ok' : 'no'}">${ok ? (x.last ? '✓ ' + ago(Math.floor(num(x.last) / (num(x.last) > 1e12 ? 1000 : 1))) : '✓ sharing')
                : x.off ? '✕ script running · sharing off' : x.script ? '… script running · no rates yet' : '✕ no script'}</span>${!ok && noScr(x) ? noteOf(x) : ''}</div>`;
        return out + `<div class="hbs-foldb"><div class="hbs-hint">Members whose script (or opt-in key) sends their checkpoint pass rates to the Hub, so the planner can seat them in roles they pass. Rates themselves aren't shown. The time is when their script last checked (every few minutes while it runs).</div>
            <div class="hbs-sec">Sharing · ${yes.length}</div>${yes.length ? yes.map(x => row(x, true)).join('') : '<div class="hbs-hint">Nobody yet.</div>'}
            <div class="hbs-sec">Not sharing · ${no.length}</div>${no.length ? no.map(x => row(x, false)).join('') : '<div class="hbs-hint">✅ Everyone shares.</div>'}</div>`;
    }
    const SUITE_GF = 'https://greasyfork.org/en/scripts/605562-heart-breakers-suite';
    const INVITE_DEFAULT = {
        subject: 'Please install the Heart Breakers Suite',
        mail: 'Hi {name},\n\nHeart Breakers now runs on one script: the **Heart Breakers Suite**. It shows your Organized Crime assignment, Chain Watch and more, and shares your OC pass rates with the Hub so leaders can seat you in the roles you pass best.\n\n'
            + 'Please install it here: [Heart Breakers Suite]({scripts})\n\nThanks! 💗' };
    async function cprNotify(pid, name) {
        const T = (ocDep.d && ocDep.d.invite_tpl) || {};
        const fill = t => String(t).replace(/\{(name|scripts|hub)\}/g, (m, k) => k === 'name' ? String(name || '') : k === 'scripts' ? SUITE_GF : HUB_BASE + '/m/');
        const md = fill(T.mail || INVITE_DEFAULT.mail), subject = mdPlain(fill(T.subject || INVITE_DEFAULT.subject));
        const html = mdHtml(md), text = mdPlain(md);
        store.set(K.mailFill, { pid: Number(pid), subject, html, text, at: Date.now() });
        await copyRich(html, text).catch(() => false);
        // [HB Suite] Hub API — op "cprnote": record that you notified this member (leaders; shown to every leader)
        hub('cprnote', { pid: Number(pid) }).then(r => { if (ocDep.d) { ocDep.d.cpr_notified = ocDep.d.cpr_notified || {}; ocDep.d.cpr_notified[String(pid)] = { ts: (r && r.ts) || Date.now(), by: (r && r.by) || (me && me.name) || '' }; }
            if (!collapsed && tab === 'oc') render(true); }, () => {});
        toast('Opening the mail - subject and message are filled in; check it and press Send. (Also copied.)', true);
        const url = `https://www.torn.com/messages.php#/p=compose&XID=${Number(pid)}`;
        const w = window.open(url, '_blank'); if (!w) location.href = url;
    }
    const DEP_ST = { needs_spawn: ['needs spawning', 'hbs-red'], recruiting: ['recruiting', 'hbs-green'], spawned: ['spawned', ''] };
    async function ocDeployedHtml() {
        if (!(me && me.leader)) return '';
        const open = ocDepOpen();
        if ((open || ocShareOpen()) && !ocDep.busy && (!ocDep.d || Date.now() - ocDep.at > 60000)) {
            ocDep.busy = true;
            live('deployed').then(d => { ocDep.d = d; ocDep.err = ''; }, e => { ocDep.err = e.message || 'Could not read the plan.'; })   // [HB Suite] Hub API — op "live" what "deployed" (leaders: the live OC plan's teams)
                .then(() => { ocDep.at = Date.now(); ocDep.busy = false; if (tab === 'oc' && !collapsed && !cwBusy()) render(true); });
        }
        const T = (ocDep.d && ocDep.d.teams) || [], need = T.filter(t => t.status === 'needs_spawn').length;
        const meta = ocDep.d ? `<b class="hbs-foldn">${T.length}</b>${need ? ` <small class="hbs-bad">${need} to spawn</small>` : ''}` : '<small>tap to load</small>';
        let out = cwFold('data-ocdep', '🚀', 'Deployed crimes', meta, open, need > 0);
        if (!open) return out;
        out += '<div class="hbs-foldb">' + (!ocDep.d && ocDep.busy ? '<div class="hbs-hint">Loading the plan…</div>' : '') + (ocDep.err ? `<div class="hbs-hint hbs-bad">${esc(ocDep.err)}</div>` : '')
            + (ocDep.d && ocDep.d.plan_ts ? `<div class="hbs-hint">Plan deployed ${ago(Math.floor(num(ocDep.d.plan_ts) / 1000))} · ${T.length} team${T.length === 1 ? '' : 's'}</div>` : '');
        out += T.length ? T.map(t => { const st = DEP_ST[t.status] || [t.status || '?', ''], M = t.members || [], joined = M.filter(m => m.joined).length, nOpen = (t.open || []).filter(o => !o.taken_by).length;
            
            return `<div class="hbs-card hbs-dep"><div class="hbs-r1"><span class="hbs-name">${t.crime_id ? `<a href="${OC_LINK(t.crime_id)}">${esc(t.crime)}</a> <small>#${esc(String(t.crime_id))}</small>` : esc(t.crime)}</span>
                    <span class="hbs-tag ${st[1]}">${st[0]}</span></div>
                <div class="hbs-sub">${t.difficulty != null ? `Difficulty ${esc(String(t.difficulty))} · ` : ''}${joined}/${M.length} joined${nOpen ? ` · <b class="hbs-bad">${nOpen} unfilled</b>` : ''}${t.success && t.success.chance != null ? ` · 🎲 ${(+t.success.chance).toFixed(1)}% calculated` : ''}${t.success_weighted != null ? ` · ${(+t.success_weighted).toFixed(1)}% weighted` : ''}${t.pay_day_max ? ` · ~$${big(t.pay_day_max)}/day (est)` : ''}</div>
                ${M.map(m => `<div class="hbs-depm t"><span class="r">${esc(m.slot || m.position)}${m.weight != null ? `<small class="hbs-wt">${m.weight}% weight</small>` : ''}</span><span class="n"><a href="#" data-prof="${num(m.pid)}">${esc(m.name)}</a>
                    <span class="s ${m.joined ? 'ok' : m.queued ? 'q' : 'no'}">${m.joined ? '✓ joined' : m.queued ? '⏳ queued' + (m.free_at ? (() => { const f = num(m.free_at) > 1e12 ? num(m.free_at) : num(m.free_at) * 1000; return f > Date.now() ? ' · free in ' + dur((f - Date.now()) / 1000) : ' · free now'; })() : '') : '✕ not joined'}</span></span>
                    ${m.rate != null ? `<span class="p">${Math.round(m.rate)}%</span>` : ''}</div>`).join('')}
                ${(t.open || []).map(o => `<div class="hbs-depm t open"><span class="r">${esc(o.position)}${o.weight != null ? `<small class="hbs-wt">${o.weight}% weight</small>` : ''}</span>
                    <span class="n">${o.taken_by ? `<a href="#" data-prof="${num(o.taken_by.pid)}">${esc(o.taken_by.name)}</a><span class="s q">seated · not on the plan</span>`
                        : `<i>unfilled</i><span class="s no">nobody assigned${o.item && o.item.name ? ' · needs ' + esc(o.item.name) : ''}</span>`}</span><span class="p"></span></div>`).join('')}</div>`; }).join('')
            : (ocDep.d ? '<div class="hbs-hint">No teams in the deployed plan.</div>' : '');
        return out + '</div>';
    }
    function ocLeadersBind() {
        bodyEl.querySelectorAll('[data-chips="loanv"] button').forEach(b => b.addEventListener('click', () => { loanView = b.dataset.v || b.dataset.val || b.value; render(true); }));
        bodyEl.querySelectorAll('[data-loan]').forEach(b => b.addEventListener('click', () => armouryAct(b.dataset.loan, Number(b.dataset.iid), Number(b.dataset.pid), b.dataset.name)));
        bodyEl.querySelectorAll('[data-loanign]').forEach(b => b.addEventListener('click', () => { const s = loanIgnored(); s.add(b.dataset.loanign); store.set(K.loanIgn, [...s]); render(true); }));
        const rs = bodyEl.querySelector('[data-loanreset]'); if (rs) rs.addEventListener('click', () => { if (confirm('Show every ignored loan again?')) { store.set(K.loanIgn, []); render(true); } });
        const rf = bodyEl.querySelector('[data-loanref]'); if (rf) rf.addEventListener('click', loanRefresh);
        const dp = bodyEl.querySelector('[data-ocdep]'); if (dp) dp.addEventListener('click', () => { const o = !ocDepOpen(); store.set(K.ocDepOpen, o); if (o) ocDep.at = 0; render(true); });
        bodyEl.querySelectorAll('[data-cprnote]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); cprNotify(b.dataset.cprnote, b.dataset.name); }));
        const sh = bodyEl.querySelector('[data-ocshare]'); if (sh) sh.addEventListener('click', () => { const o = !ocShareOpen(); store.set(K.ocShareOpen, o); if (o && !ocDep.d) ocDep.at = 0; render(true); });
    }
    async function loanRefresh() {
        if (loanBusy) return; loanBusy = true; loanErr = ''; render(true);
        try {
            const [d, N] = await Promise.all([
                // [HB Suite] Torn API — Loans: faction utilities with loaned_to (leaders, on Refresh only)
                tornGet('https://api.torn.com/faction/?selections=utilities'), names()]);
            const out = [];
            Object.keys(d || {}).forEach(k => { const arr = d[k]; if (!Array.isArray(arr)) return;
                arr.forEach(it => {
                    if (!it || it.loaned_to == null || it.loaned_to === 0 || it.loaned_to === '0' || it.loaned_to === '') return;
                    const iid = num(it.ID != null ? it.ID : it.id != null ? it.id : it.item_id);
                    String(it.loaned_to).split(',').forEach(tok => { const pid = parseInt(String(tok).trim(), 10);
                        if (!pid || !(N.byId[pid] || {}).current) return;
                        out.push({ pid, name: nameOf(N, pid), iid, item: it.name || '#' + iid }); });
                }); });
            loanWrite({ unused: out, uts: Date.now() });
        } catch (e) { loanErr = 'Couldn\'t read the armoury: ' + e.message; }
        loanBusy = false; loanHighlight(); render(true);
    }
    const onArmoury = () => /factions\.php/.test(location.href) && /tab=armou?ry/i.test(location.hash + location.href);
    function armRows() { return [...document.querySelectorAll('.img-wrap[data-itemid]')].map(iw => ({ el: iw.parentElement, iid: parseInt(iw.dataset.itemid, 10) })).filter(r => r.el && r.iid); }
    function rowPid(r) {
        const h = r.el.querySelector('.retrieve-cont input[name="user"]'); if (h && h.value) { const m = h.value.match(/\[(\d+)\]/); if (m) return +m[1]; }
        const a = r.el.querySelector('.loaned a[href*="XID="]'); if (a) { const m = a.href.match(/XID=(\d+)/); if (m) return +m[1]; }
        return null;
    }
    const rowAvail = r => { const l = r.el.querySelector('.loaned'); return !!l && /available/i.test(l.textContent) && !r.el.querySelector('.loaned a[href*="XID="]'); };
    function loanHighlight() {
        try {
            document.querySelectorAll('.hbs-arm-loan,.hbs-arm-retr').forEach(n => n.classList.remove('hbs-arm-loan', 'hbs-arm-retr'));
            if (!onArmoury() || !pageScrapeAllowed()) return;
            const C = loanRead(), ig = loanIgnored(), retr = {};
            const inUse = new Set(C.needs || []);
            (C.unused || []).filter(e => !ig.has(e.pid + ':' + e.iid) && !inUse.has(e.pid + ':' + e.iid)).forEach(e => { (retr[e.iid] = retr[e.iid] || new Set()).add(e.pid); });
            const need = new Set((C.missing || []).map(m => m.item_id));
            armRows().forEach(r => { const pid = rowPid(r);
                if (pid != null) { if (retr[r.iid] && retr[r.iid].has(pid)) r.el.classList.add('hbs-arm-retr'); }
                else if (rowAvail(r) && need.has(r.iid)) r.el.classList.add('hbs-arm-loan'); });
        } catch (e) {   }
    }
    function setNative(input, v) {
        try { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, v); } catch (e) { input.value = v; }
        ['input', 'keydown', 'keyup', 'change'].forEach(t => { try { input.dispatchEvent(new Event(t, { bubbles: true })); } catch (e) {   } });
    }
    const ARM_UTIL = '#/tab=armoury&sub=utilities&start=0';
    function armGoRetrieve(iid, pid, mode) {
        mode = mode === 'loan' ? 'loan' : 'retrieve';
        toast(`Opening Armoury → Utilities - tap ${mode === 'loan' ? 'Loan' : 'Retrieve'} again once the item is highlighted.`, true);
        if (/factions\.php/.test(location.pathname) && /step=your/.test(location.search)) location.hash = ARM_UTIL;
        else { try { sessionStorage.setItem('hbs_arm_go', JSON.stringify({ iid, pid, mode, at: Date.now() })); } catch (e) {   }
            location.href = 'https://www.torn.com/factions.php?step=your&type=1' + ARM_UTIL; return; }
        armFindLoaned(iid, pid, 0, mode);
    }
    let armTabTried = false;
    function armOpenUtilTab() {
        const li = document.querySelector('#faction-armoury-tabs li.utilities, ul.armory-main-tab li.utilities');
        if (!li) return false;
        if (li.classList.contains('ui-tabs-active')) return true;
        if (!armTabTried) { const a = li.querySelector('a.ui-tabs-anchor, a'); if (a) { armTabTried = true; a.click(); } }
        return false;
    }
    function armFindLoaned(iid, pid, n, mode) {
        const loan = mode === 'loan';
        if (!n) armTabTried = false;
        if (pageScrapeAllowed() && /factions\.php/.test(location.pathname)) { try { armOpenUtilTab(); } catch (e) {   } }
        if (n > 60) { toast(loan ? 'Couldn\'t find a free copy of that item on Armoury → Utilities - it may be in another category, or every copy is out on loan.' : 'Couldn\'t find that loaned copy on Armoury → Utilities - it may be in another category.', true); return; }
        setTimeout(() => {
            const row = onArmoury() && pageScrapeAllowed() ? armRows().filter(r => r.iid === iid).find(r => loan ? !rowPid(r) : rowPid(r) === pid) : null;
            if (!row) return armFindLoaned(iid, pid, n + 1, mode);
            try { armFilterApply(); } catch (e) {   }
            row.el.scrollIntoView({ behavior: 'smooth', block: 'center' }); row.el.classList.add('hbs-arm-pulse'); setTimeout(() => row.el.classList.remove('hbs-arm-pulse'), 2400);
            loanHighlight(); toast(loan ? 'Item highlighted - tap Loan again to fill in the member.' : 'Item highlighted - tap Retrieve again to open Torn\'s confirm.');
        }, 300);
    }
    try { const g = JSON.parse(sessionStorage.getItem('hbs_arm_go') || 'null'); sessionStorage.removeItem('hbs_arm_go');
        if (g && Date.now() - g.at < 30000) setTimeout(() => armFindLoaned(Number(g.iid), Number(g.pid), 0, g.mode), 1200); } catch (e) {   }
    function armouryAct(mode, iid, pid, name) {
        if (mode === 'retrieve') {
            if (store.get(K.armHide, false)) { store.set(K.armHide, false); try { armFilterApply(); } catch (e) {   } }
            if (!onArmoury() || !armRows().some(r => r.iid === iid && rowPid(r) === pid)) {
                if (!(onArmoury() && /sub=utilities/i.test(location.hash))) { armGoRetrieve(iid, pid); return; }
            }
        }
        if (mode === 'loan' && (!onArmoury() || !armRows().some(r => r.iid === iid)) && !(onArmoury() && /sub=utilities/i.test(location.hash))) { armGoRetrieve(iid, pid, 'loan'); return; }
        if (!onArmoury()) { toast('Open your faction Armoury → Utilities first, then tap this again.', true); return; }
        const rows = armRows().filter(r => r.iid === iid);
        if (!rows.length) { toast('That item isn\'t on this Armoury tab - open Utilities (or its category) and try again.', true); return; }
        const label = String(name || '').replace(/\s*\[\d+\]$/, '') + ' [' + pid + ']';
        if (mode === 'retrieve') {
            const row = rows.find(r => rowPid(r) === pid); if (!row) { toast('That loaned copy isn\'t on this tab.', true); return; }
            row.el.scrollIntoView({ behavior: 'smooth', block: 'center' }); row.el.classList.add('hbs-arm-pulse'); setTimeout(() => row.el.classList.remove('hbs-arm-pulse'), 2400);
            const b = row.el.querySelector('.item-action [data-role="retrieve"]');
            if (b && b.offsetParent !== null) { b.click(); toast('Confirm in Torn\'s pop-up (Yes).'); } else toast('Row found - tap Torn\'s Retrieve, then Yes.', true);
            loanWatch('retrieve', iid, pid, 0); return;
        }
        const row = rows.find(rowAvail) || rows.find(r => rowPid(r) == null) || rows[0];
        row.el.scrollIntoView({ behavior: 'smooth', block: 'center' }); row.el.classList.add('hbs-arm-pulse'); setTimeout(() => row.el.classList.remove('hbs-arm-pulse'), 2400);
        const b = row.el.querySelector('.item-action [data-role="loan"]');
        if (!b || b.offsetParent === null) { toast('Row found - tap Torn\'s Loan; member: ' + label, true); return; }
        b.click();
        let n = 0; const fill = () => { const f = row.el.querySelector('.loan-cont input[name="user"], .loan-cont input.ac-search');
            if (!f || f.offsetParent === null) { if (++n < 10) setTimeout(fill, 180); else toast('Type the member yourself: ' + label, true); return; }
            f.focus(); setNative(f, label); toast('Member filled (' + label + ') - pick them if a list shows, then press LOAN.'); };
        fill(); loanWatch('loan', iid, pid, 0);
    }
    function loanWatch(mode, iid, pid, t) {
        if (t > 25) return;
        setTimeout(() => {
            if (onArmoury() && pageScrapeAllowed()) {
                const has = armRows().filter(r => r.iid === iid).some(r => rowPid(r) === pid);
                if ((mode === 'retrieve' && !has) || (mode === 'loan' && has)) {
                    const C = loanRead();
                    if (mode === 'loan') loanWrite({ missing: (C.missing || []).filter(m => !(m.item_id === iid && m.pid === pid)) });
                    else loanWrite({ unused: (C.unused || []).filter(e => !(e.iid === iid && e.pid === pid)) });
                    loanHighlight(); if (!collapsed && tab === 'oc') render(true); return;
                }
            }
            loanWatch(mode, iid, pid, t + 1);
        }, 1000);
    }
    let loanPageT = null;
    function loanPageWatch() {
        if (!/factions\.php/.test(location.href)) return;
        const sched = () => { clearTimeout(loanPageT); loanPageT = setTimeout(() => { if (me && (me.leader || me.loans)) loanHighlight(); }, 500); };
        new MutationObserver(sched).observe(document.body, { childList: true, subtree: true });
        window.addEventListener('hashchange', sched); window.addEventListener('focus', sched); sched();
    }

    async function chainSummaryHtml() {
        const C = await readOpt('m', 'db/chains.json');
        const L = ((C && C.chains) || []).map(c => [c, (c.m || []).find(r => num(r[0]) === me.id)]).filter(x => x[1]);
        if (!L.length) return sec('⛓ Your chain summary') + '<div class="hbs-hint">No chains on record for you yet.</div>';
        const hits = L.reduce((a, [, r]) => a + num(r[1]), 0), resp = L.reduce((a, [, r]) => a + num(r[2]), 0), rets = L.reduce((a, [, r]) => a + num(r[3]), 0);
        const most = L.reduce((a, x) => num(x[1][1]) > num(a[1][1]) ? x : a, L[0]);
        const bon = ((C && C.chains) || []).flatMap(c => (c.b || []).filter(b => num(b[1]) === me.id));
        const top = bon.reduce((a, b) => num(b[0]) > num(a) ? num(b[0]) : a, 0);
        const hasB = ((C && C.chains) || []).some(c => Array.isArray(c.b));
        return sec('⛓ Your chain summary') + `<div class="hbs-card"><div class="hbs-ctiles">${tiles([
            [int(hits), 'Chain hits', `${int(L.length)} chains`], [(hits / L.length).toFixed(1), 'Avg hits / chain'], [int(resp), 'Respect'],
            [int(rets), 'Retaliations'], [int(most[1][1]), 'Most in a chain', `${int(most[0].length)}-hit chain`],
            hasB ? [top ? int(top) : '-', 'Highest bonus', bon.length ? `${int(bon.length)} bonus hit${bon.length === 1 ? '' : 's'}` : 'none yet'] : null])}</div></div>`;
    }

    const RS_POOL_MAX = 25000, RS_DETAIL_MAX = 1000, RS_SHARED_FRESH = 24, RS_QUICK_V = 3;
    const RS_TTL = { quick: 6 * 3600e3, ff: 24 * 3600e3, ffNone: 6 * 3600e3 };
    const RS_NEAR = 0.15;
    const RS_CRIT0 = { minLevel: 15, minBs: 500000, maxBs: 0, minRwHits: 1, maxLastActionHrs: 24, requireNoFaction: true,
        minXanPerDay: 0, minRespect: 0, skipHospHrs: 0, must: { fac: true }, enemyFlag: 50,
        minStreak: 0, minAvgHrs: 0, minRespDay: 0, minAtkDay: 0, minRefDay: 0, fitScore: 75, nearScore: 50,
        w: { lvl: 1, bs: 3, rw: 2, la: 2, fac: 2, xpd: 1, resp: 1, stk: 1, avg: 1, rpd: 1, apd: 1, fpd: 1 } };
    const RS_CHECKS = [['lvl', 'Level', 'minLevel', 0, 'at least'], ['bs', 'Battle stats (est.)', 'minBs', 50000, ''], ['rw', 'Ranked war hits', 'minRwHits', 0, 'at least'],
        ['la', 'Last seen', 'maxLastActionHrs', 0, 'within (hours)'], ['fac', 'No faction', 'requireNoFaction', 0, ''], ['stk', 'Current streak', 'minStreak', 0, 'at least (days)'],
        ['avg', 'Play time / day', 'minAvgHrs', 0.5, 'at least (hours)'], ['xpd', 'Xanax / day', 'minXanPerDay', 0.1, 'at least'], ['resp', 'Respect earned', 'minRespect', 1000, 'at least'],
        ['rpd', 'Respect / day', 'minRespDay', 0.5, 'at least'], ['apd', 'Attacks won / day', 'minAtkDay', 0.1, 'at least'], ['fpd', 'Refills / day', 'minRefDay', 0.05, 'at least']];
    const RS_TPL0 = "Hi {name}! I'm recruiting for Heart Breakers. We're an active ranked-war faction and you look like a great fit. Interested in joining? Happy to answer any questions.";
    const rsCrit = () => { const s = store.get(K.rsCrit, {}) || {}; return Object.assign({}, RS_CRIT0, s, { w: Object.assign({}, RS_CRIT0.w, s.w || {}) }); };
    const perDay = (q, k) => (q && q[k] != null && q.age > 0) ? q[k] / q.age : null;
    const rsTpl = () => store.get(K.rsTpl, '') || RS_TPL0;
    const RS_SUBJ0 = 'Heart Breakers is recruiting';
    const rsSubj = () => store.get(K.rsSubj, '') || RS_SUBJ0;
    const rsRate = () => Math.max(10, Math.min(90, num(store.get(K.rsRate, 50)) || 50));
    const rsHubAuto = () => store.get(K.rsHubAuto, true) !== false;
    const rsHubPct = () => Math.max(0, Math.min(100, num(store.get(K.rsHubPct, 75))));
    const rsFf = () => String(store.get(K.ffKey, '') || '').trim();

    let rsDb = { v: 1, candidates: {} }, rsLoaded = false;
    const RS_BIG = (typeof PDA_httpGet === 'function' || typeof GM_setValue !== 'function') && typeof indexedDB !== 'undefined';
    let rsBigReady = !RS_BIG, rsBigWant = false, rsStoreErr = '';
    let rsIdbP = null;
    const rsIdb = () => rsIdbP || (rsIdbP = new Promise((res, rej) => {
        const q = indexedDB.open('hbs', 1);
        q.onupgradeneeded = () => { try { q.result.createObjectStore('kv'); } catch (e) {   } };
        q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error || new Error('database not available')); q.onblocked = () => rej(new Error('database blocked'));
    }));
    const rsIdbGetAll = keys => rsIdb().then(db => new Promise((res, rej) => {
        const out = {}, tx = db.transaction('kv', 'readonly'), st = tx.objectStore('kv');
        keys.forEach(k => { const g = st.get(k); g.onsuccess = () => { out[k] = g.result; }; });
        tx.oncomplete = () => res(out); tx.onerror = tx.onabort = () => rej(tx.error || new Error('read failed'));
    }));
    const rsIdbPut = pairs => rsIdb().then(db => new Promise((res, rej) => {
        const tx = db.transaction('kv', 'readwrite'), st = tx.objectStore('kv');
        Object.keys(pairs).forEach(k => { if (pairs[k] === undefined) st.delete(k); else st.put(pairs[k], k); });
        tx.oncomplete = () => res(true); tx.onerror = tx.onabort = () => rej(tx.error || new Error('save failed'));
    }));
    const rsStoreFail = e => { rsStoreErr = String((e && (e.name === 'QuotaExceededError' ? 'this device is out of storage space' : e.message || e.name)) || 'save failed'); console.warn(LOG, 'recruit storage:', rsStoreErr); };
    const rsSmallSet = (k, v) => { try { if (typeof GM_setValue === 'function') { GM_setValue(k, v); return true; } localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { rsStoreFail(e); return false; } };
    function rsLeaderLoad() {
        if (rsLoaded) return; rsLoaded = true;
        const d = store.get(K.rsDb, null); if (d && d.candidates) rsDb = d;
        rsPoolLoad();
        if (RS_BIG) rsBigLoad();
    }
    async function rsBigLoad() {
        try {
            const keys = [K.rsDb].concat(Array.from({ length: RS_SHARDS }, (_, i) => rsShardKey(i)));
            const got = await rsIdbGetAll(keys);
            const legacyDb = Object.keys(rsDb.candidates || {}).length, legacyPool = Object.keys(rsPool).length;
            const bd = got[K.rsDb];
            if (bd && bd.candidates) rsDb = Object.assign({}, bd, rsDb, { candidates: Object.assign({}, bd.candidates, rsDb.candidates || {}) });
            const merged = {};
            for (let i = 0; i < RS_SHARDS; i++) { const sh = got[rsShardKey(i)]; if (sh && typeof sh === 'object') Object.assign(merged, sh); }
            rsPool = Object.assign(merged, rsPool);
            rsShardSaved.fill('');
            rsBigReady = true;
            await rsBigWrite(true);
            if (legacyDb || legacyPool) { try { localStorage.removeItem(K.rsDb); localStorage.removeItem(K.rsPool); for (let i = 0; i < RS_SHARDS; i++) localStorage.removeItem(rsShardKey(i)); } catch (e) {   } }
            rsStoreErr = '';
        } catch (e) { rsBigReady = true; rsStoreFail(e); }
        if (!collapsed && tab === 'recruit' && rsView !== 'set') render(true);
    }
    let rsBigBusy = null;
    function rsBigWrite(withDb) {
        if (!rsBigReady) { rsBigWant = true; return Promise.resolve(false); }
        const pairs = {}, parts = Array.from({ length: RS_SHARDS }, () => ({})), js = [];
        for (const id in rsPool) parts[rsShardOf(id)][id] = rsPool[id];
        parts.forEach((p, i) => { const j = JSON.stringify(p); js[i] = j; if (j !== rsShardSaved[i]) pairs[rsShardKey(i)] = p; });
        if (withDb) pairs[K.rsDb] = rsDb;
        if (!Object.keys(pairs).length) return Promise.resolve(true);
        const run = () => rsIdbPut(pairs).then(() => { parts.forEach((p, i) => { if (rsShardKey(i) in pairs) rsShardSaved[i] = js[i]; }); rsStoreErr = ''; return true; }, e => { rsStoreFail(e); return false; });
        rsBigBusy = (rsBigBusy || Promise.resolve()).then(run, run);
        return rsBigBusy;
    }
    const RS_SHARDS = 16, rsShardKey = i => K.rsPool + '_' + i, rsShardOf = id => Number(id) % RS_SHARDS;
    const rsShardSaved = new Array(RS_SHARDS).fill('');
    let rsPool = {};
    function rsPoolLoad() {
        const old = store.get(K.rsPool, null);
        for (let i = 0; i < RS_SHARDS; i++) { const sh = store.get(rsShardKey(i), null); if (sh && typeof sh === 'object') { Object.assign(rsPool, sh); rsShardSaved[i] = JSON.stringify(sh); } }
        if (old && typeof old === 'object' && Object.keys(old).length) { Object.assign(rsPool, old); setTimeout(() => { rsPoolWrite(); store.set(K.rsPool, null); }, 0); }
    }
    function rsPoolWrite() {
        if (!rsLoaded) return;
        if (RS_BIG) { rsBigWrite(false); return; }
        const parts = Array.from({ length: RS_SHARDS }, () => ({}));
        for (const id in rsPool) parts[rsShardOf(id)][id] = rsPool[id];
        let ok = true;
        parts.forEach((p, i) => { const j = JSON.stringify(p); if (j !== rsShardSaved[i]) { if (rsSmallSet(rsShardKey(i), p)) rsShardSaved[i] = j; else ok = false; } });
        if (ok) rsStoreErr = '';
    }
    let rsSaveT = null, rsPoolT = null;
    const rsDbWrite = () => { if (!rsLoaded) return; if (RS_BIG) { rsBigWrite(true); return; } if (rsSmallSet(K.rsDb, rsDb)) rsStoreErr = ''; };
    const rsSave = () => { if (!rsLoaded) return; clearTimeout(rsSaveT); rsSaveT = setTimeout(() => { rsSaveT = null; rsDbWrite(); }, RS_BIG ? 200 : 500); };
    const rsPoolSave = () => { clearTimeout(rsPoolT); rsPoolT = setTimeout(() => { rsPoolT = null; rsPoolWrite(); }, RS_BIG ? 200 : 800); };
    const rsFlush = () => { if (!rsLoaded) return; if (rsPoolT) { clearTimeout(rsPoolT); rsPoolT = null; rsPoolWrite(); } if (rsSaveT) { clearTimeout(rsSaveT); rsSaveT = null; rsDbWrite(); } };
    window.addEventListener('pagehide', rsFlush);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') rsFlush(); });
    const VCODE = { fit: 'f', near: 'n', fail: 'x', excl: 'e', '': '' }, VNAME = { f: 'fit', n: 'near', x: 'fail', e: 'excl', '': '' };
    const poolN = () => Object.keys(rsPool).length;
    function poolPut(pid, name, level) {
        pid = String(pid);
        const r = rsPool[pid];
        if (r) { if (name && !r[0]) r[0] = name; if (level != null && r[1] == null) r[1] = level; return false; }
        if (poolN() >= RS_POOL_MAX) {
            const old = Object.keys(rsPool).filter(k => !rsPool[k][4]).sort((a, b) => rsPool[a][7] - rsPool[b][7]).slice(0, 500);
            if (!old.length) return false;
            old.forEach(k => { delete rsPool[k]; });
        }
        rsPool[pid] = [name || '', level == null ? null : level, null, 0, 0, null, '', Date.now(), 0, 0];
        return true;
    }

    const xanPerDay = q => (q && q.xan != null && q.age > 0) ? q.xan / q.age : null;
    function rsEvaluate(c) {
        const cr = rsCrit(), q = c.quick, out = [];
        const nearMin = (v, min) => v >= min ? 'pass' : (v >= min * (1 - RS_NEAR) ? 'near' : 'fail');
        if (cr.minLevel > 0) out.push({ key: 'lvl', label: 'Lvl', value: q ? q.level : '?', state: q ? nearMin(q.level, cr.minLevel) : 'unknown' });
        if (cr.minBs > 0 || cr.maxBs > 0) { const bs = c.ff && c.ff.bs != null ? c.ff.bs : null;
            let st = 'unknown';
            if (bs != null) { st = cr.minBs > 0 ? nearMin(bs, cr.minBs) : 'pass';
                if (st === 'pass' && cr.maxBs > 0 && bs > cr.maxBs) st = bs <= cr.maxBs * (1 + RS_NEAR) ? 'near' : 'fail'; }
            out.push({ key: 'bs', label: 'BS', value: bs == null ? (c.ff ? 'no est.' : (rsFf() ? '?' : 'no key')) : ((c.ff.bsHuman || big(bs)) + ' est'), state: st }); }
        if (cr.minRwHits > 0) { const rw = q ? q.rwHits : null; out.push({ key: 'rw', label: 'RW hits', value: rw == null ? '?' : big(rw), state: rw == null ? 'unknown' : nearMin(rw, cr.minRwHits) }); }
        if (cr.maxLastActionHrs > 0) { let st = 'unknown', val = '?';
            if (q && q.lastActionTs) { const h = (Date.now() / 1000 - q.lastActionTs) / 3600; st = h <= cr.maxLastActionHrs ? 'pass' : (h <= cr.maxLastActionHrs * 2 ? 'near' : 'fail'); val = ago(q.lastActionTs); }
            out.push({ key: 'la', label: 'Seen', value: val, state: st }); }
        if (cr.requireNoFaction) out.push({ key: 'fac', label: 'Faction', value: q ? (q.factionId ? q.factionName || ('#' + q.factionId) : 'none') : '?', state: q ? (q.factionId ? 'fail' : 'pass') : 'unknown' });
        if (cr.minXanPerDay > 0) { const x = xanPerDay(q); out.push({ key: 'xpd', label: 'Xan/day', value: x == null ? '?' : x.toFixed(2), state: x == null ? 'unknown' : nearMin(x, cr.minXanPerDay) }); }
        if (cr.minRespect > 0) { const r = q ? q.respect : null; out.push({ key: 'resp', label: 'Respect', value: r == null ? '?' : big(r), state: r == null ? 'unknown' : nearMin(r, cr.minRespect) }); }
        if (cr.minStreak > 0) { const v = q ? q.streak : null; out.push({ key: 'stk', label: 'Streak', value: v == null ? '?' : int(v) + 'd', state: v == null ? 'unknown' : nearMin(v, cr.minStreak) }); }
        if (cr.minAvgHrs > 0) { const v = perDay(q, 'activity'); out.push({ key: 'avg', label: 'Play/day', value: v == null ? '?' : dur(v), state: v == null ? 'unknown' : nearMin(v / 3600, cr.minAvgHrs) }); }
        if (cr.minRespDay > 0) { const v = perDay(q, 'respect'); out.push({ key: 'rpd', label: 'Resp/day', value: v == null ? '?' : v.toFixed(1), state: v == null ? 'unknown' : nearMin(v, cr.minRespDay) }); }
        if (cr.minAtkDay > 0) { const v = perDay(q, 'attacksWon'); out.push({ key: 'apd', label: 'Wins/day', value: v == null ? '?' : v.toFixed(2), state: v == null ? 'unknown' : nearMin(v, cr.minAtkDay) }); }
        if (cr.minRefDay > 0) { const v = perDay(q, 'refills'); out.push({ key: 'fpd', label: 'Refills/day', value: v == null ? '?' : v.toFixed(2), state: v == null ? 'unknown' : nearMin(v, cr.minRefDay) }); }
        out.forEach(e => { e.w = Math.max(0, num(cr.w[e.key] != null ? cr.w[e.key] : 1)); });
        const must = cr.must || {}; out.forEach(e => { e.must = !!must[e.key]; });
        return out;
    }
    function rsExclusion(c, ev) {
        const q = c.quick; if (q && /federal/i.test(q.state || '')) return 'Federal jail';
        const cr = rsCrit();
        if (q && cr.skipHospHrs > 0 && /hospital/i.test(q.state || '') && q.stateUntil) { const h = (q.stateUntil - Date.now() / 1000) / 3600; if (h > cr.skipHospHrs) return `In hospital ${Math.round(h)}h`; }
        const bad = (ev || rsEvaluate(c)).filter(e => e.must && (e.state === 'fail' || e.state === 'near'));
        return bad.length ? 'Must-have: ' + bad.map(e => e.label).join(', ') : '';
    }
    function rsFit(c) {
        const ev = rsEvaluate(c), n = s => ev.filter(e => e.state === s).length;
        return { ev, pass: n('pass'), near: n('near'), fail: n('fail'), total: ev.length, excluded: c.quick ? rsExclusion(c, ev) : '', mustPending: ev.some(e => e.must && e.state === 'unknown') };
    }
    const rsPct = c => { const f = rsFit(c), W = f.ev.reduce((a, e) => a + e.w, 0);
        return W ? Math.round(1000 * f.ev.reduce((a, e) => a + e.w * (e.state === 'pass' ? 1 : e.state === 'near' ? 0.5 : 0), 0) / W) / 10 : 0; };
    const rsVerdict = c => { if (!c.quick) return ''; const f = rsFit(c); if (f.excluded) return 'excl';
        const sc = rsPct(c), cr = rsCrit(); return sc >= num(cr.fitScore) ? 'fit' : sc >= num(cr.nearScore) ? 'near' : 'fail'; };

    let rsLast = 0, rsBlocked = 0, rsStop = false;
    async function rsTorn(url) {
        for (let attempt = 0; attempt < 4; attempt++) {
            for (;;) { if (rsStop) throw new Error('stopped'); const at = Math.max(rsLast + 60000 / rsRate(), rsBlocked); if (Date.now() >= at) break; await sleep(Math.min(at - Date.now(), 1000)); }
            rsLast = Date.now();
            try { return await tornGet(url); }
            catch (e) { if (/too many/i.test(e.message || '')) { rsBlocked = Date.now() + 60000; rsSay('Torn rate limit hit - pausing 60s…'); continue; } throw e; }
        }
        throw new Error('Torn rate limit - try again later.');
    }
    async function rsQuick(id) {
        // [HB Suite] Torn API — Recruit Scout quick check: one player's profile + personal stats (v1, 1 call)
        const d = await rsTorn(`https://api.torn.com/user/${id}?selections=profile,personalstats`);
        const ps = d.personalstats || {}, fac = d.faction || {}, la = d.last_action || {}, st = d.status || {};
        const g = k => ps[k] == null ? null : num(ps[k]);
        return { name: d.name || '', level: num(d.level), age: num(d.age), factionId: num(fac.faction_id), factionName: fac.faction_name || '',
            lastActionTs: num(la.timestamp), state: st.state || '', stateUntil: num(st.until), respect: g('respectforfaction'),
            friends: d.friends == null ? null : num(d.friends), enemies: d.enemies == null ? null : num(d.enemies),
            rwHits: g('rankedwarhits'), xan: g('xantaken'), refills: g('refills'), attacksWon: g('attackswon'), activity: g('useractivity'),
            streak: g('activestreak'), bestStreak: g('bestactivestreak'), v: RS_QUICK_V, at: Date.now() };
    }
    const rsFfNeeded = c => !!(c && c.quick) && (!c.ff || Date.now() - c.ff.at > (c.ff.bs == null ? RS_TTL.ffNone : RS_TTL.ff));
    let rsFfNote = '';
    async function rsFlushFf(ids) {
        const key = rsFf(); if (!key) { rsFfNote = 'Battle stats: add your FFScouter key in ⚙ (Suite settings).'; return; }
        ids = ids.filter(id => rsFfNeeded(rsDb.candidates[id]));
        let found = 0, none = 0;
        for (let i = 0; i < ids.length; i += 200) {
            const chunk = ids.slice(i, i + 200);
            try {
                // [HB Suite] FFScouter API — Recruit Scout: battle-stat estimates for up to 200 scouted players (your FFScouter key)
                const rows = await new Promise((res, rej) => { const u = `https://ffscouter.com/api/v1/get-stats?key=${encodeURIComponent(key)}&targets=${chunk.join(',')}`;
                    const done = t => { try { res(JSON.parse(t)); } catch (e) { rej(new Error('FFScouter: bad response')); } };
                    if (typeof PDA_httpGet === 'function') { Promise.resolve(PDA_httpGet(u)).then(r => done((r && (r.responseText || r.response || r.body)) || '')).catch(() => rej(new Error('FFScouter unreachable'))); return; }
                    if (typeof GM_xmlhttpRequest === 'function') { GM_xmlhttpRequest({ method: 'GET', url: u, timeout: 20000, onload: r => done(r.responseText), onerror: () => rej(new Error('FFScouter unreachable')) }); return; }
                    fetch(u).then(r => r.text()).then(done).catch(() => rej(new Error('FFScouter unreachable'))); });
                if (!Array.isArray(rows)) throw new Error('FFScouter: ' + ((rows && (rows.error && (rows.error.message || rows.error))) || rows.message || 'unexpected answer'));
                const got = new Set();
                rows.forEach(r => { const c = r && rsDb.candidates[String(r.player_id)]; if (!c) return; got.add(String(r.player_id));
                    if (r.bs_estimate == null) none++; else found++;
                    c.ff = { bs: r.bs_estimate == null ? null : num(r.bs_estimate), bsHuman: r.bs_estimate_human || '', ff: r.fair_fight == null ? null : num(r.fair_fight), at: Date.now() }; });
                chunk.forEach(id => { if (!got.has(id) && rsDb.candidates[id]) { rsDb.candidates[id].ff = { bs: null, at: Date.now() }; none++; } });
            } catch (e) { rsFfNote = 'Battle stats: ' + e.message; return; }
            if (i + 200 < ids.length) await sleep(10000);
        }
        if (ids.length) rsFfNote = `Battle stats: ${found} found${none ? `, ${none} with no estimate` : ''}.`;
        rsSave();
    }

    // [HB Suite] Hub API — op "rcpool": the shared recruit pool (add scans / check results, look up, search)
    const rsHub = (b) => hub('rcpool', b);
    async function rsHubAdd(list) { for (let i = 0; i < list.length; i += 500) await rsHub({ do: 'add', players: list.slice(i, i + 500) }).catch(() => {}); }
    let rsHubOut = [], rsHubOutT = null;
    function rsMergeRow(c) {
        const q = c.quick || {};
        return { pid: Number(c.id), name: c.name || q.name || '', level: q.level, fac: q.factionId, la: q.lastActionTs, state: q.state,
            bs: c.ff && c.ff.bs != null ? Math.round(c.ff.bs) : null, pct: rsPct(c), verdict: rsVerdict(c), checked: q.at || null,
            contacted: c.contactedAt || (rsPool[c.id] && rsPool[c.id][8]) || null, data: c.quick ? rsPayload(c, false).data : null };
    }
    function rsHubResult(c) {
        rsHubOut.push(rsMergeRow(c));
        clearTimeout(rsHubOutT); rsHubOutT = setTimeout(rsHubFlush, rsHubOut.length >= 100 ? 0 : 4000);
    }
    async function rsHubFlush() { const l = rsHubOut.splice(0, 200); if (l.length) await rsHub({ do: 'merge', players: l }).catch(() => {}); if (rsHubOut.length) rsHubFlush(); }
    function rsAdopt(r) {
        const pid = String(r.pid); if (!rsPool[pid] && !poolPut(pid, r.name, r.level)) return;
        const p = rsPool[pid]; p[0] = r.name || p[0]; if (r.level != null) p[1] = num(r.level);
        if (r.contacted && num(r.contacted) > num(p[8])) p[8] = num(r.contacted);
        if (r.dnc != null) p[9] = r.dnc ? 1 : 0;
        if (r.checked && num(r.checked) > num(p[4])) { p[2] = r.fac == null ? null : num(r.fac); p[3] = num(r.la); p[4] = num(r.checked); p[5] = r.pct == null ? null : num(r.pct); p[6] = VCODE[r.verdict || ''] || ''; }
    }

    const rsN = () => Object.keys(rsDb.candidates).length;
    function rsNew(id, name) { return { _new: true, id: String(id), name: name || '', addedAt: Date.now(), quick: null, ff: null, deep: null, shortlisted: false, contacted: false, contactedAt: 0, note: '', error: '' }; }
    function rsSettle(c) {
        const v = rsVerdict(c), p = rsPool[c.id] || (poolPut(c.id, c.name, c.quick && c.quick.level), rsPool[c.id]);
        if (p) { const q = c.quick; p[0] = c.name || p[0]; p[1] = q.level; p[2] = q.factionId; p[3] = q.lastActionTs; p[4] = q.at; p[5] = rsPct(c); p[6] = VCODE[v]; }
        const keep = c.shortlisted || v === 'fit' || v === 'near';
        if (keep && c._new && rsN() > RS_DETAIL_MAX) { delete rsDb.candidates[c.id]; rsSay(`Scout list full (${RS_DETAIL_MAX}) - ${c.name || c.id} kept in the pool only.`); }
        else if (keep) { delete c._new; rsDb.candidates[c.id] = c; } else delete rsDb.candidates[c.id];
        rsHubResult(c); rsPoolSave(); rsSave();
    }

    const rsQ = []; let rsRunning = false, rsProg = { done: 0, total: 0 }, rsStatus = '', rsErr = false;
    function rsSay(t, err) { rsStatus = t || ''; rsErr = !!err; const n = bodyEl && bodyEl.querySelector('[data-rsstatus]'); if (n) { n.textContent = rsStatus; n.classList.toggle('hbs-bad', rsErr); } }
    let rsDrawT = null; const rsRedraw = () => { if (rsDrawT) return; rsDrawT = setTimeout(() => { rsDrawT = null; if (!collapsed && tab === 'recruit' && rsView !== 'hub' && rsView !== 'set' && !cwBusy()) render(true); }, 1500); };
    function rsEnqueue(type, id) { id = String(id); if (rsQ.some(t => t.type === type && t.id === id)) return false; rsQ.push({ type, id }); rsProg.total++; return true; }
    async function rsRun() {
        if (rsRunning || !rsQ.length) return;
        if (!getKey()) { rsSay('Add your Torn API key in ⚙ first.', true); return; }
        rsRunning = true; rsStop = false; if (rsView !== 'set') render(true);
        const ffIds = [], runIds = new Set();
        try {
            while (rsQ.length && !rsStop) {
                const t = rsQ.shift();
                const c = rsDb.candidates[t.id] || rsNew(t.id, (rsPool[t.id] || [])[0]);
                rsSay(`Checking ${rsProg.done + 1}/${rsProg.total}…`);
                try {
                    if (t.type === 'quick' || !(c.quick && c.quick.v === RS_QUICK_V && Date.now() - c.quick.at < RS_TTL.quick)) {
                        c.quick = await rsQuick(c.id); if (c.quick.name) c.name = c.quick.name; c.error = '';
                        if (rsFfNeeded(c)) ffIds.push(c.id);
                    }
                    rsDb.candidates[c.id] = c; runIds.add(c.id);
                } catch (e) {
                    if (e.message === 'stopped') break;
                    if (/key|access/i.test(e.message || '')) { rsSay(e.message, true); rsQ.length = 0; break; }
                    c.error = e.message || 'Check failed.'; if (rsDb.candidates[c.id]) rsDb.candidates[c.id] = c;
                }
                rsProg.done++;
                if (ffIds.length >= 200) { const ids = ffIds.splice(0); await rsFlushFf(ids); ids.forEach(id => { const x = rsDb.candidates[id]; if (x && x.quick && x.id !== c.id) rsSettle(x); }); }
                if (c.quick && !c.error) rsSettle(c);
                rsRedraw();
            }
            if (ffIds.length) { const ids = ffIds.splice(0); await rsFlushFf(ids); ids.forEach(id => { const x = rsDb.candidates[id]; if (x && x.quick && runIds.has(id)) rsSettle(x); }); }
            if (!rsStop && !rsErr) rsSay(`Done - ${rsProg.done} checked.`);
            if (!rsStop) await rsAutoHub();
            if (rsStop) rsSay('Stopped.');
        } finally { rsRunning = false; rsQ.length = 0; rsProg = { done: 0, total: 0 }; rsSave(); rsPoolSave(); rsHubFlush(); if (rsView !== 'set') render(true); }
    }

    function rsCollect(passive) {
        rsLeaderLoad();
        const found = new Map();
        const cur = (() => { const c = cache['m:db/members.json'], M = c && c.data; return new Set(((M && M.members) || []).filter(m => m.current).map(m => String(m.id))); })();
        document.querySelectorAll('a[href*="profiles.php?XID="]').forEach(a => {
            if (a.closest('#hbs-panel')) return;
            if (passive && a.closest('#chatRoot, [id*="chat" i], [class*="chat" i]')) return;
            const m = a.href.match(/XID=(\d+)/); if (!m) return;
            const name = (a.textContent || '').trim().replace(/\s*\[\d+\]\s*$/, '');
            let lvl = null, fac = null;
            const row = a.closest('li, tr, [class*="row"], [class*="user-info"]');
            if (row && row.textContent.length < 600) {
                const lv = row.querySelector('[class*="level"] .value, [class*="level"]');
                const t = (lv && lv.textContent) || row.textContent, mm = t.match(/(?:Level|Lvl\.?|LV)\s*:?\s*(\d{1,3})\b/i) || (lv && t.match(/\b(\d{1,3})\b/));
                if (mm && num(mm[1]) >= 1 && num(mm[1]) <= 100) lvl = num(mm[1]);
                const fl = row.querySelector('a[href*="factions.php?step=profile"]'), fm = fl && fl.href.match(/ID=(\d+)/i);
                if (fm) fac = num(fm[1]);
            }
            if (passive && (fac || cur.has(m[1]))) return;
            const was = found.get(m[1]);
            if (!was || (!was.name && name) || (was.level == null && lvl != null) || (was.fac == null && fac))
                found.set(m[1], { name: name || (was && was.name) || '', level: lvl != null ? lvl : (was && was.level), fac: fac || (was && was.fac) || null });
        });
        if (me) found.delete(String(me.id));
        return found;
    }
    function rsPoolAdd(found, onlyNew) {
        let added = 0; const up = [];
        found.forEach((v, id) => {
            const isNew = poolPut(id, v.name, v.level); if (isNew) added++;
            const p = rsPool[id]; if (p && v.fac && p[2] == null) p[2] = v.fac;
            if (p && (isNew || !onlyNew)) up.push({ pid: Number(id), name: v.name, level: v.level });
        });
        if (found.size) { rsPoolSave(); rsDncAt = 0; }
        if (up.length) rsHubAdd(up);
        return added;
    }
    function rsScan() {
        const found = rsCollect(false), added = rsPoolAdd(found, false);
        rsSay(found.size ? `Found ${found.size} players - ${added} new in the pool (${int(poolN())} / ${int(RS_POOL_MAX)}), sent to the Hub pool.` : 'No player links on this page.', !found.size);
        render(true);
    }

    let rsPassT = null, rsPassN = 0, rsPassUp = [], rsPassSentAt = 0, rsPassUrl = '', rsPassSig = '';
    const rsPassOn = () => !!store.get(K.rsPassive, false) && !!me && !!me.leader && modOn('recruit');
    function rsPassRun() {
        rsPassT = null;
        if (!rsPassOn() || !pageScrapeAllowed() || /factions\.php/.test(location.href)) return;
        const found = rsCollect(true);
        const sig = [...found.keys()].join(','); if (sig === rsPassSig && !rsPassUp.length) return;
        rsPassSig = sig;
        let added = 0;
        found.forEach((v, id) => {
            if (rsPool[id]) { const p = rsPool[id]; if (v.level != null && p[1] == null) p[1] = v.level; return; }
            if (poolPut(id, v.name, v.level)) { added++; rsPassUp.push({ pid: Number(id), name: v.name, level: v.level }); }
        });
        if (added) { rsPassN += added; rsPoolSave(); rsDncAt = 0; if (!collapsed && tab === 'recruit' && rsView === 'pool') render(true); }
        if (rsPassUp.length && Date.now() - rsPassSentAt >= 60000) { rsPassSentAt = Date.now(); rsHubAdd(rsPassUp.splice(0)); }
        else if (rsPassUp.length) setTimeout(rsPassSoon, 60000 - (Date.now() - rsPassSentAt) + 50);
    }
    function rsPassSoon() { if (!rsPassT) rsPassT = setTimeout(rsPassRun, 1500); }
    function rsPassWatch() {
        if (rsPassWatch.on) return; rsPassWatch.on = true;
        new MutationObserver(() => { if (rsPassOn()) rsPassSoon(); })
            .observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['href'] });
        ['hashchange', 'popstate', 'focus', 'visibilitychange'].forEach(ev => window.addEventListener(ev, () => { if (rsPassOn()) rsPassSoon(); }));
        setInterval(() => { if (!rsPassOn()) return; if (location.href !== rsPassUrl) { rsPassUrl = location.href; rsPassSoon(); } }, 2000);
        setInterval(() => { if (rsPassOn()) rsPassSoon(); }, 5000);
        rsPassSoon();
    }

    const RS_ATK_PAGES = 10;
    async function rsPullAttacks() {
        if (rsRunning) return;
        const st = store.get(K.rsAtk, null) || {};
        let from = num(st.to) ? num(st.to) + 1 : Math.floor(Date.now() / 1000) - 7 * 86400, last = num(st.to) || 0, pages = 0, attacks = 0, more = false;
        const found = new Map(), seen = new Set();
        rsRunning = true; rsStop = false; rsSay('Reading the faction attack log…'); render(true);
        try {
            for (; pages < RS_ATK_PAGES; ) {
                // [HB Suite] Torn API — Recruit: one page of the faction attack log (v2 faction/attacks, 100 attacks, oldest first)
                const d = await rsTorn(`https://api.torn.com/v2/faction/attacks?limit=100&sort=ASC&from=${from}`);
                const L = (d && d.attacks) || []; pages++;
                let fresh = 0;
                L.forEach(a => {
                    if (!a || seen.has(a.id)) return; seen.add(a.id); fresh++; attacks++;
                    last = Math.max(last, num(a.ended || a.started));
                    [a.attacker, a.defender].forEach(p => {
                        if (!p || !p.id) return;
                        const fid = p.faction && p.faction.id ? num(p.faction.id) : 0;
                        if (fid === FACTION_ID || (me && num(p.id) === me.id)) return;
                        found.set(String(p.id), { name: p.name || '', level: p.level != null ? num(p.level) : null, fac: fid });
                    });
                });
                rsSay(`Reading the faction attack log… ${int(attacks)} attacks`);
                if (L.length < 100 || !fresh) break;
                from = last;
                if (pages >= RS_ATK_PAGES) more = true;
            }
            let added = 0;
            found.forEach((v, id) => { if (poolPut(id, v.name, v.level)) added++; const p = rsPool[id]; if (p) { if (v.level != null) p[1] = v.level; if (!p[4]) p[2] = v.fac; } });
            if (found.size) { rsPoolSave(); rsDncAt = 0; rsHubAdd([...found].map(([id, v]) => ({ pid: Number(id), name: v.name, level: v.level }))); }
            store.set(K.rsAtk, { to: last || num(st.to), at: Date.now(), n: num(st.n) + attacks });
            rsSay(`Attack log: ${int(attacks)} new attacks read, ${int(found.size)} outside players (${int(added)} new in the pool, ${int([...found.values()].filter(v => !v.fac).length)} with no faction).${more ? ' More waiting - tap again.' : ''}`);
        } catch (e) { rsSay('Attack log: ' + e.message, true); }
        finally { rsRunning = false; render(true); }
    }

    let rsPf = Object.assign({ lmin: '', lmax: '', nofac: true, todo: true, nocont: true }, store.get(K.rsPf, {}) || {});
    const rsContacted = id => { const p = rsPool[id], c = rsDb.candidates[id]; return !!((p && p[8]) || (c && c.contactedAt)); };
    const rsDnc = id => !!(rsPool[id] && rsPool[id][9]);
    let rsDncAt = 0;
    async function rsDncSync() {
        if (Date.now() - rsDncAt < 300000) return; rsDncAt = Date.now();
        try { const r = await rsHub({ do: 'dnc' }); const set = new Set((r.pids || []).map(String));
            Object.keys(rsPool).forEach(id => { rsPool[id][9] = set.has(id) ? 1 : 0; }); rsPoolSave(); } catch (e) { rsDncAt = 0; }
    }
    const rsPoolRows = () => Object.entries(rsPool).filter(([, p]) => {
        if (rsPf.lmin !== '' && (p[1] == null || p[1] < num(rsPf.lmin))) return false;
        if (rsPf.lmax !== '' && (p[1] == null || p[1] > num(rsPf.lmax))) return false;
        if (rsPf.nofac && p[2] != null && p[2] !== 0) return false;
        if (rsPf.todo && p[4] && Date.now() - p[4] < RS_TTL.quick) return false;
        if (rsPf.nocont && p[8]) return false;
        if (p[9]) return false;
        return true; });
    async function rsCheckNext(n) {
        const pick = rsPoolRows().sort((a, b) => num(b[1][1]) - num(a[1][1]) || b[1][7] - a[1][7]).slice(0, n).map(([id]) => id);
        if (!pick.length) { rsSay('Nobody in the pool matches - scan a page or load from the Hub.'); return; }
        rsSay('Asking the Hub who was checked already…');
        let shared = 0;
        try {
            const rows = [];
            for (let i = 0; i < pick.length; i += 500) rows.push(...((await rsHub({ do: 'get', pids: pick.slice(i, i + 500).map(Number) })).rows || []));
            rows.forEach(x => { if (x.contacted || x.dnc) rsAdopt(x);
                if (x.checked && Date.now() - num(x.checked) < RS_SHARED_FRESH * 3600e3) { rsAdopt(x); shared++; } });
        } catch (e) {   }
        const todo = pick.filter(id => !(rsPool[id] && rsPool[id][4] && Date.now() - rsPool[id][4] < RS_SHARED_FRESH * 3600e3) && !(rsPf.nocont && rsContacted(id)) && !rsDnc(id));
        rsPoolSave();
        if (!todo.length) { rsSay(`All ${pick.length} were checked by a leader in the last ${RS_SHARED_FRESH} h - taken from the Hub (no Torn calls).`); render(true); return; }
        if (!confirm(`Check ${todo.length} players?${shared ? `\n(${shared} more were already checked by a leader - taken from the Hub.)` : ''}\nUses ${todo.length} Torn API calls (~${Math.ceil(todo.length / rsRate())} min at ${rsRate()}/min).`)) { render(true); return; }
        todo.forEach(id => rsEnqueue('quick', id)); rsRun();
    }
    async function rsExport(which) {
        const rows = which === 'scout' ? Object.values(rsDb.candidates).filter(c => c.quick).map(rsMergeRow)
            : Object.entries(rsPool).map(([id, p]) => ({ pid: Number(id), name: p[0], level: p[1], fac: p[4] ? p[2] : null, la: p[4] ? p[3] : null,
                checked: p[4] || null, pct: p[4] ? p[5] : null, verdict: VNAME[p[6]] || '', contacted: p[8] || null }));
        if (!rows.length) { rsSay('Nothing to export.'); return; }
        if (!confirm(`Export ${rows.length} players from your ${which === 'scout' ? 'scout list' : 'pool'} to the Hub pool?\nNo Torn API calls.`)) return;
        let done = 0;
        try { for (let i = 0; i < rows.length; i += 200) { await rsHub({ do: 'merge', players: rows.slice(i, i + 200) }); done += Math.min(200, rows.length - i); rsSay(`Exporting… ${int(done)} / ${int(rows.length)}`); } }
        catch (e) { rsSay(`Export stopped at ${int(done)}: ${e.message}`, true); return; }
        rsHubStatsAt = 0; rsSay(`Exported ${int(done)} players to the Hub pool.`); render(true);
    }
    let rsHubOff = 0, rsHubTot = null;
    async function rsLoadHub(more) {
        rsHubOff = more ? rsHubOff : 0;
        rsSay('Searching the Hub pool…');
        try {
            const r = await rsHub({ do: 'search', lvl_min: rsPf.lmin === '' ? null : num(rsPf.lmin), lvl_max: rsPf.lmax === '' ? null : num(rsPf.lmax),
                fac: rsPf.nofac ? 'none' : 'any', checked: rsPf.todo ? 'stale' : 'any', stale_days: 1, uncontacted: !!rsPf.nocont, sort: 'level', limit: 500, offset: rsHubOff });
            (r.rows || []).forEach(rsAdopt); rsHubOff += (r.rows || []).length; rsHubTot = r.total; rsPoolSave();
            rsSay(`Loaded ${int((r.rows || []).length)} from the Hub pool (${int(rsHubOff)} of ${int(r.total)} matching).`);
        } catch (e) { rsSay(e.message, true); }
        render(true);
    }

    function rsPayload(c, manual) {
        const q = c.quick || {}, f = rsFit(c);
        return { pid: Number(c.id), name: c.name || '', manual: !!manual, data: {
            level: q.level, age: q.age, factionId: q.factionId, factionName: q.factionName, lastActionTs: q.lastActionTs, rwHits: q.rwHits, xan: q.xan, refills: q.refills,
            attacksWon: q.attacksWon, streak: q.streak, bestStreak: q.bestStreak, lifeAvgSec: q.activity != null && q.age > 0 ? Math.round(q.activity / q.age) : null,
            bs: c.ff ? c.ff.bs : null, bsHuman: c.ff ? (c.ff.bsHuman || '') : '', ff: c.ff ? c.ff.ff : null,
            activity: null, respect: q.respect, friends: q.friends, enemies: q.enemies, xpd: xanPerDay(q),
            fit: { pass: f.pass, total: f.total, pct: rsPct(c), checks: f.ev.map(e => ({ key: e.key, label: e.label, value: String(e.value), state: e.state })) },
            checkedAt: q.at || null, ver: 'Suite ' + VERSION } };
    }
    const rsDataTs = c => Math.max(c.quick ? c.quick.at : 0, c.ff ? c.ff.at : 0);
    async function rsSendHub(list, manual) {
        list = list.filter(c => c && c.quick); let sent = 0, removed = 0;
        for (let i = 0; i < list.length; i += 100) {
            const chunk = list.slice(i, i + 100);
            // [HB Suite] Hub API — POST /rc/push: scouted recruits to the leaders' Recruitment list (your pid + faction, no key)
            const r = await postTo('/rc/push', { pid: me.id, faction: FACTION_ID, recruits: chunk.map(c => rsPayload(c, manual)) });
            const gone = new Set((r.removed || []).map(String));
            chunk.forEach(c => { if (gone.has(c.id)) { c.hubRemoved = true; removed++; } else { c.hubAt = Date.now(); c.hubRemoved = false; sent++; } });
        }
        rsSave(); return { sent, removed };
    }
    async function rsAutoHub() {
        if (!rsHubAuto()) return;
        const due = Object.values(rsDb.candidates).filter(c => { if (!c.quick || c.hubRemoved || rsPct(c) < rsHubPct() || (c.hubAt && c.hubAt >= rsDataTs(c))) return false;
            const f = rsFit(c); return !f.excluded && !f.mustPending; });
        if (!due.length) return;
        try { const r = await rsSendHub(due, false); rsSay(`Done - ${r.sent} sent to the Hub's Recruitment list (score ${rsHubPct()}+)${r.removed ? `, ${r.removed} skipped (removed on the Hub)` : ''}.`); }
        catch (e) { rsSay(e.message, true); }
    }

    function rsMsg(c) {
        const q = c.quick || {}, bs = c.ff && c.ff.bs != null ? (c.ff.bsHuman || big(c.ff.bs)) : '';
        const fill = t => t.replace(/\{name\}/g, c.name || 'there').replace(/\{level\}/g, q.level || '').replace(/\{id\}/g, c.id).replace(/\{bs\}/g, bs);
        const text = fill(rsTpl()), subject = fill(rsSubj());
        const html = String(text).replace(/\r\n?/g, '\n').split('\n').map(l => esc(l).replace(/https?:\/\/[^\s<]+/g, u => { const tail = (u.match(/[).,!?;:]+$/) || [''])[0], url = tail ? u.slice(0, -tail.length) : u; return `<a href="${url}">${url}</a>${tail}`; })).join('<br>');
        const p = rsPool[c.id] || (poolPut(c.id, c.name, c.quick && c.quick.level), rsPool[c.id]); if (p) p[8] = Date.now();
        c.contacted = true; c.contactedAt = Date.now();
        clearTimeout(rsPoolT); clearTimeout(rsSaveT); rsPoolT = rsSaveT = null; rsPoolWrite(); rsDbWrite();
        rsHub({ do: 'contact', pid: Number(c.id), name: c.name || '' }).catch(() => {});
        store.set(K.mailFill, { pid: Number(c.id), subject, html, text, at: Date.now() });
        copyRich(html, text).then(ok => { rsSay(`Opening the mail to ${c.name || c.id} - subject and message are filled in for you; check it and press Send yourself.${ok ? ' (Also copied, in case the page needs a paste.)' : ''}`); });
        const w = window.open(`https://www.torn.com/messages.php#/p=compose&XID=${c.id}`, '_blank'); if (!w) location.href = `https://www.torn.com/messages.php#/p=compose&XID=${c.id}`;
    }

    const RS_SHARED_KEYS = [[K.rsCrit, 'crit'], [K.rsTpl, 'tpl'], [K.rsSubj, 'subj'], [K.rsHubAuto, 'hubAuto'], [K.rsHubPct, 'hubPct']];
    const rsSetLocal = () => Object.fromEntries(RS_SHARED_KEYS.map(([k, n]) => [n, store.get(k, null)]));
    function rsSetDiff(a, b) {
        a = a || {}; b = b || {}; const out = [], A = a.crit || {}, B = b.crit || {};
        const name = Object.fromEntries(RS_CHECKS.map(c => [c[2], c[1]]));
        Object.assign(name, { maxBs: 'Max battle stats', fitScore: 'Fit score', nearScore: 'Near score', enemyFlag: 'Enemy flag', skipHospHrs: 'Skip hospital (h)', minBs: 'Min battle stats' });
        Object.keys(Object.assign({}, A, B)).forEach(k => {
            if (k === 'w' || k === 'must') return;
            if (JSON.stringify(A[k]) !== JSON.stringify(B[k])) out.push(`${name[k] || k} ${A[k] == null ? '-' : A[k]} → ${B[k] == null ? '-' : B[k]}`); });
        const lab = Object.fromEntries(RS_CHECKS.map(c => [c[0], c[1]]));
        Object.keys(Object.assign({}, A.w, B.w)).forEach(k => { const x = (A.w || {})[k], y = (B.w || {})[k]; if (x !== y) out.push(`weight ${lab[k] || k} ${x == null ? '-' : x} → ${y == null ? '-' : y}`); });
        Object.keys(Object.assign({}, A.must, B.must)).forEach(k => { const x = !!(A.must || {})[k], y = !!(B.must || {})[k]; if (x !== y) out.push(`${lab[k] || k} ${y ? 'now a must' : 'no longer a must'}`); });
        if ((a.tpl || '') !== (b.tpl || '')) out.push('message text'); if ((a.subj || '') !== (b.subj || '')) out.push('mail subject');
        if (a.hubAuto !== b.hubAuto || a.hubPct !== b.hubPct) out.push('Hub-list auto-send');
        return out;
    }
    let rsSetAtTry = 0;
    async function rsSyncSettings(force) {
        if (!me || !me.leader || (!force && Date.now() - rsSetAtTry < 60000)) return;
        rsSetAtTry = Date.now();
        let r; try { r = await hub('rcset', { do: 'get' }); } catch (e) { return; }      // [HB Suite] Hub API — op "rcset" get (leaders)
        if (!r || !r.data || num(r.updated) <= num(store.get(K.rsSetAt, 0))) return;
        const before = rsSetLocal();
        RS_SHARED_KEYS.forEach(([k, n]) => store.set(k, r.data[n] == null ? (k === K.rsCrit ? {} : k === K.rsHubAuto ? true : k === K.rsHubPct ? 75 : '') : r.data[n]));
        store.set(K.rsSetAt, num(r.updated));
        Object.values(rsDb.candidates).forEach(c => { if (c.quick && rsPool[c.id]) { rsPool[c.id][5] = rsPct(c); rsPool[c.id][6] = VCODE[rsVerdict(c)]; } }); rsPoolSave();
        if (num(r.by_pid) !== me.id && store.get(K.rsSetAt0, 0)) {
            const diff = rsSetDiff(before, r.data);
            store.set(K.rsSetNote, { by: r.by || 'A leader', at: num(r.updated), diff: diff.slice(0, 12) });
            toast(`⚙ Recruit settings changed by ${r.by || 'a leader'}${diff.length ? ': ' + diff.slice(0, 3).join(', ') + (diff.length > 3 ? '…' : '') : ''}`, true);
        }
        store.set(K.rsSetAt0, 1);
        if (!collapsed && tab === 'recruit' && rsView !== 'set') render(true);
    }
    async function rsUploadSettings(force) {
        const r = await hub('rcset', { do: 'put', data: rsSetLocal(), base: num(store.get(K.rsSetAt, 0)), force: !!force });   // [HB Suite] Hub API — op "rcset" put
        if (r && r.conflict) {
            if (!confirm(`${r.by || 'Another leader'} changed the shared recruit settings after you opened them (${fmtDT(Math.floor(num(r.updated) / 1000))} ${tzTag()}).\nSave yours over theirs?`)) {
                store.set(K.rsSetAt, 0); await rsSyncSettings(true); return false; }
            return rsUploadSettings(true);
        }
        store.set(K.rsSetAt, num(r.updated)); store.set(K.rsSetAt0, 1); return true;
    }

    function rsSetInput(el, v) {
        try { const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
              Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); } catch (e) { el.value = v; }
        ['input', 'keyup', 'change'].forEach(t => { try { el.dispatchEvent(new Event(t, { bubbles: true })); } catch (e) {   } });
    }
    function rsMailFill() {
        const P = store.get(K.mailFill, null);
        if (!P || Date.now() - num(P.at) > 600000) return;
        if (!/messages\.php/.test(location.href) || !/compose/i.test(location.hash) || !new RegExp('XID=' + P.pid + '(\\D|$)').test(location.hash)) return;
        let tries = 0, gotS = false, gotB = false;
        const vis = e => !!(e && e.getClientRects().length);
        const run = () => {
            if (document.hidden) { setTimeout(run, 800); return; }
            const subj = [...document.querySelectorAll('input[type="text"], input:not([type])')].find(i => vis(i) && !i.closest('#hbs-panel')
                && /subject/i.test((i.name || '') + ' ' + (i.id || '') + ' ' + (i.placeholder || '') + ' ' + (i.getAttribute('aria-label') || '')));
            if (subj && !gotS) { rsSetInput(subj, P.subject); gotS = true; }
            if (!gotB) {
                const ifr = [...document.querySelectorAll('iframe')].find(f => { try { return vis(f) && f.contentDocument && f.contentDocument.body && f.contentDocument.body.isContentEditable; } catch (e) { return false; } });
                const ce = [...document.querySelectorAll('[contenteditable="true"]')].find(e => vis(e) && !e.closest('#hbs-panel') && !e.closest('[class*="chat"]'));
                const ta = [...document.querySelectorAll('textarea')].find(t => vis(t) && !t.closest('#hbs-panel') && !t.closest('[class*="chat"]'));
                if (ifr) { const b = ifr.contentDocument.body; b.innerHTML = P.html; b.dispatchEvent(new Event('input', { bubbles: true })); gotB = true; }
                else if (ce) { ce.focus(); ce.innerHTML = P.html; ce.dispatchEvent(new Event('input', { bubbles: true })); gotB = true; }
                else if (ta) { rsSetInput(ta, P.text); gotB = true; }
            }
            if (gotS && gotB || ++tries > 25) {
                store.set(K.mailFill, null);
                toast(gotS || gotB ? `✉ ${gotS && gotB ? 'Subject and message' : gotS ? 'Subject' : 'Message'} filled in - check it and press Send.${gotS && gotB ? '' : ' Paste the rest (it was copied).'}`
                    : '✉ Couldn\'t find the mail form - paste the copied message.', !(gotS && gotB));
                return;
            }
            setTimeout(run, 800);
        };
        setTimeout(run, 600);
    }
    window.addEventListener('hashchange', rsMailFill);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', rsMailFill); else setTimeout(rsMailFill, 0);

    let rsView = store.get(K.rsView, 'pool'), rsList = 'all', rsSort = store.get(K.rsSort, 'fit');
    const RS_PAGE = 30;
    const rsShow = { pool: RS_PAGE, scout: RS_PAGE };
    const rsShowReset = () => { rsShow.pool = RS_PAGE; rsShow.scout = RS_PAGE; };
    const pgMore = (key, shown, total, loading) => shown < total
        ? `<div class="hbs-pgmore" data-pgmore="${key}"><button type="button" class="hbs-btn hbs-ghost"${loading ? ' disabled' : ''}>${loading ? 'Loading…' : `Show ${Math.min(RS_PAGE, total - shown)} more`}</button><small>${int(shown)} of ${int(total)} · scroll for more</small></div>`
        : (total > RS_PAGE ? `<div class="hbs-pgend">All ${int(total)} shown</div>` : '');
    let pgIO = null;
    function pgBind(onMore) {
        if (pgIO) { try { pgIO.disconnect(); } catch (e) {   } pgIO = null; }
        const el = bodyEl.querySelector('[data-pgmore]'); if (!el) return;
        let fired = false; const go = () => { if (fired) return; fired = true; if (pgIO) { pgIO.disconnect(); pgIO = null; } onMore(el.dataset.pgmore); };
        const b = el.querySelector('button'); if (b) b.addEventListener('click', go);
        if ('IntersectionObserver' in window) {
            try { pgIO = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) go(); }, { root: bodyEl, rootMargin: '0px 0px 400px 0px' }); pgIO.observe(el); } catch (e) { pgIO = null; }
        }
    }
    async function recruitHtml() {
        rsLeaderLoad();
        if (!modOn('recruit')) return `<div class="hbs-empty">The Recruit module is off - turn it on in ⚙.</div>`;
        rsSyncSettings();
        const head = chips('rsv', [['pool', `🗃 Pool · ${int(poolN())}`], ['scout', `🔎 Scout · ${int(rsN())}`], ['hub', '📋 Hub list'], ['set', '⚙ Criteria']], rsView)
            + `<div class="hbs-actions"><button type="button" class="hbs-btn" data-rs="scan">Scan page</button>
                ${rsRunning ? `<button type="button" class="hbs-btn hbs-ghost" data-rs="stop">■ Stop</button>` : ''}</div>
            <div class="hbs-hint${rsErr ? ' hbs-bad' : ''}" data-rsstatus>${esc(rsStatus)}</div>${rsFfNote ? `<div class="hbs-hint">${esc(rsFfNote)}</div>` : ''}
            ${rsStoreErr ? `<div class="hbs-hint hbs-bad">⚠ The pool / scout list couldn't be saved on this device (${esc(rsStoreErr)}) - what you see may be gone after leaving this page.</div>` : ''}
            ${RS_BIG && !rsBigReady ? '<div class="hbs-hint">Loading your saved pool and scout list…</div>' : ''}`;
        if (rsView === 'hub') return head + await rcHubHtml();
        if (rsView === 'set') return head + rsSetHtml();
        if (rsView === 'scout') return head + rsScoutHtml();
        return head + await rsPoolHtml();
    }
    function recruitBind() {
        bindChips('rsv', v => { rsView = v; store.set(K.rsView, v); rsShowReset(); });
        const on = (sel, fn) => { const b = bodyEl.querySelector(sel); if (b) b.addEventListener('click', fn); };
        on('[data-rs="scan"]', rsScan); on('[data-rs="stop"]', () => { rsStop = true; rsQ.length = 0; rsSay('Stopping…'); });
        if (rsView === 'hub') { rcHubBind(); return; }
        if (rsView === 'set') { rsSetBind(); return; }
        if (rsView === 'scout') { rsScoutBind(); return; }
        rsPoolBind();
    }

    const rsTiles = rows => `<div class="hbs-rsg">${rows.filter(Boolean).map(([v, l, cls]) => `<div${cls ? ` class="${cls}"` : ''}><b>${v}</b><span>${l}</span></div>`).join('')}</div>`;
    function rsDataTiles(x) {
        if (!x) return '';
        if (x.compact) return `<div class="hbs-hint">Older entry - only the level was kept (Lvl ${x.level != null ? int(x.level) : '?'}).</div>`;
        const b2 = v => v == null ? '-' : esc(big(v));
        return rsTiles([[x.level != null ? int(x.level) : '-', 'Level'], [x.bsHuman ? esc(x.bsHuman) : x.bs != null ? b2(x.bs) : '-', 'Battle stats'],
            [b2(x.rwHits), 'RW hits'], [x.lastActionTs ? ago(x.lastActionTs) : '-', 'Last seen'], [b2(x.respect), 'Respect'], [b2(x.attacksWon), 'Attacks won'],
            [x.xpd != null ? (+x.xpd).toFixed(2) : '-', 'Xanax / day'], [x.streak != null ? int(x.streak) + 'd' : '-', 'Streak'], [x.age != null ? int(x.age) + 'd' : '-', 'Account age'],
            [x.lifeAvgSec != null ? dur(x.lifeAvgSec) : '-', 'Avg / day'], [b2(x.refills), 'Refills'], [x.enemies != null ? `${b2(x.friends)} / ${b2(x.enemies)}` : '-', 'Friends / enemies']]);
    }

    let rsHubStats = null, rsHubStatsAt = 0;
    async function rsPoolHtml() {
        await rsDncSync();
        if (Date.now() - rsHubStatsAt > 60000) { rsHubStatsAt = Date.now(); rsHubStats = await rsHub({ do: 'stats' }).catch(() => rsHubStats); }
        const rows = rsPoolRows(), all = Object.values(rsPool), H = rsHubStats || {};
        const V = { f: '<span class="hbs-tag hbs-green">fit</span>', n: '<span class="hbs-tag">near</span>', x: '<span class="hbs-tag hbs-red">no fit</span>', e: '<span class="hbs-tag hbs-red">excluded</span>' };
        const mins = n => Math.ceil(n / rsRate());
        return `<div class="hbs-card">${rsTiles([[int(all.length), `on device / ${big(RS_POOL_MAX)}`], [int(all.filter(p => p[4]).length), 'checked'],
                [int(all.filter(p => p[6] === 'f' || p[6] === 'n').length), 'fit / near'], [H.total != null ? int(H.total) : '-', 'Hub pool'],
                [H.total != null ? int(H.checked) : '-', 'Hub checked'], [H.total != null ? int(H.contacted) : '-', 'contacted']])}
            <label class="hbs-ck hbs-rspass"><input type="checkbox" data-rspass${store.get(K.rsPassive, false) ? ' checked' : ''}> 🛰 Collect players from pages I visit${store.get(K.rsPassive, false) ? ` · ${int(rsPassN)} this session` : ''}</label>
            <div class="hbs-hint">Background, no API calls: only the page you're on while Torn is focused. Skips faction pages, chat, players showing a faction icon and our members.</div>
            <div class="hbs-row"><span class="hbs-hint">Level</span><input class="hbs-input" style="width:64px" inputmode="numeric" data-rspf="lmin" placeholder="min" value="${esc(rsPf.lmin)}">
                <input class="hbs-input" style="width:64px" inputmode="numeric" data-rspf="lmax" placeholder="max" value="${esc(rsPf.lmax)}"></div>
            <label class="hbs-ck"><input type="checkbox" data-rspf="nofac"${rsPf.nofac ? ' checked' : ''}> No faction (or not checked yet)</label>
            <label class="hbs-ck"><input type="checkbox" data-rspf="todo"${rsPf.todo ? ' checked' : ''}> Not checked in the last 6 h</label>
            <label class="hbs-ck"><input type="checkbox" data-rspf="nocont"${rsPf.nocont ? ' checked' : ''}> Hide anyone a leader already contacted</label>
            <div class="hbs-hint"><b>${int(rows.length)}</b> match on this device.</div>
            <div class="hbs-rsbtns">${[25, 50, 100, 250].map(n => `<button type="button" class="hbs-btn${n === 50 ? '' : ' hbs-ghost'}" data-rsnext="${n}"${rsRunning ? ' disabled' : ''}>Check ${n}</button>`).join('')}
                <button type="button" class="hbs-btn hbs-ghost" data-rsnext="all"${rsRunning || !rows.length ? ' disabled' : ''}>Check all · ${int(rows.length)}${rows.length ? ` (~${mins(rows.length)} min)` : ''}</button></div>
            ${(() => { const A = store.get(K.rsAtk, null); return `<div class="hbs-rsbtns"><button type="button" class="hbs-btn hbs-ghost" data-rs="atk"${rsRunning ? ' disabled' : ''}>⚔ Pull from attack logs</button></div>
                <div class="hbs-hint">${A && A.to ? `Read up to ${fmtDT(A.to)} ${tzTagH()} (${int(A.n)} attacks so far) - the next pull continues from there.` : 'Players who attacked us or we attacked (not our members), with their level and faction. Uses your key (faction API access), up to 10 calls a tap; first pull = the last 7 days.'}</div>`; })()}
            <div class="hbs-rsbtns"><button type="button" class="hbs-btn hbs-ghost" data-rs="hubload">⇩ Load from Hub</button>
                ${rsHubTot != null && rsHubOff < rsHubTot ? `<button type="button" class="hbs-btn hbs-ghost" data-rs="hubmore">⇩ Next 500 (${int(rsHubOff)}/${int(rsHubTot)})</button>` : ''}
                <button type="button" class="hbs-btn hbs-ghost" data-rs="exppool">⇪ Export pool to Hub</button>
                <button type="button" class="hbs-btn hbs-ghost" data-rs="poolclear">Clear device pool</button></div>
            <div class="hbs-hint">Scan page adds players (ID, name, level when the page shows it) - no Torn call. Scans and check results also go to the shared Hub pool: a player any leader checked in the last ${RS_SHARED_FRESH} h isn't read again, and anyone a leader messaged is marked contacted for everyone.</div></div>`
            + rows.sort((a, b) => num(b[1][1]) - num(a[1][1]) || b[1][7] - a[1][7]).slice(0, rsShow.pool).map(([id, p]) => `<div class="hbs-rsrow">
                <div class="t"><a href="https://www.torn.com/profiles.php?XID=${id}" target="_blank" rel="noopener">${esc(p[0] || '#' + id)}</a> <small>[${id}]</small>${V[p[6]] ? ' ' + V[p[6]] : ''}</div>
                <div class="s">${p[1] != null ? `<b>Lvl ${p[1]}</b>` : 'Lvl ?'}${p[2] ? ' · in a faction' : p[4] ? ' · no faction' : ''}${p[5] != null ? ` · ${Math.round(p[5])}% of checks` : ''}
                    · ${p[4] ? 'checked ' + ago(Math.floor(p[4] / 1000)) : 'not checked'}${p[8] ? ` · <span class="hbs-bad">✉ contacted ${ago(Math.floor(p[8] / 1000))}</span>` : ''}</div></div>`).join('')
            + pgMore('pool', Math.min(rsShow.pool, rows.length), rows.length);
    }
    function rsPoolBind() {
        bodyEl.querySelectorAll('[data-rspf]').forEach(i => i.addEventListener('change', () => { rsPf[i.dataset.rspf] = i.type === 'checkbox' ? i.checked : i.value.replace(/\D/g, ''); store.set(K.rsPf, rsPf); rsHubTot = null; rsShowReset(); render(true); }));
        pgBind(k => { rsShow[k] += RS_PAGE; render(true); });
        const ps = bodyEl.querySelector('[data-rspass]'); if (ps) ps.addEventListener('change', () => { store.set(K.rsPassive, ps.checked); if (ps.checked) { rsPassWatch(); rsPassSoon(); } render(true); });
        bodyEl.querySelectorAll('[data-rsnext]').forEach(b => b.addEventListener('click', () => rsCheckNext(b.dataset.rsnext === 'all' ? Infinity : Number(b.dataset.rsnext))));
        const on = (sel, fn) => { const b = bodyEl.querySelector(sel); if (b) b.addEventListener('click', fn); };
        on('[data-rs="atk"]', rsPullAttacks);
        on('[data-rs="hubload"]', () => rsLoadHub(false)); on('[data-rs="hubmore"]', () => rsLoadHub(true)); on('[data-rs="exppool"]', () => rsExport('pool'));
        on('[data-rs="poolclear"]', () => { if (!confirm(`Clear the ${int(poolN())} players in this device's pool? The Hub pool and your scout list stay.`)) return; rsPool = {}; rsPoolWrite(); rsSay('Device pool cleared.'); render(true); });
    }

    const RS_SORTS = { fit: 'Best score', bs: 'Battle stats', rw: 'RW hits', xpd: 'Xanax / day', resp: 'Respect', lvl: 'Level', added: 'Newest' };
    function rsScoutHtml() {
        let L = Object.values(rsDb.candidates);
        const tot = L.length;
        if (rsList === 'fits') L = L.filter(c => c.quick && rsVerdict(c) === 'fit');
        else if (rsList === 'short') L = L.filter(c => c.shortlisted);
        if (rsPf.nocont) L = L.filter(c => !rsContacted(c.id) || c.shortlisted);
        L = L.filter(c => !rsDnc(c.id) || c.shortlisted);
        const key = c => { if (!c.quick) return [2, 0]; const f = rsFit(c), q = c.quick, sc = rsPct(c);
            const k = { bs: -(c.ff && c.ff.bs || 0), rw: -(q.rwHits || 0), xpd: -(xanPerDay(q) || 0), resp: -(q.respect || 0), lvl: -(q.level || 0), added: -(c.addedAt || 0) }[rsSort];
            return [f.excluded ? 1 : 0].concat(k == null ? [-sc, f.fail] : [k, -sc]); };
        L.sort((a, b) => { const x = key(a), y = key(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; });
        return chips('rsl', [['all', `All · ${tot}`], ['fits', 'Fits'], ['short', '★ Shortlist']], rsList)
            + `<div class="hbs-rstool"><label class="hbs-rsfld"><span>Sort by</span><select class="hbs-input" data-rssort>${Object.keys(RS_SORTS).map(k => `<option value="${k}"${k === rsSort ? ' selected' : ''}>${RS_SORTS[k]}</option>`).join('')}</select></label>
                <button type="button" class="hbs-btn hbs-ghost" data-rs="ffall">↻ Update battle stats</button>
                <button type="button" class="hbs-btn hbs-ghost" data-rs="expscout">⇪ Export list to Hub</button></div>
            <label class="hbs-ck"><input type="checkbox" data-rsnocont${rsPf.nocont ? ' checked' : ''}> Hide contacted players</label>
            <div class="hbs-hint">Fits and near fits from your checks (up to ${int(RS_DETAIL_MAX)}). Players who don't fit stay in 🗃 Pool only.</div>`
            + (L.length ? L.slice(0, rsShow.scout).map(rsCard).join('') + pgMore('scout', Math.min(rsShow.scout, L.length), L.length)
                : `<div class="hbs-empty">${tot ? 'Nobody in this view.' : 'Open a page with players (e.g. Advanced Search, no faction), tap <b>Scan page</b>, then 🗃 Pool → <b>Check</b>.'}</div>`);
    }
    function rsCard(c) {
        const q = c.quick, f = rsFit(c), cr = rsCrit(), MARK = { pass: '✓', near: '~', fail: '✕', unknown: '?' };
        const enemies = q && q.enemies != null && num(cr.enemyFlag) > 0 && q.enemies >= num(cr.enemyFlag);
        const pct = q ? Math.round(rsPct(c)) : 0;
        const ct = c.contactedAt || (rsPool[c.id] && rsPool[c.id][8]) || 0;
        const vd = rsVerdict(c);
        return `<div class="hbs-card hbs-rscard ${!q ? '' : vd === 'fit' ? 'hbs-green' : vd === 'near' ? 'hbs-alert' : 'hbs-red'}" data-rsid="${esc(c.id)}">
            <div class="hbs-rshd"><a class="hbs-name" href="https://www.torn.com/profiles.php?XID=${esc(c.id)}" target="_blank" rel="noopener">${esc(c.name || 'Player ' + c.id)}</a>
                <small>[${esc(c.id)}]</small>${c.shortlisted ? ' <span class="hbs-tag">★</span>' : ''}
                <div class="hbs-rsfit"><i style="width:${pct}%"></i></div><small>${q ? `score <b>${pct}</b> · ${f.pass} / ${f.total} checks passed` : 'not checked'}</small></div>
            ${enemies ? `<div class="hbs-banner">⚠ ${esc(big(q.enemies))} enemies</div>` : ''}${f.excluded ? `<div class="hbs-banner">⛔ ${esc(f.excluded)}</div>` : ''}
            ${f.ev.length ? `<div class="hbs-rsck">${f.ev.map(e => `<span class="${e.state}${e.must ? ' must' : ''}" title="weight ${e.w}">${MARK[e.state]} ${esc(e.label)} ${esc(e.value)}</span>`).join('')}</div>` : ''}
            ${q ? rsDataTiles(rsPayload(c, false).data) : ''}
            ${c.shortlisted ? `<input class="hbs-input" data-rsnote maxlength="300" placeholder="Note…" value="${esc(c.note || '')}" style="width:100%;margin-top:6px">` : ''}
            <div class="hbs-rsact"><button type="button" class="hbs-btn" data-rsa="msg">✉ Message</button>
                <button type="button" class="hbs-btn hbs-ghost" data-rsa="star">${c.shortlisted ? '★ Listed' : '☆ Shortlist'}</button>
                ${q ? '<button type="button" class="hbs-btn hbs-ghost" data-rsa="hub">⇪ Hub list</button>' : ''}
                <button type="button" class="hbs-btn hbs-ghost" data-rsa="${c.error ? 'retry' : 'del'}">${c.error ? '↻ Retry' : '✕ Remove'}</button></div>
            <div class="hbs-hint">${[c.hubRemoved ? '<span class="hbs-bad">Removed on the Hub list - ⇪ adds them back</span>' : c.hubAt ? `<span class="hbs-good">✓ On the Hub list · ${ago(Math.floor(c.hubAt / 1000))}</span>` : '',
                ct ? `<span class="hbs-bad">✉ Contacted ${ago(Math.floor(ct / 1000))}</span>` : '', c.error ? `<span class="hbs-bad">${esc(c.error)}</span>` : ''].filter(Boolean).join(' · ')}</div></div>`;
    }
    function rsScoutBind() {
        bindChips('rsl', v => { rsList = v; rsShowReset(); });
        pgBind(k => { rsShow[k] += RS_PAGE; render(true); });
        const ss = bodyEl.querySelector('[data-rssort]'); if (ss) ss.addEventListener('change', () => { rsSort = ss.value; store.set(K.rsSort, rsSort); rsShowReset(); render(true); });
        const nc = bodyEl.querySelector('[data-rsnocont]'); if (nc) nc.addEventListener('change', () => { rsPf.nocont = nc.checked; store.set(K.rsPf, rsPf); render(true); });
        const on = (sel, fn) => { const b = bodyEl.querySelector(sel); if (b) b.addEventListener('click', fn); };
        on('[data-rs="expscout"]', () => rsExport('scout'));
        on('[data-rs="ffall"]', async () => { rsSay('Fetching battle stats…'); const ids = Object.keys(rsDb.candidates); await rsFlushFf(ids);
            ids.forEach(id => { const c = rsDb.candidates[id]; if (c && c.quick) rsSettle(c); }); rsSay(rsFfNote); render(true); });
        bodyEl.querySelectorAll('[data-rsa]').forEach(b => b.addEventListener('click', () => {
            const c = rsDb.candidates[b.closest('[data-rsid]').dataset.rsid]; if (!c) return;
            const a = b.dataset.rsa;
            if (a === 'retry') { if (rsEnqueue('quick', c.id)) rsRun(); }
            else if (a === 'star') { c.shortlisted = !c.shortlisted; rsSave(); render(true); }
            else if (a === 'msg') { rsMsg(c); render(true); }
            else if (a === 'hub') rsSendHub([c], true).then(r => { rsSay(r.sent ? `${c.name || c.id} is on the Hub's Recruitment list.` : 'Not sent.', !r.sent); render(true); }).catch(e => rsSay(e.message, true));
            else if (a === 'del') { delete rsDb.candidates[c.id]; rsSave(); render(true); }
        }));
        bodyEl.querySelectorAll('[data-rsnote]').forEach(i => i.addEventListener('change', () => { const c = rsDb.candidates[i.closest('[data-rsid]').dataset.rsid]; if (c) { c.note = i.value.slice(0, 300); rsSave(); } }));
    }

    function rsSetHtml() {
        const cr = rsCrit(), m = cr.must || {};
        const numIn = (k, step, v) => `<input class="hbs-input" type="number" min="0" inputmode="decimal" ${step ? `step="${step}"` : ''} data-rsc="${k}" value="${v != null ? v : cr[k]}">`;
        const box = (lab, input) => `<label class="hbs-rsfld"><span>${lab}</span>${input}</label>`;
        const row = ([key, label, field, step, unit]) => `<div class="hbs-rscrit">
            <div class="h"><b>${label}</b><label class="hbs-rsmust"><input type="checkbox" data-rsm="${key}"${m[key] ? ' checked' : ''}> must</label></div>
            <div class="f${key === 'bs' ? ' f3' : ''}">${key === 'fac' ? `<label class="hbs-rsfld hbs-rsfldck"><span>required</span><input type="checkbox" data-rsc="requireNoFaction"${cr.requireNoFaction ? ' checked' : ''}></label>`
                : key === 'bs' ? box('min', numIn('minBs', step)) + box('max (0 = none)', numIn('maxBs', step)) : box(unit + ' (0 = off)', numIn(field, step))}
              ${box('weight', `<input class="hbs-input" type="number" min="0" max="10" inputmode="numeric" data-rsw="${key}" value="${cr.w[key] != null ? cr.w[key] : 1}">`)}</div></div>`;
        const plain = (label, input) => `<div class="hbs-rsset"><span>${label}</span>${input}</div>`;
        const N = store.get(K.rsSetNote, null), at = num(store.get(K.rsSetAt, 0));
        const shared = `<div class="hbs-hint">🔗 Shared with every leader${at ? ` · last saved ${fmtDT(Math.floor(at / 1000))} ${tzTagH()}` : ' · not saved to the Hub yet'}.${N && Date.now() - N.at < 48 * 3600e3 ? `<br><b>${esc(N.by)}</b> changed: ${esc((N.diff || []).join(', ') || 'settings')}` : ''}</div>`;
        return `<div class="hbs-card">${shared}${sec('Recruit checks')}
            ${RS_CHECKS.map(row).join('')}
            <div class="hbs-hint"><b>Weight</b> = how much a check counts toward the score (pass = full weight, near miss = half, 0 = ignore).
                <b>must</b> = failing it excludes the player. Federal jail is always skipped. Per-day numbers = lifetime total ÷ account age (no extra API calls).</div>
            ${sec('Score')}${plain('Fit at score ≥', numIn('fitScore'))}${plain('Near fit at score ≥', numIn('nearScore'))}
            <div class="hbs-hint">Fits and near fits stay in 🔎 Scout; below that they stay in 🗃 Pool only. The list sorts by score.</div>
            ${sec('Other')}${plain('Flag enemies at (info only)', numIn('enemyFlag'))}${plain('Skip if in hospital over (hrs)', numIn('skipHospHrs'))}
            ${sec('Message template')}<label class="hbs-rsfld"><span>Subject</span><input class="hbs-input" data-rssubj maxlength="80" style="text-align:left" value="${esc(rsSubj())}"></label>
            <label class="hbs-rsfld" style="margin-top:6px"><span>Message</span><textarea class="hbs-input" data-rstpl style="width:100%;min-height:90px;text-align:left">${esc(rsTpl())}</textarea></label>
            <div class="hbs-hint">Placeholders (subject and message): {name} {level} {bs} {id}. ✉ Message opens the mail with both filled in - you press Send.</div>
            ${sec("Hub's Recruitment list")}
            <label class="hbs-ck"><input type="checkbox" data-rshub${rsHubAuto() ? ' checked' : ''}> Send players to the Hub list after checks</label>
            ${plain('…when the score is at least', `<input class="hbs-input" type="number" min="0" max="100" data-rspct value="${rsHubPct()}">`)}
            <div class="hbs-hint">Players declined, joined or removed on the Hub list are hidden from every leader's pool.</div>
            ${sec('API usage')}${plain('Recruit Torn calls per minute', `<input class="hbs-input" type="number" min="10" max="90" data-rsrate value="${rsRate()}">`)}
            <div class="hbs-hint">Your key allows 100 calls a minute shared by every script. Each check = 1 call.</div>
            <div class="hbs-actions"><button type="button" class="hbs-btn" data-rs="setsave">Save</button></div></div>`;
    }
    function rsSetBind() {
        const b = bodyEl.querySelector('[data-rs="setsave"]'); if (!b) return;
        b.addEventListener('click', () => {
            const next = { must: {} };
            bodyEl.querySelectorAll('[data-rsc]').forEach(i => { next[i.dataset.rsc] = i.type === 'checkbox' ? i.checked : Math.max(0, Number(i.value) || 0); });
            bodyEl.querySelectorAll('[data-rsm]').forEach(i => { if (i.checked) next.must[i.dataset.rsm] = true; });
            next.w = {}; bodyEl.querySelectorAll('[data-rsw]').forEach(i => { next.w[i.dataset.rsw] = Math.max(0, Math.min(10, Number(i.value) || 0)); });
            store.set(K.rsCrit, next);
            const t = bodyEl.querySelector('[data-rstpl]').value.trim(); store.set(K.rsTpl, t === RS_TPL0 ? '' : t);
            const sj = bodyEl.querySelector('[data-rssubj]').value.trim(); store.set(K.rsSubj, sj === RS_SUBJ0 ? '' : sj);
            store.set(K.rsHubAuto, bodyEl.querySelector('[data-rshub]').checked);
            store.set(K.rsHubPct, Math.max(0, Math.min(100, Number(bodyEl.querySelector('[data-rspct]').value) || 0)));
            store.set(K.rsRate, Math.max(10, Math.min(90, Number(bodyEl.querySelector('[data-rsrate]').value) || 50)));
            Object.values(rsDb.candidates).forEach(c => { if (c.quick && rsPool[c.id]) { rsPool[c.id][5] = rsPct(c); rsPool[c.id][6] = VCODE[rsVerdict(c)]; } });
            rsPoolSave();
            rsSay('Saving to the Hub for every leader…');
            rsUploadSettings(false).then(ok => { rsSay(ok ? 'Criteria saved - shared with every leader.' : 'Not saved - you now have the other leader\'s settings.', !ok); if (ok) { rsView = 'scout'; store.set(K.rsView, rsView); } render(true); })
                .catch(e => { rsSay('Saved on this device, but not on the Hub: ' + e.message, true); render(true); });
        });
    }

    const onArmouryTab = () => /factions\.php/.test(location.href) && /tab=armou?ry/i.test(location.hash);
    let armFT = null;
    function armFilterApply() {
        armFT = null;
        const on = !!store.get(K.armHide, false);
        document.querySelectorAll('.hbs-armhide').forEach(li => { if (!on) li.classList.remove('hbs-armhide'); });
        if (!onArmouryTab()) { document.querySelectorAll('.hbs-armbar').forEach(b => b.remove()); return; }
        const lists = [...document.querySelectorAll('ul.item-list')].filter(ul => ul.querySelector(':scope > li .loaned'));
        lists.forEach(ul => {
            let hidden = 0;
            ul.querySelectorAll(':scope > li').forEach(li => {
                const cell = li.querySelector('.loaned'); if (!cell) return;
                const loaned = !/\bavailable\b/i.test(cell.textContent || '');
                li.classList.toggle('hbs-armhide', on && loaned);
                if (on && loaned) hidden++;
            });
            let bar = ul.previousElementSibling && ul.previousElementSibling.classList.contains('hbs-armbar') ? ul.previousElementSibling : null;
            if (!bar) {
                bar = document.createElement('div'); bar.className = 'hbs-armbar';
                bar.innerHTML = `<label><input type="checkbox" data-armhide> Hide loaned items</label><span data-armn></span>`;
                ul.parentNode.insertBefore(bar, ul);
                bar.querySelector('[data-armhide]').addEventListener('change', e => { store.set(K.armHide, e.target.checked); armFilterApply(); });
            }
            bar.querySelector('[data-armhide]').checked = on;
            bar.querySelector('[data-armn]').textContent = on ? `${hidden} loaned item${hidden === 1 ? '' : 's'} hidden` : '';
        });
    }
    function armFilterWatch() {
        if (!/factions\.php/.test(location.href) || armFilterWatch.on) return; armFilterWatch.on = true;
        const soon = () => { if (!armFT) armFT = setTimeout(armFilterApply, 300); };
        new MutationObserver(muts => { if (muts.some(m => !(m.target.closest && m.target.closest('.hbs-armbar, #hbs-panel')))) soon(); })
            .observe(document.body, { childList: true, subtree: true });
        window.addEventListener('hashchange', soon); soon();
    }
    armFilterWatch();

    const VIEWS = {
        chain: { html: chainHtml, bind: chainBind }, oc: { html: ocHtml, bind: ocBind }, recruit: { html: recruitHtml, bind: recruitBind },
        more: { html: moreHtml }, alerts: { html: alertsHtml, bind: alertsSeen },
        announce: { html: async () => { const h = await annHtml(); annMsg = ''; return h; }, bind: annBind },
        home: { html: homeHtml, bind: homeBind }, boards: { html: boardsHtml, bind: boardsBind },
        me: { html: () => profileHtml(me.id, true), bind: profileBind },
        members: { html: membersHtml, bind: membersBind }, wars: { html: warTabHtml, bind: warTabBind },
        history: { html: historyHtml, bind: () => bindChips('hs', v => { histSec = v; }) },
        news: { html: newsHtml, bind: () => bindChips('ns', v => { newsSec = v; }) },
        payouts: { html: payoutsHtml }, scripts: { html: scriptsHtml },

        stats: { html: statsHtml, bind: () => { bindChips('sk', v => { statsKind = v; }); bindChips('ss', v => { statsSort = v; }); } },
        armory: { html: armoryHtml, bind: () => { bindChips('as', v => { armSec = v; }); bindChips('ap', v => { armPeriod = v; }); bindChips('ao', v => { armSort = v; }); } },
    };

    function renderSettings() {
        const pda = isPDA(), key = pda ? '' : String(store.get(K.key, '') || '');
        bodyEl.innerHTML = `
            <div class="hbs-sec">API keys</div>
            <div class="hbs-hint" style="opacity:.85">For Heart Breakers members. ${pda ? "Using <b>TornPDA's API key</b> - nothing to enter."
                : 'Paste your Torn API key - a <b>Limited Access</b> key is needed (a Public key can\'t read your energy, cooldowns or OC pass rates).'} The key stays on this device: the script asks Torn who you are
                and sends the Hub only your name, ID and faction.</div>
            ${pda ? '' : `<label class="hbs-rsfld" style="margin-top:6px"><span>Torn API key <b style="color:#FFB454">· Limited Access key needed</b></span><input class="hbs-input hbs-secret" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" data-lpignore="true" data-1p-ignore data-bwignore data-form-type="other" data-key maxlength="16" placeholder="Limited Access API key (16 characters)" value="${esc(key)}" style="text-align:left"></label>`}
            <label class="hbs-rsfld" style="margin-top:6px"><span>FFScouter key (optional - fair-fight on retals, battle stats for recruiting)</span>
                <input class="hbs-input hbs-secret" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" data-lpignore="true" data-1p-ignore data-bwignore data-form-type="other" data-ffkey placeholder="FFScouter key" value="${esc(ffKey())}" style="text-align:left"></label>
            <div class="hbs-hint">Both keys stay on this device - never sent to the Hub.</div>
            <div class="hbs-actions">
                <button type="button" class="hbs-btn" data-x="save">${pda ? 'Sign in' : 'Save & sign in'}</button>
                ${key ? '<button type="button" class="hbs-btn hbs-ghost" data-x="forget">Remove key from this device</button>' : ''}
            </div>
            <div class="hbs-msg" data-xmsg>${me ? `Signed in as <b>${esc(me.name)}</b> (${esc(me.position)}${me.leader ? ' - leader tools on' : ''}).` : ''}</div>
            <div data-sharebox></div>
            <div data-dispbox></div>
            <div data-bkbox></div>
            ${(() => { const o = oldScripts(); return o.length ? `<div class="hbs-banner">⚠ <b>Old scripts still installed:</b> ${o.map(esc).join(', ')}.<br>
                The Suite replaces them - uninstall them in Tampermonkey (or TornPDA → Userscripts) so the same features don't run twice.</div>` : ''; })()}`;
        const msgEl = bodyEl.querySelector('[data-xmsg]');
        bodyEl.querySelector('[data-x="save"]').onclick = async () => {
            const inp = bodyEl.querySelector('[data-key]');
            const ffi = bodyEl.querySelector('[data-ffkey]');
            if (ffi && ffi.value.trim() !== ffKey()) { store.set(K.ffKey, ffi.value.trim()); store.set(K.ffCache, {}); ffAt = 0; rsFfNote = ''; }
            if (inp) {
                const v = inp.value.trim();
                if (!/^[A-Za-z0-9]{16}$/.test(v)) { msgEl.textContent = 'An API key is 16 letters and numbers.'; return; }
                store.set(K.key, v);
            }
            store.set(K.session, null); setMe(null);
            Object.keys(cache).forEach(k => delete cache[k]);
            msgEl.textContent = 'Signing in…';
            try {
                await signIn();
                msgEl.innerHTML = `Signed in ✓ as <b>${esc(me.name)}</b> (${esc(me.position)}${me.leader ? ' - leader tools on' : ''}).`;
                setStatus('');
            } catch (e) { msgEl.textContent = e.message; }
        };
        { const db = bodyEl.querySelector('[data-dispbox]'); if (db) displayBox(db); const bb = bodyEl.querySelector('[data-bkbox]'); if (bb && me) backupBox(bb); }
        drawPin();
        const fg = bodyEl.querySelector('[data-x="forget"]');
        if (fg) fg.onclick = () => { store.set(K.key, ''); store.set(K.session, null); store.set(K.share, null); setMe(null); renderSettings(); setStatus('Key removed from this device.'); };
        if (getKey()) shareSettingsBox();
    }

    async function shareSettingsBox() {
        const box = bodyEl.querySelector('[data-sharebox]'); if (!box) return;
        if (!box.innerHTML.trim()) box.innerHTML = '<div class="hbs-sec">Share from this script</div>';
        let g;
        // [HB Suite] Hub API — op "share_get": this member's script-sharing settings
        try { g = await hub('share_get'); } catch (e) { box.innerHTML = `<div class="hbs-sec">Share from this script</div><div class="hbs-msg">${esc(e.message)}</div>`; return; }
        const st = Object.assign({ bs: 'off', ws: 'off', ready: false, oc: false, cw: false }, g.settings || {});
        store.set(K.share, st);
        const sel = (k, v) => `<select class="hbs-input" data-sh="${k}">${[['off', 'Off'], ['leaders', 'Leaders'], ['faction', 'Faction']]
            .map(([x, l]) => `<option value="${x}"${v === x ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
        const onoff = (k, v, on) => `<select class="hbs-input" data-sh="${k}"><option value="0"${v ? '' : ' selected'}>Off</option><option value="1"${v ? ' selected' : ''}>${on}</option></select>`;
        const opt = (icon, title, what, ctl) => `<div class="hbs-item"><div class="hbs-row"><span style="flex:1"><b>${icon} ${title}</b></span><span style="flex:0 0 118px">${ctl}</span></div>
            <div class="hbs-hint">${what}</div></div>`;
        box.innerHTML = `<div class="hbs-sec">Share from this script</div>
            <div class="hbs-hint" style="opacity:.85">The same options as the Hub's <a href="${HUB_BASE}/m/my-data.html" target="_blank" rel="noopener">My data & sharing</a>,
                but your key is <b>never uploaded</b>: this script reads Torn on this device and sends only the results. It only updates while the script is running.</div>
            ${opt('🕵️', 'OC pass rates', 'Your checkpoint pass rate per organized crime role - checked every few minutes while this script runs (on unless you switch it off), so leaders\' Team Builder and the Suite can put you in the roles you pass best.', onoff('oc', st.oc, 'On'))}
            ${opt('💪', 'Battle stats', 'Strength, defense, speed, dexterity - read once a day (the first time the script runs after 00:00 TCT) so your gains are tracked.', sel('bs', st.bs))}
            ${opt('🧰', 'Work stats', 'Manual labor, intelligence, endurance - read once a day.', sel('ws', st.ws))}
            <div class="hbs-hint">Sharing on the Hub too? The two are combined.</div>
            <div class="hbs-actions"><button type="button" class="hbs-btn" data-shsave>Save sharing</button></div>
            <div class="hbs-msg" data-shmsg>${g.last && (g.last.bs || g.last.ws || g.last.rd_at) ? 'Last sent: ' + [g.last.bs || g.last.ws ? 'stats ' + (g.last.bs || g.last.ws) : '',
                ''].filter(Boolean).join(' · ') : ''}</div>`;
        box.querySelector('[data-shsave]').onclick = async () => {
            const m = box.querySelector('[data-shmsg]');
            const val = k => box.querySelector(`[data-sh="${k}"]`).value;
            const v = { bs: val('bs'), ws: val('ws'), ready: false, oc: val('oc') === '1', cw: false };
            m.textContent = 'Saving…';
            try {
                // [HB Suite] Hub API — op "share_set": save what to share from the script (all off = the Hub deletes it)
                const r = await hub('share_set', v);
                store.set(K.share, r.settings);
                const was = store.get(K.shareDay, '');
                if (v.bs !== 'off' || v.ws !== 'off') store.set(K.shareDay, '');
                if (v.oc) store.set(K.ocTag, '');
                m.textContent = (v.bs === 'off' && v.ws === 'off' && !v.oc) ? 'Saved ✓ - nothing is shared from this script; what it sent was deleted.'
                    : 'Saved ✓ - sharing runs while the script is active.';
                if (!was || v.bs !== 'off' || v.ws !== 'off' || v.oc) shareTick(true);
            } catch (e) { m.textContent = e.message; }
        };
    }

    let shareTimer = null, shareBusy = false;
    const tctDay = () => new Date().toISOString().slice(0, 10);
    async function shareTick(now) {
        clearTimeout(shareTimer); shareTimer = null;
        if (!store.get(K.shareMig, 0)) { store.set(K.shareMig, 1); store.set(K.share, null); }
        const st = store.get(K.share, null) || { bs: 'off', ws: 'off', ready: false, oc: true, cw: false };
        if (st && st.ready && getKey()) {
            try { const r = await hub('share_set', { bs: st.bs || 'off', ws: st.ws || 'off', ready: false, oc: !!st.oc, cw: false });   // [HB Suite] Hub API — op "share_set" (turns off the removed War readiness share)
                store.set(K.share, r.settings || Object.assign({}, st, { ready: false })); } catch (e) {   }
            st.ready = false;
        }
        if (!st || !getKey() || (st.bs === 'off' && st.ws === 'off' && !st.oc)) return;
        let next = SHARE_PING_MS;
        if (!shareBusy) {
            shareBusy = true;
            try {
                if ((st.bs !== 'off' || st.ws !== 'off') && store.get(K.shareDay, '') !== tctDay()) {
                    // [HB Suite] Torn API — sharing: own battle + work stats (once a day)
                    const d = await tornGet('https://api.torn.com/user/?selections=battlestats,workstats');
                    const day = tctDay(), body = {};
                    if (st.bs !== 'off') body.bs = [day, d.strength, d.defense, d.speed, d.dexterity].map((x, i) => i ? Math.round(num(x)) : x);
                    if (st.ws !== 'off') body.ws = [day, d.manual_labor, d.intelligence, d.endurance].map((x, i) => i ? Math.round(num(x)) : x);
                    // [HB Suite] Hub API — op "share_push": today's stats (numbers only)
                    await hub('share_push', body);
                    store.set(K.shareDay, day);
                }
                if (st.oc && Date.now() - num(store.get(K.sharePingAt, 0)) > SHARE_PING_MS - 20000) {
                    store.set(K.sharePingAt, Date.now());
                    // [HB Suite] Hub API — op "share_ping": is a leader watching War Readiness? a new crime? (also refreshes the
                    const p = await hub('share_ping');
                    const ps = p.settings || st;
                    if (p.settings) store.set(K.share, p.settings);
                    if (p.feed_free) feedAsk();
                    if (ps.oc && ((p.oc_tag && p.oc_tag !== store.get(K.ocTag, '')) || Date.now() - num(store.get(K.ocShareAt, 0)) > OC_SHARE_MS - 20000)) {
                        store.set(K.ocShareAt, Date.now());
                        // [HB Suite] Torn API — sharing: own OC pass rates (v2 user/organizedcrimes - every 5 min while the script runs, 1 call)
                        const d = await tornGet('https://api.torn.com/v2/user/organizedcrimes');
                        const rows = [];
                        (d.organizedcrimes || []).forEach(c => (c.slots || []).forEach(sl => {
                            if (sl.user || typeof sl.checkpoint_pass_rate !== 'number') return;
                            rows.push([c.name, (sl.position_info && sl.position_info.label) || sl.position, Math.round(sl.checkpoint_pass_rate)]);
                        }));
                        // [HB Suite] Hub API — op "share_push": the pass rates [[crime, role, rate], ...]
                        await hub('share_push', { oc: rows });
                        if (p.oc_tag) store.set(K.ocTag, p.oc_tag);
                    }
                }
            } catch (e) { console.warn(LOG, 'sharing:', e.message); }
            shareBusy = false;
        }
        shareTimer = setTimeout(shareTick, next);
    }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !shareTimer) shareTick(); });

    const FEED_MS = 60000, FEED_LEASE_MS = 150000, FEED_NO_MS = 6 * 3600e3;
    let feedBusy = false;
    const feedAllowed = () => !!getKey() && (store.get(K.share, null) || { oc: true }).oc !== false && num(store.get(K.feedNo, 0)) < Date.now();
    const feedMine = () => num(store.get(K.feedOn, 0)) > Date.now();
    async function feedAsk() {
        if (feedMine() || !feedAllowed()) return;
        try {
            // [HB Suite] Hub API — op "oc_feed" ask: may this script be the crime feeder? (no data sent)
            const r = await hub('oc_feed', { do: 'ask' });
            if (r && r.feed) { store.set(K.feedOn, Date.now() + FEED_LEASE_MS); feedTick(); }
        } catch (e) {   }
    }
    async function feedTick() {
        if (feedBusy || !feedMine()) return;
        if (!feedAllowed()) { store.set(K.feedOn, 0); hub('oc_feed', { do: 'stop' }).catch(() => {}); return; }
        if (Date.now() - num(store.get(K.feedAt, 0)) < FEED_MS - 2000) return;
        feedBusy = true; store.set(K.feedAt, Date.now());
        try {
            // [HB Suite] Torn API — crime feed: the faction's recruiting + planning crimes (v2 faction/crimes, 1 call a
            const d = await tornGet('https://api.torn.com/v2/faction/crimes?cat=available&limit=100&sort=ASC');
            // [HB Suite] Hub API — op "oc_feed" put: the crime list (no key; the Hub blanks this member's own open-slot rates)
            const body = { do: 'put', crimes: Array.isArray(d.crimes) ? d.crimes : [] };
            try {
                // [HB Suite] Torn API — crime feed extra: the faction's chain + wars (v2 faction, 1 call a minute, feeder only)
                const n = await tornGet('https://api.torn.com/v2/faction?selections=chain,wars');
                if (n && (n.chain !== undefined || n.wars !== undefined)) body.now = { chain: n.chain || null, wars: n.wars || null };
            } catch (e) {   }
            if (Date.now() - num(store.get(K.feedDoneAt, 0)) > 170000) {
                try {
                    // [HB Suite] Torn API — crime feed extra: the newest completed crimes (v2 faction/crimes, 1 call every 3 min, feeder only)
                    const c = await tornGet('https://api.torn.com/v2/faction/crimes?cat=completed&limit=100&sort=DESC');
                    if (Array.isArray(c.crimes)) { store.set(K.feedDoneAt, Date.now());
                        body.completed = c.crimes.map(x => ({ id: x.id, name: x.name, status: x.status, executed_at: x.executed_at,
                            rewards: x.rewards ? { money: x.rewards.money, items: Array.isArray(x.rewards.items) ? x.rewards.items.map(() => 0) : [], payout: x.rewards.payout || null } : null })); }
                } catch (e) {   }
            }
            const r = await hub('oc_feed', body);
            store.set(K.feedOn, r && r.feed ? Date.now() + FEED_LEASE_MS : 0);
            if (r && (r.changed || (r.extra && r.extra.length))) { try { liveClear(); } catch (e) {   } }
        } catch (e) {
            const m = String((e && e.message) || '');
            if (/^Torn: /.test(m)) {
                if (/Faction API access|Access level|Incorrect ID/i.test(m)) store.set(K.feedNo, Date.now() + FEED_NO_MS);
                store.set(K.feedOn, 0); hub('oc_feed', { do: 'stop' }).catch(() => {});
            }
        }
        feedBusy = false;
    }
    setInterval(feedTick, 15000);

    function bindBody() {
        bodyEl.addEventListener('scroll', viewOnScroll, { passive: true });
        bodyEl.addEventListener('click', e => {
            const t = e.target;
            const pr = t.closest('[data-prof]');
            if (pr) { e.preventDefault(); openProfile(pr.dataset.prof); return; }
            const pa = t.closest('a[href*="profiles.php?XID="]');
            if (pa && !pa.classList.contains('hbs-btn')) { const id = (pa.href.match(/XID=(\d+)/) || [])[1]; if (id && isMemberId(id)) { e.preventDefault(); openProfile(id); return; } }
            if (t.closest('a')) return;
            const tg = t.closest('[data-toggle]');
            if (tg) { const k = tg.dataset.toggle; open[k] = !open[k]; viewSave(); render(true); return; }
            const b = t.closest('button');
            if (!b) return;
            if (b.dataset.gotab && hrefTab(b.dataset.gotab)) return;
            if (b.dataset.gotab) { tab = b.dataset.gotab; store.set(K.tab, tab); render(); return; }
            if (b.dataset.termed) { toggleTermed(b); return; }
            if (b.dataset.rc) { showReceipt(Number(b.dataset.rc)); return; }
            if (b.dataset.ntf) { notifyClick(b); return; }
            if (b.dataset.lv) { showLeave(Number(b.dataset.lv)); return; }
            if (b.dataset.news != null && b.dataset.what) { copyNews(b); return; }
            if (b.dataset.lvdel) {
                const pid = Number(b.dataset.lvdel), box = bodyEl.querySelector(`[data-lvbox="${pid}"]`), x = box && box._list && box._list[Number(b.dataset.k)];
                if (!x) return;
                saveLeave(pid, L => { L[pid] = (L[pid] || []).filter(y => !(y.from === x.from && y.to === x.to)); }, 'removed');
                return;
            }
            if (b.dataset.lvadd) {
                const pid = Number(b.dataset.lvadd), box = bodyEl.querySelector(`[data-lvbox="${pid}"]`);
                const f = box.querySelector('[data-lvf]').value, to = box.querySelector('[data-lvt]').value, msgEl = box.querySelector('[data-lvmsg]');
                if (!f || !to) { msgEl.textContent = 'Pick both dates.'; return; }
                const from = Date.parse(f + 'T00:00:00Z') / 1000, end = Date.parse(to + 'T23:59:59Z') / 1000;
                if (!(end >= from)) { msgEl.textContent = 'The end date is before the start.'; return; }
                const note = box.querySelector('[data-lvn]').value.trim().slice(0, 80);
                saveLeave(pid, L => { (L[pid] = L[pid] || []).push({ from, to: end, note, by: me ? me.name : '', at: nowS() }); }, 'added');
            }
        });
    }

    function drawReceipt(m, R, WT, RU) {
        const X = R.receipt, W = X.wars || {}, C = X.chains || {}, sc = R.score, G = sc == null ? null : relG(sc);
        const S = 2, Wd = 640, pad = 28, last = W.last || [];
        const H = 640 + last.length * 26 + (X.leave && X.leave.length ? 40 : 0);
        const cv = document.createElement('canvas'); cv.width = Wd * S; cv.height = H * S;
        const g = cv.getContext('2d'); g.scale(S, S);
        g.fillStyle = '#100a0b'; g.fillRect(0, 0, Wd, H);
        g.strokeStyle = '#5c1c1a'; g.lineWidth = 2; g.strokeRect(6, 6, Wd - 12, H - 12);
        g.strokeStyle = '#2a1416'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(pad, 92); g.lineTo(Wd - pad, 92); g.stroke(); g.setLineDash([]);
        const T = (txt, x, y, size, col, weight, align) => { g.font = `${weight || 400} ${size}px system-ui, -apple-system, Segoe UI, sans-serif`;
            g.fillStyle = col || '#ddd'; g.textAlign = align || 'left'; g.fillText(String(txt), x, y); };
        T('HEART BREAKERS', Wd / 2, 40, 13, '#e4382e', 800, 'center');
        T('PERFORMANCE RECEIPT', Wd / 2, 66, 22, '#e8be5a', 800, 'center');
        T('Generated ' + new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) + ' (TCT)', Wd / 2, 84, 11, '#9a9a9c', 400, 'center');
        let y = 124;
        T(m.name, pad, y, 24, '#fff', 800); T(`[${m.id}]`, Wd - pad, y, 13, '#9a9a9c', 400, 'right'); y += 24;
        T([X.level != null ? 'Level ' + X.level : '', m.position || '', X.days != null ? X.days + ' days in the faction' : ''].filter(Boolean).join('  ·  '), pad, y, 14, '#cfcfd1'); y += 20;
        T('Last active: ' + (X.last_action ? fmtD(X.last_action) : '-'), pad, y, 12, '#9a9a9c'); y += 30;
        g.fillStyle = '#170d0e'; g.strokeStyle = '#5c1c1a'; g.lineWidth = 1; g.fillRect(pad, y, Wd - 2 * pad, 74); g.strokeRect(pad, y, Wd - 2 * pad, 74);
        T('RELIABILITY RATING', pad + 14, y + 22, 11, '#9a9a9c', 700);
        if (sc == null) T('Not enough data', pad + 14, y + 56, 24, '#9a9a9c', 800);
        else { T(G[0], pad + 14, y + 60, 38, G[1], 800); T(sc + ' / 100', pad + 64, y + 58, 20, '#fff', 700); }
        const pt = (k, mx) => R.parts[k] == null ? 'n/a' : `${R.parts[k]}/${mx}`;
        T(`War ${pt('war', WT.war)}   ·   Chains ${pt('chains', WT.chains)}   ·   Activity ${pt('activity', WT.activity)}`, Wd - pad - 14, y + 56, 13, '#cfcfd1', 400, 'right');
        y += 104;
        const row = (label, val, cmp) => { T(label, pad + 8, y, 14, '#cfcfd1'); T(val, Wd - pad - 8, y, 14, '#fff', 700, 'right'); y += 24;
            if (cmp) { T(cmp, Wd - pad - 8, y - 6, 11, '#9a9a9c', 400, 'right'); y += 10; } };
        const head = txt => { T(txt, pad, y, 15, '#e8be5a', 800); g.fillStyle = '#5c1c1a'; g.fillRect(pad, y + 7, Wd - 2 * pad, 1); y += 30; };
        const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '-';
        const vs = (a, f) => a == null || f == null ? '' : `faction avg ${f}  (${f ? (a >= f ? '▲ ' : '▼ ') + Math.abs(Math.round((a / f - 1) * 100)) + '%' + (a >= f ? ' above' : ' below') : '-'})`;
        head('⚔  WARS');
        row('Wars while a member', String(W.in || 0));
        row(`Wars participated (${RU.min_hits}+ hits)`, `${W.part || 0}  (${pct(W.part || 0, W.in)})`);
        row('Total war hits', (W.hits || 0).toLocaleString('en-US'));
        row('Hits per war', W.avg == null ? '-' : String(W.avg), vs(W.avg, W.fac_avg));
        if (last.length) {
            y += 4; T('LAST ' + last.length + ' WARS', pad + 8, y, 11, '#9a9a9c', 700); T('HITS', Wd - pad - 120, y, 11, '#9a9a9c', 700, 'right'); T('FACTION AVG', Wd - pad - 8, y, 11, '#9a9a9c', 700, 'right'); y += 20;
            last.forEach(w => { T(`${w.ok ? '✓' : '✗'}  ${fmtD(w.end)}  vs ${String(w.opponent || '?').slice(0, 26)}`, pad + 8, y, 13, w.ok ? '#cfcfd1' : '#f08a84');
                T(String(w.hits), Wd - pad - 120, y, 13, w.ok ? '#fff' : '#f08a84', 700, 'right'); T(String(w.fac_avg), Wd - pad - 8, y, 13, '#9a9a9c', 400, 'right'); y += 26; });
        }
        y += 12; head(`⛓  LARGE CHAINS (${RU.chain_min}+ HITS)`);
        row('Large chains while a member', String(C.in || 0));
        row(`Large chains participated (${RU.min_hits}+ hits)`, `${C.part || 0}  (${pct(C.part || 0, C.in)})`);
        row('Large chain hits', (C.hits || 0).toLocaleString('en-US'));
        row('Hits per chain (when hitting)', C.avg == null ? '-' : String(C.avg), C.avg == null ? '' : vs(C.avg, C.fac_avg).replace('faction avg', 'faction avg per hitter'));
        y += 6;
        if (X.leave && X.leave.length) { T('Excused leave (not counted): ' + X.leave.map(l => fmtD(l.from) + ' – ' + fmtD(l.to)).join(', '), pad, y, 11, '#e8be5a'); y += 20; }
        T(`Whole time in the faction · taking part = ${RU.min_hits}+ hits · termed wars count only when you took part · excused leave isn't counted · crimes aren't rated.`, Wd / 2, H - 22, 10, '#6f6f72', 400, 'center');
        return cv;
    }

    function restorePanelPos() {
        const pos = store.get(K.panelPos, null);
        if (pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)) { panel.style.left = pos.left + 'px'; panel.style.top = pos.top + 'px'; }
        else { panel.style.left = Math.max(8, window.innerWidth - 450) + 'px'; panel.style.top = '70px'; }
    }
    const MIN_W = 300, MIN_H = 260;
    const maxW = () => Math.max(MIN_W, window.innerWidth - 8), maxH = () => Math.max(MIN_H, window.innerHeight - 8);
    function applySize(w, h) {
        panel.style.width = clamp(Math.round(w), MIN_W, maxW()) + 'px';
        panel.style.height = clamp(Math.round(h), MIN_H, maxH()) + 'px';
    }
    function restorePanelSize() {
        const sz = store.get(K.panelSize, null);
        if (sz && Number.isFinite(sz.w) && Number.isFinite(sz.h)) applySize(sz.w, sz.h);
    }
    function makePanelResizable() {
        const grip = el('div', 'hbs-grip', '◢');
        grip.title = 'Drag to resize · double-tap for the default size';
        panel.appendChild(grip);
        let rs = null, lastTap = 0;
        grip.addEventListener('pointerdown', e => {
            const r = panel.getBoundingClientRect();
            rs = { id: e.pointerId, x: e.clientX, y: e.clientY, w: r.width, h: r.height, left: r.left, top: r.top };
            try { grip.setPointerCapture(e.pointerId); } catch (_) {}
            grip.classList.add('hbs-on'); panel.classList.add('hbs-resizing');
            e.preventDefault(); e.stopPropagation();
        });
        grip.addEventListener('pointermove', e => {
            if (!rs || e.pointerId !== rs.id) return;
            const w = Math.min(rs.w + (e.clientX - rs.x), window.innerWidth - rs.left - 4);
            const h = Math.min(rs.h + (e.clientY - rs.y), window.innerHeight - rs.top - 4);
            applySize(w, h);
        });
        const end = e => {
            if (!rs || e.pointerId !== rs.id) return;
            rs = null;
            try { grip.releasePointerCapture(e.pointerId); } catch (_) {}
            grip.classList.remove('hbs-on'); panel.classList.remove('hbs-resizing');
            store.set(K.panelSize, { w: parseInt(panel.style.width, 10) || panel.offsetWidth, h: parseInt(panel.style.height, 10) || panel.offsetHeight });
            clampPanel();
        };
        grip.addEventListener('pointerup', end);
        grip.addEventListener('pointercancel', end);
        grip.addEventListener('click', () => {
            const now = Date.now();
            if (now - lastTap < 350) { panel.style.width = ''; panel.style.height = ''; store.set(K.panelSize, null); clampPanel(); }
            lastTap = now;
        });
    }
    function clampPanel() {
        if (!panel.classList.contains('hbs-open')) return;
        const sz = store.get(K.panelSize, null);
        if (sz && Number.isFinite(sz.w)) applySize(sz.w, sz.h);
        const w = panel.offsetWidth, h = panel.offsetHeight;
        panel.style.left = clamp(parseInt(panel.style.left, 10) || 0, 0, Math.max(0, window.innerWidth - w)) + 'px';
        panel.style.top = clamp(parseInt(panel.style.top, 10) || 0, 0, Math.max(0, window.innerHeight - h)) + 'px';
    }
    function makePanelDraggable(handle, ctrls) {
        let drag = null;
        handle.addEventListener('pointerdown', e => {
            if (ctrls.contains(e.target)) return;
            const r = panel.getBoundingClientRect();
            drag = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top };
            try { handle.setPointerCapture(e.pointerId); } catch (_) {}
            e.preventDefault();
        });
        handle.addEventListener('pointermove', e => {
            if (!drag || e.pointerId !== drag.id) return;
            panel.style.left = clamp(e.clientX - drag.dx, 0, window.innerWidth - panel.offsetWidth) + 'px';
            panel.style.top = clamp(e.clientY - drag.dy, 0, window.innerHeight - panel.offsetHeight) + 'px';
        });
        const end = e => {
            if (!drag || e.pointerId !== drag.id) return;
            drag = null;
            try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
            store.set(K.panelPos, { left: parseInt(panel.style.left, 10), top: parseInt(panel.style.top, 10) });
        };
        handle.addEventListener('pointerup', end);
        handle.addEventListener('pointercancel', end);
    }

    function setCollapsed(state) {
        collapsed = state;
        store.set(K.collapsed, state);
        panel.classList.toggle('hbs-open', !state);
        launcher.classList.toggle('hbs-show', state);
        if (!state) { clampPanel(); render(); } else { clampLauncher(); stopTimers(); }
        if (me) cwWatch();
        try { cvDraw(); } catch (e) {   }
    }

    const DRAG_THRESHOLD = 6;
    const launcherDragged = () => { const p = store.get(K.launchPos, null); return !!(p && Number.isFinite(p.left) && Number.isFinite(p.top)); };
    const isDocked = () => launcher && launcher.parentElement !== document.body;
    const isVisible = n => !!(n && n.isConnected && n.getClientRects().length);

    function buildLauncher() {
        launcher = el('div', 'torn-launcher');
        launcher.id = 'hbs-launcher';
        launcher.innerHTML = ICON_SVG;
        launcher.dataset.dockIcon = ICON_SVG;
        launcher.dataset.dockLabel = 'Heart Breakers Suite';
        launcher.setAttribute('aria-label', 'Heart Breakers Suite');
        launcher.setAttribute('role', 'button');
        document.body.appendChild(launcher);
        if (launcherDragged()) { const p = store.get(K.launchPos, null); launcher.style.left = p.left + 'px'; launcher.style.top = p.top + 'px'; }
        let drag = null, suppressClick = false;
        launcher.addEventListener('pointerdown', e => {
            if (isDocked()) return;
            const r = launcher.getBoundingClientRect();
            drag = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false };
        });
        launcher.addEventListener('pointermove', e => {
            if (!drag || e.pointerId !== drag.id) return;
            if (!drag.moved) {
                if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < DRAG_THRESHOLD) return;
                drag.moved = true;
                try { launcher.setPointerCapture(e.pointerId); } catch (_) {}
            }
            e.preventDefault();
            const s = launcher.offsetWidth;
            launcher.style.left = clamp(e.clientX - drag.dx, 0, window.innerWidth - s) + 'px';
            launcher.style.top = clamp(e.clientY - drag.dy, 0, window.innerHeight - s) + 'px';
        });
        const end = e => {
            if (!drag || e.pointerId !== drag.id) return;
            if (drag.moved) {
                suppressClick = true;
                store.set(K.launchPos, { left: parseInt(launcher.style.left, 10), top: parseInt(launcher.style.top, 10) });
                try { launcher.releasePointerCapture(e.pointerId); } catch (_) {}
            }
            drag = null;
        };
        launcher.addEventListener('pointerup', end);
        launcher.addEventListener('pointercancel', end);
        launcher.addEventListener('click', e => { if (suppressClick) { suppressClick = false; e.preventDefault(); return; } setCollapsed(false); });
    }

    function placeLauncherAuto() {
        if (!launcher || isDocked() || !launcher.classList.contains('hbs-show')) return;
        const size = launcher.offsetWidth || 52, gap = 10, margin = 12, bottomStart = 90;
        const others = [...document.querySelectorAll('.torn-launcher')]
            .filter(n => n !== launcher && n.parentElement === document.body && isVisible(n)).map(n => n.getBoundingClientRect());
        const x = window.innerWidth - size - margin;
        for (let i = 0; i < 30; i++) {
            const y = window.innerHeight - size - bottomStart - i * (size + gap);
            if (y < 0) break;
            const hit = others.some(r => !(x + size <= r.left || x >= r.right || y + size <= r.top || y >= r.bottom));
            if (!hit) { launcher.style.left = x + 'px'; launcher.style.top = y + 'px'; return; }
        }
        launcher.style.left = x + 'px';
        launcher.style.top = Math.max(0, window.innerHeight - size - bottomStart) + 'px';
    }
    function clampLauncher() {
        if (!launcher || isDocked()) return;
        if (!launcherDragged()) { placeLauncherAuto(); return; }
        const s = launcher.offsetWidth || 52;
        launcher.style.left = clamp(parseInt(launcher.style.left, 10) || 0, 0, Math.max(0, window.innerWidth - s)) + 'px';
        launcher.style.top = clamp(parseInt(launcher.style.top, 10) || 0, 0, Math.max(0, window.innerHeight - s)) + 'px';
    }

    function init() {
        if (document.getElementById('hbs-panel')) return;
    try { if (window.top !== window.self) return; } catch (e) { return; }
        try { const mt = document.createElement('meta'); mt.name = 'hb-script'; mt.content = 'Heart Breakers Suite'; mt.dataset.version = VERSION;
              (document.head || document.documentElement).appendChild(mt); } catch (e) {   }
        injectStyles();
        buildPanel();
        bindBody();
        buildLauncher();
        setCollapsed(store.get(K.collapsed, true) !== false);
        window.addEventListener('resize', () => { clampPanel(); clampLauncher(); });
        let slotTimer = null;
        new MutationObserver(() => {
            if (launcherDragged() || slotTimer) return;
            slotTimer = setTimeout(() => { slotTimer = null; placeLauncherAuto(); }, 200);
        }).observe(document.body, { childList: true });
        setTimeout(() => shareTick(), 5000);
        (async () => {
            if (!getKey()) return;
            const mc = store.get(K.meC, null);
            if (!me && mc && mc.me && num(mc.exp) > Date.now() + 60000) setMe(mc.me);
            if (store.get(K.cwq, false)) cw.queued = true;
            applyUi();
            try { if (!me) setMe((await hub('whoami')).me); } catch (e) { return; }
            refreshBadges(true); checkUpdate();
            if (modOn('chain')) cwWatch();
            if (modOn('ocpage') && /factions\.php/.test(location.href)) ocPageWatch();
            if (me.leader) loanPageWatch();
            if (me.leader) { names().catch(() => {}); rsPassWatch(); }
        })();
        console.log(LOG, 'loaded', VERSION, typeof PDA_httpPost === 'function' ? '(TornPDA)' : '(desktop)');
    }

    if (document.body) init();
    else document.addEventListener('DOMContentLoaded', init);
})();
