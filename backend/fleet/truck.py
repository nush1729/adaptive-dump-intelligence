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

def make_fleet(models: list, payload_overrides: dict | None = None) -> list:
    """
    Create a fleet of trucks from a list of model names.

    Args:
        models: List of model names like ["Cat793", "Cat777", "Cat797"]
        payload_overrides: Optional {model_name: payload_tonnes} map — lets a
            caller simulate a custom-tonnage fleet mix without changing the
            base CAT_SPECS table. Falls back to the spec default per model.

    Returns:
        List of Truck instances
    """
    overrides = payload_overrides or {}
    fleet = []
    for i, model in enumerate(models):
        default_payload = CAT_SPECS.get(model, {}).get("payload_tonnes", 100)
        payload = overrides.get(model, default_payload)
        truck_id = f"{model}_{i+1}"
        fleet.append(Truck(truck_id, model, payload))
    return fleet