// =========================================================================
//  MAP: SURF — CS:GO style surf (Source movement, see js/source.js)
// =========================================================================
// How to surf: drop onto a ramp face, hold the strafe key TOWARD the ramp
// (A on a ramp to your left, D on one to your right) and keep your aim along
// the ramp. Don't press W. Gravity pulls you down the face and the strafe
// keeps you on it, so you gain speed. At the end of a ramp fly to the next one,
// air-strafing (A/D + mouse turn in the same direction) for more speed.
// Touching the void below a stage sends you back to that stage's start.

registerMap({
  id: 'surf',
  name: 'SURF',
  desc: 'CS:GO surf — Source fyzika, 3 stage. Drž A/D smerom k rampe, nie W.',
  start: new THREE.Vector3(-4, 64.02, -10),
  startYaw: Math.PI,          // face +z, down the ramps
  timed: true,
  targetBonus: 1.0,
  respawnTargets: false,
  physics: 'source',
  resetYaw: true,             // respawns face down the course
  noRings: true,
  killY: 34,                  // stage 1 void
  startZone: { min: { x: -7.5, y: 60, z: -16.5 }, max: { x: -0.5, y: 70, z: -0.2 } },

  build() {
    const HW = 12, H = 20.8;  // half width / height → 60° faces (normal.y = 0.5)

    // --- start platform above the left face of ramp 1
    box(-4, 63, -9, 7, 1, 15, matLight);
    box(-4, 63, -16.9, 7, 5, 0.6, matWall);                     // back wall
    box(-7.8, 63, -9, 0.6, 3, 15, matWall);                     // side rail
    box(-4, 64, -1.75, 7, 0.02, 0.5, matAccent, { edges: false, solid: false }); // start line

    // --- stage 1
    ramp(0, 0, 150, 40, 40 + H, HW);
    box(0, 40 + H, 0, 0.4, 0.12, 150, matAccent, { edges: false, solid: false }); // ridge line

    // --- stage 2 (lower, slightly offset)
    addCheckpoint(-8, 38, 175, { zone: { min: { z: 160 } }, killY: 6 });
    ramp(-3, 170, 330, 12, 12 + H, HW, { mat: matWhite });
    box(-3, 12 + H, 170, 0.4, 0.12, 160, matAccent, { edges: false, solid: false });

    // --- stage 3: two single-sided ramps facing each other (a "U" channel)
    addCheckpoint(-10, 3, 355, { zone: { min: { z: 340 } }, killY: -26 });
    ramp(-15, 350, 500, -16, -16 + H, HW, { side: 'right' });   // face looks +x
    ramp(15, 350, 500, -16, -16 + H, HW, { side: 'left' });    // face looks -x
    box(-15.3, -16, 425, 0.6, H + 3, 150, matWall);              // outer walls
    box(15.3, -16, 425, 0.6, H + 3, 150, matWall);

    // --- end platform + finish
    box(0, -22, 535, 40, 1, 60, matLight);
    box(0, -21, 565.5, 40, 14, 1, matWall);                     // backstop
    box(0, -21, 506, 40, 0.02, 1, matAccent, { edges: false, solid: false });
    setFinishZone({ x: -20, y: -21.5, z: 505 }, { x: 20, y: 10, z: 566 });

    // --- targets beside the ramps: shoot while you surf (−1 s each)
    addTarget(-18, 58, 50);
    addTarget( 16, 56, 110);
    addTarget(-20, 30, 215, { move: { axis: [0, 1, 0], amp: 2, speed: 1.2 } });
    addTarget( 14, 28, 280);
    addTarget(  0, 6, 400, { move: { axis: [1, 0, 0], amp: 3, speed: 1 } });
    addTarget(  0, 2, 470);
  },
});
