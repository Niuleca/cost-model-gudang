import json, numpy as np
from matplotlib.path import Path
polys=json.load(open('land_id.json'))
LON0,LAT1,STEP=88.0,14.0,0.04
W=int((147-88)/STEP); H=int((14+17)/STEP)
lon=LON0+STEP*(np.arange(W)+0.5); lat=LAT1-STEP*(np.arange(H)+0.5)
X,Y=np.meshgrid(lon,lat)
pts=np.column_stack([X.ravel(),Y.ravel()])
land=np.zeros(W*H,bool)
for p in polys:
    if min(c[0] for c in p[0])<0: continue
    outer=np.array(p[0]); x0,y0=outer.min(0); x1,y1=outer.max(0)
    sel=(pts[:,0]>=x0)&(pts[:,0]<=x1)&(pts[:,1]>=y0)&(pts[:,1]<=y1)
    if not sel.any(): continue
    inside=Path(outer).contains_points(pts[sel])
    for hole in p[1:]:
        inside&=~Path(np.array(hole)).contains_points(pts[sel])
    land[np.where(sel)[0][inside]]=True
grid=land.reshape(H,W)
print(W,H,grid.mean())
bits=np.packbits(grid.ravel())
open('/home/claude/cost-model-gudang/public/sim3d/darat-indonesia.bin','wb').write(bits.tobytes())
# preview
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
plt.figure(figsize=(14,7)); plt.imshow(grid,cmap='gray_r'); plt.savefig('/tmp/mask.png',dpi=80)
