import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from config import SITE_CONFIG, material_config, payload_tonnes_to_volume_m3
from environment.terrain import Terrain
from evaluation.metrics import feasible_capacity_m3, packing_efficiency
from planning.action_masker import ConstrainedActionMasker
from planning.isolation_validator import IsolationValidator


def test_dump_converts_payload_tonnes_to_volume_m3():
    mask = np.ones((40, 40), dtype=bool)
    terrain = Terrain(np.zeros((40, 40), dtype=np.float32), mask, (20, 20), "default")

    payload_t = 180.0
    terrain.apply_dump(20, 20, payload_t)

    expected = payload_tonnes_to_volume_m3(payload_t, "default")
    assert terrain.total_volume() == pytest.approx(expected, rel=0.08)


def test_packing_efficiency_uses_material_capacity_not_magic_denominator():
    mask = np.ones((10, 10), dtype=bool)
    terrain = Terrain(np.ones((10, 10), dtype=np.float32) * 0.2, mask, (5, 5), "ore")

    expected_capacity = 100 * SITE_CONFIG.cell_area_m2 * material_config("ore").feasible_lift_m
    assert feasible_capacity_m3(terrain) == pytest.approx(expected_capacity)
    assert packing_efficiency(terrain) == pytest.approx(20.0 / expected_capacity)


def test_constrained_mask_blocks_reserved_saturated_and_spacing_cells():
    mask = np.ones((20, 20), dtype=bool)
    terrain = Terrain(np.zeros((20, 20), dtype=np.float32), mask, (10, 10), "default")
    terrain.height[1, 1] = SITE_CONFIG.max_height_m
    validator = IsolationValidator(terrain, terrain.entry, SITE_CONFIG.iso_threshold, min_spacing=3)
    validator.record_dump(10, 10)

    action_mask = ConstrainedActionMasker(terrain, validator).mask(
        payload_t=100.0,
        reserved_cells={(2, 2)},
        include_iso=False,
    )

    assert not action_mask[1, 1]
    assert not action_mask[2, 2]
    assert not action_mask[10, 11]
    assert action_mask[18, 18]


def test_policy_loader_reports_imitation_artifact_when_only_bc_exists():
    from ml.policy import load_policy

    policy = load_policy("ml/weights/ppo_adios")
    assert getattr(policy, "artifact_type", None) in {"imitation_bc", "maskable_ppo", "ppo"}
