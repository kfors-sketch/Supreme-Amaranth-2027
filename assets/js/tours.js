// /assets/js/tours.js
(function(){
  if (typeof window !== "undefined") window.__amaranth_tours_bound = window.__amaranth_tours_bound || false;
  const GRID_ID = "toursGrid";

  function money(n){ const v=Math.round(Number(n||0)*100)/100; return v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2,style:"currency",currency:"USD"}); }
  function toNumber(n,def=0){ const v=Number(n); return Number.isFinite(v)?v:def; }
  function esc(s){ return String(s??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch])); }
  function sortBySortOrder(a,b){ const ao=Number(a?.sortOrder??1000), bo=Number(b?.sortOrder??1000); return ao!==bo ? ao-bo : String(a?.name||"").localeCompare(String(b?.name||"")); }
  function normalizeTour(raw){
    const t=Object.assign({},raw||{});
    t.id=String(t.id||"").trim();
    t.name=String(t.name||t.title||"").trim()||t.id||"Tour";
    t.description=String(t.description||t.notes||"").trim();
    t.location=String(t.location||t.meetingLocation||"").trim();
    t.tourDateTime=t.tourDateTime||t.dateTime||t.start||"";
    t.price=toNumber(t.price,0);
    t.active=t.active===undefined||t.active===null?true:t.active!==false;
    t.publishStart=t.publishStart||""; t.publishEnd=t.publishEnd||"";
    t.sortOrder=Number(t.sortOrder??1000); if(!Number.isFinite(t.sortOrder))t.sortOrder=1000;
    t.limitPerAttendee=Number(t.limitPerAttendee||t.limit||0)||0;
    t.maxQty=Number(t.maxQty||1)||1;
    t.chairEmails=Array.isArray(t.chairEmails)?t.chairEmails:String(t.chairEmails||t?.chair?.email||"").split(",").map(s=>s.trim()).filter(Boolean);
    return t;
  }
  function isWithinWindow(item,nowMs){ const s=item.publishStart?Date.parse(item.publishStart):NaN; const e=item.publishEnd?Date.parse(item.publishEnd):NaN; if(!isNaN(s)&&nowMs<s)return false; if(!isNaN(e)&&nowMs>e)return false; return true; }
  async function fetchJson(url){ try{ const r=await fetch(url,{cache:"no-store"}); if(!r.ok)return null; return await r.json(); }catch(e){ return null; } }
  async function loadTours(){
    const now=Date.now(); let tours=[];
    const j=await fetchJson("/api/router?type=tours");
    if(Array.isArray(j?.tours)) tours=j.tours.map(normalizeTour).filter(t=>t.active&&isWithinWindow(t,now)).sort(sortBySortOrder);
    if(!tours.length&&Array.isArray(window.SUPREME_TOURS)) tours=window.SUPREME_TOURS.map(normalizeTour).filter(t=>t.active&&isWithinWindow(t,now)).sort(sortBySortOrder);
    return tours;
  }
  function getCartState(){ try{ return Cart.get()||{attendees:[],lines:[]}; }catch(e){ return {attendees:[],lines:[]}; } }
  function getAttendees(){ const st=getCartState(); return Array.isArray(st.attendees)?st.attendees:[]; }
  function findAttendeeByKey(key){ const attendees=getAttendees(); return attendees.find(a=>String(a.id)===String(key))||attendees.find(a=>String(a.email)===String(key))||attendees.find(a=>String(a.name)===String(key))||null; }
  function buildAttendeeOptions(attendees,sel){
    sel.innerHTML="";
    const none=document.createElement("option"); none.value=""; none.textContent=attendees.length?"Select attendee…":"Add an attendee above first"; sel.appendChild(none);
    attendees.forEach(a=>{ const opt=document.createElement("option"); opt.value=a.id||a.email||a.name||""; opt.textContent=a.name||a.email||"Attendee"; sel.appendChild(opt); });
    sel.disabled=attendees.length===0;
  }
  function addTourToCart(tour,{attendee,qty,notes}){
    if(!window.Cart||typeof Cart.addLine!=="function"){ alert("Cart is not available yet. Please try again."); return {ok:false}; }
    if(!attendee){ alert("Please add an attendee above and select them for this tour."); return {ok:false}; }
    const quantity=Math.max(1,Math.floor(toNumber(qty,1)));
    const maxQty=Math.max(1,Number(tour.maxQty||1)||1);
    if(quantity>maxQty){ alert(`Quantity cannot be more than ${maxQty}.`); return {ok:false}; }
    try{
      const st=Cart.get()||{}; const lines=Array.isArray(st.lines)?st.lines:[];
      const existingQty=lines.filter(ln=>String(ln.itemType||"")==="tour"&&String(ln.itemId||"")===String(tour.id)&&String(ln.attendeeId||"")===String(attendee.id||"")).reduce((s,ln)=>s+Number(ln.qty||0),0);
      const limit=Number(tour.limitPerAttendee||0);
      if(limit>0&&existingQty+quantity>limit){ alert(`This tour is limited to ${limit} per attendee.`); return {ok:false}; }
    }catch(e){}
    const meta={category:"tour",tourId:tour.id||"",tourName:tour.name||"",tourDateTime:tour.tourDateTime||"",tourLocation:tour.location||"",attendeeId:attendee.id||"",attendeeName:attendee.name||"",attendeeEmail:attendee.email||"",attendeePhone:attendee.phone||"",attendeeTitle:attendee.title||"",attendeeCourt:attendee.courtName||"",attendeeCourtNumber:attendee.courtNumber||"",jurisdiction:attendee.jurisdiction||"",memberType:attendee.memberType||"",notes:notes||"",itemNote:notes||""};
    Cart.addLine({attendeeId:attendee.id||"",itemType:"tour",itemId:tour.id,itemName:tour.name,qty:quantity,unitPrice:Number(tour.price||0),meta});
    alert("Tour added"); return {ok:true};
  }
  function renderEmptyMessage(grid){ grid.innerHTML=`<section class="card"><h2>No tours available</h2><p>There are currently no tours open for registration. Please check back later.</p></section>`; }
  function buildCard(tour){
    const card=document.createElement("section"); card.className="card tour";
    const title=document.createElement("h2"); title.textContent=tour.name; card.appendChild(title);
    if(tour.description){ const desc=document.createElement("p"); desc.textContent=tour.description; card.appendChild(desc); }
    const details=document.createElement("div"); details.className="tiny"; details.style.cssText="opacity:.9;margin:.25rem 0 .75rem;line-height:1.45;";
    const bits=[]; if(tour.tourDateTime)bits.push(`<strong>Date/Time:</strong> ${esc(tour.tourDateTime)}`); if(tour.location)bits.push(`<strong>Meeting Location:</strong> ${esc(tour.location)}`); bits.push(`<strong>Price:</strong> ${money(tour.price)}`);
    details.innerHTML=bits.join("<br>"); card.appendChild(details);
    const row=document.createElement("div"); row.className="row";
    const attendeeWrap=document.createElement("label"); attendeeWrap.innerHTML="<span>Attendee for this tour</span>";
    const attendeeSelect=document.createElement("select"); attendeeSelect.setAttribute("data-tour-attendee-select",tour.id); attendeeWrap.appendChild(attendeeSelect); row.appendChild(attendeeWrap);
    const qtyWrap=document.createElement("label"); qtyWrap.innerHTML="<span>Quantity</span>";
    const qtyInput=document.createElement("input"); qtyInput.type="number"; qtyInput.min="1"; qtyInput.step="1"; qtyInput.value="1"; qtyInput.max=String(Math.max(1,tour.maxQty||1)); qtyWrap.appendChild(qtyInput); row.appendChild(qtyWrap);
    const notesWrap=document.createElement("label"); notesWrap.innerHTML="<span>Notes (optional)</span>";
    const notesInput=document.createElement("input"); notesInput.type="text"; notesInput.placeholder="Special notes for this tour"; notesWrap.appendChild(notesInput); row.appendChild(notesWrap);
    const btnWrap=document.createElement("div"); btnWrap.className="inline"; const addBtn=document.createElement("button"); addBtn.type="button"; addBtn.textContent="Add to cart"; btnWrap.appendChild(addBtn);
    card.appendChild(row); card.appendChild(btnWrap); buildAttendeeOptions(getAttendees(),attendeeSelect);
    addBtn.addEventListener("click",()=>{ const attendee=findAttendeeByKey(attendeeSelect.value||""); const ok=addTourToCart(tour,{attendee,qty:qtyInput.value,notes:String(notesInput.value||"").trim()}); if(ok.ok){ addBtn.textContent="Added!"; addBtn.disabled=true; setTimeout(()=>{addBtn.disabled=false; addBtn.textContent="Add to cart";},700); } });
    return card;
  }
  function rerenderAttendeeSelects(){ const attendees=getAttendees(); document.querySelectorAll("select[data-tour-attendee-select]").forEach(sel=>buildAttendeeOptions(attendees,sel)); }
  async function init(){
    if(window.__amaranth_tours_bound)return; window.__amaranth_tours_bound=true;
    const grid=document.getElementById(GRID_ID); if(!grid)return;
    try{ Cart.load(); }catch(e){}
    const tours=await loadTours(); if(!tours.length){ renderEmptyMessage(grid); return; }
    grid.innerHTML=""; tours.forEach(t=>grid.appendChild(buildCard(t)));
    window.addEventListener("cart:updated",rerenderAttendeeSelects); window.addEventListener("focus",rerenderAttendeeSelects); document.addEventListener("visibilitychange",()=>{if(!document.hidden)rerenderAttendeeSelects();}); window.addEventListener("storage",rerenderAttendeeSelects);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init); else init();
})();
