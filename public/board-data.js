// board-data.js

// Using user's logical track mapping
// 52 track cells in clockwise order, index 0 is Top Arm (Red start area)
const trackCells = [
  // Top arm right col
  {c:8, r:1}, {c:8, r:2}, {c:8, r:3}, {c:8, r:4}, {c:8, r:5}, // 0..4
  // Right arm top row
  {c:9, r:6}, {c:10,r:6}, {c:11,r:6}, {c:12,r:6}, {c:13,r:6}, {c:14,r:6}, // 5..10
  // Right arm tip
  {c:14,r:7}, // 11
  // Right arm bottom row
  {c:14,r:8}, {c:13,r:8}, {c:12,r:8}, {c:11,r:8}, {c:10,r:8}, {c:9, r:8}, // 12..17
  // Bottom arm right col
  {c:8, r:9}, {c:8, r:10},{c:8, r:11},{c:8, r:12},{c:8, r:13},{c:8, r:14},// 18..23
  // Bottom arm tip
  {c:7, r:14}, // 24
  // Bottom arm left col
  {c:6, r:14}, {c:6, r:13},{c:6, r:12},{c:6, r:11},{c:6, r:10},{c:6, r:9}, // 25..30
  // Left arm bottom row
  {c:5, r:8}, {c:4, r:8}, {c:3, r:8}, {c:2, r:8}, {c:1, r:8}, {c:0, r:8},// 31..36
  // Left arm tip
  {c:0, r:7}, // 37
  // Left arm top row
  {c:0, r:6}, {c:1, r:6}, {c:2, r:6}, {c:3, r:6}, {c:4, r:6}, {c:5, r:6},// 38..43
  // Top arm left col
  {c:6, r:5}, {c:6, r:4}, {c:6, r:3}, {c:6, r:2}, {c:6, r:1}, {c:6, r:0},// 44..49
  // Top arm tip
  {c:7, r:0}, // 50
  // Complete circuit
  {c:8, r:0}  // 51
];

// 6 home stretch cells per color
const homeStretches = {
  "Red":    [{c:7, r:1}, {c:7, r:2}, {c:7, r:3}, {c:7, r:4}, {c:7, r:5}, {c:7, r:6}], // Top arm center
  "Blue":   [{c:13,r:7}, {c:12,r:7}, {c:11,r:7}, {c:10,r:7}, {c:9, r:7}, {c:8, r:7}], // Right arm center! Wait, matching the offset: Blue start is 13, ends at 11 (Right tip), enters Right arm!
  "Green":  [{c:7, r:13},{c:7, r:12},{c:7, r:11},{c:7, r:10},{c:7, r:9}, {c:7, r:8}], // Bottom arm center (Green start 26)
  "Yellow": [{c:1, r:7}, {c:2, r:7}, {c:3, r:7}, {c:4, r:7}, {c:5, r:7}, {c:6, r:7}]  // Left arm center (Yellow start 39, ends 37)
};

// Bases: 4 coordinates per base
const baseSpots = {
  "Red":    [{c:10,r:1}, {c:12,r:1}, {c:10,r:3}, {c:12,r:3}], // Top-Right Base
  "Blue":   [{c:13,r:10}, {c:11,r:10}, {c:13,r:12}, {c:11,r:12}], // Bottom-Right Base (Blue starts at 13 -> Right Arm!)
  "Green":  [{c:2, r:10}, {c:4, r:10}, {c:2, r:12}, {c:4, r:12}], // Bottom-Left Base (Green starts 26 -> Bottom Arm!)
  "Yellow": [{c:2, r:1}, {c:4, r:1}, {c:2, r:3}, {c:4, r:3}] // Top-Left Base (Yellow starts 39 -> Left Arm!)
};

// Start offsets mapped correctly so 0..51 + 52..57 works:
// Red=0, Blue=13, Green=26, Yellow=39
const safeIndices = [0, 8, 13, 21, 26, 34, 39, 47];

export { trackCells, homeStretches, baseSpots, safeIndices };
