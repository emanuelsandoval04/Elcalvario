let cached = { expires: 0, data: null }
let pending
const fallback = () => ({
  videoUrl: process.env.FACEBOOK_FALLBACK_VIDEO || 'https://www.facebook.com/61556906195984/videos/1641403047771920/',
  pageUrl: `https://www.facebook.com/${/^\d+$/.test(process.env.FACEBOOK_PAGE_ID || '') ? process.env.FACEBOOK_PAGE_ID : '61556906195984'}`,
  automatic: false, live: false,
})
export async function facebookTransmission() {
  if (cached.expires > Date.now()) return cached.data
  if (pending) return pending
  pending = (async () => {
    let result = fallback()
    const { FACEBOOK_PAGE_ID: page, FACEBOOK_PAGE_ACCESS_TOKEN: token, FACEBOOK_GRAPH_VERSION: version } = process.env
    if (/^\d+$/.test(page || '') && token && /^v\d+\.\d+$/.test(version || '')) {
      try {
        const endpoint = new URL(`https://graph.facebook.com/${version}/${page}/live_videos`)
        endpoint.searchParams.set('fields','id,status,permalink_url,creation_time')
        endpoint.searchParams.set('limit','10')
        const response = await fetch(endpoint,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(8000)})
        if (!response.ok) throw new Error('META_UNAVAILABLE')
        const data = await response.json()
        if (!Array.isArray(data.data)) throw new Error('META_INVALID_RESPONSE')
        const videos = data.data.filter(item => ['LIVE','VOD'].includes(item.status)).sort((a,b) => {
          if (a.status!==b.status) return a.status==='LIVE' ? -1 : 1
          return Date.parse(b.creation_time)-Date.parse(a.creation_time)
        })
        const video = videos[0]
        if (video) {
          const videoUrl = new URL(video.permalink_url || `https://www.facebook.com/${page}/videos/${video.id}/`, 'https://www.facebook.com')
          if (videoUrl.protocol !== 'https:' || !['www.facebook.com','facebook.com'].includes(videoUrl.hostname)) throw new Error('META_INVALID_URL')
          result = {videoUrl:videoUrl.href,pageUrl:result.pageUrl,automatic:true,live:video.status==='LIVE'}
        } else result = {...result,videoUrl:null,automatic:true}
      } catch { /* Preserve a working fallback. Never log tokens, endpoints or Meta payloads. */ }
    }
    cached = { expires:Date.now()+60000, data:result }
    return result
  })()
  try { return await pending } finally { pending = undefined }
}
