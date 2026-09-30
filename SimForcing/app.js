'use strict';
(() => {
const $ = id => document.getElementById(id);
const data = window.SIMFORCING_DATA;
if (!data?.datasets?.length) { $('comparisons').textContent = 'Video data is unavailable. Run build.py to prepare the selected examples.'; return; }
const datasets = new Map(data.datasets.map(d => [d.id, d]));
const allCases = data.datasets.flatMap(d => d.cases);
const casesByKey = new Map(allCases.map(c => [`${c.dataset}-${c.id}`, c]));
const tracks = ['simulation', 'real', 'gt', 'geni', 'base', 'ener'];
const labels = {simulation:'Simulation prediction', real:'Real prediction', gt:'Real ground truth', geni:'GeniWorld', base:'Baseline', ener:'EnerVerse-AC'};
const badges = {simulation:'ours', real:'ours', gt:'reference', geni:'', base:'', ener:''};
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
let groups = [], heroGroup = null, noticeTimer, suppressInspectUntil = 0;
const galleries = new Map();
function notify(message) { $('notice').textContent=message; $('notice').classList.add('visible'); clearTimeout(noticeTimer); noticeTimer=setTimeout(()=>$('notice').classList.remove('visible'),5000); }
function videoCard(c, key) {
  const video = c.videos[key];
  return `<div class="video-card" data-track="${key}"><div class="video-topline"><strong>${labels[key]}</strong>${badges[key]?`<span class="video-badge">${badges[key]}</span>`:''}</div><div class="media-frame"><video muted playsinline loop preload="none" poster="${escape(video.poster)}" data-src="${escape(video.src)}" data-track="${key}" aria-label="${escape(video.label)}: ${escape(c.instruction)}"></video><button class="inspect" data-case="${c.dataset}-${c.id}" data-track="${key}" aria-label="Inspect ${escape(video.label)}, ${datasets.get(c.dataset).name} example"><span aria-hidden="true">⤢</span></button></div></div>`;
}
function makeGroup(element, c) {
  const group = {element, case:c, videos:[...element.querySelectorAll('video')], loaded:false, visible:false, running:false, paused:false, progress:0, origin:0, speed:1};
  for (const video of group.videos) {
    video.muted=true;
    video.addEventListener('loadedmetadata', () => { video.currentTime=group.progress*video.duration; video.playbackRate=video.duration/c.cycle_duration*group.speed; });
    video.addEventListener('error', () => {
      if(video.parentElement.querySelector('.video-error'))return;
      const message=document.createElement('span'); message.className='video-error'; message.textContent='Video unavailable'; video.parentElement.append(message);
    });
  }
  return group;
}
function loadGroup(group) {
  if(group.loaded)return;
  group.loaded=true;
  for(const video of group.videos) { video.preload='auto'; video.src=video.dataset.src; }
}
function updateProgress(group, now) {
  if(group.running)group.progress=((now-group.origin)/(group.case.cycle_duration*1000)*group.speed)%1;
}
function stopGroup(group) {
  updateProgress(group,performance.now()); group.running=false;
  group.videos.forEach(v=>v.pause());
}
function dispose(group) {
  stopGroup(group); group.videos.forEach(v=>{v.removeAttribute('src');v.load();});
}
function playVideo(video) {
  if(!video.paused||video.dataset.pending)return;
  video.dataset.pending='1';
  video.play().catch(error=>{if(error.name==='NotAllowedError'){playing=false;allGroups().forEach(stopGroup);updateButtons();notify('Select a play button to start playback.');}}).finally(()=>{delete video.dataset.pending;});
}
function syncGroup(group, now) {
  const shouldPlay = playing && group.visible && !group.paused && !document.hidden && !$('videoDialog').open;
  if(!shouldPlay){if(group.running)stopGroup(group);return;}
  loadGroup(group);
  if(!group.videos.every(v=>v.readyState>=2||v.error))return;
  if(!group.running){group.origin=now-group.progress*group.case.cycle_duration*1000/group.speed;group.running=true;}
  updateProgress(group,now);
  for(const video of group.videos) {
    if(video.readyState<2||video.error)continue;
    video.playbackRate=video.duration/group.case.cycle_duration*group.speed;
    const target=group.progress*video.duration;
    if(Math.abs(video.currentTime-target)>.12 && !video.seeking)video.currentTime=target;
    playVideo(video);
  }
}
function allGroups(){return [heroGroup,...groups].filter(Boolean);}
const observer=new IntersectionObserver(entries=>{
  for(const entry of entries){const group=allGroups().find(g=>g.element===entry.target);if(!group)continue;group.visible=entry.isIntersecting;if(group.visible)loadGroup(group);else stopGroup(group);}
},{threshold:.08});
setInterval(()=>{const now=performance.now();allGroups().forEach(g=>syncGroup(g,now));},100);
document.addEventListener('visibilitychange',()=>{if(document.hidden)allGroups().forEach(stopGroup);});
function updateButtons(){
  const heroPlaying=playing && !heroGroup?.paused;
  $('heroPlay').textContent=heroPlaying?'Ⅱ Pause':'▶ Play';$('heroPlay').setAttribute('aria-pressed',heroPlaying);
  galleries.forEach(gallery=>{
    const active=playing && !gallery.group?.paused;
    const button=gallery.element.querySelector('.gallery-play');
    button.textContent=active?'Ⅱ':'▶';
    button.setAttribute('aria-label',`${active?'Pause':'Play'} ${gallery.dataset.name} videos`);
    button.setAttribute('aria-pressed',active);
  });
}
function showSlide(gallery,index,direction=0){
  const wasPaused=gallery.group?.paused || false;
  if(gallery.group){observer.unobserve(gallery.group.element);dispose(gallery.group);groups=groups.filter(g=>g!==gallery.group);}
  gallery.index=(index+gallery.dataset.cases.length)%gallery.dataset.cases.length;
  const c=gallery.dataset.cases[gallery.index];
  const stage=gallery.element.querySelector('.gallery-stage');
  gallery.element.querySelector('.gallery-instruction').textContent=c.instruction;
  stage.innerHTML=`<div class="comparison-grid">${tracks.map(key=>videoCard(c,key)).join('')}</div>`;
  gallery.group=makeGroup(stage,c);gallery.group.paused=wasPaused;groups.push(gallery.group);observer.observe(stage);
  if(direction && !matchMedia('(prefers-reduced-motion: reduce)').matches)stage.animate([{opacity:.3,transform:`translateX(${direction*18}px)`},{opacity:1,transform:'translateX(0)'}],{duration:220,easing:'ease-out'});
  gallery.element.querySelectorAll('.gallery-dot').forEach((dot,i)=>{dot.setAttribute('aria-current',i===gallery.index?'true':'false');});
  updateButtons();
}
function renderGalleries(){
  $('comparisons').innerHTML=data.datasets.map(d=>`<section class="gallery" id="gallery-${d.id}" tabindex="0" role="region" aria-roledescription="carousel" aria-label="${d.name} video comparisons"><div class="gallery-heading"><h3>${d.name}</h3><div class="gallery-navigation"><button class="gallery-arrow gallery-prev" aria-label="Previous ${d.name} example">←</button><button class="gallery-play" aria-label="Pause ${d.name} videos" aria-pressed="true">Ⅱ</button><button class="gallery-arrow gallery-next" aria-label="Next ${d.name} example">→</button></div></div><h4 class="gallery-instruction" aria-live="polite" aria-atomic="true"></h4><div class="gallery-stage"></div><div class="gallery-dots" role="group" aria-label="Choose ${d.name} example">${d.cases.map((c,i)=>`<button class="gallery-dot" data-index="${i}" aria-label="${d.name}: ${escape(c.instruction)}, example ${i+1}" aria-current="false"><span></span></button>`).join('')}</div></section>`).join('');
  for(const dataset of data.datasets){
    const element=$('gallery-'+dataset.id), gallery={dataset,element,index:0,group:null};galleries.set(dataset.id,gallery);
    element.querySelector('.gallery-prev').onclick=()=>showSlide(gallery,gallery.index-1,-1);
    element.querySelector('.gallery-next').onclick=()=>showSlide(gallery,gallery.index+1,1);
    element.querySelector('.gallery-play').onclick=()=>{if(!playing){playing=true;gallery.group.paused=false;}else gallery.group.paused=!gallery.group.paused;if(gallery.group.paused)stopGroup(gallery.group);updateButtons();};
    element.querySelector('.gallery-dots').onclick=event=>{const dot=event.target.closest('[data-index]');if(dot)showSlide(gallery,Number(dot.dataset.index),Number(dot.dataset.index)>gallery.index?1:-1);};
    element.addEventListener('keydown',event=>{if(event.altKey||event.ctrlKey||event.metaKey||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const direction=event.key==='ArrowRight'?1:-1;showSlide(gallery,gallery.index+direction,direction);});
    let touch=null;
    const stage=element.querySelector('.gallery-stage');
    stage.addEventListener('pointerdown',event=>{if(event.pointerType==='touch' && event.isPrimary)touch={x:event.clientX,y:event.clientY,id:event.pointerId};});
    stage.addEventListener('pointercancel',()=>{touch=null;});
    stage.addEventListener('pointerup',event=>{if(!touch||event.pointerId!==touch.id)return;const dx=event.clientX-touch.x,dy=event.clientY-touch.y;touch=null;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5){suppressInspectUntil=Date.now()+500;const direction=dx<0?1:-1;showSlide(gallery,gallery.index+direction,direction);}});
    showSlide(gallery,0);
  }
}
$('heroPlay').onclick=()=>{if(!playing){playing=true;heroGroup.paused=false;}else heroGroup.paused=!heroGroup.paused;if(heroGroup.paused)stopGroup(heroGroup);updateButtons();};
function openVideo(button){
  const c=casesByKey.get(button.dataset.case), key=button.dataset.track, media=c.videos[key];
  const group=button.closest('.teaser')?heroGroup:groups.find(g=>g.case===c);
  allGroups().forEach(stopGroup);
  $('dialogDataset').textContent=datasets.get(c.dataset).name;
  $('dialogTitle').textContent=media.label;
  $('dialogInstruction').textContent=c.instruction;
  $('downloadVideo').href=media.src;$('downloadVideo').download=`simforcing_${c.dataset}_${c.id}_${key}.mp4`;
  const video=$('inspectVideo');video.muted=true;video.poster=media.poster;
  video.onloadedmetadata=()=>{video.currentTime=(group?.progress||0)*video.duration;video.playbackRate=video.duration/c.cycle_duration;if(playing&&!group?.paused)video.play().catch(()=>{});};
  video.src=media.src;$('videoDialog').showModal();
}
document.addEventListener('click',event=>{const button=event.target.closest('.inspect');if(button && Date.now()>suppressInspectUntil)openVideo(button);});
$('closeDialog').onclick=()=>$('videoDialog').close();
$('dialogPlay').onclick=()=>{const video=$('inspectVideo');if(video.paused)video.play().catch(()=>{});else video.pause();};
for(const name of ['play','pause','emptied'])$('inspectVideo').addEventListener(name,()=>{const paused=$('inspectVideo').paused;$('dialogPlay').textContent=paused?'▶':'Ⅱ';$('dialogPlay').setAttribute('aria-label',paused?'Play video':'Pause video');});
$('videoDialog').addEventListener('close',()=>{const video=$('inspectVideo');video.pause();video.onloadedmetadata=null;video.removeAttribute('src');video.load();});
$('videoDialog').addEventListener('click',event=>{if(event.target!==$('videoDialog'))return;const r=$('videoDialog').getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)$('videoDialog').close();});
document.addEventListener('keydown',event=>{if(event.code==='Space'&&!event.target.closest('button,a,input,select,video')&&!$('videoDialog').open){event.preventDefault();playing=!playing;allGroups().forEach(g=>{if(playing)g.paused=false;else stopGroup(g);});updateButtons();}});
function handleHash(){
  const hash=decodeURIComponent(location.hash.slice(1));
  if(hash.startsWith('dataset-')){$('gallery-'+hash.slice(8))?.scrollIntoView({block:'start'});return;}
  if(!hash.startsWith('case-'))return;
  const c=casesByKey.get(hash.slice(5));if(!c)return;
  const gallery=galleries.get(c.dataset);showSlide(gallery,gallery.dataset.cases.indexOf(c));
  requestAnimationFrame(()=>gallery.element.scrollIntoView({block:'start'}));
}
window.addEventListener('hashchange',handleHash);
const featured=allCases[0];
if(featured){$('heroMedia').innerHTML=['simulation','real','gt'].map(key=>videoCard(featured,key)).join('');$('heroInstruction').textContent=`${datasets.get(featured.dataset).name} / “${featured.instruction}”`;heroGroup=makeGroup(document.querySelector('.teaser'),featured);observer.observe(heroGroup.element);}
renderGalleries();handleHash();
})();
