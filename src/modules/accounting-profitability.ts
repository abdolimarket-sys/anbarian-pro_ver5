/** تحلیل حاشیه سود بر پایه بهای تمام‌شده ثبت‌شده در گردش انبار (فقط‌خواندنی). */
import { loadCommerceData, type CommerceData } from './accounting-commerce';
import { loadInventoryCostData, type InventoryCostData } from './inventory-costing';
import { loadAccountingData, type AccountingData } from './accounting';

export interface ProfitabilityRow { key:string; name:string; quantityMilli:number; revenueRial:number; costRial:number; grossProfitRial:number; marginPercent:number; provisional:boolean; }
export interface ProfitabilityDashboard { salesRial:number; costedSalesRial:number; cogsRial:number; grossProfitRial:number; marginPercent:number; uncostedRevenueRial:number; provisionalRevenueRial:number; products:ProfitabilityRow[]; customers:ProfitabilityRow[]; }
const safe=(n:number)=>Number.isFinite(n)&&n>=0;
export function buildProfitabilityDashboard(c:CommerceData,cost:InventoryCostData):ProfitabilityDashboard {
 const productMap=new Map<string,ProfitabilityRow>(), customerMap=new Map<string,ProfitabilityRow>();
 let salesRial=0,costedSalesRial=0,cogsRial=0,uncostedRevenueRial=0,provisionalRevenueRial=0;
 for(const invoice of c.invoices){
  if(invoice.status!=='posted'||invoice.type!=='sale')continue;
  const movements=cost.movements.filter(m=>m.sourceDocumentId===invoice.id&&m.type==='sale');
  for(const line of invoice.lines){
   const revenue=Math.max(0,Number(line.totalRial)||0);salesRial+=revenue;
   if(!line.productId){uncostedRevenueRial+=revenue;continue;}
   const movement=movements.find(m=>m.productId===line.productId);
   if(!movement){uncostedRevenueRial+=revenue;continue;}
   if(movement.provisional){provisionalRevenueRial+=revenue;continue;}
   const quantity=Math.max(0,Number(line.quantityMilli)||0), costRial=Math.max(0,Number(movement.totalCostRial)||0);
   costedSalesRial+=revenue;cogsRial+=costRial;
   const p=productMap.get(line.productId)||{key:line.productId,name:line.description||line.productId,quantityMilli:0,revenueRial:0,costRial:0,grossProfitRial:0,marginPercent:0,provisional:false};
   p.quantityMilli+=quantity;p.revenueRial+=revenue;p.costRial+=costRial;p.grossProfitRial=p.revenueRial-p.costRial;productMap.set(line.productId,p);
   const partyName=c.parties.find(x=>x.id===invoice.partyId)?.name||'—';
   const q=customerMap.get(invoice.partyId)||{key:invoice.partyId,name:partyName,quantityMilli:0,revenueRial:0,costRial:0,grossProfitRial:0,marginPercent:0,provisional:false};
   q.quantityMilli+=quantity;q.revenueRial+=revenue;q.costRial+=costRial;q.grossProfitRial=q.revenueRial-q.costRial;customerMap.set(invoice.partyId,q);
  }
 }
 const finish=(rows:Map<string,ProfitabilityRow>)=>[...rows.values()].map(r=>({...r,marginPercent:r.revenueRial?r.grossProfitRial/r.revenueRial*100:0})).sort((a,b)=>b.grossProfitRial-a.grossProfitRial);
 const products=finish(productMap),customers=finish(customerMap),grossProfitRial=costedSalesRial-cogsRial;
 return{salesRial,costedSalesRial,cogsRial,grossProfitRial,marginPercent:costedSalesRial?grossProfitRial/costedSalesRial*100:0,uncostedRevenueRial,provisionalRevenueRial,products,customers};
}
export interface ProfitabilityFilter { fiscalPeriodId?:string; fromDate?:string; toDate?:string; }
const inRange=(date:string,f:ProfitabilityFilter)=>{const d=String(date||'').replace(/[^0-9]/g,'');const from=String(f.fromDate||'').replace(/[^0-9]/g,'');const to=String(f.toDate||'').replace(/[^0-9]/g,'');return (!from||d>=from)&&(!to||d<=to);};
export async function getProfitabilityDashboard(filter:ProfitabilityFilter={}):Promise<ProfitabilityDashboard>{const [c,cost]=await Promise.all([loadCommerceData(),loadInventoryCostData()]);const invoices=c.invoices.filter(x=>(!filter.fiscalPeriodId||x.fiscalPeriodId===filter.fiscalPeriodId)&&inRange(x.date,filter));const ids=new Set(invoices.map(x=>x.id));return buildProfitabilityDashboard({...c,invoices}, {...cost,movements:cost.movements.filter(x=>ids.has(x.sourceDocumentId))});}

/** تخصیص تحلیلی هزینه‌های ثبت‌شده به فروش؛ بدون ایجاد یا تغییر سند حسابداری. */
export interface ExpenseAllocationRow { key:string; name:string; revenueRial:number; allocatedExpenseRial:number; adjustedProfitRial:number; adjustedMarginPercent:number; }
export interface ExpenseAdjustedProfitability {
 totalPostedExpensesRial:number; allocatedExpensesRial:number; unallocatedExpensesRial:number;
 expenseAccounts:Array<{code:string;title:string;amountRial:number}>;
 products:ExpenseAllocationRow[]; customers:ExpenseAllocationRow[];
 adjustedProfitRial:number; adjustedMarginPercent:number;
}
export function buildExpenseAdjustedProfitability(p:ProfitabilityDashboard,a:AccountingData):ExpenseAdjustedProfitability {
 const accountMap=new Map(a.accounts.map(x=>[x.id,x]));
 const expenseMap=new Map<string,{code:string;title:string;amountRial:number}>();
 for(const entry of a.journalEntries){
  if(entry.status!=='posted')continue;
  for(const line of entry.lines){
   const account=accountMap.get(line.accountId);
   const code=line.accountCodeSnapshot||account?.code||'';
   if(!code.startsWith('6'))continue;
   const title=line.accountTitleSnapshot||account?.title||'هزینه ثبت‌شده';
   const row=expenseMap.get(line.accountId)||{code,title,amountRial:0};
   row.amountRial+=Number(line.debitRial||0)-Number(line.creditRial||0);
   expenseMap.set(line.accountId,row);
  }
 }
 const expenseAccounts=[...expenseMap.values()].filter(x=>x.amountRial!==0).sort((x,y)=>x.code.localeCompare(y.code,'en'));
 const totalPostedExpensesRial=expenseAccounts.reduce((s,x)=>s+x.amountRial,0);
 const allocatable=Math.max(0,totalPostedExpensesRial);
 const allocatedExpensesRial=p.costedSalesRial>0?allocatable:0;
 const allocate=(rows:ProfitabilityRow[]):ExpenseAllocationRow[]=>{
  let assigned=0;
  return rows.map((r,i)=>{
   const share=p.costedSalesRial>0?r.revenueRial/p.costedSalesRial:0;
   const expense=i===rows.length-1?Math.max(0,allocatedExpensesRial-assigned):Math.round(allocatedExpensesRial*share);
   assigned+=expense;
   const adjustedProfitRial=r.grossProfitRial-expense;
   return{key:r.key,name:r.name,revenueRial:r.revenueRial,allocatedExpenseRial:expense,adjustedProfitRial,adjustedMarginPercent:r.revenueRial?adjustedProfitRial/r.revenueRial*100:0};
  });
 };
 const products=allocate(p.products),customers=allocate(p.customers);
 const adjustedProfitRial=p.grossProfitRial-allocatedExpensesRial;
 return{totalPostedExpensesRial,allocatedExpensesRial,unallocatedExpensesRial:Math.max(0,totalPostedExpensesRial-allocatedExpensesRial),expenseAccounts,products,customers,adjustedProfitRial,adjustedMarginPercent:p.costedSalesRial?adjustedProfitRial/p.costedSalesRial*100:0};
}
export async function getExpenseAdjustedProfitability(base?:ProfitabilityDashboard,filter:ProfitabilityFilter={}):Promise<ExpenseAdjustedProfitability>{
 const [p,a]=await Promise.all([base?Promise.resolve(base):getProfitabilityDashboard(filter),loadAccountingData()]);
 const journalEntries=a.journalEntries.filter(x=>(!filter.fiscalPeriodId||x.fiscalPeriodId===filter.fiscalPeriodId)&&inRange(x.date,filter));
 return buildExpenseAdjustedProfitability(p,{...a,journalEntries});
}


/** مقایسه سودآوری به تفکیک سال مالی؛ هر دوره فقط با اسناد قطعی همان دوره محاسبه می‌شود. */
export interface ProfitabilityPeriodRow {
 periodId:string; periodTitle:string; startDate:string; endDate:string;
 salesRial:number; costedSalesRial:number; cogsRial:number; grossProfitRial:number;
 postedExpensesRial:number; adjustedProfitRial:number; marginPercent:number; uncostedRevenueRial:number;
}
export function buildProfitabilityPeriodComparison(c:CommerceData,cost:InventoryCostData,a:AccountingData):ProfitabilityPeriodRow[]{
 return a.fiscalPeriods.map(period=>{
  const invoices=c.invoices.filter(x=>x.fiscalPeriodId===period.id);
  const ids=new Set(invoices.map(x=>x.id));
  const periodCommerce={...c,invoices};
  const periodCost={...cost,movements:cost.movements.filter(x=>ids.has(x.sourceDocumentId))};
  const periodAccounting={...a,journalEntries:a.journalEntries.filter(x=>x.fiscalPeriodId===period.id)};
  const profit=buildProfitabilityDashboard(periodCommerce,periodCost);
  const adjusted=buildExpenseAdjustedProfitability(profit,periodAccounting);
  return {periodId:period.id,periodTitle:period.title,startDate:period.startDate,endDate:period.endDate,
   salesRial:profit.salesRial,costedSalesRial:profit.costedSalesRial,cogsRial:profit.cogsRial,grossProfitRial:profit.grossProfitRial,
   postedExpensesRial:adjusted.totalPostedExpensesRial,adjustedProfitRial:adjusted.adjustedProfitRial,
   marginPercent:profit.marginPercent,uncostedRevenueRial:profit.uncostedRevenueRial+profit.provisionalRevenueRial};
 }).sort((x,y)=>x.startDate.localeCompare(y.startDate));
}
export async function getProfitabilityPeriodComparison(filter:ProfitabilityFilter={}):Promise<ProfitabilityPeriodRow[]>{
 const [c,cost,a]=await Promise.all([loadCommerceData(),loadInventoryCostData(),loadAccountingData()]);
 const selected=filter.fiscalPeriodId?a.fiscalPeriods.filter(x=>x.id===filter.fiscalPeriodId):a.fiscalPeriods;
 return buildProfitabilityPeriodComparison(c,cost,a).filter(x=>(!filter.fiscalPeriodId||x.periodId===filter.fiscalPeriodId)&&(!filter.fromDate||x.endDate>=filter.fromDate)&&(!filter.toDate||x.startDate<=filter.toDate));
}

/** روند ماهانه فروش، سود ناخالص و هزینه قطعی؛ فقط برای ماه‌های دارای سند. */
export interface ProfitabilityTrendRow { month:string; salesRial:number; grossProfitRial:number; expensesRial:number; adjustedProfitRial:number; }
const latinDate=(value:string)=>String(value||'').replace(/[۰-۹٠-٩]/g,ch=>{const fa='۰۱۲۳۴۵۶۷۸۹',ar='٠١٢٣٤٥٦٧٨٩';const i=fa.indexOf(ch);return String(i>=0?i:ar.indexOf(ch));}).replace(/[^0-9]/g,'');
export function buildMonthlyProfitabilityTrend(c:CommerceData,cost:InventoryCostData,a:AccountingData,filter:ProfitabilityFilter={}):ProfitabilityTrendRow[]{
 const months=new Set<string>();
 for(const invoice of c.invoices){if(invoice.status==='posted'&&invoice.type==='sale'&&(!filter.fiscalPeriodId||invoice.fiscalPeriodId===filter.fiscalPeriodId)&&inRange(invoice.date,filter)){const d=latinDate(invoice.date);if(d.length>=6)months.add(`${d.slice(0,4)}/${d.slice(4,6)}`);}}
 for(const entry of a.journalEntries){if(entry.status==='posted'&&(!filter.fiscalPeriodId||entry.fiscalPeriodId===filter.fiscalPeriodId)&&inRange(entry.date,filter)){const d=latinDate(entry.date);if(d.length>=6)months.add(`${d.slice(0,4)}/${d.slice(4,6)}`);}}
 return [...months].sort().map(month=>{
  const inMonth=(date:string)=>latinDate(date).slice(0,6)===month.replace('/','');
  const invoices=c.invoices.filter(x=>x.status==='posted'&&x.type==='sale'&&(!filter.fiscalPeriodId||x.fiscalPeriodId===filter.fiscalPeriodId)&&inMonth(x.date)&&inRange(x.date,filter));
  const ids=new Set(invoices.map(x=>x.id));
  const profit=buildProfitabilityDashboard({...c,invoices},{...cost,movements:cost.movements.filter(x=>ids.has(x.sourceDocumentId))});
  const journalEntries=a.journalEntries.filter(x=>x.status==='posted'&&(!filter.fiscalPeriodId||x.fiscalPeriodId===filter.fiscalPeriodId)&&inMonth(x.date)&&inRange(x.date,filter));
  const expense=buildExpenseAdjustedProfitability(profit,{...a,journalEntries});
  return{month,salesRial:profit.salesRial,grossProfitRial:profit.grossProfitRial,expensesRial:expense.totalPostedExpensesRial,adjustedProfitRial:expense.adjustedProfitRial};
 });
}
export async function getMonthlyProfitabilityTrend(filter:ProfitabilityFilter={}):Promise<ProfitabilityTrendRow[]>{const [c,cost,a]=await Promise.all([loadCommerceData(),loadInventoryCostData(),loadAccountingData()]);return buildMonthlyProfitabilityTrend(c,cost,a,filter);}
