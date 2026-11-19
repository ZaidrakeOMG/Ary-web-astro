"""Ticket JPG sintético solo para pruebas Playwright con API simulada."""
from __future__ import annotations

import base64
from playwright.sync_api import expect


def subir_ticket_simulado(page, folio='12345'):
    payload = page.evaluate("""() => {
      const c=document.createElement('canvas');c.width=900;c.height=1500;
      const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,900,1500);
      ctx.fillStyle='#222';ctx.fillRect(180,200,540,3);
      ctx.fillRect(180,840,540,3);
      return c.toDataURL('image/jpeg',0.86).split(',')[1];
    }""")
    page.locator('#factura-foto-ticket').set_input_files({
      'name':'ticket-prueba.jpg', 'mimeType':'image/jpeg',
      'buffer':base64.b64decode(payload),
    })
    expect(page.locator('#factura-ticket')).to_have_value(folio)
