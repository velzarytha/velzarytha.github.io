const glow=document.querySelector('.cursor-glow');
window.addEventListener('pointermove',e=>{glow.style.left=e.clientX+'px';glow.style.top=e.clientY+'px'});
const observer=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add('visible')}),{threshold:.12});
document.querySelectorAll('.reveal').forEach((el,i)=>{el.style.transitionDelay=Math.min(i*70,350)+'ms';observer.observe(el)});
document.querySelectorAll('[data-tilt]').forEach(card=>{card.addEventListener('pointermove',e=>{if(matchMedia('(max-width: 900px)').matches)return;const r=card.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;card.style.transform=`perspective(1000px) rotateX(${y*-5}deg) rotateY(${x*6}deg) translateY(-7px)`});card.addEventListener('pointerleave',()=>card.style.transform='')});
document.querySelector('.menu')?.addEventListener('click',()=>{const nav=document.querySelector('.nav nav');const open=nav.style.display==='flex';nav.style.display=open?'':'flex';nav.style.position='absolute';nav.style.right='18px';nav.style.top='70px';nav.style.padding='14px';nav.style.background='#090b14f5';nav.style.border='1px solid #ffffff18';nav.style.borderRadius='14px';nav.style.flexDirection='column'});
document.getElementById('year').textContent=new Date().getFullYear();
