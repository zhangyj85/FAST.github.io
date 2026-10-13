/* Shared point-cloud codecs for the browser, worker and offline conversion tool.
 * NBSC layout matches NBS: 32-byte header, uint16 XYZ, then uint8 RGB.
 * Parsing keeps all valid vertices by default; sampling is only an explicit option.
 */
(function(root){
  'use strict';
  const types={char:['getInt8',1],int8:['getInt8',1],uchar:['getUint8',1],uint8:['getUint8',1],short:['getInt16',2],int16:['getInt16',2],ushort:['getUint16',2],uint16:['getUint16',2],int:['getInt32',4],int32:['getInt32',4],uint:['getUint32',4],uint32:['getUint32',4],float:['getFloat32',4],float32:['getFloat32',4],double:['getFloat64',8],float64:['getFloat64',8]};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function bounds(positions){
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<positions.length;i+=3)for(let j=0;j<3;j++){min[j]=Math.min(min[j],positions[i+j]);max[j]=Math.max(max[j],positions[i+j]);}
    return {min,max};
  }
  function cloud(positions,colors,sourceCount){return {positions,colors,length:positions.length/3,sourceCount,bounds:bounds(positions)};}
  function frameBounds(positions){
    const n=positions.length/3;if(n<1024)return bounds(positions);
    const step=Math.max(1,Math.ceil(n/20000)),axes=[[],[],[]];
    for(let i=0;i<n;i+=step)for(let j=0;j<3;j++)axes[j].push(positions[i*3+j]);
    axes.forEach(axis=>axis.sort((a,b)=>a-b));
    // Camera framing ignores extreme tails; vertex arrays are never filtered.
    return {min:axes.map(a=>a[Math.floor((a.length-1)*.01)]),max:axes.map(a=>a[Math.ceil((a.length-1)*.99)])};
  }
  function parsePLY(buffer,maxPoints=Infinity){
    const bytes=new Uint8Array(buffer),view=new DataView(buffer);
    let end=-1;
    const marker=[101,110,100,95,104,101,97,100,101,114];
    for(let i=0;i<Math.min(bytes.length,256000)-10;i++){
      if(bytes[i]===101&&marker.every((v,j)=>bytes[i+j]===v)){
        let j=i+10;while(j<bytes.length&&bytes[j]!==10)j++;end=j+1;break;
      }
    }
    if(end<0||end>bytes.length)throw new Error('Missing PLY end_header.');
    const lines=new TextDecoder().decode(bytes.subarray(0,end)).split(/\r?\n/);
    if(lines[0].trim()!=='ply')throw new Error('Not a PLY file.');
    const format=lines.find(s=>s.startsWith('format '))?.split(/\s+/)[1];
    let n=0,element='',props=[],preceding=false,stride=0;
    for(const line of lines){
      const p=line.trim().split(/\s+/);
      if(p[0]==='element'){
        element=p[1];
        if(element==='vertex'){if(preceding)throw new Error('Export PLY with vertices before other nonempty elements.');n=Number(p[2]);}
        else if(!n&&Number(p[2])>0)preceding=true;
      }
      if(p[0]==='property'&&element==='vertex'){
        if(p[1]==='list')throw new Error('PLY vertex list properties are unsupported.');
        if(!types[p[1]])throw new Error('Unsupported PLY scalar: '+p[1]);
        props.push({type:p[1],name:p[2],offset:stride,read:types[p[1]][0]});stride+=types[p[1]][1];
      }
    }
    if(!Number.isSafeInteger(n)||n<=0)throw new Error('No valid PLY vertex count.');
    if(!(maxPoints>0))throw new Error('maxPoints must be positive.');
    if(!['ascii','binary_little_endian','binary_big_endian'].includes(format))throw new Error('Unsupported PLY format: '+format);
    if(format!=='ascii'&&end+n*stride>bytes.length)throw new Error('Truncated binary PLY.');
    if(format==='ascii'&&n>(bytes.length-end)/5)throw new Error('Truncated ASCII PLY.');
    const keys=props.map(p=>p.name),xyz=['x','y','z'].map(k=>keys.indexOf(k));
    if(xyz.some(i=>i<0))throw new Error('PLY must contain x, y and z.');
    const channel=(...names)=>names.map(k=>keys.indexOf(k)).find(i=>i>=0);
    const channels=[channel('red','diffuse_red','r'),channel('green','diffuse_green','g'),channel('blue','diffuse_blue','b')];
    const packed=channel('rgb','rgba'),step=Math.max(1,Math.ceil(n/maxPoints)),capacity=Math.ceil(n/step);
    const positions=new Float32Array(capacity*3),colors=new Uint8Array(capacity*3);
    const floatColors=channels.every(i=>i!==undefined&&/float|double/.test(props[i].type));
    let count=0;
    function add(get,packedBits){
      const x=get(xyz[0]),y=get(xyz[1]),z=get(xyz[2]);
      if(![x,y,z].every(Number.isFinite)||[x,y,z].some(v=>Math.abs(v)>3.4e38))return;
      const off=count*3;positions.set([x,y,z],off);
      let color=[151,210,239];
      if(channels.every(i=>i!==undefined)){
        color=channels.map(get);if(floatColors&&color.every(v=>v>=0&&v<=1))color=color.map(v=>v*255);
      }else if(packed!==undefined){
        const bits=packedBits();color=[bits>>>16&255,bits>>>8&255,bits&255];
      }
      for(let j=0;j<3;j++)colors[off+j]=clamp(Math.round(Number.isFinite(color[j])?color[j]:0),0,255);
      count++;
    }
    if(format==='ascii'){
      const text=new TextDecoder().decode(bytes.subarray(end));let start=0;
      const scratch=new DataView(new ArrayBuffer(4));
      for(let i=0;i<n;i++){
        const next=text.indexOf('\n',start),stop=next<0?text.length:next;
        if(start>=text.length)throw new Error('Truncated ASCII PLY.');
        if(i%step===0){
          const values=text.slice(start,stop).trim().split(/\s+/).map(Number);
          if(values.length<props.length)throw new Error('Incomplete PLY vertex.');
          add(j=>values[j],()=>{if(/float/.test(props[packed].type)){scratch.setFloat32(0,values[packed],true);return scratch.getUint32(0,true);}return values[packed]>>>0;});
        }
        start=stop+1;
      }
    }else{
      const little=format==='binary_little_endian';
      for(let i=0;i<n;i+=step){const off=end+i*stride;add(j=>view[props[j].read](off+props[j].offset,little),()=>view.getUint32(off+props[packed].offset,little));}
    }
    if(!count)throw new Error('PLY contains no finite vertices.');
    return cloud(positions.subarray(0,count*3),colors.subarray(0,count*3),n);
  }
  function parseNBSC(buffer,maxPoints=Infinity){
    const view=new DataView(buffer);
    if(buffer.byteLength<32||view.getUint32(0,false)!==0x4e425343)throw new Error('Invalid NBSC header.');
    const n=view.getUint32(4,true);
    if(!n||buffer.byteLength!==32+n*9)throw new Error('Invalid NBSC vertex payload.');
    const min=[0,1,2].map(j=>view.getFloat32(8+j*4,true)),scale=[0,1,2].map(j=>view.getFloat32(20+j*4,true));
    if(![...min,...scale].every(Number.isFinite)||scale.some(v=>v<0))throw new Error('Invalid NBSC bounds.');
    if(!(maxPoints>0))throw new Error('maxPoints must be positive.');
    const step=Math.max(1,Math.ceil(n/maxPoints)),positions=new Float32Array(Math.ceil(n/step)*3),colors=new Uint8Array(positions.length);
    for(let i=0,k=0;i<n;i+=step,k++)for(let j=0;j<3;j++){
      positions[k*3+j]=min[j]+view.getUint16(32+i*6+j*2,true)/65535*scale[j];colors[k*3+j]=view.getUint8(32+n*6+i*3+j);
    }
    return cloud(positions,colors,n);
  }
  function parse(buffer,maxPoints=Infinity){return buffer.byteLength>=4&&new DataView(buffer).getUint32(0,false)===0x4e425343?parseNBSC(buffer,maxPoints):parsePLY(buffer,maxPoints);}
  function prepare(data,rotationX=0){
    const b=frameBounds(data.positions),center=b.min.map((v,j)=>(v+b.max[j])/2),scale=3.65/Math.max(...b.max.map((v,j)=>v-b.min[j]),1e-8);
    const angle=rotationX*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),p=data.positions;
    for(let i=0;i<p.length;i+=3){const y=(p[i+1]-center[1])*scale,z=(p[i+2]-center[2])*scale;p[i]=(p[i]-center[0])*scale;p[i+1]=y*c-z*s;p[i+2]=y*s+z*c;}
    data.bounds=bounds(p);data.frameBounds=frameBounds(p);return data;
  }
  function encodeNBSC(data){
    const n=data.length,b=data.bounds,buffer=new ArrayBuffer(32+n*9),view=new DataView(buffer);
    const scale=b.max.map((v,j)=>v-b.min[j]);
    view.setUint32(0,0x4e425343,false);view.setUint32(4,n,true);
    for(let j=0;j<3;j++){view.setFloat32(8+j*4,b.min[j],true);view.setFloat32(20+j*4,scale[j],true);}
    for(let i=0;i<n;i++)for(let j=0;j<3;j++){
      view.setUint16(32+i*6+j*2,scale[j]?clamp(Math.round((data.positions[i*3+j]-b.min[j])/scale[j]*65535),0,65535):0,true);
      view.setUint8(32+n*6+i*3+j,data.colors[i*3+j]);
    }
    return buffer;
  }
  async function unpack(buffer){
    const bytes=new Uint8Array(buffer);
    if(bytes.length<2||bytes[0]!==31||bytes[1]!==139)return buffer;
    if(typeof DecompressionStream==='undefined')throw new Error('Please use a browser with gzip DecompressionStream support.');
    return new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }
  const api={unpack,parsePLY,parseNBSC,parse,prepare,encodeNBSC,cloud,bounds};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.FastCloudIO=api;
})(globalThis);
