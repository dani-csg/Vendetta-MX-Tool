// ==UserScript==
// @name         Vendetta MX Tool
// @namespace    mx.tools
// @version      1.6.3
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
    postDelta: 'vp_post_send_building_delta_v1',
  };

  const SEL = {
    // global
    buildingForm:  '#frmBuilding',
    buildingSelect:'#building',
    // missions
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

  /* ========= minimal, strikt-namespaced Styles ========= */
  (function ensureCss(){
    if (document.querySelector('#vp-style')) return;
    const st=document.createElement('style'); st.id='vp-style';
    st.textContent = `
      /* Nur unsere Zusatzbuttons stylen */
      .vp-inline-group{ display:inline-flex; gap:.35rem; margin-left:.5rem; vertical-align:middle; }
      .vp-inline-group button{ border-radius:4px; padding:2px 8px; font-size:12px; background:#f7f7f7; border:1px solid #999; cursor:pointer; height:auto; line-height:1.2; }

      /* Zusätzliche Send-Buttons mit Abstand */
      input.vp-like{ border-radius:4px; padding:2px 8px; font-size:12px; background:#f7f7f7; border:1px solid #999; cursor:pointer; height:auto; line-height:1.2; }
      input.vp-left { margin-right:.5rem; }
      input.vp-right{ margin-left:.5rem; }

      /* Nur unsere kleinen Nav-Buttons neben dem Gebäude-Select */
      button.vp-nav { border-radius:4px; padding:2px 8px; font-size:12px; background:#f7f7f7; border:1px solid #999; cursor:pointer; height:auto; line-height:1.2; margin:0 .25rem; }
    `;
    document.head.appendChild(st);
  })();

  /* ========= Utility ========= */
  const onMissionsPage = () => !!$(SEL.missionForm);

  function inlineGroup(saveCb, clearCb){
    const wrap=document.createElement('span'); wrap.className='vp-inline-group';
    const s=document.createElement('button'); s.type='button'; s.textContent='Save';  s.addEventListener('click',saveCb);
    const c=document.createElement('button'); c.type='button'; c.textContent='Clear'; c.addEventListener('click',clearCb);
    wrap.append(s,c);
    return wrap;
  }

  /* ========= A) Building quick-nav (Overview & überall wo vorhanden) ========= */
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

  /* ========= B) Missions helpers ========= */
  function mountTroopSaveClear(){
    const inputs = $$('input[id^="subFormTropas-"]');
    if (!inputs.length) return;
    const state = Object.assign({}, GM_Get(STORAGE.troops, {}));
    inputs.forEach(inp=>{
      if (inp.dataset.vpTroopDone) return;
      const row = inp.closest('tr');
      const labelEl = row ? row.querySelector('label') : null;
      const rawName = (labelEl?.textContent || '').trim();   // e.g. "Mover (1)"
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
    ms.dataset.vpDone='1';
  }

  /* ========= C) < Send / Send > ========= */
  function mountExtendedSend(){
    const btnSend=$(SEL.btnSend), btnUpdate=$(SEL.btnUpdate);
    if(!btnSend || btnSend.dataset.vpExt) return;

    const btnPrev=document.createElement('input');
    btnPrev.type='button'; btnPrev.value='< Send'; btnPrev.className='vp-like vp-left';
    btnPrev.addEventListener('click',()=>{ setPostSendDelta(-1); safeSubmitSend(); });

    const btnNext=document.createElement('input');
    btnNext.type='button'; btnNext.value='Send >'; btnNext.className='vp-like vp-right';
    btnNext.addEventListener('click',()=>{ setPostSendDelta(+1); safeSubmitSend(); });

    if (btnUpdate) btnUpdate.insertAdjacentElement('beforebegin',btnPrev);
    btnSend.insertAdjacentElement('afterend',btnNext);
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

  /* ========= Init & Observer ========= */
  function bootstrap(){
    // immer: Navigator und ggf. Post-Send-Navigation
    mountBuildingNavigator();
    applyPostSendNavigationIfAny();

    // nur auf Missionsseite: Helfer
    if (onMissionsPage()){
      mountCoordsSaveClear();
      mountMissionSaveClear();
      mountTroopSaveClear();
      mountExtendedSend();
    }
  }

  bootstrap();
  let raf=null;
  const obs=new MutationObserver(()=>{
    if(raf) return;
    raf=requestAnimationFrame(()=>{ raf=null; bootstrap(); });
  });
  obs.observe(document.documentElement,{childList:true,subtree:true});

})();
