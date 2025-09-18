// ==UserScript==
// @name         Vendetta MX Tool
// @namespace    mx.tools
// @version      1.6.7
// @description  QoL: building navigation (− [select] +), mission templates (Save/Clear), resource quick-amounts, collapsible overview boxes with saved state, resource bar spacing fix, compact buttons.
// @author       mx
// @match        *://vendettagame.es/public/*
// @match        *://www.vendettagame.es/public/*
// @run-at       document-end
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @downloadURL  https://raw.githubusercontent.com/dani-csg/Vendetta-MX-Tool/main/Vendetta-MX-Tool.user.js
// @updateURL    https://raw.githubusercontent.com/dani-csg/Vendetta-MX-Tool/main/Vendetta-MX-Tool.user.js
// ==/UserScript==

(function () {
  'use strict';

  /* ---------- utils ---------- */
  const $  = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
  const toInt=(v,d=0)=>{const n=parseInt(String(v??'').replace(/[^\d-]+/g,''),10);return Number.isFinite(n)?n:d;};
  const setVal=(el,v)=>{ if(!el) return; el.value=(v??'')+''; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); };

  function GM_Get(k,d){ try{return GM_getValue(k,d);}catch{return d;} }
  function GM_Set(k,v){ try{GM_setValue(k,v);}catch{} }
  function GM_Del(k){ try{GM_deleteValue(k);}catch{} }

  const STORAGE = {
    troops:    'vp_troops_defaults_v1',
    coords:    'vp_coords_default_v1',
    mission:   'vp_mission_default_v1',
    resources: 'vp_resources_default_v1',
    postDelta: 'vp_post_send_building_delta_v1',
    boxes:     'vp_collapsed_boxes_v2', // title -> collapsed
  };

  const SEL = {
    buildingForm:  '#frmBuilding',
    buildingSelect:'#building',

    missionForm:   'form[action="/public/mob/misiones"]',
    missionSelect: '#subFormCoordenadas-mision',
    coordX:        '#subFormCoordenadas-coordx',
    coordY:        '#subFormCoordenadas-coordy',
    coordZ:        '#subFormCoordenadas-coordz',
    resArm:        '#subFormRecursos-recursos_arm',
    resMun:        '#subFormRecursos-recursos_mun',
    resAlc:        '#subFormRecursos-recursos_alc',
    resDol:        '#subFormRecursos-recursos_dol',
    btnUpdate:     '#actualizar',
    btnSend:       '#enviar',
  };

  const onMissionsPage = () => !!$(SEL.missionForm);
  const onOverviewPage = () => /\/public\/mob\/visiongeneral(?:\/index)?$/i.test(location.pathname.replace(/\/+$/,''));

  /* ---------- CSS: reset alte Styles + scoped neue Styles ---------- */
  (function ensureCss(){
    // 1) alte/leckende Styles entfernen (SPA hält <head> über mehrere Views)
    $$('#vp-style').forEach(n=>n.remove());

    // 2) frisch & scoped einfügen
    const st=document.createElement('style'); st.id='vp-style';
    st.textContent = `
      /* === MISSIONS === */
      body.vp-missions .vp-inline-group{ display:inline-flex; gap:.35rem; margin-left:.5rem; vertical-align:middle; }
      body.vp-missions .vp-inline-group button{
        border-radius:4px; padding:2px 8px; font-size:12px; line-height:1.2; height:auto;
        background:#f7f7f7; border:1px solid #999; cursor:pointer;
      }
      body.vp-missions .vp-res-wrap{ display:flex; align-items:center; gap:.35rem; }
      body.vp-missions .vp-amount{ display:inline-flex; gap:.25rem; }
      body.vp-missions .vp-amount button{
        border-radius:4px; padding:2px 8px; font-size:12px; line-height:1.2; height:auto;
        background:#f7f7f7; border:1px solid #aaa; cursor:pointer;
      }
      body.vp-missions input.vp-like{
        border-radius:4px; padding:2px 8px; font-size:12px; line-height:1.2; height:auto;
        background:#f7f7f7; border:1px solid #999; cursor:pointer;
      }
      body.vp-missions input.vp-left  { margin-right:.5rem; }
      body.vp-missions input.vp-right { margin-left:.5rem; }

      /* === OVERVIEW: nur unsere Toggle-Buttons & nichts anderes === */
      body.vp-overview .content_box{ position:relative; }
      body.vp-overview .content_box > h2{ position:relative; padding-right:2.2rem; }
      body.vp-overview .vp-box-toggle{
        position:absolute; right:.4rem; top:50%; transform:translateY(-50%);
        background:#1b1b1b; color:#fff; border:1px solid #777;
        border-radius:.25rem; font:12px/1 system-ui,sans-serif;
        width:1.6rem; height:1.3rem; text-align:center; cursor:pointer; opacity:.95;
      }
      body.vp-overview .vp-box-toggle:hover{ filter:brightness(1.2); }
      body.vp-overview .content_box.vp-collapsed .content_box_text{ display:none !important; }

      /* Globale, neutrale Nav-Buttons neben dem Gebäude-Select */
      button.vp-nav{
        border-radius:4px; padding:2px 8px; font-size:12px; line-height:1.2; height:auto;
        background:#f7f7f7; border:1px solid #999; cursor:pointer; margin:0 .25rem;
      }
    `;
    document.head.appendChild(st);
  })();

  /* ---------- Overview: Building quick-nav + Collapsible boxes ---------- */
  function mountBuildingNavigator(){
    const sel=$(SEL.buildingSelect);
    if (!sel || sel.dataset.vpHasNav) return;
    const minus=document.createElement('button'); minus.type='button'; minus.className='vp-nav'; minus.textContent='−';
    const plus =document.createElement('button'); plus .type='button'; plus .className='vp-nav'; plus .textContent='+';
    minus.addEventListener('click',()=>navigateBuilding(-1));
    plus .addEventListener('click',()=>navigateBuilding(+1));
    sel.insertAdjacentElement('beforebegin', minus);
    sel.insertAdjacentElement('afterend', plus);
    sel.dataset.vpHasNav='1';
  }
  function navigateBuilding(delta){
    const sel=$(SEL.buildingSelect), form=$(SEL.buildingForm);
    if(!sel||!form||!sel.options||sel.options.length<2) return;
    const len=sel.options.length, cur=sel.selectedIndex>=0?sel.selectedIndex:0;
    sel.selectedIndex=(cur+delta+len)%len;
    try{ sel.dispatchEvent(new Event('change',{bubbles:true})); }catch{}
    try{ form.submit(); }catch{ try{ form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); }catch{} }
  }

  function mountOverviewToggles(){
    if (!onOverviewPage()) return;
    document.body.classList.add('vp-overview');

    const state = Object.assign({}, GM_Get(STORAGE.boxes, {})); // title -> collapsed:boolean

    $$('#content .content_box').forEach(box=>{
      if (box.dataset.vpTgl) return;
      const h2=box.querySelector('h2');
      const body=box.querySelector('.content_box_text');
      if(!h2||!body) return;

      const title=(h2.textContent||'').trim();
      const btn=document.createElement('button');
      btn.type='button'; btn.className='vp-box-toggle';

      const collapsed=!!state[title];
      if (collapsed) box.classList.add('vp-collapsed');
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      btn.textContent = collapsed ? '+' : '−';

      btn.addEventListener('click', ()=>{
        const open = btn.getAttribute('aria-expanded')==='true';
        const newOpen = !open;
        btn.setAttribute('aria-expanded', newOpen ? 'true' : 'false');
        btn.textContent = newOpen ? '−' : '+';
        box.classList.toggle('vp-collapsed', !newOpen);
        state[title] = !newOpen;
        GM_Set(STORAGE.boxes, state);
      });

      h2.appendChild(btn);
      box.dataset.vpTgl='1';
    });
  }

  /* ---------- Missions: Save/Clear & Ressourcen-Quicks ---------- */
  function inlineGroup(saveCb, clearCb){
    const wrap=document.createElement('span'); wrap.className='vp-inline-group';
    const s=document.createElement('button'); s.type='button'; s.textContent='Save';  s.addEventListener('click',saveCb);
    const c=document.createElement('button'); c.type='button'; c.textContent='Clear'; c.addEventListener('click',clearCb);
    wrap.append(s,c); return wrap;
  }

  function mountTroopSaveClear(){
    const inputs = $$('input[id^="subFormTropas-"]');
    if (!inputs.length) return;
    const state = Object.assign({}, GM_Get(STORAGE.troops, {})); // { unitKey: value }
    inputs.forEach(inp=>{
      if (inp.dataset.vpTroopDone) return;
      const row = inp.closest('tr');
      const labelEl = row ? row.querySelector('label') : null;
      const rawName = (labelEl?.textContent || '').trim();   // z.B. "Mover (1)"
      const unitKey = normalizeUnitName(rawName);            // -> "mover"
      const controls = inlineGroup(
        ()=>{ state[unitKey]=toInt(inp.value,0); GM_Set(STORAGE.troops, state); },
        ()=>{ delete state[unitKey]; GM_Set(STORAGE.troops, state); setVal(inp,''); }
      );
      inp.insertAdjacentElement('afterend', controls);
      if (state[unitKey] != null) setVal(inp, state[unitKey]);
      inp.dataset.vpTroopDone='1';
    });
  }
  function normalizeUnitName(s){
    return String(s||'')
      .replace(/\(.*?\)/g,'')
      .replace(/[^\p{L}\p{N}]+/gu,'_')
      .replace(/^_+|_+$/g,'')
      .toLowerCase();
  }

  function mountCoordsSaveClear(){
    const cx=$(SEL.coordX), cy=$(SEL.coordY), cz=$(SEL.coordZ);
    if (!cz || cz.dataset.vpDone) return;
    cz.insertAdjacentElement('afterend', inlineGroup(
      ()=>GM_Set(STORAGE.coords,{x:cx.value,y:cy.value,z:cz.value}),
      ()=>{ GM_Del(STORAGE.coords); setVal(cx,''); setVal(cy,''); setVal(cz,''); }
    ));
    const saved=GM_Get(STORAGE.coords,null);
    if(saved){ setVal(cx,saved.x); setVal(cy,saved.y); setVal(cz,saved.z); }
    cz.dataset.vpDone='1';
  }

  function mountMissionSaveClear(){
    const ms=$(SEL.missionSelect);
    if (!ms || ms.dataset.vpDone) return;
    ms.insertAdjacentElement('afterend', inlineGroup(
      ()=>GM_Set(STORAGE.mission,{value:ms.value}),
      ()=>GM_Del(STORAGE.mission)
    ));
    const sv=GM_Get(STORAGE.mission,null);
    if(sv){ ms.value=sv.value; ms.dispatchEvent(new Event('change',{bubbles:true})); }
    ms.addEventListener('change', applySavedResourcesIfTransport);
    ms.dataset.vpDone='1';
  }

  function mountResourcesHeaderAndQuickButtons(){
    const inputs = [$(SEL.resArm),$(SEL.resMun),$(SEL.resAlc),$(SEL.resDol)].filter(Boolean);
    if (!inputs.length) return;

    const headerCell = (()=>{
      const cells = $$('.c, td.c, th.c, h2');
      return cells.find(el => /resources/i.test((el.textContent||'').trim()));
    })();

    if (headerCell && !headerCell.dataset.vpResHeader){
      headerCell.insertAdjacentElement('beforeend', inlineGroup(
        ()=>GM_Set(STORAGE.resources, readResources()),
        ()=>{ GM_Del(STORAGE.resources); applyResources({arm:'',mun:'',alc:'',dol:''}); }
      ));
      headerCell.dataset.vpResHeader='1';
    }

    const leftD  = [-50000, -5000, -500];
    const rightD = [  1000,  10000, 100000];

    inputs.forEach(inp=>{
      if (inp.dataset.vpQuick) return;
      let wrap = inp.closest('.vp-res-wrap');
      if (!wrap){
        wrap=document.createElement('span');
        wrap.className='vp-res-wrap';
        inp.parentNode.insertBefore(wrap, inp);
        wrap.append(inp);
      }
      const left = document.createElement('span'); left.className='vp-amount';
      leftD.forEach(d=>left.appendChild(amtBtn(label(d), d, inp)));
      wrap.insertBefore(left, inp);

      const right = document.createElement('span'); right.className='vp-amount';
      rightD.forEach(d=>right.appendChild(amtBtn(label(d), d, inp)));
      if (inp.nextSibling) wrap.insertBefore(right, inp.nextSibling); else wrap.appendChild(right);

      inp.dataset.vpQuick='1';
    });

    applySavedResourcesIfTransport();
  }
  function readResources(){
    return {
      arm: toInt($(SEL.resArm)?.value,0),
      mun: toInt($(SEL.resMun)?.value,0),
      alc: toInt($(SEL.resAlc)?.value,0),
      dol: toInt($(SEL.resDol)?.value,0),
    };
  }
  function applyResources(o){
    setVal($(SEL.resArm), o?.arm ?? '');
    setVal($(SEL.resMun), o?.mun ?? '');
    setVal($(SEL.resAlc), o?.alc ?? '');
    setVal($(SEL.resDol), o?.dol ?? '');
  }
  function applySavedResourcesIfTransport(){
    const ms=$(SEL.missionSelect);
    const isTransport = ms && String(ms.value)==='3';
    if (!isTransport) return;
    const saved=GM_Get(STORAGE.resources,null);
    if (saved) applyResources(saved);
  }
  function amtBtn(text, delta, input){
    const b=document.createElement('button');
    b.type='button'; b.textContent=text;
    b.addEventListener('click', ()=>{
      let cur=toInt(input.value,0);
      cur += delta;
      if (cur < 0) cur = 0;
      setVal(input, cur);
    });
    return b;
  }
  function label(n){
    const sign = n<0?'-':'+'; const abs=Math.abs(n);
    if (abs>=1e6) return sign + (abs/1e6)+'M';
    if (abs>=1e3) return sign + (abs/1e3)+'k';
    return sign + abs;
  }

  /* ---------- < Send / Send > ---------- */
  function mountExtendedSend(){
    const btnSend=$(SEL.btnSend), btnUpdate=$(SEL.btnUpdate);
    if(!btnSend || btnSend.dataset.vpExt) return;

    const prev=document.createElement('input');
    prev.type='button'; prev.value='< Send'; prev.className='vp-like vp-left';
    prev.addEventListener('click',()=>{ setPostSendDelta(-1); safeSubmitSend(); });

    const next=document.createElement('input');
    next.type='button'; next.value='Send >'; next.className='vp-like vp-right';
    next.addEventListener('click',()=>{ setPostSendDelta(+1); safeSubmitSend(); });

    if (btnUpdate) btnUpdate.insertAdjacentElement('beforebegin',prev);
    btnSend.insertAdjacentElement('afterend',next);
    btnSend.dataset.vpExt='1';
  }
  function safeSubmitSend(){
    const form=$(SEL.btnSend)?.closest('form');
    if(!form) return;
    try{ $(SEL.btnSend).click(); }
    catch{ try{ form.submit(); }catch{ try{ form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); }catch{} } }
  }
  function setPostSendDelta(delta){ try{ sessionStorage.setItem(STORAGE.postDelta, String(delta)); }catch{} }
  function consumePostSendDelta(){ let d=null; try{ d=sessionStorage.getItem(STORAGE.postDelta); sessionStorage.removeItem(STORAGE.postDelta); }catch{}; const n=parseInt(d,10); return Number.isFinite(n)?n:null; }
  function applyPostSendNavigationIfAny(){ const delta=consumePostSendDelta(); if(delta!=null) navigateBuilding(delta); }

  /* ---------- Init & Observer ---------- */
  function bootstrap(){
    // Overview: Navigator + Collapsible
    mountBuildingNavigator();
    mountOverviewToggles();

    // Missionsseite ein/aus
    if (onMissionsPage()){
      document.body.classList.add('vp-missions');
      mountCoordsSaveClear();
      mountMissionSaveClear();
      mountResourcesHeaderAndQuickButtons();
      mountTroopSaveClear();
      mountExtendedSend();
    } else {
      document.body.classList.remove('vp-missions');
    }

    // Nach <Send/Send> ggf. springen (egal auf welcher Seite)
    applyPostSendNavigationIfAny();
  }

  bootstrap();
  let raf=null;
  const obs=new MutationObserver(()=>{
    if(raf) return;
    raf=requestAnimationFrame(()=>{ raf=null; bootstrap(); });
  });
  obs.observe(document.documentElement,{childList:true,subtree:true});

})();
