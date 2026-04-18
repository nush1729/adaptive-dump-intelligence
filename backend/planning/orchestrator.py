class ADIOSOrchestrator:
    """Orchestrates dump truck dispatching using heuristic scoring engine."""
    
    def __init__(self, terrain, weights=None, audit_path=None):
        self.terrain = terrain
        self.weights = weights or {}
        self.audit_path = audit_path
        self.snapshots = []
        self.validator = self  # minimal validator stub
        self.reach_thresh = 0.85
    
    def validate(self, r, c, volume):
        """Stub validator - always returns valid"""
        return True, None
    
    def run(self, dispatches) -> list:
        """Run simulation with dispatch sequence.
        
        Args:
            dispatches: List of (truck_id, payload_tonnes) tuples
        
        Returns:
            Log of dispatch events
        """
        import numpy as np
        
        log = []
        for i, (truck_id, payload_t) in enumerate(dispatches):
            # Simple heuristic: pick a random valid cell
            valid_cells = np.argwhere(self.terrain.mask)
            if len(valid_cells) == 0:
                log.append({
                    "t": i,
                    "truck": truck_id,
                    "r": 0,
                    "c": 0,
                    "status": "no_space",
                    "payload_t": payload_t,
                })
                continue
            
            idx = np.random.randint(len(valid_cells))
            r, c = valid_cells[idx]
            
            ok, reason = self.terrain.apply_dump(r, c, payload_t)
            status = "dumped" if ok else reason
            
            log.append({
                "t": i,
                "truck": truck_id,
                "r": int(r),
                "c": int(c),
                "status": status,
                "payload_t": payload_t,
                "volume": self.terrain.total_volume(),
                "coverage": self.terrain.coverage_fraction(),
            })
            
            self.snapshots.append({
                "dump_n": i,
                "truck": truck_id,
                "r": int(r),
                "c": int(c),
                "volume": self.terrain.total_volume(),
                "coverage": self.terrain.coverage_fraction(),
                "efficiency": self.terrain.packing_efficiency(),
                "policy": "heuristic",
            })
        
        return log