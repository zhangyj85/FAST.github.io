(function(){
  'use strict';
  const C=window.FAST_CONTENT;
  const $=id=>document.getElementById(id);
  const safe=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  let toastTimer;
  function toast(message){const el=$('toast');el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3500);}
  function setImage(img,path,alt){img.src=path;img.alt=alt||'';}

  // Keep the source string untouched. Syntax colors are presentation-only spans,
  // generated from escaped text without remote libraries or injected HTML.
  function highlightBibtex(source){
    let insideValue=false;
    let braceDepth=0;
    const colorValue=(raw,field)=>raw.split(/([{}])/).map(part=>{
      if(part==='{' || part==='}')return `<span class="bib-punctuation">${safe(part)}</span>`;
      const cls=field==='year'&&/^\s*\d{4}\s*$/.test(part)?'bib-number':'bib-value';
      return `<span class="${cls}">${safe(part)}</span>`;
    }).join('');
    const depthDelta=raw=>(raw.match(/\{/g)||[]).length-(raw.match(/\}/g)||[]).length;
    return String(source).split('\n').map(line=>{
      const entry=line.match(/^(\s*)(@[A-Za-z]+)(\{)([^,\n]+)(,?)(\s*)$/);
      if(entry){
        insideValue=false;braceDepth=0;
        return `${safe(entry[1])}<span class="bib-entry-type">${safe(entry[2])}</span><span class="bib-punctuation">${safe(entry[3])}</span><span class="bib-cite-key">${safe(entry[4])}</span><span class="bib-punctuation">${safe(entry[5])}</span>${safe(entry[6])}`;
      }
      if(/^\s*\}\s*$/.test(line)&&!insideValue){
        return line.replace('}', '<span class="bib-punctuation">}</span>');
      }
      if(!insideValue){
        const field=line.match(/^(\s*)([A-Za-z][\w-]*)(\s*=\s*)(.*)$/);
        if(field){
          braceDepth=depthDelta(field[4]);
          insideValue=braceDepth>0;
          const val=colorValue(field[4],field[2].toLowerCase());
          return `${safe(field[1])}<span class="bib-field">${safe(field[2])}</span><span class="bib-punctuation">${safe(field[3])}</span>${val}`;
        }
      }else{
        braceDepth+=depthDelta(line);
        if(braceDepth<=0){braceDepth=0;insideValue=false;}
        const indent=line.match(/^\s*/)[0];
        return safe(indent)+colorValue(line.slice(indent.length),'');
      }
      return safe(line);
    }).join('\n');
  }

  function initProject(){
    document.title=C.project.title;
    const authors=$('author-list');
    C.project.authors.forEach((a,i)=>{
      if(i){const d=document.createElement('span');d.textContent='·';d.style.color='#bfcbda';authors.appendChild(d);}
      const el=document.createElement(a.url?'a':'span');el.textContent=a.name;
      if(a.url){el.href=a.url;el.target='_blank';el.rel='noopener noreferrer';}
      const sup=document.createElement('sup');sup.textContent=a.affiliations.join(',')+(a.corresponding?'*':'');el.appendChild(sup);authors.appendChild(el);
    });
    const affiliations=$('affiliation-list');
    C.project.affiliations.forEach(a=>{const el=document.createElement('span');const sup=document.createElement('sup');sup.textContent=a.id+' ';el.append(sup,document.createTextNode(a.name));affiliations.appendChild(el);});
    if(C.project.paper)$('paper-link').href=C.project.paper;
    if(C.project.github){$('github-link').href=C.project.github;$('github-link').target='_blank';$('github-link').rel='noopener noreferrer';$('github-link').removeAttribute('data-unavailable');}
    else $('github-link').addEventListener('click',e=>{e.preventDefault();toast('GitHub link coming soon');});
    if(C.project.teaser){
      const image=$('teaser-image');image.onload=()=>{$('teaser-empty').classList.add('hidden');image.classList.remove('hidden');};
      image.onerror=()=>{toast('Teaser file was not found. Check project.teaser in content.js.');$('teaser-empty').classList.remove('hidden');image.classList.add('hidden');};
      image.src=C.project.teaser;
    }
    $('teaser-caption').textContent=C.project.teaserCaption;
    $('bibtex-content').innerHTML=highlightBibtex(C.bibtex);
  }

  function initAdvantages(){
    $('impact-grid').innerHTML=(C.advantages||[]).map(item=>`<div class="impact-item"><div class="impact-value">${safe(item.title)}</div><div class="impact-label">${safe(item.detail)}</div></div>`).join('');
  }

  function initResults(){
    const tabs=$('result-tabs'),picker=$('result-preview-picker'),methodSelect=$('result-method'),methodControl=$('result-method-control'),wideGrid=$('wide-grid'),wideMethodSlot=$('wide-method-slot');
    if(!C.results?.length){$('results').classList.add('hidden');document.querySelector('.nav-results-label').hidden=true;return;}
    let current,selectedPreview=0,selectedMethod='FAST';
    function renderTable(table,index){
      const columns=table.groups.flatMap(group=>group.metrics);
      let offset=0;
      const starts=new Set(table.groups.map(group=>{const start=offset;offset+=group.metrics.length;return start;}));
      const rankings=new Map();
      for(const row of table.rows){
        const cohort=row.cohort||'all';
        if(!rankings.has(cohort))rankings.set(cohort,columns.map(()=>new Set()));
        row.values.forEach((value,j)=>{
          const number=Number(value);if(!Number.isFinite(number))return;
          rankings.get(cohort)[j].add(number);
        });
      }
      for(const [cohort,scores] of rankings){
        rankings.set(cohort,scores.map(values=>[...values].sort((a,b)=>table.direction==='max'?b-a:a-b)));
      }
      const id=`result-table-${current.id}-${index}`;
      return `<section class="result-table-block" aria-labelledby="${id}-title">
        <div class="result-table-heading"><h3 id="${id}-title">${safe(table.title)}</h3></div>
        <div class="table-scroll" role="region" aria-labelledby="${id}-title" tabindex="0">
          <table class="benchmark-table"><thead>
            <tr class="groups"><th rowspan="2" scope="col">Method</th>${table.groups.map(group=>`<th scope="colgroup" colspan="${group.metrics.length}">${safe(group.label)}</th>`).join('')}</tr>
            <tr>${columns.map((metric,j)=>`<th scope="col" class="${starts.has(j)?'group-start':''}">${safe(metric)}</th>`).join('')}</tr>
          </thead><tbody>${table.rows.map(row=>`<tr class="${row.ours?'ours ':''}${row.divider?'cohort-start':''}"><th scope="row">${safe(row.method)}</th>${row.values.map((value,j)=>{
            const number=Number(value),scores=rankings.get(row.cohort||'all')[j];
            const winner=Number.isFinite(number)&&number===scores[0];
            const second=Number.isFinite(number)&&number===scores[1];
            return `<td class="${starts.has(j)?'group-start ':''}${winner?'best':second?'second-best':''}">${winner?`<strong>${safe(value)}</strong>`:safe(value)}</td>`;
          }).join('')}</tr>`).join('')}</tbody></table>
        </div><p class="table-note"><strong>${safe(C.resultCheckpointNote)}</strong></p>
      </section>`;
    }
    for(const [idx,item] of C.results.entries()){
      const b=document.createElement('button');b.type='button';b.id='results-'+item.id;b.className='segment';b.setAttribute('role','tab');b.setAttribute('aria-selected','false');b.textContent=item.label;
      b.addEventListener('click',()=>selectResult(idx));tabs.appendChild(b);
    }
    function selectResult(i){
      current=C.results[i];selectedPreview=0;selectedMethod='FAST';
      [...tabs.children].forEach((tab,idx)=>{tab.setAttribute('aria-selected',String(idx===i));tab.tabIndex=idx===i?0:-1;});
      $('result-tables').innerHTML=current.tables.map(renderTable).join('');
      $('result-showcase-title').textContent=current.title;
      picker.classList.toggle('is-warps',current.mode==='warps');
      methodSelect.replaceChildren();
      current.methods.forEach(method=>{const option=document.createElement('option');option.value=method;option.textContent=method==='FAST'?'FAST (OURS)':method;methodSelect.appendChild(option);});
      methodSelect.value=selectedMethod;picker.replaceChildren();
      current.previews.forEach((sample,j)=>{
        const b=document.createElement('button');b.type='button';b.className='result-preview-thumb';b.setAttribute('aria-label',`Choose ${sample.name} sample ${j+1} visual comparison`);
        const img=document.createElement('img');img.decoding='async';img.loading='lazy';img.src=sample.thumbnail;img.alt='';b.appendChild(img);
        b.addEventListener('click',()=>{selectedPreview=j;renderPreview(true);});picker.appendChild(b);
      });
      renderPreview(true);
    }
    function renderPreview(resetSlider){
      const sample=current.previews[selectedPreview],warps=current.mode==='warps';
      [...picker.children].forEach((b,n)=>b.setAttribute('aria-pressed',String(n===selectedPreview)));
      $('compare-stage').classList.toggle('hidden',warps);wideGrid.classList.toggle('hidden',!warps);
      wideMethodSlot.classList.toggle('hidden',!warps);methodControl.classList.toggle('is-overlay',!warps);
      const methodHost=warps?wideMethodSlot:$('compare-stage');
      if(methodControl.parentElement!==methodHost)methodHost.appendChild(methodControl);
      if(warps){
        wideGrid.replaceChildren();
        const outputs=sample.outputs[selectedMethod],images=[...sample.inputs,...outputs];
        const labels=['Input A','Input B','Warp B → A','Warp A → B'];
        images.forEach((image,k)=>{
          const tile=document.createElement('figure');tile.className='wide-tile';
          const img=document.createElement('img');img.decoding='async';img.width=image.width;img.height=image.height;setImage(img,image.src,`${sample.name}: ${labels[k]}${k>=2?' · '+selectedMethod:''}`);
          const caption=document.createElement('figcaption');caption.textContent=labels[k];tile.append(img,caption);wideGrid.appendChild(tile);
        });
        const ratioA=Math.max(sample.inputs[0].width/sample.inputs[0].height,outputs[0].width/outputs[0].height);
        const ratioB=Math.max(sample.inputs[1].width/sample.inputs[1].height,outputs[1].width/outputs[1].height);
        wideGrid.dataset.ratioA=ratioA;wideGrid.dataset.ratioB=ratioB;wideGrid.style.gridTemplateColumns=`${ratioA}fr ${ratioB}fr`;sizeWideImages();
      }else{
        // The clipped input stays on the left; the selected prediction is on the right.
        setImage($('compare-base'),sample.outputs[selectedMethod],`${sample.name}: ${selectedMethod} prediction`);
        setImage($('compare-top'),sample.input,`${sample.name}: input image`);
        $('compare-stage').style.aspectRatio=`${sample.width} / ${sample.height}`;
        $('compare-stage').style.setProperty('--compare-aspect',sample.width/sample.height);
        $('compare-left-label').textContent='INPUT';
        if(resetSlider)$('compare-range').value=50;
        updateCompare($('compare-range').value);
      }
    }
    function sizeWideImages(){
      const width=wideGrid.getBoundingClientRect().width;
      if(width&&wideGrid.firstElementChild){
        const a=Number(wideGrid.dataset.ratioA),b=Number(wideGrid.dataset.ratioB),tileStyle=getComputedStyle(wideGrid.firstElementChild);
        const inset=2*(parseFloat(tileStyle.paddingLeft)+parseFloat(tileStyle.borderLeftWidth));
        const available=width-parseFloat(getComputedStyle(wideGrid).columnGap);
        const height=Math.min(240,(available*a/(a+b)-inset)/a,(available*b/(a+b)-inset)/b);
        wideGrid.style.setProperty('--wide-image-height',Math.max(1,height)+'px');
      }
    }
    new ResizeObserver(sizeWideImages).observe(wideGrid);
    methodSelect.addEventListener('change',()=>{selectedMethod=methodSelect.value;renderPreview(false);});
    function updateCompare(n){n=Number(n);$('compare-overlay').style.clipPath=`inset(0 ${100-n}% 0 0)`;$('compare-divider').style.left=n+'%';$('compare-range').setAttribute('aria-valuetext',`${n}% input, ${100-n}% ${selectedMethod} prediction`);}
    $('compare-range').addEventListener('input',e=>updateCompare(e.target.value));
    $('compare-range').addEventListener('keydown',e=>{if(e.key==='Home'){e.target.value=0;updateCompare(0);}else if(e.key==='End'){e.target.value=100;updateCompare(100);}});
    selectResult(0);
  }

  function makePicker(target,samples,selected,handler){
    target.replaceChildren();
    samples.forEach((sample,i)=>{
      const b=document.createElement('button');b.type='button';b.className='sample-thumb';b.setAttribute('aria-pressed',String(i===selected));b.setAttribute('aria-label',`Choose ${sample.name}`);
      const img=document.createElement('img');img.loading='lazy';img.decoding='async';img.src=sample.thumbnail||sample.rgb;img.alt=`${sample.name} thumbnail`;
      b.append(img);b.addEventListener('click',()=>handler(i));target.appendChild(b);
    });
  }

  function initStereo(){
    const samples=C.stereo;let selected=0;
    const viewer=new FastPointCloudViewer($('cloud-canvas'),{
      onStatus(status,detail){
        if(status==='ready'){$('cloud-status').textContent=`${detail.toLocaleString()} POINTS`;$('cloud-placeholder-title').classList.add('hidden');}
        if(status==='preview'){$('cloud-status').textContent='SYNTHETIC PREVIEW';$('cloud-placeholder-title').classList.remove('hidden');}
        if(status==='loading'){$('cloud-status').textContent='LOADING CLOUD…';}
        if(status==='contextlost')$('cloud-status').textContent='VIEWER PAUSED';
        if(status==='error'){$('cloud-status').textContent='CLOUD UNAVAILABLE';$('cloud-placeholder-title').classList.remove('hidden');}
        if(status==='rotated'){$('cloud-autorotate').classList.remove('is-active');$('cloud-autorotate').setAttribute('aria-pressed','false');}
      }
    });
    function select(i){
      selected=i;const s=samples[i];
      $('cloud-placeholder-title').classList.add('hidden');
      [...$('stereo-picker').children].forEach((b,n)=>b.setAttribute('aria-pressed',String(i===n)));
      setImage($('stereo-rgb'),s.rgb,`${s.name} left reference image`);
      for(const id of ['stereo-rgb','stereo-disp']){$(id).removeAttribute('width');$(id).removeAttribute('height');}
      setImage($('stereo-disp'),s.disparity,`${s.name} predicted disparity`);
      viewer.load(s.cloud,s.previewSeed||i+1,{rotationX:s.cloudRotationX||0,fallbackPath:s.cloudPLY||null});
    }
    makePicker($('stereo-picker'),samples,selected,select);select(0);
    $('cloud-point-size').addEventListener('input',e=>viewer.setPointSize(e.target.value));
    $('cloud-reset').addEventListener('click',()=>viewer.reset());
    $('cloud-autorotate').addEventListener('click',e=>{viewer.autoRotate=!viewer.autoRotate;e.currentTarget.classList.toggle('is-active',viewer.autoRotate);e.currentTarget.setAttribute('aria-pressed',String(viewer.autoRotate));});
  }

  function initStereoWhenVisible(){
    if(!('IntersectionObserver' in window)){initStereo();return;}
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();initStereo();}
    },{rootMargin:'300px 0px'});
    observer.observe($('stereo-demo'));
  }

  function initVideoDemo(which,samples){
    const picker=$(which+'-picker'),video=$(which+'-video'),placeholder=$(which+'-video-placeholder'),poster=$(which+'-video-poster');
    const player=$(which+'-video-card');
    let selection=0,nearViewport=false;
    video.muted=true;video.defaultMuted=true;video.playsInline=true;video.loop=true;
    function playWhenVisible(){
      if(!nearViewport||document.hidden||!samples[selection].video||video.classList.contains('hidden'))return;
      // A browser may still refuse autoplay; native controls remain available.
      video.play().catch(()=>{});
    }
    function updateVisibility(){
      const rect=player.getBoundingClientRect();
      const shown=Math.max(0,Math.min(rect.bottom,innerHeight+80)-Math.max(rect.top,-80));
      nearViewport=rect.height>0&&shown/Math.min(rect.height,innerHeight)>=.2;
      if(nearViewport&&!document.hidden)playWhenVisible();else video.pause();
    }
    function select(i){
      selection=i;const s=samples[i];
      [...picker.children].forEach((b,n)=>b.setAttribute('aria-pressed',String(i===n)));
      video.pause();video.removeAttribute('src');video.load();
      video.setAttribute('aria-label',`${s.name} ${which==='flow'?'optical flow':'Ego4D matching'} video`);
      setImage(poster,s.poster||s.thumbnail,`${s.name} video poster`);
      if(s.video){
        video.poster=s.poster||s.thumbnail||'';
        video.src=s.video;video.classList.remove('hidden');placeholder.classList.add('hidden');video.load();
      }else{
        video.classList.add('hidden');placeholder.classList.remove('hidden');
      }
      updateVisibility();
    }
    video.addEventListener('loadeddata',playWhenVisible);
    // Stop an outstanding play request if the viewer scrolls away while loading.
    video.addEventListener('playing',()=>{if(!nearViewport||document.hidden)video.pause();});
    document.addEventListener('visibilitychange',updateVisibility);
    if('IntersectionObserver' in window){
      const observer=new IntersectionObserver(updateVisibility,{rootMargin:'80px 0px',threshold:[0,.2]});
      observer.observe(player);
    }else{
      window.addEventListener('scroll',updateVisibility,{passive:true});
    }
    window.addEventListener('resize',updateVisibility,{passive:true});
    video.addEventListener('error',()=>{
      if(!samples[selection].video)return;
      video.classList.add('hidden');placeholder.classList.remove('hidden');
      toast('This video could not be played. Please try another sample.');
    });
    makePicker(picker,samples,selection,select);select(0);
  }


  function initColmap(){
    const samples=C.colmap||[];
    if(!samples.length)return;
    let selected=-1;
    const viewer=new FastPointCloudViewer($('colmap-cloud-canvas'),{
      onStatus(status,detail){
        if(status==='ready'){$('colmap-cloud-status').textContent=`${detail.toLocaleString()} POINTS`;$('colmap-cloud-placeholder-title').classList.add('hidden');}
        if(status==='preview'){$('colmap-cloud-status').textContent='SYNTHETIC PREVIEW';$('colmap-cloud-placeholder-title').classList.remove('hidden');}
        if(status==='loading')$('colmap-cloud-status').textContent='LOADING CLOUD…';
        if(status==='contextlost')$('colmap-cloud-status').textContent='VIEWER PAUSED';
        if(status==='error'){$('colmap-cloud-status').textContent='CLOUD UNAVAILABLE';$('colmap-cloud-placeholder-title').classList.remove('hidden');}
        if(status==='rotated'){$('colmap-cloud-autorotate').classList.remove('is-active');$('colmap-cloud-autorotate').setAttribute('aria-pressed','false');}
      }
    });
    function select(i){
      if(i===selected)return;
      selected=i;const s=samples[i];
      [...$('colmap-picker').children].forEach((b,n)=>b.setAttribute('aria-pressed',String(i===n)));
      const list=$('colmap-frames');list.replaceChildren();
      (s.frames||[]).forEach((frame,j)=>{
        const src=typeof frame==='string'?frame:frame.src;
        const name=typeof frame==='string'?`Input ${String(j+1).padStart(2,'0')}`:(frame.name||`Input ${String(j+1).padStart(2,'0')}`);
        const tile=document.createElement('div');tile.className='colmap-frame';
        const img=document.createElement('img');img.loading='lazy';img.decoding='async';img.src=src;img.alt=`${s.name}: ${name}`;
        if(typeof frame==='object'){if(frame.width)img.width=frame.width;if(frame.height)img.height=frame.height;}
        tile.append(img);list.appendChild(tile);
      });
      list.scrollTop=0;
      viewer.load(s.cloud,s.previewSeed||i+11,{rotationX:s.cloudRotationX||0,fallbackPath:s.cloudPLY||null});
    }
    makePicker($('colmap-picker'),samples,0,select);select(0);
    $('colmap-point-size').addEventListener('input',e=>viewer.setPointSize(e.target.value));
    $('colmap-cloud-reset').addEventListener('click',()=>viewer.reset());
    $('colmap-cloud-autorotate').addEventListener('click',e=>{viewer.autoRotate=!viewer.autoRotate;e.currentTarget.classList.toggle('is-active',viewer.autoRotate);e.currentTarget.setAttribute('aria-pressed',String(viewer.autoRotate));});
  }

  function initColmapWhenVisible(){
    if(!('IntersectionObserver' in window)){initColmap();return;}
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();initColmap();}
    },{rootMargin:'300px 0px'});
    observer.observe($('colmap-demo'));
  }

  function initCardMotion(){
    if(!('IntersectionObserver' in window))return;
    const observer=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}
      });
    },{rootMargin:'0px 0px -32px 0px',threshold:0});
    function observe(card){card.classList.add('scroll-card');observer.observe(card);}
    document.querySelectorAll('.teaser-card,.impact-item,.narrative-body.card,.result-table-block,.result-showcase,.demo-card,.bibtex-card').forEach(observe);
    // Benchmark tables are replaced when the result task changes.
    new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{
      if(node.nodeType===1&&node.matches('.result-table-block'))observe(node);
    }))).observe($('result-tables'),{childList:true});
  }

  async function copyText(s){
    if(navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(s);return true;}catch(_){/* fall back */}}
    const t=document.createElement('textarea');t.value=s;t.setAttribute('readonly','');t.style.cssText='position:fixed;opacity:0;left:-9999px';document.body.appendChild(t);t.select();
    try{return document.execCommand('copy');}finally{t.remove();}
  }
  function initBibtex(){
    $('copy-bibtex').addEventListener('click',async()=>{
      const ok=await copyText(C.bibtex);
      if(ok){$('copy-text').textContent='Copied!';setTimeout(()=>{$('copy-text').textContent='Copy';},2200);}
      else toast('Copy failed. Please select and copy the BibTeX text manually.');
    });
  }
  initProject();initAdvantages();initResults();initStereoWhenVisible();initVideoDemo('flow',C.opticalFlow);initVideoDemo('ego',C.ego4d);initColmapWhenVisible();initBibtex();initCardMotion();
})();
