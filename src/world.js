import * as THREE from 'three';
import { createMaterials } from './materials.js';
import { createRealMaterials } from './materialsReal.js';
import { buildHouse } from './house.js';
import { furnish, contactShadows } from './furniture.js';
import { realShell, realDetails } from './real.js';

/**
 * Builds one complete version of the home.
 * style 'model': the clean 3D-model look.
 * style 'real' : the same plan and furniture with richer materials, rounded
 *                soft furnishings and the lived-in details.
 */
export function buildWorld(plan, renderer, style) {
  const real = style === 'real';
  const M = real ? createRealMaterials(renderer) : createMaterials(renderer);

  const house = buildHouse(plan, M, { real, extras: real ? (ctx) => realShell(plan, M, ctx) : null });
  const furniture = furnish(plan, M, { real, extras: real ? (ctx) => realDetails(plan, M, ctx) : null });

  const group = new THREE.Group();
  const contact = contactShadows(furniture.colliders, real ? 0.24 : 0.34);
  group.add(house.root, furniture.group, contact);

  // See-through stand-ins used only by the plumbing view. The real materials
  // are kept on each mesh and put back when that view closes.
  const ghostMat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
  const ghost = {
    wall: ghostMat(0x8496a9, 0.2),
    floor: ghostMat(0xc2ccd6, 0.2),
    yard: ghostMat(0x9db59a, 0.1),
    road: ghostMat(0x8d949b, 0.07),
    item: ghostMat(0x8799ab, 0.09),
  };
  const ghostFor = new Map([
    [M.wall, ghost.wall], [M.compound, ghost.wall], [M.concrete, ghost.wall],
    [M.floor, ghost.floor], [M.bathFloor, ghost.floor], [M.bathFloorWet, ghost.floor],
    [M.lawn, ghost.yard], [M.paving, ghost.yard], [M.apron, ghost.yard], [M.ground, ghost.road],
  ]);
  let edges = null;

  // Room names shown on the floor in the top view.
  for (const room of plan.rooms) {
    const c = document.createElement('canvas');
    const g = c.getContext('2d');
    const font = '600 44px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    g.font = font;
    const w = Math.ceil(g.measureText(room.name).width) + 28;
    c.width = w;
    c.height = 64;
    g.font = font;
    g.fillStyle = 'rgba(22,24,27,0.78)';
    g.beginPath();
    g.roundRect(0, 0, w, 64, 14);
    g.fill();
    g.fillStyle = '#fff';
    g.textBaseline = 'middle';
    g.fillText(room.name, 14, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    const hgt = 0.3;
    sprite.scale.set((hgt * w) / 64, hgt, 1);
    sprite.position.set((room.x0 + room.x1) / 2, 3.5, (room.z0 + room.z1) / 2);
    sprite.renderOrder = 15;
    house.topOnly.add(sprite);
  }

  return {
    group,
    colliders: [...house.colliders, ...furniture.colliders],

    /** Ceiling off and wall caps on for the top view. */
    setTop(on) {
      house.upper.visible = !on;
      house.topOnly.visible = on;
    },

    /** Ceiling in place, whatever the view: used while shadows and reflections are prepared. */
    withCeiling(fn) {
      const upper = house.upper.visible;
      const caps = house.topOnly.visible;
      house.upper.visible = true;
      house.topOnly.visible = false;
      fn();
      house.upper.visible = upper;
      house.topOnly.visible = caps;
    },

    /**
     * Plumbing view: ceiling off, everything see-through, wall outlines drawn.
     * Turning it off puts every original material back exactly as it was.
     */
    setInspect(on) {
      if (on) {
        house.upper.visible = false;
        house.topOnly.visible = false;
      }
      contact.visible = !on;
      group.traverse((o) => {
        if (!o.isMesh || o === contact) return;
        if (on) {
          o.userData.solid ??= o.material;
          o.material = ghostFor.get(o.userData.solid) ?? ghost.item;
        } else if (o.userData.solid) {
          o.material = o.userData.solid;
        }
      });
      if (on && !edges) {
        // crisp outlines of the walls, for a drawing-like look
        const lineMat = new THREE.LineBasicMaterial({ color: 0x3f5166, transparent: true, opacity: 0.6 });
        edges = new THREE.Group();
        for (const o of house.root.children) {
          if (o.isMesh && o.userData.solid === M.wall) edges.add(new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 30), lineMat));
        }
        group.add(edges);
      }
      if (edges) edges.visible = on;
    },

    /** Lamps, ceiling lights and the neighbours' windows come on at night. */
    setNight(night) {
      if (real) {
        M.lightOn.emissiveIntensity = night ? 3.0 : 0.3;
        M.lampShade.emissiveIntensity = night ? 2.2 : 0.12;
        M.bulb.emissiveIntensity = night ? 3.5 : 0;
        M.facade.emissiveIntensity = night ? 1.3 : 0;
        M.streetLamp.emissiveIntensity = night ? 5 : 0;
      } else {
        M.lightOn.emissiveIntensity = night ? 2.2 : 1.6;
        M.lampShade.emissiveIntensity = night ? 1.6 : 0.9;
      }
    },
  };
}
