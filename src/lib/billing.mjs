import original from '../../legacy/billing-original.htm?raw';
import { createHash } from 'node:crypto';
// Build-time only: preserve the original transport/validation script byte for byte.
const matches=[...original.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
if(matches.length!==1) throw new Error('Unexpected number of billing scripts');
export const core=matches[0][1];
export const scriptHash=createHash('sha256').update(core).digest('base64');
