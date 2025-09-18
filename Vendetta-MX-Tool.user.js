// ==UserScript==
// @name         Vendetta MX Tool
// @namespace    mx.tools
// @version      1.6.1
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

(function() {
  'use strict';

  /* ============ Helpers & Config ============ */
  const $  = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
  const toInt = (v,d=0)=>{ const n=parseInt(String(v??'').replace(/[^\d-]+/g,''),10); return Number.isFinite(n)?n:d; };
  const setVal=(el,v)=>{ if(!el) return; el.value=(v??'')+''; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); };

  function GM_Get(k,d){ try{return GM_getValue(k,d);}catch{return d;} }
  function GM_Set(k,v){ try{GM_setValue(k,v);}catch{} }
  function GM_Del(k){ try{GM_deleteValue(k);}catch{} }

  const STORAGE = {
    coords:    'vp_coords_default_v1',
    mission:   'vp_mission_default_v1',
    resources: 'vp_resources_default_v1',
    troops:    'vp_troops_defaults_v1',
    postDelta: 'vp_post_send_building_delta_v1',
  };

  const SEL = {
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

  /* ============ CSS (inkl. Abstände) ============ */
  (function ensureCss(){
    if (document.querySelector('#vp-style')) return;
    const st=document.createElement('style'); st.id='vp-style';
    st.textContent=`
      #frmBuilding button, .vp-inline-group button, .vp-amount button, input.vp-like {
        border-radius: 4px; padding: 2px 8px; font-size: 12px; line-height: 1.2;
        height: auto; vertical-align: middle; background:#f7f7f7; border:1px solid #999; cursor:pointer;
      }
      #frmBuilding select { border-radius: 4px; padding: 2px 4px; font-size: 12px; line-height: 1.2; height: auto; vertical-align: middle; }

      .vp-inline-group{ display:inline-flex; gap:.35rem; margin-left:.5rem; vertical-align:middle; }

      .vp-res-wrap{ display:flex; align-items:center; gap:.35rem; }
      .vp-amount{ display:inline-flex; gap:.25rem; }

      /* Abstand für zusätzliche Send-Buttons */
      input.vp-like.vp-left  { margin-right: .5rem; }
      input.vp-like.vp-right { margin-left:  .5rem; }

      /* (bestehende Styles aus deiner Vorgängerversion gekürzt) */
    `;
    document.head.appendChild(st);
  })();

  /* ============ Building navigator (− [select] +) ============ */
  function mountBuildingNavigator(){
    const sel = $(SEL.buildingSelect);
    if (!sel || sel.dataset.vpHasNav) return;
    const minus = navBtn('−','Previous building',()=>navigateBuilding(-1));
    const plus  = navBtn('+','Next building',   ()=>navigateBuilding(+1));
    sel.insertAdjacentElement('beforebegin', minus);
    sel.insertAdjacentElement('afterend', plus);
    sel.dataset.vpHasNav='1';
  }
  function navBtn(txt,title,fn){
    const b=document.createElement('button');
    b.type='button'; b.textContent=txt; b.title=title||''; b.addEventListener('click',fn);
    return b;
  }
  function navigateBuilding(delta){
    const sel=$(SEL.buildingSelect);
    const form=$(SEL.buildingForm);
    if(!sel || !form || !sel.options || sel.options.length<2) return;
    const len=sel.options.length, cur=sel.selectedIndex>=0?sel.selectedIndex:0;
    sel.selectedIndex=(cur+delta+len)%len;
    try{ sel.dispatchEvent(new Event('change',{bubbles:true})); }catch{}
    try{ form.submit(); }catch{ try{ form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); }catch{} }
  }

  /* ============ Missions: Save/Clear (Koordinaten + Mission) ============ */
  function inlineGroup(saveCb, clearCb){
    const span=document.createElement('span'); span.className='vp-inline-group';
    const s=document.createElement('button'); s.type='button'; s.textContent='Save';  s.addEventListener('click',saveCb);
    const c=document.createElement('button'); c.type='button'; c.textContent='Clear'; c.addEventListener('click',clearCb);
    span.append(s,c);
    return span;
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

  /* ============ Ressourcen: Header Save/Clear + Quick-Buttons ============ */
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
      const left = document.createElement('span');
      left.className='vp-amount';
      leftDeltas.forEach(d=>left.appendChild(amtBtn(label(d), d, inp)));
      wrap.insertBefore(left, inp);

      const right = document.createElement('span');
      right.className='vp-amount';
      rightDeltas.forEach(d=>right.appendChild(amtBtn(label(d), d, inp)));
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

  /* ============ Troops Save/Clear (auto für alle Einheiten) ============ */
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
      .replace(/\(.*?\)/g,'')           // "(1)" entfernen
      .replace(/[^\p{L}\p{N}]+/gu,'_')  // alles Nicht-Buchstabe/Zahl -> "_"
      .replace(/^_+|_+$/g,'')           // Trim "_"
      .toLowerCase();
  }

  /* ============ Dual-Send Buttons (< Send / Send >) mit Abstand ============ */
  function mountDualSendButtons(){
    const btnSend   = $(SEL.btnSend);
    const btnUpdate = $(SEL.btnUpdate);
    const form      = $(SEL.missionForm);
    if (!form || !btnSend || btnSend.dataset.vpDual) return;

    // "< Send" links neben "Update"
    if (btnUpdate && !btnUpdate.dataset.vpDualLeft){
      const leftBtn = document.createElement('input');
      leftBtn.type='button';
      leftBtn.value='< Send';
      leftBtn.className = (btnSend.className || '') + ' vp-like vp-left';
      leftBtn.addEventListener('click', ()=>{
        setPostSendDelta(-1);
        safeSubmitSend();
      });
      btnUpdate.parentNode.insertBefore(leftBtn, btnUpdate);
      btnUpdate.dataset.vpDualLeft='1';
    }

    // "Send >" rechts neben "Send"
    const rightBtn = document.createElement('input');
    rightBtn.type='button';
    rightBtn.value='Send >';
    rightBtn.className = (btnSend.className || '') + ' vp-like vp-right';
    rightBtn.addEventListener('click', ()=>{
      setPostSendDelta(+1);
      safeSubmitSend();
    });
    if (btnSend.nextSibling) btnSend.parentNode.insertBefore(rightBtn, btnSend.nextSibling); else btnSend.parentNode.appendChild(rightBtn);

    btnSend.dataset.vpDual='1';
  }

  function safeSubmitSend(){
    const form=$(SEL.missionForm);
    const btn=$(SEL.btnSend);
    if (!form || !btn) return;
    try { btn.click(); }
    catch {
      try{ form.submit(); }catch{ try{ form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); }catch{} }
    }
  }

  function setPostSendDelta(delta){
    try { sessionStorage.setItem(STORAGE.postDelta, String(delta)); } catch{}
  }
  function consumePostSendDelta(){
    let d=null;
    try { d = sessionStorage.getItem(STORAGE.postDelta); sessionStorage.removeItem(STORAGE.postDelta); } catch{}
    const n = d==null ? null : parseInt(d,10);
    return Number.isFinite(n) ? n : null;
  }
  function applyPostSendNavigationIfAny(){
    const delta = consumePostSendDelta();
    if (delta==null) return;
    navigateBuilding(delta);
  }

  /* ============ Init & Observer ============ */
  function onMissionsPage(){ return !!$(SEL.missionForm); }

  function bootstrap(){
    mountBuildingNavigator();

    if (!onMissionsPage()) return;

    // Save/Clear an allen gewünschten Stellen:
    mountCoordsSaveClear();
    mountMissionSaveClear();
    mountResourcesHeaderAndQuickButtons();
    mountTroopSaveClear();

    // Dual-Send + ggf. nach Absenden springen:
    mountDualSendButtons();
    applyPostSendNavigationIfAny();
  }

  bootstrap();

  let raf=null;
  const obs=new MutationObserver(()=>{
    if(raf) return;
    raf=requestAnimationFrame(()=>{
      raf=null;
      bootstrap();
    });
  });
  obs.observe(document.documentElement,{childList:true,subtree:true});
})();
