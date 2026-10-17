import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshot,units,validAddress,bscTokens} from '../chain.mjs';
const address='0x1111111111111111111111111111111111111111';
test('exact decimal conversion never uses floating point',()=>{
 assert.equal(units('1000000000000000001',18),'1.000000000000000001');
 assert.equal(units('1',8),'0.00000001');
 assert.throws(()=>units('-1',18));
});
test('network syntax rejects URLs, zero addresses and cross-network formats',()=>{
 assert.equal(validAddress('bsc',address),true);
 for(const value of ['https://evil.test','0x'+'0'.repeat(40),address+'?x=y']) assert.equal(validAddress('bsc',value),false);
 assert.equal(validAddress('bitcoin',address),false);
 assert.equal(validAddress('unknown',address),false);
});
test('fixed read-only EVM calls pin chain and block and separate bridged tokens',async()=>{
 const calls=[];
 const fetcher=async(url,init)=>{
  assert.equal(url,'https://bsc-dataseed.bnbchain.org');
  const q=JSON.parse(init.body);calls.push(q);
  assert.ok(['eth_chainId','eth_blockNumber','eth_getBalance','eth_call'].includes(q.method));
  return new Response(JSON.stringify({id:q.id,result:q.method==='eth_chainId'?'0x38':q.method==='eth_blockNumber'?'0x10':'0x1'}));
 };
 const result=await snapshot('bsc',address,fetcher);
 assert.equal(result.assets.length,4);
 assert.equal(result.assets[1].name,'Binance-Peg USDT');
 assert.equal(result.assets[1].amount,'0.000000000000000001');
 assert.ok(calls.filter(c=>c.method==='eth_call').every(c=>c.params[1]==='0x10' && bscTokens.some(t=>t.contract===c.params[0].to)));
 assert.equal(result.history_status,'explorer_required');
});
test('wrong chain and provider failures never produce fake zero balances',async()=>{
 await assert.rejects(()=>snapshot('ethereum',address,async(u,init)=>new Response(JSON.stringify({id:JSON.parse(init.body).id,result:'0x38'}))),/WRONG_PROVIDER_NETWORK/);
 await assert.rejects(()=>snapshot('bsc',address,async()=>new Response('',{status:503})),/PROVIDER_UNAVAILABLE/);
});
test('BTC checks network validity and bounds history while preserving exact satoshis',async()=>{
 const result=await snapshot('bitcoin','bc1q'+'q'.repeat(38),async(url)=>new Response(JSON.stringify(
  url.includes('validate-address')?{isvalid:true}:url.endsWith('/txs')?[{txid:'a'.repeat(64),status:{confirmed:true}}]:
  {chain_stats:{funded_txo_sum:100000001,spent_txo_sum:1},mempool_stats:{funded_txo_sum:0,spent_txo_sum:0}}
 )));
 assert.equal(result.assets[0].amount,'1');assert.equal(result.history.length,1);
});
