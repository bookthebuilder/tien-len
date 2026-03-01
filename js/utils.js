export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function groupBy(arr, fn) {
  const map = new Map();
  for (const item of arr) {
    const key = fn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
