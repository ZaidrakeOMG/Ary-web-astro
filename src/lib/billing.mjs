import core from './billing-runtime.js?raw';
import { createHash } from 'node:crypto';
// Canonical operational source. legacy/billing-original.htm remains the
// immutable baseline for form fields and migration history, not executed code.
if (!core.includes("const API = '/api/facturacion'")) throw new Error('Missing billing runtime');
export { core };
export const scriptHash = createHash('sha256').update(core).digest('base64');
