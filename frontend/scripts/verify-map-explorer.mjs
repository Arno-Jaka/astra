// Requires the dev servers and Chrome --remote-debugging-port=9222.
import assert from 'node:assert/strict'

const pages = await (await fetch(`${process.env.CDP_URL ?? 'http://localhost:9222'}/json/list`)).json()
const socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl)
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
let id = 0
const pending = new Map()
socket.onmessage = event => {
  const message = JSON.parse(event.data)
  if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id) }
}
const call = (method, params = {}) => new Promise(resolve => {
  pending.set(++id, resolve); socket.send(JSON.stringify({ id, method, params }))
})
const evaluate = async expression => {
  const response = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: 35000 })
  if (response.error || response.result.exceptionDetails) throw Error(JSON.stringify(response))
  return response.result.result.value
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const waitFor = expression => evaluate(`new Promise((resolve,reject)=>{
  const start=performance.now();function check(){if(${expression})return resolve(true);
  if(performance.now()-start>30000)return reject(Error('Timed out: '+${JSON.stringify(expression)}));requestAnimationFrame(check)}check()
})`)
const click = async (x, y) => {
  for (const type of ['mousePressed', 'mouseReleased']) await call('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 })
}
const bar = `document.querySelector('[aria-label="Site search and route selection"]')`
const button = text => `[...document.querySelectorAll('button')].find(e=>e.textContent===${JSON.stringify(text)})`
try {
  await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await call('Network.enable')
  await call('Page.navigate', { url: process.env.APP_URL ?? 'http://localhost:5173' })
  await delay(2000)
  await waitFor(`globalThis.__astraViewer && document.querySelector('[aria-label="Search Mars sites"]')`)
  await evaluate(`(async()=>{const source=await(await fetch('/src/components/MapExplorer.tsx')).text();
    const url=source.split('"').find(s=>s.startsWith('/node_modules/')&&s.includes('/cesium.js'));
    globalThis.C=await import(url);__astraViewer.camera.setView({destination:C.Cartesian3.fromDegrees(137.81,-5.37,1500000,C.Ellipsoid.MARS)});
  })()`)
  await delay(5000)
  const point = await evaluate(`(()=>{const v=__astraViewer;globalThis.site=v.entities.getById('astra-site-Gale Crater');
    globalThis.originalSize=site.point.pixelSize.getValue(v.clock.currentTime);
    const p=C.SceneTransforms.worldToWindowCoordinates(v.scene,site.position.getValue(v.clock.currentTime));return {x:p.x,y:p.y};})()`)
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point })
  await delay(500)
  assert.equal(await evaluate(`!!document.querySelector('[data-panel="inspection"]')`), false)
  assert.ok(await evaluate('site.point.pixelSize.getValue(__astraViewer.clock.currentTime)>originalSize'))
  await waitFor(`document.querySelector('[data-panel="inspection"]')`)
  const card = await evaluate(`document.querySelector('[data-panel="inspection"]').getBoundingClientRect().toJSON()`)
  assert.ok(card.left >= 0 && card.right <= 1280 && card.top >= 0 && card.bottom <= 900)
  assert.ok(point.x < card.left || point.x > card.right || point.y < card.top || point.y > card.bottom)
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x + 100, y: point.y + 100 })
  await delay(1800)
  assert.equal(await evaluate(`!!document.querySelector('[data-panel="inspection"]')`), false)
  assert.equal(await evaluate('site.point.pixelSize.getValue(__astraViewer.clock.currentTime)'), await evaluate('originalSize'))
  await click(point.x + 100, point.y + 100)
  await waitFor(`/Start:.*km .*from /.test(${bar}.textContent)`)
  await click(point.x + 100, point.y + 100)
  assert.equal(await evaluate(`!!__astraViewer.entities.getById('explorer-end')`), false)
  await click(point.x + 110, point.y + 100)
  await waitFor(`/Destination:.*km .*from /.test(${bar}.textContent)`)
  await waitFor(`document.querySelector('[aria-label="Route comparison"]') && ${button('Clear')} && !${button('Clear')}.disabled`)
  const rings = await evaluate(`[...document.querySelectorAll('.selection-orbit')].map(e=>({color:getComputedStyle(e).color,animation:getComputedStyle(e.firstChild).animationName}))`)
  assert.ok(rings.every(ring => ring.animation === 'marker-orbit'))
  assert.notEqual(rings[0].color, rings[1].color)
  await evaluate(`${button('Clear')}.click();${bar}.querySelector('input').focus()`)
  await waitFor(`document.querySelector('[aria-label="Matching sites"] button')`)
  await evaluate(`[...document.querySelectorAll('[aria-label="Matching sites"] button')].find(e=>e.textContent.startsWith('Gale Crater')).click()`)
  await waitFor(`${button('Set start')} && ${bar}.textContent.includes('Curiosity')`)
  await evaluate(`${button('Set start')}.click()`)
  await waitFor(`${button('Set destination')}.disabled`)
  await evaluate(`${button('← Results')}.click()`)
  await waitFor(`document.querySelector('[aria-label="Matching sites"] button')`)
  await evaluate(`[...document.querySelectorAll('[aria-label="Matching sites"] button')].find(e=>e.textContent.startsWith('Mount Sharp')).click()`)
  await waitFor(`${button('Set destination')} && !${button('Set destination')}.disabled`)
  await evaluate(`${button('Set destination')}.click()`)
  await waitFor(`[...document.querySelectorAll('h2')].some(e=>e.textContent.includes('Gale Crater')&&e.textContent.includes('Mount Sharp')) && !${button('Clear')}.disabled`)
  await waitFor(`document.querySelector('[aria-label="Crew final approach"]')?.textContent.includes('Within assumed time budget')`)
  await evaluate(`(()=>{const details=[...document.querySelectorAll('details')].find(d=>d.querySelector('summary')?.textContent.includes('Mission parameters'));if(details)details.open=true;const change=(label,value)=>{const input=document.querySelector('[aria-label="'+label+'"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));};change('Assumed walking pace (m/s)','2');change('Suit/equipment extra travel time (%)','0')})()`)
  await waitFor(`document.querySelector('[aria-label="Assumed walking pace (m/s)"]').value==='2'`)
  assert.ok(await evaluate(`document.querySelector('[aria-label="Crew final approach"]').textContent.includes('Assumed pace: 0.5 m/s')`), 'old route retains its assumption snapshot until recalculated')
  await evaluate(`${button('Recalculate route')}.click()`)
  await waitFor(`document.querySelector('[aria-label="Crew final approach"]')?.textContent.includes('Assumed pace: 2 m/s')`)
  assert.ok(await evaluate(`document.querySelector('[aria-label="Crew final approach"]').textContent.includes('Within assumed time budget')`))
  console.log('Passed: site-only hover delay/dismissal/enlargement, in-view card, arbitrary-terrain endpoints and bearings, duplicate prevention, colored rings, search information, and automatic route replacement.')
  console.log('Passed: final-approach EVA estimate, assumption snapshot, and recalculation.')
} finally {
  socket.close()
}
