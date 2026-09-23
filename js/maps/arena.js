// =========================================================================
//  MAP: ARÉNA — test / sandbox map: walls for wall-running, mantle blocks,
//  a shooting range and moving targets that respawn. No finish line.
// =========================================================================
registerMap({
  id: 'arena',
  name: 'ARÉNA',
  desc: 'Testovacia mapa so stenami. Wall-run, mantle, strelnica, terče sa obnovujú.',
  start: new THREE.Vector3(0, 0, 32),
  startYaw: 0,                // face -z, into the arena
  timed: false,
  targetBonus: 0,
  respawnTargets: true,

  build() {
    const W = 90, H = 6;
    // floor + perimeter walls (all wall-runnable)
    box(0, -1, 0, W, 1, W, matLight);
    box(0, 0, -W/2, W, H, 1, matWall, { wall: true });
    box(0, 0,  W/2, W, H, 1, matWall, { wall: true });
    box(-W/2, 0, 0, 1, H, W, matWall, { wall: true });
    box( W/2, 0, 0, 1, H, W, matWall, { wall: true });

    // --- left: wall-run corridor (two parallel walls, wall-jump between them)
    box(-20.5, 0, -5, 1, 7, 40, matWall, { wall: true });
    box(-12.5, 0, -5, 1, 7, 40, matWall, { wall: true });
    box(-20.5, 7, -5, 1.05, 0.2, 40, matAccent, { edges: false });
    box(-12.5, 7, -5, 1.05, 0.2, 40, matAccent, { edges: false });

    // --- right: single long wall, run along either side
    box(20, 0, -5, 1, 6, 36, matWall, { wall: true });

    // --- center: tower with jump steps, wall-jump pillars to a high deck
    box(0, 0, -5, 8, 3, 8, matWhite);
    for (let i = 0; i < 3; i++) box(0, 0, 1.5 - i, 4, 0.8*(i+1), 1.0, matGray);
    box(-4.5, 0, -22, 1, 12, 8, matWall, { wall: true });
    box( 4.5, 0, -28, 1, 12, 8, matWall, { wall: true });
    box(0, 10, -38, 12, 1, 6, matWhite);
    box(0, 0, -38, 1.2, 10, 1.2, matGray);

    // --- mantle test blocks (1.0 / 1.5 → mantle, 2.2 → jump + mantle)
    box( 8, 0, 18, 3, 1.0, 3, matWhite);
    box(12, 0, 18, 3, 1.5, 3, matWhite);
    box(16, 0, 18, 3, 2.2, 3, matWhite);

    // --- right edge: rising platform jumps
    for (let i = 0; i < 5; i++) box(33, 0, 24 - i*7, 4, 1.5 + i*1.2, 4, i % 2 ? matGray : matWhite);
    box(33, 0, -16, 6, 7.5, 6, matWhite);

    // --- cover blocks
    box(-6, 0, 14, 2, 1.2, 2, matGray);
    box( 5, 0, 24, 2, 2, 2, matGray);
    box(-30, 0, 20, 6, 1.2, 2, matGray);
    box(-32, 0, -20, 2, 2.5, 6, matGray);

    // --- shooting range along the back wall
    for (let i = 0; i < 5; i++) addTarget(-10 + i*5, 1.9, -43.5, { pole: 1.35 });

    // --- targets that reward shooting while moving
    addTarget(-16.5, 4, -5, { rotY: Math.PI/2, move: { axis: [0, 0, 1], amp: 14, speed: 0.6 } }); // wall-run lane
    addTarget(0, 7, -14, { move: { axis: [1, 0, 0], amp: 7, speed: 0.8 } });
    addTarget(26, 6, 0, { move: { axis: [0, 1, 0], amp: 2.5, speed: 1.4 } });
    addTarget(19.4, 3.5, -12, { rotY: Math.PI/2 });   // on the right wall
    addTarget(0, 14, -38);                            // above the high deck
    addTarget(33, 10, -16);
    addTarget(-30, 5, 30, { move: { axis: [1, 0, 0], amp: 8, speed: 1.1 } });
  },
});
