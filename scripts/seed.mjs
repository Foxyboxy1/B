import {readFileSync,existsSync} from 'node:fs';import {defaultSettings,now} from '../lib/core.mjs';
export const rows=[
['Accessories-53','إسورة Pink Crystal','Gold Pink Crystal Leaf Vine Bangle','bracelets',250,350,'1770669545643309862.jpg','1770584933269660132.jpg'],
['bangle-88','إسورة Soleil','Soleil Evil Eye Bangle','bracelets',330,0,'1787998030831865393.jpg','1787998905223168725.jpg'],
['Accessories-3','سلسلة Crystal Circle','Crystal Circle Pendant Necklace','necklaces',230,270,'1770585754558239840.jpg','1770585740241258090.jpg'],
['Accessories-8','سلسلة Clover Layers','Layered Gold Chain Necklace with Clover Pendants','necklaces',330,369,'1770585391026282685.jpg','1770585408209821320.jpg'],
['Accessories-55','إسورة Classic Gold','Classic Gold Screw Motif Bracelet','bracelets',100,0,'1770584835607732585.jpg','1770584856397994803.jpg'],
['ring1','خاتم Golden Flora','Golden Flora Hammered Ring','rings',90,150,'1767057910135445797.jpg','1770669730911227009.jpg'],
['Accessories-17','حلق Silver Petals','Silver & White Petal Cluster Earrings','earrings',200,229,'1770553635494924053.jpg','1770553634932153308.jpg'],
['Accessories-70','خاتم Two-Tone','Two-Tone Gold & Silver Teardrop Open Ring','rings',100,130,'1770500401855069940.jpg','1770500397822144450.jpg'],
['Accessories-79','خاتم Pink Heart','Silver Pink Heart Crystal Halo Ring','rings',99,140,'1770467353655072579.jpg','1770485174338922033.jpg'],
['Accessories-80','خاتم Triple Wrap','Chunky Gold Triple Wrap Dome Ring','rings',120,150,'1770467184336589657.jpg','1770483184653698162.jpg'],
['Accessories-86','طقم Charm Rings','Charm Rings Set','sets',160,200,'1770496919150047081.jpg','1770481125832088779.jpg'],
['Accessories-74','خاتم Golden Wave','Abstract Hammered Gold Wave Ring','rings',150,200,'1770501568720079805.jpg','1770497962343926966.jpg']];
export const assets=['1759340769821229036.png','1763853524805996248.jpg','1759591147579850191.jpg','1759590273469901860.jpg','1759591814712595605.jpg','1759591437273743378.jpg',...rows.flatMap(r=>r.slice(6))];
export async function seed(db,demo=false){await db.transaction(async c=>{
 for(const [i,[cid,name]]of [['rings','خواتم'],['necklaces','سلاسل'],['bracelets','أساور'],['earrings','حلق'],['sets','أطقم'],['piercings','بيرسينج']].entries())if(!(await c.query('SELECT id FROM categories WHERE id=?',[cid])).length)await c.query('INSERT INTO categories (id,name,sort_order,active) VALUES (?,?,?,1)',[cid,name,i]);
 if(!(await c.query('SELECT id FROM settings WHERE id=?',['store'])).length)await c.query('INSERT INTO settings (id,value,revision) VALUES (?,?,1)',['store',JSON.stringify({...defaultSettings,ready:demo,free_shipping:demo?100000:0,policy:demo?'هذه بيئة تجربة فقط. راجعي سياسة المتجر الفعلية قبل الإطلاق.':defaultSettings.policy})]);
 for(const [i,r]of rows.entries()){if((await c.query('SELECT id FROM products WHERE id=?',[r[0]])).length)continue;await c.query('INSERT INTO products (id,sku,category_id,name,name_en,description,price,compare_price,stock,active,featured,images,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',[r[0],'B-'+String(i+1).padStart(3,'0'),r[3],r[1],r[2],r[1]+' من كولكشن B Accessories. أكّدي تفاصيل المقاس والخامة من الإدارة قبل الطلب.',r[4]*100,r[5]*100,demo?8:0,1,i<4?1:0,JSON.stringify(r.slice(6).map(f=>'/assets/'+f)),now()])}
 });}
