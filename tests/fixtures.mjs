import { HttpError } from '../server/errors.mjs';
import { revision } from '../server/data.mjs';
// Fictional records. Imported only by tests and the loopback-only demo server.
export function fixtures() {
  const titles=['Там, где свет','Последний поезд','Тихий океан','До рассвета','Чужое лето','Город внутри','После дождя','Невидимая сторона'];
  return titles.map((name,i)=>({
    id:1700000000000+i,
    movie_data:{nameRu:name,nameEn:`Fictional film ${i+1}`,year:2020+i%5,genres:[{genre:['драма','фантастика','триллер','приключения'][i%4]}],posterUrl:`/assets/demo-${i}.svg`,description:'Вымышленный фильм для проверки интерфейса. Не является частью настоящей коллекции.'},
    user_ratings:[8,7.5,9,8,8.5],girlfriend_ratings:[9,8.5,8,9,9.5],
    user_total:[91,76,85,66,90,58,73,79][i],girlfriend_total:[95,88,64,84,93,63,88,82][i],
    final_rating:[93,82,75,75,92,61,81,81][i],
    date_added:`2026-11-${String(20-i).padStart(2,'0')}T18:30:00.000Z`,
    user_notes:i===0?'Тестовая заметка elevely.\nОна должна пережить перезагрузку.':'',
    girlfriend_notes:i===0?'Тестовая заметка Машки. <script>Это обычный текст</script>':'',
    has_spoilers:i===0,
    custom_legacy_field:{preserve:true}
  }));
}
export function memoryServices(initial=fixtures()) {
  let rows=structuredClone(initial);
  return {
    demo:true,canWrite:true,searchAvailable:true,
    async list(){return structuredClone(rows);},
    async get(id){return structuredClone(rows.find(r=>String(r.id)===String(id))||null);},
    async insert(row){if(rows.some(r=>String(r.id)===String(row.id)))throw new HttpError(409,'Duplicate');rows.push(structuredClone(row));return structuredClone(row);},
    async updateNotes(row,patch){const i=rows.findIndex(r=>String(r.id)===String(row.id));if(i<0||revision(rows[i])!==revision(row))throw new HttpError(409,'Conflict');rows[i]={...rows[i],...structuredClone(patch)};return structuredClone(rows[i]);},
    async user(token){return token==='demo-session'?{id:'demo-admin'}:null;},
    async login(email,password){if(email!=='demo@example.test'||password!=='demo-only')throw new HttpError(401,'Неверные данные тестового аккаунта.');return {token:'demo-session',expires:3600};},
    async search(params){if(params.get('id'))return {movie:{filmId:999,nameRu:'Новый тестовый фильм',year:2026,genres:[{genre:'драма'}]}};return {movies:[{filmId:999,nameRu:'Новый тестовый фильм',year:2026,genres:[{genre:'драма'}]}]};}
  };
}
export function demoPosters(){
  const palettes=[['#c6d6c4','#254b43'],['#bb6836','#3b271d'],['#829fae','#102d40'],['#e8cfa8','#6c573d'],['#b8bfa3','#283b29'],['#b0a3be','#352d47'],['#89bdb1','#28484b'],['#cea8a7','#4b303a']];
  return Object.fromEntries(fixtures().map((row,i)=>{const [light,dark]=palettes[i];const words=row.movie_data.nameRu.split(' ');return [`/assets/demo-${i}.svg`,{type:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="450" height="675" viewBox="0 0 450 675"><defs><linearGradient id="g" x2="0.5" y2="1"><stop stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs><rect width="450" height="675" fill="url(#g)"/><circle cx="${100+i*25}" cy="250" r="160" fill="${dark}" opacity=".5"/><circle cx="300" cy="190" r="105" fill="${light}" opacity=".6"/><path d="M0 460L280 120 450 380V675H0Z" fill="${dark}" opacity=".7"/><path d="M0 530L230 320 450 530V675H0Z" fill="${dark}" opacity=".8"/><text x="225" y="55" fill="${dark}" font-family="Arial,sans-serif" font-size="11" text-anchor="middle" letter-spacing="4">A FICTIONAL FILM · TEST ONLY</text>${words.map((word,j)=>`<text x="225" y="${420+j*53}" fill="#f4eee1" font-family="Georgia,serif" font-size="48" text-anchor="middle">${word}</text>`).join('')}<text x="225" y="625" fill="${light}" font-family="Arial,sans-serif" font-size="10" letter-spacing="3" text-anchor="middle">M &amp; E · DEMONSTRATION</text></svg>`}];}));
}
