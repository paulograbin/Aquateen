from pathlib import Path
import struct, zlib, re, json, hashlib, sys

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT.parent / 'Aquateen Player/Aquateen.swf'
ASSETS = ROOT / 'assets'
ASSETS.mkdir(exist_ok=True)

class Bits:
    def __init__(self, data, pos=0): self.data=data; self.pos=pos*8
    def read(self, n, signed=False):
        value=0
        for _ in range(n):
            value=(value<<1)|((self.data[self.pos//8]>>(7-self.pos%8))&1);self.pos+=1
        return value-(1<<n) if signed and n and value&(1<<(n-1)) else value
    def align(self): self.pos=(self.pos+7)//8*8
    def rect(self):
        n=self.read(5);v=[self.read(n,True) for _ in range(4)];self.align();return v
    def matrix(self):
        scale=[1,1]; skew=[0,0]
        if self.read(1):
            n=self.read(5);scale=[self.read(n,True)/65536,self.read(n,True)/65536]
        if self.read(1):
            n=self.read(5);skew=[self.read(n,True)/65536,self.read(n,True)/65536]
        n=self.read(5);xy=[self.read(n,True)/20,self.read(n,True)/20];self.align()
        return dict(scale=scale,skew=skew,xy=xy)
    def cxform(self,alpha=False):
        add,mul,n=self.read(1),self.read(1),self.read(4)
        for _ in range((3+alpha)*(add+mul)):self.read(n,True)
        self.align()
    @property
    def offset(self):return self.pos//8

def u16(b,p=0):return struct.unpack_from('<H',b,p)[0]
def u32(b,p=0):return struct.unpack_from('<I',b,p)[0]
def cstring(b,p=0):
    end=b.index(0,p);return b[p:end].decode('latin1'),end+1

OPCODES={0x00:'End',0x04:'NextFrame',0x05:'PreviousFrame',0x06:'Play',0x07:'Stop',0x08:'ToggleQuality',0x09:'StopSounds',0x0a:'Add',0x0b:'Subtract',0x0c:'Multiply',0x0d:'Divide',0x0e:'Equals',0x0f:'Less',0x10:'And',0x11:'Or',0x12:'Not',0x17:'Pop',0x18:'ToInteger',0x1c:'GetVariable',0x1d:'SetVariable',0x20:'SetTarget2',0x21:'StringAdd',0x22:'GetProperty',0x23:'SetProperty',0x24:'CloneSprite',0x25:'RemoveSprite',0x26:'Trace',0x27:'StartDrag',0x28:'EndDrag',0x29:'StringLess',0x30:'RandomNumber',0x34:'GetTime',0x3a:'Delete',0x3b:'Delete2',0x3c:'DefineLocal',0x3d:'CallFunction',0x3e:'Return',0x3f:'Modulo',0x40:'NewObject',0x41:'DefineLocal2',0x42:'InitArray',0x43:'InitObject',0x44:'TypeOf',0x45:'TargetPath',0x47:'Add2',0x48:'Less2',0x49:'Equals2',0x4a:'ToNumber',0x4b:'ToString',0x4c:'PushDuplicate',0x4d:'StackSwap',0x4e:'GetMember',0x4f:'SetMember',0x50:'Increment',0x51:'Decrement',0x52:'CallMethod',0x53:'NewMethod',0x60:'BitAnd',0x61:'BitOr',0x62:'BitXor',0x66:'StrictEquals',0x67:'Greater',0x68:'StringGreater',0x81:'GotoFrame',0x83:'GetURL',0x87:'StoreRegister',0x88:'ConstantPool',0x8a:'WaitForFrame',0x8b:'SetTarget',0x8c:'GotoLabel',0x8d:'WaitForFrame2',0x8e:'DefineFunction2',0x94:'With',0x96:'Push',0x99:'Jump',0x9a:'GetURL2',0x9b:'DefineFunction',0x9d:'If',0x9e:'Call',0x9f:'GotoFrame2'}
def actions(data):
    pos=0;pool=[];out=[]
    while pos<len(data):
        start=pos;op=data[pos];pos+=1
        size=u16(data,pos) if op>=128 else 0;pos+=2 if op>=128 else 0
        d=data[pos:pos+size];pos+=size;arg=None
        if op==0x88:
            p=2;pool=[]
            for _ in range(u16(d)):v,p=cstring(d,p);pool.append(v)
            arg=pool
        elif op==0x96:
            p=0;arg=[]
            while p<len(d):
                typ=d[p];p+=1
                if typ==0:v,p=cstring(d,p)
                elif typ==1:v=struct.unpack_from('<f',d,p)[0];p+=4
                elif typ==2:v=None
                elif typ==3:v='undefined'
                elif typ==4:v={'register':d[p]};p+=1
                elif typ==5:v=bool(d[p]);p+=1
                elif typ==6:v=struct.unpack('<d',d[p+4:p+8]+d[p:p+4])[0];p+=8
                elif typ==7:v=struct.unpack_from('<i',d,p)[0];p+=4
                elif typ in (8,9):
                    idx=d[p] if typ==8 else u16(d,p);p+=1 if typ==8 else 2;v=pool[idx] if idx<len(pool) else {'constant':idx}
                else:v={'unknownType':typ};break
                arg.append(v)
        elif op in (0x99,0x9d):arg={'target':pos+struct.unpack('<h',d)[0]}
        elif op==0x81:arg=u16(d)+1
        elif op in (0x8b,0x8c):arg=cstring(d)[0]
        elif op==0x83:arg=d.split(b'\0')
        elif op==0x87:arg=d[0]
        elif size:arg=d.hex()
        out.append({'offset':start,'op':OPCODES.get(op,hex(op)),'arg':arg})
        if op==0:break
    return out

raw=SOURCE.read_bytes();swf=raw[:8]+zlib.decompress(raw[8:]) if raw[:3]==b'CWS' else raw
reader=Bits(swf,8);rect=reader.rect();p=reader.offset;fps=u16(swf,p)/256;frames=u16(swf,p+2)
inventory=[];scripts=[];images=[];placements=[]
def tags(data,pos,owner):
    frame=1
    while pos+2<=len(data):
        off=pos;h=u16(data,pos);pos+=2;typ=h>>6;n=h&63
        if n==63:n=u32(data,pos);pos+=4
        d=data[pos:pos+n];pos+=n
        item={'owner':owner,'frame':frame,'tag':typ,'offset':off,'size':n}
        if typ in (2,6,7,10,11,20,21,22,32,33,34,35,36,37,39,48):item['id']=u16(d)
        inventory.append(item)
        if typ==1:frame+=1
        elif typ==12:scripts.append(dict(owner=owner,frame=frame,kind='frame',actions=actions(d)))
        elif typ==39:tags(d,4,'sprite-'+str(u16(d)))
        elif typ==34:
            ident=u16(d);ao=u16(d,3)
            if ao:
                ap=3+ao
                while ap<len(d):
                    size=u16(d,ap);cond=u16(d,ap+2);end=ap+size if size else len(d)
                    scripts.append(dict(owner='button-'+str(ident),frame=frame,kind='button',condition=hex(cond),actions=actions(d[ap+4:end])))
                    if not size:break
                    ap=end
        elif typ in (21,35):
            ident=u16(d);jpg=d[2:] if typ==21 else d[6:6+u32(d,2)]
            jpg=jpg.replace(b'\xff\xd9\xff\xd8',b'')
            suffix='png' if jpg.startswith(b'\x89PNG') else 'jpg';name=f'bitmap-{ident}.{suffix}'
            (ASSETS/name).write_bytes(jpg);images.append(dict(id=ident,path=name,tag=typ))
            if typ==35:
                alpha=zlib.decompress(d[6+u32(d,2):]);(ASSETS/f'bitmap-{ident}.alpha').write_bytes(alpha)
        elif typ==26:
            flags=d[0];depth=u16(d,1);p=3;entry=dict(owner=owner,frame=frame,depth=depth,flags=flags)
            if flags&2:entry['id']=u16(d,p);p+=2
            if flags&4:r=Bits(d,p);entry['matrix']=r.matrix();p=r.offset
            if flags&8:r=Bits(d,p);r.cxform(True);p=r.offset
            if flags&16:entry['ratio']=u16(d,p);p+=2
            if flags&32:entry['name'],p=cstring(d,p)
            if flags&64:p+=2
            if flags&128:
                p+=2;allflags=u32(d,p);p+=4
                while p+4<=len(d):
                    ev=u32(d,p);p+=4
                    if not ev:break
                    length=u32(d,p);p+=4;ad=d[p:p+length];p+=length
                    scripts.append(dict(owner=owner,frame=frame,kind='clip',depth=depth,event=hex(ev),actions=actions(ad[1:] if ev&0x20000 else ad)))
            placements.append(entry)
        if typ==0:break
tags(swf,p+4,'root')
report={'source':str(SOURCE),'sha256':hashlib.sha256(raw).hexdigest(),'stage':rect,'fps':fps,'frames':frames,'inventory':inventory,'images':images,'placements':placements,'scripts':scripts}
(ROOT/'research'/'swf-analysis.json').write_text(json.dumps(report,indent=2,default=str))
with (ROOT/'research'/'actions.txt').open('w') as f:
    for sc in scripts:
        f.write('\n'+json.dumps({k:v for k,v in sc.items() if k!='actions'})+'\n')
        for a in sc['actions']:f.write(f"{a['offset']:04x} {a['op']} {a['arg']!r}\n")
print(f'{len(images)} bitmaps, {len(scripts)} scripts, {len(placements)} placements')
