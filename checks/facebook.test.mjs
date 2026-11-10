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
test('Embed codes and Facebook links become canonical video URLs; other sites are rejected',async()=>{
  const {normalizeVideoUrl}=await import('../server/facebook.js?links-test')
  const embed='<iframe src="https://www.facebook.com/plugins/video.php?height=314&href=https%3A%2F%2Fweb.facebook.com%2F61556906195984%2Fvideos%2F1840145000648542%2F&show_text=false&width=560&t=0" width="560" height="314" style="border:none;overflow:hidden" scrolling="no" frameborder="0" allowfullscreen="true" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share" allowFullScreen="true"></iframe>'
  assert.equal(normalizeVideoUrl(embed),'https://www.facebook.com/61556906195984/videos/1840145000648542/')
  assert.equal(normalizeVideoUrl('https://m.facebook.com/watch/?v=123&ref=x'),'https://www.facebook.com/watch/?v=123')
  assert.equal(normalizeVideoUrl(''),null)
  for(const bad of ['https://evil.example/61556906195984/videos/1/','http://www.facebook.com/1/videos/2/','https://www.facebook.com/profile.php','javascript:alert(1)','<iframe src="https://evil.example/plugins/video.php?href=x"></iframe>'])
    assert.throws(()=>normalizeVideoUrl(bad),bad)
})
test('Page tokens are encrypted and cannot be read without the server key',async()=>{
  process.env.TRANSMISSION_SECRET_KEY='k'.repeat(40)
  const {encryptToken,effectiveSettings}=await import('../server/facebook.js?crypto-test')
  const token='EAA'+'x'.repeat(60),stored=encryptToken(token)
  assert.ok(!stored.includes(token));assert.notEqual(encryptToken(token),stored)
  assert.equal(effectiveSettings({token_cifrado:stored,id_pagina:'61556906195984'}).token,token)
  process.env.TRANSMISSION_SECRET_KEY='z'.repeat(40);delete process.env.FACEBOOK_PAGE_ACCESS_TOKEN
  assert.equal(effectiveSettings({token_cifrado:stored}).token,null)
  delete process.env.TRANSMISSION_SECRET_KEY
  assert.throws(()=>encryptToken(token),/TRANSMISSION_SECRET_KEY/)
})
test('Without panel or environment video, the public section keeps a default video',async()=>{
  delete process.env.FACEBOOK_FALLBACK_VIDEO;delete process.env.FACEBOOK_PAGE_ACCESS_TOKEN
  const {effectiveSettings}=await import('../server/facebook.js?default-test')
  assert.match(effectiveSettings(null).manual,/^https:\/\/www\.facebook\.com\/61556906195984\/videos\/\d+\/$/)
})
