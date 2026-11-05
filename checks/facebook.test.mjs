import { test } from 'node:test'
import assert from 'node:assert/strict'

test('Facebook prioritizes a live broadcast, caches requests and keeps credentials on the server',async()=>{
  process.env.FACEBOOK_PAGE_ID='123456';process.env.FACEBOOK_PAGE_ACCESS_TOKEN='test-server-token';process.env.FACEBOOK_GRAPH_VERSION='v99.0'
  const original=globalThis.fetch
  let calls=0
  globalThis.fetch=async(endpoint,options)=>{
    calls++;assert.equal(endpoint.hostname,'graph.facebook.com');assert.equal(endpoint.searchParams.has('access_token'),false)
    assert.equal(options.headers.Authorization,'Bearer test-server-token')
    return {ok:true,json:async()=>({data:[{id:'1',status:'VOD',creation_time:'2026-10-08T10:00:00Z',permalink_url:'https://www.facebook.com/123456/videos/1/'},{id:'2',status:'LIVE',creation_time:'2026-10-07T10:00:00Z',permalink_url:'/123456/videos/2/'}]})}
  }
  try {
    const {facebookTransmission}=await import('../server/facebook.js?live-test')
    const [first,second]=await Promise.all([facebookTransmission(),facebookTransmission()])
    assert.equal(first.videoUrl,'https://www.facebook.com/123456/videos/2/');assert.equal(first.live,true);assert.equal(first.automatic,true)
    assert.deepEqual(first,second);assert.equal(calls,1);assert.ok(!JSON.stringify(first).includes('test-server-token'))
  } finally {globalThis.fetch=original}
})
test('Facebook failures and untrusted permalink URLs use a safe fallback',async()=>{
  process.env.FACEBOOK_FALLBACK_VIDEO='https://www.facebook.com/123456/videos/3/'
  const original=globalThis.fetch
  try {
    globalThis.fetch=async()=>({ok:false})
    const offline=await import('../server/facebook.js?offline-test')
    assert.equal((await offline.facebookTransmission()).automatic,false)
    globalThis.fetch=async()=>({ok:true,json:async()=>({data:[{id:'1',status:'LIVE',permalink_url:'https://untrusted.invalid/video'}]})})
    const untrusted=await import('../server/facebook.js?untrusted-test')
    assert.equal((await untrusted.facebookTransmission()).videoUrl,process.env.FACEBOOK_FALLBACK_VIDEO)
  } finally {globalThis.fetch=original}
})
