# Product Requirements Document (PRD) v2.0 / v2.1
## Third-Person Controller Web Engine & Multi-Input Sandbox

**Verze:** 2.0 / 2.1 (kompletní aktualizace + v2.1 rozšíření)
**Datum:** 2026-10-08
**Status:** Implementováno (React 19 + Three.js WebGL 2 + Export do Single-File AIO HTML)
**Source:** Port z `MaximeCrp/third-person-controller-boilerplate` (Godot 4.2) → React 19 + Three.js WebGL 2

---

## Changelog

| Verze | Změny |
|---|---|
| **1.0** | Původní PRD, `CSGBox3D`, „Forward+" |
| **1.1** | Oprava CSG → OBB, Forward+ → forward+IBL+Bloom, doplněna matematika, collision layers, radar spec, GDScript template, gamepad fallback |
| **2.0** | Kompletní rewrite na základě reálné implementace (AIO HTML). Doplněny přesné algoritmy, procedurální textury místo assetů, zjednodušená fyzika, stav implementace |
| **2.1** | Feature-complete milníky M13–M17: GLB Mixamo animace + přepínač na v2.0 Capsule blockout, GDScript Exporter s validací, React 19 + Tailwind v4 Inspector, `localStorage` perzistence a přímý export Single-File AIO `index.html` |

---

## 1. Executive Summary & Vision

**Third-Person Controller Boilerplate (Web Edition)** je interaktivní 3D webový engine, fyzikální sandbox a vývojářský inspektor postavený na **Three.js (WebGL 2)**. Projekt portuje architekturu uzlů, matematiku pohybu a 3D podklady z původního Godot 4.2 repozitáře (`MaximeCrp/third-person-controller-boilerplate`) do webového prohlížeče a umožňuje jak živé ladění v React 19 Inspectoru, tak export samostatného **Single-File AIO `index.html`** bez build stepu.

### 1.1 Klíčové vlastnosti

- **Adaptivní Multi-Input systém** — `Keyboard/Mouse`, `Touch`, `Gamepad API` s automatickou detekcí aktivního vstupu.
- **High-Quality Forward Rendering (Bez mlhy)** — Preetham fyzikální obloha (`Sky`), Image-Based Lighting (`PMREMGenerator` + `RoomEnvironment`), `UnrealBloomPass`, globální větrný částicový systém (`global_wind_particles` — poletující lístky a prachové částice) a Spring-Arm kolize kamery.
- **Procedurální Web Audio syntezátor** — kroky, skoky, dopady. Bez externích MP3/WAV.
- **Trauma-based Camera Shake** — kvadratický, s deterministickým šumem `noise(t)` a tlumením `1.4/s`.
- **Živý Inspector s `localStorage` perzistencí** — slidery pro fyzikální konstanty za běhu, automatické ukládání do `localStorage`.
- **Dual-Mode Character & Export** — přepínání mezi **Mixamo GLB (`mixamo_base.glb`)** a **v2.0 Capsule Placeholderem**, export `.gd` skriptu i kompletního **Single-File `index.html`** pro GitHub Pages.

---

## 2. Cílové skupiny a Use Cases

1. **Herní vývojáři (Godot 4 & Three.js)** — okamžité ladění parametrů pohybu v prohlížeči a export `.gd` skriptu.
2. **Mobilní testeři** — dvoupalcové ovládání + konzolové ovladače s haptikou.
3. **Techničtí designéři** — vizualizace kolizního válce, ramene kamery, 2D radaru (`180×180`), stavu animací.

---

## 3. Architektura scény a uzlů

### 3.1 Typová konvence (Godot → Three.js)

| Godot 4 | Three.js ekvivalent | Poznámka |
|---|---|---|
| `Node3D` | `THREE.Group` | Transform uzel |
| `CSGBox3D` | `THREE.Mesh` + `BoxGeometry` | OBB kolizní kvádry |
| `CollisionShape3D` (Cylinder) | Vlastní kapsle (`r=0.3, h=2.0`) | Algoritmus v `capsuleVsOBB()` |
| `CharacterBody3D` | `THREE.Group` + vlastní `move_and_slide` | Není nativní |
| `Camera3D` | `THREE.PerspectiveCamera` | FOV 70° (sprint 78°) |
| `AnimationMixer` | Stavový automat (v2.0) + `AnimationMixer` (v2.1) | Přepínatelné v Inspectoru |
| `DirectionalLight3D` | `THREE.DirectionalLight` | + `PCFSoftShadowMap` |
| `FogExp2` | `THREE.FogExp2` | `density = 0.0045` (rozsah `0.0005–0.0800`) |
| `Sky` (Preetham) | `three/addons/objects/Sky` | `sky.material.fog = false` |

### 3.2 Scene graph (implementovaný)

```text
scene (THREE.Scene)
 ├── sky (Preetham, scale 45000, fog=false)
 ├── sun (DirectionalLight, 2048², PCFSoft)
 ├── hemi (HemisphereLight)
 ├── env (PMREM z RoomEnvironment)
 ├── fog (FogExp2, barva = horizonColor(sunElev))
 │
 ├── map (THREE.Group)
 │    ├── floor (CircleGeometry / Cylinder r=500, 1m grid tex)
 │    ├── box   (1×1×1m, orange #d97a2e, yaw 0.374)
 │    ├── box2  (2×2×2m, red    #b23636, yaw 1.002)
 │    ├── box3  (3×3×3m, green  #3f7a3f, yaw 0.326)
 │    ├── box4  (6×1×6m, platforma, yaw 0)
 │    ├── box5  (4×1×4m, stacked, yaw 0)
 │    └── box6  (8×0.5×2m, rampa, yaw 0.7)
 │
 └── player (THREE.Group, world position = feet)
      ├── visuals (THREE.Group, relativní rotace)
      │    ├── mixamo_base (GLTF 65 kostí, 6 klipů — v2.1 režim)
      │    └── capsule_v2  (Capsule #d54d43 + Sphere #f0c9a0 + Nose #55201a — v2.0 režim)
      ├── footRing (RingGeometry, indikátor polohy)
      └── camMount (THREE.Group, y = 1.377m)
           └── camera (PerspectiveCamera, spring-arm pozice)
```

---

## 4. Funkční požadavky

### 4.1 Fyzika pohybu

#### 4.1.1 Konstanty

| Parametr | Výchozí | Rozsah | Popis |
|---|---|---|---|
| `walking` | 3.0 m/s | 1.0–8.0 | Chůze |
| `running` | 5.0 m/s | 2.0–14.0 | Běh (Shift / RT / joystick > 78 %) |
| `jump` | 4.5 m/s | 2.0–12.0 | Počáteční vertikální rychlost |
| `gravity` | 9.8 m/s² | 2.0–25.0 | Gravitace |
| `visualsRot` | 10.0 | 1.0–25.0 | Vyhlazení rotace visuals |
| `walkSpeedThreshold` | 0.15 m/s | — | Pod tímto = idle |
| `runSpeedThreshold` | 3.5 m/s | — | Nad tímto = run |

#### 4.1.5 Kolizní systém — kapsle vs. OBB (`capsuleVsOBB`)

1. Transformuj `pos` do lokálního prostoru boxu (rotace `-box.yaw` kolem Y).
2. Horizontální test: kruh vs. obdélník → `hDist`, `hPen = R - hDist`.
3. Vertikální test: kapsle `[ly, ly+H]` vs. box `[-hy, +hy]` → `vOverlap`, `vPen`.
4. **MTD (minimum translation distance):**
   - Pokud `hPen < vPen` → **side** kolize, normála = horizontální směr.
   - Jinak → **top** (hráč nad středem) nebo **bottom** (hráč pod středem).
5. Transformuj normálu zpět do světa.
- **Vrací:** `{ normal: [number, number, number], depth: number, type: 'top'|'bottom'|'side' } | null`

#### 4.1.8 Collision layers

| Layer | Bit | Účel |
|---|---|---|
| `WORLD` | `0x01` | Statické překážky, podlaha |
| `PLAYER` | `0x02` | Hráč (kinematic) |
| `PROPS` | `0x04` | Dynamické objekty (v2.1) |
| `TRIGGER` | `0x08` | Trigger zóny (v2.1) |

### 4.2 Kamera & Trauma Shake

- **Pitch clamp:** `cam.pitch ∈ [-π/2, +π/4]` (`-90°` až `+45°`).
- **Spring-arm raycast:** `finalDist = hits.length > 0 ? max(0.6, hits[0].distance - 0.2) : maxLen`.
- **Trauma shake:**
  - Landing (`!wasOnFloor && prevY < -1.2`): `trauma = min(1.0, (|prevY| - 1.0) / 8.5) * shakeIntensity`
  - Wall impact (`|v·n| > 1.35`, cooldown `240 ms`): `trauma = min(0.85, (|v·n| - 1.0) / 6.0) * shakeIntensity`
  - Per frame: `trauma = max(0, trauma - 1.4 * dt)`, `shake = trauma * trauma`
  - Deterministický šum: `noise(t) = fract(sin(t * 12.9898) * 43758.5453) * 2 - 1`

### 4.3 Multi-Input systém & Gamepad Fallback

- **Auto-detekce:** okamžité přepínání mezi `keyboard`, `touch` a `gamepad` podle posledního aktivního vstupu.
- **Gamepad fallback mapování:**
  - `Xbox` / `XInput`: Standard
  - `054c` (Sony DualSense / DualShock): Standard + Circle mapping
  - `Nintendo` (Switch Pro / Joy-Con): `buttons[0]` ↔ `buttons[1]` swap
  - Neznámý ovladač: Standard + `console.warn`

### 4.4 Procedurální Audio Manager

- **Kroky:** Noise burst (`0.08s` běh / `0.14s` chůze), lowpass filtr (`1400 Hz` běh / `700 Hz` chůze, `Q = 0.8`), stereo panning `-0.14` (levá) / `+0.14` (pravá).
- **Skok:** Sine osc `180 → 90 Hz` (`0.12s`), gain `0.22 → 0.001` (`0.18s`).
- **Dopad:** `v = min(1, speed / 6)`, sine osc `(90 + v*30) → 40 Hz`, gain `(0.3 * v) → 0.001`.

### 4.5 Vizuál, atmosféra, radar (`SpatialMiniMap`)

- **Sky (Preetham):** `turbidity = 8`, `rayleigh = 2.4`, `mieCoefficient = 0.006`, `mieDirectionalG = 0.78`, `fog = false`, `scale = 45000`.
- **Mlha (`FogExp2`):** `t = clamp((sunElev - 6) / 79, 0, 1)`, `color = lerp(#2a3a4a, #8ba6c0, t)`, výchozí `fogDensity = 0.0045` (nastavitelná `0.0005–0.0800`).
- **Radar (`SpatialMiniMap`):** SVG `180×180`, střed `(90, 90)`, měřítko `4.5 px/m`, dosah `25 m`, 3 soustředné kružnice (`30, 60, 85 px`), crosshair, zorný kužel (`fov`), rotované OBB kvádry, modrá tečka hráče (`r=3`) a oranžová šipka směru (`visualWorldYaw`).

---

## 5. Milníky (M0–M17)

| # | Milník | Obsah | Stav |
|---|---|---|---|
| M0 | Scaffold | HTML + importmap + Three.js | ✅ |
| M1 | Scéna | Sky + fog + světla + PMREM + podlaha + 6 boxů | ✅ |
| M2 | Player + pohyb | Kapsle + move_and_slide + gravity + jump | ✅ |
| M3 | Kolize | Kapsle vs. OBB (`capsuleVsOBB` top/bottom/side) + `isOnFloor` | ✅ |
| M4 | Kamera | cameraMount + pitch clamp + spring-arm | ✅ |
| M5 | Stavový automat | idle/walk/run/air | ✅ |
| M6 | Keyboard/Mouse | Input + Pointer Lock | ✅ |
| M7 | Camera shake | Trauma systém + `noise(t)` | ✅ |
| M8 | Touch | Joystick + LookPad se setrvačností + tlačítka | ✅ |
| M9 | Gamepad | API + vendor fallback mapping + haptika | ✅ |
| M10 | Audio | Web Audio + kroky + skok + dopad | ✅ |
| M11 | Radar | SVG mini-mapa `180×180` | ✅ |
| M12 | Inspector | UI + slidery (`s_walk`, `s_run`, `s_jump`, `s_grav`, `s_shake`, `s_vol`, `fog`) | ✅ |
| M13 | **GLB animace** | Mixamo model (`mixamo_base.glb`) + přepínač na v2.0 Capsule | ✅ |
| M14 | **GDScript Exporter** | Šablona `@export var` + validace rozsahu + `.gd` download | ✅ |
| M15 | **React 19 + AIO Export** | Vite + React 19 + Tailwind v4 + export Single-File `index.html` | ✅ |
| M16 | **localStorage persist** | Automatické ukládání a obnova `CFG` / `ControllerParams` | ✅ |
| M17 | **Polish** | Kompletní PRD v2.0/v2.1 integrace a multi-input telemetrie | ✅ |
