/** IDA GROWTH v1 — local-only importers. No network, payment, scraping or external writes. */
export const GROWTH_MAX_CSV_BYTES = 2_000_000;
const MAX_ROWS = 20_000;
const normalize = (value: string) => value.toLocaleLowerCase("fr-FR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const finite = (n: number) => Number.isFinite(n) && n >= 0 ? n : null;
function number(raw: string | undefined): number | null {
  if (!raw || !raw.trim()) return null;
  let x=raw.replace(/[\u00a0\u202f\s€$£%]/g,"").trim();
  if (!x || !/^[+\-]?[\d.,]+$/.test(x)) return null;
  const comma=x.lastIndexOf(","), dot=x.lastIndexOf(".");
  if(comma!==-1 && dot!==-1){x=x.replace(comma>dot?/\./g:/,/g,""); x=x.replace(comma>dot?",":".",".");}
  else if(comma!==-1){x=x.replace(/,/g,".");}
  else if((x.match(/\./g)||[]).length>1){const p=x.lastIndexOf(".");x=x.slice(0,p).replace(/\./g,"")+x.slice(p);}
  return finite(Number(x));
}
function table(csv:string):string[][]{
 if(csv.length>GROWTH_MAX_CSV_BYTES)throw new Error("Fichier trop volumineux (maximum 2 Mo).");
 const first=csv.replace(/^\uFEFF/,"");const line=first.split(/\r?\n/,1)[0]||"";
 const delimiter=[",",";","\t"].sort((a,b)=>line.split(b).length-line.split(a).length)[0]||",";
 const rows:string[][]=[];let row:string[]=[],cell="",quote=false;
 for(let i=0;i<first.length;i++){
  const ch=first[i];
  if(ch==='"'){if(quote&&first[i+1]==='"'){cell+='"';i++;}else if(cell.trim()===""||quote){quote=!quote;}else cell+=ch;}
  else if(!quote&&ch===delimiter){row.push(cell.trim());cell="";}
  else if(!quote&&(ch==="\n"||ch==="\r")){
   if(ch==="\r"&&first[i+1]==="\n")i++;
   row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell="";
   if(rows.length>MAX_ROWS+1)throw new Error("Export trop volumineux (20 000 lignes maximum).");
  }else cell+=ch;
 }
 if(quote)throw new Error("CSV incomplet : une chaîne entre guillemets n'est pas fermée.");
 row.push(cell.trim());if(row.some(Boolean))rows.push(row);
 if(rows.length<2)throw new Error("CSV vide ou sans données.");
 if(rows.length>MAX_ROWS+1)throw new Error("Export trop volumineux (20 000 lignes maximum).");
 return rows;
}
function rowsFor(csv:string){const [headers,...body]=table(csv);if(!headers)throw new Error("En-têtes absents.");return {headers:headers.map(normalize),rows:body};}
function col(headers:string[],labels:string[],required=true):number {
 const keys=labels.map(normalize);
 const i=headers.findIndex(h=>keys.includes(h));
 if(i===-1&&required)throw new Error("Colonne manquante : "+labels[0]+". Vérifie l'export CSV.");
 return i;
}
export interface SeoOpportunity {query:string;clicks:number;impressions:number;ctr:number;position:number;priority:"HIGH"|"MEDIUM";reason:string}
export interface SeoReport {totalRows:number;clicks:number;impressions:number;ctr:number;opportunities:SeoOpportunity[];missingRows:number}
export function analyzeSearchConsoleCsv(csv:string):SeoReport{
 const {headers,rows}=rowsFor(csv);
 const qi=col(headers,["Requêtes les plus fréquentes","Requête","Requêtes","Query","Top queries","Search query"]);
 const ci=col(headers,["Clics","Clicks"]);const ii=col(headers,["Impressions"]);
 const pi=col(headers,["Position","Average position"]);const ti=col(headers,["CTR","CTR moyen","Average CTR"],false);
 let clicks=0,impressions=0,missingRows=0;const opportunities:SeoOpportunity[]=[];
 for(const r of rows){
  const query=(r[qi]||"").trim().slice(0,160);
  const c=number(r[ci]),i=number(r[ii]),p=number(r[pi]),t=ti>=0?number(r[ti]):null;
  if(!query||c===null||i===null||p===null||c>i){missingRows++;continue;}
  clicks+=c;impressions+=i;const ctr=i===0?0:c/i*100;
  const percent=t!==null?(t<=1&&r[ti]?.includes("%")===false?t*100:t):ctr;
  if(i>=30&&p>=3&&p<=25&&ctr<3){
   const priority=i>=150&&p<=15?"HIGH":"MEDIUM";
   opportunities.push({query,clicks:c,impressions:i,ctr:Number(ctr.toFixed(2)),position:Number(p.toFixed(1)),priority,reason:priority==="HIGH"?"Impressions élevées, peu de clics : vérifier l'intention et le titre.":"Potentiel SEO : revoir contenu et métadonnées."});
  }
  // percent is parsed to ensure optional column syntax, but never used to override the verifiable click/impression ratio
  void percent;
 }
 opportunities.sort((a,b)=>(a.priority===b.priority?b.impressions-a.impressions:a.priority==="HIGH"?-1:1));
 return {totalRows:rows.length-missingRows,clicks,impressions,ctr:impressions?Number((clicks/impressions*100).toFixed(2)):0,opportunities:opportunities.slice(0,25),missingRows};
}
export interface AdAlert {campaign:string;spend:number;clicks:number;impressions:number;leads:number|null;costPerLead:number|null;clickCost:number|null;reason:string;severity:"WATCH"|"REVIEW"}
export interface AdsReport {totalCampaigns:number;spend:number;clicks:number;impressions:number;leads:number|null;leadColumnDetected:boolean;alerts:AdAlert[];missingRows:number;currency:string}
export function analyzeAdsCsv(csv:string,opts:{maxCpc?:number;maxCostPerLead?:number;currency?:string}={}):AdsReport {
 const {headers,rows}=rowsFor(csv);
 const ni=col(headers,["Campaign name","Nom de la campagne","Campaign","Campagne"]);
 const si=col(headers,["Amount spent (EUR)","Montant dépensé (EUR)","Amount spent","Montant dépensé","Coût","Cost","Spend","Dépenses"]);
 const ci=col(headers,["Link clicks","Clics sur un lien","Clicks","Clics"],false);
 const ii=col(headers,["Impressions"],false);
 // "Results" may mean visits, impressions or purchases: never count it as leads.
 const li=col(headers,["Leads","Prospects","Leads (form)","Leads generated","Conversions (leads)"],false);
 let spend=0,clicks=0,impressions=0,leads=0,missingRows=0;
 const alerts:AdAlert[]=[];
 const maxCpc=opts.maxCpc&&opts.maxCpc>0?opts.maxCpc:null;
 const maxCpl=opts.maxCostPerLead&&opts.maxCostPerLead>0?opts.maxCostPerLead:null;
 for(const row of rows){
  const name=(row[ni]||"").trim().slice(0,130),money=number(row[si]);
  if(!name||money===null){missingRows++;continue;}
  const c=ci<0?null:number(row[ci]),im=ii<0?null:number(row[ii]),l=li<0?null:number(row[li]);
  spend+=money;clicks+=c||0;impressions+=im||0;leads+=l||0;
  const cpc=c&&c>0?money/c:null,cpl=l&&l>0?money/l:null;
  const reasons:string[]=[];
  if(money>0&&c===0&&ci>=0)reasons.push("Dépenses sans clics sur un lien.");
  if(money>0&&l===0&&li>=0)reasons.push("Dépenses sans prospect enregistré.");
  if(maxCpc!==null&&cpc!==null&&cpc>maxCpc)reasons.push("Coût par clic supérieur au plafond indicatif.");
  if(maxCpl!==null&&cpl!==null&&cpl>maxCpl)reasons.push("Coût par prospect supérieur à l'objectif indicatif.");
  if(reasons.length)alerts.push({campaign:name,spend:Number(money.toFixed(2)),clicks:c||0,impressions:im||0,leads:l,clickCost:cpc?Number(cpc.toFixed(2)):null,costPerLead:cpl?Number(cpl.toFixed(2)):null,reason:reasons.join(" "),severity:money>=30?"REVIEW":"WATCH"});
 }
 alerts.sort((a,b)=>b.spend-a.spend);
 return {totalCampaigns:rows.length-missingRows,spend:Number(spend.toFixed(2)),clicks,impressions,leads:li>=0?leads:null,leadColumnDetected:li>=0,alerts:alerts.slice(0,25),missingRows,currency:(opts.currency||"€").slice(0,4)};
}
