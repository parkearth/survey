// Parallel projection of a split-level house, drawn as an architectural plate.
export function cover(c) {
  const w = 440,
    h = 212;
  c.width = w * 2;
  c.height = h * 2;
  const g = c.getContext('2d');
  g.scale(2, 2);
  const P = ([x, y, z]) => [219 + x * 1.03 - y * .90, 143 + x * .37 + y * .44 - z * .80];
  const path = (v, fill, stroke = '#a6b8a3') => {
    g.beginPath();
    v.forEach((p, i) => i ? g.lineTo(...P(p)) : g.moveTo(...P(p)));
    if (v.length > 2) g.closePath();
    if (fill) {
      g.fillStyle = fill;
      g.fill();
    }
    g.strokeStyle = stroke;
    g.lineWidth = .9;
    g.stroke();
  };
  function block(x, y, z, w, d, h, c) {
    path([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]], c[0]);
    path([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]], c[1]);
    path([[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]], c[2]);
  }
  const stone = ['#7d9280', '#526e60', '#b6c2a9'],
    base = ['#647d6b', '#476453', '#a1b39a'],
    floor = ['#85917b', '#667b66', '#c8c4a8'],
    wood = ['#9e9172', '#766c55', '#d2c29e'];
  g.fillStyle = '#cdd6c7';
  g.fillRect(0, 0, w, h);
  for (let i = -280; i <= 280; i += 18) {
    path([[i, -270, 0], [i, 270, 0]], null, '#bdc9b8');
    path([[-270, i, 0], [270, i, 0]], null, '#bdc9b8');
  }
  for (const z of [0, 70]) {
    block(-86, -43, z, 158, 85, 5, floor);
    block(-86, -43, z + 5, 158, 4, 32, stone);
    block(-86, -43, z + 5, 4, 85, 32, stone);
    block(-19, -41, z + 5, 3, 48, 28, stone);
    block(18, -20, z + 5, 32, 20, 10, wood);
    block(18, -20, z + 15, 32, 4, 6, base);
    block(-78, -37, z + 5, 42, 18, 22, wood);
    for (let i = 0; i < 5; i++) block(-12, 11 + i * 5, z + 5, 25, 5, (5 - i) * 3, base);
    block(-82, 38, z + 5, 40, 3, 11, stone);
    block(42, -39, z + 5, 27, 4, 37, stone);
  }
  for (const [x, y] of [[-86, 42], [72, 42], [72, -43]]) {
    g.setLineDash([3, 4]);
    path([[x, y, 6], [x, y, 69]], null, '#9a8c71');
    g.setLineDash([]);
  }
  g.fillStyle = '#596c57';
  g.font = '10px monospace';
  g.fillText('2F', 367, 82);
  g.fillText('1F', 367, 137);
  for (const [y, dy] of [[78, 7], [134, 6]]) {
    g.strokeStyle = '#9b9c78';
    g.beginPath();
    g.moveTo(363, y);
    g.lineTo(335, y);
    g.lineTo(325, y + dy);
    g.stroke();
  }
  g.font = '10px monospace';
  g.fillText('AXONOMETRIC  /  1:100', 16, h - 15);
}
