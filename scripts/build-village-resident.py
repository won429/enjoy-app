"""Build the original Drop Village resident, rig and animation clips in Blender.
Run with Blender --background --factory-startup --python this_file.
Only the GLB runtime asset is exported; no archive or separate demo is produced.
"""
import bpy, math, random
from pathlib import Path
from mathutils import Vector
from collections import defaultdict
random.seed(428)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
OUTPUT=Path(__file__).resolve().parents[1]/'assets/village/resident.glb'
MESHES=[]

def material(name,hexcolor,rough=.72):
    m=bpy.data.materials.new(name);m.use_nodes=True
    h=hexcolor.lstrip('#');rgb=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    rgb=[c/12.92 if c<=.04045 else ((c+.055)/1.055)**2.4 for c in rgb]
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,1);p.inputs['Roughness'].default_value=rough
    return m
skin=material('Skin warm peach','#efc3a1',.82);nosemat=material('Nose and inner ear','#dba080',.82)
hair=material('Hair blue-black','#39403b',.84);hairline=material('Hair sculpted highlights','#424c4a',.67)
white=material('Eye whites','#fff5df',.5);iris=material('Hazel iris','#63513b',.47);pupil=material('Pupil','#182d2c',.33);glint=material('Eye catchlight','#fffdfa',.28)
cheek=material('Cheek warmth','#dc9e8d',.95);mouth=material('Mouth','#855c4d',.9)
cloth=material('Terracotta cotton hoodie','#ce7861',.94);rib=material('Knitted cuffs and hem','#ad5b48',1);stitch=material('Cotton stitch','#e0a187',.95)
denim=material('Indigo cotton trousers','#475c68',.93);seams=material('Denim seams','#637887',.95)
sole=material('Rubber soles','#e9dfc9',.9);shoe=material('Canvas sneakers','#e6cfa7',.92);laces=material('Cotton laces','#faf0d8',1)

def finish(obj,name,mat,bone=None,weights=None,sub=0):
    obj.name=name;obj.data.materials.append(mat)
    for f in obj.data.polygons:f.use_smooth=True
    bpy.context.view_layer.objects.active=obj;obj.select_set(True)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if sub:
        mod=obj.modifiers.new('Sculpt surface','SUBSURF');mod.levels=sub;mod.render_levels=sub
        bpy.ops.object.modifier_apply(modifier=mod.name)
    if weights:
        groups={n:obj.vertex_groups.new(name=n) for n in weights[0]}
        for v in obj.data.vertices:
            co=obj.matrix_world@v.co
            for n,w in weights[1](co).items():
                if w>0:groups[n].add([v.index],w,'REPLACE')
    elif bone:
        g=obj.vertex_groups.new(name=bone);g.add(list(range(len(obj.data.vertices))),1,'REPLACE')
    MESHES.append(obj);obj.select_set(False);return obj

def sphere(name,loc,scale,mat,bone,segments=32,rings=20,deform=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=loc)
    o=bpy.context.object;o.scale=scale
    if deform:
        for v in o.data.vertices:v.co=deform(v.co.copy())
    return finish(o,name,mat,bone)

def mesh(name,vertices,faces,mat,bone=None,weights=None,sub=1):
    data=bpy.data.meshes.new(name);data.from_pydata(vertices,[],faces);data.update()
    o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o)
    return finish(o,name,mat,bone,weights,sub)

def profile(name,rings,mat,bone=None,weights=None,n=24,sub=2):
    vs=[];fs=[]
    for x,y,z,rx,ry in rings:
        for j in range(n):a=j*math.tau/n;vs.append((x+math.cos(a)*rx,y+math.sin(a)*ry,z))
    for i in range(len(rings)-1):
        for j in range(n):a=i*n+j;b=i*n+(j+1)%n;fs.append((a,b,b+n,a+n))
    fs.append(tuple(reversed(range(n))));fs.append(tuple((len(rings)-1)*n+j for j in range(n)))
    return mesh(name,vs,fs,mat,bone,weights,sub)

def bevelbox(name,loc,dim,mat,bone,r=.05):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.scale=dim
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    m=o.modifiers.new('Rounded sewn edges','BEVEL');m.width=r;m.segments=4
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=m.name)
    return finish(o,name,mat,bone)

def line(name,points,r,mat,bone):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=12;c.bevel_depth=r;c.bevel_resolution=3
    sp=c.splines.new('BEZIER');sp.bezier_points.add(len(points)-1)
    for p,co in zip(sp.bezier_points,points):p.co=co;p.handle_left_type=p.handle_right_type='AUTO'
    o=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(o);bpy.context.view_layer.objects.active=o;o.select_set(True);bpy.ops.object.convert(target='MESH');o=bpy.context.object
    return finish(o,name,mat,bone)

# A hand-shaped head surface: tapered jaw, fuller cheeks and an integrated nose.
def face_shape(v):
    low=max(0,-v.z);v.x*=1-.17*low**1.5
    if v.y<0:
        v.y-=.07*math.exp(-(v.x/.23)**2-((v.z+.14)/.18)**2)
        v.y-=.025*math.exp(-((abs(v.x)-.5)/.25)**2-((v.z+.24)/.25)**2)
    return v
sphere('Sculpted face',(0,0,2.78),(.65,.57,.66),skin,'Head',48,32,face_shape)
profile('Neck',[(0,0,2.14,.17,.16),(0,0,2.16,.18,.16),(0,0,2.4,.17,.15),(0,0,2.42,.16,.15)],skin,'Neck',sub=1)
for side,suffix in [(-1,'L'),(1,'R')]:
    x=side*.62
    sphere('Ear '+suffix,(x,-.005,2.7),(.125,.1,.19),skin,'Head')
    sphere('Inner ear '+suffix,(x,-.089,2.7),(.07,.017,.1),nosemat,'Head')
    eye='Eye'+suffix
    sphere('Eye white '+suffix,(side*.218,-.539,2.82),(.153,.057,.184),white,eye)
    sphere('Iris '+suffix,(side*.209,-.592,2.815),(.102,.027,.133),iris,eye)
    sphere('Pupil '+suffix,(side*.202,-.616,2.82),(.065,.014,.102),pupil,eye)
    sphere('Eye light '+suffix,(side*.183,-.63,2.864),(.026,.009,.032),glint,eye,16,12)
    line('Eyebrow '+suffix,[(side*.09,-.545,3.065),(side*.21,-.563,3.09),(side*.34,-.527,3.065)],.021,hair,'Head')
    sphere('Cheek '+suffix,(side*.39,-.49,2.58),(.105,.011,.043),cheek,'Head')
sphere('Soft nose',(0,-.599,2.68),(.071,.073,.066),nosemat,'Head')
line('Smile',[(-.102,-.552,2.497),(0,-.574,2.47),(.102,-.552,2.497)],.012,mouth,'Head')
# Continuous swept hair cap, with a separate sculpted fringe rather than spheres.
vs=[];fs=[];n=48;nr=15
for i in range(nr+1):
    f=i/nr
    for j in range(n):
        a=j*math.tau/n;t=f*(1.53+.37*math.sin(a))
        x=math.sin(t)*math.cos(a)*.672;y=math.sin(t)*math.sin(a)*.604;z=2.83+math.cos(t)*.677
        vs.append((x,y+.025,z))
for i in range(nr):
    for j in range(n):a=i*n+j;b=i*n+(j+1)%n;fs.append((a,a+n,b+n,b))
mesh('Swept hair cap',vs,fs,hair,'Head',sub=1)
for i,x in enumerate([-.43,-.23,-.025,.19,.38]):
    vs=[];fs=[];steps=14;around=10
    for k in range(steps):
        t=k/(steps-1);xx=x*(.24+.76*t)+.035*math.sin(t*math.pi);yy=-.20-.43*math.sin(t*math.pi/2);zz=3.40-.46*t-(.018 if i<2 else 0)
        width=.012+(.17 if i<3 else .145)*math.sin(t*math.pi)**.7;thick=.025+.025*math.sin(t*math.pi)
        for j in range(around):a=j*math.tau/around;vs.append((xx+math.cos(a)*width,yy+math.sin(a)*thick,zz))
    for k in range(steps-1):
        for j in range(around):a=k*around+j;b=k*around+(j+1)%around;fs.append((a,b,b+around,a+around))
    fs.extend([tuple(reversed(range(around))),tuple((steps-1)*around+j for j in range(around))])
    mesh('Sculpted fringe '+str(i),vs,fs,hair,'Head',sub=1)
for i in range(7):
    a=math.pi*1.05+i*.14
    pts=[]
    for t in [.3,.55,.8,1.05]:pts.append((math.sin(t)*math.cos(a)*.679,math.sin(t)*math.sin(a)*.611+.025,2.83+math.cos(t)*.683))
    line('Combed hair ridge '+str(i),pts,.009,hairline,'Head')

# Cloth is one continuous torso surface, with separate stitched hems and pocket.
def torso_weights(co):
    if co.z<1.4:return {'Pelvis':1}
    if co.z<1.8:
        t=(co.z-1.4)/.4;return {'Pelvis':(1-t)*.3,'Spine':1-t*.3-(1-t)*.3,'Chest':t*.3}
    return {'Chest':1}
profile('Hoodie body',[(0,0,1.12,.36,.245),(0,0,1.15,.39,.27),(0,0,1.4,.405,.285),(0,0,1.75,.45,.28),(0,0,2.03,.49,.26),(0,0,2.17,.39,.235),(0,0,2.24,.23,.19),(0,0,2.26,.21,.18)],cloth,weights=(['Pelvis','Spine','Chest'],torso_weights),sub=2)
profile('Ribbed hem',[(0,0,1.105,.362,.25),(0,0,1.12,.39,.27),(0,0,1.22,.395,.273),(0,0,1.235,.385,.267)],rib,'Pelvis',sub=1)
bevelbox('Kangaroo pocket',(0,-.285,1.48),(.48,.065,.26),rib,'Spine',.07)
line('Pocket stitch',[(-.20,-.326,1.55),(-.17,-.329,1.40),(0,-.333,1.38),(.17,-.329,1.40),(.20,-.326,1.55)],.007,stitch,'Spine')
profile('Neck rib',[(0,0,2.19,.245,.205),(0,0,2.2,.26,.22),(0,0,2.27,.25,.21),(0,0,2.29,.225,.19)],rib,'Chest',sub=1)
sphere('Hood back',(0,.19,2.15),(.29,.16,.26),cloth,'Chest')
for side in [-1,1]:
    line('Hood drawstring '+str(side),[(side*.12,-.195,2.22),(side*.14,-.28,2.07),(side*.11,-.302,1.91)],.011,laces,'Chest')
    bevelbox('Drawstring tip '+str(side),(side*.11,-.304,1.9),(.025,.024,.055),sole,'Chest',.008)
profile('Waistband',[(0,0,1.035,.36,.225),(0,0,1.05,.38,.245),(0,0,1.16,.37,.24),(0,0,1.18,.35,.23)],denim,'Pelvis',sub=1)

for side,suffix in [(-1,'L'),(1,'R')]:
    upper='UpperArm'+suffix;fore='Forearm'+suffix;hand='Hand'+suffix;thigh='Thigh'+suffix;shin='Shin'+suffix;foot='Foot'+suffix
    def armw(co,upper=upper,fore=fore):
        t=max(0,min(1,(1.75-co.z)/.24));return {upper:1-t,fore:t}
    profile('Hoodie sleeve '+suffix,[(side*.45,0,2.065,.145,.17),(side*.5,0,2.03,.19,.2),(side*.64,-.015,1.81,.165,.17),(side*.7,-.025,1.62,.145,.155),(side*.715,-.02,1.38,.125,.13),(side*.717,-.02,1.32,.12,.125)],cloth,weights=([upper,fore],armw),sub=2)
    profile('Sleeve cuff '+suffix,[(side*.717,-.02,1.31,.115,.12),(side*.717,-.02,1.32,.128,.13),(side*.72,-.02,1.42,.13,.132),(side*.72,-.02,1.43,.118,.123)],rib,fore,sub=1)
    sphere('Hand '+suffix,(side*.72,-.035,1.2),(.12,.115,.17),skin,hand)
    sphere('Thumb '+suffix,(side*.63,-.09,1.23),(.065,.07,.085),skin,hand)
    def legw(co,thigh=thigh,shin=shin):
        t=max(0,min(1,(.76-co.z)/.23));return {thigh:1-t,shin:t}
    profile('Trousers '+suffix,[(side*.205,0,1.12,.205,.22),(side*.217,0,1.09,.218,.225),(side*.23,-.005,.85,.18,.19),(side*.25,-.015,.64,.16,.17),(side*.255,-.005,.40,.145,.15),(side*.255,0,.25,.14,.145),(side*.255,0,.23,.135,.14)],denim,weights=([thigh,shin],legw),sub=2)
    profile('Trouser cuff '+suffix,[(side*.255,0,.23,.135,.14),(side*.255,0,.245,.15,.155),(side*.255,0,.33,.15,.154),(side*.255,0,.34,.14,.145)],seams,shin,sub=1)
    bevelbox('Sneaker sole '+suffix,(side*.255,-.115,.075),(.39,.65,.115),sole,foot,.05)
    bevelbox('Sneaker canvas '+suffix,(side*.255,-.105,.16),(.35,.55,.19),shoe,foot,.085)
    bevelbox('Sneaker toe '+suffix,(side*.255,-.345,.142),(.345,.12,.14),sole,foot,.047)
    for i in range(3):line('Shoe lace '+suffix+str(i),[(side*.255-.10,-.19+i*.065,.252),(side*.255,-.17+i*.065,.269),(side*.255+.10,-.19+i*.065,.252)],.008,laces,foot)

# Humanoid skeleton. All runtime animations are in-place and exported in the GLB.
bpy.ops.object.armature_add(enter_editmode=True,location=(0,0,0));rig=bpy.context.object;rig.name='ResidentRig';eb=rig.data.edit_bones;eb.remove(eb[0])
def bone(name,head,tail,parent=None):
    b=eb.new(name);b.head=head;b.tail=tail
    if parent:b.parent=eb[parent]
    return b
bone('Root',(0,0,0),(0,0,.3));bone('Pelvis',(0,0,1.1),(0,0,1.4),'Root');bone('Spine',(0,0,1.4),(0,0,1.8),'Pelvis');bone('Chest',(0,0,1.8),(0,0,2.15),'Spine');bone('Neck',(0,0,2.15),(0,0,2.4),'Chest');bone('Head',(0,0,2.4),(0,0,3.1),'Neck')
for side,suffix in [(-1,'L'),(1,'R')]:
    bone('Shoulder'+suffix,(0,0,2.05),(side*.45,0,2.06),'Chest');bone('UpperArm'+suffix,(side*.45,0,2.06),(side*.7,-.025,1.64),'Shoulder'+suffix);bone('Forearm'+suffix,(side*.7,-.025,1.64),(side*.72,-.02,1.32),'UpperArm'+suffix);bone('Hand'+suffix,(side*.72,-.02,1.32),(side*.72,-.035,1.12),'Forearm'+suffix)
    bone('Thigh'+suffix,(side*.21,0,1.12),(side*.25,-.015,.66),'Pelvis');bone('Shin'+suffix,(side*.25,-.015,.66),(side*.255,0,.25),'Thigh'+suffix);bone('Foot'+suffix,(side*.255,0,.25),(side*.255,-.36,.12),'Shin'+suffix)
    bone('Eye'+suffix,(side*.218,-.56,2.82),(side*.218,-.56,2.92),'Head')
bpy.ops.object.mode_set(mode='OBJECT');rig.show_in_front=True
# Merge by material to keep draw calls low while preserving the skin weights.
grouped=defaultdict(list)
for o in MESHES:grouped[o.data.materials[0].name].append(o)
for objects in grouped.values():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=bpy.context.object
    mod=o.modifiers.new('Resident skin','ARMATURE');mod.object=rig;o.parent=rig
    bpy.ops.object.select_all(action='DESELECT')
rig.animation_data_create();bpy.context.view_layer.objects.active=rig
for name,frames,amplitude in [('Idle',91,.025),('Walk',33,.5),('Run',25,.78)]:
    act=bpy.data.actions.new(name);rig.animation_data.action=act
    for p in rig.pose.bones:p.rotation_mode='XYZ';p.rotation_euler=(0,0,0);p.location=(0,0,0);p.scale=(1,1,1)
    for k in range(17):
        f=1+(frames-1)*k/16;phase=k/16*math.tau
        if name=='Idle':
            rig.pose.bones['Chest'].rotation_euler.x=math.sin(phase)*.018;rig.pose.bones['Head'].rotation_euler.y=math.sin(phase)*.025
        else:
            for side,suffix in [(-1,'L'),(1,'R')]:
                p=phase+(math.pi if side<0 else 0)
                rig.pose.bones['Thigh'+suffix].rotation_euler.x=math.sin(p)*amplitude
                rig.pose.bones['Shin'+suffix].rotation_euler.x=-max(0,-math.sin(p))*(.78 if name=='Run' else .52)
                rig.pose.bones['Foot'+suffix].rotation_euler.x=max(0,math.sin(p))*.16
                rig.pose.bones['UpperArm'+suffix].rotation_euler.x=-math.sin(p)*amplitude*.7
                rig.pose.bones['Forearm'+suffix].rotation_euler.x=-.13-(.18 if name=='Run' else .05)
            rig.pose.bones['Pelvis'].location.y=abs(math.sin(phase))*(.065 if name=='Run' else .035)
            rig.pose.bones['Chest'].rotation_euler.y=math.sin(phase)*.045
            rig.pose.bones['Chest'].rotation_euler.x=.07 if name=='Run' else .025
        for bn in ['Pelvis','Chest','Head','UpperArmL','UpperArmR','ForearmL','ForearmR','ThighL','ThighR','ShinL','ShinR','FootL','FootR']:
            b=rig.pose.bones[bn];b.keyframe_insert('rotation_euler',frame=f);b.keyframe_insert('location',frame=f)
    for fc in act.fcurves:
        for kp in fc.keyframe_points:kp.interpolation='BEZIER'
    track=rig.animation_data.nla_tracks.new();track.name=name;strip=track.strips.new(name,1,act);track.mute=True
# Long, independent blink clip; runtime retains only its eye scale tracks.
act=bpy.data.actions.new('Blink');rig.animation_data.action=act
for suffix in ['L','R']:
    b=rig.pose.bones['Eye'+suffix]
    for frame,amount in [(1,1),(130,1),(133,.04),(136,1),(142,1)]:b.scale=(1,amount,1);b.keyframe_insert('scale',frame=frame)
track=rig.animation_data.nla_tracks.new();track.name='Blink';track.strips.new('Blink',1,act);track.mute=True
rig.animation_data.action=None
for b in rig.pose.bones:b.rotation_euler=(0,0,0);b.location=(0,0,0);b.scale=(1,1,1)
bpy.context.scene.render.fps=30;bpy.context.scene.frame_set(1)
OUTPUT.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(OUTPUT),export_format='GLB',export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_skins=True,export_morph=True,export_apply=False,export_yup=True)
print('DROP_RESIDENT_EXPORTED',OUTPUT,OUTPUT.stat().st_size)
