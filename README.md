<div align="center">

<h1>
  ADIOS
</h1>

<h3>
  Adaptive Dump Intelligence &amp; Orchestration System
</h3>

```text
  █████╗ ██████╗ ██╗ ██████╗ ███████╗
 ██╔══██╗██╔══██╗██║██╔═══██╗██╔════╝
 ███████║██║  ██║██║██║   ██║███████╗
 ██╔══██║██║  ██║██║██║   ██║╚════██║
 ██║  ██║██████╔╝██║╚██████╔╝███████║
 ╚═╝  ╚═╝╚═════╝ ╚═╝ ╚═════╝ ╚══════╝
```

<img src="https://readme-typing-svg.demolab.com?font=Orbitron&weight=700&size=24&duration=2600&pause=900&color=FFFFFF&center=true&vCenter=true&multiline=true&repeat=true&width=980&height=90&lines=Caterpillar+Hackathon+Submission;AI-Powered+Dump-Site+Decision+Intelligence;Safer+Placement.+Higher+Capacity.+Smarter+Terrain." alt="Animated tagline" />

**Caterpillar Hackathon Submission by Team Butterfly**

[![Frontend](https://img.shields.io/badge/Frontend-Next.js%2014-111111?style=for-the-badge&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![Backend](https://img.shields.io/badge/Backend-FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![ML Engine](https://img.shields.io/badge/ML%20Engine-PPO%20%2B%20Supervised%20Learning-0F62FE?style=for-the-badge)](#our-usps)
[![3D Visualization](https://img.shields.io/badge/Visualization-React%20Three%20Fiber-F97316?style=for-the-badge&logo=threedotjs&logoColor=white)](https://docs.pmnd.rs/react-three-fiber/getting-started/introduction)
[![Operational Focus](https://img.shields.io/badge/Focus-Safety%20%2B%20Efficiency-2E7D32?style=for-the-badge)](#business-impact-for-caterpillar)
[![License](https://img.shields.io/badge/License-MIT-A31F34?style=for-the-badge)](#mit-license)

</div>

---

## What ADIOS Is

ADIOS is an intelligent dump-site orchestration system that tells mining operations **where every incoming haul truck should dump next**. It combines live terrain awareness, policy-driven optimization, and visual control into a single operating layer that transforms dump placement from manual judgment into a **fast, repeatable, safety-aware dispatch decision**.

At its core, ADIOS is built to do three things exceptionally well: **protect access continuity, improve dump uniformity, and unlock more usable capacity from the same site footprint**.

> **From manual spotting to intelligent orchestration.**

## Architecture

```mermaid
flowchart LR
    A["<b>Next.js Frontend</b><br/>Mission control dashboard<br/>2D analytics panels<br/>Operator controls"] -->|REST + WebSocket| B["<b>FastAPI Decision Layer</b><br/>Simulation API<br/>Live telemetry<br/>Dispatch orchestration"]
    B --> C["<b>PPO / ML Engine</b><br/>Terrain state encoding<br/>Policy inference<br/>Adaptive cell recommendation"]
    C --> D["<b>Safety & Planning Core</b><br/>Coverage scoring<br/>Isolation validation<br/>Slope-safe placement logic"]
    D --> E["<b>R3F 3D Canvas</b><br/>Terrain mesh<br/>Animated dump playback<br/>Heatmap overlays"]
    E -->|Visual feedback| A
    D --> F["<b>Audit + KPI Layer</b><br/>Coverage<br/>Uniformity<br/>Capacity utilization"]
    F --> A

    classDef frontend fill:#111111,stroke:#60a5fa,color:#ffffff,stroke-width:2px;
    classDef backend fill:#0f766e,stroke:#99f6e4,color:#ffffff,stroke-width:2px;
    classDef ml fill:#1d4ed8,stroke:#93c5fd,color:#ffffff,stroke-width:2px;
    classDef planning fill:#7c2d12,stroke:#fdba74,color:#ffffff,stroke-width:2px;
    classDef viz fill:#581c87,stroke:#d8b4fe,color:#ffffff,stroke-width:2px;
    classDef kpi fill:#365314,stroke:#bef264,color:#ffffff,stroke-width:2px;

    class A frontend;
    class B backend;
    class C ml;
    class D planning;
    class E viz;
    class F kpi;
```

```mermaid
sequenceDiagram
    autonumber
    participant Ops as Operator
    participant UI as Next.js UI
    participant API as FastAPI
    participant ML as PPO / ML Engine
    participant Viz as R3F 3D Canvas

    Ops->>UI: Start simulation / dispatch cycle
    UI->>API: Stream terrain + fleet request
    API->>ML: Encode state and request best dump cell
    ML-->>API: Ranked recommendation
    API->>API: Validate slope, reachability, coverage impact
    API-->>UI: Dispatch decision + KPI payload
    UI->>Viz: Animate dump event and heatmap update
    Viz-->>Ops: 3D terrain feedback in real time
```

## Visual Analytics

<div align="center">
<img src="https://capsule-render.vercel.app/api?type=venom&height=140&color=0:0F62FE,50:111111,100:F97316&text=Live%20Operational%20Intelligence&fontSize=34&fontColor=ffffff&stroke=ffffff&animation=twinkling" alt="Live Operational Intelligence" width="100%" />
</div>

```mermaid
xychart-beta
    title "ADIOS Value Impact"
    x-axis ["Safety", "Capacity", "Speed", "Auditability", "Visualization"]
    y-axis "Impact Score" 0 --> 35
    bar [32, 28, 18, 12, 10]
```

```mermaid
mindmap
  root((ADIOS Visualization Stack))
    2D Motion Layer
      Live KPI Cards
      Heatmap Pulses
      Dispatch Timeline
      Coverage Trend
    3D Terrain Layer
      Terrain Extrusion
      Dump Placement Playback
      Camera Sweep
      Surface Elevation Storytelling
    Operator Value
      Faster situational awareness
      Easier decision trust
      Clearer terrain storytelling
```

## 3D Object Preview

<div align="center">
<img src="https://capsule-render.vercel.app/api?type=blur&height=120&color=0:111111,35:1d4ed8,70:7c2d12,100:F97316&text=3D%20Terrain%20Storytelling%20Layer&fontSize=28&fontColor=ffffff&animation=fadeIn" alt="3D Terrain Storytelling Layer" width="100%" />
</div>

```stl
solid adios_terrain_mound
  facet normal 0 0 1
    outer loop
      vertex 0 0 0
      vertex 40 0 0
      vertex 20 20 18
    endloop
  endfacet
  facet normal 0 0 1
    outer loop
      vertex 40 0 0
      vertex 40 40 0
      vertex 20 20 18
    endloop
  endfacet
  facet normal 0 0 1
    outer loop
      vertex 40 40 0
      vertex 0 40 0
      vertex 20 20 18
    endloop
  endfacet
  facet normal 0 0 1
    outer loop
      vertex 0 40 0
      vertex 0 0 0
      vertex 20 20 18
    endloop
  endfacet
  facet normal 0 0 -1
    outer loop
      vertex 0 0 0
      vertex 40 40 0
      vertex 40 0 0
    endloop
  endfacet
  facet normal 0 0 -1
    outer loop
      vertex 0 0 0
      vertex 0 40 0
      vertex 40 40 0
    endloop
  endfacet
endsolid adios_terrain_mound
```

```mermaid
quadrantChart
    title "Why the 3D Layer Matters"
    x-axis Low Operational Clarity --> High Operational Clarity
    y-axis Low Decision Confidence --> High Decision Confidence
    quadrant-1 Trust and Act
    quadrant-2 Visually Rich but Weak
    quadrant-3 Manual Guesswork
    quadrant-4 Data Without Story
    "ADIOS 3D Terrain": [0.86, 0.91]
    "Static Site Maps": [0.32, 0.28]
    "Manual Spotting": [0.18, 0.22]
    "Raw KPI Dashboards": [0.63, 0.41]
```

## Our USPs

| USP | Why It Matters |
| --- | --- |
| **Adaptive intelligence over static dump rules** | ADIOS reacts to terrain evolution in real time instead of following a rigid placement pattern. |
| **Safety-aware recommendation engine** | Dump locations are shaped by operational constraints, not just geometric convenience. |
| **Unified 2D + 3D decision experience** | Operators can understand site behavior through both analytics views and terrain visualization. |
| **Real-time orchestration stack** | FastAPI, ML inference, and R3F work together as one live decision loop. |
| **Audit-ready by design** | Every placement can be explained, reviewed, and improved using measurable signals. |
| **Built for Caterpillar-scale digital mining** | ADIOS aligns machine intelligence with field-ready operational workflows. |

## Impact Snapshot

| Dimension | Traditional Approach | ADIOS Advantage |
| --- | --- | --- |
| Placement decisions | Manual and experience-driven | AI-guided and repeatable |
| Terrain awareness | Fragmented and reactive | Live, model-backed, visual |
| Access continuity | Risk discovered late | Risk considered before placement |
| Surface quality | Hard to standardize | More uniform and controllable |
| Operational insight | Limited post-hoc review | Continuous KPI visibility |

## Business Impact for Caterpillar

| Business Outcome | Caterpillar Value |
| --- | --- |
| **Higher dump efficiency** | More usable capacity from existing dump zones means stronger operational performance for customers. |
| **Safer site execution** | Terrain-aware recommendations support more disciplined, lower-risk dumping behavior. |
| **Smarter digital product story** | ADIOS demonstrates how Caterpillar can extend beyond hardware into intelligent site orchestration. |
| **Better customer intelligence** | Every dispatch becomes operational data that can drive optimization, service, and future automation. |
| **Scalable innovation narrative** | The concept naturally expands toward fleet integration, autonomy support, and enterprise analytics. |

## Why It Wins

```mermaid
flowchart LR
    A["Safety"] --> D["ADIOS Advantage"]
    B["Capacity"] --> D
    C["Visibility"] --> D
    D --> E["Stronger Caterpillar Mining Story"]

    classDef left fill:#1e293b,stroke:#93c5fd,color:#ffffff,stroke-width:2px;
    classDef center fill:#0f766e,stroke:#99f6e4,color:#ffffff,stroke-width:3px;
    classDef right fill:#7c2d12,stroke:#fdba74,color:#ffffff,stroke-width:2px;

    class A,B,C left;
    class D center;
    class E right;
```

## MIT License

This project is released under the [MIT License](LICENSE).

---

<div align="center">

## Built With Vision by Team Butterfly

**Made by Team Butterfly**

*Engineering safer dump decisions, smarter terrain intelligence, and stronger outcomes for Caterpillar.*

</div>
