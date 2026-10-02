const DB_NAME='LemonTradingV2', DB_VERSION=1;
const STORES=['settings','parties','sales','purchases','payments','expenses','wastage','adjustments'];
const V1_KEY='lemonBillingV1';
const state={cache:{}, partyTab:'all', accountTab:'payments'};

const $=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(Number(n||0));
const qty=n=>`${Number(n||0).toFixed(2)} kg`;
const today=()=>new Date().toISOString().slice(0,10);
const fmtDate=d=>new Date(`${d}T00:00:00`).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uuid=()=>crypto.randomUUID();

function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{const db=req.result;for(const s of STORES){if(!db.objectStoreNames.contains(s)){const os=db.createObjectStore(s,{keyPath:'id'});if(s==='sales')os.createIndex('date','date');if(s==='purchases')os.createIndex('date','date');if(s==='payments')os.createIndex('date','date');if(s==='expenses')os.createIndex('date','date');if(s==='wastage')os.createIndex('date','date');}}};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
}
async function getAll(store){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly'),r=tx.objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function put(store,obj){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(obj);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}
async function del(store,id){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
async function clearStore(store){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
async function loadAll(){for(const s of STORES)state.cache[s]=await getAll(s);state.cache.settings=state.cache.settings[0]||{id:'main',businessName:'LEMON TRADING',phone:'',address:'',invoicePrefix:'INV'};}
async function saveMany(entries){for(const [s,obj] of entries)await put(s,obj);await loadAll();renderAll()}
async function seedIfEmpty(){
  const settings=await getAll('settings');
  if(settings.length)return;
  const v1=localStorage.getItem(V1_KEY);
  if(v1){
    try{await migrateV1(JSON.parse(v1));return}catch(e){console.warn('V1 migration failed',e)}
  }
  await put('settings',{id:'main',businessName:'LEMON TRADING',phone:'',address:'',invoicePrefix:'INV'});
}
async function migrateV1(v1){
  await put('settings',{id:'main',businessName:v1.settings?.businessName||'LEMON TRADING',phone:v1.settings?.phone||'',address:'',invoicePrefix:'INV'});
  const cm=new Map();for(const p of (v1.customers||[])){const x={id:p.id||uuid(),name:p.name,mobile:p.mobile||'',address:p.address||'',roles:['customer'],openingBalance:Number(p.openingBalance||0),createdAt:new Date().toISOString()};cm.set(x.id,x);await put('parties',x)}
  const sm=new Map();for(const p of (v1.suppliers||[])){const x={id:p.id||uuid(),name:p.name,mobile:p.mobile||'',address:p.address||'',roles:['supplier'],openingBalance:Number(p.openingBalance||0),createdAt:new Date().toISOString()};sm.set(x.id,x);await put('parties',x)}
  for(const p of (v1.purchases||[]))await put('purchases',{id:p.id||uuid(),no:p.no,date:p.date,supplierId:p.supplierId,qty:Number(p.qty||0),rate:Number(p.rate||0),extra:Number(p.extra||0),total:Number(p.total||0),paid:Number(p.paid||0),notes:p.notes||''});
  for(const s of (v1.sales||[]))await put('sales',{id:s.id||uuid(),invoice:s.invoice,date:s.date,customerId:s.customerId,qty:Number(s.qty||0),rate:Number(s.rate||0),discount:Number(s.discount||0),extra:Number(s.extra||0),total:Number(s.total||0),received:Number(s.received||0),notes:s.notes||''});
  for(const p of (v1.payments||[]))await put('payments',{id:p.id||uuid(),date:p.date,partyType:p.partyType,partyId:p.partyId,amount:Number(p.amount||0),mode:p.mode||'Cash',ref:p.ref||'',note:p.note||''});
  for(const [type,id] of [['sales','invoice'],['purchases','no']]){
    const arr=v1[type]||[];let max=0;for(const x of arr){const m=String(x[id]||'').match(/(\d+)$/);if(m)max=Math.max(max,Number(m[1]))}await put('settings',{id:type==='sales'?'counter_invoice':'counter_purchase',value:max+1})
  }
  localStorage.removeItem(V1_KEY);
}
async function counter(type){const id=type==='invoice'?'counter_invoice':'counter_purchase';const arr=state.cache.settings?.id===id?[state.cache.settings]:await getAll('settings');let row=arr.find(x=>x.id===id);if(!row)row={id,value:1};const n=Number(row.value||1);row.value=n+1;await put('settings',row);return `${state.cache.settings.invoicePrefix||'INV'}-${String(n).padStart(6,'0')}`}
function parties(){return state.cache.parties||[]}
function customers(){return parties().filter(x=>x.roles.includes('customer'))}
function suppliers(){return parties().filter(x=>x.roles.includes('supplier'))}
function party(id){return parties().find(x=>x.id===id)}
function customerBalance(id){const p=party(id);return Number(p?.openingBalance||0)+state.cache.sales.filter(x=>x.customerId===id).reduce((s,x)=>s+x.total,0)-state.cache.payments.filter(x=>x.partyType==='customer'&&x.partyId===id).reduce((s,x)=>s+x.amount,0)}
function supplierBalance(id){const p=party(id);return Number(p?.openingBalance||0)+state.cache.purchases.filter(x=>x.supplierId===id).reduce((s,x)=>s+x.total,0)-state.cache.payments.filter(x=>x.partyType==='supplier'&&x.partyId===id).reduce((s,x)=>s+x.amount,0)}
function purchaseAvgCost(){const ps=state.cache.purchases||[];const q=ps.reduce((s,x)=>s+x.qty,0), c=ps.reduce((s,x)=>s+x.total,0);return q?c/q:0}
function saleCost(s){return s.qty*purchaseAvgCost()}
function stock(){const o=state.cache.settings?.openingStock||0;const p=state.cache.purchases.reduce((s,x)=>s+x.qty,0);const sold=state.cache.sales.reduce((s,x)=>s+x.qty,0);const w=state.cache.wastage.reduce((s,x)=>s+x.qty,0);const a=state.cache.adjustments.reduce((s,x)=>s+x.qty,0);return {opening:Number(o),purchased:p,sold,wastage:w,adjustment:a,current:Number(o)+p-sold-w+a}}
function inRange(d,from,to){return d>=from&&d<=to}
function showScreen(name){document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active'));$('screen-'+name).classList.add('active');document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('active',x.dataset.screen===name));renderAll()}
function openModal(title,html){$('modalTitle').textContent=title;$('modalBody').innerHTML=html;$('modal').classList.add('open')}
function closeModal(){$('modal').classList.remove('open')}
$('closeModal').onclick=closeModal;$('modal').onclick=e=>{if(e.target.id==='modal')closeModal()};

document.querySelectorAll('.nav').forEach(n=>n.onclick=()=>showScreen(n.dataset.screen));
document.querySelectorAll('[data-screen]').forEach(b=>b.onclick=()=>showScreen(b.dataset.screen));
document.addEventListener('click',e=>{const a=e.target.closest('[data-action]');if(!a)return;const x=a.dataset.action;if(x==='sale')showSaleForm();if(x==='purchase')showPurchaseForm();if(x==='payment')showPaymentForm();if(x==='party')showPartyForm();if(x==='expense')showExpenseForm();if(x==='wastage')showWastageForm();if(x==='adjustment')showAdjustmentForm()});

document.querySelectorAll('[data-party-tab]').forEach(b=>b.onclick=()=>{state.partyTab=b.dataset.partyTab;document.querySelectorAll('[data-party-tab]').forEach(x=>x.classList.toggle('active',x.dataset.partyTab===state.partyTab));renderParties()});
document.querySelectorAll('[data-account-tab]').forEach(b=>b.onclick=()=>{state.accountTab=b.dataset.accountTab;document.querySelectorAll('[data-account-tab]').forEach(x=>x.classList.toggle('active',x.dataset.accountTab===state.accountTab));renderAccounts()});
$('salesSearch').oninput=renderSales;$('purchaseSearch').oninput=renderPurchases;$('partySearch').oninput=renderParties;$('runReportBtn').onclick=renderReport;$('backupBtn').onclick=backupJson;$('exportCsvBtn').onclick=exportCsv;$('statementAllBtn').onclick=exportStatementAll;$('moreBtn').onclick=showSettings;

function partyOptions(arr){return arr.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}
function showPartyForm(){openModal('Add Party',`<form class="form" id="partyForm"><div class="form-row"><label class="field">Type<select id="partyRole"><option value="customer">Customer</option><option value="supplier">Supplier</option><option value="both">Customer + Supplier</option></select></label><label class="field">Name<input id="partyName" required placeholder="SV"></label></div><div class="form-row"><label class="field">Mobile<input id="partyMobile" inputmode="tel"></label><label class="field">Opening Balance<input id="partyOpening" type="number" step="0.01" value="0"></label></div><label class="field">Address<input id="partyAddress"></label><div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="primary">Save</button></div></form>`);$('partyForm').onsubmit=async e=>{e.preventDefault();const role=$('partyRole').value;const roles=role==='both'?['customer','supplier']:[role];await put('parties',{id:uuid(),name:$('partyName').value.trim(),mobile:$('partyMobile').value.trim(),address:$('partyAddress').value.trim(),roles,openingBalance:Number($('partyOpening').value||0),createdAt:new Date().toISOString()});await loadAll();closeModal();renderAll()}}

function findLinkedPayment(type, source){
  const partyType=type==='purchase'?'supplier':'customer';
  const sourceNo=type==='purchase'?source.no:source.invoice;
  return state.cache.payments.find(x=>x.sourceType===type&&x.sourceId===source.id)
    || state.cache.payments.find(x=>x.partyType===partyType&&x.partyId===(type==='purchase'?source.supplierId:source.customerId)&&String(x.note||'')===(type==='purchase'?`Payment for ${sourceNo}`:`Receipt for ${sourceNo}`));
}

function showPurchaseForm(editId=null){
  if(!suppliers().length){alert('முதலில் ஒரு Supplier-ஐ Parties-ல் சேர்க்கவும்.');showScreen('parties');return}
  const editing=!!editId, item=editing?state.cache.purchases.find(x=>x.id===editId):null;
  if(editing&&!item)return;
  const title=editing?`Edit Purchase · ${item.no}`:'New Purchase';
  openModal(title,`<form class="form" id="purchaseForm">
    <div class="form-row"><label class="field">Date<input id="pDate" type="date" value="${item?.date||today()}"></label><label class="field">Supplier<select id="pSupplier" required>${partyOptions(suppliers())}</select></label></div>
    <div class="form-row"><label class="field">Quantity (kg)<input id="pQty" type="number" min="0.001" step="0.001" value="${item?.qty??1}"></label><label class="field">Rate / kg<input id="pRate" type="number" min="0" step="0.01" value="${item?.rate??0}"></label></div>
    <div class="form-row"><label class="field">Other Charges<input id="pExtra" type="number" min="0" step="0.01" value="${item?.extra??0}"></label><label class="field">Amount Paid<input id="pPaid" type="number" min="0" step="0.01" value="${item?.paid??0}"></label></div>
    <label class="field">Payment Mode<select id="pMode"><option>Cash</option><option>UPI</option><option>Bank</option><option>Credit</option></select></label>
    <div class="total-box"><span>Total Purchase</span><strong id="pTotal">₹0</strong></div>
    <label class="field">Notes<textarea id="pNotes" rows="2">${esc(item?.notes||'')}</textarea></label>
    <div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="primary">${editing?'Save Changes':'Save Purchase'}</button></div>
  </form>`);
  const supplierEl=$('pSupplier'); if(item) supplierEl.value=item.supplierId;
  const linked=findLinkedPayment('purchase',item||{}); if(linked)$('pMode').value=linked.mode||'Cash';
  const calc=()=>{$('pTotal').textContent=money(Number($('pQty').value||0)*Number($('pRate').value||0)+Number($('pExtra').value||0))};
  ['pQty','pRate','pExtra'].forEach(id=>$(id).oninput=calc);calc();
  $('purchaseForm').onsubmit=async e=>{
    e.preventDefault();
    const total=Number($('pQty').value||0)*Number($('pRate').value||0)+Number($('pExtra').value||0), paid=Math.min(Number($('pPaid').value||0),total), qtyVal=Number($('pQty').value||0);
    if(qtyVal<=0){alert('Quantity must be greater than 0.');return}
    if(editing){
      const oldItem={...item};
      const remainingStock=stock().current-oldItem.qty;
      if(remainingStock+qtyVal<0){alert('இந்த Purchase-ஐ இவ்வளவு quantity-க்கு மாற்ற முடியாது. Stock negative ஆகிவிடும்.');return}
      const p={...item,date:$('pDate').value,supplierId:$('pSupplier').value,qty:qtyVal,rate:Number($('pRate').value||0),extra:Number($('pExtra').value||0),total,paid,notes:$('pNotes').value.trim(),updatedAt:new Date().toISOString()};
      await put('purchases',p);
      const oldLinked=findLinkedPayment('purchase',oldItem);
      if(paid>0){
        const pay={...(oldLinked||{id:uuid()}),date:p.date,partyType:'supplier',partyId:p.supplierId,amount:paid,mode:$('pMode').value,ref:oldLinked?.ref||'',note:`Payment for ${p.no}`,sourceType:'purchase',sourceId:p.id};
        await put('payments',pay);
      } else if(oldLinked) await del('payments',oldLinked.id);
    }else{
      const p={id:uuid(),no:await counter('purchase'),date:$('pDate').value,supplierId:$('pSupplier').value,qty:qtyVal,rate:Number($('pRate').value||0),extra:Number($('pExtra').value||0),total,paid,notes:$('pNotes').value.trim(),createdAt:new Date().toISOString()};
      await put('purchases',p);
      if(paid)await put('payments',{id:uuid(),date:p.date,partyType:'supplier',partyId:p.supplierId,amount:paid,mode:$('pMode').value,ref:'',note:`Payment for ${p.no}`,sourceType:'purchase',sourceId:p.id});
    }
    await loadAll();closeModal();showScreen('purchase')
  }
}
window.showPurchaseForm=showPurchaseForm;

function showSaleForm(editId=null){
  if(!customers().length){alert('முதலில் ஒரு Customer-ஐ Parties-ல் சேர்க்கவும்.');showScreen('parties');return}
  const editing=!!editId, item=editing?state.cache.sales.find(x=>x.id===editId):null;
  if(editing&&!item)return;
  const title=editing?`Edit Sales Bill · ${item.invoice}`:'New Sales Bill';
  openModal(title,`<form class="form" id="saleForm">
    <div class="form-row"><label class="field">Date<input id="sDate" type="date" value="${item?.date||today()}"></label><label class="field">Customer<select id="sCustomer" required>${partyOptions(customers())}</select></label></div>
    <div class="form-row"><label class="field">Quantity (kg)<input id="sQty" type="number" min="0.001" step="0.001" value="${item?.qty??1}"></label><label class="field">Rate / kg<input id="sRate" type="number" min="0" step="0.01" value="${item?.rate??0}"></label></div>
    <div class="form-row"><label class="field">Discount<input id="sDisc" type="number" min="0" step="0.01" value="${item?.discount??0}"></label><label class="field">Other Charges<input id="sExtra" type="number" min="0" step="0.01" value="${item?.extra??0}"></label></div>
    <div class="total-box"><span>Bill Total</span><strong id="sTotal">₹0</strong></div>
    <div class="form-row"><label class="field">Received<input id="sReceived" type="number" min="0" step="0.01" value="${item?.received??0}"></label><label class="field">Payment Mode<select id="sMode"><option>Cash</option><option>UPI</option><option>Bank</option><option>Credit</option></select></label></div>
    <label class="field">Notes<textarea id="sNotes" rows="2">${esc(item?.notes||'')}</textarea></label>
    <div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="primary">${editing?'Save Changes':'Save & Bill'}</button></div>
  </form>`);
  const customerEl=$('sCustomer'); if(item) customerEl.value=item.customerId;
  const linked=findLinkedPayment('sale',item||{}); if(linked)$('sMode').value=linked.mode||'Cash';
  const calc=()=>{$('sTotal').textContent=money(Math.max(0,Number($('sQty').value||0)*Number($('sRate').value||0)-Number($('sDisc').value||0)+Number($('sExtra').value||0)))};
  ['sQty','sRate','sDisc','sExtra'].forEach(id=>$(id).oninput=calc);calc();
  $('saleForm').onsubmit=async e=>{
    e.preventDefault();
    const total=Math.max(0,Number($('sQty').value||0)*Number($('sRate').value||0)-Number($('sDisc').value||0)+Number($('sExtra').value||0)), received=Math.min(Number($('sReceived').value||0),total), qtyVal=Number($('sQty').value||0);
    if(qtyVal<=0){alert('Quantity must be greater than 0.');return}
    if(editing){
      const resultingStock=stock().current+item.qty-qtyVal;
      if(resultingStock< -0.0001){alert('இந்த Sales Bill-ஐ இவ்வளவு quantity-க்கு மாற்ற முடியாது. Stock negative ஆகிவிடும்.');return}
      const s={...item,date:$('sDate').value,customerId:$('sCustomer').value,qty:qtyVal,rate:Number($('sRate').value||0),discount:Number($('sDisc').value||0),extra:Number($('sExtra').value||0),total,received,notes:$('sNotes').value.trim(),updatedAt:new Date().toISOString()};
      await put('sales',s);
      const oldLinked=findLinkedPayment('sale',item);
      if(received>0){
        const pay={...(oldLinked||{id:uuid()}),date:s.date,partyType:'customer',partyId:s.customerId,amount:received,mode:$('sMode').value,ref:oldLinked?.ref||'',note:`Receipt for ${s.invoice}`,sourceType:'sale',sourceId:s.id};
        await put('payments',pay);
      } else if(oldLinked) await del('payments',oldLinked.id);
      await loadAll();closeModal();showBill(s.id)
    }else{
      const s={id:uuid(),invoice:await counter('invoice'),date:$('sDate').value,customerId:$('sCustomer').value,qty:qtyVal,rate:Number($('sRate').value||0),discount:Number($('sDisc').value||0),extra:Number($('sExtra').value||0),total,received,notes:$('sNotes').value.trim(),createdAt:new Date().toISOString()};
      await put('sales',s);
      if(received)await put('payments',{id:uuid(),date:s.date,partyType:'customer',partyId:s.customerId,amount:received,mode:$('sMode').value,ref:'',note:`Receipt for ${s.invoice}`,sourceType:'sale',sourceId:s.id});
      await loadAll();closeModal();showBill(s.id)
    }
  }
}
window.showSaleForm=showSaleForm;

async function deletePurchase(id){
  const p=state.cache.purchases.find(x=>x.id===id);if(!p)return;
  const remainingStock=stock().current-p.qty;
  if(remainingStock< -0.0001){alert('இந்த Purchase-ஐ delete செய்ய முடியாது. தற்போதைய stock-ல் இந்த purchase-ஐ நீக்கியால் stock negative ஆகிவிடும். முதலில் சம்பந்தப்பட்ட Sale/Wastage entries-ஐ சரிபார்க்கவும்.');return}
  if(!confirm(`${p.no} Purchase-ஐ delete செய்யவா?`))return;
  const linked=findLinkedPayment('purchase',p);if(linked)await del('payments',linked.id);
  await del('purchases',id);await loadAll();renderAll();
}
async function deleteSale(id){
  const s=state.cache.sales.find(x=>x.id===id);if(!s)return;
  if(!confirm(`${s.invoice} Sales Bill-ஐ delete செய்யவா?`))return;
  const linked=findLinkedPayment('sale',s);if(linked)await del('payments',linked.id);
  await del('sales',id);await loadAll();renderAll();
}
window.deletePurchase=deletePurchase;window.deleteSale=deleteSale;

function showPaymentForm(){openModal('Payment / Receipt',`<form class="form" id="payForm"><label class="field">Type<select id="payType"><option value="customer">Receive from Customer</option><option value="supplier">Pay Supplier</option></select></label><label class="field">Party<select id="payParty"></select></label><div class="form-row"><label class="field">Date<input id="payDate" type="date" value="${today()}"></label><label class="field">Amount<input id="payAmount" type="number" min="0.01" step="0.01" required></label></div><label class="field">Payment Mode<select id="payMode"><option>Cash</option><option>UPI</option><option>Bank</option></select></label><label class="field">Reference No<input id="payRef"></label><label class="field">Notes<textarea id="payNote" rows="2"></textarea></label><div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="primary">Save Payment</button></div></form>`);const fill=()=>{$('payParty').innerHTML=partyOptions($('payType').value==='customer'?customers():suppliers())};$('payType').onchange=fill;fill();$('payForm').onsubmit=async e=>{e.preventDefault();await put('payments',{id:uuid(),date:$('payDate').value,partyType:$('payType').value,partyId:$('payParty').value,amount:Number($('payAmount').value||0),mode:$('payMode').value,ref:$('payRef').value.trim(),note:$('payNote').value.trim()});await loadAll();closeModal();renderAll()}}

function showExpenseForm(){openModal('Add Expense',`<form class="form" id="expenseForm"><div class="form-row"><label class="field">Date<input id="eDate" type="date" value="${today()}"></label><label class="field">Category<select id="eCat"><option>Transport</option><option>Loading</option><option>Unloading</option><option>Packing</option><option>Labour</option><option>Market Charge</option><option>Other</option></select></label></div><div class="form-row"><label class="field">Amount<input id="eAmount" type="number" min="0.01" step="0.01" required></label><label class="field">Payment Mode<select id="eMode"><option>Cash</option><option>UPI</option><option>Bank</option></select></label></div><label class="field">Notes<textarea id="eNote" rows="2"></textarea></label><div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="primary">Save Expense</button></div></form>`);$('expenseForm').onsubmit=async e=>{e.preventDefault();await put('expenses',{id:uuid(),date:$('eDate').value,category:$('eCat').value,amount:Number($('eAmount').value||0),mode:$('eMode').value,note:$('eNote').value.trim()});await loadAll();closeModal();showScreen('accounts')}}
function showWastageForm(){openModal('Add Wastage',`<form class="form" id="wasteForm"><div class="form-row"><label class="field">Date<input id="wDate" type="date" value="${today()}"></label><label class="field">Quantity (kg)<input id="wQty" type="number" min="0.001" step="0.001" required></label></div><label class="field">Reason<select id="wReason"><option>Spoilage</option><option>Quality Reject</option><option>Damaged</option><option>Other</option></select></label><label class="field">Notes<textarea id="wNote" rows="2"></textarea></label><div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="primary">Save Wastage</button></div></form>`);$('wasteForm').onsubmit=async e=>{e.preventDefault();await put('wastage',{id:uuid(),date:$('wDate').value,qty:Number($('wQty').value||0),reason:$('wReason').value,note:$('wNote').value.trim()});await loadAll();closeModal();showScreen('stock')}}
function showAdjustmentForm(){openModal('Stock Adjustment',`<form class="form" id="adjForm"><div class="form-row"><label class="field">Date<input id="aDate" type="date" value="${today()}"></label><label class="field">Qty (kg)<input id="aQty" type="number" step="0.001" required></label></div><label class="field">Type<select id="aType"><option value="add">Add Stock</option><option value="remove">Remove Stock</option></select></label><label class="field">Reason<textarea id="aNote" rows="2"></textarea></label><div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="primary">Save Adjustment</button></div></form>`);$('adjForm').onsubmit=async e=>{e.preventDefault();let q=Number($('aQty').value||0);if($('aType').value==='remove')q=-q;await put('adjustments',{id:uuid(),date:$('aDate').value,qty:q,note:$('aNote').value.trim()});await loadAll();closeModal();showScreen('stock')}}

function showBill(id){
  const s=state.cache.sales.find(x=>x.id===id);if(!s)return;const c=party(s.customerId);
  openModal(`Invoice ${s.invoice}`,`<div class="bill" id="printBill"><h3>${esc(state.cache.settings.businessName)}</h3><div class="center-muted">${esc(state.cache.settings.phone||'')}</div><div class="center-muted">SALES BILL</div><div class="item-meta">Bill No: ${esc(s.invoice)} · ${fmtDate(s.date)}</div><div class="item-meta">Customer: <strong>${esc(c?.name||'-')}</strong>${c?.mobile?` · ${esc(c.mobile)}`:''}</div><table class="bill-table"><tr><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr><tr><td>Lemon</td><td>${s.qty} kg</td><td>${money(s.rate)}</td><td>${money(s.qty*s.rate)}</td></tr></table>${s.discount?`<div class="item"><span>Discount</span><span>${money(s.discount)}</span></div>`:''}${s.extra?`<div class="item"><span>Other</span><span>${money(s.extra)}</span></div>`:''}<div class="item"><strong>Total</strong><strong>${money(s.total)}</strong></div><div class="item"><span>Received</span><span>${money(s.received)}</span></div><div class="item"><strong>Balance</strong><strong>${money(s.total-s.received)}</strong></div><div class="center-muted">Thank You!</div></div><div class="form-actions"><button class="secondary" onclick="showSaleForm('${s.id}')">✏️ Edit</button><button class="danger-btn" onclick="deleteSale('${s.id}')">🗑 Delete</button></div><div class="form-actions"><button class="secondary" onclick="window.print()">🖨 Print / Save PDF</button><button class="primary" onclick="shareBill('${s.id}')">📤 Share</button></div>`)
}
window.showBill=showBill;

async function shareBill(id){const s=state.cache.sales.find(x=>x.id===id),c=party(s.customerId),text=`${state.cache.settings.businessName}\nBill: ${s.invoice}\nCustomer: ${c?.name||'-'}\nLemon: ${s.qty} kg × ${money(s.rate)}\nTotal: ${money(s.total)}\nReceived: ${money(s.received)}\nBalance: ${money(s.total-s.received)}`;if(navigator.share){try{await navigator.share({title:s.invoice,text})}catch(e){}}else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,'_blank')}
window.showBill=showBill;window.shareBill=shareBill;window.closeModal=closeModal;

function renderDashboard(){const t=today();$('todayLabel').textContent=fmtDate(t);const sales=state.cache.sales.filter(x=>x.date===t),pur=state.cache.purchases.filter(x=>x.date===t),exp=state.cache.expenses.filter(x=>x.date===t);$('statSales').textContent=money(sales.reduce((s,x)=>s+x.total,0));$('statPurchase').textContent=money(pur.reduce((s,x)=>s+x.total,0));$('statProfit').textContent=money(sales.reduce((s,x)=>s+x.total-saleCost(x),0));$('statReceivable').textContent=money(customers().reduce((s,p)=>s+customerBalance(p.id),0));$('statPayable').textContent=money(suppliers().reduce((s,p)=>s+supplierBalance(p.id),0));$('statStock').textContent=qty(stock().current);const tx=[...sales.map(x=>({date:x.date,name:party(x.customerId)?.name||'-',no:x.invoice,amount:x.total,type:'Sale'})),...pur.map(x=>({date:x.date,name:party(x.supplierId)?.name||'-',no:x.no,amount:x.total,type:'Purchase'})),...state.cache.payments.filter(x=>x.date===t).map(x=>({date:x.date,name:party(x.partyId)?.name||'-',no:'Payment',amount:x.amount,type:x.partyType==='customer'?'Receipt':'Supplier Payment'})),...exp.map(x=>({date:x.date,name:x.category,no:'Expense',amount:x.amount,type:'Expense'}))].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,8);$('recentList').innerHTML=tx.length?tx.map(x=>`<div class="item"><div class="item-main"><div class="item-title">${esc(x.name)}</div><div class="item-meta">${fmtDate(x.date)} · ${x.no}</div></div><div class="item-side"><div class="amount">${money(x.amount)}</div><div class="pill">${esc(x.type)}</div></div></div>`).join(''):'<div class="empty">No transactions yet</div>'}
function renderSales(){const q=($('salesSearch').value||'').toLowerCase();const a=[...state.cache.sales].reverse().filter(x=>`${x.invoice} ${party(x.customerId)?.name||''}`.toLowerCase().includes(q));$('salesList').innerHTML=a.length?a.map(x=>`<div class="item"><div class="item-main" onclick="showBill('${x.id}')"><div class="item-title">${esc(party(x.customerId)?.name||'-')}</div><div class="item-meta">${fmtDate(x.date)} · ${x.invoice} · ${qty(x.qty)}</div></div><div class="item-side"><div class="amount">${money(x.total)}</div><div class="${x.total-x.received>0?'negative':'positive'}">${x.total-x.received>0?`Due ${money(x.total-x.received)}`:'Paid'}</div><div class="action-pair"><button class="mini-btn" onclick="showSaleForm('${x.id}')">✏️ Edit</button><button class="mini-btn danger-mini" onclick="deleteSale('${x.id}')">🗑</button></div></div></div>`).join(''):'<div class="empty">No sales bills</div>'}
function renderPurchases(){const q=($('purchaseSearch').value||'').toLowerCase();const a=[...state.cache.purchases].reverse().filter(x=>`${x.no} ${party(x.supplierId)?.name||''}`.toLowerCase().includes(q));$('purchaseList').innerHTML=a.length?a.map(x=>`<div class="item"><div class="item-main"><div class="item-title">${esc(party(x.supplierId)?.name||'-')}</div><div class="item-meta">${fmtDate(x.date)} · ${x.no} · ${qty(x.qty)}</div></div><div class="item-side"><div class="amount">${money(x.total)}</div><div class="${supplierBalance(x.supplierId)>0?'negative':'positive'}">${x.total-x.paid>0?`Due ${money(x.total-x.paid)}`:'Paid'}</div><div class="action-pair"><button class="mini-btn" onclick="showPurchaseForm('${x.id}')">✏️ Edit</button><button class="mini-btn danger-mini" onclick="deletePurchase('${x.id}')">🗑</button></div></div></div>`).join(''):'<div class="empty">No purchases</div>'}
function renderParties(){
  const q=($('partySearch').value||'').toLowerCase();
  let a=parties().filter(x=>x.name.toLowerCase().includes(q));
  if(state.partyTab==='customer')a=a.filter(x=>x.roles.includes('customer'));
  if(state.partyTab==='supplier')a=a.filter(x=>x.roles.includes('supplier'));
  $('partyList').innerHTML=a.length?a.map(x=>{
    const isC=x.roles.includes('customer')&&!x.roles.includes('supplier');
    const bal=isC?customerBalance(x.id):supplierBalance(x.id);
    const label=x.roles.length>1?'Customer + Supplier':isC?'Customer':'Supplier';
    return `<div class="item party-item" onclick="showLedger('${x.id}')">
      <div class="item-main"><div class="item-title">${esc(x.name)}</div><div class="item-meta">${label}${x.mobile?` · ${esc(x.mobile)}`:''}</div></div>
      <div class="item-side"><div class="ledger-balance ${bal>0?'negative':'positive'}">${money(bal)}</div><div class="item-meta">${bal>0?(isC?'Receivable':'Payable'):'Settled'}</div><button class="mini-btn" onclick="event.stopPropagation();showLedger('${x.id}')">Statement</button></div>
    </div>`
  }).join(''):'<div class="empty">No parties. Add a customer or supplier.</div>';
}

function ledgerRows(partyId, role){
  const rows=[];
  if(role==='customer'){
    for(const s of state.cache.sales.filter(x=>x.customerId===partyId))rows.push({date:s.date,no:s.invoice,desc:'Sale',debit:Number(s.total||0),credit:0,note:s.notes||''});
    for(const r of state.cache.payments.filter(x=>x.partyType==='customer'&&x.partyId===partyId))rows.push({date:r.date,no:r.ref||'PAY',desc:'Receipt',debit:0,credit:Number(r.amount||0),note:r.note||r.mode||''});
  }else{
    for(const s of state.cache.purchases.filter(x=>x.supplierId===partyId))rows.push({date:s.date,no:s.no,desc:'Purchase',debit:Number(s.total||0),credit:0,note:s.notes||''});
    for(const r of state.cache.payments.filter(x=>x.partyType==='supplier'&&x.partyId===partyId))rows.push({date:r.date,no:r.ref||'PAY',desc:'Payment',debit:0,credit:Number(r.amount||0),note:r.note||r.mode||''});
  }
  rows.sort((a,b)=>a.date.localeCompare(b.date)||a.no.localeCompare(b.no));
  return rows;
}

function statementRole(p){
  if(p.roles.includes('customer')&&p.roles.includes('supplier'))return $('ledgerRole')?.value||'customer';
  return p.roles.includes('customer')?'customer':'supplier';
}

function renderLedgerPreview(id){
  const p=party(id); if(!p)return;
  const role=statementRole(p);
  const from=$('ledgerFrom')?.value||'';
  const to=$('ledgerTo')?.value||today();
  const all=ledgerRows(id,role);
  const effectiveFrom=from||all[0]?.date||today();
  const before=all.filter(r=>r.date<effectiveFrom);
  let opening=Number(p.openingBalance||0)+before.reduce((s,r)=>s+r.debit-r.credit,0);
  const rows=all.filter(r=>inRange(r.date,effectiveFrom,to));
  let running=opening,totalDebit=0,totalCredit=0;
  let html=`<div class="statement-paper" id="printStatement">
    <div class="statement-header">
      <div><h3>${esc(state.cache.settings.businessName||'LEMON TRADING')}</h3><div class="statement-sub">${esc(state.cache.settings.address||'')}</div><div class="statement-sub">${esc(state.cache.settings.phone||'')}</div></div>
      <div class="statement-title">ACCOUNT STATEMENT</div>
    </div>
    <div class="statement-party"><strong>${esc(p.name)}</strong><span>${role==='customer'?'Customer':'Supplier'}${p.mobile?` · ${esc(p.mobile)}`:''}</span></div>
    <div class="statement-period">Period: ${fmtDate(effectiveFrom)} to ${fmtDate(to)}</div>
    <table class="statement-table"><thead><tr><th>Date</th><th>Ref</th><th>Description</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>`;
  html+=`<tr class="opening-row"><td>${fmtDate(effectiveFrom)}</td><td>OPEN</td><td>Opening Balance</td><td></td><td></td><td>${money(opening)}</td></tr>`;
  for(const r of rows){running+=r.debit-r.credit;totalDebit+=r.debit;totalCredit+=r.credit;html+=`<tr><td>${fmtDate(r.date)}</td><td>${esc(r.no)}</td><td>${esc(r.desc)}${r.note?`<div class="statement-note">${esc(r.note)}</div>`:''}</td><td>${r.debit?money(r.debit):''}</td><td>${r.credit?money(r.credit):''}</td><td>${money(running)}</td></tr>`}
  html+=`</tbody><tfoot><tr><th colspan="3">Total</th><th>${money(totalDebit)}</th><th>${money(totalCredit)}</th><th>${money(running)}</th></tr></tfoot></table>
    <div class="statement-summary"><div><span>Opening</span><strong>${money(opening)}</strong></div><div><span>Debit</span><strong>${money(totalDebit)}</strong></div><div><span>Credit</span><strong>${money(totalCredit)}</strong></div><div><span>Closing</span><strong>${money(running)}</strong></div></div>
    <div class="statement-footer">Generated on ${fmtDate(today())} · This is a computer-generated statement.</div>
  </div>`;
  $('statementPreview').innerHTML=html;
}

async function showLedger(id){
  const p=party(id);if(!p)return;
  const all=ledgerRows(id,p.roles.includes('customer')?'customer':'supplier');
  const first=all[0]?.date||today();
  const roleOptions=p.roles.includes('customer')&&p.roles.includes('supplier')?`<label class="field">Account<select id="ledgerRole"><option value="customer">Customer Account</option><option value="supplier">Supplier Account</option></select></label>`:'';
  openModal(`${p.name} · Statement`,`<div class="form">
    ${roleOptions}
    <div class="form-row"><label class="field">From<input id="ledgerFrom" type="date" value="${first}"></label><label class="field">To<input id="ledgerTo" type="date" value="${today()}"></label></div>
    <div class="form-actions"><button class="secondary" id="ledgerApply">Apply</button><button class="primary" id="ledgerPrint">🖨 Print / Save PDF</button></div>
    <div class="form-actions"><button class="secondary" id="ledgerShare">📤 Share / WhatsApp</button><button class="secondary" id="ledgerClose">Close</button></div>
    <div id="statementPreview"></div>
  </div>`);
  if($('ledgerRole'))$('ledgerRole').onchange=()=>renderLedgerPreview(id);
  $('ledgerFrom').onchange=()=>renderLedgerPreview(id);
  $('ledgerTo').onchange=()=>renderLedgerPreview(id);
  $('ledgerApply').onclick=()=>renderLedgerPreview(id);
  $('ledgerPrint').onclick=()=>{renderLedgerPreview(id);setTimeout(()=>window.print(),50)};
  $('ledgerClose').onclick=closeModal;
  $('ledgerShare').onclick=()=>shareStatement(id);
  renderLedgerPreview(id);
}

async function shareStatement(id){
  const p=party(id);if(!p)return;
  const role=statementRole(p),from=$('ledgerFrom')?.value||ledgerRows(id,role)[0]?.date||today(),to=$('ledgerTo')?.value||today();
  const all=ledgerRows(id,role),before=all.filter(r=>r.date<from),rows=all.filter(r=>inRange(r.date,from,to));
  const opening=Number(p.openingBalance||0)+before.reduce((s,r)=>s+r.debit-r.credit,0);
  const debit=rows.reduce((s,r)=>s+r.debit,0),credit=rows.reduce((s,r)=>s+r.credit,0),closing=opening+debit-credit;
  const text=[`${state.cache.settings.businessName||'LEMON TRADING'}`,'Account Statement',`Party: ${p.name}`,`Type: ${role==='customer'?'Customer':'Supplier'}`,`Period: ${fmtDate(from)} - ${fmtDate(to)}`,`Opening: ${money(opening)}`,`Debit: ${money(debit)}`,`Credit: ${money(credit)}`,`Closing Balance: ${money(closing)}`].join('\n');
  if(navigator.share){try{await navigator.share({title:'Account Statement',text})}catch(e){}}
  else window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,'_blank');
}
window.showLedger=showLedger;window.shareStatement=shareStatement;
function renderStock(){const s=stock();$('stockOpening').textContent=qty(s.opening);$('stockPurchased').textContent=qty(s.purchased);$('stockSold').textContent=qty(s.sold);$('stockWastage').textContent=qty(s.wastage);$('stockAdjustment').textContent=qty(s.adjustment);$('stockCurrent').textContent=qty(s.current);const rows=[...state.cache.purchases.map(x=>({date:x.date,name:party(x.supplierId)?.name||'-',type:'Purchase',q:x.qty})),...state.cache.sales.map(x=>({date:x.date,name:party(x.customerId)?.name||'-',type:'Sale',q:-x.qty})),...state.cache.wastage.map(x=>({date:x.date,name:x.reason,type:'Wastage',q:-x.qty})),...state.cache.adjustments.map(x=>({date:x.date,name:x.note||'Adjustment',type:'Adjustment',q:x.qty}))].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,30);$('stockList').innerHTML=rows.length?rows.map(r=>`<div class="item"><div class="item-main"><div class="item-title">${esc(r.name)}</div><div class="item-meta">${fmtDate(r.date)} · ${r.type}</div></div><div class="item-side"><div class="${r.q>=0?'positive':'negative'}">${r.q>=0?'+':''}${qty(r.q)}</div></div></div>`).join(''):'<div class="empty">No stock movements</div>'}
function renderAccounts(){const el=$('accountsList');if(state.accountTab==='expenses'){const a=[...state.cache.expenses].reverse();el.innerHTML=a.length?a.map(x=>`<div class="item"><div class="item-main"><div class="item-title">${esc(x.category)}</div><div class="item-meta">${fmtDate(x.date)} · ${esc(x.mode)}${x.note?` · ${esc(x.note)}`:''}</div></div><div class="item-side"><div class="amount">${money(x.amount)}</div></div></div>`).join(''):'<div class="empty">No expenses</div>';return}const a=[...state.cache.payments].reverse();el.innerHTML=a.length?a.map(x=>`<div class="item"><div class="item-main"><div class="item-title">${esc(party(x.partyId)?.name||'-')}</div><div class="item-meta">${fmtDate(x.date)} · ${esc(x.mode)}${x.ref?` · ${esc(x.ref)}`:''}</div></div><div class="item-side"><div class="amount">${money(x.amount)}</div><div class="pill">${x.partyType==='customer'?'Received':'Paid'}</div></div></div>`).join(''):'<div class="empty">No payments</div>'}
function renderReport(){const from=$('fromDate').value||today(),to=$('toDate').value||today(),sales=state.cache.sales.filter(x=>inRange(x.date,from,to)),pur=state.cache.purchases.filter(x=>inRange(x.date,from,to)),exp=state.cache.expenses.filter(x=>inRange(x.date,from,to)),w=state.cache.wastage.filter(x=>inRange(x.date,from,to));const st=sales.reduce((s,x)=>s+x.total,0),pt=pur.reduce((s,x)=>s+x.total,0),gp=sales.reduce((s,x)=>s+x.total-saleCost(x),0),ex=exp.reduce((s,x)=>s+x.amount,0);$('repSales').textContent=money(st);$('repPurchase').textContent=money(pt);$('repProfit').textContent=money(gp);$('repSalesQty').textContent=qty(sales.reduce((s,x)=>s+x.qty,0));$('repPurchaseQty').textContent=qty(pur.reduce((s,x)=>s+x.qty,0));$('repWastage').textContent=qty(w.reduce((s,x)=>s+x.qty,0));$('repExpenses').textContent=money(ex);$('repNetProfit').textContent=money(gp-ex);const a=parties().map(p=>{const isC=p.roles.includes('customer');const bal=isC?customerBalance(p.id):supplierBalance(p.id);return {p,bal,isC}}).filter(x=>Math.abs(x.bal)>.001);$('outstandingList').innerHTML=a.length?a.sort((x,y)=>Math.abs(y.bal)-Math.abs(x.bal)).map(x=>`<div class="item" onclick="showLedger('${x.p.id}')"><div class="item-main"><div class="item-title">${esc(x.p.name)}</div><div class="item-meta">${x.isC?'Customer':'Supplier'}</div></div><div class="item-side"><div class="${x.bal>0?'negative':'positive'}">${money(x.bal)}</div></div></div>`).join(''):'<div class="empty">No outstanding balances</div>'}
function renderAll(){renderDashboard();renderSales();renderPurchases();renderParties();renderStock();renderAccounts();renderReport()}

function csv(rows){const escv=v=>`"${String(v??'').replace(/"/g,'""')}"`;return rows.map(r=>r.map(escv).join(',')).join('\n')}
function downloadText(name,text,type='text/csv'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function exportCsv(){const rows=[['Type','Date','Number','Party','Quantity kg','Rate','Amount','Paid/Received','Balance']];for(const s of state.cache.sales)rows.push(['Sale',s.date,s.invoice,party(s.customerId)?.name||'',s.qty,s.rate,s.total,s.received,s.total-s.received]);for(const p of state.cache.purchases)rows.push(['Purchase',p.date,p.no,party(p.supplierId)?.name||'',p.qty,p.rate,p.total,p.paid,p.total-p.paid]);for(const p of state.cache.payments)rows.push(['Payment',p.date,'PAY',party(p.partyId)?.name||'', '', '',p.amount,p.amount,'']);downloadText(`lemon-transactions-${today()}.csv`,csv(rows))}
function exportStatementAll(){const rows=[['Party','Type','Balance']];for(const p of parties()){if(p.roles.includes('customer'))rows.push([p.name,'Customer',customerBalance(p.id)]);else rows.push([p.name,'Supplier',supplierBalance(p.id)])}downloadText(`lemon-outstanding-${today()}.csv`,csv(rows))}
async function backupJson(){await loadAll();const payload={version:2,exportedAt:new Date().toISOString(),stores:{}};for(const s of STORES)payload.stores[s]=state.cache[s];downloadText(`lemon-billing-backup-v2-${today()}.json`,JSON.stringify(payload,null,2),'application/json')}
async function restoreBackup(file){const text=await file.text();const data=JSON.parse(text);if(data.version!==2)throw new Error('Only V2 backup is supported');if(!confirm('Current app data will be replaced by this backup. Continue?'))return;for(const s of STORES)await clearStore(s);for(const s of STORES)for(const row of (data.stores[s]||[]))await put(s,row);await loadAll();closeModal();renderAll();alert('Backup restored successfully.')}
function showSettings(){openModal('Settings & Data',`<div class="form"><label class="field">Business Name<input id="setName" value="${esc(state.cache.settings.businessName||'LEMON TRADING')}"></label><label class="field">Phone<input id="setPhone" value="${esc(state.cache.settings.phone||'')}"></label><label class="field">Address<input id="setAddress" value="${esc(state.cache.settings.address||'')}"></label><label class="field">Opening Stock (kg)<input id="setOpeningStock" type="number" step="0.001" value="${Number(state.cache.settings.openingStock||0)}"></label><div class="form-actions"><button class="secondary" id="saveSettings">Save Settings</button><button class="primary" id="restoreBtn">Restore Backup</button></div><input type="file" id="restoreFile" accept="application/json" hidden><div class="card"><div class="item"><div class="item-main"><div class="item-title">Data storage</div><div class="item-meta">IndexedDB · local-first · works offline after PWA cache</div></div></div><button class="secondary" id="clearAllBtn">Clear all data</button></div></div>`);$('saveSettings').onclick=async()=>{state.cache.settings.businessName=$('setName').value.trim()||'LEMON TRADING';state.cache.settings.phone=$('setPhone').value.trim();state.cache.settings.address=$('setAddress').value.trim();state.cache.settings.openingStock=Number($('setOpeningStock').value||0);await put('settings',state.cache.settings);await loadAll();closeModal();renderAll();};$('restoreBtn').onclick=()=>$('restoreFile').click();$('restoreFile').onchange=async e=>{if(e.target.files[0]){try{await restoreBackup(e.target.files[0])}catch(err){alert('Restore failed: '+err.message)}}};$('clearAllBtn').onclick=async()=>{if(confirm('All V2 data will be deleted. Continue?')){for(const s of STORES)await clearStore(s);await seedIfEmpty();await loadAll();closeModal();renderAll()}}}

$('fromDate').value=today();$('toDate').value=today();
(async function init(){await seedIfEmpty();await loadAll();$('brandName').textContent='🍋 '+(state.cache.settings.businessName||'LEMON TRADING');renderAll()})();
