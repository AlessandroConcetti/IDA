import {describe,expect,it} from "vitest";
import {analyzeAdsCsv,analyzeSearchConsoleCsv} from "./growth-analytics";

describe("IDA GROWTH — safe local-only SEO analysis",()=>{
 it("accepts French BOM, semicolons, percentages, quoted values and prioritizes verified impressions",()=>{
  const csv='\uFEFFRequêtes les plus fréquentes;Clics;Impressions;CTR;Position\n"création de sites Marseille";2;1200;0,17%;8,2\n"agence web, Marseille";8;80;10%;7\n';
  const report=analyzeSearchConsoleCsv(csv);
  expect(report.clicks).toBe(10);
  expect(report.impressions).toBe(1280);
  expect(report.opportunities).toHaveLength(1);
  expect(report.opportunities[0]?.query).toBe("création de sites Marseille");
  expect(report.opportunities[0]?.priority).toBe("HIGH");
 });
 it("does not invent results or ignore invalid rows silently",()=>{
  const r=analyzeSearchConsoleCsv("Query,Clicks,Impressions,Position\ninvalid,25,10,1\nvalid,0,90,18\n");
  expect(r.missingRows).toBe(1);expect(r.totalRows).toBe(1);expect(r.opportunities).toHaveLength(1);
  expect(r.ctr).toBe(0);
 });
 it("does not accept incomplete files or giant exports",()=>{
  expect(()=>analyzeSearchConsoleCsv('Query,Clicks\na,1')).toThrow(/Colonne manquante/);
  expect(()=>analyzeSearchConsoleCsv('')).toThrow(/CSV vide/);
  expect(()=>analyzeSearchConsoleCsv("a".repeat(2_000_001))).toThrow(/volumineux/);
 });
});
describe("IDA GROWTH — ads import must never mistake Results for leads",()=>{
 it("detects wasted clicks and only counts a dedicated Leads column",()=>{
  const csv='Campaign name,Amount spent (EUR),Link clicks,Impressions,Results\nCampaign A,35,0,500,100\nCampaign B,120,100,1500,22\n';
  const r=analyzeAdsCsv(csv,{maxCpc:1});
  expect(r.spend).toBe(155);expect(r.leads).toBeNull();expect(r.leadColumnDetected).toBe(false);
  expect(r.alerts).toHaveLength(2);
  expect(r.alerts[0]?.reason).toContain("sans clics");
  expect(r.alerts[1]?.reason).toContain("supérieur au plafond");
 });
 it("uses explicit Leads and handles localized EUR amounts",()=>{
  const csv='Nom de la campagne;Montant dépensé (EUR);Clics sur un lien;Leads\n"Artisans; Marseille";"1 234,50";50;2\n';
  const r=analyzeAdsCsv(csv,{maxCostPerLead:50});
  expect(r.spend).toBe(1234.5);expect(r.leads).toBe(2);
  expect(r.alerts[0]?.costPerLead).toBe(617.25);
 });
 it("flags exceeding the user's cap for the period without pausing anything",()=>{
  const r=analyzeAdsCsv("Campaign,Spend\\nLocal leads,42\\n",{maxCampaignSpend:30});
  expect(r.alerts).toHaveLength(1);
  expect(r.alerts[0]?.reason).toContain("plafond défini");
 });
 it("never infers leads or ROI when missing",()=>{
  const r=analyzeAdsCsv("Campaign,Spend\nNo leads exported,10\n");
  expect(r.leads).toBeNull();expect(r.alerts).toEqual([]);
 });
});
