from extract_swf import *
import base64

symbols={};timelines={};background='#ffffff'
def cxform(r):
    add,mul,n=r.read(1),r.read(1),r.read(4)
    mult=[r.read(n,True)/256 for _ in range(4)] if mul else [1]*4
    plus=[r.read(n,True) for _ in range(4)] if add else [0]*4
    r.align();return dict(mult=mult,add=plus)
def parse(data,pos,owner,count):
    global background
    timeline={'frameCount':count,'frames':[[] for _ in range(count)]};timelines[str(owner)]=timeline;frame=0
    while pos+2<=len(data):
        h=u16(data,pos);pos+=2;typ=h>>6;n=h&63
        if n==63:n=u32(data,pos);pos+=4
        d=data[pos:pos+n];pos+=n;commands=timeline['frames'][min(frame,count-1)]
        if typ==1:frame+=1
        elif typ==9:background='#'+d.hex()
        elif typ==12:commands.append({'op':'actions','actions':actions(d)})
        elif typ==39:
            ident=u16(d);symbols[str(ident)]={'type':'sprite','id':ident};parse(d,4,ident,u16(d,2))
        elif typ==34:
            ident=u16(d);p=5;records=[];buttonActions=[]
            while d[p]:
                flags=d[p];cid=u16(d,p+1);depth=u16(d,p+3);r=Bits(d,p+5);mat=r.matrix();cx=cxform(r);p=r.offset
                assert not flags&0x30,('unsupported button filters',ident)
                records.append({'flags':flags,'id':cid,'depth':depth,'matrix':mat,'cxform':cx})
            actionOffset=u16(d,3)
            if actionOffset:
                p=3+actionOffset
                while p<len(d):
                    size=u16(d,p);cond=u16(d,p+2);end=p+size if size else len(d)
                    buttonActions.append({'condition':cond,'actions':actions(d[p+4:end])})
                    if not size:break
                    p=end
            symbols[str(ident)]={'type':'button','id':ident,'records':records,'actions':buttonActions}
        elif typ==26:
            flags=d[0];depth=u16(d,1);p=3;entry={'op':'place','depth':depth,'move':bool(flags&1)}
            if flags&2:entry['id']=u16(d,p);p+=2
            if flags&4:r=Bits(d,p);entry['matrix']=r.matrix();p=r.offset
            if flags&8:r=Bits(d,p);entry['cxform']=cxform(r);p=r.offset
            if flags&16:entry['ratio']=u16(d,p);p+=2
            if flags&32:entry['name'],p=cstring(d,p)
            if flags&64:entry['clipDepth']=u16(d,p);p+=2
            if flags&128:
                p+=2;allflags=u32(d,p);p+=4;entry['events']=[]
                while p+4<=len(d):
                    ev=u32(d,p);p+=4
                    if not ev:break
                    length=u32(d,p);p+=4;ad=d[p:p+length];p+=length
                    entry['events'].append({'event':ev,'actions':actions(ad[1:] if ev&0x20000 else ad)})
            commands.append(entry)
        elif typ==28:commands.append({'op':'remove','depth':u16(d)})
        elif typ==37:
            ident=u16(d);r=Bits(d,2);bounds=r.rect();flags=r.read(16);p=r.offset;item={'type':'editText','id':ident,'bounds':[v/20 for v in bounds],'flags':flags}
            if flags&0x100:item['fontId']=u16(d,p);p+=2
            if flags&0x80:item['fontClass'],p=cstring(d,p)
            if flags&0x100:item['fontHeight']=u16(d,p)/20;p+=2
            if flags&0x400:item['color']=list(d[p:p+4]);p+=4
            if flags&0x200:item['maxLength']=u16(d,p);p+=2
            if flags&0x20:
                item['align']=d[p];item['leftMargin']=u16(d,p+1)/20;item['rightMargin']=u16(d,p+3)/20;item['indent']=u16(d,p+5)/20;item['leading']=struct.unpack_from('<h',d,p+7)[0]/20;p+=9
            item['variable'],p=cstring(d,p)
            if flags&0x8000:item['text'],p=cstring(d,p)
            symbols[str(ident)]=item
        elif typ in (2,6,10,11,20,21,22,32,33,35,36,48):
            ident=u16(d);symbols[str(ident)]={'type':'art','id':ident,'tag':typ}
        if typ==0:break
reader=Bits(swf,8);stage=reader.rect();p=reader.offset
parse(swf,p+4,'root',u16(swf,p+2))
scene={'width':(stage[1]-stage[0])/20,'height':(stage[3]-stage[2])/20,'fps':fps,'background':background,'symbols':symbols,'timelines':timelines,'sourceSha256':hashlib.sha256(raw).hexdigest()}
(ROOT/'assets'/'scene.json').write_text(json.dumps(scene,separators=(',',':')))
(ROOT/'assets'/'scene-data.js').write_text('window.AQUATEEN_SCENE='+json.dumps(scene,separators=(',',':'))+';\n')
print('Exported',len(symbols),'symbols;',len(timelines),'timelines;',sum(len(f) for t in timelines.values() for f in t['frames']),'commands')
