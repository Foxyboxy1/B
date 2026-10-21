import {database} from '../lib/db.mjs';import {defaultSettings,now} from '../lib/core.mjs';import {seed} from './seed.mjs';
const db=await database();try{await db.initialize();await seed(db,process.env.DEMO_MODE==='1');console.log('Database initialized. Existing records preserved. Production catalog stock starts at zero.')}finally{await db.close()}
