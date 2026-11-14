# Floor plan walk-through

A first-person 3D walk-through of the home on the architect's floor plan, built with three.js and Vite.

Live version: https://mallireddy09.github.io/floorplan-walkthrough/

## Run it on your own computer

```bash
npm install
npm run dev
```

Then open http://localhost:5173 in a browser.

To try it on a phone on the same Wi-Fi, run `npm run dev:phone` instead and open the "Network" address it prints.

## Controls

- Computer: W A S D or the arrow keys to move, drag with the mouse to look around. Scrolling also walks: roll the mouse wheel away from you (or the matching two-finger scroll on a touchpad) to go forward, toward you to go back.
- Phone: joystick (bottom left) to move, drag anywhere else to look.

## Buttons

- "Real style" / "Model style" switches between the clean 3D-model look and a lived-in look with richer materials, softer shading, curtains, pictures and everyday things in each room. The Real style takes a few seconds to prepare the first time.
- "Night" / "Day" switches the time of day in either style.
- "Top view" / "Walk view" switches to a top-down view of the whole home with the ceiling removed, and back.

On a computer the Real style adds soft shading in corners, shadows from the room lights and a glow around lamps. On a phone those are left out to keep it smooth.

## Plumbing & Drainage view

The "Plumbing & Drainage" button opens a separate inspection view. The house turns see-through and the ground transparent, and the pipe systems are drawn over it. Nothing in the house model is changed; "House view" puts everything back exactly as it was.

- Views: "House view", "Water supply", "Drainage".
- Systems can be switched on and off one by one. Colours: blue fresh water (lighter blue for hot), red toilet sewage, orange kitchen and bathroom wastewater, green rainwater, purple vent pipes. Arrows on the pipes show the direction of flow.
- Drag to rotate, scroll or pinch to zoom, right-drag to move. Click any pipe, chamber or tank for its purpose, size, fall, depth and where it flows.
- "Section" cuts the model along an east-west line and shows the ground in section with a depth scale; the slider moves the cut north or south.

The layout lives in `src/plumbing/design.js` (routes, sizes, falls, chambers, tanks), is drawn by `src/plumbing/build.js`, and the view itself is `src/plumbing/mode.js`. It follows common Indian practice (National Building Code Part 9, IS 1742, IS 2470, IS 2065) as a design-intent layout for visualisation. It is not an approved drawing: pipe sizes, the septic tank and where its outlet and the rainwater discharge go need checking by a licensed plumbing engineer against site conditions and local rules.

## How it is put together

- `src/data/plan.json` — the plan as read from the drawing, in metres: rooms, walls, doors, windows, heights. The 3D scene and the map are both built from this file, so changing a number here moves the wall, door or window.
- `src/house.js` — walls with openings, floors, ceiling, doors, windows, ceiling lights, and the yard.
- `src/furniture.js` — furniture for each room, with the footprints the walker cannot pass through.
- `src/real.js`, `src/materialsReal.js` — the Real style: lived-in details, scenery outside, and its materials (all drawn in code, no image files).
- `src/lighting.js`, `src/sky.js`, `src/post.js` — light for the four looks (two styles, day and night), the sky, and the finishing passes.
- `src/world.js` — builds one complete version of the home for a style.
- `src/main.js` — renderer, cameras, the walk loop, the buttons and the on-screen labels.
- `src/controls.js`, `src/collide.js`, `src/minimap.js` — input, collision and the small map.
