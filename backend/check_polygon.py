import sys
import os

# Try different import paths
sys.path.insert(0, os.getcwd())

from environment.terrain import Terrain
import numpy as np

for seed in [8000, 8001, 8002, 8003, 8004, 8014, 8017, 8018, 8020, 8028]:
    t = Terrain.make_demo_polygon(100, 100, 'rock', seed)
    from planning.orchestrator import ADIOSOrchestrator
    mc = np.argwhere(t.mask)
    col_mid1 = int(np.mean(mc[:, 1]))
    entry_r1 = int(mc[0, 0])
    for rr in range(t.mask.shape[0] - 1, -1, -1):
        if t.mask[rr, col_mid1]:
            entry_r1 = rr
            break
    bot = mc[mc[:, 0] == mc[:, 0].max()]
    col_mid2 = int(bot[len(bot) // 2, 1])
    entry_r2 = int(bot[0, 0])
    print(f"seed {seed}: original={(entry_r1, col_mid1)}, absolute={(entry_r2, col_mid2)}")
    continue
    orch = ADIOSOrchestrator(t)
    fleet_payloads = [227.0, 91.0, 363.0, 227.0]
    print(f"seed {seed}: entry={t.entry}")
    dispatches = [("T1", fleet_payloads[i % 4]) for i in range(60)]
    log = orch.run(dispatches)
    succ = sum(1 for x in log if x['status'] == 'dumped')
    rej = [x['status'] for x in log if x['status'] != 'dumped']
    print(f"seed {seed}: succeeded={succ}, rejected={len(rej)}")
    if seed == 8002:
        print(f"Sample rejections: {rej[:5]}")