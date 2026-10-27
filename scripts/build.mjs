import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';import {execFileSync} from 'node:child_process';
for(const f of ['server.mjs','lib/core.mjs','lib/db.mjs','lib/integrations.mjs','lib/tryon.mjs','public/store.js','public/play.js','public/admin.js','public/tracking.js'])execFileSync(process.execPath,['--check',f]);
await mkdir('dist',{recursive:true});for(const f of ['public','lib','database','server.mjs'])await cp(f,'dist/'+f,{recursive:true});console.log('Hostinger app built in dist/');
