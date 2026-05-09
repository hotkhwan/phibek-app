<!-- docs/slides/klynx-launch-strategy-prompt.md -->
# K-Lynx Launch Strategy — Slide Prompt Template

> Copy the block below and paste into your AI slide tool (Gamma, Beautiful.ai, etc.)  
> Replace `[TOPIC]` and `[STRUCTURE]` with the actual content you need.

---

## PROMPT BLOCK

```
**TOPIC**: K-Lynx Platform — Intelligent Operations Center
**STRUCTURE**: [ใส่โครงสร้างที่ต้องการ เช่น 12-slide executive deck / 1-page graphic summary]

**CI**: ล้ำสมัย กระชับ ใช้ศัพท์ Tech ได้แต่ต้องอธิบายสั้นๆ ท้ายประโยค

**DESIGN LOCK**
- Theme Name       : Deep Space
- Background       : Cosmos Black  #0B0C10
- Heading Color    : Cyber Cyan    #66FCF1
- Body Text        : Stardust Silver #C5C6C7
- Card Background  : Nebula Gray   #1F2833
- Accent / Border  : Cyber Cyan    #66FCF1  opacity 40%
- Font Style       : Geometric Sans-serif — หัวข้อ Bold ALL-CAPS
- Layout           : Card Layout กรอบมุมมน / Icon เส้นบาง สี Cyan
- Data Viz         : Neon Line Chart / Neon Bar บนพื้นมืด
- Note             : ให้ดูเหมือน Dashboard อนาคต ไม่ใช่ PowerPoint ปกติ

**TERMINOLOGY RULES** (mandatory)
- ห้ามเรียก vendor SSO by name — ใช้ "SSO" เท่านั้น
- Authorization = "ReBAC with fine-grant"
- ห้าม expose URL, credential, secret ใดๆ ในสไลด์
- n8n = "Workflow Orchestration Layer" — ห้าม position เป็น core runtime

**DO NOT**
- ห้ามใช้ภาพธรรมชาติ ห้ามสีอุ่น (red/orange/yellow tone) ห้าม Serif font
- ห้าม overclaim feature ที่ยัง in-progress หรือ roadmap
- ห้าม bare array ใน response — wrap ใน { "items": [] }

**PLATFORM CONTEXT**
K-Lynx คือ Intelligent Operations Center (IOC) สำหรับ:
- Centralized CCTV management — multi-source, multi-tenant
- Edge AI event ingestion (Face Recognition, LPR, general detection)
- Canonical Event Pipeline: EdgeAI → Gateway Service → Redis → Kafka → MongoDB/S3 → MQTT
- Fast Alert Path: EdgeAI → Gateway detect key/value → MQTT immediate alert
- Dashboard: real-time map, live view, camera status, alerts
- Video Wall: 1/4/9/16 layouts, drag-and-drop
- SSO + ReBAC with fine-grant (menu / API / resource level)
- On-cloud (Free/Entry/Professional) + On-premise deployment

**STREAMING & CLIENT OPTIONS**
- Cloud streams: WebRTC / FLV / HLS over MQTT WebSocket
- K-Lynx Client (.exe): Windows native app — ลูกค้าติดตั้งง่าย, add RTSP URL, streaming
  ขึ้น platform ได้ทันที ไม่ต้องซื้อ hardware edge รองรับ iframe / screen capture
  เหมาะกับ mass market / SaaS trial — entry point ก่อน upgrade เป็น full edge device
- Scale target: 10,000 concurrent streams per deployment

**DELIVERY TIMELINE (actual progress)**

✅ DONE — gateway-api (gw side):
  - Canonical event schema (MongoDB)
  - Kafka event pipeline + delivery status consumer
  - klynxdeliverycons, normalizedcons
  - Normalized event ingestion + S3 binary reference

✅ DONE — klynx-api (platform side):
  - GW device sync (gwdevicesync service + gwdevicecons Kafka consumer)
  - event_refs upsert in ingestsvc.HandleNormalized
  - Gateway event detail fetch (gwgw/event.go)
  - Device enrichment (deviceEnrich.go)
  - Camera model + repo updates for GW integration
  - Enterprise license support

🔄 IN PROGRESS:
  - Camera Monitor Service (cammonitorsvc) — Phase 1 baseline
    4-state FSM, Redis scheduler, ffprobe adapter, 10k camera target
  - Camera map + live popup dashboard
  - Video wall layouts

📋 BASE DELIVERY — 06/06/2026:
  Phase 0  (23/03–31/03): Scope lock, architecture freeze ✅
  Phase 1  (01/04–12/04): SSO, org/unit/ReBAC, tenant baseline ✅
  Phase 2  (13/04–24/04): CCTV CRUD, device sync (IBOC/PVS/SVMS/ATA) 🔄
  Phase 2.1(25/04–08/05): Gateway service canonical event pipeline 🔄
  Phase 3  (09/05–20/05): Dashboard map + Video Wall
  Phase 4  (21/05–29/05): Reports + Surveillance DB
  Phase 5  (30/05–03/06): n8n SOP automation
  Phase 6  (04/06–06/06): UAT + packaging + go-live

🔭 Q3 2026 ROADMAP:
  - K-Lynx Client (.exe): Windows native streaming client
    RTSP input + iframe embed + screen capture → cloud streaming
    OBS-inspired UX, zero hardware dependency for trial
  - Scale to 10,000 concurrent streams:
    Adaptive probe scheduling, per-org circuit breaker,
    ZLM passive signal, fleet warm-restart guard
  - K-Search: AI natural language + image/video search
  - Route Tracking: map-based trajectory playback
  - gRPC EventService (replace REST fetch from gw)
  - Proto codegen for cross-language consumers (PHP/.NET/Java)

**SUBSCRIPTION MODEL**
| Tier        | Deployment | Streams | Key Capabilities                        |
|-------------|------------|---------|------------------------------------------|
| Free        | Cloud      | Limited | Basic monitoring, K-Lynx Client trial    |
| Entry       | Cloud      | Medium  | Dashboard + 4-ch wall + basic blacklist  |
| Professional| Cloud      | 1,000+  | Full AI events, SOP automation, reports  |
| On-Premise  | Private    | 10,000+ | Unlimited, custom AI, full pipeline      |
```

---

## SLIDE STRUCTURES (เลือกใช้ตามงาน)

### Executive Deck (12 slides)
```
1. Executive Summary
2. Platform Vision & Positioning
3. Core Architecture — Canonical Event Pipeline
4. Base Features (06/06/2026 target)
5. Phase 2 Integration Status (IBOC / PVS / SVMS / ATA)
6. Phase 2.1 Gateway Service Architecture
7. Dashboard, Video Wall & Reporting
8. K-Lynx Client — Windows .exe Streaming (Q3 Roadmap)
9. Scale to 10k Streams
10. SOP Automation with n8n
11. On-Cloud vs On-Premise + Subscription Model
12. Delivery Timeline Mar–Jun 2026 + Q3 Roadmap
```

### Investor / Pitch Deck (8 slides)
```
1. Problem — Fragmented city surveillance
2. Solution — K-Lynx IOC
3. Product Demo Highlights
4. Market & Go-to-Market (SaaS / On-premise)
5. K-Lynx Client — Low-friction entry point
6. Technology Moat (Canonical Pipeline, ReBAC, 10k scale)
7. Roadmap & Milestones
8. Team & Ask
```

### Technical Architecture (5 slides)
```
1. System Overview
2. Canonical Event Pipeline (fast alert + canonical persistence)
3. Camera Monitor Service (10k scale design)
4. K-Lynx Client Architecture (.exe → RTSP → cloud)
5. Security Model (SSO + ReBAC + Istio mTLS)
```
