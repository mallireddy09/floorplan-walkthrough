import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/**
 * Finishing passes for the Real style on a computer:
 * soft shading where surfaces meet (corners, under furniture) and a gentle
 * glow around lamps. Returns null if the graphics card cannot do it, in which
 * case the page simply draws without them.
 */
export function createPost(renderer, scene, camera) {
  try {
    const size = renderer.getSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));

    const ao = new GTAOPass(scene, camera, size.x, size.y);
    ao.blendIntensity = 1.0;
    ao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.4, thickness: 1.2, scale: 1.15, samples: 16, screenSpaceRadius: false });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 2, rings: 2, samples: 16 });
    composer.addPass(ao);

    const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.16, 0.6, 1.25);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    return {
      render: () => composer.render(),
      setSize(w, h, pixelRatio) {
        composer.setPixelRatio(pixelRatio);
        composer.setSize(w, h);
      },
      setNight(night) {
        bloom.strength = night ? 0.32 : 0.14;
        bloom.threshold = night ? 1.0 : 1.3;
      },
    };
  } catch (err) {
    console.warn('Finishing passes are not available; drawing without them.', err);
    return null;
  }
}
