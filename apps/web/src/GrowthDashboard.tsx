import { useState, type ChangeEvent } from "react";
import { analyzeAdsCsv, analyzeSearchConsoleCsv, GROWTH_MAX_CSV_BYTES, type AdsReport, type SeoReport } from "./growth-analytics";
import "./GrowthDashboard.css";

type Panel = "seo" | "ads" | "ai";
const metric = (value:number)=>new Intl.NumberFormat("fr-FR",{maximumFractionDigits:2}).format(value);
const money = (value:number,unit:string)=>metric(value)+(unit ? " "+unit : " (devise à vérifier)");
function Mark({name}:{name:"analytics"|"seo"|"ads"|"ai"}) {
 const paths={analytics:"M4 20V10 M10 20V4 M16 20v-7 M22 20V8",seo:"M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm6-2 5 5",ads:"M3 11l16-7v16L3 14v-3ZM3 11v3m4 2 2 5h4l-3-6",ai:"M12 3v3m0 12v3M3 12h3m12 0h3M7 7l2 2m6 6 2 2M17 7l-2 2m-6 6-2 2"};
 return <svg className="ida-growth-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;
}
function Metric({title,value,detail}:{title:string;value:string;detail:string}){
 return <div className="ida-growth-metric"><span>{title}</span><strong>{value}</strong><small>{detail}</small></div>;
}
export default function GrowthDashboard(){
 const [tab,setTab]=useState<Panel>("seo");
 const [seo,setSeo]=useState<SeoReport|null>(null);
 const [ads,setAds]=useState<AdsReport|null>(null);
 const [error,setError]=useState("");
 const [maxCpc,setMaxCpc]=useState("");
 const [maxCpl,setMaxCpl]=useState("");
 const [adsRawCurrency,setAdsRawCurrency]=useState("");
 const [loading,setLoading]=useState(false);
 const [lastName,setLastName]=useState("");
 async function onImport(event:ChangeEvent<HTMLInputElement>){
  const f=event.target.files?.[0];event.target.value="";
  if(!f)return;
  setError("");setLastName("");if(tab==="seo")setSeo(null);if(tab==="ads")setAds(null);setLoading(true);
  try{
   if(f.size>GROWTH_MAX_CSV_BYTES)throw new Error("Export trop volumineux : limite 2 Mo.");
   if(!/\.csv$/i.test(f.name))throw new Error("Choisis un export au format CSV.");
   const value=await f.text();
   if(tab==="seo")setSeo(analyzeSearchConsoleCsv(value));
   else if(tab==="ads")setAds(analyzeAdsCsv(value,{maxCpc:Number(maxCpc.replace(",","."))||undefined,maxCostPerLead:Number(maxCpl.replace(",","."))||undefined,currency:adsRawCurrency.trim()||undefined}));
   setLastName(f.name.slice(0,90));
  }catch(e){setError(e instanceof Error?e.message:"Impossible d'analyser le fichier.");}
  finally{setLoading(false);}
 }
 const select=(value:Panel)=>{setTab(value);setError("");setLastName("");};
 const tabs:[Panel,string,"seo"|"ads"|"ai"][]=[["seo","Référencement","seo"],["ads","Publicités","ads"],["ai","Visibilité IA","ai"]];
 return <div className="ida-growth-root">
  <header className="ida-growth-hero">
   <div className="ida-growth-orbit" aria-hidden="true"><i/><i/><i/></div>
   <div className="ida-growth-headline"><p className="ida-growth-eyebrow"><span/> IDA / GROWTH LAB · V1</p>
    <h2>Développer la visibilité.<br/><em>Garder le contrôle.</em></h2>
    <p>Analyse SEO et publicitaire locale, sans abonnement ni publication automatique. Les recommandations reposent uniquement sur tes propres exports, jamais sur des chiffres inventés.</p>
   </div>
   <div className="ida-growth-privacy"><span>DONNÉES LOCALES</span><strong>Lecture seule</strong><small>Aucun envoi depuis ce module</small></div>
  </header>
  <nav className="ida-growth-tabs" aria-label="Catégories Growth">
   {tabs.map(([id,name,icon])=><button key={id} type="button" className={tab===id?"is-selected":""} aria-current={tab===id?"page":undefined} onClick={()=>select(id)}><Mark name={icon}/>{name}</button>)}
  </nav>
  {tab==="seo"&&<section className="ida-growth-workspace" aria-labelledby="ida-growth-seo-heading">
   <div className="ida-growth-section-head"><div><p className="ida-growth-kicker">01 / SEARCH CONSOLE</p><h3 id="ida-growth-seo-heading">Trouver les recherches qui comptent.</h3><p>Importe « Requêtes » depuis Google Search Console (CSV). Analyse locale des clics, impressions, CTR et positions.</p></div><span className="ida-growth-state">AUCUNE CONNEXION LIVE</span></div>
   <label className="ida-growth-upload"><span className="ida-growth-upload-icon"><Mark name="seo"/></span><span><strong>{loading?"Lecture du fichier…":"Importer des recherches CSV"}</strong><small>Export Search Console · 2 Mo maximum · non enregistré</small></span><input aria-label="Importer les requêtes Google Search Console au format CSV" type="file" accept=".csv,text/csv" disabled={loading} onChange={onImport}/></label>
   {seo?<><div className="ida-growth-metrics"><Metric title="Clics exportés" value={metric(seo.clicks)} detail="Sur les lignes disponibles"/><Metric title="Impressions exportées" value={metric(seo.impressions)} detail="Sur les lignes disponibles"/><Metric title="CTR calculé" value={metric(seo.ctr)+" %"} detail="Clics / impressions"/><Metric title="Pistes prioritaires" value={String(seo.opportunities.length)} detail="Maximum 25 affichées"/></div>
    <div className="ida-growth-subheading"><h4>Opportunités à examiner</h4><small>{seo.totalRows} lignes valides · {seo.missingRows} ignorées</small></div>
    {seo.opportunities.length?<div className="ida-growth-results">{seo.opportunities.map((row,i)=><article key={row.query+"-"+i} className="ida-growth-result"><div><span className={"ida-growth-priority "+(row.priority==="HIGH"?"strong":"")}>{row.priority==="HIGH"?"PRIORITÉ FORTE":"À ÉTUDIER"}</span><h5>{row.query}</h5><p>{row.reason}</p></div><div className="ida-growth-numbers"><span>{metric(row.impressions)} impressions</span><span>{metric(row.clicks)} clics</span><span>Position {metric(row.position)}</span></div></article>)}</div>:<p className="ida-growth-empty">Aucune requête ne dépasse les critères indicatifs de détection dans cet export. Cela ne signifie pas qu'aucune amélioration SEO n'est possible.</p>}
    <p className="ida-growth-disclaimer">Attention : Search Console masque certaines requêtes. Les sommes des lignes exportées ne représentent pas nécessairement les totaux du site. Aucun résultat SEO n'est garanti.</p>
   </>:<p className="ida-growth-empty">Aucun export importé. Les statistiques restent volontairement vides tant que tu n'as pas fourni tes données.</p>}
  </section>}
  {tab==="ads"&&<section className="ida-growth-workspace" aria-labelledby="ida-growth-ads-heading">
   <div className="ida-growth-section-head"><div><p className="ida-growth-kicker">02 / META OU GOOGLE ADS</p><h3 id="ida-growth-ads-heading">Repérer les dépenses à surveiller.</h3><p>Lecture d'exports de campagnes. Une alerte est une proposition d'analyse, jamais une interruption automatique de publicité.</p></div><span className="ida-growth-state">AUCUNE DÉPENSE AUTORISÉE</span></div>
   <div className="ida-growth-thresholds">
    <label>Coût par clic maximum <small>(facultatif)</small><input value={maxCpc} onChange={e=>{setMaxCpc(e.target.value);setAds(null)}} inputMode="decimal" placeholder="ex. 1,50" type="text"/></label>
    <label>Coût par prospect visé <small>(facultatif)</small><input value={maxCpl} onChange={e=>{setMaxCpl(e.target.value);setAds(null)}} inputMode="decimal" placeholder="ex. 20" type="text"/></label>
    <label>Devise du compte <small>(facultatif)</small><input value={adsRawCurrency} onChange={e=>{setAdsRawCurrency(e.target.value.slice(0,4));setAds(null)}} placeholder="€ / $"/></label>
   </div>
   <p className="ida-growth-disclaimer">Un changement de seuil efface les résultats précédents : réimporte le CSV pour recalculer les alertes.</p><label className="ida-growth-upload"><span className="ida-growth-upload-icon"><Mark name="ads"/></span><span><strong>{loading?"Lecture du fichier…":"Importer les campagnes CSV"}</strong><small>Export Meta Ads / Google Ads · une devise par fichier · sans synchronisation</small></span><input aria-label="Importer un export publicitaire au format CSV" type="file" accept=".csv,text/csv" disabled={loading} onChange={onImport}/></label>
   {ads?<><div className="ida-growth-metrics"><Metric title="Dépenses exportées" value={money(ads.spend,ads.currency)} detail="Période de l'export non vérifiée"/><Metric title="Clics exportés" value={metric(ads.clicks)} detail="Si la colonne existe"/><Metric title="Prospects" value={ads.leads===null?"Inconnus":metric(ads.leads)} detail={ads.leadColumnDetected?"Colonne Leads explicite":"« Results » n'est pas un prospect"}/><Metric title="Alertes à vérifier" value={String(ads.alerts.length)} detail="Aucune campagne modifiée"/></div>
    <div className="ida-growth-subheading"><h4>Campagnes à revoir</h4><small>{ads.totalCampaigns} lignes valides · {ads.missingRows} ignorées</small></div>
    {ads.alerts.length?<div className="ida-growth-results">{ads.alerts.map((row,i)=><article className="ida-growth-result" key={row.campaign+"-"+i}><div><span className="ida-growth-priority">{row.severity==="REVIEW"?"REVOIR LE BUDGET":"SURVEILLER"}</span><h5>{row.campaign}</h5><p>{row.reason}</p></div><div className="ida-growth-numbers"><span>{money(row.spend,ads.currency)}</span><span>{metric(row.clicks)} clics</span><span>{row.leads===null?"Prospects inconnus":metric(row.leads)+" prospects"}</span></div></article>)}</div>:<p className="ida-growth-empty">Aucune alerte selon les colonnes présentes et les plafonds indiqués. Cela ne valide pas la rentabilité de la campagne.</p>}
    <p className="ida-growth-disclaimer">Les résultats Meta Ads ne sont pas toujours des prospects : seules les colonnes explicitement intitulées « Leads » sont comptées. Ce module ne peut ni lancer, ni modifier, ni arrêter une publicité.</p>
   </>:<p className="ida-growth-empty">Aucune donnée importée. Aucun euro de dépense ni conversion ne sera inventé.</p>}
  </section>}
  {tab==="ai"&&<section className="ida-growth-workspace" aria-labelledby="ida-growth-ai-heading"><div className="ida-growth-section-head"><div><p className="ida-growth-kicker">03 / RECOMMANDATIONS IA</p><h3 id="ida-growth-ai-heading">Mesurer sans prétendre tout voir.</h3><p>Un jour, ce volet comparera des requêtes échantillonnées, les réponses observées et leurs sources, en distinguant les mentions organiques des publicités.</p></div><span className="ida-growth-state">À CONNECTER</span></div>
   <div className="ida-growth-metrics"><Metric title="Moteurs connectés" value="—" detail="Aucun connecteur live"/><Metric title="Mentions mesurées" value="—" detail="Aucun échantillon observé"/><Metric title="Position moyenne" value="—" detail="Non mesurable actuellement"/><Metric title="Dépenses API" value="0" detail="Aucun appel de ce module"/></div>
   <p className="ida-growth-empty">Aucun suivi automatique n'est activé. Une capture ponctuelle ne représente pas ce que toutes les personnes voient dans ChatGPT, Gemini ou d'autres assistants.</p>
  </section>}
  {error&&<p className="ida-growth-error" role="alert">{error}</p>}
  {lastName&&!error&&<p className="ida-growth-file" role="status">Fichier analysé localement : {lastName}. Aucune copie enregistrée.</p>}
  <footer className="ida-growth-footer"><p><strong>IDA APPROVAL FIRST.</strong> Aucune campagne lancée, aucun budget changé, aucun achat de lien ou publication sans ton accord explicite.</p><p>Version de démonstration locale • import ponctuel, sans conservation ni connexion serveur.</p></footer>
 </div>;
}
