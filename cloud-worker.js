/* Parse and orient large clouds away from the UI thread; transfer typed arrays. */
importScripts('./cloud-data.js');
self.onmessage=async event=>{
  try{
    const {buffer,maxPoints,rotationX}=event.data;
    const cloud=FastCloudIO.prepare(FastCloudIO.parse(await FastCloudIO.unpack(buffer),maxPoints),rotationX);
    self.postMessage({cloud},[cloud.positions.buffer,cloud.colors.buffer]);
  }catch(error){self.postMessage({error:error.message});}
};
