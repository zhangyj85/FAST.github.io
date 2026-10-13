/* GPU point-cloud viewer inspired by NBS's full-vertex rendering and gentle sway.
 * Uses native WebGL, local codecs and a worker; no CDN or runtime dependencies.
 */
(function(){
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const synthetic=seed=>{
    const points=window.syntheticFASTCloud(seed),positions=new Float32Array(points.length*3),colors=new Uint8Array(points.length*3);
    points.forEach((p,i)=>{positions.set([p.x,p.y,p.z],i*3);colors.set(p.c.match(/\d+/g).map(Number),i*3);});
    return FastCloudIO.prepare(FastCloudIO.cloud(positions,colors,points.length));
  };
  const vertex=`
    attribute vec3 aPosition;
    attribute vec3 aColor;
    uniform vec4 uAngles;
    uniform vec2 uProjection;
    uniform vec2 uDepth;
    uniform float uDistance;
    uniform float uPointScale;
    uniform vec2 uPointLimits;
    varying vec3 vColor;
    void main(){
      float x=aPosition.x*uAngles.x+aPosition.z*uAngles.y;
      float z=-aPosition.x*uAngles.y+aPosition.z*uAngles.x;
      float y=aPosition.y*uAngles.z-z*uAngles.w;
      z=aPosition.y*uAngles.w+z*uAngles.z;
      float depth=uDistance-z;
      gl_Position=vec4(x*uProjection.x,y*uProjection.y,uDepth.x*depth+uDepth.y,depth);
      gl_PointSize=clamp(uPointScale/max(depth,0.01),uPointLimits.x,uPointLimits.y);
      vColor=aColor;
    }`;
  const fragment=`
    precision mediump float;
    varying vec3 vColor;
    void main(){
      if(distance(gl_PointCoord,vec2(0.5))>0.5)discard;
      gl_FragColor=vec4(vColor,1.0);
    }`;
  class FastPointCloudViewer{
    constructor(canvas,{onStatus=()=>{}}={}){
      this.canvas=canvas;this.onStatus=onStatus;this.yaw=.28;this.pitch=.22;this.zoom=1;this.pointSize=1.25;
      this.autoRotate=true;this.visible=false;this.dirty=true;this.loadToken=0;this.cache=new Map();
      this.motion=matchMedia('(prefers-reduced-motion: reduce)');this.swayStart=performance.now();
      this.initRenderer();this.bindControls();
      this.setCloud(synthetic(1));
      this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas.parentElement);
      if('IntersectionObserver' in window){
        this.intersect=new IntersectionObserver(entries=>{this.visible=entries[0].isIntersecting;this.schedule();},{threshold:.01});this.intersect.observe(canvas);
      }else this.visible=true;
      this.onVisibility=()=>this.invalidate();this.onMotion=()=>this.invalidate();
      document.addEventListener('visibilitychange',this.onVisibility);
      this.motion.addEventListener('change',this.onMotion);
      canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.contextLost=true;this.onStatus('contextlost');});
      canvas.addEventListener('webglcontextrestored',()=>{this.contextLost=false;this.initRenderer();this.upload();this.invalidate();this.onStatus(this.isReal?'ready':'preview',this.cloud.length);});
      canvas.fastViewer=this;
      this.resize();this.schedule();
    }
    initRenderer(){
      const gl=this.canvas.getContext('webgl',{antialias:true,alpha:false,depth:true,powerPreference:'high-performance'});
      if(!gl){this.ctx=this.canvas.getContext('2d');if(!this.ctx)throw new Error('Canvas renderer unavailable.');this.rendererName='Canvas 2D';this.canvas.dataset.renderer=this.rendererName;return;}
      this.gl=gl;this.rendererName='WebGL';
      function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
      const vs=shader(gl.VERTEX_SHADER,vertex),fs=shader(gl.FRAGMENT_SHADER,fragment),program=gl.createProgram();
      gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
      this.program=program;this.attributes={position:gl.getAttribLocation(program,'aPosition'),color:gl.getAttribLocation(program,'aColor')};
      this.uniforms={};['Angles','Projection','Depth','Distance','PointScale','PointLimits'].forEach(n=>this.uniforms[n]=gl.getUniformLocation(program,'u'+n));
      this.pointLimits=gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.clearColor(.035,.063,.105,1);
      this.canvas.dataset.renderer=this.rendererName;
    }
    get autoRotate(){return this._autoRotate;}
    set autoRotate(value){this._autoRotate=Boolean(value);this.swayStart=performance.now();this.schedule();}
    bindControls(){
      const pointers=new Map();
      const stopAuto=()=>{if(this.autoRotate){this.autoRotate=false;this.onStatus('rotated');}};
      this.canvas.addEventListener('pointerdown',e=>{
        if(e.pointerType==='mouse'&&e.button!==0)return;
        stopAuto();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});this.canvas.setPointerCapture(e.pointerId);this.dragging=true;
      });
      this.canvas.addEventListener('pointermove',e=>{
        if(!pointers.has(e.pointerId))return;
        const old=pointers.get(e.pointerId),next={x:e.clientX,y:e.clientY};
        if(pointers.size===2){
          const other=[...pointers.entries()].find(([id])=>id!==e.pointerId)[1];
          const before=Math.hypot(old.x-other.x,old.y-other.y),after=Math.hypot(next.x-other.x,next.y-other.y);
          if(before>1&&after>1)this.zoom=clamp(this.zoom*after/before,.35,4);
        }else{
          this.yaw+=(next.x-old.x)*.006;this.pitch=clamp(this.pitch+(next.y-old.y)*.006,-1.45,1.45);
        }
        pointers.set(e.pointerId,next);this.invalidate();
      });
      const release=e=>{pointers.delete(e.pointerId);this.dragging=pointers.size>0;};
      ['pointerup','pointercancel','lostpointercapture'].forEach(name=>this.canvas.addEventListener(name,release));
      this.canvas.addEventListener('wheel',e=>{
        // Ordinary wheel scrolling keeps the page moving, as on NBS.
        if(!e.ctrlKey&&!e.metaKey)return;
        e.preventDefault();this.zoomBy(Math.exp(-clamp(e.deltaY,-200,200)*.003));
      },{passive:false});
      this.canvas.addEventListener('keydown',e=>{
        if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
          stopAuto();if(e.key==='ArrowLeft')this.yaw-=.1;if(e.key==='ArrowRight')this.yaw+=.1;
          if(e.key==='ArrowUp')this.pitch=clamp(this.pitch-.08,-1.45,1.45);if(e.key==='ArrowDown')this.pitch=clamp(this.pitch+.08,-1.45,1.45);
          e.preventDefault();this.invalidate();
        }else if(e.key==='+'||e.key==='='){e.preventDefault();this.zoomBy(1.15);}
        else if(e.key==='-'){e.preventDefault();this.zoomBy(1/1.15);}
        else if(e.key==='0'){e.preventDefault();this.reset();}
      });
    }
    async decode(buffer,rotationX){
      const maxPoints=this.gl?Infinity:50000;
      if(typeof Worker==='undefined')return FastCloudIO.prepare(FastCloudIO.parse(await FastCloudIO.unpack(buffer),maxPoints),rotationX);
      return new Promise((resolve,reject)=>{
        const worker=new Worker(new URL('./cloud-worker.js',document.baseURI));this.worker=worker;this.workerReject=reject;
        const done=()=>{worker.terminate();if(this.worker===worker){this.worker=null;this.workerReject=null;}};
        worker.onmessage=e=>{done();e.data.error?reject(new Error(e.data.error)):resolve(e.data.cloud);};
        worker.onerror=e=>{done();reject(new Error(e.message||'Cloud worker failed.'));};
        worker.postMessage({buffer,maxPoints,rotationX},[buffer]);
      });
    }
    async load(path,seed=1,{rotationX=0,fallbackPath=null}={}){
      const token=++this.loadToken;
      this.abort?.abort();this.workerReject?.(new Error('Superseded cloud load'));this.worker?.terminate();this.worker=null;this.workerReject=null;
      this.abort=new AbortController();
      if(!path){this.isReal=false;this.setCloud(synthetic(seed));this.onStatus('preview',this.cloud.length);return;}
      const key=path+'|'+rotationX;
      this.onStatus('loading');
      try{
        let data=this.cache.get(key);
        if(!data){
          let lastError;
          for(const source of [path,fallbackPath].filter(Boolean)){
            try{
              const resp=await fetch(source,{signal:this.abort.signal,cache:'default'});if(!resp.ok)throw new Error('HTTP '+resp.status);
              const buffer=await resp.arrayBuffer();if(token!==this.loadToken)return;
              data=await this.decode(buffer,rotationX);break;
            }catch(error){if(token!==this.loadToken)return;lastError=error;}
          }
          if(!data)throw lastError;
          const bytes=data.positions.byteLength+data.colors.byteLength;
          if(bytes<=64*1024*1024){
            this.cache.set(key,data);
            const memory=()=>[...this.cache.values()].reduce((sum,c)=>sum+c.positions.byteLength+c.colors.byteLength,0);
            while(this.cache.size>2||memory()>64*1024*1024)this.cache.delete(this.cache.keys().next().value);
          }
        }
        if(token!==this.loadToken)return;
        this.isReal=true;this.setCloud(data);this.onStatus('ready',data.length);
      }catch(error){
        if(token!==this.loadToken)return;
        console.warn('Could not load point cloud:',path,error);this.isReal=false;this.setCloud(synthetic(seed));this.onStatus('error',error.message);
      }
    }
    setCloud(data){this.cloud=data;this.canvas.dataset.points=data.length;this.canvas.dataset.sourcePoints=data.sourceCount;this.upload();this.reset();}
    upload(){
      if(!this.gl)return;
      const gl=this.gl;
      if(this.positionBuffer)gl.deleteBuffer(this.positionBuffer);if(this.colorBuffer)gl.deleteBuffer(this.colorBuffer);
      this.positionBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.positionBuffer);gl.bufferData(gl.ARRAY_BUFFER,this.cloud.positions,gl.STATIC_DRAW);
      this.colorBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.colorBuffer);gl.bufferData(gl.ARRAY_BUFFER,this.cloud.colors,gl.STATIC_DRAW);
    }
    fit(){
      if(!this.cloud||!this.w||!this.h)return;
      const {min,max}=this.cloud.frameBounds||this.cloud.bounds,cy=Math.cos(.28),sy=Math.sin(.28),cp=Math.cos(.22),sp=Math.sin(.22);
      const tanV=Math.tan(42*Math.PI/360),tanH=tanV*this.w/this.h;
      let distance=0;
      for(const x of [min[0],max[0]])for(const y of [min[1],max[1]])for(const z of [min[2],max[2]]){
        const xx=x*cy+z*sy,zz=-x*sy+z*cy,yy=y*cp-zz*sp,z2=y*sp+zz*cp;
        distance=Math.max(distance,z2+Math.abs(xx)/tanH,z2+Math.abs(yy)/tanV);
      }
      this.defaultDistance=Math.max(distance*1.12,1);this.distance=this.defaultDistance/this.zoom;
    }
    reset(){this.yaw=.28;this.pitch=.22;this.zoom=1;this.swayStart=performance.now();this.fit();this.invalidate();}
    zoomBy(factor){this.zoom=clamp(this.zoom*factor,.35,4);this.invalidate();}
    setPointSize(value){this.pointSize=clamp(Number(value)||1.25,.6,3);this.invalidate();}
    resize(){
      const rect=this.canvas.parentElement.getBoundingClientRect();if(!rect.width||!rect.height)return;
      const dpr=Math.min(devicePixelRatio||1,2);this.w=rect.width;this.h=rect.height;this.dpr=dpr;
      this.canvas.width=Math.round(rect.width*dpr);this.canvas.height=Math.round(rect.height*dpr);
      if(this.gl)this.gl.viewport(0,0,this.canvas.width,this.canvas.height);else this.ctx.setTransform(dpr,0,0,dpr,0,0);
      this.fit();this.invalidate();
    }
    invalidate(){this.dirty=true;this.schedule();}
    schedule(){
      if(this.raf||this.disposed||!this.visible||document.hidden||this.contextLost)return;
      this.raf=requestAnimationFrame(t=>{this.raf=0;this.tick(t);});
    }
    tick(time){
      if(!this.visible||document.hidden||this.contextLost||!this.w||!this.h)return;
      const moving=this.autoRotate&&!this.motion.matches&&!this.dragging;
      if(moving)this.yaw=.28+.22*Math.sin((time-this.swayStart)*2*Math.PI/9000);
      if(moving||this.dirty){this.distance=this.defaultDistance/this.zoom;this.draw();this.dirty=false;}
      if(moving)this.schedule();
    }
    dispose(){
      this.disposed=true;this.loadToken++;cancelAnimationFrame(this.raf);this.abort?.abort();
      this.workerReject?.(new Error('Viewer disposed'));this.worker?.terminate();
      this.resizeObserver.disconnect();this.intersect?.disconnect();this.cache.clear();
      document.removeEventListener('visibilitychange',this.onVisibility);this.motion.removeEventListener('change',this.onMotion);
      if(this.gl){this.gl.deleteBuffer(this.positionBuffer);this.gl.deleteBuffer(this.colorBuffer);this.gl.deleteProgram(this.program);}
      delete this.canvas.fastViewer;
    }
    draw(){
      this.drawCount=(this.drawCount||0)+1;
      if(!this.gl){this.drawFallback();return;}
      const gl=this.gl,u=this.uniforms,tanV=Math.tan(42*Math.PI/360),near=.03,far=this.distance+Math.max(...this.cloud.bounds.min.map(Math.abs),...this.cloud.bounds.max.map(Math.abs))*4+5;
      gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.positionBuffer);gl.enableVertexAttribArray(this.attributes.position);gl.vertexAttribPointer(this.attributes.position,3,gl.FLOAT,false,0,0);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.colorBuffer);gl.enableVertexAttribArray(this.attributes.color);gl.vertexAttribPointer(this.attributes.color,3,gl.UNSIGNED_BYTE,true,0,0);
      gl.uniform4f(u.Angles,Math.cos(this.yaw),Math.sin(this.yaw),Math.cos(this.pitch),Math.sin(this.pitch));
      gl.uniform2f(u.Projection,this.h/this.w/tanV,1/tanV);gl.uniform2f(u.Depth,(far+near)/(far-near),-2*far*near/(far-near));gl.uniform1f(u.Distance,this.distance);
      const base=clamp(Math.sqrt(this.w*this.h/this.cloud.length)*.85,1.2,3.2);
      gl.uniform1f(u.PointScale,base*this.pointSize*this.dpr*this.defaultDistance);gl.uniform2f(u.PointLimits,1,Math.min(12*this.dpr,this.pointLimits[1]));
      gl.drawArrays(gl.POINTS,0,this.cloud.length);
    }
    drawFallback(){
      const ctx=this.ctx,p=this.cloud.positions,c=this.cloud.colors,f=this.h/2/Math.tan(42*Math.PI/360),cy=Math.cos(this.yaw),sy=Math.sin(this.yaw),cp=Math.cos(this.pitch),sp=Math.sin(this.pitch);
      ctx.fillStyle='#09101b';ctx.fillRect(0,0,this.w,this.h);
      for(let i=0;i<p.length;i+=3){
        const xx=p[i]*cy+p[i+2]*sy,zz=-p[i]*sy+p[i+2]*cy,yy=p[i+1]*cp-zz*sp,depth=this.distance-(p[i+1]*sp+zz*cp);
        if(depth<=.03)continue;const x=this.w/2+xx*f/depth,y=this.h/2-yy*f/depth;
        if(x<0||x>this.w||y<0||y>this.h)continue;
        ctx.fillStyle=`rgb(${c[i]},${c[i+1]},${c[i+2]})`;const size=clamp(2*this.pointSize*this.defaultDistance/depth,.8,8);ctx.fillRect(x-size/2,y-size/2,size,size);
      }
    }
  }
  window.FastPointCloudViewer=FastPointCloudViewer;
  window.parseFASTPLY=FastCloudIO.parsePLY;
})();
