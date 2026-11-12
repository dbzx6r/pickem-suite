import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const errors=[];
for(const file of files){
  if(/(^|\/)(node_modules|\.next|backups|uploads|secrets|\.swiftpm)(\/|$)|\.(swift|xcodeproj|xcworkspace|p8|p12|mobileprovision|dump|sqlite|ipa|xcarchive)$/.test(file)) errors.push(`${file}: forbidden publication artifact`);
  if(/(^|\/)\.env($|\.)/.test(file)&&file!=='.env.example') errors.push(`${file}: private environment file`);
  if(file==='scripts/check-publication.mjs') continue;
  const bytes=readFileSync(file);if(bytes.includes(0)) continue;
  const text=bytes.toString();
  if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}|\bAKIA[0-9A-Z]{16}\b/.test(text)) errors.push(`${file}: possible secret`);
  if(/(?:\/Users\/|\/home\/)[a-zA-Z][\w.-]+\//.test(text)) errors.push(`${file}: personal filesystem path`);
  if(/\b(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/.test(text)) errors.push(`${file}: private network address`);
}
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log(`Publication hygiene passed for ${files.length} tracked files. Manual review and secret scanning are still required.`);
