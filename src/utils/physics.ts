import { CollisionLayer, CSGBoxConfig } from '../types/controller';

/**
 * Godot's wrapf / fposmod angle difference helper for lerp_angle
 */
export function angleDifference(from: number, to: number): number {
  const diff = (to - from) % (Math.PI * 2);
  return ((2 * diff) % (Math.PI * 2)) - diff;
}

/**
 * Exact equivalent of Godot 4's `lerp_angle(from: float, to: float, weight: float)`
 */
export function lerpAngle(from: number, to: number, weight: number): number {
  const clampedWeight = Math.min(Math.max(weight, 0), 1);
  return from + angleDifference(from, to) * clampedWeight;
}

/**
 * Exact equivalent of Godot 4's `move_toward(from: float, to: float, delta: float)`
 */
export function moveToward(from: number, to: number, delta: number): number {
  if (Math.abs(to - from) <= delta) {
    return to;
  }
  return from + Math.sign(to - from) * delta;
}

/**
 * Deterministic shader-like noise function from PRD v2.0 Section 4.2.4:
 * noise(t) = fract(sin(t * 12.9898) * 43758.5453) * 2 - 1
 */
export function prdNoise(t: number): number {
  const s = Math.sin(t * 12.9898) * 43758.5453;
  const fract = s - Math.floor(s);
  return fract * 2 - 1;
}

export interface CapsuleOBBHit {
  normal: [number, number, number];
  depth: number;
  type: 'top' | 'bottom' | 'side';
}

export interface MoveAndSlideResult {
  position: [number, number, number];
  velocity: [number, number, number];
  isOnFloor: boolean;
  activeFloorName: string;
  /** Normal impact velocity when colliding against an OBB wall or underside */
  wallImpactSpeed: number;
  hitObstacleId: string | null;
}

const PLAYER_RADIUS = 0.3;
const PLAYER_HEIGHT = 2.0;

/**
 * PRD v2.0 Section 4.1.5 — `capsuleVsOBB(pos, R, H, box)`
 * 1. Transform `pos` into local box space (rotate by `-box.rotationY` around Y)
 * 2. Horizontal test: circle vs rectangle -> `hDist`, `hPen = R - hDist`
 * 3. Vertical test: capsule `[pos.y, pos.y + H]` vs box `[by - hy, by + hy]` -> `vOverlap`, `vPen`
 * 4. MTD (Minimum Translation Distance):
 *    - If `hPen < vPen` -> `side` collision, normal = horizontal direction
 *    - Otherwise -> `top` (player above center) or `bottom` (player below center)
 * 5. Transform normal back to world space
 */
export function capsuleVsOBB(
  pos: [number, number, number],
  R: number,
  H: number,
  box: CSGBoxConfig
): CapsuleOBBHit | null {
  const [bx, by, bz] = box.position;
  const [sx, sy, sz] = box.size;
  const hx = sx * 0.5;
  const hy = sy * 0.5;
  const hz = sz * 0.5;

  // 1. Transform XZ into local box space
  const dx = pos[0] - bx;
  const dz = pos[2] - bz;
  const cosY = Math.cos(-box.rotationY);
  const sinY = Math.sin(-box.rotationY);
  const lx = dx * cosY - dz * sinY;
  const lz = dx * sinY + dz * cosY;

  // 2. Horizontal circle vs rectangle [-hx, hx] x [-hz, hz]
  const clampedX = Math.max(-hx, Math.min(hx, lx));
  const clampedZ = Math.max(-hz, Math.min(hz, lz));
  const diffX = lx - clampedX;
  const diffZ = lz - clampedZ;
  const hDistSq = diffX * diffX + diffZ * diffZ;

  if (hDistSq >= R * R) {
    return null;
  }

  // 3. Vertical overlap test: capsule [pos[1], pos[1] + H] vs box [by - hy, by + hy]
  const boxTop = by + hy;
  const boxBottom = by - hy;
  const capBottom = pos[1];
  const capTop = pos[1] + H;

  if (capBottom >= boxTop || capTop <= boxBottom) {
    return null;
  }

  const vPenTop = boxTop - capBottom;
  const vPenBottom = capTop - boxBottom;
  const vPen = Math.min(vPenTop, vPenBottom);

  // Compute horizontal penetration & local normal
  let hPen = 0;
  let localNx = 0;
  let localNz = 0;

  if (hDistSq > 1e-6) {
    const hDist = Math.sqrt(hDistSq);
    hPen = R - hDist;
    localNx = diffX / hDist;
    localNz = diffZ / hDist;
  } else {
    // Center inside rectangle: push toward nearest local edge
    const penX = hx - Math.abs(lx) + R;
    const penZ = hz - Math.abs(lz) + R;
    if (penX < penZ) {
      hPen = penX;
      localNx = lx >= 0 ? 1 : -1;
      localNz = 0;
    } else {
      hPen = penZ;
      localNx = 0;
      localNz = lz >= 0 ? 1 : -1;
    }
  }

  // 4. MTD (Minimum Translation Distance) resolution
  if (hPen < vPen) {
    // Side collision — rotate local normal back to world space
    const invCos = Math.cos(box.rotationY);
    const invSin = Math.sin(box.rotationY);
    const worldNx = localNx * invCos - localNz * invSin;
    const worldNz = localNx * invSin + localNz * invCos;
    return {
      normal: [worldNx, 0, worldNz],
      depth: hPen,
      type: 'side',
    };
  }

  // Vertical collision (top or bottom)
  const capCenterY = pos[1] + H * 0.5;
  if (capCenterY >= by || vPenTop <= vPenBottom) {
    return {
      normal: [0, 1, 0],
      depth: vPenTop,
      type: 'top',
    };
  } else {
    return {
      normal: [0, -1, 0],
      depth: vPenBottom,
      type: 'bottom',
    };
  }
}

/**
 * Resolves 3D capsule (`R = 0.3, H = 2.0`) vs rotated OBB obstacles + floor plane (`y = 0`),
 * implementing `capsuleVsOBB` and `move_and_slide` from PRD v2.0 Section 4.1.5 & 4.1.6.
 */
export function moveAndSlide(
  currentPos: [number, number, number],
  currentVel: [number, number, number],
  delta: number,
  boxes: CSGBoxConfig[],
  collisionMask: number = CollisionLayer.WORLD
): MoveAndSlideResult {
  const pos: [number, number, number] = [
    currentPos[0] + currentVel[0] * delta,
    currentPos[1] + currentVel[1] * delta,
    currentPos[2] + currentVel[2] * delta,
  ];
  const vel: [number, number, number] = [currentVel[0], currentVel[1], currentVel[2]];

  let isOnFloor = false;
  let activeFloorName = 'Airborne';
  let wallImpactSpeed = 0;
  let hitObstacleId: string | null = null;

  // 1. Floor collision (y = 0)
  if (pos[1] <= 0) {
    pos[1] = 0;
    if (vel[1] < 0) {
      vel[1] = 0;
    }
    isOnFloor = true;
    activeFloorName = 'map/floor';
  }

  // 2. Resolve collisions against all WORLD OBB boxes via capsuleVsOBB
  for (const box of boxes) {
    const boxLayer = box.layer ?? CollisionLayer.WORLD;
    if ((boxLayer & collisionMask) === 0) continue;

    const hit = capsuleVsOBB(pos, PLAYER_RADIUS, PLAYER_HEIGHT, box);
    if (!hit) continue;

    const [nx, ny, nz] = hit.normal;
    pos[0] += nx * hit.depth;
    pos[1] += ny * hit.depth;
    pos[2] += nz * hit.depth;

    if (hit.type === 'top') {
      if (vel[1] <= 0) {
        vel[1] = 0;
      }
      isOnFloor = true;
      activeFloorName = `map/${box.id}`;
    } else if (hit.type === 'bottom') {
      if (vel[1] > 0) {
        wallImpactSpeed = Math.max(wallImpactSpeed, Math.abs(vel[1]));
        hitObstacleId = box.id;
        vel[1] = 0;
      }
    } else {
      // Side collision: wall sliding vel -= normal * (vel · n)
      const vn = vel[0] * nx + vel[2] * nz;
      if (vn < 0) {
        const impactMag = Math.abs(vn);
        if (impactMag > wallImpactSpeed) {
          wallImpactSpeed = impactMag;
          hitObstacleId = box.id;
        }
        vel[0] -= nx * vn;
        vel[2] -= nz * vn;
      }
    }
  }

  return {
    position: pos,
    velocity: vel,
    isOnFloor,
    activeFloorName,
    wallImpactSpeed,
    hitObstacleId,
  };
}
