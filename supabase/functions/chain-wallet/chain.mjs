export const networks = ['ethereum', 'bsc', 'bitcoin', 'ton'];
export function validAddress(network, address) {
  if (typeof address !== 'string') return false;
  if (network === 'ethereum' || network === 'bsc') return /^0x[0-9a-fA-F]{40}$/.test(address) && !/^0x0{40}$/.test(address);
  if (network === 'bitcoin') return /^bc1[qp][023456789acdefghjklmnpqrstuvwxyz]{11,87}$/.test(address);
  if (network === 'ton') return /^[EU]Q[A-Za-z0-9_-]{46}$/.test(address);
  return false;
}
export function units(value, decimals) {
  const amount = BigInt(value);
  if (amount < 0n || !Number.isInteger(decimals) || decimals < 0 || decimals > 18) throw Error('INVALID_AMOUNT');
  const digits = amount.toString().padStart(decimals + 1, '0');
  if (!decimals) return digits;
  const fraction = digits.slice(-decimals).replace(/0+$/, '');
  return digits.slice(0, -decimals) + (fraction ? '.' + fraction : '');
}
export const bscTokens = [
  {symbol:'USDT', name:'Binance-Peg USDT', contract:'0x55d398326f99059ff775485246999027b3197955', decimals:18},
  {symbol:'USDC', name:'Binance-Peg USDC', contract:'0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', decimals:18},
  {symbol:'BTCB', name:'Binance-Peg Bitcoin', contract:'0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c', decimals:18},
];
// Fixed provider origins and methods only. No user-controlled RPC URLs or token contracts.
export async function snapshot(network, address, fetcher = fetch) {
  if (!validAddress(network, address)) throw Error('INVALID_ADDRESS');
  async function get(url, init) {
    const res = await fetcher(url, {...init, redirect:'error', signal:AbortSignal.timeout(8000)});
    if (!res.ok) throw Error('PROVIDER_UNAVAILABLE');
    const reader = res.body?.getReader();
    if (!reader) throw Error('INVALID_PROVIDER_RESPONSE');
    let size=0; const chunks=[];
    while(true) {
      const part=await reader.read(); if(part.done) break;
      size+=part.value.length;
      if(size>300000) { await reader.cancel(); throw Error('PROVIDER_RESPONSE_TOO_LARGE'); }
      chunks.push(part.value);
    }
    const bytes=new Uint8Array(size);let offset=0;
    for(const chunk of chunks) { bytes.set(chunk,offset);offset+=chunk.length; }
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  if (network === 'ton') return {assets:[], history:[], history_status:'provider_not_connected', status:'provider_not_connected'};
  if (network === 'bitcoin') {
    const origin = 'https://mempool.space/api';
    const validation = await get(`${origin}/v1/validate-address/${address}`);
    if (!validation.isvalid) throw Error('INVALID_ADDRESS');
    const balance = await get(`${origin}/address/${address}`);
    const c = balance.chain_stats, m = balance.mempool_stats;
    for (const n of [c?.funded_txo_sum,c?.spent_txo_sum,m?.funded_txo_sum,m?.spent_txo_sum])
      if (!Number.isSafeInteger(n) || n < 0) throw Error('INVALID_PROVIDER_RESPONSE');
    const confirmed = BigInt(c.funded_txo_sum) - BigInt(c.spent_txo_sum);
    if (confirmed < 0n) throw Error('INVALID_PROVIDER_RESPONSE');
    let history = [], history_status = 'unavailable';
    try {
      const txs = await get(`${origin}/address/${address}/txs`);
      if (!Array.isArray(txs)) throw Error('INVALID_PROVIDER_RESPONSE');
      history = txs.slice(0,25).filter(t=>/^[a-f0-9]{64}$/.test(t.txid)).map(t=>({id:t.txid, confirmed:t.status?.confirmed === true}));
      history_status = 'recent_25';
    } catch { /* Balance remains usable; do not label a failed history read as empty. */ }
    return {status:'ok',assets:[{symbol:'BTC',name:'Bitcoin',amount:units(confirmed,8),contract:null}],history,history_status};
  }
  const endpoint = network === 'bsc' ? 'https://bsc-dataseed.bnbchain.org' : 'https://ethereum-rpc.publicnode.com';
  let id = 0;
  async function rpc(method, params) {
    const requestId = ++id;
    const body = await get(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params})});
    if (body.id !== requestId || body.error || !/^0x[0-9a-fA-F]+$/.test(body.result) || body.result.length > 66) throw Error('INVALID_PROVIDER_RESPONSE');
    return body.result;
  }
  const chain = await rpc('eth_chainId',[]);
  if (BigInt(chain) !== (network === 'bsc' ? 56n : 1n)) throw Error('WRONG_PROVIDER_NETWORK');
  const block = await rpc('eth_blockNumber',[]);
  const native = await rpc('eth_getBalance',[address,block]);
  const assets = [{symbol:network === 'bsc'?'BNB':'ETH',name:network === 'bsc'?'BNB':'Ether',amount:units(native,18),contract:null}];
  const errors = [];
  if (network === 'bsc') for (const token of bscTokens) {
    try {
      const value = await rpc('eth_call',[{to:token.contract,data:'0x70a08231'+address.slice(2).toLowerCase().padStart(64,'0')},block]);
      assets.push({...token,amount:units(value,token.decimals)});
    } catch { errors.push(token.symbol); }
  }
  return {status:errors.length?'partial':'ok',assets,unavailable_assets:errors,block,history:[],history_status:'explorer_required'};
}
