(async function () {
  'use strict';
  const stage = document.querySelector('#stage');
  const canvas = document.querySelector('#game');
  const message = document.querySelector('#message');
  const buttonLayer = document.querySelector('#buttons');
  const pauseButton = document.querySelector('#pause');
  const resumeButton = document.querySelector('#resume');
  const restartButton = document.querySelector('#restart');
  const stateLabel = document.querySelector('#accessible-state');
  try {
    const data = window.AQUATEEN_SCENE, art = window.AQUATEEN_ART;
    if (!data || !art || !window.THREE || !window.AquateenEngine) throw new Error('Arquivo do jogo ausente. Mantenha os arquivos na mesma pasta.');
    const {Geometry, matrix, multiply, IDENTITY} = window.AquateenGeometry;
    const geometry = new Geometry(data, art);
    const renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: false});
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(data.background);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(0, data.width, 0, data.height, 0.1, 100);
    camera.position.z = 10;
    const textures = new Map(), geometries = new Map(), materials = new Map(), dynamic = new Map();
    const meshes = new Map(), controls = new Map();
    let engine, paused = false, last = 0, accumulator = 0, lastAnnouncement = '';
    const emptyColor = {mult: [1,1,1,1], add: [0,0,0,0]};

    function imageTexture(uri) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          const texture = new THREE.Texture(image);
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.generateMipmaps = false;
          texture.minFilter = texture.magFilter = THREE.LinearFilter;
          texture.needsUpdate = true; resolve(texture);
        };
        image.onerror = () => reject(new Error('Não foi possível carregar uma imagem do jogo.'));
        image.src = uri;
      });
    }
    await Promise.all(Object.entries(art.symbols).map(async ([id, symbol]) => {
      const uri = symbol.image || (symbol.svg && 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(symbol.svg));
      if (uri) textures.set(id, await imageTexture(uri));
    }));
    await document.fonts.ready;

    function textTexture(instance) {
      const symbol = instance.symbol;
      const value = symbol.variable ? engine.variable(instance.parent || engine.root, symbol.variable) : symbol.text;
      const text = value === undefined || value === null ? '' : String(value);
      let resource = dynamic.get(instance.uid);
      if (resource?.text === text) return resource;
      const [x0,x1,y0,y1] = symbol.bounds, resolution = 2;
      if (!resource) {
        const surface = document.createElement('canvas');
        surface.width = Math.max(1, Math.ceil((x1-x0)*resolution));
        surface.height = Math.max(1, Math.ceil((y1-y0)*resolution));
        const texture = new THREE.CanvasTexture(surface);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.generateMipmaps = false; texture.minFilter = THREE.LinearFilter;
        resource = {texture, surface, key:'text:'+instance.uid};
        dynamic.set(instance.uid,resource);
      }
      const ctx=resource.surface.getContext('2d');
      ctx.setTransform(1,0,0,1,0,0);
      ctx.clearRect(0,0,resource.surface.width,resource.surface.height);
      ctx.scale(resolution,resolution);
      const font=art.deviceFont, size=symbol.fontHeight/font.unitsPerEm;
      const glyphs=[...text].map(c=>font.glyphs[c]).filter(Boolean);
      const width=glyphs.reduce((sum,g)=>sum+g.advance*size,0);
      const color=symbol.color || [0,0,0,255];
      ctx.fillStyle=`rgba(${color[0]},${color[1]},${color[2]},${color[3]/255})`;
      let x=2+(symbol.leftMargin||0)+(symbol.indent||0);
      if(symbol.align===1)x=x1-x0-2-(symbol.rightMargin||0)-width;
      if(symbol.align===2)x=(x1-x0-width)/2;
      const baseline=2+font.ascent*size;
      for(const glyph of glyphs) {
        ctx.save();ctx.translate(x,baseline);ctx.scale(size,-size);
        ctx.fill(new Path2D(glyph.path));ctx.restore();
        x+=glyph.advance*size;
      }
      resource.text=text;resource.texture.needsUpdate=true;
      return resource;
    }
    function materialFor(texture, key, color = emptyColor) {
      const mkey = key+'|'+JSON.stringify(color);
      if (!materials.has(mkey)) {
        const material = new THREE.MeshBasicMaterial({map:texture, transparent:true, depthTest:false, depthWrite:false, side:THREE.DoubleSide});
        material.toneMapped = false;
        material.opacity = color.mult[3];
        material.color.setRGB(...color.mult.slice(0,3));
        materials.set(mkey,material);
      }
      return materials.get(mkey);
    }
    function geometryFor(bounds) {
      const key = bounds.join(',');
      if (!geometries.has(key)) {
        const [x0,x1,y0,y1] = bounds;
        const shape = new THREE.PlaneGeometry(Math.max(.001,x1-x0),Math.max(.001,y1-y0));
        shape.scale(1,-1,1);
        shape.translate((x0+x1)/2,(y0+y1)/2,0);
        geometries.set(key,shape);
      }
      return geometries.get(key);
    }
    function makeEngine() {
      return new window.AquateenEngine(data, {
        hitTest(a,b) {
          const aa=geometry.bounds(a), bb=geometry.bounds(b);
          return !!aa && !!bb && aa[0]<=bb[1] && aa[1]>=bb[0] && aa[2]<=bb[3] && aa[3]>=bb[2];
        }
      });
    }
    const names = {11:'Mestre Shake',16:'Almôndega',21:'Peterson',26:'Batatão',131:'Jogar novamente',133:'Escolher outro heroi'};
    function buttonName(instance) {
      if (names[instance.id]) return names[instance.id];
      for (const record of instance.symbol.records) {
        const label = art.symbols[record.id]?.text;
        if (label) return label;
      }
      return 'Jogar novamente';
    }
    function buttonControl(instance) {
      let control = controls.get(instance.uid);
      if (!control) {
        control = document.createElement('button');
        control.className = 'game-button';
        control.setAttribute('aria-label',buttonName(instance));
        control.dataset.symbol = instance.id;
        const state = value => { if (!paused && !instance.removed) {engine.setButtonState(instance,value); draw();} };
        control.addEventListener('pointerenter',()=>state(2));
        control.addEventListener('pointerleave',()=>state(1));
        control.addEventListener('pointerdown',()=>state(4));
        control.addEventListener('pointerup',()=>state(2));
        control.addEventListener('focus',()=>state(2));
        control.addEventListener('blur',()=>state(1));
        control.addEventListener('click',()=>{
          if (paused) return;
          engine.clickButton(instance); accumulator=0; draw();
        });
        buttonLayer.append(control); controls.set(instance.uid,control);
      }
      const b = geometry.bounds(instance,true);
      if (b) {
        control.style.left = (b[0]/data.width*100)+'%';
        control.style.top = (b[2]/data.height*100)+'%';
        control.style.width = ((b[1]-b[0])/data.width*100)+'%';
        control.style.height = ((b[3]-b[2])/data.height*100)+'%';
      }
      control.disabled = paused;
      return control;
    }
    function draw() {
      if (!engine) return;
      const activeMeshes = new Set(), activeControls = new Set();
      let order = 0;
      function visit(instance, parentMatrix) {
        const transform = multiply(parentMatrix,matrix(instance.matrix));
        if (instance.type === 'button') {buttonControl(instance); activeControls.add(instance.uid);}
        if (instance.children.size || instance.type === 'sprite' || instance.type === 'button') {
          for (const child of [...instance.children.values()].sort((a,b)=>a.depth-b.depth)) visit(child,transform);
          return;
        }
        const symbol = art.symbols[instance.id];
        const bounds = symbol?.bounds || instance.symbol?.bounds;
        if (!bounds) return;
        const resource = instance.type==='editText' ? textTexture(instance) : {texture:textures.get(String(instance.id)), key:String(instance.id)};
        if (!resource.texture) return;
        let mesh = meshes.get(instance.uid);
        if (!mesh) {
          mesh = new THREE.Mesh(geometryFor(bounds));
          mesh.matrixAutoUpdate = false;
          meshes.set(instance.uid,mesh); scene.add(mesh);
        }
        mesh.material = materialFor(resource.texture,resource.key,instance.cxform);
        const [a,b,c,d,tx,ty] = transform;
        mesh.matrix.set(a,c,0,tx, b,d,0,ty, 0,0,1,0, 0,0,0,1);
        mesh.matrixWorldNeedsUpdate = true;
        mesh.renderOrder = order++;
        activeMeshes.add(instance.uid);
      }
      visit(engine.root,IDENTITY);
      for (const [key,mesh] of meshes) if (!activeMeshes.has(key)) {
        scene.remove(mesh);meshes.delete(key);
        if(dynamic.has(key)) {
          dynamic.get(key).texture.dispose();dynamic.delete(key);
          for(const [mkey,material] of materials) if(mkey.startsWith('text:'+key+'|')) {material.dispose();materials.delete(mkey);}
        }
      }
      for (const [key,control] of controls) if (!activeControls.has(key)) {control.remove();controls.delete(key);}
      stage.style.cursor = engine.cursorVisible || paused ? 'default' : 'none';
      const frame = engine.root.frame;
      const screen = frame===1 ? 'Selecione o Heroi' : [81,162,243,324].includes(frame) ? 'Você venceu os Luanitos e salvou Carl!' : [82,163,244,325].includes(frame) ? 'Game over' : '';
      const announcement = screen || (engine.root.vars.vidas !== undefined ? `Vidas: ${engine.root.vars.vidas}` : '');
      if (announcement !== lastAnnouncement) {stateLabel.textContent=announcement;lastAnnouncement=announcement;}
      renderer.render(scene,camera);
      document.body.dataset.frame = frame;
    }
    function resize() {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,2));
      renderer.setSize(stage.clientWidth,stage.clientHeight,false);
      draw();
    }
    function setPaused(value) {
      paused = value; accumulator=0;
      resumeButton.hidden = !paused; pauseButton.textContent=paused?'Continuar':'Pausar';
      draw();
    }
    function position(event) {
      const rect = stage.getBoundingClientRect();
      return [(event.clientX-rect.left)/rect.width*data.width,(event.clientY-rect.top)/rect.height*data.height];
    }
    stage.addEventListener('pointermove',event=>{
      if (!paused) {engine.setPointer(...position(event)); draw();}
    });
    stage.addEventListener('pointerdown',event=>{
      if (!paused) engine.setPointer(...position(event));
      if (event.pointerType === 'touch' && event.target === canvas) canvas.setPointerCapture(event.pointerId);
    });
    pauseButton.addEventListener('click',()=>setPaused(!paused));
    resumeButton.addEventListener('click',()=>setPaused(false));
    restartButton.addEventListener('click',()=>{engine.reset();setPaused(false);draw();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!document.fullscreenElement)setPaused(!paused);});
    document.addEventListener('visibilitychange',()=>{if(document.hidden && engine.root.frame!==1)setPaused(true);last=0;});
    document.querySelector('#fullscreen').addEventListener('click',async()=>{
      try {
        if(document.fullscreenElement) await document.exitFullscreen(); else await stage.requestFullscreen();
      } catch {stateLabel.textContent='Tela cheia não está disponível neste navegador.';}
    });
    document.addEventListener('fullscreenchange',()=>{document.querySelector('#fullscreen').textContent=document.fullscreenElement?'Sair da tela cheia':'Tela cheia';resize();});
    function loop(now) {
      if (!last) last=now;
      const elapsed=Math.min(now-last,250);last=now;
      if (!paused) {
        accumulator+=elapsed;
        while(accumulator>=1000/data.fps) {engine.tick();accumulator-=1000/data.fps;}
      }
      draw();requestAnimationFrame(loop);
    }
    engine=makeEngine();
    window.aquateen={get engine(){return engine;},renderer,scene,camera,art,geometry,draw,setPaused,get paused(){return paused;}};
    pauseButton.disabled=restartButton.disabled=false;
    message.hidden=true;
    new ResizeObserver(resize).observe(stage);
    resize();document.body.dataset.ready='true';
    requestAnimationFrame(loop);
  } catch (error) {
    console.error(error);
    message.hidden=false;
    message.textContent='Não foi possível iniciar o jogo. '+error.message;
    document.body.dataset.ready='error';
  }
})();
