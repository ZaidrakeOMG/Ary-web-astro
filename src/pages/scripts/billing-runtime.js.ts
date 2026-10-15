import core from '../../lib/billing-runtime.js?raw';

export const prerender = true;

export function GET() {
  return new Response(core, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}
