/**
 * Carroça e carroção das caravanas no estilo dos humanos de 16x18: sem
 * contorno, luz da esquerda, roda com aro, raios e cubo. Andam para a
 * direita (o varal aponta para os animais); a versão `:l` é espelhada.
 * `M` e `m` são a cor do reino (a faixa da lona do carroção).
 */

export const VEHICLE_PALETTE: Record<string, string> = {
  W: '#a8763e',
  w: '#6b4423',
  q: '#4a2e18',
  B: '#d2bc8a',
  b: '#a08a5c',
  C: '#b88a50',
  c: '#8a6234',
  X: '#ece4cc',
  x: '#b8ac90',
  n: '#4e4a50',
  h: '#9a9aa4',
  M: '#ff00ff',
  m: '#800080',
};

export const VEHICLES: Record<string, string[]> = {
  // Carroça de duas rodas (Bronze ao Ferro): sacos e um caixote na caçamba.
  cart: [
    '...BBb.CCCc.....',
    '..BBBbbCCCcc....',
    '.WWWWWWWWWWWw...',
    '.wwwwwwwwwwwwwww',
    '.q...nnn....q...',
    '....nwhwn.......',
    '....nhhhn.......',
    '....nwhwn.......',
    '.....nnn........',
  ],
  // Carroção coberto (da Pólvora em diante): lona com a faixa do reino e quatro rodas.
  wagon: [
    '.....XXXXXXX......',
    '...XXXXXXXXXXx....',
    '..XXXXXXXXXXXxx...',
    '..XMMMMMMMMMMmx...',
    '..XXXXXXXXXXXxx...',
    '..xxxxxxxxxxxxx...',
    '.WWWWWWWWWWWWWWw..',
    '.wwwwwwwwwwwwwwwww',
    '..nnn......nnn....',
    '.nwhwn....nwhwn...',
    '.nhhhn....nhhhn...',
    '..nnn......nnn....',
  ],
};
