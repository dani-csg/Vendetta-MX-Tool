// ==UserScript==
// @name         Vendetta MX Tool
// @namespace    mx.tools
// @version      1.6.5
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

  /* ---------- helpers ---------- */
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
  };

  const SEL = {
    // global / overview
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

  const onMissionsPage = () => !!$(SEL.missionForm);

  /* ---------- CSS (strikt nur für Missionsseite + unsere kleinen Zusatzbuttons) ---------- */
  (function css(){
    if ($('#vp-style')) return;
    const st=document.createElement('style'); st.id='vp-style';
    st.textContent = `
      /* nur unsere Controls auf der Missionsseite */
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
      /* zusätzliche Send-Buttons mit Abstand */
      body.vp-missions input.vp-like{
        border-radius:4px; padding:2px 8px; font-size:12px; line-height:1.2; height:auto;
        background:#f7f7f7; border:1px solid #999; cursor:pointer;
      }
      body.vp-missions input.vp-left  { margin-right:.5rem; }
      body.vp-missions input.vp-right { margin-left:.5rem; }

      /* unsere kleinen Navigator-Buttons neben dem Gebäude-Select – global, aber neutral */
      button.vp-nav { border-radius:4px; padding:2px 8px; font-size:12px; line-height:1.2; height:auto;
        background:#f7f7f7; border:1px solid #999; cursor:pointer; margin:0 .25rem; }
    `;
    document.head.appendChild(st);
  })();

  /* ---------- Overview/Hauptseite: Building quick-nav ---------- */
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

  /* ---------- Missionsseite: Save/Clear & Ressourcen-Quicks ---------- */
  function inlineGroup(saveCb, clearCb){
    const wrap=document.createElement('span'); wrap.className='vp-inline-group';
    const s=document.createElement('button'); s.type='button'; s.textContent='Save';  s.addEventListener('click',saveCb);
    const c=document.createElement('button'); c.type='button'; c.textContent='Clear'; c.addEventListener('click',clearCb);
    wrap.append(s,c); return wrap;
  }

  // Troops (auto für alle Einheiten)
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
      .replace(/[^\p{L}\p{N}]+/gu,'_')  // nicht alnum -> "_"
      .replace(/^_+|_+$/g,'')           // Trim "_"
      .toLowerCase();
  }

  // Koordinaten Save/Clear
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

  // Missionsart Save/Clear
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

  // Ressourcen: Header Save/Clear + Quick Buttons je Feld
  function mountResourcesHeaderAndQuickButtons(){
    const inputs = [$(SEL.resArm),$(SEL.resMun),$(SEL.resAlc),$(SEL.resDol)].filter(Boolean);
    if (!inputs.length) return;

    // Headerzelle finden ("Resources")
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

    const leftD = [-50000, -5000, -500];
    const rightD= [  1000,  10000, 100000];

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

  /* ---------- Init & Observer ---------- */
  function bootstrap(){
    // Overview: nur Navigator (beeinflusst die Box-Toggles NICHT)
    mountBuildingNavigator();

    // Missionsseite aktivieren/deaktivieren
    if (onMissionsPage()) {
      document.body.classList.add('vp-missions');
      mountCoordsSaveClear();
      mountMissionSaveClear();
      mountResourcesHeaderAndQuickButtons();
      mountTroopSaveClear();
      mountExtendedSend();
    } else {
      document.body.classList.remove('vp-missions');
    }

    // falls wir von <Send/Send> kommen: egal welche Seite, jetzt springen
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
