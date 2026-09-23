// =========================================================================
//  MAP: PARKOUR — timed course, every destroyed target = time bonus
// =========================================================================
registerMap({
  id: 'parkour',
  name: 'PARKOUR',
  desc: 'Trať na čas. Každý zostrelený terč = −1 s z výsledného času.',
  start: new THREE.Vector3(0, 1.2, 0),
  startYaw: Math.PI,          // face +z, down the course
  timed: true,                // has a finish line + best time
  targetBonus: 1.0,           // seconds subtracted per destroyed target
  respawnTargets: false,

  build() {
    box(0, 0, 0, 12, 1.2, 12, matLight);
    box(0, 0, 16, 8, 1.2, 8, matWhite);
    box(0, 0, 30, 7, 1.2, 7, matWhite);
    box(0, 1.5, 45, 6, 1.2, 7, matWhite);
    addCheckpoint(0, 2.9, 45);

    for (let i = 0; i < 6; i++) box(0, i*1.1, 55 + i*2.2, 7, 1.2, 2.4, matGray);
    box(0, 6.6, 70, 9, 1.2, 9, matWhite);
    addCheckpoint(0, 8, 70);

    box(-4.2, 6.6, 92, 1.2, 12, 26, matWall, { wall: true });
    box( 4.2, 6.6, 92, 1.2, 12, 26, matWall, { wall: true });
    box(-4.2, 6.6, 92, 0.2, 0.2, 26, matAccent, { edges:false });
    box( 4.2, 6.6, 92, 0.2, 0.2, 26, matAccent, { edges:false });
    box(-4.0, 6.6, 84, 2.5, 0.6, 3, matWhite);
    box( 4.0, 6.6, 98, 2.5, 0.6, 3, matWhite);

    box(0, 6.6, 112, 10, 1.2, 8, matWhite);
    addCheckpoint(0, 8, 112);

    // mantle-friendly stepped ledges (climb up)
    box(-2, 8.2, 124, 5, 1.0, 4, matWhite);
    box( 2, 9.6, 130, 5, 1.0, 4, matWhite);
    box(-3.5, 6.6, 126, 1.2, 16, 6, matWall, { wall: true });
    box( 3.5, 9.5, 132, 1.2, 16, 6, matWall, { wall: true });
    box(0, 12.5, 138, 8, 1.2, 8, matWhite);
    addCheckpoint(0, 14, 138);

    box(0, 10.5, 150, 8, 1.2, 8, matGray);
    box(0, 8.5, 160, 9, 1.2, 8, matGray);
    box(0, 8.5, 176, 11, 1.2, 22, matLight);
    box(0, 11.2, 172, 11, 0.5, 0.8, matAccent, { edges:false });
    box(0, 11.2, 180, 11, 0.5, 0.8, matAccent, { edges:false });

    box(0, 8.5, 196, 6, 1.2, 6, matWhite);
    box(0, 8.5, 210, 8, 1.2, 8, matAccent);
    setFinish(0, 9.7, 210);
    box(-3, 9.7, 210, 0.4, 6, 0.4, matAccent, { edges:false });
    box( 3, 9.7, 210, 0.4, 6, 0.4, matAccent, { edges:false });

    // ---- targets along the route (shoot on the move) ----
    addTarget( 6,   4,  23);
    addTarget(-6,   6,  38, { move: { axis: [0, 1, 0], amp: 1.2, speed: 1.6 } });
    addTarget( 7,  10,  62);
    addTarget( 0,  13,  94, { move: { axis: [1, 0, 0], amp: 2.5, speed: 1.2 } }); // over the wall-run gap
    addTarget(-7,  12, 118);
    addTarget( 0,  18, 146);
    addTarget( 7,  12, 168, { move: { axis: [0, 0, 1], amp: 4, speed: 0.9 } });
    addTarget(-6,  13, 190);
    addTarget( 0, 16.5, 210);                                                    // above the finish
  },
});
