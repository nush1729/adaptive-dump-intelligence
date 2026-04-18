class IsolationValidator:
    def __init__(self, terrain, entry, threshold):
        self.terrain = terrain
        self.entry = entry
        self.threshold = threshold

    def validate(self, r, c, volume):
        # Simple implementation: always return True, None
        return True, None