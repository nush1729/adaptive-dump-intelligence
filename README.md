<div align="center">

# ADIOS
### Adaptive Dump Intelligence & Orchestration System

**Caterpillar Hackathon Submission by Team Butterfly**

[![Frontend](https://img.shields.io/badge/Frontend-Next.js%2014-111111?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Backend](https://img.shields.io/badge/Backend-FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![ML Engine](https://img.shields.io/badge/ML%20Engine-PPO%20%2B%20Supervised%20Learning-0F62FE?style=for-the-badge)](#our-usps)
[![3D Visualization](https://img.shields.io/badge/Visualization-React%20Three%20Fiber-F97316?style=for-the-badge&logo=threedotjs&logoColor=white)](https://docs.pmnd.rs/react-three-fiber/getting-started/introduction)
[![Status](https://img.shields.io/badge/Status-Hackathon%20Ready-2E7D32?style=for-the-badge)](#business-impact-for-caterpillar)
[![License](https://img.shields.io/badge/License-MIT-A31F34?style=for-the-badge)](#mit-license)

</div>

---

## What ADIOS Is

ADIOS is an intelligent dump-site orchestration system that helps mining operations decide **where every incoming haul truck should dump next**. It combines a live digital terrain model, optimization logic, and machine learning to turn dump placement from a manual judgment call into a **repeatable, data-driven dispatch decision**.

Its purpose is simple: **maximize usable dump capacity, preserve safe access paths, and maintain a more uniform terrain surface in real time**.

![ADIOS 3D Terrain Demo](path/to/terrain-demo.gif)

![ADIOS Heatmap Demo](path/to/heatmap-demo.gif)

```mermaid
flowchart LR
    A["<b>Next.js Frontend</b><br/>Operator dashboard<br/>Controls, KPIs, audit view"] -->|REST + WebSocket| B["<b>FastAPI Orchestration Layer</b><br/>Simulation API<br/>Dispatch control<br/>Telemetry streaming"]
    B --> C["<b>PPO / ML Engine</b><br/>Terrain observation<br/>Policy inference<br/>Adaptive dump-cell selection"]
    C --> D["<b>Planning & Validation Core</b><br/>Coverage scoring<br/>Isolation checks<br/>Slope-safe placement"]
    D --> E["<b>R3F 3D Canvas</b><br/>3D terrain mesh<br/>Live dump playback<br/>Heatmap overlays"]
    E -->|Visual feedback loop| A
    B --> F["<b>Audit & Metrics</b><br/>JSON trace<br/>Coverage, efficiency,<br/>uniformity insights"]
    F --> A

    classDef frontend fill:#111111,stroke:#3b82f6,color:#ffffff,stroke-width:2px;
    classDef backend fill:#0f766e,stroke:#99f6e4,color:#ffffff,stroke-width:2px;
    classDef ml fill:#1d4ed8,stroke:#93c5fd,color:#ffffff,stroke-width:2px;
    classDef planning fill:#7c2d12,stroke:#fdba74,color:#ffffff,stroke-width:2px;
    classDef viz fill:#581c87,stroke:#d8b4fe,color:#ffffff,stroke-width:2px;
    classDef audit fill:#365314,stroke:#bef264,color:#ffffff,stroke-width:2px;

    class A frontend;
    class B backend;
    class C ml;
    class D planning;
    class E viz;
    class F audit;
```

## Our USPs

- **Adaptive intelligence over static rules:** ADIOS evaluates the evolving terrain continuously instead of relying on fixed dump patterns or operator intuition alone.
- **Safety-aware dispatching:** Each recommended dump location is shaped by reachability and terrain constraints, helping reduce the risk of inaccessible or poorly formed dump zones.
- **Digital twin visibility:** Operators can see the dump surface, heatmap behavior, and placement evolution through an interactive 3D visualization layer.
- **Real-time decision support:** FastAPI streams decisions and simulation state quickly enough to support operational workflows, not just offline analysis.
- **Audit-ready orchestration:** Every simulated placement can be traced back through metrics and logs, making the system easier to trust, explain, and improve.
- **Built for Caterpillar-scale modernization:** ADIOS connects machine intelligence, operational control, and visual analytics in one stack instead of treating them as separate tools.

## Business Impact for Caterpillar

- **Higher dump efficiency:** Smarter placement decisions can improve usable dump capacity and reduce waste caused by uneven or suboptimal fill patterns.
- **Safer operations:** Better terrain-aware routing logic supports more controlled dumping behavior and helps protect haul access continuity.
- **Stronger product differentiation:** ADIOS demonstrates how Caterpillar can pair equipment leadership with intelligent site orchestration and digital decision support.
- **More actionable data for customers:** The platform turns dump activity into measurable operational intelligence rather than leaving value locked inside manual decisions.
- **A scalable innovation story:** This is the kind of system that can evolve from hackathon prototype to fleet-integrated mining technology narrative.

## MIT License

This project is released under the [MIT License](LICENSE).

Made by Team Butterfly
