// ==UserScript==
// @name         Vendetta MX Tool
// @namespace    mx.tools
// @version      1.5.1
// @description  QoL: building navigation (− [select] +), mission templates (Save/Clear), resource quick-amounts, collapsible overview boxes with saved state, resource bar spacing fix, compact buttons.
// @author       mx
// @match        *://vendettagame.es/public/*
// @match        *://www.vendettagame.es/public/*
// @run-at       document-end
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @downloadURL https://raw.githubusercontent.com/dani-csg/Vendetta-MX-Tool/main/Vendetta-MX-Tool.user.js
// @updateURL   https://raw.githubusercontent.com/dani-csg/Vendetta-MX-Tool/main/Vendetta-MX-Tool.user.js
// ==/UserScript==

(function() {
  'use strict';

  /* ================== Helpers & Config ================== */
  const $  = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
  const toInt = (v,d=0)=>{ const n=parseInt(String(v??'').replace(/[^\d-]+/g,''),10); return Number.isFinite(n)?n:d; };
  const setVal=(el,v)=>{ if(!el) return; el.value=(v??'')+''; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); };

  function GM_Get(k,d){ try{return GM_getValue(k,d);}catch{return d;} }
  function GM_Set(k,v){ try{GM_setValue(k,v);}catch{} }
  function GM_Del(k){ try{GM_deleteValue(k);}catch{} }

  const STORAGE_KEYS = {
    coords:    'vp_coords_default_v1',
    mission:   'vp_mission_default_v1',
    resources: 'vp_resources_default_v1',
    boxes:     'vp_collapsed_boxes_v2',
  };

  const SELECTORS = {
    buildingForm:  '#frmBuilding',
    buildingSelect:'#building',

    missionForm:   'form[action="/public/mob/misiones"]',
    missionSelect: '#subFormCoordenadas-mision',

    coordX: '#subFormCoordenadas-coordx',
    coordY: '#subFormCoordenadas-coordy',
    coordZ: '#subFormCoordenadas-coordz',

    resArm: '#subFormRecursos-recursos_arm',
    resMun: '#subFormRecursos-recursos_mun',
    resAlc: '#subFormRecursos-recursos_alc',
    resDol: '#subFormRecursos-recursos_dol',

    btnUpdate:  '#actualizar',
    btnSend:    '#enviar',
  };

  /* ================== CSS ================== */
  (function ensureCss(){
    if (document.querySelector('#vp-style')) return;
    const st=document.createElement('style'); st.id='vp-style';
    st.textContent=`
      /* --- Building navigation buttons + select (kompakter, weniger rund) --- */
      #frmBuilding button {
        border-radius: 4px;
        padding: 2px 8px;
        font-size: 12px;
        line-height: 1.2;
        height: auto;
        vertical-align: middle;
        background:#f7f7f7;
        border:1px solid #999;
        cursor:pointer;
      }
      #frmBuilding select {
        border-radius: 4px;
        padding: 2px 4px;
        font-size: 12px;
        line-height: 1.2;
        height: auto;
        vertical-align: middle;
      }

      /* --- Inline Save / Clear Buttons neben Inputs --- */
      .vp-inline-group{ display:inline-flex; gap:.35rem; margin-left:.5rem; vertical-align:middle; }
      .vp-inline-group button{
        border-radius: 4px;
        padding: 2px 8px;
        font-size: 12px;
        line-height: 1.2;
        height: auto;
        vertical-align: middle;
        background:#f7f7f7;
        border:1px solid #999;
        cursor:pointer;
      }

      /* --- Quick amount button groups um die Ressourcenfelder --- */
      .vp-res-wrap{ display:flex; align-items:center; gap:.35rem; }
      .vp-amount{ display:inline-flex; gap:.25rem; }
      .vp-amount button{
        border-radius: 4px;
        padding: 2px 8px;
        font-size: 12px;
        line-height: 1.2;
        height: auto;
        vertical-align: middle;
        background:#f7f7f7;
        border:1px solid #aaa;
        cursor:pointer;
      }

      /* --- Collapsible toggles (Overview) --- */
      .content_box{ border:1px solid #ccc; border-radius:.35rem; padding:.25rem .5rem; margin-bottom:.6rem; position:relative; z-index:1; }
      .content_box > h2{ position:relative; padding-right:2.2rem; cursor:default; }

      .vp-box-toggle{
        position:absolute; right:.4rem; top:50%; transform:translateY(-50%);
        background:inherit; color:#f2f2f2; border:1px solid #f2f2f2;
        border-radius:.25rem; font:12px/1.2 system-ui,sans-serif;
        width:1.6rem; height:1.3rem; line-height:1.1rem; text-align:center;
        cursor:pointer; opacity:.9;
      }
      .vp-box-toggle:hover{ opacity:1; filter:brightness(1.2); }
      .content_box.vp-collapsed .content_box_text{ display:none !important; }

      /* --- Ressourcenbalken: weniger Abstand, kein Überdecken --- */
      body.vp-overview #barraRecursos{ position:static !important; z-index:auto !important; margin:.25rem 0 .35rem 0 !important; }
      body.vp-overview #barraRecursos + br{ display:none !important; }
      body.vp-overview #content .content_box:first-of-type{ margin-top:.25rem; }
      body.vp-overview #content{ padding-top:.25rem !important; }
    `;
    document.head.appendChild(st);
  })();

  /* ================== A) Building Navigator (− [select] +) ================== */
  function mountBuildingNavigator(){
    const sel = $(SELECTORS.buildingSelect);
    if (!sel || sel.dataset.vpHasNav) return;

    const minus = navBtn('−','Previous building',()=>navigateBuilding(-1));
    const plus  = navBtn('+','Next building',   ()=>navigateBuilding(+1));

    sel.insertAdjacentElement('beforebegin', minus); // − links
    sel.insertAdjacentElement('afterend', plus);     // + rechts

    sel.dataset.vpHasNav='1';
  }
  function navBtn(txt,title,fn){
    const b=document.createElement('button');
    b.type='button'; b.textContent=txt; b.title=title||''; b.addEventListener('click',fn);
    return b;
  }
  function navigateBuilding(delta){
    const sel=$(SELECTORS.buildingSelect);
    if(!sel || !sel.options || sel.options.length<2) return;
    const len=sel.options.length, cur=sel.selectedIndex>=0?sel.selectedIndex:0;
    sel.selectedIndex=(cur+delta+len)%len;
    try{ sel.dispatchEvent(new Event('change',{bubbles:true})); }catch{}
    const form=$(SELECTORS.buildingForm);
    if(form){ try{ form.submit(); }catch{ try{ form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); }catch{} } }
  }

  /* ================== B) Overview Toggles (persist) ================== */
  function isOverviewPage(){
    const p=location.pathname.replace(/\/+$/,'');
    return /\/public\/mob\/visiongeneral(?:\/index)?$/i.test(p);
  }
  function mountOverviewToggles(){
    if (!isOverviewPage()) return;
    document.body.classList.add('vp-overview');

    const state = Object.assign({}, GM_Get(STORAGE_KEYS.boxes, {})); // title -> collapsed:boolean
    $$('#content .content_box').forEach(box=>{
      if (box.dataset.vpTgl) return;
      const h2=box.querySelector('h2'), body=box.querySelector('.content_box_text'); if(!h2||!body) return;

      const title=(h2.textContent||'').trim();

      const btn=document.createElement('button');
      btn.type='button'; btn.className='vp-box-toggle';

      const collapsed=!!state[title];
      if (collapsed) box.classList.add('vp-collapsed');
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      btn.textContent = collapsed ? '+' : '−';

      btn.addEventListener('click', ()=>{
        const nowExpanded = btn.getAttribute('aria-expanded')==='true';
        const newExpanded = !nowExpanded;
        btn.setAttribute('aria-expanded', newExpanded ? 'true' : 'false');
        btn.textContent = newExpanded ? '−' : '+';
        box.classList.toggle('vp-collapsed', !newExpanded);
        state[title] = !newExpanded; // collapsed speichern
        GM_Set(STORAGE_KEYS.boxes, state);
      });

      h2.appendChild(btn);
      box.dataset.vpTgl='1';
    });
  }

  /* ================== C) Missions: Save/Clear + Quick Amounts ================== */
  function onMissionsPage(){ return !!$(SELECTORS.missionForm); }

  function inlineGroup(saveCb, clearCb){
    const span=document.createElement('span'); span.className='vp-inline-group';
    const s=document.createElement('button'); s.type='button'; s.textContent='Save';  s.addEventListener('click',saveCb);
    const c=document.createElement('button'); c.type='button'; c.textContent='Clear'; c.addEventListener('click',clearCb);
    span.append(s,c);
    return span;
  }

  function mountMissionHelpers(){
    if (!onMissionsPage()) return;

    // Koordinaten
    const cx=$(SELECTORS.coordX), cy=$(SELECTORS.coordY), cz=$(SELECTORS.coordZ);
    if (cx && !cz.dataset.vpDone){
      cz.insertAdjacentElement('afterend', inlineGroup(
        ()=>GM_Set(STORAGE_KEYS.coords,{x:cx.value,y:cy.value,z:cz.value}),
        ()=>{ GM_Del(STORAGE_KEYS.coords); setVal(cx,''); setVal(cy,''); setVal(cz,''); }
      ));
      const saved=GM_Get(STORAGE_KEYS.coords,null);
      if(saved){ setVal(cx,saved.x); setVal(cy,saved.y); setVal(cz,saved.z); }
      cz.dataset.vpDone='1';
    }

    // Missionsart
    const ms=$(SELECTORS.missionSelect);
    if (ms && !ms.dataset.vpDone){
      ms.insertAdjacentElement('afterend', inlineGroup(
        ()=>GM_Set(STORAGE_KEYS.mission,{value:ms.value}),
        ()=>GM_Del(STORAGE_KEYS.mission)
      ));
      const sv=GM_Get(STORAGE_KEYS.mission,null);
      if(sv){ ms.value=sv.value; ms.dispatchEvent(new Event('change',{bubbles:true})); }
      ms.addEventListener('change', applySavedResourcesIfTransport);
      ms.dataset.vpDone='1';
    }

    // Ressourcen: Save/Clear am Header + Quickbuttons pro Feld
    mountResourcesHeaderAndQuickButtons();
  }

  function mountResourcesHeaderAndQuickButtons(){
    const inputs = [
      $(SELECTORS.resArm),
      $(SELECTORS.resMun),
      $(SELECTORS.resAlc),
      $(SELECTORS.resDol),
    ].filter(Boolean);

    if (!inputs.length) return;

    // Save/Clear im Header der Ressourcen-Tabelle (einmal)
    const headerCell = findResourcesHeaderCell();
    if (headerCell && !headerCell.dataset.vpResHeader){
      headerCell.insertAdjacentElement('beforeend', inlineGroup(
        ()=>GM_Set(STORAGE_KEYS.resources, readResources()),
        ()=>{ GM_Del(STORAGE_KEYS.resources); applyResources({arm:'',mun:'',alc:'',dol:''}); }
      ));
      headerCell.dataset.vpResHeader='1';
    }

    // Quickbuttons je Feld: links -50k/-5k/-500, rechts +1k/+10k/+100k
    const leftDeltas  = [-50000, -5000, -500];
    const rightDeltas = [  1000,  10000, 100000];

    inputs.forEach(inp=>{
      if (inp.dataset.vpQuick) return;
      let wrap = inp.closest('.vp-res-wrap');
      if (!wrap){
        wrap=document.createElement('span');
        wrap.className='vp-res-wrap';
        inp.parentNode.insertBefore(wrap, inp);
        wrap.append(inp);
      }
      // links
      const left = document.createElement('span');
      left.className='vp-amount';
      leftDeltas.forEach(d=>left.appendChild(amtBtn(label(d), d, inp)));
      wrap.insertBefore(left, inp);
      // rechts
      const right = document.createElement('span');
      right.className='vp-amount';
      rightDeltas.forEach(d=>right.appendChild(amtBtn(label(d), d, inp)));
      if (inp.nextSibling) wrap.insertBefore(right, inp.nextSibling); else wrap.appendChild(right);

      inp.dataset.vpQuick='1';
    });

    // gespeicherte Ressourcen ggf. anwenden (nur sinnvoll bei Transport)
    applySavedResourcesIfTransport();
  }

  function findResourcesHeaderCell(){
    // Je nach HTML kann das ein TH/TD mit "Resources" Text sein
    const cells = $$('td.c, th.c, h2');
    return cells.find(el => (el.textContent||'').trim().toLowerCase().startsWith('resources'));
  }
  function readResources(){
    return {
      arm: toInt($(SELECTORS.resArm)?.value,0),
      mun: toInt($(SELECTORS.resMun)?.value,0),
      alc: toInt($(SELECTORS.resAlc)?.value,0),
      dol: toInt($(SELECTORS.resDol)?.value,0),
    };
  }
  function applyResources(o){
    setVal($(SELECTORS.resArm), o?.arm ?? '');
    setVal($(SELECTORS.resMun), o?.mun ?? '');
    setVal($(SELECTORS.resAlc), o?.alc ?? '');
    setVal($(SELECTORS.resDol), o?.dol ?? '');
  }
  function applySavedResourcesIfTransport(){
    const ms=$(SELECTORS.missionSelect);
    const isTransport = ms && String(ms.value)==='3';
    if (!isTransport) return;
    const saved=GM_Get(STORAGE_KEYS.resources,null);
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
    if (abs>=1e6) return sign + (abs/1000/1000)+'M';
    if (abs>=1e3) return sign + (abs/1000)+'k';
    return sign + abs;
  }

  /* ================== Init & Observer ================== */
  function bootstrap(){
    mountBuildingNavigator();
    mountOverviewToggles();
    mountMissionHelpers();
  }

  // run now
  bootstrap();

  // observe ajaxy changes
  let raf=null;
  const obs=new MutationObserver(()=>{
    if(raf) return;
    raf=requestAnimationFrame(()=>{
      raf=null;
      mountBuildingNavigator();
      mountOverviewToggles();
      mountMissionHelpers();
    });
  });
  obs.observe(document.documentElement,{childList:true,subtree:true});

})();
