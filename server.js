require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
if(IS_PRODUCTION && (JWT_SECRET === "dev-secret-change-me" || JWT_SECRET.length < 32)) throw new Error("JWT_SECRET doit contenir au moins 32 caractères en production");
const CORS_ORIGIN = process.env.CORS_ORIGIN || "";
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 500);

app.disable("x-powered-by");
app.set("trust proxy", process.env.TRUST_PROXY === "1" ? 1 : false);
app.use((req,res,next)=>{
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("X-Frame-Options","DENY");
  res.setHeader("Referrer-Policy","strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy","camera=(), microphone=(), geolocation=()");
  if(IS_PRODUCTION) res.setHeader("Strict-Transport-Security","max-age=31536000; includeSubDomains");
  next();
});
app.use(cors(CORS_ORIGIN ? {origin:CORS_ORIGIN.split(",").map(x=>x.trim()).filter(Boolean),credentials:false} : {origin:false}));
app.use(express.json({limit:"1mb"}));
app.use(express.urlencoded({extended:true}));
app.use((req,res,next)=>{ if(req.path.startsWith("/uploads/")) return res.status(404).end(); next(); });
app.use(express.static(path.join(__dirname,"public")));
app.get("/api/health", (req,res)=>{
  let dbOk=true;
  try { db.prepare("SELECT 1").get(); } catch(e) { dbOk=false; }
  res.status(dbOk ? 200 : 503).json({status: dbOk ? "ok" : "degraded", service:"afroflix", environment: process.env.NODE_ENV || "development", time:new Date().toISOString()});
});


const DATA_DIR = process.env.DATA_DIR || path.join(__dirname,"data");
fs.mkdirSync(DATA_DIR,{recursive:true});
const db = new Database(path.join(DATA_DIR,"afroflix.db"));
db.pragma("foreign_keys = ON");

function hasColumn(table, column){
  return db.prepare(`PRAGMA table_info(${table})`).all().some(c=>c.name===column);
}
function addColumn(table, column, definition){
  if(!hasColumn(table,column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

db.exec(`
CREATE TABLE IF NOT EXISTS channels(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 slug TEXT UNIQUE NOT NULL,
 description TEXT DEFAULT '',
 category TEXT DEFAULT 'Général',
 logo_url TEXT DEFAULT '',
 banner_url TEXT DEFAULT '',
 stream_url TEXT DEFAULT '',
 is_live INTEGER DEFAULT 0,
 status TEXT DEFAULT 'active',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS channel_programs(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 channel_id INTEGER NOT NULL,
 title TEXT NOT NULL,
 description TEXT DEFAULT '',
 program_type TEXT DEFAULT 'Émission',
 start_time TEXT NOT NULL,
 end_time TEXT NOT NULL,
 poster_url TEXT DEFAULT '',
 movie_id INTEGER,
 status TEXT DEFAULT 'scheduled',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(channel_id) REFERENCES channels(id) ON DELETE CASCADE,
 FOREIGN KEY(movie_id) REFERENCES movies(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS channel_followers(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 channel_id INTEGER NOT NULL,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(user_id,channel_id),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(channel_id) REFERENCES channels(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_channel_programs_time ON channel_programs(channel_id,start_time,end_time);
CREATE INDEX IF NOT EXISTS idx_channel_followers_channel ON channel_followers(channel_id);

CREATE TABLE IF NOT EXISTS users(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 email TEXT UNIQUE NOT NULL,
 password_hash TEXT NOT NULL,
 premium INTEGER DEFAULT 0,
 is_admin INTEGER DEFAULT 0,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS watchlist(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 movie_id INTEGER NOT NULL,
 title TEXT NOT NULL,
 UNIQUE(user_id,movie_id),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS movies(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 genre TEXT NOT NULL,
 year INTEGER,
 rating REAL DEFAULT 0,
 description TEXT,
 premium INTEGER DEFAULT 0,
 poster_url TEXT,
 video_url TEXT,
 duration TEXT,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS creators(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER UNIQUE NOT NULL,
 display_name TEXT NOT NULL,
 bio TEXT DEFAULT '',
 country TEXT DEFAULT 'Bénin',
 status TEXT DEFAULT 'pending',
 social_link TEXT DEFAULT '',
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS watch_history(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 movie_id INTEGER NOT NULL,
 progress_seconds REAL DEFAULT 0,
 duration_seconds REAL DEFAULT 0,
 updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(user_id,movie_id),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(movie_id) REFERENCES movies(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS playback_events(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER,
 movie_id INTEGER NOT NULL,
 event TEXT NOT NULL,
 position_seconds REAL DEFAULT 0,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
 FOREIGN KEY(movie_id) REFERENCES movies(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS notifications(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 type TEXT NOT NULL DEFAULT 'info',
 title TEXT NOT NULL,
 message TEXT NOT NULL,
 link TEXT DEFAULT '',
 is_read INTEGER DEFAULT 0,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id,is_read,created_at);
CREATE TABLE IF NOT EXISTS creator_withdrawals(
 id INTEGER PRIMARY KEY AUTOINCREMENT, creator_id INTEGER NOT NULL, amount REAL NOT NULL,
 method TEXT NOT NULL, destination TEXT NOT NULL, status TEXT DEFAULT 'pending',
 requested_at TEXT DEFAULT CURRENT_TIMESTAMP, processed_at TEXT, admin_note TEXT DEFAULT '',
 FOREIGN KEY(creator_id) REFERENCES creators(id) ON DELETE CASCADE
);
`);

addColumn("movies","creator_id","INTEGER");
addColumn("movies","status","TEXT DEFAULT 'published'");
addColumn("movies","views","INTEGER DEFAULT 0");
addColumn("movies","rejection_reason","TEXT DEFAULT ''");
addColumn("movies","language","TEXT DEFAULT 'Français'");
addColumn("movies","qualities_json","TEXT DEFAULT ''");
addColumn("movies","hls_path","TEXT DEFAULT ''");
addColumn("movies","subtitles_url","TEXT DEFAULT ''");


db.prepare(`UPDATE movies SET status='published' WHERE status IS NULL OR status=''`).run();

const demoChannels=[
 ['AfroFlix TV','afroflix-tv','La chaîne principale : séries, émissions et histoires africaines.','Général','📺','', 'http://localhost:8888/afroflix-tv/index.m3u8', 0],
 ['AfroFlix Music','afroflix-music','Clips, concerts et nouveautés musicales africaines.','Musique','🎵','', 'http://localhost:8888/afroflix-music/index.m3u8', 0],
 ['AfroFlix Films','afroflix-films','Films africains, cinéma et grandes histoires.','Films','🎬','', 'http://localhost:8888/afroflix-films/index.m3u8', 0],
 ['AfroFlix Sport','afroflix-sport','Actualités, magazines et événements sportifs.','Sport','⚽','', 'http://localhost:8888/afroflix-sport/index.m3u8', 0],
 ['AfroFlix Culture','afroflix-culture','Culture, patrimoine, découvertes et documentaires.','Culture','🌍','', 'http://localhost:8888/afroflix-culture/index.m3u8', 0],
 ['AfroFlix Kids','afroflix-kids','Programmes jeunesse et contenus familiaux.','Kids','👶','', 'http://localhost:8888/afroflix-kids/index.m3u8', 0]
];
if(db.prepare('SELECT COUNT(*) c FROM channels').get().c===0){
 const ins=db.prepare('INSERT INTO channels(name,slug,description,category,logo_url,banner_url,stream_url,is_live) VALUES(?,?,?,?,?,?,?,?)');
 const tx=db.transaction(()=>demoChannels.forEach(c=>ins.run(...c))); tx();
}

function publicChannel(c){ return {...c,is_live:!!c.is_live}; }
function channelBySlug(slug){ return db.prepare("SELECT * FROM channels WHERE slug=? AND status='active'").get(slug); }
app.get('/api/channels', rateLimit({max:60}), (req,res)=>{
 const rows=db.prepare("SELECT c.*, (SELECT COUNT(*) FROM channel_followers f WHERE f.channel_id=c.id) follower_count FROM channels c WHERE c.status='active' ORDER BY c.id").all();
 res.json(rows.map(publicChannel));
});
app.get('/api/channels/:slug', rateLimit({max:60}), (req,res)=>{
 const c=channelBySlug(req.params.slug); if(!c) return res.status(404).json({error:'Chaîne introuvable'});
 const programs=db.prepare("SELECT p.*,m.title movie_title FROM channel_programs p LEFT JOIN movies m ON m.id=p.movie_id WHERE p.channel_id=? ORDER BY p.start_time LIMIT 30").all(c.id);
 const now=new Date().toISOString();
 const current=programs.find(p=>p.start_time<=now && p.end_time>now) || null;
 const next=programs.filter(p=>p.end_time>now).slice(0,5);
 res.json({channel:publicChannel(c),current,next,programs});
});
app.post('/api/channels/:id/follow', auth, rateLimit({max:30}), (req,res)=>{
 const c=db.prepare("SELECT * FROM channels WHERE id=? AND status='active'").get(req.params.id); if(!c) return res.status(404).json({error:'Chaîne introuvable'});
 db.prepare('INSERT OR IGNORE INTO channel_followers(user_id,channel_id) VALUES(?,?)').run(req.user.id,c.id);
 res.json({following:true});
});
app.delete('/api/channels/:id/follow', auth, rateLimit({max:30}), (req,res)=>{
 db.prepare('DELETE FROM channel_followers WHERE user_id=? AND channel_id=?').run(req.user.id,req.params.id); res.json({following:false});
});
app.get('/api/channels/:id/programs', rateLimit({max:60}), (req,res)=>{
 const c=db.prepare("SELECT id FROM channels WHERE id=? AND status='active'").get(req.params.id); if(!c) return res.status(404).json({error:'Chaîne introuvable'});
 res.json(db.prepare('SELECT * FROM channel_programs WHERE channel_id=? ORDER BY start_time').all(c.id));
});
app.get('/api/admin/channels', auth, admin, (req,res)=>res.json(db.prepare('SELECT * FROM channels ORDER BY id').all().map(publicChannel)));
app.post('/api/admin/channels', auth, admin, (req,res)=>{
 const name=String(req.body.name||'').trim(), slug=String(req.body.slug||'').trim().toLowerCase().replace(/[^a-z0-9-]+/g,'-');
 if(!name||!slug) return res.status(400).json({error:'Nom et slug requis'});
 try{ const info=db.prepare('INSERT INTO channels(name,slug,description,category,logo_url,banner_url,stream_url,is_live,status) VALUES(?,?,?,?,?,?,?,?,?)').run(name,slug,String(req.body.description||''),String(req.body.category||'Général'),String(req.body.logo_url||''),String(req.body.banner_url||''),String(req.body.stream_url||''),req.body.is_live?1:0,'active'); res.status(201).json(publicChannel(db.prepare('SELECT * FROM channels WHERE id=?').get(info.lastInsertRowid))); }
 catch(e){ res.status(409).json({error:'Ce slug existe déjà'}); }
});
app.put('/api/admin/channels/:id', auth, admin, (req,res)=>{
 const c=db.prepare('SELECT * FROM channels WHERE id=?').get(req.params.id); if(!c) return res.status(404).json({error:'Chaîne introuvable'});
 const name=String(req.body.name??c.name).trim(), slug=String(req.body.slug??c.slug).trim().toLowerCase().replace(/[^a-z0-9-]+/g,'-');
 try{ db.prepare('UPDATE channels SET name=?,slug=?,description=?,category=?,logo_url=?,banner_url=?,stream_url=?,is_live=?,status=? WHERE id=?').run(name,slug,String(req.body.description??c.description),String(req.body.category??c.category),String(req.body.logo_url??c.logo_url),String(req.body.banner_url??c.banner_url),String(req.body.stream_url??c.stream_url),req.body.is_live===undefined?c.is_live:(req.body.is_live?1:0),String(req.body.status??c.status),c.id); res.json(publicChannel(db.prepare('SELECT * FROM channels WHERE id=?').get(c.id))); }
 catch(e){ res.status(409).json({error:'Slug déjà utilisé'}); }
});
app.delete('/api/admin/channels/:id', auth, admin, (req,res)=>{ db.prepare('DELETE FROM channels WHERE id=?').run(req.params.id); res.json({ok:true}); });
app.post('/api/admin/channels/:id/programs', auth, admin, (req,res)=>{
 const c=db.prepare('SELECT id FROM channels WHERE id=?').get(req.params.id); if(!c) return res.status(404).json({error:'Chaîne introuvable'});
 const title=String(req.body.title||'').trim(), start=String(req.body.start_time||''), end=String(req.body.end_time||'');
 if(!title||!start||!end) return res.status(400).json({error:'Titre, début et fin requis'});
 const info=db.prepare('INSERT INTO channel_programs(channel_id,title,description,program_type,start_time,end_time,poster_url,movie_id,status) VALUES(?,?,?,?,?,?,?,?,?)').run(c.id,title,String(req.body.description||''),String(req.body.program_type||'Émission'),start,end,String(req.body.poster_url||''),req.body.movie_id?Number(req.body.movie_id):null,String(req.body.status||'scheduled'));
 res.status(201).json(db.prepare('SELECT * FROM channel_programs WHERE id=?').get(info.lastInsertRowid));
});
app.put('/api/admin/programs/:id', auth, admin, (req,res)=>{ const p=db.prepare('SELECT * FROM channel_programs WHERE id=?').get(req.params.id); if(!p)return res.status(404).json({error:'Programme introuvable'}); db.prepare('UPDATE channel_programs SET title=?,description=?,program_type=?,start_time=?,end_time=?,poster_url=?,movie_id=?,status=? WHERE id=?').run(String(req.body.title??p.title),String(req.body.description??p.description),String(req.body.program_type??p.program_type),String(req.body.start_time??p.start_time),String(req.body.end_time??p.end_time),String(req.body.poster_url??p.poster_url),req.body.movie_id?Number(req.body.movie_id):null,String(req.body.status??p.status),p.id); res.json(db.prepare('SELECT * FROM channel_programs WHERE id=?').get(p.id)); });
app.delete('/api/admin/programs/:id', auth, admin, (req,res)=>{db.prepare('DELETE FROM channel_programs WHERE id=?').run(req.params.id);res.json({ok:true});});


const demoMovies=[
 ["La Vie à Natitingou","Drame",2026,4.8,"Une famille découvre les réalités de la vie entre traditions, rêves et ambitions.","0","/posters/natitingou.jpg","/videos/demo.mp4","08:12"],
 ["Le Dernier Taxi","Drame",2026,4.6,"Un chauffeur de taxi reçoit une dernière course qui va changer sa vie.","0","/posters/taxi.jpg","/videos/demo.mp4","11:20"],
 ["Mariage à Cotonou","Comédie",2026,4.7,"Une cérémonie de mariage tourne à la comédie lorsque les deux familles se rencontrent.","0","/posters/mariage.jpg","/videos/demo.mp4","09:45"],
 ["Le Secret de Ouidah","Mystère",2026,4.9,"Un secret de famille refait surface dans une ville chargée d'histoire.","1","/posters/ouidah.jpg","/videos/demo.mp4","13:10"],
 ["Les Héritiers","Drame",2026,4.5,"Deux héritiers doivent choisir entre l'argent, la famille et leur avenir.","1","/posters/heritiers.jpg","/videos/demo.mp4","15:30"],
 ["Rires du Bénin","Comédie",2026,4.8,"Les meilleurs moments de l'humour béninois réunis dans un programme.","0","/posters/rires.jpg","/videos/demo.mp4","07:50"]
];
const count=db.prepare("SELECT COUNT(*) c FROM movies").get().c;
if(count===0){
 const ins=db.prepare(`INSERT INTO movies(title,genre,year,rating,description,premium,poster_url,video_url,duration,status) VALUES(?,?,?,?,?,?,?,?,?,'published')`);
 const tx=db.transaction(()=>demoMovies.forEach(m=>ins.run(...m)));
 tx();
}

if(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD){
 const existing=db.prepare("SELECT id FROM users WHERE email=?").get(process.env.ADMIN_EMAIL);
 if(!existing){
   const hash=bcrypt.hashSync(process.env.ADMIN_PASSWORD,12);
   db.prepare("INSERT INTO users(name,email,password_hash,is_admin) VALUES(?,?,?,1)")
     .run("Administrateur",process.env.ADMIN_EMAIL,hash);
 }
}

const rateBuckets = new Map();
function rateLimit({windowMs=15*60*1000,max=100}={}){
 return (req,res,next)=>{
   const key=(req.ip||"unknown")+":"+(req.path||"");
   const now=Date.now(); let b=rateBuckets.get(key);
   if(!b || now-b.start>windowMs){ b={start:now,count:0}; rateBuckets.set(key,b); }
   b.count++;
   res.setHeader("X-RateLimit-Limit",max);
   res.setHeader("X-RateLimit-Remaining",Math.max(0,max-b.count));
   if(b.count>max) return res.status(429).json({error:"Trop de requêtes. Réessayez plus tard."});
   next();
 };
}
setInterval(()=>{ const cutoff=Date.now()-30*60*1000; for(const [k,b] of rateBuckets) if(b.start<cutoff) rateBuckets.delete(k); },10*60*1000).unref();

function sign(user){
 return jwt.sign({id:user.id,email:user.email,is_admin:!!user.is_admin},JWT_SECRET,{expiresIn:"7d"});
}
function auth(req,res,next){
 const h=req.headers.authorization||"";
 if(!h.startsWith("Bearer ")) return res.status(401).json({error:"Connexion requise"});
 try{
   const payload=jwt.verify(h.slice(7),JWT_SECRET);
   const user=db.prepare("SELECT * FROM users WHERE id=?").get(payload.id);
   if(!user) return res.status(401).json({error:"Session invalide"});
   req.user=user; next();
 }catch(e){ return res.status(401).json({error:"Session invalide"}); }
}
function admin(req,res,next){
 if(!req.user?.is_admin) return res.status(403).json({error:"Accès administrateur refusé"});
 next();
}
const authRequired = auth;
function premiumActive(userId){ const u=db.prepare("SELECT premium FROM users WHERE id=?").get(userId); return !!u?.premium; }
function creatorApproved(req,res,next){
 const creator=db.prepare("SELECT * FROM creators WHERE user_id=?").get(req.user.id);
 if(!creator || creator.status!=="approved")
   return res.status(403).json({error:"Votre espace créateur doit être approuvé par l'administration"});
 req.creator=creator; next();
}
function publicMovie(m){
 return {...m, premium:!!m.premium, views:Number(m.views||0)};
}

function notify(userId,type,title,message,link=''){
 try{ db.prepare("INSERT INTO notifications(user_id,type,title,message,link) VALUES(?,?,?,?,?)").run(userId,type,title,message,link||''); }catch(e){ console.error('Notification error:',e.message); }
}
function notifyAdmins(type,title,message,link=''){
 const admins=db.prepare("SELECT id FROM users WHERE is_admin=1").all();
 const stmt=db.prepare("INSERT INTO notifications(user_id,type,title,message,link) VALUES(?,?,?,?,?)");
 const tx=db.transaction(()=>admins.forEach(a=>stmt.run(a.id,type,title,message,link||''))); tx();
}

app.get('/api/notifications',auth,rateLimit({max:60}),(req,res)=>{
 const limit=Math.min(Math.max(Number(req.query.limit)||20,1),50);
 const rows=db.prepare("SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT ?").all(req.user.id,limit);
 const unread=db.prepare("SELECT COUNT(*) c FROM notifications WHERE user_id=? AND is_read=0").get(req.user.id).c;
 res.json({notifications:rows,unread:Number(unread)});
});
app.post('/api/notifications/:id/read',auth,rateLimit({max:60}),(req,res)=>{
 const info=db.prepare("UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?").run(req.params.id,req.user.id);
 if(!info.changes)return res.status(404).json({error:'Notification introuvable'});
 res.json({ok:true});
});
app.post('/api/notifications/read-all',auth,rateLimit({max:30}),(req,res)=>{
 db.prepare("UPDATE notifications SET is_read=1 WHERE user_id=? AND is_read=0").run(req.user.id); res.json({ok:true});
});

app.post("/api/auth/register",rateLimit({max:8}), (req,res)=>{
 const {name,email,password}=req.body||{};
 if(!name||String(name).trim().length<2||String(name).trim().length>80||!email||String(email).length>254||!password||password.length<8||password.length>128) return res.status(400).json({error:"Nom, email et mot de passe (8 caractères minimum) requis"});
 try{
  const hash=bcrypt.hashSync(password,12);
  const info=db.prepare("INSERT INTO users(name,email,password_hash) VALUES(?,?,?)").run(name.trim(),email.trim().toLowerCase(),hash);
  const user=db.prepare("SELECT * FROM users WHERE id=?").get(info.lastInsertRowid);
  notify(user.id,'success','Bienvenue sur AfroFlix 👋','Votre compte AfroFlix Bénin est prêt. Découvrez les contenus et personnalisez votre expérience.','/');
  res.json({token:sign(user),user:{id:user.id,name:user.name,email:user.email,premium:!!user.premium,is_admin:!!user.is_admin}});
 }catch(e){res.status(400).json({error:"Cet email est déjà utilisé"});}
});
app.post("/api/auth/login",rateLimit({max:10}), (req,res)=>{
 const {email,password}=req.body||{};
 const user=db.prepare("SELECT * FROM users WHERE email=?").get((email||"").trim().toLowerCase());
 if(!user||!bcrypt.compareSync(password||"",user.password_hash)) return res.status(401).json({error:"Email ou mot de passe incorrect"});
 res.json({token:sign(user),user:{id:user.id,name:user.name,email:user.email,premium:!!user.premium,is_admin:!!user.is_admin}});
});
app.get("/api/me",auth,(req,res)=>res.json({user:{id:req.user.id,name:req.user.name,email:req.user.email,premium:!!req.user.premium,is_admin:!!req.user.is_admin}}));

// Ma liste : ajout, consultation et suppression des contenus sauvegardés.
app.get("/api/watchlist",auth,rateLimit({max:60}),(req,res)=>{
 const rows=db.prepare(`SELECT m.* FROM watchlist w JOIN movies m ON m.id=w.movie_id WHERE w.user_id=? AND m.status='published' ORDER BY w.id DESC`).all(req.user.id).map(publicMovie);
 res.json(rows);
});
app.post("/api/watchlist",auth,rateLimit({max:30}),(req,res)=>{
 const movieId=Number(req.body?.movie_id);
 const m=db.prepare("SELECT * FROM movies WHERE id=? AND status='published'").get(movieId);
 if(!m) return res.status(404).json({error:"Film introuvable"});
 db.prepare("INSERT OR IGNORE INTO watchlist(user_id,movie_id,title) VALUES(?,?,?)").run(req.user.id,m.id,m.title);
 res.json({ok:true});
});
app.delete("/api/watchlist/:movieId",auth,rateLimit({max:30}),(req,res)=>{
 db.prepare("DELETE FROM watchlist WHERE user_id=? AND movie_id=?").run(req.user.id,Number(req.params.movieId));
 res.json({ok:true});
});

app.get("/api/movies",(req,res)=>{
 const rows=db.prepare("SELECT * FROM movies WHERE status='published' ORDER BY created_at DESC").all().map(publicMovie);
 res.json(rows);
});
app.get("/api/movies/:id",(req,res)=>{
 const m=db.prepare("SELECT * FROM movies WHERE id=? AND status='published'").get(req.params.id);
 if(!m) return res.status(404).json({error:"Film introuvable"});
 res.json(publicMovie(m));
});
app.post("/api/movies/:id/view",(req,res)=>{
 const m=db.prepare("SELECT id FROM movies WHERE id=? AND status='published'").get(req.params.id);
 if(!m) return res.status(404).json({error:"Film introuvable"});
 db.prepare("UPDATE movies SET views=COALESCE(views,0)+1 WHERE id=?").run(req.params.id);
 res.json({ok:true});
});

function movieAccess(req,res,next){
 const m=db.prepare("SELECT * FROM movies WHERE id=? AND status='published'").get(req.params.id);
 if(!m) return res.status(404).json({error:"Film introuvable"});
 if(m.premium){
   if(!req.user || !req.user.premium) return res.status(403).json({error:"Contenu Premium : abonnement requis"});
 }
 req.movie=m; next();
}

// Accès sécurisé à la vidéo. Les fichiers doivent rester dans /public/videos ou /public/uploads.
// Cette route supporte HTTP Range pour permettre pause, reprise et seek.
app.get("/api/stream/:id", (req,res,next)=>{
 const m=db.prepare("SELECT * FROM movies WHERE id=? AND status='published'").get(req.params.id);
 if(!m) return res.status(404).json({error:"Film introuvable"});
 if(m.premium){
   return auth(req,res,()=> {
     if(!req.user.premium) return res.status(403).json({error:"Abonnement Premium requis"});
     nextStream(req,res,m);
   });
 }
 nextStream(req,res,m);
});
function nextStream(req,res,m){
 const raw=m.video_url||"";
 if(!raw || /^https?:\/\//i.test(raw)) {
   return res.status(400).json({error:"Ce contenu utilise une URL externe. Configurez un CDN signé/HLS pour la production."});
 }
 const relative=raw.replace(/^\//,"");
 const file=path.resolve(__dirname,"public",relative);
 const publicRoot=path.resolve(__dirname,"public");
 if(!file.startsWith(publicRoot+path.sep) || !fs.existsSync(file)) {
   return res.status(404).json({error:"Fichier vidéo local introuvable"});
 }
 const stat=fs.statSync(file);
 const ext=path.extname(file).toLowerCase();
 const mime={".mp4":"video/mp4",".webm":"video/webm",".mov":"video/quicktime"}[ext]||"application/octet-stream";
 const range=req.headers.range;
 res.setHeader("Accept-Ranges","bytes");
 res.setHeader("Content-Type",mime);
 if(!range){
   res.setHeader("Content-Length",stat.size);
   return fs.createReadStream(file).pipe(res);
 }
 const match=/bytes=(\\d*)-(\\d*)/.exec(range);
 if(!match) return res.status(416).end();
 const start=match[1]?parseInt(match[1],10):0;
 const end=match[2]?parseInt(match[2],10):stat.size-1;
 if(start> end || start>=stat.size) return res.status(416).end();
 const safeEnd=Math.min(end,stat.size-1);
 res.status(206);
 res.setHeader("Content-Range",`bytes ${start}-${safeEnd}/${stat.size}`);
 res.setHeader("Content-Length",safeEnd-start+1);
 fs.createReadStream(file,{start,end:safeEnd}).pipe(res);
}

// Historique et reprise de lecture
app.get("/api/history",auth,(req,res)=>{
 const rows=db.prepare(`SELECT h.*,m.title,m.poster_url,m.genre,m.premium
 FROM watch_history h JOIN movies m ON m.id=h.movie_id
 WHERE h.user_id=? ORDER BY h.updated_at DESC LIMIT 20`).all(req.user.id)
 .map(r=>({...r,premium:!!r.premium}));
 res.json(rows);
});
app.post("/api/history/:movieId",auth,(req,res)=>{
 const movie=db.prepare("SELECT id FROM movies WHERE id=? AND status='published'").get(req.params.movieId);
 if(!movie) return res.status(404).json({error:"Film introuvable"});
 const p=Math.max(0,Number(req.body?.progress_seconds||0));
 const d=Math.max(0,Number(req.body?.duration_seconds||0));
 db.prepare(`INSERT INTO watch_history(user_id,movie_id,progress_seconds,duration_seconds,updated_at)
 VALUES(?,?,?,?,CURRENT_TIMESTAMP)
 ON CONFLICT(user_id,movie_id) DO UPDATE SET progress_seconds=excluded.progress_seconds,duration_seconds=excluded.duration_seconds,updated_at=CURRENT_TIMESTAMP`)
 .run(req.user.id,movie.id,p,d);
 res.json({ok:true});
});
app.delete("/api/history/:movieId",auth,(req,res)=>{
 db.prepare("DELETE FROM watch_history WHERE user_id=? AND movie_id=?").run(req.user.id,req.params.movieId);
 res.json({ok:true});
});
app.post("/api/playback-event",auth,(req,res)=>{
 const {movie_id,event,position_seconds}=req.body||{};
 const movie=db.prepare("SELECT id FROM movies WHERE id=? AND status='published'").get(movie_id);
 if(!movie) return res.status(404).json({error:"Film introuvable"});
 const allowed=["play","pause","seek","complete","start"];
 if(!allowed.includes(event)) return res.status(400).json({error:"Événement invalide"});
 db.prepare("INSERT INTO playback_events(user_id,movie_id,event,position_seconds) VALUES(?,?,?,?)")
 .run(req.user.id,movie_id,event,Number(position_seconds||0));
 res.json({ok:true});
});

// Recommandations simples : genre préféré selon l'historique, puis films populaires.
app.get("/api/recommendations",auth,(req,res)=>{
 const favorite=db.prepare(`SELECT m.genre,COUNT(*) c FROM watch_history h JOIN movies m ON m.id=h.movie_id
 WHERE h.user_id=? GROUP BY m.genre ORDER BY c DESC LIMIT 1`).get(req.user.id);
 let rows;
 if(favorite){
   rows=db.prepare(`SELECT * FROM movies WHERE status='published' AND genre=? AND id NOT IN
    (SELECT movie_id FROM watch_history WHERE user_id=?) ORDER BY views DESC,rating DESC LIMIT 12`)
    .all(favorite.genre,req.user.id);
 }
 if(!rows?.length){
   rows=db.prepare(`SELECT * FROM movies WHERE status='published' AND id NOT IN
    (SELECT movie_id FROM watch_history WHERE user_id=?) ORDER BY views DESC,rating DESC LIMIT 12`).all(req.user.id);
 }
 res.json(rows.map(publicMovie));
});

app.post("/api/creator/apply",auth,(req,res)=>{
 const {display_name,bio,country,social_link}=req.body||{};
 if(!display_name) return res.status(400).json({error:"Nom de créateur requis"});
 const old=db.prepare("SELECT * FROM creators WHERE user_id=?").get(req.user.id);
 if(old && old.status==="approved") return res.status(400).json({error:"Vous êtes déjà créateur approuvé"});
 if(old){
   db.prepare("UPDATE creators SET display_name=?,bio=?,country=?,social_link=?,status='pending' WHERE user_id=?")
     .run(display_name,bio||"",country||"Bénin",social_link||"",req.user.id);
 }else{
   db.prepare("INSERT INTO creators(user_id,display_name,bio,country,social_link) VALUES(?,?,?,?,?)")
     .run(req.user.id,display_name,bio||"",country||"Bénin",social_link||"");
 }
 notify(req.user.id,'creator','Candidature créateur envoyée','Votre candidature a été envoyée à l’administration. Vous serez informé de la décision.','/creator.html');
 notifyAdmins('creator','Nouvelle candidature créateur',`${display_name} a envoyé une candidature créateur.`,'/admin.html');
 res.json({message:"Candidature envoyée. L'administration doit maintenant l'approuver."});
});
app.get("/api/creator/me",auth,(req,res)=>{
 const c=db.prepare("SELECT * FROM creators WHERE user_id=?").get(req.user.id);
 res.json({creator:c||null});
});
app.get("/api/creator/stats",auth,creatorApproved,(req,res)=>{
 const s=db.prepare(`SELECT COUNT(*) total,
 SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) published,
 SUM(CASE WHEN status='pending_review' THEN 1 ELSE 0 END) pending,
 COALESCE(SUM(views),0) views
 FROM movies WHERE creator_id=?`).get(req.creator.id);
 res.json(s);
});
app.get("/api/creator/movies",auth,creatorApproved,(req,res)=>{
 const rows=db.prepare("SELECT * FROM movies WHERE creator_id=? ORDER BY created_at DESC").all(req.creator.id).map(publicMovie);
 res.json(rows);
});
app.post("/api/creator/movies",auth,creatorApproved,(req,res)=>{
 const {title,genre,year,rating,description,premium,poster_url,video_url,duration}=req.body||{};
 if(!title||!genre||!video_url) return res.status(400).json({error:"Titre, genre et URL vidéo sont requis"});
 const info=db.prepare(`INSERT INTO movies(title,genre,year,rating,description,premium,poster_url,video_url,duration,creator_id,status)
 VALUES(?,?,?,?,?,?,?,?,?,?, 'draft')`).run(title,genre,year||null,rating||0,description||"",premium?1:0,poster_url||"",video_url,duration||"",req.creator.id);
 res.json({id:info.lastInsertRowid,message:"Film enregistré comme brouillon"});
});
app.put("/api/creator/movies/:id",auth,creatorApproved,(req,res)=>{
 const m=db.prepare("SELECT * FROM movies WHERE id=? AND creator_id=?").get(req.params.id,req.creator.id);
 if(!m) return res.status(404).json({error:"Film introuvable"});
 if(!["draft","rejected"].includes(m.status)) return res.status(400).json({error:"Seuls les brouillons ou contenus refusés peuvent être modifiés"});
 const {title,genre,year,rating,description,premium,poster_url,video_url,duration}=req.body||{};
 db.prepare(`UPDATE movies SET title=?,genre=?,year=?,rating=?,description=?,premium=?,poster_url=?,video_url=?,duration=?,status='draft',rejection_reason='' WHERE id=? AND creator_id=?`)
 .run(title,genre,year||null,rating||0,description||"",premium?1:0,poster_url||"",video_url||"",duration||"",req.params.id,req.creator.id);
 res.json({message:"Film mis à jour"});
});
app.post("/api/creator/movies/:id/submit",auth,creatorApproved,(req,res)=>{
 const m=db.prepare("SELECT * FROM movies WHERE id=? AND creator_id=?").get(req.params.id,req.creator.id);
 if(!m) return res.status(404).json({error:"Film introuvable"});
 if(!m.video_url) return res.status(400).json({error:"Ajoutez une vidéo avant l'envoi"});
 db.prepare("UPDATE movies SET status='pending_review',rejection_reason='' WHERE id=? AND creator_id=?").run(req.params.id,req.creator.id);
 notify(req.user.id,'video','Vidéo envoyée en modération',`« ${m.title} » a été envoyée à l’administration.`,'/creator.html');
 notifyAdmins('video','Nouveau contenu à modérer',`Le créateur ${req.creator.display_name} a soumis « ${m.title} ».`,'/admin.html');
 res.json({message:"Film envoyé à l'administration pour modération"});
});
app.delete("/api/creator/movies/:id",auth,creatorApproved,(req,res)=>{
 const m=db.prepare("SELECT * FROM movies WHERE id=? AND creator_id=?").get(req.params.id,req.creator.id);
 if(!m) return res.status(404).json({error:"Film introuvable"});
 if(!["draft","rejected"].includes(m.status)) return res.status(400).json({error:"Impossible de supprimer un contenu en cours de publication ou déjà publié"});
 db.prepare("DELETE FROM movies WHERE id=? AND creator_id=?").run(req.params.id,req.creator.id);
 res.json({message:"Contenu supprimé"});
});

app.get("/api/admin/creator-submissions",auth,admin,(req,res)=>{
 const rows=db.prepare(`SELECT m.*, c.display_name creator_name, c.country, u.email
 FROM movies m JOIN creators c ON c.id=m.creator_id JOIN users u ON u.id=c.user_id
 WHERE m.status IN ('pending_review','rejected') ORDER BY m.created_at DESC`).all();
 res.json(rows.map(publicMovie));
});
app.get("/api/admin/creators",auth,admin,(req,res)=>{
 res.json(db.prepare(`SELECT c.*,u.name,u.email,
 (SELECT COUNT(*) FROM movies m WHERE m.creator_id=c.id) movie_count
 FROM creators c JOIN users u ON u.id=c.user_id ORDER BY c.created_at DESC`).all());
});
app.post("/api/admin/creators/:id/approve",rateLimit({max:30}),auth,admin,(req,res)=>{
 const c=db.prepare("SELECT * FROM creators WHERE id=?").get(req.params.id);
 if(!c) return res.status(404).json({error:"Créateur introuvable"});
 db.prepare("UPDATE creators SET status='approved' WHERE id=?").run(req.params.id);
 notify(c.user_id,'success','Candidature créateur approuvée 🎉','Félicitations ! Votre espace créateur AfroFlix est maintenant approuvé.','/creator.html');
 res.json({message:"Créateur approuvé"});
});
app.post("/api/admin/creators/:id/reject",rateLimit({max:30}),auth,admin,(req,res)=>{
 const c=db.prepare("SELECT * FROM creators WHERE id=?").get(req.params.id);
 if(!c) return res.status(404).json({error:"Créateur introuvable"});
 db.prepare("UPDATE creators SET status='rejected' WHERE id=?").run(req.params.id);
 notify(c.user_id,'warning','Candidature créateur refusée','Votre candidature créateur n’a pas été retenue. Vous pouvez la modifier et la soumettre à nouveau.','/creator.html');
 res.json({message:"Candidature refusée"});
});
app.post("/api/admin/movies/:id/approve",rateLimit({max:30}),auth,admin,(req,res)=>{
 const m=db.prepare("SELECT * FROM movies WHERE id=?").get(req.params.id);
 if(!m) return res.status(404).json({error:"Film introuvable"});
 db.prepare("UPDATE movies SET status='published',rejection_reason='' WHERE id=?").run(req.params.id);
 if(m.creator_id){ const c=db.prepare("SELECT user_id FROM creators WHERE id=?").get(m.creator_id); if(c) notify(c.user_id,'success','Vidéo publiée 🎬',`« ${m.title} » est maintenant disponible sur AfroFlix.`,'/creator.html'); }
 res.json({message:"Film publié"});
});
app.post("/api/admin/movies/:id/reject",rateLimit({max:30}),auth,admin,(req,res)=>{
 const {reason}=req.body||{};
 const m=db.prepare("SELECT * FROM movies WHERE id=?").get(req.params.id);
 if(!m) return res.status(404).json({error:"Film introuvable"});
 const finalReason=reason||"Contenu à corriger"; db.prepare("UPDATE movies SET status='rejected',rejection_reason=? WHERE id=?").run(finalReason,req.params.id);
 if(m.creator_id){ const c=db.prepare("SELECT user_id FROM creators WHERE id=?").get(m.creator_id); if(c) notify(c.user_id,'warning','Vidéo refusée',`« ${m.title} » a été refusée. Motif : ${finalReason}`,'/creator.html'); }
 res.json({message:"Film refusé avec motif"});
});

app.get("/api/admin/stats",auth,admin,(req,res)=>{
 const movies=db.prepare("SELECT COUNT(*) c FROM movies").get().c;
 const users=db.prepare("SELECT COUNT(*) c FROM users").get().c;
 const premium=db.prepare("SELECT COUNT(*) c FROM users WHERE premium=1").get().c;
 const creators=db.prepare("SELECT COUNT(*) c FROM creators WHERE status='approved'").get().c;
 const pending=db.prepare("SELECT COUNT(*) c FROM movies WHERE status='pending_review'").get().c;
 const publishedViews=db.prepare("SELECT COALESCE(SUM(views),0) c FROM movies WHERE status='published'").get().c;
 const pendingWithdrawals=db.prepare("SELECT COUNT(*) c FROM creator_withdrawals WHERE status='pending'").get().c;
 res.json({movies,users,premium,creators,pending,publishedViews,pendingWithdrawals});
});


// Étape 15 — Administration
app.get("/api/admin/withdrawals",auth,admin,(req,res)=>{
 const rows=db.prepare(`SELECT w.*,c.display_name creator_name,u.email FROM creator_withdrawals w JOIN creators c ON c.id=w.creator_id JOIN users u ON u.id=c.user_id ORDER BY CASE WHEN w.status='pending' THEN 0 ELSE 1 END,w.requested_at DESC`).all();
 res.json(rows);
});
app.post("/api/admin/withdrawals/:id/approve",rateLimit({max:30}),auth,admin,(req,res)=>{
 const w=db.prepare("SELECT * FROM creator_withdrawals WHERE id=?").get(req.params.id);
 if(!w)return res.status(404).json({error:"Demande de retrait introuvable"});
 if(w.status!=="pending")return res.status(400).json({error:"Cette demande est déjà traitée"});
 db.prepare("UPDATE creator_withdrawals SET status='approved',processed_at=CURRENT_TIMESTAMP,admin_note='' WHERE id=?").run(w.id);
 const wc=db.prepare("SELECT user_id FROM creators WHERE id=?").get(w.creator_id); if(wc) notify(wc.user_id,'success','Retrait validé 💰',`Votre retrait de ${Math.round(w.amount).toLocaleString('fr-FR')} FCFA a été validé.`,'/creator-earnings.html');
 res.json({message:"Retrait validé"});
});
app.post("/api/admin/withdrawals/:id/reject",rateLimit({max:30}),auth,admin,(req,res)=>{
 const w=db.prepare("SELECT * FROM creator_withdrawals WHERE id=?").get(req.params.id);
 if(!w)return res.status(404).json({error:"Demande de retrait introuvable"});
 if(w.status!=="pending")return res.status(400).json({error:"Cette demande est déjà traitée"});
 const note=String(req.body?.note||"Demande refusée"); db.prepare("UPDATE creator_withdrawals SET status='rejected',processed_at=CURRENT_TIMESTAMP,admin_note=? WHERE id=?").run(note,w.id);
 const wc=db.prepare("SELECT user_id FROM creators WHERE id=?").get(w.creator_id); if(wc) notify(wc.user_id,'warning','Retrait refusé',`Votre retrait de ${Math.round(w.amount).toLocaleString('fr-FR')} FCFA a été refusé. Motif : ${note}`,'/creator-earnings.html');
 res.json({message:"Retrait refusé"});
});

const uploadDir=path.join(__dirname,"public","uploads");
fs.mkdirSync(uploadDir,{recursive:true});
const storage=multer.diskStorage({
 destination:(req,file,cb)=>cb(null,uploadDir),
 filename:(req,file,cb)=>{
   const ext=path.extname(file.originalname).toLowerCase();
   cb(null,Date.now()+"-"+Math.random().toString(36).slice(2,9)+ext);
 }
});
const upload=multer({
 storage,
 limits:{fileSize:MAX_UPLOAD_MB*1024*1024,files:1},
 fileFilter:(req,file,cb)=>{
   const ok=/^(video\/mp4|video\/webm|video\/quicktime|image\/jpeg|image\/png|image\/webp)$/.test(file.mimetype);
   cb(ok?null:new Error("Type de fichier non autorisé"),ok);
 }
});
app.get("/api/uploads/:name",auth,(req,res)=>{
 const name=path.basename(req.params.name);
 const file=path.resolve(uploadDir,name);
 if(file!==path.join(uploadDir,name) || !fs.existsSync(file)) return res.status(404).end();
 const stat=fs.statSync(file);
 if(!stat.isFile()) return res.status(404).end();
 res.setHeader("Cache-Control","private, no-store");
 res.sendFile(file);
});

app.post("/api/uploads",auth,creatorApproved,upload.single("file"),(req,res)=>{
 if(!req.file) return res.status(400).json({error:"Fichier manquant"});
 res.json({url:"/uploads/"+req.file.filename,type:req.file.mimetype,size:req.file.size});
});
app.use((err,req,res,next)=>{
 if(err instanceof multer.MulterError) return res.status(400).json({error:err.message});
 if(err) return res.status(400).json({error:err.message||"Erreur"});
 next();
});

app.get("/creator.html",(req,res)=>res.sendFile(path.join(__dirname,"public","creator.html")));
app.get("/admin.html",(req,res)=>res.sendFile(path.join(__dirname,"public","admin.html")));
app.get("/player.html",(req,res)=>res.sendFile(path.join(__dirname,"public","player.html")));
app.get("/channels.html",(req,res)=>res.sendFile(path.join(__dirname,"public","channels.html")));
app.get("/channel.html",(req,res)=>res.sendFile(path.join(__dirname,"public","channel.html")));


// Streaming metadata endpoint: supports progressive MP4 now and HLS metadata when configured.
app.get('/api/movies/:id/stream-info', authRequired, (req,res) => {
  const movie = db.prepare("SELECT * FROM movies WHERE id=? AND status='published'").get(req.params.id);
  if(!movie) return res.status(404).json({error:'Film introuvable'});
  if(movie.premium && !premiumActive(req.user.id)) return res.status(403).json({error:'Premium requis'});
  let qualities=[];
  try { qualities=movie.qualities_json ? JSON.parse(movie.qualities_json) : []; } catch(e) {}
  if(!qualities.length && movie.video_url) qualities=[{label:'Auto',url:movie.video_url}];
  res.json({
    id: movie.id, title: movie.title, duration: movie.duration || null,
    hls: movie.hls_path || null, subtitles: movie.subtitles_url || null,
    qualities
  });
});


function creatorForUser(userId) {
  return db.prepare("SELECT * FROM creators WHERE user_id=? AND status='approved'").get(userId);
}

// Creator revenue dashboard. Demo calculation: configurable rate per 1,000 views.
app.get('/api/creator/earnings', authRequired, (req,res) => {
  const creator=creatorForUser(req.user.id);
  if(!creator) return res.status(403).json({error:'Compte Creator approuvé requis'});
  const rate=Math.max(Number(process.env.CREATOR_RATE_PER_1000)||100,0);
  const movies=db.prepare("SELECT id,title,views FROM movies WHERE creator_id=? AND status='published'").all(creator.id);
  const totalViews=movies.reduce((s,m)=>s+Number(m.views||0),0);
  const gross=totalViews/1000*rate;
  const share=Math.min(Math.max(Number(process.env.CREATOR_REVENUE_SHARE)||50,0),100)/100;
  const creatorAmount=gross*share;
  res.json({rate_per_1000:rate,revenue_share_percent:share*100,total_views:totalViews,gross_amount:gross,creator_amount:creatorAmount,movies});
});

app.get('/api/creator/withdrawals', authRequired, (req,res) => {
  const creator=creatorForUser(req.user.id);
  if(!creator) return res.status(403).json({error:'Compte Creator approuvé requis'});
  res.json(db.prepare("SELECT * FROM creator_withdrawals WHERE creator_id=? ORDER BY requested_at DESC").all(creator.id));
});

app.post('/api/creator/withdrawals', authRequired, (req,res) => {
  const creator=creatorForUser(req.user.id);
  if(!creator) return res.status(403).json({error:'Compte Creator approuvé requis'});
  const amount=Number(req.body.amount), method=String(req.body.method||'').trim(), destination=String(req.body.destination||'').trim();
  if(!Number.isFinite(amount)||amount<=0||!method||!destination) return res.status(400).json({error:'Données de retrait invalides'});
  const rate=Math.max(Number(process.env.CREATOR_RATE_PER_1000)||100,0);
  const share=Math.min(Math.max(Number(process.env.CREATOR_REVENUE_SHARE)||50,0),100)/100;
  const movies=db.prepare("SELECT views FROM movies WHERE creator_id=? AND status='published'").all(creator.id);
  const balance=movies.reduce((s,m)=>s+Number(m.views||0),0)/1000*rate*share;
  if(amount>balance) return res.status(400).json({error:'Solde insuffisant'});
  const info=db.prepare("INSERT INTO creator_withdrawals (creator_id,amount,method,destination) VALUES (?,?,?,?)").run(creator.id,amount,method,destination);
  notify(req.user.id,'payment','Demande de retrait envoyée',`Votre demande de ${Math.round(amount).toLocaleString('fr-FR')} FCFA est en attente de validation.`,'/creator-earnings.html');
  notifyAdmins('payment','Nouvelle demande de retrait',`${creator.display_name} demande ${Math.round(amount).toLocaleString('fr-FR')} FCFA.`,'/admin.html');
  res.status(201).json({id:info.lastInsertRowid,status:'pending',amount});
});

app.listen(PORT,()=>console.log(`AfroFlix Bénin lancé sur http://localhost:${PORT}`));
