export {};
const header = document.querySelector<HTMLElement>('.site-header');
const menu = document.getElementById('menuButton');
const nav = document.getElementById('mainNav');
// Billing's original script owns its menu click: do not register it twice.
if (header?.dataset.billing !== 'true') {
  menu?.addEventListener('click', () => { const open = nav?.classList.toggle('open'); menu.setAttribute('aria-expanded', String(!!open)); });
}
const close = () => { nav?.classList.remove('open'); menu?.setAttribute('aria-expanded','false'); };
document.addEventListener('keydown', event => { if(event.key === 'Escape') close(); });
document.addEventListener('click', event => { if (event.target instanceof Node && !header?.contains(event.target)) close(); });
nav?.querySelectorAll('a').forEach(a => a.addEventListener('click',close));
menu?.addEventListener('click', () => { const open = menu.getAttribute('aria-expanded') === 'true'; menu.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú'); });
window.matchMedia('(min-width: 1000px)').addEventListener('change', close);
// Let the native Android keyboard occupy the screen without a floating bar covering fields.
function keyboardState() { const el=document.activeElement; const editing=el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement; document.body.classList.toggle('keyboard-open',editing && (window.visualViewport?.height || innerHeight) < innerHeight*.83); }
window.visualViewport?.addEventListener('resize',keyboardState);
document.addEventListener('focusin',keyboardState); document.addEventListener('focusout',() => setTimeout(keyboardState,100));
// Presentation-only entry selection; operational state guards remain in the original selectTab.
if (document.body.classList.contains('is-billing')) {
  const target = new URLSearchParams(location.search).get('tramite');
  if (document.getElementById('receipt')?.hidden && (target === 'factura' || target === 'alta')) document.getElementById('tab-'+target)?.click();
}
