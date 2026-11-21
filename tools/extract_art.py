"""Recover the game's original vector paths, glyph outlines and bitmap fills.

No artwork is redesigned. Coordinates in SVGs are original SWF twips; public
bounds are pixels. Font shapes use their original 1024-unit em coordinates.
"""
from pathlib import Path
import base64, collections, html, json, struct, zlib, subprocess, os

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / 'Aquateen Player' / 'Aquateen.swf'
SHARP = os.environ.get('SHARP_MODULE', 'sharp')

class Reader:
    def __init__(self, data, offset=0): self.data, self.bit = data, offset*8
    def bits(self, n, signed=False):
        v=0
        for _ in range(n):
            v=(v<<1)|((self.data[self.bit//8]>>(7-self.bit%8))&1); self.bit+=1
        return v-(1<<n) if signed and n and v&(1<<(n-1)) else v
    def align(self): self.bit=(self.bit+7)//8*8
    @property
    def pos(self): return self.bit//8
    @pos.setter
    def pos(self, n): self.bit=n*8
    def byte(self): self.align(); v=self.data[self.pos]; self.bit+=8; return v
    def u16(self): self.align(); v=struct.unpack_from('<H',self.data,self.pos)[0]; self.bit+=16; return v
    def s16(self): self.align(); v=struct.unpack_from('<h',self.data,self.pos)[0]; self.bit+=16; return v
    def u32(self): self.align(); v=struct.unpack_from('<I',self.data,self.pos)[0]; self.bit+=32; return v
    def string(self):
        start=self.pos; end=self.data.index(0,start); self.pos=end+1
        return self.data[start:end].decode('latin1')
    def rect(self):
        n=self.bits(5); v=[self.bits(n,True) for _ in range(4)]; self.align(); return [v[0],v[2],v[1],v[3]]
    def matrix(self):
        a=d=1.; b=c=0.
        if self.bits(1): n=self.bits(5); a=self.bits(n,True)/65536; d=self.bits(n,True)/65536
        if self.bits(1): n=self.bits(5); b=self.bits(n,True)/65536; c=self.bits(n,True)/65536
        n=self.bits(5); x=self.bits(n,True); y=self.bits(n,True); self.align()
        return [a,b,c,d,x,y]
    def color(self, alpha=False): return [self.byte(),self.byte(),self.byte(),self.byte() if alpha else 255]

def tags(data,start):
    r=Reader(data,start)
    while r.pos+2<=len(data):
        h=r.u16(); typ,size=h>>6,h&63
        if size==63:size=r.u32()
        payload=data[r.pos:r.pos+size];r.pos+=size
        yield typ,payload
        if typ==39: yield from tags(payload,4)
        if typ==0:break

def n(value): return str(round(value,6)).rstrip('0').rstrip('.') if isinstance(value,float) and value!=int(value) else str(int(value))
def mat(m):return 'matrix('+ ' '.join(n(x) for x in m)+')'
def color(c):return '#'+''.join(f'{v:02x}' for v in c[:3])
def uri(data,mime):return 'data:'+mime+';base64,'+base64.b64encode(data).decode()

def read_fills(r, alpha, version):
    count=r.byte()
    if count==255 and version>=2:count=r.u16()
    out=[]
    for _ in range(count):
        typ=r.byte();f={'type':typ}
        if typ==0:f['color']=r.color(alpha)
        elif typ in (0x10,0x12,0x13):
            f['matrix']=r.matrix(); mode=r.byte();f['spread']=mode>>6; f['stops']=[[r.byte(),r.color(alpha)] for _ in range(mode&15)]
            if typ==0x13:f['focal']=r.s16()/256
        elif typ in (0x40,0x41,0x42,0x43):f['bitmap']=r.u16();f['matrix']=r.matrix()
        else:raise ValueError('Unsupported fill '+hex(typ))
        out.append(f)
    return out

def read_lines(r, alpha,version):
    count=r.byte()
    if count==255 and version>=2:count=r.u16()
    return [{'width':r.u16(),'color':r.color(alpha)} for _ in range(count)]

def reverse(edge):return (edge[2],edge[1],edge[0])
def shape_records(r, fills=None,lines=None,alpha=False,version=1):
    fills=[] if fills is None else fills;lines=[] if lines is None else lines
    nf,nl=r.bits(4),r.bits(4);f0=f1=line=0;x=y=0;fo=lo=0
    fe=collections.defaultdict(list);le=collections.defaultdict(list)
    while True:
        edge=r.bits(1)
        if not edge:
            flags=r.bits(5)
            if not flags:break
            if flags&1:bits=r.bits(5);x=r.bits(bits,True);y=r.bits(bits,True)
            if flags&2:f0=r.bits(nf);f0=f0+fo if f0 else 0
            if flags&4:f1=r.bits(nf);f1=f1+fo if f1 else 0
            if flags&8:line=r.bits(nl);line=line+lo if line else 0
            if flags&16:
                r.align();fo=len(fills);lo=len(lines);fills.extend(read_fills(r,alpha,version));lines.extend(read_lines(r,alpha,version));nf,nl=r.bits(4),r.bits(4)
            continue
        straight=r.bits(1);bits=r.bits(4)+2;start=(x,y);control=None
        if straight:
            if r.bits(1):x+=r.bits(bits,True);y+=r.bits(bits,True)
            elif r.bits(1):y+=r.bits(bits,True)
            else:x+=r.bits(bits,True)
        else:
            cx=x+r.bits(bits,True);cy=y+r.bits(bits,True);x=cx+r.bits(bits,True);y=cy+r.bits(bits,True);control=(cx,cy)
        e=(start,control,(x,y))
        if f0:fe[f0].append(e)
        if f1:fe[f1].append(reverse(e))
        if line:le[line].append(e)
    r.align();return fills,lines,fe,le

def paths(edges, close=True):
    remaining=list(edges);out=[]
    while remaining:
        edge=remaining.pop(0);start=edge[0];path=f'M{start[0]} {start[1]}'
        while True:
            end=edge[2]
            path+=f'Q{edge[1][0]} {edge[1][1]} {end[0]} {end[1]}' if edge[1] else f'L{end[0]} {end[1]}'
            if end==start:
                if close:path+='Z'
                break
            index=next((i for i,e in enumerate(remaining) if e[0]==end),None)
            if index is None:
                index=next((i for i,e in enumerate(remaining) if e[2]==end),None)
                if index is not None:remaining[index]=reverse(remaining[index])
            if index is None:break
            edge=remaining.pop(index)
        out.append(path)
    return ' '.join(out)

raw=SOURCE.read_bytes();swf=raw[:8]+zlib.decompress(raw[8:]) if raw[:3]==b'CWS' else raw
r=Reader(swf,8);stage=r.rect();r.pos+=4;records=list(tags(swf,r.pos))
bitmaps={};warnings=[];symbols={};fonts={}
jpeg_tables=next((d for t,d in records if t==8),b'')
for typ,data in records:
    if typ not in (6,21,35):continue
    ident=struct.unpack_from('<H',data)[0];png=ROOT/'assets'/f'bitmap-{ident}.png';jpg=ROOT/'assets'/f'bitmap-{ident}.jpg'
    if typ==6:
        jpeg=(jpeg_tables[:-2]+data[2:][2:]).replace(b'\xff\xd9\xff\xd8',b'');jpg.write_bytes(jpeg)
    if png.exists():content=png.read_bytes();mime='image/png'
    else:content=jpg.read_bytes();mime='image/jpeg'
    bitmaps[ident]={'data':uri(content,mime),'file':str(png if png.exists() else jpg)}

metadata_js="const sharp=require(process.argv[1]);let b='';process.stdin.on('data',x=>b+=x).on('end',async()=>{const o={};for(const [id,p] of Object.entries(JSON.parse(b))){try{const m=await sharp(p).metadata();o[id]=[m.width,m.height]}catch(e){o[id]={error:e.message}}}process.stdout.write(JSON.stringify(o))})"
meta=json.loads(subprocess.check_output(['node','-e',metadata_js,SHARP],input=json.dumps({i:b['file'] for i,b in bitmaps.items()}).encode()))
for ident,b in bitmaps.items():
    size=meta[str(ident)]
    if isinstance(size,dict):warnings.append(size);continue
    b['width'],b['height']=size
    symbols[str(ident)]={'kind':'bitmap','image':b['data'],'bounds':[0,0,*size]}

def make_svg(bounds,body,defs=''):
    x0,y0,x1,y1=bounds
    return f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{n((x1-x0)/20)}" height="{n((y1-y0)/20)}" viewBox="{x0} {y0} {x1-x0} {y1-y0}"><defs>{defs}</defs>{body}</svg>'

def render_shape(fills,lines,fe,le,ident):
    defs=[];body=[]
    for index,edges in fe.items():
        f=fills[index-1];typ=f['type'];attrs=''
        if typ==0:paint=color(f['color']);attrs=f' fill-opacity="{f["color"][3]/255}"'
        elif typ in (0x40,0x41,0x42,0x43):
            b=bitmaps.get(f['bitmap']);pid=f'p{ident}_{index}'
            if not b or 'width' not in b:warnings.append(f'Missing bitmap {f["bitmap"]}');continue
            defs.append(f'<pattern id="{pid}" patternUnits="userSpaceOnUse" width="{b["width"]}" height="{b["height"]}" patternTransform="{mat(f["matrix"])}"><image width="{b["width"]}" height="{b["height"]}" xlink:href="{b["data"]}"/></pattern>')
            paint=f'url(#{pid})'
        elif typ in (0x10,0x12,0x13):
            pid=f'g{ident}_{index}';spread=['pad','reflect','repeat','pad'][f['spread']];gtyp='linearGradient' if typ==0x10 else 'radialGradient'
            coords='x1="-16384" y1="0" x2="16384" y2="0"' if typ==0x10 else f'cx="0" cy="0" r="16384" fx="{f.get("focal",0)*16384}" fy="0"'
            stops=''.join(f'<stop offset="{ratio/255}" stop-color="{color(c)}" stop-opacity="{c[3]/255}"/>' for ratio,c in f['stops'])
            defs.append(f'<{gtyp} id="{pid}" gradientUnits="userSpaceOnUse" gradientTransform="{mat(f["matrix"])}" spreadMethod="{spread}" {coords}>{stops}</{gtyp}>');paint=f'url(#{pid})'
        else:raise ValueError(typ)
        body.append(f'<path d="{paths(edges)}" fill="{paint}" fill-rule="evenodd"{attrs}/>')
    for index,edges in le.items():
        line=lines[index-1];c=line['color'];body.append(f'<path d="{paths(edges,False)}" fill="none" stroke="{color(c)}" stroke-opacity="{c[3]/255}" stroke-width="{line["width"] or 20}" stroke-linecap="round" stroke-linejoin="round"/>')
    return ''.join(body),''.join(defs)

for typ,data in records:
    if typ in (2,22,32):
        r=Reader(data);ident=r.u16();bounds=r.rect();version={2:1,22:2,32:3}[typ];alpha=typ==32
        fills=read_fills(r,alpha,version);lines=read_lines(r,alpha,version);parsed=shape_records(r,fills,lines,alpha,version);body,defs=render_shape(*parsed,ident)
        symbols[str(ident)]={'kind':'shape','svg':make_svg(bounds,body,defs),'bounds':[v/20 for v in bounds]}
    elif typ==10:
        r=Reader(data);ident=r.u16();base=r.pos;first=r.u16();count=first//2;offsets=[first]+[r.u16() for _ in range(count-1)];glyphs=[]
        for offset in offsets:
            rr=Reader(data,base+offset);_,_,fe,le=shape_records(rr);glyphs.append(' '.join(paths(v) for v in fe.values()))
        fonts[ident]={'glyphs':glyphs}

for typ,data in records:
    if typ in (13,62):
        r=Reader(data);ident=r.u16();length=r.byte();name=data[r.pos:r.pos+length].decode('latin1');r.pos+=length;flags=r.byte()
        if typ==62:r.byte()
        codes=[]
        while r.pos<len(data):codes.append(r.u16() if flags&1 else r.byte())
        fonts[ident].update(name=name,codes=codes,bold=bool(flags&2),italic=bool(flags&4))

for typ,data in records:
    if typ in (11,33):
        r=Reader(data);ident=r.u16();bounds=r.rect();matrix=r.matrix();gb=r.byte();ab=r.byte();fid=None;height=1024;c=[0,0,0,255];x=y=0;body=[];text=[]
        while True:
            flags=r.byte()
            if not flags:break
            if flags&8:fid=r.u16()
            if flags&4:c=r.color(typ==33)
            if flags&1:x=r.s16()
            if flags&2:y=r.s16()
            if flags&8:height=r.u16()
            count=r.byte();font=fonts[fid]
            for _ in range(count):
                gi=r.bits(gb);advance=r.bits(ab,True);path=font['glyphs'][gi]
                body.append(f'<path d="{path}" fill="{color(c)}" fill-opacity="{c[3]/255}" fill-rule="evenodd" transform="translate({x} {y}) scale({height/1024})"/>')
                text.append(chr(font['codes'][gi]));x+=advance
            r.align()
        content=f'<g transform="{mat(matrix)}">'+''.join(body)+'</g>'
        symbols[str(ident)]={'kind':'text','text':''.join(text),'svg':make_svg(bounds,content),'bounds':[v/20 for v in bounds]}
    elif typ==37:
        r=Reader(data);ident=r.u16();bounds=r.rect();flags=r.bits(16);entry={'kind':'dynamic-text','bounds':[v/20 for v in bounds],'flags':flags}
        if flags&0x100:entry['fontId']=r.u16()
        if flags&0x80:entry['fontClass']=r.string()
        if flags&0x100:entry['fontHeight']=r.u16()/20
        if flags&0x400:entry['color']=r.color(True)
        if flags&0x200:entry['maxLength']=r.u16()
        if flags&0x20:entry['layout']={'align':r.byte(),'leftMargin':r.u16()/20,'rightMargin':r.u16()/20,'indent':r.u16()/20,'leading':r.s16()/20}
        entry['variable']=r.string()
        if flags&0x8000:entry['initialText']=r.string()
        symbols[str(ident)]=entry

def device_digit_outlines(path):
    """The SWF explicitly requests device text: its font has no embedded digits.
    Recover numeric outlines from the matching locally installed typeface.
    """
    data=Path(path).read_bytes()
    be16=lambda p:struct.unpack_from('>H',data,p)[0]
    bs16=lambda p:struct.unpack_from('>h',data,p)[0]
    be32=lambda p:struct.unpack_from('>I',data,p)[0]
    tables={}
    for i in range(be16(4)):
        p=12+16*i;tables[data[p:p+4].decode('ascii')]=be32(p+8)
    head=tables['head'];hhea=tables['hhea'];em=be16(head+18);locatype=bs16(head+50);nmetrics=be16(hhea+34)
    cmap=tables['cmap'];subtables=[]
    for i in range(be16(cmap+2)):
        p=cmap+4+8*i;off=cmap+be32(p+4)
        if be16(off)==4:subtables.append(off)
    cm=subtables[-1];segments=be16(cm+6)//2;ends=cm+14;starts=ends+2*segments+2;deltas=starts+2*segments;ro=deltas+2*segments
    def glyph_index(code):
        for i in range(segments):
            if be16(starts+2*i)<=code<=be16(ends+2*i):
                delta=bs16(deltas+2*i);rng=be16(ro+2*i)
                if not rng:return (code+delta)&65535
                ix=be16(ro+2*i+rng+2*(code-be16(starts+2*i)))
                return (ix+delta)&65535 if ix else 0
        return 0
    result={'name':'Comic Sans MS','source':'Matching macOS device font; numerals are not embedded in the SWF','unitsPerEm':em,'ascent':bs16(hhea+4),'descent':bs16(hhea+6),'lineGap':bs16(hhea+8),'glyphs':{}}
    for ch in '0123456789-':
        idx=glyph_index(ord(ch));loc=tables['loca']+(4 if locatype else 2)*idx;off=be32(loc) if locatype else be16(loc)*2;p=tables['glyf']+off;contours=bs16(p)
        if contours<0:raise ValueError('Composite numeric glyph is unsupported')
        bbox=[bs16(p+2),bs16(p+4),bs16(p+6),bs16(p+8)];p+=10
        ends2=[be16(p+2*i) for i in range(contours)];p+=contours*2;instructions=be16(p);p+=2+instructions;count=ends2[-1]+1 if ends2 else 0;flags=[]
        while len(flags)<count:
            flag=data[p];p+=1;flags.append(flag)
            if flag&8:repeat=data[p];p+=1;flags.extend([flag]*repeat)
        x=y=0;xs=[];ys=[]
        for f in flags:
            if f&2:delta=data[p]*(1 if f&16 else -1);p+=1
            elif f&16:delta=0
            else:delta=bs16(p);p+=2
            x+=delta;xs.append(x)
        for f in flags:
            if f&4:delta=data[p]*(1 if f&32 else -1);p+=1
            elif f&32:delta=0
            else:delta=bs16(p);p+=2
            y+=delta;ys.append(y)
        commands=[];startindex=0
        for endindex in ends2:
            pts=[(xs[i],ys[i],bool(flags[i]&1)) for i in range(startindex,endindex+1)];startindex=endindex+1
            expanded=[]
            for i,pt in enumerate(pts):
                expanded.append(pt);nxt=pts[(i+1)%len(pts)]
                if not pt[2] and not nxt[2]:expanded.append(((pt[0]+nxt[0])/2,(pt[1]+nxt[1])/2,True))
            pivot=next(i for i,pt in enumerate(expanded) if pt[2]);expanded=expanded[pivot:]+expanded[:pivot];first=expanded[0];commands.append(f'M{n(first[0])} {n(first[1])}');i=1
            while i<=len(expanded):
                pt=expanded[i%len(expanded)]
                if pt[2]:commands.append(f'L{n(pt[0])} {n(pt[1])}');i+=1
                else:
                    nxt=expanded[(i+1)%len(expanded)];commands.append(f'Q{n(pt[0])} {n(pt[1])} {n(nxt[0])} {n(nxt[1])}');i+=2
            commands.append('Z')
        advance=be16(tables['hmtx']+4*min(idx,nmetrics-1))
        result['glyphs'][ch]={'path':''.join(commands),'advance':advance,'bounds':bbox}
    return result

device_font=device_digit_outlines(os.environ.get('COMIC_SANS_FONT', '/System/Library/Fonts/Supplemental/Comic Sans MS.ttf'))
for entry in symbols.values():
    x0,y0,x1,y1=entry['bounds'];entry['bounds']=[x0,x1,y0,y1]
    if 'svg' in entry:entry['image']=uri(entry['svg'].encode(),'image/svg+xml')
result={'source':'Aquateen Player/Aquateen.swf','boundsOrder':'xmin,xmax,ymin,ymax','symbols':symbols,'fonts':{str(k):v for k,v in fonts.items()},'deviceFont':device_font,'warnings':warnings}
helper=r'''
// Dynamic numeric text used device Comic Sans in the original SWF.
// Shapes and advances below come from the matching installed typeface.
window.AQUATEEN_ART.makeTextSVG = function(symbolOrId, value) {
  const art = window.AQUATEEN_ART;
  const symbol = typeof symbolOrId === 'object' ? symbolOrId : art.symbols[symbolOrId];
  const [xmin, xmax, ymin, ymax] = symbol.bounds;
  const font = art.deviceFont;
  const scale = symbol.fontHeight / font.unitsPerEm;
  const layout = symbol.layout || {};
  const text = String(value ?? symbol.initialText ?? '');
  const glyphs = [...text].map(c => font.glyphs[c]).filter(Boolean);
  const width = glyphs.reduce((sum, g) => sum + g.advance * scale, 0);
  let x = xmin + 2 + (layout.leftMargin || 0) + (layout.indent || 0);
  if (layout.align === 1) x = xmax - 2 - (layout.rightMargin || 0) - width;
  if (layout.align === 2) x = (xmin + xmax - width) / 2;
  const baseline = ymin + 2 + font.ascent * scale;
  const rgba = symbol.color || [0,0,0,255];
  const fill = '#' + rgba.slice(0,3).map(c=>c.toString(16).padStart(2,'0')).join('');
  const paths = glyphs.map(g => {
    const p = `<path d="${g.path}" transform="translate(${x} ${baseline}) scale(${scale} ${-scale})"/>`;
    x += g.advance * scale; return p;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${xmax-xmin}" height="${ymax-ymin}" viewBox="${xmin} ${ymin} ${xmax-xmin} ${ymax-ymin}"><g fill="${fill}" fill-opacity="${rgba[3]/255}">${paths}</g></svg>`;
};
'''
(ROOT/'art-data.js').write_text('window.AQUATEEN_ART = '+json.dumps(result,separators=(',',':'))+';\n'+helper)
print(json.dumps({'symbols':len(symbols),'kinds':dict(collections.Counter(s['kind'] for s in symbols.values())),'fonts':len(fonts),'warnings':warnings}))
