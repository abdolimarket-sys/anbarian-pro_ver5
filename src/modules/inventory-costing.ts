/** موتور بهای تمام‌شده و اتصال گردش فاکتور به موجودی */
import { idbGet, idbPut } from './storage';
import type { AccountingSettings } from './accounting';

export interface CostLayer { id:string; productId:string; warehouse:string; qtyMilli:number; unitCostRial:number; date:string; sourceDocumentId:string; }
export interface CostBalance { productId:string; warehouse:string; qtyMilli:number; valueRial:number; averageUnitCostRial:number; }
export interface StockMovement { id:string; sourceDocumentId:string; productId:string; warehouse:string; type:'purchase'|'sale'; qtyMilli:number; unitCostRial:number; totalCostRial:number; beforeQtyMilli:number; afterQtyMilli:number; date:string; provisional:boolean; }
export interface InventoryCostData { schemaVersion:1; layers:CostLayer[]; balances:CostBalance[]; movements:StockMovement[]; }
const KEY='accounting_phase23_costing', BACKUP='accounting_phase23_costing_backup';
const id=(p:string)=>`${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
const safe=(n:number)=>Number.isSafeInteger(n)&&n>=0;
export const emptyInventoryCostData=():InventoryCostData=>({schemaVersion:1,layers:[],balances:[],movements:[]});
export async function loadInventoryCostData():Promise<InventoryCostData>{
  for(const key of [KEY,BACKUP])try{const x=await idbGet<InventoryCostData>(key);if(x?.schemaVersion===1&&Array.isArray(x.layers)&&Array.isArray(x.balances)&&Array.isArray(x.movements))return x;}catch(e){console.warn('costing read failed',e)}
  return emptyInventoryCostData();
}
export async function saveInventoryCostData(x:InventoryCostData):Promise<void>{if(x.schemaVersion!==1)throw new Error('ساختار بهای تمام‌شده معتبر نیست.');await idbPut(BACKUP,x);await idbPut(KEY,x)}
export function seedOpeningStock(data:InventoryCostData,productId:string,warehouse:string,qtyMilli:number):void{if(!data.balances.some(x=>x.productId===productId&&x.warehouse===warehouse)&&qtyMilli>0)throw new Error('برای موجودی اول دوره، ابتدا بهای واحد موجودی را در بخش «ارزش‌گذاری موجودی اولیه» ثبت کنید.');}
export function setOpeningStockCost(data:InventoryCostData,input:{productId:string;warehouse:string;qtyMilli:number;unitCostRial:number;date:string}):InventoryCostData{if(!safe(input.qtyMilli)||input.qtyMilli<=0||!safe(input.unitCostRial)||input.unitCostRial<=0)throw new Error('تعداد و بهای واحد موجودی اولیه باید بیشتر از صفر باشد.');if(data.movements.some(m=>m.productId===input.productId&&m.warehouse===input.warehouse))throw new Error('برای این کالا گردش ثبت شده؛ ارزش‌گذاری اولیه پس از شروع گردش مجاز نیست.');if(data.balances.some(b=>b.productId===input.productId&&b.warehouse===input.warehouse))throw new Error('موجودی اولیه این کالا قبلاً ارزش‌گذاری شده است.');const value=Math.round(input.qtyMilli*input.unitCostRial/1000);setBalance(data,{productId:input.productId,warehouse:input.warehouse,qtyMilli:input.qtyMilli,valueRial:value,averageUnitCostRial:input.unitCostRial});data.layers.push({id:id('opening'),productId:input.productId,warehouse:input.warehouse,qtyMilli:input.qtyMilli,unitCostRial:input.unitCostRial,date:input.date,sourceDocumentId:`opening:${input.productId}:${input.warehouse}`});return data;}
export function getCostBalance(data:InventoryCostData,productId:string,warehouse:string):CostBalance{return data.balances.find(x=>x.productId===productId&&x.warehouse===warehouse)||{productId,warehouse,qtyMilli:0,valueRial:0,averageUnitCostRial:0}}
function setBalance(data:InventoryCostData,b:CostBalance){const i=data.balances.findIndex(x=>x.productId===b.productId&&x.warehouse===b.warehouse);if(i<0)data.balances.push(b);else data.balances[i]=b}
/** خرید: ثبت لایه FIFO و به‌روزرسانی میانگین متحرک؛ مبالغ ریال صحیح‌اند. */
export function receiveStock(data:InventoryCostData,input:{productId:string;warehouse:string;qtyMilli:number;unitCostRial:number;date:string;sourceDocumentId:string}):{data:InventoryCostData;totalCostRial:number;inventoryValueRial:number;negativeOffsetCostRial:number}{
  if(!safe(input.qtyMilli)||input.qtyMilli<=0||!safe(input.unitCostRial))throw new Error('مقدار یا بهای خرید نامعتبر است.');
  if(data.movements.some(m=>m.sourceDocumentId===input.sourceDocumentId&&m.productId===input.productId)){const old=data.movements.find(m=>m.sourceDocumentId===input.sourceDocumentId&&m.productId===input.productId)!;return {data,totalCostRial:old.totalCostRial,inventoryValueRial:old.totalCostRial,negativeOffsetCostRial:0};}
  const total=Math.round(input.qtyMilli*input.unitCostRial/1000);const b=getCostBalance(data,input.productId,input.warehouse);const nextQty=b.qtyMilli+input.qtyMilli;
  // رسید ابتدا کسری منفی قبلی را پوشش می‌دهد؛ فقط بخش باقی‌مانده دارایی موجودی می‌شود.
  const offsetQty=Math.min(input.qtyMilli,Math.max(0,-b.qtyMilli));const remainingQty=input.qtyMilli-offsetQty;const negativeOffsetCostRial=Math.round(offsetQty*input.unitCostRial/1000);const inventoryValueRial=Math.round(remainingQty*input.unitCostRial/1000);const nextValue=(b.qtyMilli<0?inventoryValueRial:Math.max(0,b.valueRial)+total);setBalance(data,{...b,qtyMilli:nextQty,valueRial:nextValue,averageUnitCostRial:nextQty>0?Math.round(nextValue*1000/nextQty):0});
  if(remainingQty>0)data.layers.push({id:id('layer'),productId:input.productId,warehouse:input.warehouse,qtyMilli:remainingQty,unitCostRial:input.unitCostRial,date:input.date,sourceDocumentId:input.sourceDocumentId});
  data.movements.push({id:id('move'),sourceDocumentId:input.sourceDocumentId,productId:input.productId,warehouse:input.warehouse,type:'purchase',qtyMilli:input.qtyMilli,unitCostRial:input.unitCostRial,totalCostRial:total,beforeQtyMilli:b.qtyMilli,afterQtyMilli:nextQty,date:input.date,provisional:false});return {data,totalCostRial:total,inventoryValueRial,negativeOffsetCostRial};
}
/** فروش: مصرف FIFO یا میانگین متحرک؛ کسری فقط با تنظیم همان انبار مجاز است. */
export function issueStock(data:InventoryCostData,input:{productId:string;warehouse:string;qtyMilli:number;date:string;sourceDocumentId:string;method:AccountingSettings['defaultCostingMethod'];allowNegative:boolean}):{data:InventoryCostData;totalCostRial:number;provisional:boolean}{
  if(!safe(input.qtyMilli)||input.qtyMilli<=0)throw new Error('مقدار خروج نامعتبر است.');
  if(data.movements.some(m=>m.sourceDocumentId===input.sourceDocumentId&&m.productId===input.productId)){const m=data.movements.find(m=>m.sourceDocumentId===input.sourceDocumentId&&m.productId===input.productId)!;return {data,totalCostRial:m.totalCostRial,provisional:m.provisional};}
  const b=getCostBalance(data,input.productId,input.warehouse);if(!input.allowNegative&&b.qtyMilli<input.qtyMilli)throw new Error(`موجودی کافی نیست: ${input.productId} در ${input.warehouse}.`);
  let remaining=input.qtyMilli,total=0;const provisional=b.qtyMilli<input.qtyMilli;
  if(input.method==='fifo'){
    const layers=data.layers.filter(l=>l.productId===input.productId&&l.warehouse===input.warehouse&&l.qtyMilli>0).sort((a,b)=>a.date.localeCompare(b.date));
    for(const layer of layers){if(!remaining)break;const take=Math.min(remaining,layer.qtyMilli);total+=Math.round(take*layer.unitCostRial/1000);layer.qtyMilli-=take;remaining-=take;}
    // کسری منفی با بهای موقت صفر ثبت می‌شود؛ خرید بعدی هزینه واقعی کسری را به بهای تمام‌شده منتقل می‌کند.
  }else total=Math.round(Math.min(input.qtyMilli,Math.max(0,b.qtyMilli))*b.averageUnitCostRial/1000);
  const nextQty=b.qtyMilli-input.qtyMilli;const nextValue=Math.max(0,b.valueRial-total);setBalance(data,{...b,qtyMilli:nextQty,valueRial:nextValue,averageUnitCostRial:nextQty>0?Math.round(nextValue*1000/nextQty):b.averageUnitCostRial});
  data.movements.push({id:id('move'),sourceDocumentId:input.sourceDocumentId,productId:input.productId,warehouse:input.warehouse,type:'sale',qtyMilli:input.qtyMilli,unitCostRial:input.qtyMilli?Math.round(total*1000/input.qtyMilli):0,totalCostRial:total,beforeQtyMilli:b.qtyMilli,afterQtyMilli:nextQty,date:input.date,provisional});return {data,totalCostRial:total,provisional};
}
