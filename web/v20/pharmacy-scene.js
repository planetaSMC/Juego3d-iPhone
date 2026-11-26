/* ============================================================
   RASMATIC V20 Â· Escena de farmacia extraÃ­da del HTML de referencia
   ------------------------------------------------------------
   GeometrÃ­as, materiales, texturas canvas, personajes, estanterÃ­as,
   cinta, mostrador y mÃ¡quina RASMATIC BOT del HTML analizado con REA.
   No incluye el loop ni las reglas del HTML: el juego RASMATIC pone
   las mecÃ¡nicas y este mÃ³dulo solo construye/actualiza la escena.
   ============================================================ */
(function () {
  'use strict';

  window.RasmaticPharmacy = function (opts) {
    const THREE = window.THREE;
    const renderer = opts.renderer;
    const camera = opts.camera;
    const player = opts.player || { x: 46.8, z: 9.4, y: 0, yaw: Math.PI / 2, pitch: -0.05 };
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const sm = (a, b, v) => { const x = clamp((v - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };

/* â•â•â•â•â•â• DATOS DE MEDICAMENTOS â•â•â•â•â•â• */
const DRUGS=[
  {name:'Ibuprofeno',   bg:'#c8d8ef',top:'#1f5fd0',band:'#e8453c',dose:'400 mg',count:'20 comp.'},
  {name:'Paracetamol',  bg:'#fff0f0',top:'#e8453c',band:'#1f5fd0',dose:'500 mg',count:'20 comp.'},
  {name:'Amoxicilina',  bg:'#fdf4e3',top:'#f08a3c',band:'#e8c03c',dose:'500 mg',count:'12 cÃ¡ps.'},
  {name:'Loratadina',   bg:'#eaf5ff',top:'#1f9ad6',band:'#1fa070',dose:'10 mg', count:'10 comp.'},
  {name:'Omeprazol',    bg:'#f5eaff',top:'#7c3aed',band:'#4f46e5',dose:'20 mg', count:'14 cÃ¡ps.'},
  {name:'Diclofenac',   bg:'#fff8e1',top:'#f59e0b',band:'#ef4444',dose:'50 mg', count:'20 comp.'},
  {name:'Metformina',   bg:'#e6f4ea',top:'#16a34a',band:'#15803d',dose:'850 mg',count:'30 comp.'},
  {name:'LosartÃ¡n',     bg:'#fff1f2',top:'#e11d48',band:'#9f1239',dose:'50 mg', count:'30 comp.'},
  {name:'Salbutamol',   bg:'#eff6ff',top:'#2563eb',band:'#1d4ed8',dose:'100 mcg',count:'200 dosis'},
  {name:'Aspirina',     bg:'#fef2f2',top:'#dc2626',band:'#b91c1c',dose:'500 mg',count:'20 comp.'},
  {name:'Naproxeno',    bg:'#f0fdf4',top:'#15803d',band:'#166534',dose:'550 mg',count:'20 comp.'},
  {name:'Vitamina C',   bg:'#fffbeb',top:'#d97706',band:'#b45309',dose:'1000 mg',count:'30 comp.'},
];

DRUGS.push(
 {name:'Vitamina D',bg:'#fff',top:'#f59e0b',band:'#d97706',dose:'2000 UI',count:'60 cÃ¡ps.'},
 {name:'Zinc',bg:'#fff',top:'#0891b2',band:'#0e7490',dose:'25 mg',count:'30 comp.'},
 {name:'Calcio',bg:'#fff',top:'#9333ea',band:'#7e22ce',dose:'600 mg',count:'60 comp.'});
const CATS=[{n:'Estante A',d:[0,1,9,10,5]},{n:'Estante B',d:[2,4,3,8]},{n:'Estante C',d:[7,6,11,12,13,14]}];
const CUST=['Sra. Marta','Don Ernesto','LucÃ­a','TomÃ¡s','Dra. PÃ©rez','Valentina','Sr. GÃ³mez'];
const FF='Arial Black,Arial,sans-serif';
function roundRectPath(x, a, b, w, h, r){
  x.beginPath();
  x.moveTo(a+r,b);x.lineTo(a+w-r,b);x.quadraticCurveTo(a+w,b,a+w,b+r);
  x.lineTo(a+w,b+h-r);x.quadraticCurveTo(a+w,b+h,a+w-r,b+h);
  x.lineTo(a+r,b+h);x.quadraticCurveTo(a,b+h,a,b+h-r);
  x.lineTo(a,b+r);x.quadraticCurveTo(a,b,a+r,b);x.closePath();
}
const FRONT_CANVAS={};
function frontCanvas(d){
  const key=d.name;
  if(FRONT_CANVAS[key]) return FRONT_CANVAS[key];
  const i=DRUGS.indexOf(d);
  const c=document.createElement('canvas');c.width=512;c.height=320;const x=c.getContext('2d');
  /* V21: caja de color saturado con etiqueta central limpia. El color del
     producto domina la caja y el diseÃ±o cambia por medicamento. */
  x.fillStyle=d.top;x.fillRect(0,0,512,320);
  x.fillStyle=d.band;x.fillRect(0,0,512,10);
  for(let k=-2;k<7;k++){
    x.fillStyle='rgba(255,255,255,.07)';
    x.beginPath();x.moveTo(k*92,0);x.lineTo(k*92+44,0);x.lineTo(k*92-110,320);x.lineTo(k*92-154,320);x.closePath();x.fill();
  }
  /* Marca superior */
  x.fillStyle='rgba(255,255,255,.92)';x.fillRect(0,14,512,42);
  x.fillStyle=d.band;x.font='900 22px '+FF;x.textBaseline='middle';x.textAlign='left';
  x.fillText('RASMATIC PHARMA',20,36);
  x.beginPath();x.arc(470,35,17,0,7);x.fill();
  x.fillStyle='#fff';x.fillRect(466,25,8,20);x.fillRect(460,31,20,8);
  /* Etiqueta central */
  x.fillStyle=d.bg||'#ffffff';roundRectPath(x,26,74,460,168,18);x.fill();
  x.strokeStyle='rgba(15,42,85,.18)';x.lineWidth=3;x.stroke();
  x.fillStyle='#10213f';let fs=70;x.font='900 '+fs+'px '+FF;x.textAlign='center';
  while(x.measureText(d.name).width>420&&fs>24){fs-=3;x.font='900 '+fs+'px '+FF;}
  x.fillText(d.name,256,140);
  x.fillStyle=d.band;roundRectPath(x,58,168,168,48,12);x.fill();
  x.fillStyle='#fff';x.font='900 28px '+FF;x.fillText(d.dose,142,192);
  x.fillStyle='#334155';x.font='800 24px Arial,sans-serif';x.fillText(d.count,360,192);
  /* PatrÃ³n inferior distinto por medicamento */
  x.fillStyle=d.band;x.fillRect(0,264,512,56);
  x.fillStyle='rgba(255,255,255,.9)';
  if(i%3===0){for(let k=0;k<22;k++)x.fillRect(18+k*23,274,8,36);}
  else if(i%3===1){for(let k=0;k<18;k++){x.beginPath();x.arc(24+k*27,292,6,0,7);x.fill();}}
  else {for(let k=0;k<16;k++){x.fillRect(16+k*31,292,14,6);x.fillRect(23+k*31,285,6,20);}}
  x.fillStyle='#fff';x.font='900 20px '+FF;x.textAlign='left';x.fillText('+',14,258);
  x.textAlign='right';x.fillText('RASMATIC VR',498,258);
  FRONT_CANVAS[key]=c;
  return c;
}
function makeBoxFront(d){
  const t=new THREE.CanvasTexture(frontCanvas(d));t.anisotropy=8;return t;
}
const SIDE_CANVAS={};
function makeBoxSide(d){
  const key=d.name;
  if(!SIDE_CANVAS[key]){
    const c=document.createElement('canvas');c.width=256;c.height=320;const x=c.getContext('2d');
    x.fillStyle=d.top;x.fillRect(0,0,256,320);
    x.fillStyle=d.band;x.fillRect(0,0,256,38);x.fillRect(0,282,256,38);
    x.fillStyle=d.bg||'#fff';roundRectPath(x,22,58,212,196,14);x.fill();
    x.save();x.translate(128,156);x.rotate(-Math.PI/2);x.fillStyle='#10213f';let fs=46;x.font='900 '+fs+'px '+FF;
    while(x.measureText(d.name).width>180&&fs>18){fs-=3;x.font='900 '+fs+'px '+FF;}
    x.textAlign='center';x.textBaseline='middle';x.fillText(d.name,0,0);x.restore();
    x.fillStyle='#fff';x.font='900 16px '+FF;x.textAlign='center';x.fillText('RASMATIC',128,304);
    SIDE_CANVAS[key]=c;
  }
  return new THREE.CanvasTexture(SIDE_CANVAS[key]);
}
const DRUG_IMG={};
function drugImageURL(d){
  const key=d.name;
  if(!DRUG_IMG[key]) DRUG_IMG[key]=frontCanvas(d).toDataURL('image/png');
  return DRUG_IMG[key];
}
const MC=[];
function drugKit(d){const i=DRUGS.indexOf(d);if(!MC[i]){const f=makeBoxFront(d),sd=makeBoxSide(d);
  const mk=(map,col)=>new THREE.MeshStandardMaterial(map?{map,roughness:.6,color:0xffffff}:{color:col,roughness:.6});
  MC[i]={f,m:[mk(sd),mk(sd),mk(null,d.top),mk(null,d.band),mk(f),mk(sd)]};}return MC[i];}
function makeDrugMats(d){return drugKit(d).m;}

/* â•â•â•â•â•â• MOTOR 3D â•â•â•â•â•â• */
const GOAL=5, BG=0xbcd3c8, EYE=3.6;
const R = renderer;
const scene = opts.scene;
const cam = camera;
scene.background = new THREE.Color(BG);
scene.fog = new THREE.Fog(BG, 38, 105);

scene.add(new THREE.HemisphereLight(0xf0fff8,0x8fb8a0,.55));
const sun=new THREE.DirectionalLight(0xfff0e0,0.38);
sun.position.set(15,30,10); scene.add(sun);
const sun2=new THREE.DirectionalLight(0xe8f4ff,0.14);
sun2.position.set(-10,20,20); scene.add(sun2);

const std=(c,r=.6,m=0)=>new THREE.MeshStandardMaterial({color:c,roughness:r,metalness:m});
const addMesh=(geo,mat,x,y,z,p=scene)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);p.add(m);return m;};
const bx=(w,h,d,mat,x,y,z,p=scene)=>addMesh(new THREE.BoxGeometry(w,h,d),mat,x,y,z,p);

/* â•â•â•â•â•â• PISO â•â•â•â•â•â• */
const floorCanvas=document.createElement('canvas'); floorCanvas.width=floorCanvas.height=256;
const fc=floorCanvas.getContext('2d');
fc.fillStyle='#d6e6de'; fc.fillRect(0,0,256,256);
fc.fillStyle='#c3d8cd'; fc.fillRect(0,0,128,128); fc.fillRect(128,128,128,128);
fc.strokeStyle='rgba(120,160,140,.5)'; fc.lineWidth=2;
for(let i=0;i<2;i++)for(let j=0;j<2;j++)fc.strokeRect(i*128,j*128,128,128);
const floorTex=new THREE.CanvasTexture(floorCanvas);
floorTex.wrapS=floorTex.wrapT=THREE.RepeatWrapping; floorTex.repeat.set(14,8); floorTex.anisotropy=8;
const fl=new THREE.Mesh(new THREE.PlaneGeometry(54.6,31.2),new THREE.MeshStandardMaterial({map:floorTex,roughness:.5,metalness:.02}));
fl.rotation.x=-Math.PI/2; fl.position.set(27.3,0,15.6); scene.add(fl);

/* â•â•â•â•â•â• PAREDES FARMACIA â•â•â•â•â•â• */
// Pared = parte baja azul oscuro + franja verde + parte alta azul
function makeWallTex(){
  const c=document.createElement('canvas'); c.width=512; c.height=512; const q=c.getContext('2d');
  q.fillStyle='#dfeae4'; q.fillRect(0,0,512,512);
  q.fillStyle='#8fc2aa'; q.fillRect(0,230,512,282);
  q.strokeStyle='rgba(60,120,90,.18)'; q.lineWidth=2;
  for(let i=0;i<512;i+=64){q.beginPath();q.moveTo(i,230);q.lineTo(i,512);q.stroke();}
  for(let j=230;j<512;j+=64){q.beginPath();q.moveTo(0,j);q.lineTo(512,j);q.stroke();}
  q.fillStyle='#1fa070'; q.fillRect(0,214,512,18);
  q.fillStyle='#1f5fd0'; q.fillRect(0,204,512,6);
  return new THREE.CanvasTexture(c);
}
const wallTex=makeWallTex();
wallTex.wrapS=wallTex.wrapT=THREE.RepeatWrapping; wallTex.repeat.set(7,1);
const wallMat=new THREE.MeshStandardMaterial({map:wallTex,roughness:.85});
// Paredes perimetrales
[[55,.4,27.3,14,-.2],[55,.4,27.3,14,31.4]].forEach(([w,d,x,y,z])=>bx(w,y,d,wallMat,x,y/2,z));
bx(.4,14,32,wallMat,-.2,7,15.6); bx(.4,14,32,wallMat,54.8,7,15.6);

/* Techo */
bx(55,0.3,32,std(0xc4d3cc,.95),27.3,14,15.6);
const panM=new THREE.MeshBasicMaterial({color:0xffe9c9});
for(let zz=4;zz<=28;zz+=8)for(let xx=5;xx<=50;xx+=9){
  bx(6,.08,1.2,panM,xx,13.8,zz);
  if((xx===5||xx===23||xx===41)&&(zz===4||zz===20)){const pl=new THREE.PointLight(0xffe8cc,.42,38); pl.position.set(xx,12,zz); scene.add(pl);}
}
const mainLight=new THREE.PointLight(0xffe2c0,.28,70); mainLight.position.set(27,11,16); scene.add(mainLight);

/* â•â•â•â•â•â• LETRERO FARMACIA â•â•â•â•â•â• */
const SIGN_MAIN='FARMACIA RASMATIC';
const SIGN_SUB='SAN RAFAEL Â· MENDOZA  â€”  SALUD Y BIENESTAR';
(()=>{
  const c=document.createElement('canvas'); c.width=1024; c.height=180;
  const q=c.getContext('2d');
  const gr=q.createLinearGradient(0,0,1024,0);
  gr.addColorStop(0,'#0a2a60'); gr.addColorStop(.5,'#1f5fd0'); gr.addColorStop(1,'#0a2a60');
  q.fillStyle=gr; q.fillRect(0,0,1024,180);
  q.fillStyle='#1fa070'; q.fillRect(0,165,1024,15);
  q.fillStyle='#fff'; q.font='900 82px Orbitron,sans-serif';
  q.textAlign='center'; q.textBaseline='middle'; q.font='900 70px Orbitron,Arial,sans-serif';q.fillText(SIGN_MAIN,512,70);q.font='700 26px Arial,sans-serif';q.fillText(SIGN_SUB,512,128);
  const m=new THREE.Mesh(new THREE.PlaneGeometry(18,3.2),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c)}));
  m.position.set(27.3,10.8,.5); scene.add(m);
})();

/* Cruces farmacia */
(()=>{
  const c=document.createElement('canvas'); c.width=c.height=128;
  const q=c.getContext('2d');
  q.fillStyle='#1fa070';
  q.fillRect(48,4,32,120); q.fillRect(4,48,120,32);
  const mat=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),transparent:true});
  [4,50].forEach(x=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(3,3),mat);m.position.set(x,11,.5);scene.add(m);});
})();

/* â•â•â•â•â•â• ESTANTERÃAS (llenas) â•â•â•â•â•â• */
const shelfMat=std(0xdfe9e4,.5,.05), frameMat=std(0xb78a5b,.65), greenM=std(0x1fa070,.5,.1);
const ledStripM=new THREE.MeshBasicMaterial({color:0x9ff5d8});
const steel=std(0xb9c2c7,.3,.85);
const SB=[], BOXG=new THREE.BoxGeometry(1.15,.95,.5);
function signMesh(t,w,col){
  const c=document.createElement('canvas');c.width=640;c.height=110;const q=c.getContext('2d');
  q.fillStyle=col;q.fillRect(0,0,640,110);q.fillStyle='rgba(255,255,255,.2)';q.fillRect(0,0,640,10);
  q.fillStyle='#fff';q.font='900 48px '+FF;q.textAlign='center';q.textBaseline='middle';
  let fs=48;while(q.measureText(t.toUpperCase()).width>600&&fs>20){fs-=2;q.font='900 '+fs+'px '+FF;}
  q.fillText(t.toUpperCase(),320,58);
  const tx=new THREE.CanvasTexture(c);tx.anisotropy=8;
  return new THREE.Mesh(new THREE.PlaneGeometry(w,w*110/640),new THREE.MeshBasicMaterial({map:tx}));
}
function stockRow(g,ly,list,span,zf,fy,off,sh=SHP.length-1){
  const n=Math.floor(span/1.3);
  for(let i=0;i<n;i++){
    const di=list[Math.floor((i+off)/2)%list.length];
    const b=new THREE.Mesh(BOXG,makeDrugMats(DRUGS[di]));
    b.position.copy(g.localToWorld(new THREE.Vector3(-span/2+.65+i*1.3,ly+.54,zf)));
    b.rotation.y=g.rotation.y+fy;
    b.userData={home:b.position.clone(),n:di,ry:b.rotation.y,sh:sh};
    scene.add(b);SB.push(b);
  }
}
const ALL=[...Array(DRUGS.length).keys()];
const SW=7.8,SHP=[],SGN=[],PL=[.1,1.5,2.9,4.3];
function makeShelf(cx,cz,ry,cat,list){
  const g=new THREE.Group();g.position.set(cx,0,cz);g.rotation.y=ry;scene.add(g);g.updateMatrixWorld(true);SHP.push({x:cx,z:cz,d:list,a:ry});
  bx(SW,5.8,.12,frameMat,0,2.9,-1.15,g);
  [...PL,5.7].forEach((y,i)=>{bx(SW,.12,2.4,shelfMat,0,y,0,g);
    if(i<4){bx(SW-.4,.04,.06,ledStripM,0,y+1.3,1.1,g);stockRow(g,y,list,SW,.75,0,i*2);}});
  bx(.12,5.8,2.4,frameMat,-SW/2,2.9,0,g);bx(.12,5.8,2.4,frameMat,SW/2,2.9,0,g);
  bx(SW+.2,.25,2.5,greenM,0,5.85,0,g);bx(SW-.4,1.5,.2,shelfMat,0,6.7,0,g);
  const sg=signMesh(cat,SW-.6,['#14804f','#1f5fd0','#c2410c'][SHP.length-1]);sg.position.set(0,6.7,.11);g.add(sg);SGN.push(sg.material);
}
/* Puesto de atenciÃ³n: el jugador estÃ¡ en (13.2, 8); estantes en arco a la izquierda, cinta a la derecha */
const P=(px,py)=>[(px-30)*.08,(py-40)*.08];
/* U abierta: norte, este y sur, sin superposiciÃ³n, con el jugador en el centro */
[[47,3.2,0],[52.3,9.5,-90],[47,15.6,180]].forEach(([x,z,a],i)=>makeShelf(x,z,a*Math.PI/180,CATS[i].n,CATS[i].d));

/* â•â•â•â•â•â• DECORACIÃ“N â•â•â•â•â•â• */
function plant(x,z){const gr=new THREE.Group();gr.position.set(x,0,z);scene.add(gr);
  addMesh(new THREE.CylinderGeometry(.6,.45,1.2,12),std(0xf2f2f2,.5),0,.6,0,gr);
  const lf=std(0x2e9b5a,.8);[[0,2.1,0,.9],[.5,1.8,.2,.6],[-.45,1.9,-.2,.65]].forEach(([a,b,c,r])=>addMesh(new THREE.SphereGeometry(r,10,8),lf,a,b,c,gr));}
[[1.8,30],[52.5,30.4],[1.8,15.8]].forEach(p=>plant(...p));
bx(6,.5,1.6,std(0x1f5fd0,.6),44,.7,28.8);bx(6,1,.4,std(0x1f5fd0,.6),44,1.4,29.6);
const pst=signMesh('Consulte a su farmacÃ©utico',10,'#1f5fd0');pst.position.set(54.4,6,22);pst.rotation.y=-Math.PI/2;scene.add(pst);
const pst2=signMesh('Gracias por su visita',10,'#14804f');pst2.position.set(27.3,8,31);pst2.rotation.y=Math.PI;scene.add(pst2);
const DECO=[];
function decoShelf(cx,cz,w,two,ry=0){
  const g=new THREE.Group();g.position.set(cx,0,cz);g.rotation.y=ry;scene.add(g);g.updateMatrixWorld(true);const n0=SB.length;
  if(two)bx(w,5.5,.1,frameMat,0,2.75,0,g);else bx(w,5.8,.12,frameMat,0,2.9,-1.1,g);
  (two?[-1,1]:[1]).forEach(sd=>{const zo=two?sd*1.1:0;
    PL.slice(0,two?3:4).forEach(y=>{bx(w,.12,two?1.9:2.4,shelfMat,0,y,zo,g);stockRow(g,y,ALL,w,two?sd*1.6:.75,sd>0?0:Math.PI,Math.floor(Math.random()*9),-1);});
    bx(w+.2,.25,two?2.2:2.5,greenM,0,two?4.4:5.85,zo,g);});
  [-w/2,w/2].forEach(x=>bx(.12,two?4.4:5.8,two?4.4:2.4,frameMat,x,two?2.2:2.9,0,g));
  {const hx=w/2+.25,hz=two?2.2:1.3,q=Math.abs(Math.sin(ry))>.5,ax=q?hz:hx,az=q?hx:hz;DECO.push([cx-ax,cx+ax,cz-az,cz+az]);}
}
// Estantes frontales (zona de exhibiciÃ³n): separados mÃ¡s para pasillos amplios
[0,1,2,3].forEach(i=>decoShelf(5.5+10.6*i,1.35,8.5,false));
// Estantes centrales dobles: separados entre sÃ­ para pasillos caminables
decoShelf(10,25.5,7,true);decoShelf(27,25.5,7,true);decoShelf(43,24.5,7,true);
// Estantes laterales (pared izquierda): separados
decoShelf(1.3,9.0,8,false,Math.PI/2);decoShelf(1.3,21.5,8,false,Math.PI/2);
// Estante lateral derecho
decoShelf(53.4,25,8,false,-Math.PI/2);
const glassD=new THREE.Mesh(new THREE.BoxGeometry(4.6,6,.08),new THREE.MeshStandardMaterial({color:0x7fb4c6,roughness:.15,metalness:.3}));glassD.position.set(27.3,3.1,31.1);scene.add(glassD);
[24.9,29.7].forEach(x=>bx(.25,6.4,.3,steel,x,3.2,31.1));bx(5,.25,.3,steel,27.3,6.3,31.1);
const ab=signMesh('ABIERTO Â· RASMATIC',3.6,'#c0392b');ab.position.set(27.3,4.2,31);ab.rotation.y=Math.PI;scene.add(ab);
[['PerfumerÃ­a y dermocosmÃ©tica',9,'#7c3aed',0.15,6,20,1],['Ofertas de la semana',9,'#c2410c',0.15,6,26,1],['Control de presiÃ³n Â· Vacunatorio',8,'#0891b2',46,9,0.3,0]].forEach(([t,w,c,x,y,z,side])=>{const p=signMesh(t,w,c);p.position.set(x,y,z);if(side)p.rotation.y=Math.PI/2;scene.add(p);});

/* â•â•â•â•â•â• CINTA TRANSPORTADORA (en L) â•â•â•â•â•â• */
const BTOP=1.0, beltLed=new THREE.MeshBasicMaterial({color:0x5a6b66});
function mkBeltTex(){const c=document.createElement('canvas');c.width=c.height=64;const q=c.getContext('2d');
  q.fillStyle='#23272b';q.fillRect(0,0,64,64);q.fillStyle='#3a4046';q.fillRect(0,0,64,7);q.fillStyle='#181b1e';q.fillRect(0,7,64,3);
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;}
function beltPart(cx,cz,L,aX,tex){
  bx(aX?L:2.2,.16,aX?2.2:L,steel,cx,BTOP-.2,cz);
  [-1,1].forEach(sd=>{const ox=aX?0:sd*1.05,oz=aX?sd*1.05:0;
    bx(aX?L:.14,.34,aX?.14:L,steel,cx+ox,BTOP+.02,cz+oz);bx(aX?L-.4:.05,.05,aX?.05:L-.4,beltLed,cx+ox*.93,BTOP+.2,cz+oz*.93);
    for(let k=-L/2+.8;k<=L/2;k+=3.4)bx(.12,BTOP-.3,.12,steel,aX?cx+k:cx+sd*.95,(BTOP-.3)/2,aX?cz+sd*.95:cz+k);});
  tex.repeat.set(1,L/1.1);
  const g=new THREE.PlaneGeometry(1.9,L);g.rotateX(-Math.PI/2);if(aX)g.rotateY(Math.PI/2);
  const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({map:tex,roughness:.9}));m.position.set(cx,BTOP+.01,cz);scene.add(m);
}
const arrowTex=mkBeltTex(), arrowTex2=mkBeltTex();
beltPart(40.4,7.1,13.6,false,arrowTex); beltPart(33.6,12.7,11.2,true,arrowTex2);

/* â•â•â•â•â•â• GENTE â•â•â•â•â•â• */
/* â•â•â•â•â•â• PERSONAS (modelo cartoon: sombreado toon + contorno) â•â•â•â•â•â• */
const TOON=(()=>{const d=new THREE.DataTexture(new Uint8Array([100,165,225]),3,1,THREE.LuminanceFormat);d.minFilter=d.magFilter=THREE.NearestFilter;d.needsUpdate=true;return d;})();
const TM=(c,e=0)=>new THREE.MeshToonMaterial({color:c,gradientMap:TOON,emissive:e});
const OUTM=new THREE.MeshBasicMaterial({color:0x2a1d3a,side:THREE.BackSide});
function makePerson(shirt,hair,skin,v=0,o={}){
  const g=new THREE.Group(),p={};let G=g;
  /* V21: los clientes se ven a distancia; 16x12 conserva la silueta toon y
     baja mucho el recuento de triÃ¡ngulos en iPhone/VR. */
  const SEG=o.low?[16,12]:[32,24];
  const sk=TM(skin),hr=TM(hair,(o.old||o.white)?0x555555:0),dk=TM(0x1b1420),wh=new THREE.MeshBasicMaterial({color:0xffffff});
  const hs=v%6,coat=v>=8,dress=(hs===2||hs===5)&&v<8;
  const bm=TM(coat?0xf4f8f6:shirt,coat?0x4a4a4a:0);bm.side=THREE.DoubleSide;
  const pn=TM([0x2b3a55,0x5a4630,0x3a4a3a,0x4a4a5c,0x7a3b4a,0x2f5f8a][v%6]);
  const shoe=TM([0xf2f2f2,0x1a1210,0xc0392b][v%3]),sole=TM(0xe9e4da);
  const A=(geo,mat,x,y,z,q=G,sx=1,sy=1,sz=1,ol=0,uni=0)=>{const m=addMesh(geo,mat,x,y,z,q);m.scale.set(sx,sy,sz);
    if(ol){const h=new THREE.Mesh(geo,OUTM);h.scale.set(1+ol,uni?1+ol:1,1+ol);m.add(h);}return m;};
  const SP=(r,mat,x,y,z,q=G,sx=1,sy=1,sz=1)=>A(new THREE.SphereGeometry(r,SEG[0],SEG[1]),mat,x,y,z,q,sx,sy,sz,r>.11?.035/r:0,1);
  const CY=(a,b,h,mat,x,y,z,q=G)=>A(new THREE.CylinderGeometry(a,b,h,o.low?14:28),mat,x,y,z,q,1,1,1,.14);
  const LA=(pts,mat)=>A(new THREE.LatheGeometry(pts.map(a=>new THREE.Vector2(a[0],a[1])),o.low?24:40),mat,0,0,0,g,1,1,.78,.06);
  // piernas
  p.l=new THREE.Group();p.r=new THREE.Group();p.l.position.set(-.22,1.55,0);p.r.position.set(.22,1.55,0);
  [p.l,p.r].forEach(q=>{g.add(q);const lm=dress?sk:pn;
    CY(dress?.11:.16,dress?.09:.12,1.3,lm,0,-.65,0,q);SP(dress?.11:.16,lm,0,-.02,0,q);
    SP(.21,shoe,0,-1.45,.13,q,1,.62,1.75);A(new THREE.CylinderGeometry(.2,.2,.06,24),sole,0,-1.58,.14,q,1,1,1.8);});
  // torso (perfil torneado)
  const T=coat?[[0,1.15],[.62,1.15],[.6,1.5],[.5,2.1],[.46,2.6],[.52,3.0],[.45,3.22],[.2,3.34],[0,3.34]]
    :dress?[[0,1.2],[.78,1.2],[.68,1.4],[.5,1.8],[.4,2.3],[.5,2.95],[.45,3.2],[.2,3.34],[0,3.34]]
    :[[0,1.8],[.42,1.8],[.44,2.1],[.4,2.5],[.5,2.95],[.45,3.2],[.2,3.34],[0,3.34]];
  LA(T,bm);
  if(!coat&&!dress){SP(.46,pn,0,1.8,0,g,1,.6,.8);A(new THREE.CylinderGeometry(.43,.43,.12,28),TM(0x2a2a2a),0,2.0,0,g,1,1,.8);}
  if(dress)A(new THREE.CylinderGeometry(.43,.43,.1,28),TM(0xffffff),0,2.05,0,g,1,1,.8);
  [-.58,.58].forEach(x=>SP(.17,bm,x,3.08,0));
  if(coat){A(new THREE.BoxGeometry(.3,.14,.03),wh,-.26,2.45,.4);
    [[.28,.08],[.08,.28]].forEach(([w,h])=>A(new THREE.BoxGeometry(w,h,.03),new THREE.MeshBasicMaterial({color:0x1fa070}),.24,2.92,.36));}
  if(hs===0&&!coat)A(new THREE.BoxGeometry(.1,.55,.03),TM(0xc0392b),0,2.78,.39);
  if(hs===4&&!coat&&!dress)A(new THREE.BoxGeometry(.7,.1,.03),TM(0xffffff),0,2.55,.4);
  CY(.13,.15,.3,sk,0,3.4,0);
  A(new THREE.TorusGeometry(.2,.06,12,28),coat?TM(0x1f5fd0):wh,0,3.3,0).rotation.x=Math.PI/2;
  // brazos
  p.al=new THREE.Group();p.ar=new THREE.Group();p.al.position.set(-.64,3.1,0);p.ar.position.set(.64,3.1,0);
  [p.al,p.ar].forEach(q=>{g.add(q);CY(.12,.1,1.2,bm,0,-.62,0,q);SP(.1,bm,0,-1.22,0,q);
    CY(.105,.09,.1,wh,0,-1.22,0,q);SP(.14,sk,0,-1.38,0,q,1,1.15,.9);});
  // cabeza grande (escala alrededor del cuello)
  const H=new THREE.Group(),HK=.88;H.scale.setScalar(HK);H.position.y=3.35*(1-HK);g.add(H);g.userData.H=H;G=H;
  SP(.72,sk,0,4.05,0,g===G?g:H,.97,1,.98);SP(.46,sk,0,3.72,.2,H,1,.8,.85);
  [-.72,.72].forEach(x=>SP(.12,sk,x,4.0,-.05,H,.5,1,.65));
  SP(.07,sk,0,3.95,.7,H,1,.9,1);
  const ic=TM([0x3b2616,0x2f5a45,0x35507f,0x5a3a22][v%4]);
  [-.24,.24].forEach(x=>{
    SP(.075,dk,x,4.1,.655,H,1,1.3,.5);SP(.022,wh,x+.02,4.15,.69,H,1,1,.4);
    A(new THREE.TorusGeometry(.1,.016,8,14,Math.PI*.6),TM(0x2a1a10),x,4.27,.6,H,1,.6,1).rotation.z=Math.PI*.2;});
  A(new THREE.TorusGeometry(.1,.018,8,20,Math.PI*.8),TM(0xa84a44),0,3.9,.68,H,1,.6,1).rotation.z=Math.PI*1.1;
  // pelo
  if(o.old){[-1,1].forEach(d=>{SP(.22,hr,d*.62,3.98,-.08,H,.8,1.25,1);SP(.16,hr,d*.55,4.28,-.1,H,1,1,.9);SP(.18,hr,d*.4,3.8,-.45,H,1,1.1,.8);});SP(.3,hr,0,3.85,-.55,H,1.5,.9,.5);}
  else if(hs===3){const hm=TM(0xc0392b);A(new THREE.SphereGeometry(.76,SEG[0],SEG[1],0,Math.PI*2,0,Math.PI*.52),hm,0,4.08,-.04,H);SP(.64,hr,0,3.88,-.24,H,1,.95,.8);}
  else{A(new THREE.SphereGeometry(.76,SEG[0],SEG[1],0,Math.PI*2,0,Math.PI*(hs===5?.38:.5)),hr,0,4.06,-.05,H);
    if(hs!==5){SP(.64,hr,0,3.88,-.25,H,1,1,.82);[-.4,-.2,0,.2,.4].forEach(x=>SP(.2,hr,x,4.5,.45-Math.abs(x)*.5,H,1,.65,.8));}
    if(hs===1)SP(.62,hr,0,3.4,-.28,H,1,2.1,.65);
    if(hs===2){SP(.22,hr,0,4.62,-.2,H);SP(.14,hr,0,4.2,-.75,H,1,2.2,1);}
    if(hs===4){for(let i=0;i<12;i++){const a=i*.524;SP(.2,hr,Math.sin(a)*.58,4.3,Math.cos(a)*.52-.06,H);}SP(.34,hr,0,4.55,-.07,H);}
    if(hs===5)[-.55,.55].forEach(x=>SP(.17,hr,x,3.95,-.07,H,1,1.3,1));}
  if(v%3===1||hs===5){[-.25,.25].forEach(x=>A(new THREE.TorusGeometry(.15,.017,8,24),dk,x,4.12,.7,H,1,1,.35));A(new THREE.BoxGeometry(.12,.02,.02),dk,0,4.14,.7,H);}
  G=g;
  if(v%2===1&&v<8)A(new THREE.BoxGeometry(.68,.88,.32),TM(0x1f5fd0),0,2.58,-.55,g,1,1,1,.05,1);
  if(hs===2&&v<8)A(new THREE.BoxGeometry(.52,.42,.2),TM(0x7c3a1f),.82,1.95,.22,g,1,1,1,.05,1);
  g.userData.p=p;return g;
}
/* â•â•â•â•â•â• ESCRITORIO DE ATENCIÃ“N â•â•â•â•â•â• */
const DX=21.9,DZ=12.7,DH=2.2,BS=3.4;
(()=>{
  const wht=std(0xf2f6f4,.45),top=std(0xd4a96a,.5),blu=std(0x1f5fd0,.45),dk=std(0x181a1f,.4,.5),glow=new THREE.MeshBasicMaterial({color:0x7fffd8}),cream=std(0xfaf7f0,.5);
  // cuerpo del mostrador
  bx(8.0,DH-.18,2.8,cream,DX,(DH-.18)/2,DZ);
  // zÃ³calo azul brillante
  bx(8.06,.18,2.86,blu,DX,.09,DZ);
  // encimera madera
  bx(8.6,.18,3.2,top,DX,DH-.09,DZ);
  // ribete blanco
  bx(8.62,.06,3.22,wht,DX,DH-.21,DZ);
  // lÃ­nea led verde debajo de la encimera
  bx(7.6,.05,.05,glow,DX,DH-.32,DZ+1.62);
  // panel frontal con texto
  const c=document.createElement('canvas');c.width=1024;c.height=256;const q=c.getContext('2d');
  const gr=q.createLinearGradient(0,0,1024,0);gr.addColorStop(0,'#07204d');gr.addColorStop(.42,'#1f5fd0');gr.addColorStop(.58,'#1f5fd0');gr.addColorStop(1,'#07204d');
  q.fillStyle=gr;q.fillRect(0,0,1024,256);
  // franjas decorativas
  q.fillStyle='#1fa070';q.fillRect(0,0,1024,12);q.fillRect(0,244,1024,12);
  // cruces farmacia
  [100,924].forEach(x=>{q.fillStyle='#fff';q.fillRect(x-12,72,24,96);q.fillRect(x-48,108,96,24);});
  // texto
  q.fillStyle='#fff';q.textAlign='center';q.textBaseline='middle';
  q.font='900 80px Orbitron,Arial,sans-serif';q.fillText('ATENCIÃ“N',512,100);
  q.font='600 36px Arial,sans-serif';q.fillStyle='#9ff5d8';q.fillText('ENTREGA DE PEDIDOS',512,168);
  q.font='500 22px Arial,sans-serif';q.fillStyle='rgba(255,255,255,.65)';q.fillText('Farmacia RASMATIC Â· San Rafael',512,210);
  const fp=new THREE.Mesh(new THREE.PlaneGeometry(7.4,1.72),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c)}));
  fp.position.set(DX,1.0,DZ+1.42);scene.add(fp);
  // â”€â”€ MONITOR (lado atendedor, mÃ¡s visible) â”€â”€
  bx(.6,.07,.48,dk,DX-2.2,DH+.04,DZ-.8);         // base monitor
  bx(.14,.46,.14,dk,DX-2.2,DH+.28,DZ-.8);         // pie
  bx(1.3,.82,.09,dk,DX-2.2,DH+.85,DZ-.82);        // pantalla marco
  const scr=new THREE.Mesh(new THREE.PlaneGeometry(1.14,.65),new THREE.MeshBasicMaterial({color:0x1a3a7a}));
  scr.position.set(DX-2.2,DH+.85,DZ-.88);scr.rotation.y=Math.PI;scene.add(scr);
  // brillo pantalla
  const scrGlow=new THREE.Mesh(new THREE.PlaneGeometry(.9,.5),new THREE.MeshBasicMaterial({color:0x4488ff,transparent:true,opacity:.7}));
  scrGlow.position.set(DX-2.2,DH+.95,DZ-.87);scrGlow.rotation.y=Math.PI;scene.add(scrGlow);
  // teclado
  bx(.95,.05,.36,std(0x2a2d33,.5),DX-2.2,DH+.025,DZ-.32);
  // â”€â”€ CAJA REGISTRADORA â”€â”€
  bx(1.3,.46,.92,dk,DX+2.4,DH+.23,DZ-.7);
  bx(.88,.34,.07,std(0x1fa070,.35),DX+2.4,DH+.6,DZ-.95);
  // display caja
  const cjD=new THREE.Mesh(new THREE.PlaneGeometry(.7,.24),new THREE.MeshBasicMaterial({color:0x00cc88}));
  cjD.position.set(DX+2.4,DH+.75,DZ-.99);scene.add(cjD);
  // telÃ©fono / frasco decorativo
  addMesh(new THREE.CylinderGeometry(.15,.15,.22,10),std(0xe8453c,.4),DX-.5,DH+.11,DZ-.65);
  // â”€â”€ RAMPA CINTA â”€â”€
  const rp=bx(2.8,.14,2.1,std(0x242830,.85),26.7,1.44,DZ);rp.rotation.z=-.367;
  [-1,1].forEach(s=>{const r=bx(2.8,.32,.12,steel,26.7,1.55,DZ+s*1.08);r.rotation.z=-.367;});
  // â”€â”€ LETRERO COLGANTE â”€â”€
  const hs=signMesh('AtenciÃ³n al pÃºblico',7.5,'#1f5fd0');hs.position.set(DX,7.6,DZ);scene.add(hs);
  const hs2=signMesh('AtenciÃ³n al pÃºblico',7.5,'#1f5fd0');hs2.position.set(DX,7.6,DZ-.02);hs2.rotation.y=Math.PI;scene.add(hs2);
  // columnas soporte letrero
  [-3.2,3.2].forEach(s=>bx(.07,7.2,.07,steel,DX+s,10.8,DZ));
  // lÃ¡mpara colgante sobre el mostrador
  [-2.4,0,2.4].forEach(x=>{
    bx(.06,.8,.06,steel,DX+x,13.2,DZ);
    const lmp=new THREE.Mesh(new THREE.CylinderGeometry(.3,.2,.22,14),std(0xfff5cc,.4,.7));
    lmp.position.set(DX+x,12.4,DZ);scene.add(lmp);
    const pl=new THREE.PointLight(0xfff2cc,.5,8);pl.position.set(DX+x,12,DZ);scene.add(pl);
  });
})();
const AT=makePerson(0xf4f8f6,0xf4f4f4,0xf1cfae,12,{white:1,low:true});AT.position.set(DX,0,10.3);scene.add(AT);
(()=>{/* farmacÃ©utico mayor: pelo blanco, bigote, anteojos redondos, moÃ±o */
  const wm=TM(0xffffff,0x555555),fr=TM(0x4a3320),rd=std(0xc0392b,.5);
  const H=AT.userData.H,mk=q=>(geo,m,x,y,z,sx=1,sy=1,sz=1)=>{const o=addMesh(geo,m,x,y,z,q);o.scale.set(sx,sy,sz);return o;},A=mk(H),Bd=mk(AT);
  [-.09,.09].forEach(x=>A(new THREE.SphereGeometry(.08,16,12),wm,x,3.915,.7,1.8,.6,.7));
  [-.25,.25].forEach(x=>{A(new THREE.TorusGeometry(.16,.02,8,28),fr,x,4.12,.7,1,1,.4);
    A(new THREE.TorusGeometry(.1,.036,8,16,Math.PI*.7),wm,x,4.31,.62,1,.7,1).rotation.z=Math.PI*.15;});
  A(new THREE.BoxGeometry(.14,.02,.02),fr,0,4.14,.7);
  [-.1,.1].forEach(x=>Bd(new THREE.SphereGeometry(.08,16,12),rd,x,3.24,.4,1.6,.8,.6));
  Bd(new THREE.SphereGeometry(.05,12,10),rd,0,3.24,.42);
  const cn=TM(0x6b4423);Bd(new THREE.CylinderGeometry(.04,.04,2.3,12),cn,.95,1.15,.35);
  Bd(new THREE.TorusGeometry(.12,.04,8,16,Math.PI),cn,.83,2.3,.35);
})();
/* V21: escala humana coherente con el ojo del jugador (3,6 unidades). */
AT.scale.setScalar(0.86);

/* â•â•â•â•â•â• VENTANILLA DE LA MÃQUINA â•â•â•â•â•â• */
(()=>{
  /* V21: la mÃ¡quina conserva su ventanilla y su cartel, pero ya no tiene
     cinta propia. La Ãºnica cinta funcional es la de entrega del jugador. */
  const top=std(0xf4f8f6,.45,.05);
  bx(3.2,.95,2,std(0x16603e,.55),14,.475,18.2);bx(3.5,.1,2.3,top,14,.99,18.2);
  const bs=signMesh('Ventanilla RASMATIC BOT',5.4,'#16603e');bs.position.set(14,5.4,19.4);scene.add(bs);
})();

/* â•â•â•â•â•â• MÃQUINA RASMATIC â•â•â•â•â•â• */
const MW=9.2,MH=10.2,MD=2.6,ZM=1.75,HX=-2.9,HY=1.2;
const SY=[1.05,3,4.95,6.9,8.85];
const aluM=std(0x6f7a88,.4,.8),darkM=std(0x1b1d22,.45,.4),whiM=std(0x5a6573,.4,.15);
const ledM=new THREE.MeshBasicMaterial({color:0x9defff});
const M=new THREE.Group(); M.position.set(12.4,0,9.3); M.rotation.y=Math.PI/2; scene.add(M);
[[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([a,b])=>bx(.2,MH,.2,aluM,a*(MW/2-.1),MH/2,b*(MD/2-.1),M));
[.22,MH-.12].forEach(y=>{bx(MW,.24,.2,aluM,0,y,MD/2-.1,M);bx(MW,.24,.2,aluM,0,y,-MD/2+.1,M);});
bx(MW-.3,MH-.5,.05,std(0x363b44,.7),0,MH/2,-MD/2+.2,M);
bx(1.25,MH-.5,.1,whiM,-MW/2+.75,MH/2,MD/2+.02,M);
bx(.72,.5,.03,new THREE.MeshBasicMaterial({color:0x0f4a6e}),-MW/2+.75,7.7,MD/2+.1,M);
SY.forEach(y=>{bx(7.55,.1,2,std(0x2a2e35,.4,.7),.6,y,-.25,M);bx(7.4,.03,.05,ledM,.6,y-.07,.74,M);});
bx(1.5,.1,1.2,std(0x2a2e35,.4,.7),HX,.4,1.3,M);
bx(1.5,.04,.05,ledM,HX,.46,1.88,M);
// Cartel mÃ¡quina
(()=>{
  const c=document.createElement('canvas'); c.width=512; c.height=128;
  const q=c.getContext('2d');
  q.fillStyle='#16603e'; q.fillRect(0,0,512,128);
  q.fillStyle='#fff'; q.font='900 44px Orbitron,sans-serif';
  q.textAlign='center'; q.textBaseline='middle'; q.fillText('RASMATIC BOT',256,64);
  const m=new THREE.Mesh(new THREE.PlaneGeometry(8,1.5),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c)}));
  m.position.set(13.7,11.5,9.3); m.rotation.y=Math.PI/2; scene.add(m);
})();

/* Cajas de la mÃ¡quina (con texturas) */
const MB=[];
SY.forEach((y,l)=>{
  for(let k=0;k<6;k++){
    const dIdx=(l*6+k)%DRUGS.length;
    const geo=new THREE.BoxGeometry(.9,.8,.5);
    const m=new THREE.Mesh(geo,makeDrugMats(DRUGS[dIdx]));
    m.position.set(-2.4+k*1.2,y+.45,.3);
    m.userData={home:m.position.clone(),n:dIdx,mb:true};
    M.add(m); MB.push(m);
  }
});

/* MÃ¡stil y brazo */
const mast=new THREE.Group(); mast.position.set(HX,0,ZM); M.add(mast);
bx(.22,MH-1.3,.22,aluM,0,5.3,0,mast); bx(.9,.5,.5,darkM,0,.62,0,mast); bx(.5,.3,.4,darkM,0,MH-.4,0,mast);
bx(MW-.2,.1,.12,aluM,0,.5,ZM,M); bx(MW-.2,.12,.12,aluM,0,MH-.4,ZM,M);
const car=new THREE.Group(); car.position.y=HY; mast.add(car);
bx(.6,.75,.5,aluM,0,0,0,car);
const pad=new THREE.Group(); car.add(pad);
bx(.28,.28,.9,aluM,0,0,.45,pad); bx(.9,.78,.08,darkM,0,0,0,pad);


    /* ---------------- optimizaciÃ³n de estanterÃ­as ----------------
       El HTML usa 330 cajas con 6 materiales cada una (~1.980 draw calls).
       Se fusionan las cajas decorativas por material; las 6 cajas de las
       estaciones RASMATIC se mantienen separadas para poder ocultarlas
       cuando se agota el stock. */
    const OCCLUDERS = [];
    function mergeShelfBoxes(boxes, keep) {
      const groups = new Map();
      const geom = BOXG;
      const pos = geom.attributes.position;
      const nor = geom.attributes.normal;
      const uv = geom.attributes.uv;
      const idx = geom.index;
      const keepSet = new Set(keep || []);
      boxes.forEach(function (b) {
        if (keepSet.has(b)) return;
        b.updateMatrixWorld(true);
        const mats = b.material;
        const arr = Array.isArray(mats) ? mats : [mats];
        const m = b.matrixWorld;
        geom.groups.forEach(function (grp) {
          const mat = arr[grp.materialIndex] || arr[0];
          let data = groups.get(mat);
          if (!data) {
            data = { pos: [], nor: [], uv: [] };
            groups.set(mat, data);
          }
          for (let i = 0; i < grp.count; i++) {
            const vi = idx.getX(grp.start + i);
            const v = new THREE.Vector3(pos.getX(vi), pos.getY(vi), pos.getZ(vi)).applyMatrix4(m);
            const n = new THREE.Vector3(nor.getX(vi), nor.getY(vi), nor.getZ(vi)).transformDirection(m);
            data.pos.push(v.x, v.y, v.z);
            data.nor.push(n.x, n.y, n.z);
            data.uv.push(uv.getX(vi), uv.getY(vi));
          }
        });
        b.visible = false;
        if (b.parent) b.parent.remove(b);
      });
      groups.forEach(function (data, mat) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(data.pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(data.nor, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(data.uv, 2));
        const merged = new THREE.Mesh(g, mat);
        merged.frustumCulled = false;
        scene.add(merged);
        OCCLUDERS.push(merged);
      });
      return groups.size;
    }

    /* ---------------- colisiones del HTML ---------------- */
    function blocked(x, z) {
      if (player && player.y >= 2) return false;
      if (x < 0.8 || x > 53.8 || z < 0.8 || z > 30.4) return true;
      if (DECO.some(r => x > r[0] && x < r[1] && z > r[2] && z < r[3])) return true;
      if (x > 39.2 && x < 41.6 && z < 14) return true;
      if (z > 11.3 && z < 14.3 && x > 17.2 && x < 41.6) return true;
      if (x > 10.3 && x < 14.9 && z > 3.8 && z < 14.8) return true;
      if (Math.hypot(x - DX, z - 10.3) < 1.3) return true;
      if (x > 12.6 && x < 15.6 && z > 14.4 && z < 19.6) return true;
      return SHP.some(q => [-2.6, 0, 2.6].some(t =>
        Math.hypot(x - (q.x + t * Math.cos(q.a)), z - (q.z - t * Math.sin(q.a))) < 2.1));
    }

    /* ---------------- adaptador de la mÃ¡quina ---------------- */
    const machine = {
      root: M, mast, car, pad, boxes: MB, spec: [], home: {
        x: HX, y: HY, zm: ZM, ret: 1.6, ext: 0.6, floor: 0, pxOff: 0
      },
      baseRotation: M.rotation.y,
      api: {
        setMast: function (x) { mast.position.x = x; },
        setCar: function (y) { car.position.y = y; },
        setPad: function (e) { pad.position.z = lerp(1.6, 0.6, e) - ZM; },
        apply: function (cnc) {
          this.setMast(cnc.x);
          this.setCar(cnc.y);
          this.setPad(cnc.e);
          if (cnc.box) {
            cnc.box.position.set(cnc.x, cnc.y, lerp(1.6, 0.6, cnc.e) - 0.3);
            cnc.box.rotation.z = Math.sin(performance.now() / 120) * 0.04;
          }
        },
        /* La caja del bot sale por la ventanilla (coordenadas de mundo). */
        deliver: function (box) {
          if (!box) return;
          scene.attach(box);
          box.position.set(14, 1.55, 18.2);
          box.rotation.set(0, 0, 0);
          box.scale.setScalar(0.9);
        }
      }
    };
    MB.forEach(function (m, i) {
      machine.spec.push({
        mesh: m,
        x: m.position.x,
        y: m.position.y,
        d: 0.5,
        h: 0.8,
        lvl: Math.floor(i / 6),
        col: i % 6,
        drug: (Math.floor(i / 6) * 6 + (i % 6)) % DRUGS.length
      });
    });

    /* ---------------- estaciones RASMATIC sobre las estanterÃ­as ---------------- */
    const COLOR_DRUGS = [1, 0, 6, 5, 4, 2]; // rojo, azul, verde, amarillo, violeta, naranja
    const stations = [];
    const allBoxes = SB.filter(b => b.userData && b.userData.sh >= 0);
    function fromStart(a, b) {
      const da = Math.hypot(a.userData.home.x - 46.8, a.userData.home.z - 9.4);
      const db = Math.hypot(b.userData.home.x - 46.8, b.userData.home.z - 9.4);
      return da - db;
    }
    function spaced(b) {
      const p = b.userData.home;
      return stations.every(function (s) {
        return Math.hypot(p.x - s.x, p.z - s.z) >= 2.45;
      });
    }
    COLOR_DRUGS.forEach(function (di, ci) {
      /* V20: cada estaciÃ³n debe ocupar una posiciÃ³n horizontal Ãºnica. Las
         cajas de un mismo estante comparten x/z entre niveles; si se eligen
         dos apiladas, el radio de recogida no puede distinguirlas. Se
         prefiere el medicamento asignado y, si no tiene hueco, se usa otra
         caja cercana. La etiqueta muestra el medicamento real de la caja. */
      const used = stations.map(function (s) { return s.drug; });
      const fresh = allBoxes.filter(b => used.indexOf(b.userData.n) < 0);
      const same = allBoxes.filter(b => b.userData.n === di).sort(fromStart);
      let box = used.indexOf(di) < 0 ? same.filter(spaced)[0] : null;
      if (!box) box = (fresh.length ? fresh : allBoxes).slice().sort(fromStart).filter(spaced)[0];
      if (!box) box = same[0];
      if (!box) return;
      const pos = new THREE.Vector3();
      box.getWorldPosition(pos);
      stations.push({
        color: ci, drug: box.userData.n, box: box, home: box.userData.home.clone(),
        x: pos.x, y: pos.y, z: pos.z
      });
    });

    const stationBoxes = stations.map(function (s) { return s.box; });
    mergeShelfBoxes(SB, stationBoxes);

    const mats = {
      coat: TM(0xf4f8f6), skin: TM(0xf1cfae), hair: TM(0x2b1b12),
      dark: std(0x1b1d22), white: TM(0xffffff), blue: TM(0x1f5fd0),
      green: TM(0x1fa070), gray: std(0xb9c2c7), alu: std(0xb9c2c7, 0.3, 0.85),
      std: std
    };

    const COLORS = [
      { id: 'rojo', name: 'ROJO', css: '#e8453c', hex: 0xe8453c },
      { id: 'azul', name: 'AZUL', css: '#2f7bff', hex: 0x2f7bff },
      { id: 'verde', name: 'VERDE', css: '#22a06b', hex: 0x22a06b },
      { id: 'amarillo', name: 'AMARILLO', css: '#f2c63a', hex: 0xf2c63a },
      { id: 'violeta', name: 'VIOLETA', css: '#8a6fe0', hex: 0x8a6fe0 },
      { id: 'naranja', name: 'NARANJA', css: '#f08a3c', hex: 0xf08a3c }
    ];

    const counter = {
      x: DX, z: DZ, dh: DH,
      npc: { x: DX, z: 10.3 },
      customer: { x: DX, z: 15.7 },
      bot: { x: 14, z: 18.2 },
      kiosk: { x: 12.4, z: 9.3 }
    };

    /* ---------------- modos de cÃ¡mara ---------------- */
    const filmPath = [
      { x: 46.8, z: 28, yaw: Math.PI, pitch: -0.02 },
      { x: 46.8, z: 18, yaw: Math.PI, pitch: -0.02 },
      { x: 40, z: 12, yaw: Math.PI * 0.92, pitch: -0.02 },
      { x: 30, z: 14, yaw: Math.PI * 0.7, pitch: -0.02 },
      { x: 22, z: 18, yaw: Math.PI * 0.55, pitch: -0.02 },
      { x: 14, z: 16, yaw: Math.PI * 0.5, pitch: 0.0 }
    ];

    let beltSpeed = 0;
    const conveyor = {
      top: BTOP,
      entry: { x: 40.4, z: 7.1, y: BTOP + 0.02, radius: 3.4 },
      end: { x: 25.35, z: 12.7, y: 2.10 },
      /* Recorrido real de la cinta en L + rampa al mostrador. La y es la
         superficie; el juego suma media caja para apoyarla. */
      path: [
        { x: 40.4, z: 7.1, y: BTOP + 0.02 },
        { x: 40.4, z: 12.25, y: BTOP + 0.02 },
        { x: 39.1, z: 12.7, y: BTOP + 0.02 },
        { x: 28.2, z: 12.7, y: BTOP + 0.02 },
        { x: 25.35, z: 12.7, y: 2.10 }
      ],
      maxSpeed: 4.5,
      setSpeed: function (v) {
        beltSpeed = Math.max(0, Math.min(4.5, Number(v) || 0));
      },
      getSpeed: function () { return beltSpeed; }
    };

    const api = {
      THREE: THREE, scene: scene, camera: cam, renderer: R,
      playerStart: { x: 46.8, z: 9.4, yaw: Math.PI / 2, pitch: -0.05 },
      eye: EYE, bounds: { minX: 0.8, maxX: 53.8, minZ: 0.8, maxZ: 30.4 },
      blocked: blocked, player: player,
      drugs: DRUGS, cats: CATS, customers: CUST, colors: COLORS,
      shelfBoxes: SB, machineBoxes: MB, shelves: SHP, deco: DECO,
      machine: machine, counter: counter, stations: stations,
      mats: mats, makePerson: makePerson, makeDrugMats: makeDrugMats,
      drugKit: drugKit, signMesh: signMesh, std: std, TM: TM,
      pharmacist: AT, conveyor: conveyor, occluders: OCCLUDERS,
      signs: { main: SIGN_MAIN, open: 'ABIERTO Â· RASMATIC' },
      machineConveyor: false,
      drugImage: function (i) { return drugImageURL(DRUGS[i]); },
      filmPath: filmPath,
      modelTarget: new THREE.Vector3(12.4, 5.1, 9.3),
      logo: { set: function () {} },
      setLogo: function () {},
      update: function (dt) {
        /* La superficie se mueve solo cuando el juego lo pide, a la misma
           velocidad que los paquetes. */
        arrowTex.offset.y += beltSpeed / 1.1 * dt;
        arrowTex2.offset.y -= beltSpeed / 1.1 * dt;
      }
    };

    return api;
  };
})();

