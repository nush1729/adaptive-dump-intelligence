# Caterpillar truck specifications
CAT_SPECS = {
    "Cat793": {"name": "Caterpillar 793", "payload_tonnes": 218, "fuel_consumption": 95},
    "Cat777": {"name": "Caterpillar 777", "payload_tonnes": 104, "fuel_consumption": 65},
    "Cat797": {"name": "Caterpillar 797", "payload_tonnes": 400, "fuel_consumption": 180},
}

class Truck:
    """Simple truck class representing a dispatch vehicle"""
    def __init__(self, truck_id: str, model: str, payload_t: float):
        self.truck_id = truck_id
        self.model = model
        self.payload_t = payload_t

def make_fleet(models: list) -> list:
    """
    Create a fleet of trucks from a list of model names.
    
    Args:
        models: List of model names like ["Cat793", "Cat777", "Cat797"]
    
    Returns:
        List of Truck instances
    """
    fleet = []
    for i, model in enumerate(models):
        payload = CAT_SPECS.get(model, {}).get("payload_tonnes", 100)
        truck_id = f"{model}_{i+1}"
        fleet.append(Truck(truck_id, model, payload))
    return fleet