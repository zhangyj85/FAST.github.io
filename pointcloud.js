/* Procedural placeholder geometry; real FAST clouds are loaded by cloud-viewer.js. */
(function () {
  'use strict';
  const TYPES = {
    char: ['getInt8',1], int8:['getInt8',1], uchar:['getUint8',1], uint8:['getUint8',1],
    short:['getInt16',2], int16:['getInt16',2], ushort:['getUint16',2], uint16:['getUint16',2],
    int:['getInt32',4], int32:['getInt32',4], uint:['getUint32',4], uint32:['getUint32',4],
    float:['getFloat32',4], float32:['getFloat32',4], double:['getFloat64',8], float64:['getFloat64',8]
  };
  const clamp = (n,a,b) => Math.min(b, Math.max(a,n));
  const rnd = seed => () => ((seed = Math.imul(1664525,seed) + 1013904223 | 0) >>> 0) / 4294967296;
  const rgb = (r,g,b) => `rgb(${clamp(Math.round(r),0,255)},${clamp(Math.round(g),0,255)},${clamp(Math.round(b),0,255)})`;

  function syntheticCloud(seed=1) {
    const random = rnd((seed*7919+317)>>>0), p=[];
    const palettes = [
      {floor:[108,137,158],wall:[151,177,195],side:[112,153,172],wood:[185,139,115],decor:[102,195,173]},
      {floor:[102,134,147],wall:[141,177,195],side:[98,145,166],wood:[194,149,112],decor:[99,169,212]},
      {floor:[143,157,134],wall:[181,173,150],side:[134,164,147],wood:[196,154,108],decor:[91,176,136]},
      {floor:[101,125,140],wall:[159,179,186],side:[113,154,168],wood:[196,149,104],decor:[104,181,208]}
    ];
    const pal=palettes[(seed-1)%palettes.length];
    function push(x,y,z,c,jitter=17) {
      const d=(random()-.5)*jitter;
      p.push({x,y,z,c:rgb(c[0]+d,c[1]+d,c[2]+d)});
    }
    function plane(n,point,c) {for(let i=0;i<n;i++){const u=random(),v=random();const [x,y,z]=point(u,v);push(x,y,z,c)}}
    function box(cx,cy,cz,w,h,d,c,n=1600) {
      for(let i=0;i<n;i++){
        const a=random()-.5,b=random()-.5,side=Math.floor(random()*6);
        let x=cx+a*w,y=cy+b*h,z=cz+(random()-.5)*d;
        if(side===0)x=cx-w/2;else if(side===1)x=cx+w/2;
        else if(side===2)y=cy-h/2;else if(side===3)y=cy+h/2;
        else if(side===4)z=cz-d/2;else z=cz+d/2;
        push(x,y,z,c);
      }
    }
    // Each thumbnail has a different procedural *placeholder* cloud; real PLYs replace these.
    if(seed===2){
      // Urban street: buildings, window grids, roadway and a parked car.
      plane(6700,(u,v)=>[(u-.5)*4.7,-1.25,(v-.5)*4],pal.floor);
      box(-1.52,.01,-1.38,1.18,2.45,.86,pal.wall,3200);
      box(.05,-.16,-1.92,1.57,2.06,.16,pal.side,2650);
      box(1.62,-.03,-1.45,.98,2.38,.82,pal.wall,3300);
      for(let x of [-1.84,-1.49,-1.14])for(let y of [-.58,.04,.66])box(x,y,-.922,.18,.31,.014,[192,224,225],95);
      for(let x of [-.46,.0,.47])for(let y of [-.65,-.06,.53])box(x,y,-1.819,.23,.35,.018,[181,217,225],120);
      for(let x of [1.37,1.74])for(let y of [-.52,.11,.70])box(x,y,-.995,.19,.32,.015,[163,216,217],110);
      box(.29,-.97,.96,1.03,.41,.55,pal.decor,1500);
      box(.27,-.71,.94,.56,.13,.45,[128,164,175],390);
      for(let x of [-.08,.70])for(let z of [.6,1.30])box(x,-1.17,z,.09,.17,.11,[49,72,88],120);
      plane(400,(u,v)=>[(u-.5)*.047,-1.235,(v-.5)*2.8+.38],[227,211,176]);
      return p;
    }
    if(seed===3){
      // Stone courtyard with arcade, long bench, and a leafy tree.
      plane(6400,(u,v)=>[(u-.5)*4.7,-1.25,(v-.5)*4],pal.floor);
      plane(3700,(u,v)=>[(u-.5)*4.7,(v-.5)*3-0.02,-1.95],pal.wall);
      box(-1.98,-.02,-.81,.43,2.45,1.55,pal.side,1700);
      for(let x of [-.95,.20,1.35]){
        box(x,-.24,-1.77,.19,1.87,.30,[200,183,151],530);
        box(x+.55,.70,-1.79,.9,.12,.28,[207,192,167],420);
      }
      box(.15,-.70,.65,1.44,.12,.47,pal.wood,920);
      for(let x of [-.48,.75])box(x,-.99,.66,.085,.5,.4,[112,119,111],250);
      box(-1.48,-.46,1.08,.15,1.67,.17,[124,106,85],800);
      for(let i=0;i<2700;i++){
        const theta=random()*Math.PI*2,r=Math.cbrt(random());
        const elev=Math.acos(2*random()-1),x=-1.48+.79*r*Math.sin(elev)*Math.cos(theta);
        const y=.60+.63*r*Math.cos(elev),z=1.08+.70*r*Math.sin(elev)*Math.sin(theta);
        push(x,y,z,[95,153,110],24);
      }
      return p;
    }
    if(seed===4){
      // Workshop: tool storage, workbench, monitor and stacked containers.
      plane(6200,(u,v)=>[(u-.5)*4.7,-1.25,(v-.5)*4],pal.floor);
      plane(3300,(u,v)=>[(u-.5)*4.7,(v-.5)*3-.02,-1.95],pal.wall);
      plane(1700,(u,v)=>[-2.32,(v-.5)*3,(u-.5)*4],pal.side);
      box(1.24,-.10,-1.41,1.66,2.16,.58,pal.side,2200);
      for(let y of [-.85,-.18,.48])box(1.21,y,-1.05,1.55,.09,.63,[181,161,129],480);
      for(let x of [.71,1.27,1.72])box(x,-.40,-.99,.41,.36,.38,[117,164,169],340);
      box(-.34,-.47,.23,2.11,.14,1.16,pal.wood,1600);
      for(let x of [-1.19,.49])for(let z of [-.2,.59])box(x,-.91,z,.095,.65,.10,[104,126,143],210);
      box(-.39,.07,-.16,.85,.63,.055,[71,100,119],940);
      box(-.39,.08,-.119,.67,.44,.016,[92,194,185],540);
      box(-1.55,-.95,1.38,.60,.55,.60,[188,145,102],940);
      box(1.11,-1.03,1.22,.76,.37,.54,[132,169,179],710);
      return p;
    }
    plane(6500,(u,v)=>[(u-.5)*4.7,-1.25,(v-.5)*4],pal.floor);
    plane(4600,(u,v)=>[(u-.5)*4.7,(v-.5)*3-0.02,-1.94],pal.wall);
    plane(2800,(u,v)=>[-2.33,(v-.5)*3-.03,(u-.5)*4],pal.side);
    // Window frame and glass; intentionally procedural demo geometry.
    box(-.72,.28,-1.91,1.7,1.06,.025,[67,116,150],610);
    plane(520,(u,v)=>[-1.5+u*1.57,-.19+v*.92,-1.89],[102,161,181]);
    box(-.72,.27,-1.865,.065,1.08,.065,[217,223,223],230);
    box(-.72,.27,-1.86,1.72,.045,.07,[217,223,223],230);
    // Table and legs; variants change room arrangements.
    const dx=seed===2?.40:seed===3?-.36:.0;
    box(.45+dx,-.53,.1,2.05,.16,1.08,pal.wood,2100);
    for(let x of [-.45,1.35])for(let z of [-.31,.52])box(x+dx,-.93,z,.09,.72,.10,[105,116,122],290);
    box(1.47+dx,-.1,-1.32,.72,1.65,.57,[101,121,136],1850);
    box(1.47+dx,.15,-1.01,.49,.53,.04,pal.decor,500);
    box(.43+dx,-.37,.18,.43,.25,.34,[67,110,133],570);
    box(.31+dx,-.205,.15,.36,.018,.24,[103,188,192],330);
    // A second feature makes orbit/depth more readable.
    box(-1.61,-.90,1.12,.75,.52,.78,pal.decor,840);
    box(-1.64,-.57,1.13,.58,.13,.58,[194,203,189],340);
    for(let i=0;i<450;i++){
      const t=random()*Math.PI*2,r=Math.sqrt(random())*.43;
      const x=-1.56+Math.cos(t)*r,z=1.02+Math.sin(t)*r;
      push(x,-.34+random()*.47,z,[80,154,113],23);
    }
    return p;
  }

  window.syntheticFASTCloud=syntheticCloud;
})();
