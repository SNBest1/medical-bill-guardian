import { afterEach, describe, expect, it, vi } from "vitest";
import { CaseStore } from "../../lib/db";
import { patientChat } from "./patient-chat";
import { handlePatientCommand } from "./patient-command";
import { MockBankProvider } from "../banking/mock";
import { MockMedicalRecordProvider } from "../medical/mock";
import { MockCommunicationProvider } from "../communications/mock";
import { createCase } from "./orchestrator";
import { scenarios } from "../scenarios";
const providers = () => ({ bank: (id: string) => new MockBankProvider(id), medical: new MockMedicalRecordProvider(), communications: new MockCommunicationProvider(Number.POSITIVE_INFINITY) });
afterEach(() => vi.unstubAllEnvs());
function active(store: CaseStore) {
 const scenario=scenarios.find(s=>s.id==='morgan-wellness')!;
 const c=createCase(scenario.transaction);c.scenarioId=scenario.id;c.status='REQUESTING_BILL';store.create(c);store.selectPatient(scenario.id);store.attachActiveCase(c);return c;
}
const send = async () => 'reply';
describe('conversational patient chat',()=>{
 it('asks which account without starting a case, then answers a named balance',async()=>{
  const store=new CaseStore(':memory:');
  expect((await patientChat(store,'what is my balance?')).text).toContain('Whose account');
  const answer=await patientChat(store,'check Morgan balance');expect(answer.text).toContain('$3,411.58');expect(answer.text).toContain('Nessie is not connected');expect(store.list()).toHaveLength(0);store.close();
 });
 it('a name answering a bank clarification never starts an investigation',async()=>{
  const store=new CaseStore(':memory:');const opts={conversational:true,replyEnabled:false,patientPhone:'+15555550100',chat:{apiKey:''}};
  await handlePatientCommand(store,{messageId:'q',text:'what is my balance?'},providers(),opts);
  expect((await handlePatientCommand(store,{messageId:'a',text:'Morgan'},providers(),opts)).kind).toBe('chat');
  expect(store.recentPatientChat().at(-1)?.text).toContain('$3,411.58');expect(store.list()).toHaveLength(0);store.close();
 });
 it('uses contextual account selection for bank follow-ups',async()=>{
  const store=new CaseStore(':memory:');store.rememberPatientChat('a',{role:'assistant',text:'Morgan balance',scenarioId:'morgan-wellness'});
  const answer=await patientChat(store,'show my transaction history');expect(answer.scenarioId).toBe('morgan-wellness');expect(answer.text).toContain('Groceries');store.close();
 });
 it('reads Nessie without substituting its raw $15k or counting a pending refund',async()=>{
  vi.stubEnv('NESSIE_SANDBOX_DISCOVERY','true');const store=new CaseStore(':memory:');active(store);
  const bankHistory=vi.fn(async()=>({balance:1098,reportedBalance:15000,pendingRefund:310,charged:1102,refund:0,entries:[]})) as never;
  const answer=await patientChat(store,'what is my Nessie balance?',{bankHistory});expect(answer.text).toContain('$1,098.00');expect(answer.text).not.toContain('15,000');expect(answer.text).toContain('pending');
  const unavailable=await patientChat(store,'balance?',{bankHistory:async()=>{throw Error('offline');}});expect(unavailable.text).toContain("can't confirm");store.close();
 });
 it('sends conversation history to an action-free model and rejects invented amounts/action claims',async()=>{
  const store=new CaseStore(':memory:');store.rememberPatientChat('a',{role:'user',text:'I like pasta'});store.rememberPatientChat('a',{role:'assistant',text:'What kind?'});
  const fetcher=vi.fn(async()=>Response.json({output:[{content:[{type:'output_text',text:'Try tomato pasta with basil.'}]}]})) as unknown as typeof fetch;
  const answer=await patientChat(store,'suggest dinner',{apiKey:'test',fetcher});expect(answer.text).toContain('pasta');
  const body=JSON.parse(String(vi.mocked(fetcher).mock.calls[0][1]?.body));expect(body.tools).toBeUndefined();expect(body.store).toBe(false);expect(body.input[0].content).toBe('I like pasta');
  for(const text of ['You have $15,000.','I have called the hospital.']){const bad=async()=>Response.json({output:[{content:[{type:'output_text',text}]}]});expect((await patientChat(store,'hello',{apiKey:'test',fetcher:bad})).text).toContain("can't verify");}store.close();
 });
 it('does not treat a patient mention or balance question as an investigation; dedupes chat replies',async()=>{
  const store=new CaseStore(':memory:');let sent=0;const opts={conversational:true,replyEnabled:true,patientPhone:'+15555550100',send:async()=>{sent++;return 'reply';},chat:{apiKey:''}};
  for(const [messageId,text] of [['a','check Morgan balance'],['b','hello Morgan']]) expect((await handlePatientCommand(store,{messageId,text},providers(),opts)).kind).toBe('chat');
  expect((await handlePatientCommand(store,{messageId:'b',text:'hello Morgan'},providers(),opts)).kind).toBe('duplicate');expect(sent).toBe(2);expect(store.list()).toHaveLength(0);expect(store.recentPatientChat()).toHaveLength(4);store.close();
 });
 it('a casual yes after chat cannot authorize a pending call until the proposal is restated',async()=>{
  const store=new CaseStore(':memory:');const c=active(store);store.rememberPatientChat('a',{role:'assistant',text:'Enjoy your dinner!'});
  const opts={conversational:true,replyEnabled:false,patientPhone:'+15555550100',send};
  expect((await handlePatientCommand(store,{messageId:'b',text:'yes'},providers(),opts)).kind).toBe('status');expect(store.get(c.id)?.status).toBe('REQUESTING_BILL');expect(store.recentPatientChat().at(-1)?.approvalGate).toBe('REQUESTING_BILL');
  expect((await handlePatientCommand(store,{messageId:'c',text:'yes, request the itemized bill'},providers(),opts)).kind).toBe('approved');expect(store.get(c.id)?.status).toBe('WAITING_FOR_BILL');store.close();
 });
 it('retains only twenty turns and never logs duplicate roles',()=>{
  const store=new CaseStore(':memory:');for(let i=0;i<25;i++)store.rememberPatientChat(String(i),{role:'user',text:String(i)});store.rememberPatientChat('24',{role:'user',text:'duplicate'});expect(store.recentPatientChat()).toHaveLength(20);expect(store.recentPatientChat().at(-1)?.text).toBe('24');store.close();
 });
});
